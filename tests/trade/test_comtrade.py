"""Reference collection must preserve observations and never publish partial queries."""
import io,json,urllib.error,urllib.parse
import pytest
from pathlib import Path
from unittest.mock import patch
from pipelines import comtrade


@pytest.fixture(autouse=True)
def official_area_reference(monkeypatch):
    areas={156:{'iso3':'CHN','name':'China','note':'China','is_group':False},380:{'iso3':'ITA','name':'Italy','note':'Italy','is_group':False},842:{'iso3':'USA','name':'USA','note':'USA, Puerto Rico and US Virgin Islands','is_group':False},688:{'iso3':'SRB','name':'Serbia','is_group':False},58:{'iso3':'BEL','name':'Belgium-Luxembourg (...1998)','note':'Belgium-Luxembourg','is_group':False},492:{'iso3':'MCO','name':'Europe EU, nes','is_group':False}}
    monkeypatch.setattr(comtrade,'load_areas',lambda **kwargs:(areas,{'query_url':comtrade.AREA_URL,'retrieved_at':'2026-11-09','sha256':'fixture'}))

def response(url,timeout):
    query=urllib.parse.parse_qs(urllib.parse.urlsplit(url).query);reporter=int(query['reporterCode'][0]);flow=query['flowCode'][0];year=int(query['period'][0]);partner=380 if reporter==156 else 156
    row={'cmdCode':'TOTAL','reporterCode':reporter,'flowCode':flow,'period':year,'partnerCode':partner,'partner2Code':0,'motCode':0,'customsCode':'C00','primaryValue':0 if reporter==156 and flow=='X' else 12,'isReported':False,'isAggregate':True}
    return io.BytesIO(json.dumps({'data':[row]}).encode())


def test_reference_years_preserve_reported_zero_flags_and_query_cache(tmp_path):
    with patch.object(comtrade,'ROOT',tmp_path),patch.object(comtrade.time,'sleep'),patch.object(comtrade.urllib.request,'urlopen',side_effect=response) as fetch:
        first=comtrade.collect(years=[2001]);second=comtrade.collect(years=[2001])
    assert fetch.call_count==4
    assert first['requested_years']==first['observed_years']==[2001]
    assert second['observations']==first['observations']
    row=next(r for r in first['observations'] if r['origin']=='CHN' and r['kind']=='export')
    assert row['value_usd']==0 and row['is_reported'] is False and row['is_aggregate'] is True
    assert row['retrieved_at'] and row['query_url']


def test_reference_truncation_and_provider_limit_never_become_partial_or_zero_totals(tmp_path):
    fake=io.BytesIO(json.dumps({'data':[{}]*500}).encode())
    limited=urllib.error.HTTPError('https://example.invalid',429,'Too many requests',{},None)
    with patch.object(comtrade,'ROOT',tmp_path),patch.object(comtrade.time,'sleep'),patch.object(comtrade.urllib.request,'urlopen',side_effect=[fake,limited]) as fetch:
        result=comtrade.collect(years=[2001])
    assert fetch.call_count==2 and result['observations']==[] and result['observed_years']==[]
    assert [r['request_status'] for r in result['requests']]==['provider_error','provider_error','not_collected_after_provider_limit','not_collected_after_provider_limit']
    assert 'truncated' in result['requests'][0]['error']
    assert not list((tmp_path/'_cache/comtrade').glob('*.json'))


def test_provider_reporting_area_iso_is_used_without_inventing_successor_countries(tmp_path):
    def reported(url,timeout):
        data=json.load(response(url,timeout));row=data['data'][0]
        reporter=row['reporterCode'];row.update(reporterISO='CHN' if reporter==156 else 'ITA',partnerCode=842,partnerISO='USA',partnerDesc='USA')
        unknown={**row,'partnerCode':688,'partnerISO':'N/A','partnerDesc':'Unresolved reporting area'}
        data['data']=[row,unknown];return io.BytesIO(json.dumps(data).encode())
    with patch.object(comtrade,'ROOT',tmp_path),patch.object(comtrade.time,'sleep'),patch.object(comtrade.urllib.request,'urlopen',side_effect=reported):
        data=comtrade.collect(years=[2001])
    assert len(data['observations'])==4
    assert all(r['partner_code']==842 and r['partner_iso']=='USA' for r in data['observations'])
    assert any(r['origin']=='CHN' and r['destination']=='USA' for r in data['observations'])
    assert all('Puerto Rico' in r['origin_area_note']+r['destination_area_note'] for r in data['observations'])
    assert all('SRB' not in (r['origin'],r['destination']) for r in data['observations'])


def test_metadata_resolves_preview_without_iso_but_excludes_historical_and_unspecified_areas(tmp_path):
    def reported(url,timeout):
        row=json.load(response(url,timeout))['data'][0]
        data=[{**row,'partnerCode':code} for code in (842,58,492)]
        return io.BytesIO(json.dumps({'data':data}).encode())
    with patch.object(comtrade,'ROOT',tmp_path),patch.object(comtrade.time,'sleep'),patch.object(comtrade.urllib.request,'urlopen',side_effect=reported):
        data=comtrade.collect(years=[2001])
    assert len(data['observations'])==4
    assert all(r['partner_code']==842 and 'Puerto Rico' in r['origin_area_note']+r['destination_area_note'] for r in data['observations'])
    assert not any('BEL' in (r['origin'],r['destination']) or 'MCO' in (r['origin'],r['destination']) for r in data['observations'])


def test_ambiguous_area_query_is_rejected_atomically_and_not_cached(tmp_path):
    def reported(url,timeout):
        row=json.load(response(url,timeout))['data'][0]
        data=[row,{**row,'partnerCode':840,'partnerISO':'USA'},{**row,'partnerCode':842,'partnerISO':'USA'}]
        return io.BytesIO(json.dumps({'data':data}).encode())
    with patch.object(comtrade,'ROOT',tmp_path),patch.object(comtrade.time,'sleep'),patch.object(comtrade.urllib.request,'urlopen',side_effect=reported):
        data=comtrade.collect(years=[2001])
    assert data['observations']==[]
    assert [r['request_status'] for r in data['requests']]==['provider_error']*3+['not_collected_after_provider_limit']
    assert not list((tmp_path/'_cache/comtrade').glob('*.json'))

"""Country footprints must preserve both production and final-consumer geography."""
import json,sys
from pathlib import Path
import numpy as np
import pytest
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'doc/source/_static/reproduce'))
from recipes.common.leontief import regional_multipliers
from recipes.common.native_accounts import regional_flows
from recipes.indicators import gross_output,domestic_use,final_demand,value_added_footprint,ghg_footprint,ghg_trade


def native():
    categories=['Final consumption expenditure by households','Final consumption expenditure by non-profit organisations serving households (NPISH)','Final consumption expenditure by government','Gross fixed capital formation','Changes in inventories','Changes in valuables','Exports: Total (fob)']
    y=np.zeros((3,14));y[0,0]=50;y[1,0]=10;y[1,7]=130;y[0,10]=2;y[0,11]=-2
    return {'Z':np.array([[20.,30.,0.],[40.,20.,0.],[0.,0.,0.]]),'Y':y,'x':np.array([100.,200.,0.]),'va':np.array([40.,120.,0.]),'ghg':np.array([10.,30.,7.]),'ey':np.array([1.,0,0,0,0,0,0,2.,0,0,0,0,0,0]),'producer_regions':['CN','IT','CN'],'producer_items':['goods','services','inactive'],'fd_regions':['CN']*7+['IT']*7,'fd_items':categories*2,'recipe':{'source':'EXIOBASE','currency_scale':1.}}


def test_regional_footprints_match_independent_small_inverse_and_keep_unallocated_accounts():
    data=native();original=data['Z'].copy();solved=regional_multipliers(data);flows=regional_flows(data)
    a=data['Z'][:2,:2]/data['x'][:2];w=np.linalg.inv(np.eye(2)-a);y=flows[-1][:2]
    expected=np.diag([.1,.15])@w@y
    climate=ghg_footprint.compute(data,solved,flows)
    np.testing.assert_allclose(climate['by_origin_consumer'],expected)
    np.testing.assert_allclose(climate['values'][:,0],np.diag(expected)+[1,2])
    np.testing.assert_allclose(climate['values'][:,1],expected.sum(axis=0)-np.diag(expected))
    assert climate['values'].sum()==pytest.approx(43.)
    assert climate['unallocated'].sum()==pytest.approx(7.)
    income=value_added_footprint.compute(data,solved,flows)
    np.testing.assert_allclose(income['by_origin_consumer'],np.diag([.4,.6])@w@y)
    assert income['values'].sum()==pytest.approx(160.)
    assert solved['relative_residual']<1e-12
    np.testing.assert_array_equal(data['Z'],original)


def test_direct_accounts_keep_signed_stocks_and_separate_consumption_from_investment():
    data=native();flows=regional_flows(data);use=domestic_use.compute(data,flows);demand=final_demand.compute(data)
    np.testing.assert_allclose(gross_output.compute(data),[100,200])
    np.testing.assert_allclose(use['total'],[[70],[150]])
    np.testing.assert_allclose(demand['total'][:,0],use['final'][:,0])
    np.testing.assert_allclose(sum(demand[k] for k in ['households_npish','government','capital_formation','other']),demand['total'])
    assert demand['gfcf'][1,1]==2 and demand['inventories_valuables'][1,1]==-2


def test_embodied_trade_uses_global_upstream_intensities_and_retains_components():
    data=native();solved=regional_multipliers(data);flows=regional_flows(data);result=ghg_trade.compute(data,solved,flows)
    intensity=solved['ghg'].sum(axis=0)
    assert result['intermediate'][0,1]==pytest.approx(intensity[0]*30)
    assert result['final'][1,0]==pytest.approx(intensity[1]*10)
    assert not np.isclose(result['intermediate'].sum()+result['final'].sum(),43.)


def test_zero_output_nonzero_inputs_are_rejected_instead_of_correcting_a_diagonal():
    data=native();data['Z'][0,2]=1
    with pytest.raises(ValueError,match='zero-output'):regional_multipliers(data)


def test_committed_country_aggregates_reconcile_to_independent_production_accounts():
    folder=ROOT/'doc/source/_static/data/accounts';manifest=json.loads((folder/'manifest.json').read_text())
    scope=json.loads((ROOT/'doc/account-collection-scope.json').read_text())['readings']
    expected={r['id'] for r in scope}
    assert {r['id'] for r in manifest['readings']}==expected
    by_id={r['id']:r for r in scope}
    for record in manifest['readings']:
        data=json.loads((folder/record['file']).read_text())
        assert set(by_id[record['id']]['metrics'])<=set(record['metrics']),record['id']
        get=lambda metric,part=None:np.asarray([r['accounts'][metric][part] if part else r['accounts'][metric] for r in data['regions']])
        if not record['metrics']:
            assert by_id[record['id']].get('status')=='unavailable source archive'
            assert all(not r['accounts'] for r in data['regions'])
            assert 'incomplete' in data['provenance']['reason']
            continue
        if data.get('ghg_trade'):
            assert data['provenance']['ghg_trade_region_order']==[r['code'] for r in data['regions']]
        assert data['components']['domestic_use']==['Domestic']
        assert data['components']['final_demand']==['Domestic','Imported']
        np.testing.assert_allclose(get('domestic_use','intermediate')+get('domestic_use','final'),get('domestic_use','total'),rtol=1e-9)
        np.testing.assert_allclose(get('final_demand','total')[:,0],get('domestic_use','final')[:,0],rtol=1e-9,atol=.01)
        groups=data['demand_groups'];assert groups['total']
        assert data['demand_schema_version']==2
        assert not {'households','npish'} & groups.keys()
        if data['recipe']['source']=='EMERGING':assert 'NPISH coverage is undocumented' in data['notes']['final_demand']
        common=[g for g in ['households_npish','government','capital_formation','other'] if g in groups]
        assert len([v for g in common for v in groups[g]])==len(set(v for g in common for v in groups[g]))
        if data['recipe'].get('demand_category_policy')=='total_only':assert set(groups)=={'total'}
        else:np.testing.assert_allclose(sum(get('final_demand',g) for g in common),get('final_demand','total'),rtol=1e-9,atol=.1)
        production=ROOT/'doc/source/_static/data/economy'/(record['id']+'.json')
        if production.exists():
            production=json.loads(production.read_text())
            if 'value_added_footprint' in data['metrics']:
                expected=sum(sum(r['value_added']) for r in production['regions'])-sum(data['residuals']['value_added'])
                assert get('value_added_footprint').sum()==pytest.approx(expected,rel=1e-8),record['id']
            if 'ghg_footprint' in data['metrics']:
                expected=sum(sum(r['ghg'])+r.get('household_ghg',0) for r in production['regions'])
                assert get('ghg_footprint').sum()+sum(data['residuals']['ghg_tonnes'])==pytest.approx(expected,rel=1e-8),record['id']
        # Required latest footprints have replayable origin evidence. One
        # earlier full-source GLORIA run predates persistence of those vectors.
        proofs=data['provenance'].get('footprint_boundaries',{})
        for metric in by_id[record['id']]['metrics']:
            if not metric.endswith('_footprint'):continue
            proof=proofs.get(metric,{})
            if proof.get('production_by_origin') and proof.get('allocated_by_origin'):continue
            assert record['id']=='gloria-060-2025-sut',record['id']+' '+metric+' lacks origin proof'
            assert proof.get('origin_validation',{}).get('status')=='passed_at_collection_vectors_not_retained'
            assert 'cannot be replayed' in proof['origin_validation']['qualification']
        for metric, proof in proofs.items():
            residual=data['residuals']['value_added' if metric=='value_added_footprint' else 'ghg_tonnes']
            if 'unrepresented_direct' in proof and 'unassigned_requirements' in proof:
                np.testing.assert_allclose(np.asarray(proof['unrepresented_direct'])+proof['unassigned_requirements'],residual,rtol=1e-8,atol=.1,err_msg=record['id']+' residual')
            if not proof.get('production_by_origin'):continue
            np.testing.assert_allclose(np.asarray(proof['allocated_by_origin'])+residual,proof['production_by_origin'],rtol=1e-8,atol=.1,err_msg=record['id']+' '+metric)
        assert data['provenance']['native_country_scope_complete']

"""Public MARIO accounts agree with independent small IOT/SUT calculations."""
import sys
from pathlib import Path
import mario,numpy as np,pandas as pd,pytest
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'doc/source/_static/reproduce'))
from recipes.indicators import public_accounts as api
from recipes.indicators.demand_categories import classify


def iot():
    regions=['CN','IT'];sectors=['active','inactive'];axis=pd.MultiIndex.from_product([regions,['Sector'],sectors],names=['Region','Level','Item'])
    cats=['Final consumption expenditure by households','Final consumption expenditure by non-profit organisations serving households (NPISH)','Final consumption expenditure by government','Gross fixed capital formation','Changes in inventories','Changes in valuables','Exports: Total (fob)']
    fd=pd.MultiIndex.from_product([regions,['Consumption category'],cats],names=['Region','Level','Item'])
    z=np.zeros((4,4));z[np.ix_([0,2],[0,2])]=[[20,30],[40,20]]
    y=np.zeros((4,14));y[0,0]=50;y[2,0]=10;y[2,7]=130;y[0,10]=2;y[0,11]=-2
    ey=np.zeros((1,14));ey[0,0]=1;ey[0,7]=2
    db=mario.Database(table='IOT',Z=pd.DataFrame(z,index=axis,columns=axis),Y=pd.DataFrame(y,index=axis,columns=fd),V=pd.DataFrame([[40,0,120,0]],index=['VA'],columns=axis),E=pd.DataFrame([[10,7,30,0]],index=['CO2'],columns=axis),EY=pd.DataFrame(ey,index=['CO2'],columns=fd),units={name:pd.DataFrame({'unit':[unit]*len(items)},index=items) for name,items,unit in [('Sector',sectors,'USD'),('Factor of production',['VA'],'USD'),('Satellite account',['CO2'],'t')]},calc_all=False)
    recipe={'source':'EXIOBASE','currency_scale':1.,'value_added_rows':['VA'],'ghg_factors':{'CO2':1.},'final_demand_emissions_loaded':True}
    return db,recipe


def test_iot_direct_accounts_use_domestic_diagonal_and_native_output():
    db,r=iot();result=api.direct_accounts(db,r)
    np.testing.assert_allclose(result['gross_output'][:,0],[100,200])
    np.testing.assert_allclose(result['domestic_use']['total'][:,0],[70,150])
    np.testing.assert_allclose(result['final_demand']['total'],[[50,10],[130,0]])
    assert result['final_demand']['gfcf'][1,1]==2
    assert result['final_demand']['inventories_valuables'][1,1]==-2
    assert set(result['demand_groups'])=={'total','households_npish','government','gfcf','inventories_valuables','capital_formation','other'}


def test_public_iot_footprints_keep_consumer_origins_and_zero_output_residual():
    db,r=iot();va=api.value_added_footprint(db,r);ghg=api.ghg_footprint(db,r)
    z=np.array([[20,30],[40,20]])/np.array([100,200]);y=np.array([[50,0],[10,130]])
    w=np.linalg.inv(np.eye(2)-z)
    np.testing.assert_allclose(va['by_origin_consumer'],np.diag([.4,.6])@w@y)
    np.testing.assert_allclose(ghg['by_origin_consumer'],np.diag([.1,.15])@w@y)
    assert va['values'].sum()==pytest.approx(160)
    assert ghg['values'].sum()==pytest.approx(43)
    assert ghg['unallocated'].sum()==pytest.approx(7)


def test_sut_direct_accounts_query_commodity_output_and_final_use():
    db=mario.load_test('SUT');r={'currency_scale':1.};values=api.direct_accounts(db,r)
    regions=db.get_index('Region');u=db.query('U');y=db.query('Yc')
    for i,region in enumerate(regions):
        expected=u.loc[region].loc[:,u.columns.get_level_values(0)==region].to_numpy().sum()+y.loc[region].loc[:,y.columns.get_level_values(0)==region].to_numpy().sum()
        assert values['domestic_use']['total'][i,0]==pytest.approx(expected)
        assert values['gross_output'][i,0]==pytest.approx(db.query('Xc').loc[region].to_numpy().sum())


def test_sut_public_value_added_content_matches_independent_two_stage_system():
    db=mario.load_test('SUT');regions=db.get_index('Region');va=db.query('Va');vc=db.query('Vc');factors=va.index.tolist()
    s=db.query('s');u=db.query('u');y=db.query('Yc').T.groupby(level=0,sort=False).sum().T.reindex(columns=regions)
    production=np.linalg.solve(np.eye(len(u))-u.to_numpy()@s.to_numpy(),y.to_numpy())
    direct_a=db.query('va').sum(axis=0);direct_c=db.query('vc').sum(axis=0)
    expected=[]
    for region in regions:
        a=direct_a.where(direct_a.index.get_level_values(0)==region,0).to_numpy()
        c=direct_c.where(direct_c.index.get_level_values(0)==region,0).to_numpy()
        expected.append((a@s.to_numpy()+c)@production)
    result=api.value_added_footprint(db,{'currency_scale':1.,'value_added_rows':factors})
    np.testing.assert_allclose(result['by_origin_consumer'],expected,rtol=1e-9)


def test_source_combined_capital_or_inventory_categories_are_not_fabricated():
    assert set(classify(['household','government','capital']))=={'total','households_npish','government','capital_formation'}
    assert set(classify(['HFCE','NPISH','GGFC','GFCF','INVNT','DPABR']))=={'total','households_npish','government','gfcf','inventories_valuables','capital_formation','other'}


def test_emerging_goods_proxy_uses_whole_reviewed_nace_sections_and_case_aliases():
    import json
    from recipes.indicators.trade import producer_goods
    mappings=json.loads((Path(__file__).resolve().parents[2]/'doc/source/_static/data/economy/sector-sections.json').read_text())['mappings']
    standard=mappings['emerging-22-2018'];electricity=mappings['emerging-e-2018']
    for mapping in [standard,electricity]:
        labels=[e['native_label'] for e in mapping['entries']]
        chosen=producer_goods(mapping,[x.lower() for x in labels])
        assert len(chosen)==99
        assert 'live animals' in chosen
        assert not any('electricity' in x or 'water supply' in x for x in chosen)
        assert not any('commodities not specified' in x or 'works of art' in x for x in chosen)
        for e in mapping['entries']:
            assert (e['native_label'].lower() in chosen)==(set(e['section'].split('+'))<={'A','B','C'})
    broken={**standard,'entries':standard['entries']+[standard['entries'][0]]}
    with pytest.raises(ValueError,match='Ambiguous'):producer_goods(broken,['live animals'])


def test_e3_source_final_labels_use_the_same_common_capital_formation():
    groups=classify(['P3_S13','P3_S14','P3_S15','P51G','P5M'])
    assert groups['capital_formation']==['P51G','P5M']
    assert groups['households_npish']==['P3_S14','P3_S15']
    assert 'other' not in groups


def test_zero_output_intermediate_users_have_an_explicit_upstream_residual():
    db,r=iot();z=db.query('Z').copy();z.iloc[0,1]=5;db.update_scenarios('baseline',Z=z)
    result=api.value_added_footprint(db,r)
    a=np.array([[20,30],[40,20]])/np.array([105,200]);m=np.diag([40/105,120/200])@np.linalg.inv(np.eye(2)-a)
    np.testing.assert_allclose(result['unassigned_requirements'],m@np.array([5,0]),rtol=1e-10)
    assert result['values'].sum()+result['unallocated'].sum()==pytest.approx(160)
    assert result['source_requirement_gap']['signed']==pytest.approx(5)


def test_preserved_isolated_output_reference_is_not_invented_consumer_demand():
    db,r=iot();z=db.query('Z').copy();z.iloc[3,3]=4.995;v=db.query('V').copy();v.iloc[0,3]=2;e=db.query('E').copy();e.iloc[0,3]=11
    db.update_scenarios('baseline',Z=z,V=v,E=e);x=db.query('X').copy();x.iloc[3,0]=5;db.set_block('X',x)
    va=api.value_added_footprint(db,r);climate=api.ghg_footprint(db,r)
    assert va['values'].sum()==pytest.approx(160)
    assert va['unassigned_requirements'].sum()==pytest.approx(2)
    assert climate['values'].sum()==pytest.approx(43)
    assert climate['unallocated'].sum()==pytest.approx(18)


def test_footprint_storage_preparation_keeps_native_outputs_and_absolute_accounts():
    for db,r in [iot(),(mario.load_test('SUT'),None)]:
        if r is None:r={'currency_scale':1.,'value_added_rows':db.units['Factor of production'].index.tolist()}
        expected=api.value_added_footprint(db,r)
        api.prepare_footprint_model(db,r)
        assert not db.has_matrix('U' if db.table_type=='SUT' else 'Z')
        actual=api.value_added_footprint(db,r)
        np.testing.assert_allclose(actual['values'],expected['values'],rtol=1e-9)
        np.testing.assert_allclose(actual['unallocated'],expected['unallocated'],rtol=1e-9,atol=.1)
        if r.get('ghg_factors'):assert api.ghg_footprint(db,r)['unallocated'].sum()==pytest.approx(7)


def test_sparse_products_preserve_known_zeros_and_reject_observed_nan():
    from scipy import sparse
    left=pd.DataFrame([[1.,0.],[0.,1.]])
    right=pd.DataFrame.sparse.from_spmatrix(sparse.eye(2)).fillna(0).astype(pd.SparseDtype(float,0))
    np.testing.assert_array_equal(api.sparse_product(left,right).to_numpy(),np.eye(2))
    left.iloc[0,0]=np.nan
    with pytest.raises(ValueError,match='Non-finite'):api.sparse_product(left,right)


def test_batched_footprints_keep_units_and_failures_independent():
    db,r=iot();api.prepare_footprint_model(db,r);result=api.footprints(db,r)
    assert not result['errors'];assert result['results']['value_added_footprint']['values'].sum()==pytest.approx(160)
    assert result['results']['ghg_footprint']['values'].sum()==pytest.approx(43)
    assert not db.has_matrix('w')
    db,r=iot();r['ghg_factors']={'not supplied':1};api.prepare_footprint_model(db,r);result=api.footprints(db,r)
    assert set(result['errors'])=={'ghg_footprint'}
    assert result['results']['value_added_footprint']['values'].sum()==pytest.approx(160)


def test_public_gross_trade_content_matches_independent_upstream_coefficients():
    db,r=iot();result=api.ghg_trade(db,r)
    intensity=np.array([.1,.15])@np.linalg.inv(np.eye(2)-np.array([[20,30],[40,20]])/np.array([100,200]))
    assert result['intermediate'][0,1]==pytest.approx(intensity[0]*30)
    assert result['final'][1,0]==pytest.approx(intensity[1]*10)
    np.testing.assert_allclose(result['total'],result['intermediate']+result['final'])
    assert not db.has_matrix('w')

def test_refined_public_iterative_solve_preserves_iot_and_sut_accounts():
    for db,r in [iot(),(mario.load_test('SUT'),None)]:
        if r is None:r={'currency_scale':1.,'value_added_rows':db.units['Factor of production'].index.tolist()}
        expected=api.footprints(db,r)
        r['footprint_compute']={'solver':'scipy','strategy':'iterative','refinement_steps':1}
        actual=api.footprints(db,r)
        assert not actual['errors']
        for metric,result in actual['results'].items():
            np.testing.assert_allclose(result['values'],expected['results'][metric]['values'],rtol=1e-9,atol=1e-8)
            np.testing.assert_allclose(result['unallocated'],expected['results'][metric]['unallocated'],rtol=1e-9,atol=1e-8)
        assert not db.has_matrix('w')

@pytest.mark.parametrize('block',['Z','Y','X'])
def test_direct_accounts_reject_missing_native_cells_before_summing(block):
    db,r=iot();values=db.query(block).copy();values.iloc[0,0]=np.nan;db.set_block(block,values)
    with pytest.raises(ValueError,match='Non-finite'):api.direct_accounts(db,r)


def test_income_and_footprints_reject_missing_selected_accounts():
    db,r=iot();values=db.query('V').copy();values.iloc[0,0]=np.nan;db.set_block('V',values)
    with pytest.raises(ValueError,match='Non-finite'):api.production_income(db,r)
    for block in ['v','E','EY']:
        db,r=iot();values=db.query(block).copy();values.iloc[0,0]=np.nan;db.set_block(block,values)
        with pytest.raises(ValueError,match='Non-finite'):
            (api.value_added_footprint if block=='v' else api.ghg_footprint)(db,r)


def test_finite_validation_distinguishes_sparse_zero_fill_from_missing_cells():
    good=pd.Series([0.,2.],dtype=pd.SparseDtype(float,0.));assert api.require_finite(good) is good
    for values in [pd.Series([np.nan,2.],dtype=pd.SparseDtype(float,0.)),pd.Series([np.nan,2.],dtype=pd.SparseDtype(float,np.nan))]:
        with pytest.raises(ValueError,match='Non-finite'):api.require_finite(values)
    # A fill value does not represent a cell when every position is explicit.
    api.require_finite(pd.Series([1.,2.],dtype=pd.SparseDtype(float,np.nan)))


def test_sparse_products_align_the_inner_labels_and_reject_missing_nodes():
    left=pd.DataFrame([[1.,2.]],columns=['a','b'])
    right=pd.DataFrame({'value':[10.,20.]},index=['b','a']).astype(pd.SparseDtype(float,0.))
    assert api.sparse_product(left,right).iloc[0,0]==40.
    right.index=['b','unknown']
    with pytest.raises(ValueError,match='axes do not align'):api.sparse_product(left,right)


def test_combined_consumption_retains_both_observed_columns_and_qualifies_emerging():
    from recipes.indicators.demand_categories import consumption_note
    db,r=iot();y=db.query('Y').copy();npish='Final consumption expenditure by non-profit organisations serving households (NPISH)'
    y.loc[('CN','Sector','active'),('CN','Consumption category',npish)]=7
    y.loc[('IT','Sector','active'),('IT','Consumption category',npish)]=-2
    db.update_scenarios('baseline',Y=y)
    result=api.direct_accounts(db,r)
    np.testing.assert_array_equal(result['final_demand']['households_npish'],[[57,10],[128,0]])
    assert 'households' not in result['final_demand'] and 'npish' not in result['final_demand']
    assert classify(['household','government','capital'])['households_npish']==['household']
    note=consumption_note({'source':'EMERGING'})
    assert 'NPISH coverage is undocumented' in note and 'not a verified complete' in note
    assert 'No missing NPISH amount is treated as zero' in note

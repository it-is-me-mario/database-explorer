"""Native MATLAB block/axis layouts for direct EMERGING trade collection."""
from contextlib import contextmanager
import h5py

@contextmanager
def native_blocks(path,variant='standard'):
    from mario.parsers import emerging as e
    inputs=[path]
    with h5py.File(path) as handle:
        if variant=='E':
            layout=e.detect_emerging_layout(path,variant='E',load_co2=False)
            group=e._resolve_emerging_e_container(handle)
            nr,ns,nf=e._infer_emerging_e_dimensions(group)
            labels=e._read_emerging_e_region_codes(layout,nr)
            sectors=e._read_emerging_e_sector_labels(layout,ns) or e._builtin_emerging_e_sector_labels(ns)
            final=e._builtin_emerging_final_labels(nf)
            if sectors is None or final is None:raise ValueError('Unverified EMERGING-E axes')
            if layout.figure_data_path is None:raise ValueError('EMERGING-E requires its country-label figure workbook')
            inputs.append(layout.figure_data_path)
            if layout.labels_path is not None:inputs.append(layout.labels_path)
            z,y=group['MRIO_Z_E'],group['MRIO_F_E']
        else:
            group=e._resolve_emerging_container(handle)
            labels=e._read_hdf5_string_list(group,'country_list')
            sectors=e._read_hdf5_string_list(group,'sector_list')
            final=e._read_hdf5_string_list(group,'final_list')
            z,y=group['z'],group['f']
        if z.shape!=(len(labels)*len(sectors),)*2 or y.shape!=(len(labels)*len(final),len(labels)*len(sectors)):
            raise ValueError('Unexpected native EMERGING block dimensions')
        yield labels,sectors,final,z,y,group,inputs

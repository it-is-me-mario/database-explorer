"""Hash each selected GLORIA input member while its numeric rows are read."""
import hashlib,io
import numpy as np
import pandas as pd

class DigestReader(io.RawIOBase):
    def __init__(self,stream):
        self.stream=stream;self.hasher=hashlib.sha256()
    def readable(self):return True
    def readinto(self,target):
        data=self.stream.read(len(target));target[:len(data)]=data;self.hasher.update(data);return len(data)

def csv_batches(resource,*,columns,dtype,batch_size,input_digests):
    from mario.parsers.gloria import _open_gloria_resource
    columns=[int(x) for x in columns];offset=0
    if not columns:raise ValueError('Select source columns')
    with _open_gloria_resource(resource) as raw:
        tracked=DigestReader(raw)
        with io.BufferedReader(tracked,buffer_size=1024**2) as stream:
            for frame in pd.read_csv(stream,header=None,usecols=None if columns==list(range(columns[-1]+1)) else columns,dtype=dtype.name,chunksize=batch_size,engine='c',na_filter=False):
                rows=np.arange(offset,offset+len(frame),dtype=np.int64);offset+=len(frame)
                yield rows,frame.to_numpy(copy=False)
            input_digests[resource.name]={'file':resource.container.name,'member':resource.member or resource.name,'sha256':tracked.hasher.hexdigest()}


csv_batches.reader_backend='pandas '+pd.__version__


def polars_csv_batches(resource,*,columns,dtype,batch_size,input_digests):
    """Optional bounded parser: stage one selected member, never the full archive."""
    import polars as pl,tempfile
    from pathlib import Path
    from mario.parsers.gloria import _open_gloria_resource
    polars_csv_batches.reader_backend='polars '+pl.__version__
    with tempfile.TemporaryDirectory(prefix='mario-trade-gloria-') as folder:
        path=Path(folder)/'selected.csv';hasher=hashlib.sha256()
        with _open_gloria_resource(resource) as raw,path.open('wb') as output:
            for block in iter(lambda:raw.read(8*1024**2),b''):
                hasher.update(block);output.write(block)
        input_digests[resource.name]={'file':resource.container.name,'member':resource.member or resource.name,'sha256':hasher.hexdigest()}
        names=['field_'+str(int(i)) for i in columns]
        import csv
        with path.open(newline='') as sample:width=len(next(csv.reader(sample)))
        if max(columns)>=width:raise ValueError('Source CSV is missing selected columns')
        source_names=['field_'+str(i) for i in range(width)]
        query=pl.scan_csv(path,has_header=False,new_columns=source_names,infer_schema=False,schema_overrides={name:pl.Float64 for name in names},low_memory=True).select(names)
        offset=0
        for frame in query.collect_batches(chunk_size=batch_size,maintain_order=True,engine='streaming'):
            if frame.height>batch_size:raise ValueError('CSV reader exceeded its requested batch bound')
            rows=np.arange(offset,offset+frame.height,dtype=np.int64);offset+=frame.height
            yield rows,frame.to_numpy(order='c')

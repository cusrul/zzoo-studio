"""Produce selected, metadata-free web photos; never overwrite raw files."""
import sys, json, hashlib, shutil
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'.tools/media-python'))
from PIL import Image, ImageOps
import pillow_heif
pillow_heif.register_heif_opener()
raw=Path(sys.argv[1])
curated=Path(sys.argv[2])
public=Path(__file__).resolve().parents[1]/'public/media/crabit'
curated.mkdir(parents=True,exist_ok=True)
public.mkdir(parents=True,exist_ok=True)
selection={'parts':'IMG_3613.HEIC','board-front':'IMG_3616.HEIC','board-back':'IMG_3617.HEIC','display':'IMG_3619.HEIC','strap':'IMG_3650.HEIC','wearing':'IMG_3656.HEIC'}
records=[]
for name,filename in selection.items():
    source=raw/filename
    with Image.open(source) as original:
        photo=ImageOps.exif_transpose(original).convert('RGB')
        photo.thumbnail((1280,1280))
        target=curated/f'{name}.webp'
        photo.save(target,'WEBP',quality=85,method=6)
        shutil.copyfile(target,public/target.name)
        records.append({'source':filename,'output':target.name,'width':photo.width,'height':photo.height,'bytes':target.stat().st_size,'sha256':hashlib.sha256(target.read_bytes()).hexdigest()})
manifest=json.dumps({'description':'Owner-supplied assembly and wearing photos; resized, EXIF orientation applied, metadata omitted. No raw source changed.','images':records},ensure_ascii=False,indent=2)+'\n'
(curated/'provenance.json').write_text(manifest,encoding='utf-8')
(public/'provenance.json').write_text(manifest,encoding='utf-8')
print(manifest)

from pathlib import Path
import hashlib,json,shutil
root=Path(__file__).resolve().parent
files=('index.html','styles.css','app.js','_headers')
dest=root/'dist';dest.mkdir(exist_ok=True)
for old in dest.iterdir():
    if old.is_file(): old.unlink()
for name in files:
    data=(root/'src'/name).read_bytes()
    for forbidden in (b'/Users/',b'libfile_',b'sediment://',b'd5a515',b'f5573e',b'PRIVATE KEY',b'api_key='):
        assert forbidden not in data,(name,forbidden)
    shutil.copyfile(root/'src'/name,dest/name)
manifest={name:hashlib.sha256((dest/name).read_bytes()).hexdigest() for name in files}
(root/'BUILD_MANIFEST.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('Built four allowlisted public assets:',dest)

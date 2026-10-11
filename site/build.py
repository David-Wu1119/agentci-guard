from pathlib import Path
import hashlib,json,shutil,subprocess

root=Path(__file__).resolve().parent
files=('index.html','styles.css','app.js','_headers')
generated=('scanner-browser.js','THIRD_PARTY_LICENSES.txt')
dest=root/'dist';dest.mkdir(exist_ok=True)
for old in dest.iterdir():
    if old.is_file(): old.unlink()
for name in files:
    shutil.copyfile(root/'src'/name,dest/name)

subprocess.run(['node','site/build-browser.mjs'],cwd=root.parent,check=True)
notices=[]
for name in ('yaml','pathe'):
    package=root.parent/'node_modules'/name
    metadata=json.loads((package/'package.json').read_text())
    notices.append(f"{name} {metadata['version']} ({metadata['license']})\n\n{(package/'LICENSE').read_text().strip()}\n")
(dest/'THIRD_PARTY_LICENSES.txt').write_text('\n'.join(notices))

assert {item.name for item in dest.iterdir()} == set(files+generated)
for name in files+generated:
    data=(dest/name).read_bytes()
    for forbidden in (b'/Users/',b'libfile_',b'sediment://',b'd5a515',b'f5573e',b'PRIVATE KEY',b'api_key='):
        assert forbidden not in data,(name,forbidden)
manifest={name:hashlib.sha256((dest/name).read_bytes()).hexdigest() for name in files+generated}
(root/'BUILD_MANIFEST.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('Built six allowlisted public assets:',dest)

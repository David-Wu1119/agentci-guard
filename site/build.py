from pathlib import Path
import base64,hashlib,json,shutil,subprocess

root=Path(__file__).resolve().parent
files=('index.html','styles.css','app.js','_headers')
dest=root/'dist';dest.mkdir(exist_ok=True)
for old in dest.iterdir():
    if old.is_file(): old.unlink()
for name in files:
    shutil.copyfile(root/'src'/name,dest/name)

subprocess.run(['node','site/build-browser.mjs'],cwd=root.parent,check=True)
digest=hashlib.sha256((dest/'scanner-browser.js').read_bytes()).hexdigest()
scanner_name=f'scanner-browser.{digest}.js'
(dest/'scanner-browser.js').rename(dest/scanner_name)
generated=(scanner_name,'THIRD_PARTY_LICENSES.txt')
source_commit='';clean=False
try:
    git_root=Path(subprocess.check_output(['git','rev-parse','--show-toplevel'],cwd=root.parent,text=True,stderr=subprocess.DEVNULL).strip()).resolve()
    if git_root == root.parent:
        source_commit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root.parent,text=True,stderr=subprocess.DEVNULL).strip()
        clean=not subprocess.check_output(['git','status','--porcelain'],cwd=root.parent,text=True,stderr=subprocess.DEVNULL).strip()
except (OSError,subprocess.CalledProcessError):
    source_commit='';clean=False
if clean:
    assert len(source_commit)==40 and all(character in '0123456789abcdef' for character in source_commit)
    provenance=f'<a href="https://github.com/David-Wu1119/agentci-guard/tree/{source_commit}">{source_commit}</a> (clean checkout; publication not verified by this build)'
else:
    provenance='Uncommitted local build (no exact source commit)' if source_commit else 'Source revision unavailable (non-Git build)'
html=(dest/'index.html').read_text()
for placeholder,value in (
    ('__SCANNER_SHA256__',digest),
    ('__SOURCE_PROVENANCE__',provenance),
):
    assert html.count(placeholder)==1,placeholder
    html=html.replace(placeholder,value)
for name in ('styles.css','app.js'):
    reference=f'"{name}"'
    assert html.count(reference)==1,name
    version=hashlib.sha256((dest/name).read_bytes()).hexdigest()
    html=html.replace(reference,f'"{name}?v={version}"')
assert html.count('"scanner-browser.js"')==1
integrity=base64.b64encode(bytes.fromhex(digest)).decode()
html=html.replace('"scanner-browser.js"',f'"{scanner_name}" integrity="sha256-{integrity}"')
(dest/'index.html').write_text(html)
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

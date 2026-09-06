"""One-time, checksum-verified import of the delivered Celesta source."""
import base64
import hashlib
import json
import lzma
from pathlib import Path, PurePosixPath

bundle = Path(__file__).resolve().parent
root = bundle.parent
manifest = json.loads((bundle / 'manifest.json').read_text(encoding='utf-8'))
parts = []
for entry in manifest['chunks']:
    data = (bundle / entry['path']).read_bytes()
    if len(data) != entry['length'] or hashlib.sha256(data).hexdigest() != entry['sha256']:
        raise ValueError(f"Source chunk failed verification: {entry['path']}")
    parts.append(data)
compressed = base64.b64decode(b''.join(parts), validate=True)
if hashlib.sha256(compressed).hexdigest() != manifest['sha256']:
    raise ValueError('Source archive failed verification')
files = json.loads(lzma.decompress(compressed).decode('utf-8'))
if not isinstance(files, dict) or len(files) != 21:
    raise ValueError('Unexpected source manifest')
for name, text in files.items():
    path = PurePosixPath(name)
    if path.is_absolute() or '..' in path.parts or path.parts[0] in {'.git', '.github', '.bootstrap'}:
        raise ValueError(f'Unsafe source path: {name}')
    if not isinstance(text, str):
        raise ValueError(f'Invalid text source: {name}')
    target = root.joinpath(*path.parts)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(text.encode('utf-8'))
readme = root / 'README.md'
text = readme.read_text(encoding='utf-8')
text = text.replace('# Celesta Studio\n', '# Celesta Studio\n\n**[Open Celesta Studio](https://wieslawsoltes.github.io/CelestaStudio/)** · [Build and deployment](https://github.com/wieslawsoltes/CelestaStudio/actions/workflows/pages.yml)\n', 1)
text += '\n## GitHub Pages\n\nThe `Pages` workflow validates the core and browser tests, builds the standalone application, and publishes `dist/` to GitHub Pages on pushes to `main`. Pull requests run the same checks without deploying. See [DEPLOYMENT.md](DEPLOYMENT.md) for details.\n'
readme.write_text(text, encoding='utf-8')
print(f'Imported {len(files)} verified source files.')

"""Increment extension patch version, update the badge, and package a new release."""
import json
import re
import zipfile
from pathlib import Path

root = Path(__file__).resolve().parent
manifest_path = root / 'manifest.json'
panel_path = root / 'panel.html'
archive_path = root.parent / 'RAVIX-Speech.zip'
legacy_archive_path = root.parent / 'Google-Speech-Generation.zip'
manifest = json.loads(manifest_path.read_text(encoding='utf-8-sig'))
parts = manifest.get('version', '').split('.')
if not 1 <= len(parts) <= 4 or any(not p.isdigit() or int(p) > 65535 for p in parts):
    raise SystemExit('Invalid Chrome extension version')
if int(parts[-1]) >= 65535:
    raise SystemExit('Patch component exhausted; set a new version manually')
parts[-1] = str(int(parts[-1]) + 1)
version = '.'.join(parts)
panel = panel_path.read_text(encoding='utf-8-sig')
panel, matches = re.subn(r'(<span class="badge">)v[0-9.]+(</span>)', rf'\g<1>v{version}\2', panel)
if matches != 1:
    raise SystemExit('Expected exactly one version badge; release aborted')
manifest['version'] = version
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
panel_path.write_text(panel, encoding='utf-8')
tmp_path = archive_path.with_suffix('.zip.tmp')
try:
    with zipfile.ZipFile(tmp_path, 'w', zipfile.ZIP_DEFLATED) as archive:
        for item in sorted(root.rglob('*')):
            if item.is_file() and '__pycache__' not in item.parts:
                archive.write(item, Path(root.name) / item.relative_to(root))
    tmp_path.replace(archive_path)
    import shutil
    shutil.copyfile(archive_path, legacy_archive_path)
finally:
    if tmp_path.exists():
        tmp_path.unlink()
print(f'Released version {version}: {archive_path}')

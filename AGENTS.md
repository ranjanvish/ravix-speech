# Extension maintenance

For every change to this extension, increment the version in `manifest.json` and refresh the distributable ZIP. Run `python release.py` from this directory once after the changes are complete; this increments the patch version, updates the panel badge and rebuilds the ZIP. Never make an extension change without releasing a higher version. Document substantive behavior changes and validate the release. This is a project instruction, not a mechanism that can intercept edits made outside the release process.

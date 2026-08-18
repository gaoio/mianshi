# Security Policy

## Reporting a vulnerability

Do not disclose vulnerabilities, credentials, signing material, or exploit details in a public issue. Use the repository's **Security > Advisories > New draft security advisory** flow so the report remains private until a fix is available.

Never commit model API keys, updater private keys, Android keystores, environment files, exported local data, or production logs. The repository-level `.gitignore` blocks the common forms of these files, but contributors remain responsible for reviewing staged changes.

## Release security

- Desktop updater artifacts are signed by Tauri and verified with the public key embedded at build time.
- Android releases use one persistent signing identity and are verified with `apksigner` before upload.
- Release workflow actions are pinned to full commit SHAs.
- Release secrets are supplied only through GitHub Actions secrets and variables.
- Only the HTTPS GitHub repository embedded at build time is accepted as an update source.

## Dependency audit

Run the repository audit from the project root:

```bash
npm run security:audit
```

The audit command contains no advisory exclusions. Any exception must be documented here with its exact dependency path and supported-target impact before it is added.

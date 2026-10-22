# Security Policy

## Supported versions

| Version | Support |
|---------|---------|
| latest tagged release | ✅ security fixes |
| `master` | ✅ best effort |
| older releases | ❌ upgrade first |

## Reporting a vulnerability

Please report privately — do **not** open a public issue for anything exploitable.

- **GitHub**: [Security tab → "Report a vulnerability"](https://github.com/AkshatNaruka/barkcli/security/advisories/new) (private advisory)

Include: affected version or commit, a minimal reproduction, and your assessment of impact. Please don't test against third-party deployments of the demo site.

## What's in scope

- `barkcli` the binary: CLI, TUI, and the axum web server (`barkcli serve`)
- published crate (`barkcli` on crates.io) and release binaries
- the VS Code extension storage/preview surface
- demo/Pages static build where it handles data (localStorage demo shim)

## What's out of scope

- Social engineering, brute force, or spam of any kind
- Vulnerabilities in third-party dependencies where the fix is a routine version bump (still appreciated — open an issue or PR)
- GitHub Pages/Vercel platform behavior itself

## What we aim for

- Acknowledgement within **7 days**
- Fix or mitigation for reportable issues within **30 days**
- Coordinated disclosure — you choose whether to be credited; advisory published once a fix ships

## Design notes

barkcli is local-first by design: boards live as YAML files in your git repo, the web server binds to localhost by default, and there is no cloud component holding your data. If you find that boundary violated in any way — a write path escaping the workspace directory or the server accepting requests it shouldn't — that's a security bug we want to hear about.

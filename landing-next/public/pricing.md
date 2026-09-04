# Pricing — barkcli

> barkcli is fully free and open source under the MIT license. There is no paid tier, no per-seat pricing, no cloud, and no account required. This file is written for human readers and AI agents evaluating the product.

## Summary

| Plan | Price | Licenses | Limits |
|------|-------|----------|--------|
| Free (Open Source) | $0 — forever | Unlimited users | Unlimited boards, cards, and projects |
| Pro features | $0 — included | Unlimited users | Included in the same binary |
| Enterprise | Custom | N/A | contact: support@barkcli.dev |

There is no pricing tier above Free. Every feature ships in the MIT-licensed binary.

## Free Tier (Open Source)

- **Price:** $0/month (one-time install, no subscription)
- **License:** MIT — modify and redistribute freely
- **Users:** Unlimited (collaboration via git)
- **Boards:** Unlimited
- **Cards:** Unlimited
- **Projects:** Unlimited
- **Includes:**
  - CLI, Terminal UI, Web App, VS Code Extension
  - Git integration (diff, merge, version control)
  - Code context (symbol search, file mapping)
  - MCP server for AI coding agents (56 tools)
  - Sessions, checkpoints, sprints
  - Import/export (YAML, JSON)
  - Timeline: undo, diff, blame, validate, doctor
  - Memory system with hybrid search
  - BMAD skills and templates
  - Team collaboration via git push/pull

## Pro Features (Included Free)

While labeled "Pro", these are part of the open source binary at no cost:

- **Price:** $0 — included
- **Includes:**
  - AI task breakdown (`barkcli ai`)
  - AI acceptance criteria (`barkcli agent propose`)
  - Reports and changelog generation
  - Sprint velocity tracking
  - Board templates
  - GitHub Issues sync
  - Autopilot loop (intent → plan → review → merge)
  - Spec traceability and coverage reports

## Enterprise / Support

- **Price:** Custom — contact support@barkcli.dev
- **Includes:**
  - Priority support
  - Custom integrations
  - Training and onboarding
  - SLA guarantees

## Data Ownership

- All data stays in your repository as YAML files (`.board/`).
- No telemetry, no data leaves your machine unless you push your repo.
- Works fully offline.

## Installation

```bash
# One-liner (recommended)
curl -fsSL https://barkcli.vercel.app/install.sh | sh

# Homebrew
brew tap AkshatNaruka/barkcli && brew install barkcli

# Cargo
cargo install barkcli

# Binary releases
# https://github.com/AkshatNaruka/barkcli/releases
```

## Source Code

- GitHub: https://github.com/AkshatNaruka/barkcli
- License: MIT
- Issues: https://github.com/AkshatNaruka/barkcli/issues
- Version: 0.3.0

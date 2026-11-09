# Barkcli Developer & Agent Instructions

All agents and developers must adhere to the rules and architecture specified in [AGENTS.md](AGENTS.md).

## Critical Agent Rules

1. **Positioning**: barkcli is **the management layer for AI agents** (intent in, plans out, isolated worktrees, tests as the gate, and a merge train for whatever passes). Never describe it as a generic project board or kanban tool.
2. **The ONLY official macOS app is the non-Swift app (`desktop/` + `web/`)**: Never touch `barkcli-ios/`.
3. **Auto-Update Local macOS App on Commit (MANDATORY)**: Update `/Applications/Bark.app` on UI/desktop changes (`bash scripts/deploy_mac_app.sh` or `npm run app:update`).
4. **Documentation, README & Website Synchronization (MANDATORY)**:
   - Always update `README.md` to reflect new capabilities, features, and working links.
   - Always update `landing-next/src/lib/features.ts` and `landing-next/src/app/page.tsx` when adding or improving features to flex on the GitHub website (`https://akshatnaruka.github.io/barkcli`).
   - Run `npm --prefix landing-next run build` and `npm --prefix web test -- --run` to verify everything builds and passes.

See [AGENTS.md](AGENTS.md) for full commands, layout, and architecture.

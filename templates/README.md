# Starter templates

Copy a board into your repo (or import it) instead of starting from an empty
file. Each template below is a valid `*.board` YAML file dev.board-style.

```shell
# Physics-cheap: copy the file
curl -fsSL https://raw.githubusercontent.com/AkshatNaruka/barkcli/master/templates/agent-team.board \
  -o agent-team.board

# Or import through the CLI
barkcli import agent-team templates/agent-team.board
```

| Template | When to use it |
|---|---|
| [`agent-team.board`](agent-team.board) | AI coding agents share the board with humans — todo → doing → review → done, with agent-ready card fields (priority, description, steps). |
| [`personal.board`](personal.board) | Solo personal tracker — one board, zero ceremony, works offline. |
| [`release-train.board`](release-train.board) | Release management: cut a train per version, every card is a release gate. |

After importing, run `barkcli context prime` so the board state lands in your
`project_context.md` for cold agent sessions.

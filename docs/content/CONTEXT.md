# Code Context

barkcli can analyze your codebase and automatically link code to tasks. This creates a bridge between your project management and actual code.

---

## Overview

Code context is stored in `.board/context/<board>.json` and includes:

- **Files** — Which files each task touches
- **Symbols** — Functions, classes, variables
- **Status** — Last commit, dirty state
- **Coverage** — How much of your code is linked to tasks

---

## Quick Start

```shell
# Scan your codebase and link files to cards
barkcli context scan

# Check coverage
barkcli context status

# Search for code
barkcli code "authentication"
```

---

## Commands

### `barkcli code <query>`

Search symbols and files, then see which cards are linked.

```shell
barkcli code "login"              # find login-related code
barkcli code "UserService"        # find a class
barkcli code "src/api"            # find files in a path
```

Returns:
- Matching files with line numbers
- Symbols found in each file
- Linked cards (if any)

### `barkcli context scan`

Automatically map cards to code files using fuzzy title matching.

```shell
barkcli context scan
```

How it works:
1. Reads all card titles
2. Scans your codebase for files and symbols
3. Matches titles to code using fuzzy scoring
4. Updates the context with matched files

### `barkcli context link <card> <path|symbol>`

Manually pin a file or symbol to a card.

```shell
barkcli context link jwt-login src/auth/login.ts
barkcli context link jwt-login UserService
```

### `barkcli context unlink <card> <path|symbol>`

Remove a file or symbol link from a card.

```shell
barkcli context unlink jwt-login src/auth/login.ts
```

### `barkcli context status`

Show coverage and staleness of your code context.

```shell
barkcli context status
```

Output:
```
Board: main
Coverage: 67% (12/18 files linked)
Stale files: 3 (not updated in >7 days)
```

### `barkcli context show <card>`

Show the full code context for a specific card.

```shell
barkcli context show jwt-login
```

Output:
```
Card: jwt-login
Files:
  - src/auth/login.ts (last commit: abc1234, dirty)
  - src/auth/jwt.ts (last commit: def5678, clean)
Symbols:
  - UserService.login()
  - JWT.validate()
```

### `barkcli context sync`

Git-aware refresh of your context. Updates last commit info and checks for dirty files.

```shell
barkcli context sync
```

This command:
- Checks which files have been modified since last commit
- Updates the `last_commit` field for each file
- Marks files as `dirty` or `clean`

### `barkcli context autosync on|off`

Automatically run `context sync` after each git commit.

```shell
barkcli context autosync on       # enable
barkcli context autosync off      # disable
```

When enabled, barkcli adds a post-commit hook that syncs context automatically.

---

## AI Features (Pro)

These features require a license and an AI provider configuration.

### `barkcli context refresh [id...]`

Use AI to generate summaries of your code context.

```shell
barkcli context refresh            # refresh all cards
barkcli context refresh jwt-login  # refresh specific card
```

### `barkcli agent propose <id>`

AI generates acceptance criteria and child tasks for a card.

```shell
barkcli agent propose jwt-login
```

### `barkcli agent config`

Configure your AI provider.

```shell
barkcli agent config show                    # show current config
barkcli agent config set provider ollama     # use local Ollama
barkcli agent config set provider openai     # use OpenAI
barkcli agent config set model gpt-4        # set model
barkcli agent config set base-url http://... # custom endpoint
```

### `barkcli agent watch`

Watch files for changes and keep context fresh.

```shell
barkcli agent watch                 # watch without AI
barkcli agent watch --llm           # use AI for summaries
barkcli agent watch --interval 30   # check every 30 seconds
```

---

## File Format

The context is stored in `.board/context/<board>.json`:

```json
{
  "cards": {
    "jwt-login": {
      "files": [
        {
          "path": "src/auth/login.ts",
          "symbols": ["UserService.login", "JWT.validate"],
          "last_commit": "abc1234",
          "status": "dirty"
        }
      ],
      "sessions": ["session-abc"],
      "ai": {
        "summary": "Handles JWT authentication with refresh tokens"
      }
    }
  },
  "index": {
    "src/auth/login.ts": ["jwt-login"],
    "src/auth/jwt.ts": ["jwt-login"]
  }
}
```

---

## Supported Languages

Code context works with:

- **JavaScript/TypeScript** — Full symbol extraction
- **Python** — Functions, classes, variables
- **Rust** — Functions, structs, enums, traits
- **Go** — Functions, types, interfaces
- **Other** — File-level matching only

---

## Privacy

All code context analysis runs locally. No code is sent to external services unless you explicitly configure an AI provider.

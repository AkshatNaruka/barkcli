# Founder video — script, shot list, rehearsal (W27)

**Hard limit: 60 seconds.** YC says: you on camera, no slides, show the product,
don't read a script. Phone camera or webcam is fine; audio matters more than video.
Record in one take if possible, two max. Upload as an unlisted YouTube link.

Target: **record final Tue Oct 27**, so launch day (Wed) is free.

---

## The 58-second script (say it, don't read it)

| Time | On screen | Words |
|---|---|---|
| 0:00–0:07 | Face, medium shot | "I'm Akshat, founder of barkcli. We make coding agents trustworthy." |
| 0:07–0:18 | Face → cut to terminal | "Every team using Claude Code or Codex hits the same thing: the agent says it's done, and the build is broken. I was re-reading twenty-nine thousand tokens of repo context every session just to check." |
| 0:18–0:40 | Terminal run → web live view → merge report | "barkcli gives agents a task queue, their own git worktree, and an acceptance gate that runs your tests. Three agents work in parallel. Only branches that pass the gate merge — done means the gate passed, never the agent's word." |
| 0:40–0:50 | Face | "It's one Rust binary: CLI, web app, VS Code, fifty-six MCP tools. Two hundred fifty-four tests, MIT, and I use it daily on my own products." |
| 0:50–0:58 | Face | "Next is the multiplayer layer, so teams share live agent sessions. I'm applying solo to W27 and can be in San Francisco in January. Thanks." |

**Word count:** ~150 — comfortable at a calm pace with pauses.

### Delivery notes
- Look at the lens, not the screen. Smile at the start and end.
- Say "twenty-nine thousand", not "29k" — it reads better aloud.
- Pause half a beat after "trustworthy" and after "never the agent's word."
- Don't explain what YC is or thank them for the application.
- If you stumble, restart the sentence, not the whole video (edit it out).

---

## Recording setup

- **Video:** 1080p, 30fps. Webcam at eye level, window in front of you, plain wall.
- **Audio:** wired earphones or a USB mic; record a 10-second test and listen back.
- **Screen:** 1920×1080, browser at 100%, terminal font ≥ 16pt, dark theme, no
  notifications (Do Not Disturb + close Slack/X).
- **Capture:** QuickTime (New Screen Recording) for the screen; OBS if you want
  face + screen in one take. Record screen and face separately, cut together.
- **Editing:** CapCut or iMovie. Hard cuts only. No music, no captions required,
  no intro card. Export 1080p, upload unlisted to YouTube.

---

## Demo repo (deterministic, ~2 minutes to set up)

The demo uses a scripted "agent" so the run always succeeds on camera. It is a
real `barkcli run` — only the LLM is replaced. If asked, say exactly that.

```bash
# 1. fresh demo repo
rm -rf /tmp/bark-demo && mkdir -p /tmp/bark-demo && cd /tmp/bark-demo
git init -b main && git config user.name "Akshat" && git config user.email "a@barkcli.dev"

cat > package.json <<'EOF'
{ "name": "bark-demo", "version": "1.0.0", "scripts": { "test": "node test.js" } }
EOF

cat > test.js <<'EOF'
console.log("no fizz module yet");
process.exit(1);
EOF

# 2. the scripted agent: reads the prompt, writes the module, makes tests pass
cat > fake-agent.sh <<'EOF'
#!/bin/sh
set -e
cat > fizz.js <<'JS'
function fizzBuzz(n) {
  if (n % 15 === 0) return "FizzBuzz";
  if (n % 3 === 0) return "Fizz";
  if (n % 5 === 0) return "Buzz";
  return String(n);
}
module.exports = fizzBuzz;
JS
cat > test.js <<'JS'
const f = require("./fizz.js");
if (f(15) !== "FizzBuzz" || f(3) !== "Fizz" || f(5) !== "Buzz" || f(7) !== "7") {
  console.error("fizzbuzz broken"); process.exit(1);
}
console.log("all fizzbuzz cases pass");
JS
echo "agent finished"
EOF
chmod +x fake-agent.sh

git add -A && git commit -m "seed"

# 3. board + run
barkcli init
barkcli create demo
BARKCLI_AGENT_CMD=./fake-agent.sh \
  barkcli run "Create a fizzbuzz module with tests for 15, 3, 5 and 7" \
  --board demo --agents 3 --test-cmd "node test.js" --yes --offline
```

For the live web view in the same take:

```bash
barkcli serve --port 4331 --open   # keep this running in a second tab
# run the command above while the Orchestrate view is open
```

If `barkcli serve` needs the built web assets in the demo repo, copy them once:
`cp -R /path/to/barkcli/web/dist ./web-dist` (only if your build expects it).

---

## Shot list (record in this order)

1. **A-roll, 3 takes:** the full script to camera. Pick the take with the best energy.
2. **Terminal, 1 take:** `cd /tmp/bark-demo`, clear screen, run the `barkcli run`
   command. Start recording *before* pressing enter. Let it finish; don't cut mid-run.
3. **Web, 1 take:** Orchestrate tab open, run again with `--agents 3`; capture the
   three workers going live and the merge report. Slow down the mouse.
4. **Merge proof, 5 seconds:** `git log --oneline -3` on main showing the merged work.
5. **Face, 2 takes:** the closing two lines, for a clean ending.

---

## Rehearsal sheet (do this Mon + Tue)

- [ ] Run the demo repo setup from scratch twice; time it. Target < 90 seconds.
- [ ] Run the full `barkcli run` 3 times; confirm gate passes and branch merges.
- [ ] Record a 60-second voice memo of the script; listen for filler words.
- [ ] Record the video once end-to-end; watch it on your phone at arm's length.
      If you can't hear "twenty-nine thousand" and "only branches that pass",
      re-record the audio.
- [ ] Check the final file is **under 60.0s** and plays with sound in a browser.
- [ ] Upload unlisted; paste the link into the application; test it logged out.

## Fallbacks

- **Agent too slow on camera?** Use the scripted agent (above) and say "scripted
  demo agent" if asked. Never claim it's an LLM when it isn't.
- **Run fails on camera?** Keep it. A gate failing and re-dispatching is the
  product working — but only if you have 20 seconds to explain it. Otherwise cut.
- **No quiet room?** Record audio first (voice memo), then mime to camera and
  lay the audio over. Slightly stiff is fine; bad audio is not.

// barkcli session capture plugin for OpenCode
// Installed by `barkcli hooks install --agent opencode`.
// Pipes user prompts + touched files into `barkcli session log` (agent
// session capture). Failures are silently ignored — never break the agent.
import type { Plugin } from "@opencode-ai/plugin"

export const BarkcliPlugin: Plugin = async ({ directory }) => {
  const seen = new Set<string>()
  let model: string | null = null
  let pendingPrompts: string[] = []
  const files = new Set<string>()

  function collectFilePaths(value: unknown, cwd: string) {
    if (typeof value !== "object" || value === null) return
    const entries = value as Record<string, unknown>
    for (const key of ["filePath", "file_path", "path", "uri", "file"]) {
      const v = entries[key]
      if (typeof v === "string" && v.length > 0) {
        let p = v
        if (p.startsWith("file://")) {
          try { p = decodeURIComponent(new URL(p).pathname) } catch { /* keep raw */ }
        }
        if (!p.startsWith("http://") && !p.startsWith("https://") && !p.startsWith("/dev/")) {
          p = p.replace(cwd + "/", "").replace(/^\.\//, "")
          if (!p.includes("\n") && p.length < 500) files.add(p)
        }
      }
    }
    for (const v of Object.values(entries)) {
      if (typeof v === "object" && v !== null) collectFilePaths(v, cwd)
    }
  }

  function call(payload: Record<string, unknown>) {
    try {
      const json = JSON.stringify(payload)
      const proc = Bun.spawn(
        ["sh", "-c", "if ! command -v barkcli >/dev/null 2>&1; then exit 0; fi; exec barkcli session log --agent opencode"],
        { cwd: directory, stdin: new Blob([json + "\n"]), stdout: "ignore", stderr: "ignore" },
      )
      proc.exited.catch(() => {})
    } catch {
      // never crash the agent
    }
  }

  function flush() {
    if (pendingPrompts.length === 0 && files.size === 0) return
    call({
      prompt: pendingPrompts.join("\n\n"),
      model: model ?? undefined,
      summary: pendingPrompts.length === 1 ? "single prompt" : `${pendingPrompts.length} prompts`,
      files: files.size > 0 ? [...files] : undefined,
    })
    pendingPrompts = []
  }

  return {
    event: async ({ event }) => {
      try {
        switch (event.type) {
          case "message.updated": {
            const msg = (event as any).properties?.info
            if (!msg) break
            if (msg.role === "assistant" && msg.modelID) model = msg.modelID
            if (msg.role === "user" && msg.text && !seen.has(msg.id)) {
              seen.add(msg.id)
              pendingPrompts.push(String(msg.text))
            }
            break
          }
          case "message.part.updated": {
            const part = (event as any).properties?.part
            if (!part?.messageID) break
            if (part.type === "text" && !seen.has(part.messageID)) {
              seen.add(part.messageID)
              pendingPrompts.push(String(part.text ?? ""))
            }
            if (part.type === "tool" || part.type === "step") {
              collectFilePaths(part.state?.input ?? part.input ?? part, directory)
            }
            break
          }
          case "session.status": {
            const props = (event as any).properties
            if (props?.status?.type !== "idle") break
            flush()
            break
          }
          case "server.instance.disposed": {
            flush()
            break
          }
        }
      } catch {
        // never crash the agent
      }
    },
  }
}

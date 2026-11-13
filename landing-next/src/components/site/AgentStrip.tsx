import {
  ClaudeCodeLogo,
  CodexLogo,
  CursorLogo,
  OpenCodeLogo,
} from "@/components/AgentLogos";

const AGENTS = [
  { name: "Claude Code", Logo: ClaudeCodeLogo, note: "claude" },
  { name: "Codex", Logo: CodexLogo, note: "codex" },
  { name: "OpenCode", Logo: OpenCodeLogo, note: "opencode" },
  { name: "Cursor", Logo: CursorLogo, note: "cursor" },
];

/**
 * Compatibility, stated plainly.
 *
 * These are integrations, not customers — the label says so, and there are no
 * fake logos or endorsement claims.
 */
export function AgentStrip() {
  return (
    <section aria-label="Supported coding agents" className="border-y border-line bg-bg-deep/60">
      <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-4 px-5 py-6 md:flex-row md:items-center md:justify-between md:px-8">
        <p className="text-[12px] leading-relaxed text-muted">
          <span className="font-medium text-fg/85">Bring the agents you already pay for.</span>{" "}
          BarkCLI never resells tokens.
        </p>
        <ul className="flex flex-wrap items-center gap-x-7 gap-y-3">
          {AGENTS.map((agent) => (
            <li key={agent.name} className="flex items-center gap-2 text-muted">
              <agent.Logo className="size-4 shrink-0 opacity-80" />
              <span className="text-[12.5px] font-medium">{agent.name}</span>
            </li>
          ))}
          <li className="font-mono text-[11px] text-muted-dim">+ any MCP agent</li>
        </ul>
      </div>
    </section>
  );
}

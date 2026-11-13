import { ChevronDown } from "lucide-react";
import { MCP_TOOL_COUNT } from "@/lib/mcp";

export const FAQ_ITEMS = [
  {
    question: "What is barkcli?",
    answer:
      "barkcli is the management layer between humans and AI coding agents. You state intent; it plans the work, dispatches tasks to your agents in isolated git worktrees, verifies each attempt with your project's tests, and sends only passing work to your review queue.",
  },
  {
    question: "Do I have to switch coding agents?",
    answer:
      "No. It runs the agents you already have installed (Claude Code, Codex, or OpenCode, plus any command via BARKCLI_AGENT_CMD) and exposes its own MCP tools so an agent can read tasks, claim work, and report verdicts from inside its normal session. You keep your subscriptions.",
  },
  {
    question: "What happens when an agent's work fails the tests?",
    answer:
      "The attempt fails. barkcli captures the compiler and test output, feeds it into the agent's next attempt in the same worktree, and retries. A crashed agent with no changes and a no-op gate counts as a failure too; nothing reaches review until the gate passes.",
  },
  {
    question: "Where does my data live?",
    answer:
      "In your repository: boards are YAML, and specs, memory, skills, and run records live under .board/ as files you can diff, review, and version. User settings live in ~/.bark/settings.json. There is no cloud database and no account.",
  },
  {
    question: "Is it free?",
    answer:
      "Yes. The CLI and the desktop app are free and open source under the MIT license, with no per-seat pricing. You pay only for the model usage of whichever agent you bring.",
  },
  {
    question: "How is this different from Jira or Linear?",
    answer:
      "Those tools manage people through a cloud database. barkcli manages people and agents through files in the repo, so an agent can read and write the same board you see, and a plan can be reviewed in a pull request like code.",
  },
  {
    question: "How many tools does the MCP server expose?",
    answer: `Currently ${MCP_TOOL_COUNT} tools over JSON-RPC 2.0 on stdio, covering boards, specs, memory, code context, runs, and reviews. Run "barkcli mcp" and point your agent's MCP configuration at it.`,
  },
];

/**
 * Native <details> elements: expandable without JavaScript, keyboard
 * accessible for free, and fully present in the DOM for search engines.
 */
export function FaqSection() {
  return (
    <section id="faq" className="relative border-t border-line py-20 md:py-28">
      <div className="mx-auto grid w-full max-w-[1120px] gap-10 px-5 md:px-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
        <div>
          <h2 className="font-display text-[clamp(1.9rem,4vw,2.75rem)] font-medium leading-[1.05] tracking-[-0.025em] text-fg">
            Questions worth asking.
          </h2>
          <p className="mt-4 max-w-sm text-[14px] leading-[1.65] text-muted">
            Something missing?{" "}
            <a
              href="https://github.com/AkshatNaruka/barkcli/issues"
              target="_blank"
              rel="noreferrer"
              className="text-copper-soft underline-offset-4 hover:underline"
            >
              Open an issue
            </a>{" "}
            or read the{" "}
            <a href="/docs" className="text-copper-soft underline-offset-4 hover:underline">
              documentation
            </a>
            .
          </p>
        </div>

        <div className="divide-y divide-line border-y border-line">
          {FAQ_ITEMS.map((item) => (
            <details key={item.question} className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-[14px] font-medium text-fg/90 transition-colors hover:text-fg [&::-webkit-details-marker]:hidden">
                {item.question}
                <ChevronDown
                  className="size-4 shrink-0 text-muted-dim transition-transform duration-200 group-open:rotate-180"
                  aria-hidden
                />
              </summary>
              <p className="pb-4 pr-8 text-[13.5px] leading-[1.7] text-muted">{item.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

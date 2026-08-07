"use client";

import { useEffect, useState } from "react";

const CYCLE = 9000;

interface Line {
  text: string;
  at: number; // ms into the cycle when typing starts
}

const LINES: Line[] = [
  { text: 'barkcli add "Fix auth bug" -p high', at: 200 },
  { text: "barkcli move fix-auth-bug doing", at: 3300 },
  { text: "barkcli done fix-auth-bug", at: 5800 },
];

/** Types the command lines on a fixed loop, synced to the CSS card journey. */
export function TerminalDemo() {
  const [typed, setTyped] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    let timers: ReturnType<typeof setTimeout>[] = [];
    let cycle = 0;

    const typeLine = (text: string, resolve: () => void) => {
      let i = 0;
      const t = setInterval(() => {
        if (!alive) {
          clearInterval(t);
          return;
        }
        i++;
        setTyped((prev) => {
          const next = [...prev];
          next[next.length - 1] = text.slice(0, i);
          return next;
        });
        if (i >= text.length) {
          clearInterval(t);
          resolve();
        }
      }, 28);
      timers.push(t);
    };

    const runCycle = () => {
      cycle++;
      const start = Date.now();
      const seq: Promise<void>[] = [];

      LINES.forEach((line) => {
        const p = new Promise<void>((resolve) => {
          timers.push(
            setTimeout(() => {
              setTyped((prev) => [...prev, ""]);
              typeLine(line.text, resolve);
            }, line.at)
          );
        });
        seq.push(p);
      });

      Promise.all(seq).then(() => {
        timers.push(
          setTimeout(() => {
            if (alive) setTyped([]);
            runCycle();
          }, CYCLE - 7800 + 1500)
        );
      });
    };

    runCycle();
    return () => {
      alive = false;
      timers.forEach(clearTimeout);
    };
  }, []);

  return (
    <div className="rounded-xl border border-border bg-card/70 backdrop-blur-sm shadow-[0_24px_60px_rgba(0,0,0,0.35)] overflow-hidden text-left">
      <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-border bg-secondary/60">
        <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
        <span className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
        <span className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
        <span className="ml-2 text-[10px] font-mono text-muted-foreground">barkcli — dev.board</span>
      </div>
      <div className="p-4 font-mono text-[12.5px] leading-6 min-h-[120px]">
        {typed.map((t, i) => (
          <div key={`${i}-${t.length}`} className="whitespace-pre-wrap break-all">
            <span className="text-muted-foreground select-none">$ </span>
            <span className={i === 2 ? "text-[#28c840]" : "text-foreground"}>{t}</span>
            {i === typed.length - 1 && <span className="bark-caret text-foreground">▍</span>}
          </div>
        ))}
        {typed.length === 0 && <span className="bark-caret text-foreground">▍</span>}
        <div className="mt-2 text-[10.5px] text-muted-foreground/70 select-none">
          # 4 columns · 3 cards · git diff shows every change
        </div>
      </div>
    </div>
  );
}

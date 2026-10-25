"use client";

import { useMemo, useState } from "react";

interface BenchJson {
  repo?: string;
  cold_tokens?: number;
  warm_tokens?: number;
  warm_available?: boolean;
  cold_listing_tokens?: number;
  cold_locate_tokens?: number;
  cold_read_tokens?: number;
}

const SAMPLE = `{
  "repo": "barkcli",
  "cold_tokens": 29402,
  "cold_listing_tokens": 18965,
  "cold_locate_tokens": 298,
  "cold_read_tokens": 10139,
  "warm_tokens": 515,
  "warm_available": true
}`;

export function BenchmarkPlayground() {
  const [raw, setRaw] = useState("");
  const parsed = useMemo((): { data?: BenchJson; error?: string } => {
    if (!raw.trim()) return {};
    try {
      const j = JSON.parse(raw) as BenchJson;
      if (typeof j.cold_tokens !== "number") {
        return { error: "missing cold_tokens — is this benchmark --json output?" };
      }
      return { data: j };
    } catch (e) {
      return { error: `invalid JSON: ${(e as Error).message.slice(0, 80)}` };
    }
  }, [raw]);

  const ratio =
    parsed.data && parsed.data.warm_tokens && parsed.data.warm_available
      ? parsed.data.cold_tokens! / parsed.data.warm_tokens
      : null;

  const parts = parsed.data
    ? [
        { label: "listing", n: parsed.data.cold_listing_tokens },
        { label: "reading", n: parsed.data.cold_read_tokens },
        { label: "locating", n: parsed.data.cold_locate_tokens },
      ].filter((p): p is { label: string; n: number } => typeof p.n === "number")
    : [];
  const coldTotal = parsed.data?.cold_tokens ?? 0;

  return (
    <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-6 mt-6">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-mono text-white/40">paste `--json` output (client-side only)</span>
        <span className="flex gap-3">
          <button
            onClick={() => navigator.clipboard?.writeText("barkcli context benchmark --json")}
            className="text-[10px] font-mono text-white/30 hover:text-white/60 transition-colors"
          >
            copy command
          </button>
          <button
            onClick={() => setRaw(SAMPLE)}
            className="text-[10px] font-mono text-[#B8845C]/70 hover:text-[#B8845C] transition-colors"
          >
            use the barkcli sample
          </button>
        </span>
      </div>
      <textarea
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        placeholder='{"cold_tokens": 29402, …}'
        spellCheck={false}
        rows={5}
        className="w-full bg-black/50 border border-white/10 rounded-xl p-4 text-xs font-mono text-white/80 outline-none focus:border-[#B8845C]/40 transition-colors resize-none"
      />
      {parsed.error && <p className="text-red-400/80 text-xs mt-2 font-mono">{parsed.error}</p>}

      {parsed.data && (
        <div className="mt-5 space-y-4">
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
            <div className="text-4xl font-bold text-[#B8845C] font-mono">
              {ratio ? `${ratio.toFixed(1)}×` : "—"}
            </div>
            <div className="text-white/40 text-xs">
              cold {coldTotal.toLocaleString()} tk vs{" "}
              {parsed.data.warm_available ? `warm ${parsed.data.warm_tokens} tk` : "no context file yet"}
            </div>
            {parsed.data.repo && (
              <div className="text-white/30 text-xs font-mono ml-auto">{parsed.data.repo}</div>
            )}
          </div>
          {parts.length > 0 && (
            <div className="space-y-2">
              {parts.map((p) => (
                <div key={p.label} className="flex items-center gap-3">
                  <span className="text-[10px] font-mono text-white/40 w-16 shrink-0">{p.label}</span>
                  <div className="h-4 flex-1 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-[#B8845C]/70 to-[#D4A574]/70 rounded-full"
                      style={{ width: `${Math.max((p.n / coldTotal) * 100, 1)}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-mono text-white/50 w-20 text-right shrink-0">
                    ~{p.n.toLocaleString()}
                  </span>
                </div>
              ))}
              <div className="flex items-center gap-3 pt-2 border-t border-white/5">
                <span className="text-[10px] font-mono text-[#D4A574] w-16 shrink-0">warm</span>
                <div className="h-4 flex-1 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#D4A574]/60 rounded-full"
                    style={{
                      width: `${ratio ? Math.max((100 / ratio), 1.6) : 2}%`,
                    }}
                  />
                </div>
                <span className="text-[10px] font-mono text-white/50 w-20 text-right shrink-0">
                  ~{(parsed.data.warm_tokens ?? 0).toLocaleString()}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

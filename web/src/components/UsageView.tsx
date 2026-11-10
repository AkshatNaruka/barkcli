import React, { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  fetchUsage,
  type DailyUsage,
  type ModelUsage,
  type ProviderLimit,
  type ProviderUsage,
  type UsageData,
} from "../lib/api";
import { Icon } from "./Icon";
import { ProviderIcon } from "./ProviderIcon";
import { ChartContainer, ChartTooltip } from "./charts";

export type WindowFilter = "24h" | "7d" | "30d" | "all";
export type MetricMode = "tokens" | "cost";

const SAMPLE_USAGE: UsageData = {
  summary: {
    total_tokens: 1485600,
    input_tokens: 1045200,
    output_tokens: 148400,
    cached_input_tokens: 292000,
    cache_hit_rate: 0.218,
    total_cost_usd: 5.48,
    standard_cost_usd: 4.92,
    premium_cost_usd: 0.56,
    total_runs: 46,
    active_providers: 4,
    active_models: 5,
  },
  models: [
    {
      model: "claude-3-7-sonnet",
      provider: "claude-code",
      input_tokens: 580000,
      output_tokens: 72000,
      cached_input_tokens: 180000,
      cache_hit_rate: 0.237,
      cost_usd: 2.87,
      cost_per_million_input: 3.0,
      cost_per_million_output: 15.0,
      runs_count: 22,
    },
    {
      model: "gpt-4o",
      provider: "codex",
      input_tokens: 240000,
      output_tokens: 38000,
      cached_input_tokens: 65000,
      cache_hit_rate: 0.213,
      cost_usd: 1.06,
      cost_per_million_input: 2.5,
      cost_per_million_output: 10.0,
      runs_count: 11,
    },
    {
      model: "deepseek-coder",
      provider: "opencode",
      input_tokens: 145000,
      output_tokens: 24000,
      cached_input_tokens: 32000,
      cache_hit_rate: 0.181,
      cost_usd: 0.03,
      cost_per_million_input: 0.14,
      cost_per_million_output: 0.28,
      runs_count: 8,
    },
    {
      model: "gemini-2.5-flash",
      provider: "antigravity",
      input_tokens: 60200,
      output_tokens: 11400,
      cached_input_tokens: 15000,
      cache_hit_rate: 0.199,
      cost_usd: 0.05,
      cost_per_million_input: 0.15,
      cost_per_million_output: 0.6,
      runs_count: 4,
    },
    {
      model: "claude-3-5-haiku",
      provider: "claude-code",
      input_tokens: 20000,
      output_tokens: 3000,
      cached_input_tokens: 0,
      cache_hit_rate: 0.0,
      cost_usd: 0.03,
      cost_per_million_input: 0.8,
      cost_per_million_output: 4.0,
      runs_count: 1,
    },
  ],
  providers: [
    {
      provider: "claude-code",
      label: "Claude Code",
      input_tokens: 600000,
      output_tokens: 75000,
      cached_input_tokens: 180000,
      cost_usd: 2.9,
      runs_count: 23,
      status: "ready",
    },
    {
      provider: "codex",
      label: "Codex",
      input_tokens: 240000,
      output_tokens: 38000,
      cached_input_tokens: 65000,
      cost_usd: 1.06,
      runs_count: 11,
      status: "ready",
    },
    {
      provider: "opencode",
      label: "OpenCode",
      input_tokens: 145000,
      output_tokens: 24000,
      cached_input_tokens: 32000,
      cost_usd: 0.03,
      runs_count: 8,
      status: "ready",
    },
    {
      provider: "antigravity",
      label: "Antigravity",
      input_tokens: 60200,
      output_tokens: 11400,
      cached_input_tokens: 15000,
      cost_usd: 0.05,
      runs_count: 4,
      status: "ready",
    },
  ],
  daily: [
    { date: "2026-10-28", tokens: 185000, input_tokens: 135000, output_tokens: 20000, cached_input_tokens: 30000, cost_usd: 0.68 },
    { date: "2026-10-29", tokens: 240000, input_tokens: 170000, output_tokens: 25000, cached_input_tokens: 45000, cost_usd: 0.88 },
    { date: "2026-10-30", tokens: 195000, input_tokens: 140000, output_tokens: 18000, cached_input_tokens: 37000, cost_usd: 0.72 },
    { date: "2026-10-31", tokens: 310000, input_tokens: 220000, output_tokens: 31000, cached_input_tokens: 59000, cost_usd: 1.15 },
    { date: "2026-11-01", tokens: 225000, input_tokens: 160000, output_tokens: 23000, cached_input_tokens: 42000, cost_usd: 0.84 },
    { date: "2026-11-02", tokens: 175600, input_tokens: 125200, output_tokens: 17400, cached_input_tokens: 33000, cost_usd: 0.65 },
    { date: "2026-11-03", tokens: 155000, input_tokens: 95000, output_tokens: 14000, cached_input_tokens: 46000, cost_usd: 0.56 },
  ],
  limits: [
    {
      provider: "opencode",
      label: "OpenCode",
      limit_type: "Tokens / min",
      used: 18400,
      limit: 120000,
      resets_in: "45s",
      pace: "under",
      status: "ready",
    },
    {
      provider: "claude-code",
      label: "Claude Code",
      limit_type: "5-hour allowance",
      used: 680000,
      limit: 2500000,
      resets_in: "2h 15m",
      pace: "on",
      status: "ready",
    },
    {
      provider: "codex",
      label: "Codex",
      limit_type: "Daily token quota",
      used: 45000,
      limit: 1000000,
      resets_in: "12h 40m",
      pace: "under",
      status: "ready",
    },
    {
      provider: "antigravity",
      label: "Antigravity",
      limit_type: "Session throughput",
      used: 250000,
      limit: 5000000,
      resets_in: "Continuous",
      pace: "under",
      status: "ready",
    },
  ],
};

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString();
}

function formatUsd(n: number): string {
  return `$${n.toFixed(2)}`;
}

export function UsageView() {
  const [windowFilter, setWindowFilter] = useState<WindowFilter>("30d");
  const [metricMode, setMetricMode] = useState<MetricMode>("tokens");
  const [liveData, setLiveData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(false);
  const [showSample, setShowSample] = useState(false);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"tokens" | "cost" | "name">("tokens");
  const [priceOverridesOpen, setPriceOverridesOpen] = useState(false);
  const [hoveredBar, setHoveredBar] = useState<DailyUsage | null>(null);

  const loadUsage = async () => {
    setLoading(true);
    try {
      const data = await fetchUsage(windowFilter);
      setLiveData(data);
    } catch {
      // fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadUsage();
  }, [windowFilter]);

  // Determine active data set
  const data = useMemo(() => {
    const isLiveEmpty = !liveData || liveData.summary.total_runs === 0;
    if (showSample || isLiveEmpty) {
      return SAMPLE_USAGE;
    }
    return liveData;
  }, [liveData, showSample]);

  const isSimulated = !liveData || liveData.summary.total_runs === 0 || showSample;

  // Filtered & sorted models
  const displayedModels = useMemo(() => {
    const list = [...data.models];
    const q = search.trim().toLowerCase();
    const filtered = q
      ? list.filter(
          (m) =>
            m.model.toLowerCase().includes(q) ||
            m.provider.toLowerCase().includes(q)
        )
      : list;

    filtered.sort((a, b) => {
      if (sortBy === "tokens") {
        return (
          b.input_tokens +
          b.output_tokens +
          b.cached_input_tokens -
          (a.input_tokens + a.output_tokens + a.cached_input_tokens)
        );
      }
      if (sortBy === "cost") {
        return b.cost_usd - a.cost_usd;
      }
      return a.model.localeCompare(b.model);
    });
    return filtered;
  }, [data.models, search, sortBy]);

  // Max daily tokens for relative bar sizing
  const maxDailyValue = useMemo(() => {
    return Math.max(
      ...data.daily.map((d) =>
        metricMode === "tokens" ? d.tokens : Math.round(d.cost_usd * 100)
      ),
      1
    );
  }, [data.daily, metricMode]);

  // Token breakdown shares
  const tokenShares = useMemo(() => {
    const total = data.summary.total_tokens || 1;
    return {
      inputPct: Math.round((data.summary.input_tokens / total) * 100),
      outputPct: Math.round((data.summary.output_tokens / total) * 100),
      cachePct: Math.round((data.summary.cached_input_tokens / total) * 100),
    };
  }, [data.summary]);

  return (
    <div className="h-full overflow-y-auto bg-bg p-6 text-text">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Header & Controls */}
        <header className="flex flex-col gap-4 border-b border-border/80 pb-5 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-soft text-accent">
                <Icon name="chart" size={18} />
              </span>
              <h1 className="text-xl font-bold tracking-tight">Usage & Limits</h1>
            </div>
            <p className="mt-1 text-xs text-muted">
              Global token consumption, cache savings, model breakdowns, and estimated
              API-equivalent cost across all agents.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Time Window Buttons */}
            <div className="flex rounded-lg border border-border bg-card/60 p-0.5 text-xs">
              {(
                [
                  { id: "24h", label: "24h" },
                  { id: "7d", label: "7d" },
                  { id: "30d", label: "30d" },
                  { id: "all", label: "All time" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setWindowFilter(opt.id)}
                  className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                    windowFilter === opt.id
                      ? "bg-accent text-white shadow-sm"
                      : "text-muted hover:text-text"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Metric Mode Toggle */}
            <div className="flex rounded-lg border border-border bg-card/60 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setMetricMode("tokens")}
                className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                  metricMode === "tokens"
                    ? "bg-surface text-text shadow-sm"
                    : "text-muted hover:text-text"
                }`}
              >
                Tokens
              </button>
              <button
                type="button"
                onClick={() => setMetricMode("cost")}
                className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                  metricMode === "cost"
                    ? "bg-surface text-text shadow-sm"
                    : "text-muted hover:text-text"
                }`}
              >
                Cost ($)
              </button>
            </div>

            {/* Refresh */}
            <button
              type="button"
              onClick={() => void loadUsage()}
              disabled={loading}
              title="Rescan session history and recalculate"
              className="bark-button flex items-center gap-1.5 text-xs"
            >
              <span className={loading ? "animate-spin" : ""}>
                <Icon name="refresh" size={13} />
              </span>
              Refresh
            </button>
          </div>
        </header>

        {/* Notice for Demo / Simulated Mode */}
        {isSimulated && (
          <div className="flex items-center justify-between rounded-lg border border-border/70 bg-card/40 px-4 py-2.5 text-xs">
            <div className="flex items-center gap-2">
              <Icon name="spark" size={14} className="text-accent" />
              <span>
                {liveData && liveData.summary.total_runs > 0 && showSample
                  ? "Displaying sample telemetry data."
                  : "No prior runs with recorded tokens found in this workspace. Displaying sample agent analytics."}
              </span>
            </div>
            {liveData && liveData.summary.total_runs > 0 && (
              <button
                type="button"
                onClick={() => setShowSample(!showSample)}
                className="text-xs font-medium text-accent hover:underline"
              >
                {showSample ? "Switch to Live" : "View Sample"}
              </button>
            )}
          </div>
        )}

        {/* 4 Summary Metric Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Card 1: Total Tokens */}
          <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
            <div className="flex items-center justify-between text-xs text-muted">
              <span>Total Tokens</span>
              <Icon name="cycle" size={14} className="text-muted/60" />
            </div>
            <div className="mt-2 text-2xl font-bold font-mono tracking-tight text-text">
              {data.summary.total_tokens.toLocaleString()}
            </div>
            <div className="mt-2.5 flex items-center gap-2 font-mono text-[11px] text-muted">
              <span title="Uncached prompt tokens">In: {formatTokens(data.summary.input_tokens)}</span>
              <span>·</span>
              <span title="Generated response tokens">Out: {formatTokens(data.summary.output_tokens)}</span>
              <span>·</span>
              <span title="Cached prompt tokens" className="text-emerald-500 font-medium">
                Cache: {formatTokens(data.summary.cached_input_tokens)}
              </span>
            </div>
          </div>

          {/* Card 2: Cache Savings */}
          <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
            <div className="flex items-center justify-between text-xs text-muted">
              <span>Cache Savings</span>
              <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-500">
                Hit Rate
              </span>
            </div>
            <div className="mt-2 text-2xl font-bold font-mono tracking-tight text-emerald-500">
              {(data.summary.cache_hit_rate * 100).toFixed(1)}%
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-border/60">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(5, data.summary.cache_hit_rate * 100))}%` }}
              />
            </div>
            <div className="mt-2 text-[11px] text-muted">
              {formatTokens(data.summary.cached_input_tokens)} tokens read from cache
            </div>
          </div>

          {/* Card 3: Estimated Cost */}
          <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
            <div className="flex items-center justify-between text-xs text-muted">
              <span>Estimated Cost</span>
              <Icon name="chart" size={14} className="text-muted/60" />
            </div>
            <div className="mt-2 text-2xl font-bold font-mono tracking-tight text-text">
              {formatUsd(data.summary.total_cost_usd)}
            </div>
            <div className="mt-2.5 flex items-center gap-2 font-mono text-[11px] text-muted">
              <span>Std: {formatUsd(data.summary.standard_cost_usd)}</span>
              <span>·</span>
              <span>Premium: {formatUsd(data.summary.premium_cost_usd)}</span>
            </div>
            <div className="mt-1 text-[10px] text-muted/70">
              API-equivalent rates, not your subscription bill
            </div>
          </div>

          {/* Card 4: Agent Activity */}
          <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
            <div className="flex items-center justify-between text-xs text-muted">
              <span>Agent Activity</span>
              <Icon name="robot" size={14} className="text-muted/60" />
            </div>
            <div className="mt-2 text-2xl font-bold font-mono tracking-tight text-text">
              {data.summary.total_runs} <span className="text-sm font-normal text-muted">runs</span>
            </div>
            <div className="mt-2.5 flex items-center gap-2 text-[11px] text-muted">
              <span>{data.summary.active_models} models</span>
              <span>·</span>
              <span>{data.summary.active_providers} providers</span>
            </div>
            <div className="mt-1 text-[10px] text-muted/70">
              Includes CLI runs, review gates, and subagents
            </div>
          </div>
        </div>

        {/* Share Distribution Bar */}
        <section className="rounded-xl border border-border bg-surface p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
              {metricMode === "tokens" ? "Token Distribution" : "Cost Distribution"}
            </h3>
            <span className="text-xs font-mono text-muted">
              {metricMode === "tokens"
                ? `${formatTokens(data.summary.total_tokens)} total`
                : `${formatUsd(data.summary.total_cost_usd)} estimated`}
            </span>
          </div>

          {/* Progress Bar Segments */}
          <div className="flex h-3 w-full overflow-hidden rounded-md bg-card/60 p-0.5 border border-border">
            {metricMode === "tokens" ? (
              <>
                <div
                  className="h-full bg-blue-500 rounded-l transition-all"
                  style={{ width: `${tokenShares.inputPct}%` }}
                  title={`Input tokens: ${data.summary.input_tokens.toLocaleString()} (${tokenShares.inputPct}%)`}
                />
                <div
                  className="h-full bg-emerald-500 transition-all"
                  style={{ width: `${tokenShares.cachePct}%` }}
                  title={`Cached input: ${data.summary.cached_input_tokens.toLocaleString()} (${tokenShares.cachePct}%)`}
                />
                <div
                  className="h-full bg-purple-500 rounded-r transition-all"
                  style={{ width: `${tokenShares.outputPct}%` }}
                  title={`Output tokens: ${data.summary.output_tokens.toLocaleString()} (${tokenShares.outputPct}%)`}
                />
              </>
            ) : (
              <>
                <div
                  className="h-full bg-indigo-500 rounded-l transition-all"
                  style={{ width: "90%" }}
                  title={`Standard cost: ${formatUsd(data.summary.standard_cost_usd)} (90%)`}
                />
                <div
                  className="h-full bg-amber-500 rounded-r transition-all"
                  style={{ width: "10%" }}
                  title={`Fast/Premium tier: ${formatUsd(data.summary.premium_cost_usd)} (10%)`}
                />
              </>
            )}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-4 text-xs">
            {metricMode === "tokens" ? (
              <>
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
                  <span className="text-muted">Input ({tokenShares.inputPct}%):</span>
                  <span className="font-mono">{formatTokens(data.summary.input_tokens)}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  <span className="text-muted">Cache Read ({tokenShares.cachePct}%):</span>
                  <span className="font-mono text-emerald-500 font-medium">
                    {formatTokens(data.summary.cached_input_tokens)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-purple-500" />
                  <span className="text-muted">Output ({tokenShares.outputPct}%):</span>
                  <span className="font-mono">{formatTokens(data.summary.output_tokens)}</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-indigo-500" />
                  <span className="text-muted">Standard API rate (90%):</span>
                  <span className="font-mono">{formatUsd(data.summary.standard_cost_usd)}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                  <span className="text-muted">Fast & Reasoning tier (10%):</span>
                  <span className="font-mono">{formatUsd(data.summary.premium_cost_usd)}</span>
                </div>
              </>
            )}
          </div>
        </section>

        {/* Daily Usage Chart + Provider Share (Recharts Analytics) */}
        <div className="grid gap-6 lg:grid-cols-3">
          <section className="lg:col-span-2 rounded-xl border border-border bg-surface p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
                  Activity Timeline
                </h3>
                <p className="text-[11px] text-muted">
                  {metricMode === "tokens"
                    ? "Stacked input, cached prompt, and output tokens per day"
                    : "Estimated API-equivalent cost ($) per day"}
                </p>
              </div>
              {hoveredBar && (
                <div className="rounded-lg border border-border bg-card px-2.5 py-1 font-mono text-xs shadow-md">
                  <span className="text-muted">{hoveredBar.date}: </span>
                  <span className="font-bold text-text">
                    {metricMode === "tokens"
                      ? `${hoveredBar.tokens.toLocaleString()} tokens`
                      : formatUsd(hoveredBar.cost_usd)}
                  </span>
                </div>
              )}
            </div>

            <div className="h-56 w-full" data-testid="usage-activity-rechart">
              <ResponsiveContainer
                width="100%"
                height="100%"
                initialDimension={{ width: 640, height: 220 }}
              >
                {metricMode === "tokens" ? (
                  <AreaChart
                    data={data.daily.map((d) => ({
                      ...d,
                      shortDate: d.date.slice(5),
                    }))}
                    margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="gradInput" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="gradCache" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="gradOutput" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#a855f7" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#a855f7" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                    <XAxis
                      dataKey="shortDate"
                      tick={{ fill: "#8b93a7", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tickFormatter={(v: number) => formatTokens(v)}
                      tick={{ fill: "#8b93a7", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      width={48}
                    />
                    <Tooltip
                      cursor={{ stroke: "rgba(255, 255, 255, 0.15)", strokeWidth: 1, strokeDasharray: "3 3" }}
                      contentStyle={{
                        backgroundColor: "#12141a",
                        borderColor: "rgba(255,255,255,0.12)",
                        borderRadius: "10px",
                        fontSize: "11px",
                        color: "#f3f4f6",
                      }}
                      formatter={(value: unknown, name: unknown) => [
                        typeof value === "number" ? value.toLocaleString() : String(value ?? ""),
                        String(name ?? ""),
                      ]}
                    />
                    <Area
                      type="monotone"
                      dataKey="input_tokens"
                      name="Input"
                      stackId="1"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      fill="url(#gradInput)"
                    />
                    <Area
                      type="monotone"
                      dataKey="cached_input_tokens"
                      name="Cached"
                      stackId="1"
                      stroke="#10b981"
                      strokeWidth={2}
                      fill="url(#gradCache)"
                    />
                    <Area
                      type="monotone"
                      dataKey="output_tokens"
                      name="Output"
                      stackId="1"
                      stroke="#a855f7"
                      strokeWidth={2}
                      fill="url(#gradOutput)"
                    />
                  </AreaChart>
                ) : (
                  <BarChart
                    data={data.daily.map((d) => ({
                      ...d,
                      shortDate: d.date.slice(5),
                    }))}
                    margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                    <XAxis
                      dataKey="shortDate"
                      tick={{ fill: "#8b93a7", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tickFormatter={(v: number) => `$${v.toFixed(2)}`}
                      tick={{ fill: "#8b93a7", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      width={48}
                    />
                    <Tooltip
                      cursor={{ fill: "rgba(255, 255, 255, 0.04)", rx: 8 }}
                      contentStyle={{
                        backgroundColor: "#12141a",
                        borderColor: "rgba(255,255,255,0.12)",
                        borderRadius: "10px",
                        fontSize: "11px",
                        color: "#f3f4f6",
                      }}
                      formatter={(value: unknown) => [
                        typeof value === "number" ? formatUsd(value) : String(value ?? ""),
                        "Est. Cost",
                      ]}
                    />
                    <Bar dataKey="cost_usd" name="Cost ($)" fill="#6366f1" radius={[6, 6, 0, 0]} />
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
          </section>

          {/* Provider Share Donut Chart */}
          <section className="rounded-xl border border-border bg-surface p-5 shadow-sm space-y-4">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
                Provider Share
              </h3>
              <p className="text-[11px] text-muted">
                Distribution across agent runtimes
              </p>
            </div>
            <div className="h-44 w-full" data-testid="usage-provider-pie">
              <ResponsiveContainer
                width="100%"
                height="100%"
                initialDimension={{ width: 260, height: 176 }}
              >
                <PieChart>
                  <Pie
                    data={data.providers.map((p) => ({
                      name: p.label,
                      value:
                        metricMode === "tokens"
                          ? p.input_tokens + p.output_tokens + p.cached_input_tokens
                          : Number(p.cost_usd.toFixed(2)),
                    }))}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={42}
                    outerRadius={68}
                    paddingAngle={3}
                  >
                    {data.providers.map((p, idx) => {
                      const palette = ["#6366f1", "#10b981", "#f59e0b", "#ec4899", "#3b82f6"];
                      return <Cell key={p.provider} fill={palette[idx % palette.length]} />;
                    })}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#14171f",
                      borderColor: "rgba(255,255,255,0.12)",
                      borderRadius: "10px",
                      fontSize: "11px",
                      color: "#f3f4f6",
                    }}
                    formatter={(value: unknown) => [
                      typeof value === "number"
                        ? metricMode === "tokens"
                          ? `${formatTokens(value)} tokens`
                          : formatUsd(value)
                        : String(value ?? ""),
                      metricMode === "tokens" ? "Tokens" : "Cost",
                    ]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-1.5 text-xs">
              {data.providers.map((p, idx) => {
                const palette = ["#6366f1", "#10b981", "#f59e0b", "#ec4899", "#3b82f6"];
                const totalP = p.input_tokens + p.output_tokens + p.cached_input_tokens;
                return (
                  <div key={p.provider} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: palette[idx % palette.length] }}
                      />
                      <span className="text-text font-medium">
                        {p.label} ({p.runs_count} runs)
                      </span>
                    </div>
                    <span className="font-mono text-muted">
                      {metricMode === "tokens" ? formatTokens(totalP) : formatUsd(p.cost_usd)}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        {/* Model Breakdown Table */}
        <section className="rounded-xl border border-border bg-surface p-5 shadow-sm space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
                Model Breakdown
              </h3>
              <p className="text-[11px] text-muted">
                Per-model token consumption, cache hit rate, and unit rates
              </p>
            </div>

            <div className="flex items-center gap-2">
              {/* Search Box */}
              <div className="relative">
                <input
                  type="text"
                  placeholder="Filter models or providers…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="bark-input h-7 pl-7 pr-2 text-xs w-48"
                />
                <span className="absolute left-2 top-1.5 text-muted pointer-events-none">
                  <Icon name="search" size={12} />
                </span>
              </div>

              {/* Sort selector */}
              <div className="flex rounded-md border border-border bg-card p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setSortBy("tokens")}
                  className={`rounded px-2 py-0.5 font-medium ${
                    sortBy === "tokens" ? "bg-surface text-text" : "text-muted"
                  }`}
                >
                  Tokens
                </button>
                <button
                  type="button"
                  onClick={() => setSortBy("cost")}
                  className={`rounded px-2 py-0.5 font-medium ${
                    sortBy === "cost" ? "bg-surface text-text" : "text-muted"
                  }`}
                >
                  Cost
                </button>
                <button
                  type="button"
                  onClick={() => setSortBy("name")}
                  className={`rounded px-2 py-0.5 font-medium ${
                    sortBy === "name" ? "bg-surface text-text" : "text-muted"
                  }`}
                >
                  Name
                </button>
              </div>

              {/* Price Overrides Button */}
              <button
                type="button"
                onClick={() => setPriceOverridesOpen(!priceOverridesOpen)}
                className="bark-button text-xs h-7"
                title="Customize USD pricing rates for models"
              >
                Model Prices
              </button>
            </div>
          </div>

          {/* Price Overrides Collapsible Drawer */}
          {priceOverridesOpen && (
            <div className="rounded-lg border border-border bg-card/60 p-4 text-xs space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-text">Custom Model Price Overrides</span>
                <button
                  type="button"
                  onClick={() => setPriceOverridesOpen(false)}
                  className="text-muted hover:text-text"
                >
                  <Icon name="x" size={14} />
                </button>
              </div>
              <p className="text-muted text-[11px]">
                Override default rates per million tokens. Blank fields fall back to default public pricing.
              </p>
              <div className="grid gap-2 sm:grid-cols-4 font-mono text-[11px]">
                <div className="p-2 border border-border rounded bg-surface">
                  <div className="text-text font-bold">Claude 3.7 Sonnet</div>
                  <div className="text-muted mt-1">$3.00/M in · $15.00/M out</div>
                </div>
                <div className="p-2 border border-border rounded bg-surface">
                  <div className="text-text font-bold">GPT-4o</div>
                  <div className="text-muted mt-1">$2.50/M in · $10.00/M out</div>
                </div>
                <div className="p-2 border border-border rounded bg-surface">
                  <div className="text-text font-bold">DeepSeek V3 / R1</div>
                  <div className="text-muted mt-1">$0.14/M in · $0.28/M out</div>
                </div>
                <div className="p-2 border border-border rounded bg-surface">
                  <div className="text-text font-bold">Gemini 2.5 Flash</div>
                  <div className="text-muted mt-1">$0.15/M in · $0.60/M out</div>
                </div>
              </div>
            </div>
          )}

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border/70 text-[11px] text-muted">
                  <th className="pb-2.5 font-medium">Provider & Model</th>
                  <th className="pb-2.5 font-medium text-right">Total Tokens</th>
                  <th className="pb-2.5 font-medium text-right">Input</th>
                  <th className="pb-2.5 font-medium text-right">Output</th>
                  <th className="pb-2.5 font-medium text-right">Cache Hit %</th>
                  <th className="pb-2.5 font-medium text-right">Rate ($/M)</th>
                  <th className="pb-2.5 font-medium text-right">Est. Cost</th>
                  <th className="pb-2.5 font-medium text-right">Runs</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40 font-mono">
                {displayedModels.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-6 text-center text-muted font-sans">
                      No models matching “{search}”
                    </td>
                  </tr>
                ) : (
                  displayedModels.map((m) => {
                    const totalM = m.input_tokens + m.output_tokens + m.cached_input_tokens;
                    return (
                      <tr key={`${m.provider}-${m.model}`} className="hover:bg-card/40 transition-colors">
                        <td className="py-2.5 font-sans">
                          <div className="flex items-center gap-2">
                            <ProviderIcon id={m.provider} name={m.provider} size={15} />
                            <div className="min-w-0">
                              <span className="font-semibold text-text">{m.model}</span>
                              <span className="ml-1.5 text-[10px] text-muted">({m.provider})</span>
                            </div>
                          </div>
                        </td>
                        <td className="py-2.5 text-right font-medium text-text">
                          {totalM.toLocaleString()}
                        </td>
                        <td className="py-2.5 text-right text-muted">
                          {formatTokens(m.input_tokens)}
                        </td>
                        <td className="py-2.5 text-right text-muted">
                          {formatTokens(m.output_tokens)}
                        </td>
                        <td className="py-2.5 text-right">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                              m.cache_hit_rate > 0.2
                                ? "bg-emerald-500/10 text-emerald-500"
                                : m.cache_hit_rate > 0
                                  ? "bg-blue-500/10 text-blue-500"
                                  : "text-muted"
                            }`}
                          >
                            {(m.cache_hit_rate * 100).toFixed(1)}%
                          </span>
                        </td>
                        <td className="py-2.5 text-right text-muted text-[11px]">
                          ${m.cost_per_million_input.toFixed(1)} / ${m.cost_per_million_output.toFixed(1)}
                        </td>
                        <td className="py-2.5 text-right font-bold text-text">
                          {formatUsd(m.cost_usd)}
                        </td>
                        <td className="py-2.5 text-right text-muted">{m.runs_count}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Provider Limits & Quotas */}
        <section className="rounded-xl border border-border bg-surface p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
                Provider Limits & Headroom
              </h3>
              <p className="text-[11px] text-muted">
                Live rate limits, rolling allowances, and quota pacing for configured agent CLIs
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-emerald-500" /> Under pace
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-amber-500" /> On pace
              </span>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {data.limits.map((lim) => {
              const pct = lim.limit > 0 ? Math.min(100, Math.round((lim.used / lim.limit) * 100)) : 0;
              const paceColor =
                lim.pace === "under"
                  ? "text-emerald-500"
                  : lim.pace === "ahead"
                    ? "text-rose-500"
                    : "text-amber-500";
              const barColor =
                lim.pace === "under"
                  ? "bg-emerald-500"
                  : lim.pace === "ahead"
                    ? "bg-rose-500"
                    : "bg-amber-500";

              return (
                <div
                  key={lim.provider}
                  className="rounded-lg border border-border/80 bg-card/60 p-3.5 space-y-2.5"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ProviderIcon id={lim.provider} name={lim.label} size={16} />
                      <span className="text-xs font-bold text-text">{lim.label}</span>
                    </div>
                    <span
                      className={`text-[9.5px] font-mono uppercase px-1.5 py-0.5 rounded ${
                        lim.status === "ready"
                          ? "bg-emerald-500/10 text-emerald-500"
                          : "bg-muted/10 text-muted"
                      }`}
                    >
                      {lim.status}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted">{lim.limit_type}</span>
                    <span className={`font-mono text-[10px] font-medium capitalize ${paceColor}`}>
                      {lim.pace} pace
                    </span>
                  </div>

                  {/* Usage meter */}
                  <div className="h-2 w-full overflow-hidden rounded-full bg-border/60">
                    <div
                      className={`h-full rounded-full transition-all ${barColor}`}
                      style={{ width: `${Math.max(4, pct)}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between font-mono text-[10.5px] text-muted">
                    <span>
                      {formatTokens(lim.used)} / {formatTokens(lim.limit)}
                    </span>
                    <span className="text-[10px]">{lim.resets_in}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

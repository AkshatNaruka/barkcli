export interface Column {
  id: string;
  name: string;
}

export type LinkType = "parent" | "child" | "related" | "blocked-by";

export interface CardLink {
  ty: LinkType;
  target: string;
}

export interface Card {
  id: string;
  title: string;
  description?: string;
  column: string;
  priority: string;
  labels: string[];
  assignee?: string;
  checklist: ChecklistItem[];
  due_date?: string;
  remind_at?: string;
  comments: Comment[];
  blocked_by?: string;
  attachments: string[];
  links: CardLink[];
  acceptance_criteria: string[];
  effort?: number;
  area?: string;
  spec_id?: string;
  pinned: boolean;
  created_at: string;
  updated_at: string;
}

export interface FileRef {
  path: string;
  symbols: string[];
  source: string;
  last_commit?: string;
  status: string;
}

export interface AiSummary {
  summary: string;
  at: string;
  model?: string;
  confidence: number;
  next_steps: string[];
}

export interface CardContext {
  files: FileRef[];
  sessions: string[];
  ai?: AiSummary;
  last_sync_commit?: string;
  last_sync_at?: string;
}

export interface HistoryEntry {
  op: string;
  board: string;
  card: string;
  old_value?: string;
  new_value?: string;
  field?: string;
  at: string;
}

export interface Bundle {
  id: string;
  title: string;
  kind: string;
  status: string;
  branch: string;
  commit_count: number;
  first_sha: string | null;
  last_sha: string | null;
  confidence: number;
  card_id: string | null;
  summary?: string;
  commits?: Array<{ sha: string; subject: string; author: string; date: string }>;
}

export interface SessionEntry {
  id: string;
  agent: string;
  model?: string;
  board: string;
  prompt?: string;
  commit_sha?: string;
  files_touched?: string[];
  summary?: string;
  at: string;
  duration_ms?: number;
}

export interface Sprint {
  name: string;
  start?: string;
  end?: string;
  created_at?: string;
}

export interface ChecklistItem {
  text: string;
  done: boolean;
}

export interface Comment {
  author: string;
  text: string;
  at: string;
}

export interface Board {
  title: string;
  description?: string;
  columns: Column[];
  cards: Card[];
}

export type ViewMode = "board" | "table" | "calendar" | "list";

// ── New types for Phase 1+ features ──

export type MemoryTier = "working" | "short_term" | "long_term" | "external";

export interface MemoryEntry {
  id: string;
  content: string;
  tier: MemoryTier;
  tags: string[];
  source?: string;
  created_at: string;
  last_accessed: string;
  access_count: number;
  importance?: number;
}

export interface ProjectFact {
  fact: string;
  category: string;
  confidence: number;
  sources: string[];
  created_at: string;
}

export type SpecStatus = "draft" | "in-progress" | "implemented" | "verified" | "deprecated";
export type RequirementStatus = "pending" | "in-progress" | "implemented" | "verified" | "failed";

export interface Requirement {
  id: string;
  title: string;
  description?: string;
  status: RequirementStatus;
  acceptance_criteria: string[];
  linked_code: string[];
  linked_tests: string[];
  linked_tasks: string[];
  stale: boolean;
  stale_reason?: string;
  updated_at: string;
}

export interface Spec {
  id: string;
  title: string;
  description?: string;
  status: SpecStatus;
  priority: string;
  requirements: Requirement[];
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface SpecCoverage {
  total_requirements: number;
  implemented: number;
  verified: number;
  stale: number;
  coverage_percent: number;
}

export interface CheckpointEntry {
  kind: string;
  id: string;
  saved_at: string;
}

export interface ValidateBoardResult {
  name: string;
  valid: boolean;
  errors: string[];
}

export interface DoctorBoardResult {
  name: string;
  errors_before: number;
  errors_after: number;
  fixed: string[];
}

export interface DiffCard {
  id: string;
  title: string;
  column: string;
}

export interface DiffMoved {
  id: string;
  title: string;
  from: string;
  to: string;
}

export interface BlameEntry {
  at: string;
  op: string;
}

export interface GitCommit {
  sha: string;
  parents: string[];
  subject: string;
  body: string;
  author: string;
  author_email: string;
  date: string;
  trailers: Array<[string, string]>;
  is_merge: boolean;
  is_empty: boolean;
  files_changed: string[];
  additions: number;
  deletions: number;
  patch_id?: string | null;
}

export interface GitCommitsResponse {
  branch: string;
  branches: string[];
  commits: GitCommit[];
}

export interface GitDiffResponse {
  sha: string;
  message: string;
  diff: string;
  files_changed: string[];
  additions: number;
  deletions: number;
}

export interface AssignCommitRequest {
  board_name?: string;
  commit_sha?: string;
  title: string;
  description?: string;
  column?: string;
  priority?: string;
  agent_id?: string;
  files_context?: string[];
  acceptance_criteria?: string[];
}

export interface AssignCommitResponse {
  card_id: string;
  task_id?: string;
  board_name: string;
  agent_id?: string;
  title: string;
  status: string;
}

export interface AgentItem {
  id: string;
  name: string;
  role: string;
  status: string;
}

export interface ThreadEvent {
  id: string;
  card_id: string;
  thread_id?: string;
  seq?: number;
  run_id?: string;
  turn_id?: string;
  parent_event_id?: string;
  kind: string;
  author: string;
  text: string;
  data?: any;
  created_at: string;
}

export interface ThreadSummary {
  id: string;
  title: string;
  status_group: "needs_you" | "stalled" | "running" | "features" | "settled" | string;
  event_count: number;
  last_event?: ThreadEvent;
  updated_at: string;
  column: string;
  backend?: string;
  /** Newest agent heartbeat / lease / note for this card. */
  last_seen?: string;
}

export interface ThreadDetail {
  id: string;
  card?: Card;
  events: ThreadEvent[];
  runs?: RunRecord[];
}

export type RunStatus =
  | "queued"
  | "starting"
  | "running"
  | "waiting"
  | "needs_review"
  | "passed"
  | "failed"
  | "interrupted"
  | "cancelled"
  | "merged";

export interface RunUsage {
  input_tokens: number;
  output_tokens: number;
  cached_input_tokens?: number;
  cost_usd?: number;
}

export interface RunDiffStats {
  files: number;
  additions: number;
  deletions: number;
}

export interface GateSummary {
  passed: boolean;
  command?: string;
  summary?: string;
  log_path?: string;
  finished_at: string;
}

export interface RunRecord {
  id: string;
  thread_id: string;
  card_id: string;
  ordinal: number;
  parent_run_id?: string;
  provider: string;
  model?: string;
  role?: string;
  agent_id?: string;
  status: RunStatus;
  permission_mode: string;
  cwd?: string;
  worktree?: string;
  branch?: string;
  base_sha?: string;
  head_sha?: string;
  context_manifest_id?: string;
  provider_session_id?: string;
  started_at: string;
  ended_at?: string;
  exit_code?: number;
  diff_stats: RunDiffStats;
  gate?: GateSummary;
  usage: RunUsage;
  error?: string;
}

export interface ProviderCapabilities {
  resume: boolean;
  stream_json: boolean;
  tool_events: boolean;
  approvals: boolean;
  questions: boolean;
  fork: boolean;
  usage: boolean;
  skills: boolean;
  mcp: boolean;
  headless: boolean;
}

export interface ProviderStatus {
  id: string;
  name: string;
  available: boolean;
  version?: string;
  command: string;
  detail?: string;
  capabilities: ProviderCapabilities;
}

export interface RunDiff {
  run_id: string;
  base_sha?: string;
  head_sha?: string;
  branch?: string;
  worktree?: string;
  diff: string;
  files: string[];
  additions: number;
  deletions: number;
}

export interface RunGate {
  run: RunRecord;
  gate?: GateSummary;
  log: string;
}

export interface ContextManifestSection {
  id: string;
  title: string;
  kind: "stable" | "dynamic" | string;
  hash: string;
  tokens: number;
  bytes: number;
}

export interface ContextManifestSkill {
  id: string;
  name: string;
  reason: string;
  source: string;
  hash: string;
  tokens: number;
}

export interface ContextManifestFile {
  path: string;
  hash: string;
  bytes: number;
  tokens: number;
  symbols?: string[];
  reason: string;
}

export interface ContextExclusion {
  path: string;
  reason: string;
}

export interface ContextManifest {
  version: number;
  id: string;
  thread_id: string;
  card_id: string;
  run_id?: string;
  created_at: string;
  head_sha?: string;
  role: string;
  provider: string;
  permission_mode: string;
  sections: ContextManifestSection[];
  skills: ContextManifestSkill[];
  files: ContextManifestFile[];
  exclusions: ContextExclusion[];
  stable_hash: string;
  dynamic_hash: string;
  budget_tokens: number;
  estimated_tokens: number;
}

export interface ContextSection {
  id: string;
  title: string;
  kind: string;
  content: string;
  hash: string;
  tokens: number;
  bytes: number;
  files?: string[];
}

export interface ContextReuse {
  previous_pack_id?: string;
  previous_stable_hash?: string;
  stable_hash: string;
  reused: boolean;
  reason: string;
  invalidations: string[];
  stable_prefix_tokens: number;
  dynamic_tokens: number;
  reused_tokens?: number;
  cache_hits?: number;
  last_invalidation_reason?: string;
  resume_candidate: boolean;
}

export interface ContextPack {
  id: string;
  manifest: ContextManifest;
  sections: ContextSection[];
  stable_prefix: string;
  dynamic_suffix: string;
  prompt: string;
  reuse: ContextReuse;
  tokens: number;
}

export interface RunContext {
  run: RunRecord;
  context: ContextPack | null;
  available: boolean;
}

export type ProfileStatus = "active" | "paused" | "retired";

export interface RoleDef {
  id: string;
  name: string;
  mission: string;
  outputs: string[];
  tools: string[];
  default_skills: string[];
  stop_condition: string;
  writes_code: boolean;
  builtin: boolean;
}

export interface AgentProfile {
  id: string;
  name: string;
  role: string;
  provider: string;
  model?: string;
  capacity: number;
  permission_mode: string;
  skills: string[];
  memory_scope: string;
  status: ProfileStatus;
  prompt?: string;
  created_at?: string;
  updated_at?: string;
}

export type PlanStatus =
  | "draft"
  | "awaiting_approval"
  | "approved"
  | "running"
  | "needs_attention"
  | "completed"
  | "cancelled";

export type PlanTaskStatus =
  | "waiting"
  | "ready"
  | "running"
  | "review"
  | "merged"
  | "failed"
  | "blocked"
  | "cancelled";

export interface PlanQuestion {
  id: string;
  text: string;
  blocking: boolean;
  answer?: string;
}

export interface PlanTask {
  id: string;
  title: string;
  role: string;
  description: string;
  acceptance_criteria: string[];
  files: string[];
  depends_on: string[];
  estimate: string;
  priority: string;
  labels: string[];
  status: PlanTaskStatus;
  card_id?: string;
  agent_id?: string;
  run_id?: string;
  branch?: string;
  worktree?: string;
  previous_run_ids: string[];
  gate_passed: boolean;
  error?: string;
}

export interface ProductPlan {
  id: string;
  board_name: string;
  parent_card_id: string;
  parent_thread_id: string;
  title: string;
  summary: string;
  assumptions: string[];
  questions: PlanQuestion[];
  acceptance_criteria: string[];
  tasks: PlanTask[];
  risks: string[];
  recommended_team: string[];
  first_slice?: string;
  status: PlanStatus;
  source: string;
  created_at: string;
  updated_at: string;
}

export interface TeamMemberView {
  profile: AgentProfile;
  load: number;
  success_rate: number;
  active_task_ids: string[];
}

export interface CapacityView {
  max_parallel: number;
  active_tasks: number;
  available_slots: number;
  active_agents: number;
  team_size: number;
}

export interface MergeTrainItem {
  plan_id: string;
  plan_title: string;
  task_id: string;
  task_title: string;
  run_id: string;
  branch?: string;
  agent_id?: string;
  gate_passed: boolean;
  status: PlanTaskStatus;
}

export interface OrchestraSnapshot {
  board_name: string;
  plans: ProductPlan[];
  team: TeamMemberView[];
  capacity: CapacityView;
  merge_train: MergeTrainItem[];
  pending_approvals: MergeTrainItem[];
  roles: RoleDef[];
}

export interface AssignmentRecommendation {
  agent_id: string;
  name: string;
  role: string;
  score: number;
  available: boolean;
  load: number;
  capacity: number;
  success_rate: number;
  reasons: string[];
}

export interface DispatchReport {
  plan: ProductPlan;
  started: {
    task_id: string;
    title: string;
    run_id: string;
    agent_id: string;
    branch?: string;
  }[];
  waiting: { task_id: string; title: string; reason: string }[];
  active_runs: number;
  max_parallel: number;
}

export interface DiscoveredSkill {
  id: string;
  name: string;
  description: string;
  triggers: string[];
  always: boolean;
  source: string;
  path: string;
  already_installed: boolean;
  enabled: boolean;
}

export interface SessionTranscript {
  id: string;
  status: string;
  lines: string[];
  total_lines: number;
  transcript_path?: string;
}

export interface TaskDiff {
  task_id: string;
  branch: string;
  diff: string;
  files: string[];
}

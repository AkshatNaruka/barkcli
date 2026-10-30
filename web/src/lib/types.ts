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

export interface ChatStart {
  ok: boolean;
  turn_id: string;
  provider: string;
  board: string;
  mode: "ask";
}

export interface ExecResult {
  ok: boolean;
  command: string;
  exit_code: number | null;
  stdout: string;
  stderr: string;
  duration_ms: number;
  timed_out: boolean;
  cwd: string;
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
  /** Kept at the top of the navigator until unpinned. */
  pinned?: boolean;
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
  | "not_verified"
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
  verification?: {
    outcome: "not_run" | "skipped" | "running" | "passed" | "failed" | "error" | "stale";
    tested_head: string;
    target_head: string;
    exit_code?: number;
  };
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
  kind?: ContributionKind;
  title?: string;
  contributes_to?: string[];
  verified_by?: string[];
  verifications?: ContributionVerification[];
  files_touched?: string[];
  author?: string;
  evidence_score?: number;
  summary?: string;
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
  /** Real local auth state; null when the provider cannot be queried. */
  authenticated?: boolean | null;
  /** Official command to sign in (for example `opencode auth login`). */
  auth_command?: string;
  /** Short, truthful state for the UI. */
  auth_hint?: string;
}

export interface ProjectGitState {
  branch: string;
  head: string;
  upstream?: string | null;
  ahead: number;
  behind: number;
  clean: boolean;
  changes: number;
}

export interface ProjectContextState {
  exists: boolean;
  file: string;
  tokens?: number;
  blocks?: number;
  stale_blocks?: number;
  last_run?: string | null;
  budget_tokens?: number;
}

export interface ProjectHooksState {
  opencode: boolean;
  claude_code: boolean;
  spec_sync: boolean;
}

export interface ProjectSetupState {
  board: boolean;
  context: boolean;
  team: boolean;
  hooks: boolean;
  complete: boolean;
}

export interface ProjectCounts {
  cards: number;
  done: number;
  doing: number;
  specs: number;
  sessions: number;
  agents: number;
}

export interface RunCommand {
  id: string;
  label: string;
  command: string;
}

export interface Rule {
  title: string;
  body: string;
}

export interface ScheduleEntry {
  id: string;
  intent: string;
  board: string;
  backend: string;
  every_secs: number;
  enabled: boolean;
  next_run: string;
  last_run?: string | null;
  last_status?: string | null;
  created_at: string;
}

export interface ProjectSnapshot {
  root: string;
  name: string;
  board_dir: string;
  boards: string[];
  active_board?: string | null;
  is_git: boolean;
  git?: ProjectGitState | null;
  context: ProjectContextState;
  hooks: ProjectHooksState;
  setup: ProjectSetupState;
  counts: ProjectCounts;
  commands?: RunCommand[];
  verification_command?: string;
}

export interface SetupStep {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
}

export interface OnboardResult {
  ok: boolean;
  steps: SetupStep[];
  project: ProjectSnapshot;
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
  eligibility?: { eligible: boolean; reason?: string };
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

export interface ReviewComment {
  id: string;
  path: string;
  line?: number;
  side?: string;
  body: string;
  author: string;
  resolved: boolean;
  created_at: string;
  run_id?: string;
}

export interface ReviewFile {
  path: string;
  viewed: boolean;
  updated_at: string;
}

export interface ReviewState {
  version: number;
  id: string;
  updated_at: string;
  files: Record<string, ReviewFile>;
  comments: ReviewComment[];
}

// ── Trust layer (SPEC-007) ──

export type ConfidenceLevel = "low" | "medium" | "high";
export type GuardSeverity = "info" | "warn" | "error";

export interface GuardFinding {
  check: string;
  severity: GuardSeverity;
  path: string;
  line?: number;
  message: string;
  evidence?: string;
  suggestion?: string;
}

export interface ReceiptAgent {
  provider: string;
  model?: string;
  role?: string;
  agent_id?: string;
}

export interface ReceiptWorkspace {
  branch?: string;
  base_sha?: string;
  head_sha?: string;
  worktree?: string;
}

export interface ReceiptDiff {
  files: number;
  additions: number;
  deletions: number;
  paths: string[];
  test_files: string[];
  tests_changed: boolean;
}

export interface ReceiptGate {
  command?: string;
  passed: boolean;
  skipped: boolean;
  duration_ms?: number;
  log_path?: string;
  tail?: string;
  finished_at?: string;
}

export interface ReceiptGuard {
  ran: boolean;
  passed: boolean;
  errors: number;
  warnings: number;
  findings: GuardFinding[];
}

export interface ReceiptReview {
  open_comments: number;
  resolved_comments: number;
  viewed_files: number;
  total_files: number;
}

export interface ReceiptConfidence {
  level: ConfidenceLevel;
  reasons: string[];
}

export interface Receipt {
  version: number;
  id: string;
  card_id: string;
  task_id?: string;
  run_id?: string;
  thread_id?: string;
  intent: string;
  agent: ReceiptAgent;
  workspace: ReceiptWorkspace;
  diff: ReceiptDiff;
  gate: ReceiptGate;
  guard: ReceiptGuard;
  tests_changed: boolean;
  review: ReceiptReview;
  confidence: ReceiptConfidence;
  created_at: string;
  content_hash: string;
}

export interface ReceiptSummary {
  id: string;
  card_id: string;
  created_at: string;
  confidence: ConfidenceLevel;
  gate_passed: boolean;
  files: number;
  additions: number;
  deletions: number;
  guard_errors: number;
  guard_warnings: number;
}

export interface ReceiptVerification {
  receipt_id: string;
  valid: boolean;
  hash_ok: boolean;
  branch_moved?: boolean | null;
  gate?: ReceiptGate | null;
}

export type RiskTier = "must" | "should" | "skim" | "unknown";

export interface RiskReason {
  signal: string;
  points: number;
  detail: string;
}

export interface RiskAssessment {
  score: number;
  tier: RiskTier;
  reasons: RiskReason[];
}

export interface QueueItem {
  card_id: string;
  title: string;
  column: string;
  branch: string | null;
  receipt_id: string | null;
  files: number;
  additions: number;
  deletions: number;
  risk: RiskAssessment;
}

export interface RepoEntry {
  path: string;
  name: string;
  kind: "file" | "dir";
  size?: number;
}

export interface RepoFile {
  path: string;
  content: string;
  bytes: number;
  truncated: boolean;
  binary: boolean;
}

export interface GitChange {
  status: string;
  path: string;
}

export interface GitStatus {
  branch: string;
  head: string;
  upstream?: string;
  ahead: number;
  behind: number;
  clean: boolean;
  changes: GitChange[];
}

export interface EditorInfo {
  id: string;
  name: string;
  command: string;
  available: boolean;
  line_style: string;
}

export interface EditorDetection {
  editors: EditorInfo[];
  preferred?: string;
}

export interface WorktreeInfo {
  path: string;
  head: string;
  branch?: string;
  bare: boolean;
  detached: boolean;
  locked: boolean;
}

// ── Contributions (Agora-style contribution graph) ──

export type ContributionKind =
  | "result"
  | "hypothesis"
  | "verification"
  | "report"
  | "insight"
  | "failure";

export type ContributionStatus =
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

export interface ContributionVerification {
  verifier: string;
  passed: boolean;
  note?: string;
  at: string;
}

export interface ContributionNode {
  id: string;
  title: string;
  summary?: string;
  kind: ContributionKind;
  status: ContributionStatus;
  provider: string;
  model?: string;
  author: string;
  thread_id: string;
  card_id: string;
  parents: string[];
  children: string[];
  gate_passed: boolean;
  verified: boolean;
  verified_by: string[];
  verifications: ContributionVerification[];
  evidence_score: number;
  reuse_count: number;
  files_touched: string[];
  started_at: string;
  ended_at?: string;
}

export interface ContributionEdge {
  parent: string;
  child: string;
  relation: string;
}

export type ContributionLane =
  | "leading"
  | "neglected"
  | "contested"
  | "open_hypothesis"
  | (string & {});

export interface ContributionRecommendation {
  run_id: string;
  title: string;
  lane: ContributionLane;
  score: number;
  reason: string;
}

export interface ContributionMetrics {
  total_nodes: number;
  edges: number;
  verified_nodes: number;
  verification_rate: number;
  neglected_nodes: number;
  contested_nodes: number;
  open_hypotheses: number;
  reuse_rate: number;
  largest_lineage_share: number;
  contributions_last_7d: number;
  active_authors: number;
}

export interface ContributionAnalysis {
  nodes: ContributionNode[];
  edges: ContributionEdge[];
  duplicates: Array<{ left: string; right: string; shared_files: string[] }>;
  leading: ContributionNode[];
  neglected: ContributionNode[];
  contested: ContributionNode[];
  open_hypotheses: ContributionNode[];
  recommendations: ContributionRecommendation[];
  metrics: ContributionMetrics;
  generated_at: string;
}

import type {
  Board,
  Card,
  TaskDiff,
  ThreadDetail,
  ThreadEvent,
} from "./types";

export interface DemoThread {
  board: string;
  detail: ThreadDetail;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function ago(ms: number): string {
  return new Date(Date.now() - ms).toISOString();
}

function event(
  id: string,
  cardId: string,
  kind: string,
  author: string,
  text: string,
  at: string,
  data?: unknown
): ThreadEvent {
  return { id, card_id: cardId, kind, author, text, data, created_at: at };
}

const PLAN = {
  card_title: "Static demo hosting",
  proposed_at: ago(2 * HOUR),
  proposed_by: "scrum-master-1",
  rationale:
    "Ship the demo as the real product surface. One store, real fixtures, and no hidden network path.",
  risk_level: "low",
  estimated_total_effort: 6,
  requirements: [
    { title: "Local persistence", acceptance_criteria: ["A refresh keeps board edits"], effort: 2 },
    { title: "Surface coverage", acceptance_criteria: ["Every nav surface has a fixture"], effort: 3 },
    { title: "Interaction proof", acceptance_criteria: ["Mutations work without a server"], effort: 1 },
  ],
  children: [
    {
      title: "Add a localStorage-backed demo store",
      description: "Persist the same board and session shapes the server uses.",
      priority: "high",
      effort: 2,
      labels: ["web", "demo"],
      acceptance_criteria: ["Board edits survive refresh", "No API calls escape the demo shim"],
    },
    {
      title: "Fill every surface with real fixtures",
      description: "Boards, threads, history, bundles, skills, and memory all need believable data.",
      priority: "high",
      effort: 3,
      labels: ["web", "demo"],
      acceptance_criteria: ["No blank nav surface", "Fixtures match server contracts"],
    },
    {
      title: "Prove the write path",
      description: "Exercise create, move, comment, and thread messages in the static build.",
      priority: "medium",
      effort: 1,
      labels: ["test", "web"],
      acceptance_criteria: ["Mutations update the UI immediately", "Reload keeps the mutation"],
    },
  ],
};

const DIFF = `diff --git a/web/src/shell/InboxPane.tsx b/web/src/shell/InboxPane.tsx
index 8c1f0a2..f3b6c91 100644
--- a/web/src/shell/InboxPane.tsx
+++ b/web/src/shell/InboxPane.tsx
@@ -12,9 +12,14 @@ interface InboxPaneProps {
   loading?: boolean;
+  boardName?: string | null;
+  boards?: string[];
+  onSwitchBoard?: (name: string) => void;
 }

 export function InboxPane({
   threads,
   selectedId,
   onSelect,
   onNew,
   loading = false,
+  boardName,
+  boards = [],
+  onSwitchBoard,
 }: InboxPaneProps) {
-  const [search, setSearch] = useState("");
+  const [search, setSearch] = useState("");
+  const groups = useMemo(() => groupThreads(filterThreads(threads, search)), [threads, search]);
@@ -48,8 +53,12 @@ export function InboxPane({
       <div className="p-2.5 border-b border-border">
-        <input
-          value={search}
-          onChange={(event) => setSearch(event.target.value)}
-          placeholder="Search threads..."
-        />
+        <div className="relative">
+          <Icon name="search" size={12} />
+          <input
+            value={search}
+            onChange={(event) => setSearch(event.target.value)}
+            placeholder="Search threads"
+            aria-label="Search threads"
+          />
+        </div>
       </div>
diff --git a/web/src/lib/demo.ts b/web/src/lib/demo.ts
index 2a4d913..6bb5e42 100644
--- a/web/src/lib/demo.ts
+++ b/web/src/lib/demo.ts
@@ -97,6 +97,7 @@ interface DemoStore {
   bundles: BundleRec[];
   specs: SpecRec[];
+  threads: DemoThread[];
   orch: { cycle_count: number; tasks_dispatched: number; tasks_completed: number; tasks_failed: number };
   pendingProposal: PlanProposal | null;
   undoStack: Record<string, string[]>;
@@ -305,6 +306,7 @@ function seed(): DemoStore {
   return {
     boardNames: ["dev", "roadmap"],
     boards,
+    threads: seedDemoThreads(boards),
     sprints: [
       { name: "sprint-14", start: d(6).slice(0, 10), end: inDays(8).slice(0, 10), created_at: d(6) },
@@ -1705,6 +1707,19 @@ function saveCheckpoint(kind: string, label: string | undefined, name: string | null) {

 // ── Fetch shim ──

+const threadRoutes: Route[] = [
+  { method: "GET", re: /^\\/api\\/threads$/, handle: (_m, { q }) => listDemoThreads(q.get("name")) },
+  { method: "GET", re: /^\\/api\\/threads\\/([^/]+)$/, handle: (m, { q }) => getDemoThread(m[1], q.get("name")) },
+  { method: "POST", re: /^\\/api\\/threads$/, handle: (_m, { body, q }) => createDemoThread(body.text, q.get("name")) },
+  { method: "POST", re: /^\\/api\\/threads\\/([^/]+)\\/messages$/, handle: (m, { body }) => postDemoMessage(m[1], body.text) },
+];
+
 export function installDemoApi(): void {
   const realFetch = window.fetch.bind(window);

@@ -1724,6 +1739,12 @@ export function installDemoApi(): void {
     for (const route of ROUTES) {
       if (route.method !== method) continue;
       const m = path.match(route.re);
       if (m) {
         const data = await route.handle(m, { q: query, body });
         return data instanceof Response ? data : json(data);
       }
     }
+    for (const route of threadRoutes) {
+      if (route.method !== method) continue;
+      const m = path.match(route.re);
+      if (m) {
+        const data = await route.handle(m, { q: query, body });
+        return data instanceof Response ? data : json(data);
+      }
+    }
diff --git a/web/src/lib/types.ts b/web/src/lib/types.ts
index 71aa9f0..1d51b22 100644
--- a/web/src/lib/types.ts
+++ b/web/src/lib/types.ts
@@ -307,6 +307,7 @@ export interface ThreadDetail {
   id: string;
   card?: Card;
   events: ThreadEvent[];
+  board?: string;
 }

 export interface SessionTranscript {
`;

function cardFor(boards: Record<string, Board>, id: string, fallback: Partial<Card> & { title: string; column: string }): Card {
  return boards.dev?.cards.find((card) => card.id === id) ?? ({
    id,
    priority: "medium",
    labels: [],
    checklist: [],
    comments: [],
    attachments: [],
    links: [],
    acceptance_criteria: [],
    pinned: false,
    description: "",
    created_at: ago(3 * DAY),
    updated_at: ago(HOUR),
    ...fallback,
  } as Card);
}

export function seedDemoThreads(boards: Record<string, Board>): DemoThread[] {
  const demo = cardFor(boards, "demo-mode", {
    title: "Static demo hosting",
    column: "doing",
  });
  const oauth = cardFor(boards, "oauth-flow", {
    title: "Implement OAuth flow",
    column: "doing",
  });
  const tokens = cardFor(boards, "store-tokens", {
    title: "Store tokens securely",
    column: "review",
  });
  const kiosk = cardFor(boards, "kiosk-mode", {
    title: "Kiosk mode for wall displays",
    column: "done",
  });
  const oauthDraft = cardFor(boards, "add-oauth", {
    title: "Add OAuth login",
    column: "todo",
  });
  const history = cardFor(boards, "history-bundles", {
    title: "History bundle review",
    column: "review",
  });

  const demoStarted = ago(2 * HOUR);
  const demoPlan = ago(70 * MINUTE);
  const demoApproved = ago(65 * MINUTE);
  const demoRun = ago(45 * MINUTE);
  const demoGate = ago(22 * MINUTE);
  const demoSummary = ago(9 * MINUTE);

  return [
    {
      board: "dev",
      detail: {
        id: demo.id,
        card: demo,
        events: [
          event(
            "ev-demo-user",
            demo.id,
            "user",
            "you",
            "Make the static demo a real product surface, not a mock. Board edits, agent notes, and history should all survive a refresh.",
            demoStarted
          ),
          event(
            "ev-demo-plan",
            demo.id,
            "plan_proposed",
            "scrum-master-1",
            "Three slices keep the local write path honest.",
            demoPlan,
            PLAN
          ),
          event(
            "ev-demo-approved",
            demo.id,
            "plan_approved",
            "you",
            "Plan approved — run the slices in parallel where they do not touch the same files.",
            demoApproved
          ),
          event(
            "ev-demo-task",
            demo.id,
            "task_spawned",
            "opencode-1",
            "Worker claimed the store and fixtures slices. Isolated worktree ready.",
            demoRun,
            {
              task_id: "task-demo-mode",
              session_id: "ses-demo-mode",
              branch: "bark/static-demo-host",
            }
          ),
          event(
            "ev-demo-output",
            demo.id,
            "agent_output",
            "opencode-1",
            "demo store: 14 fixtures\nsurface routes: 7/7 wired\nwrites: board, thread, memory\nserver calls: 0",
            ago(28 * MINUTE)
          ),
          event(
            "ev-demo-gate",
            demo.id,
            "gate",
            "merge-train",
            "Acceptance gate passed for bark/static-demo-host.",
            demoGate,
            {
              passed: true,
              command: "npm --prefix web run test && npm --prefix web run build",
              output: "Test Files  4 passed (4)\nTests       51 passed (51)\nBuild       dist/assets/index.js  988.50 kB",
            }
          ),
          event(
            "ev-demo-summary",
            demo.id,
            "assistant",
            "orbiter",
            "Implemented and verified the static demo path.\n\n- localStorage-backed store for boards, threads, memory, and history\n- every surface now has a fixture instead of a blank state\n- mutations remain local; no server calls escape the shim\n\nValidation passed:\n- 51 focused tests\n- web typecheck and production build\n- demo reload keeps the last write\n\nThe work is ready for a human pass before the merge train picks it up.",
            demoSummary
          ),
        ],
      },
    },
    {
      board: "dev",
      detail: {
        id: oauth.id,
        card: oauth,
        events: [
          event(
            "ev-oauth-user",
            oauth.id,
            "user",
            "you",
            "Finish the callback round-trip and add a regression test for the anonymous cart case.",
            ago(90 * MINUTE)
          ),
          event(
            "ev-oauth-task",
            oauth.id,
            "task_spawned",
            "codex-1",
            "Worker is testing the callback against a disposable session.",
            ago(48 * MINUTE),
            {
              task_id: "task-oauth-flow",
              session_id: "ses-oauth-flow",
              branch: "bark/oauth-callback",
            }
          ),
          event(
            "ev-oauth-output",
            oauth.id,
            "agent_output",
            "codex-1",
            "cargo test -p barkcli-server auth::callback\nrunning 8 tests\ntest auth::callback::round_trip ... ok\ntest auth::callback::anonymous_cart ... ok\n\ntest result: ok. 8 passed; 0 failed",
            ago(18 * MINUTE)
          ),
        ],
      },
    },
    {
      board: "dev",
      detail: {
        id: tokens.id,
        card: tokens,
        events: [
          event(
            "ev-tokens-user",
            tokens.id,
            "user",
            "you",
            "Review token storage before this moves to merge. The keychain path needs a decision.",
            ago(26 * HOUR)
          ),
          event(
            "ev-tokens-plan",
            tokens.id,
            "plan_proposed",
            "claude-2",
            "One open decision: keychain access group for dev builds.",
            ago(25 * HOUR),
            {
              ...PLAN,
              card_title: "Store tokens securely",
              rationale: "Keep refresh tokens out of YAML. The remaining question is the dev access group.",
              risk_level: "medium",
              children: PLAN.children.slice(0, 2),
              estimated_total_effort: 4,
            }
          ),
          event(
            "ev-tokens-gate",
            tokens.id,
            "gate",
            "merge-train",
            "Gate failed: the keychain test needs a signed test host.",
            ago(6 * HOUR),
            {
              passed: false,
              command: "cargo test -p auth -- keychain",
              output: "test keychain::round_trip ... FAILED\nerror: SecItemAdd returned errSecMissingEntitlement",
            }
          ),
          event(
            "ev-tokens-assistant",
            tokens.id,
            "assistant",
            "claude-2",
            "I stopped before changing the keychain boundary. We need to choose between a signed test host and a small trait seam for the keychain. I recommend the seam because it keeps CI unchanged.",
            ago(5 * HOUR + 40 * MINUTE)
          ),
        ],
      },
    },
    {
      board: "dev",
      detail: {
        id: kiosk.id,
        card: kiosk,
        events: [
          event(
            "ev-kiosk-user",
            kiosk.id,
            "user",
            "you",
            "Ship the chrome-less board mode for wall displays.",
            ago(4 * DAY)
          ),
          event(
            "ev-kiosk-plan",
            kiosk.id,
            "plan_proposed",
            "scrum-master-1",
            "A small renderer slice plus one interaction test.",
            ago(4 * DAY + 20 * MINUTE),
            { ...PLAN, card_title: "Kiosk mode for wall displays", risk_level: "low" }
          ),
          event(
            "ev-kiosk-gate",
            kiosk.id,
            "gate",
            "merge-train",
            "Acceptance gate passed for feat/kiosk.",
            ago(3 * DAY),
            { passed: true, command: "cargo test -p barkcli-server --lib" }
          ),
          event(
            "ev-kiosk-merge",
            kiosk.id,
            "merge",
            "merge-train",
            "Merged feat/kiosk into main after the gate passed.",
            ago(2 * DAY + 20 * HOUR)
          ),
        ],
      },
    },
    {
      board: "dev",
      detail: {
        id: oauthDraft.id,
        card: oauthDraft,
        events: [
          event(
            "ev-draft-user",
            oauthDraft.id,
            "user",
            "you",
            "Draft the provider adapter boundaries before we start coding.",
            ago(5 * DAY)
          ),
        ],
      },
    },
    {
      board: "dev",
      detail: {
        id: history.id,
        card: history,
        events: [
          event(
            "ev-history-user",
            history.id,
            "user",
            "you",
            "Check why bundle scan misses squash merges, then add a regression fixture.",
            ago(30 * HOUR)
          ),
          event(
            "ev-history-task",
            history.id,
            "task_spawned",
            "opencode-1",
            "Reviewing the last 30 merges and the bundle scan parser.",
            ago(29 * HOUR),
            { task_id: "task-history-bundles", session_id: "ses-history-bundles" }
          ),
        ],
      },
    },
  ];
}

export const DEMO_DIFF: TaskDiff = {
  task_id: "task-demo-mode",
  branch: "bark/static-demo-host",
  files: [
    "web/src/shell/InboxPane.tsx",
    "web/src/lib/demo.ts",
    "web/src/lib/types.ts",
  ],
  diff: DIFF,
};

const OAUTH_DIFF: TaskDiff = {
  task_id: "task-oauth-flow",
  branch: "bark/oauth-callback",
  files: ["barkcli-server/src/auth/callback.rs", "barkcli-server/src/lib.rs"],
  diff: `diff --git a/barkcli-server/src/auth/callback.rs b/barkcli-server/src/auth/callback.rs
index 41b8a2c..d9e1f04 100644
--- a/barkcli-server/src/auth/callback.rs
+++ b/barkcli-server/src/auth/callback.rs
@@ -18,12 +18,24 @@ pub async fn exchange_code(
     let code = query.get("code").ok_or(AuthError::MissingCode)?;
+    let state = query.get("state").ok_or(AuthError::MissingState)?;
+    verify_state(state, &session)?;

-    let token = client.exchange(code).await?;
+    let token = client
+        .exchange(code)
+        .await
+        .map_err(AuthError::Provider)?;
+
+    if token.scope.is_empty() {
+        return Err(AuthError::MissingScope);
+    }
+
     session.write(token).await?;
+    tracing::info!(session = %session.id, "oauth callback completed");
     Ok(Redirect::to("/"))
 }

+#[cfg(test)]
+mod tests {
+    use super::*;
+
+    #[tokio::test]
+    async fn anonymous_cart_keeps_session() {
+        let session = Session::anonymous();
+        let response = callback(session.clone(), code("ok"), state()).await;
+        assert!(response.is_ok());
+        assert!(session.user_id().is_none());
+    }
+}
diff --git a/barkcli-server/src/lib.rs b/barkcli-server/src/lib.rs
index 2ccb4f1..3a47c09 100644
--- a/barkcli-server/src/lib.rs
+++ b/barkcli-server/src/lib.rs
@@ -120,6 +120,7 @@ fn router(state: AppState) -> Router {
         .route("/api/auth/callback", get(auth::callback))
+        .route("/api/auth/logout", post(auth::logout))
         .route("/api/boards", get(board::list))
         .route("/api/board", get(board::get).put(board::save))
         .with_state(state)
`,
};

export function demoDiffForTask(taskId: string): TaskDiff | null {
  if (taskId === "task-demo-mode" || taskId === "demo-mode") return DEMO_DIFF;
  if (taskId === "task-oauth-flow" || taskId === "oauth-flow") return OAUTH_DIFF;
  return null;
}

# BarkCLI Orchestra 2.0: Intelligent Multi-Model Agent Orchestration

Architecture research and implementation plan • November 7, 2026

## 1. The fundamental change BarkCLI needs

You're right. The earlier architecture focused too much on Claude Code, Codex and OpenCode as separate agents. That's not how I would design the system.

BarkCLI should orchestrate models, roles, tools and execution environments independently.

Consider someone who has only OpenCode installed. Inside OpenCode, they might have access to 15 models from OpenRouter, OpenCode, Google, local Ollama and other providers.

BarkCLI should be able to use those models to create a complete engineering team without requiring another coding CLI.

### BarkCLI Orchestra

Plans work, selects models, coordinates execution

Available runtime: OpenCode

Claude Code and Codex not installed

Planner

Model A

Reasoning

Builder

Model B

Coding

Reviewer

Model C

Analysis

Verification and Integration

Tests, review, merge, memory, receipts

Models A, B and C represent different discovered models, all running through the same OpenCode installation.

OpenCode officially supports choosing models per run and configuring different models for specialized agents. Its current model system also supports local Ollama, LM Studio and vLLM discovery. So this architecture can use existing functionality rather than modifying OpenCode itself.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://opencode.ai\&sz=32)

OpenCode+1



### The four concepts to keep separate

| Concept            | Meaning                                  | Example                            |
| ------------------ | ---------------------------------------- | ---------------------------------- |
| Runtime            | Software executing coding-agent sessions | OpenCode                           |
| Inference provider | Service supplying the LLM                | OpenRouter, Google, Ollama         |
| Model              | Intelligence used for the task           | A specific `provider/model` ID     |
| Agent role         | Instructions, permissions and objective  | Architect, coder, tester, reviewer |

A worker is a combination of these concepts, plus a workspace and a session.

```
Worker =
  Runtime
  + Model
  + Role
  + Tools / Permissions
  + Git Worktree
  + Session
  + Resource Budget
```

This distinction unlocks three important capabilities.

First, ten workers can run through one OpenCode installation, subject to the machine's resources and provider limits.

Second, BarkCLI can choose different models for different tasks, rather than always using OpenCode's default model.

Third, changing the model does not require changing the role, worktree, acceptance criteria or overall workflow.

The main architectural decision: BarkCLI owns the intelligence for model selection and orchestration. OpenCode supplies the coding-agent execution environment.

## 2. What your current BarkCLI already supports and what must change

I inspected the current source in your [BarkCLI repository](https://github.com/AkshatNaruka/barkcli?utm_source=chatgpt.com).

There is already a useful foundation:

| Current implementation       | Existing behavior                                                    | Required upgrade                                                    |
| ---------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `runtime/providers.rs`       | Discovers OpenCode models using `opencode models`                    | Rich model inventory with capabilities, cost and availability       |
| `runtime/provider.rs`        | Has a runtime adapter trait and model ID list                        | Separate runtime, inference provider and model abstractions         |
| `agent/team.rs`              | Stores a role, provider and optional fixed model on an agent profile | Support dynamic model policies and model pools                      |
| `agent/product_plan.rs`      | Ranks agent profiles using role, skills, load and success history    | Rank eligible runtime/model combinations for each task              |
| `agent/orchestra_service.rs` | Dispatches work to assigned profiles                                 | Resolve the best model immediately before dispatch                  |
| `runtime/runner.rs`          | Already passes model IDs into run requests                           | Record why the model was chosen and support safe rerouting          |
| `agent/fleet.rs`             | Handles capacity and file overlap                                    | Coordinate model quotas, provider rate limits and machine resources |

Your existing OpenCode adapter even passes `--model` during execution. So model-specific execution is partly there.

The main limitation is the orchestration layer: it selects a configured agent profile whose model may already be fixed, rather than discovering and ranking all usable models against the specific task.

I would preserve `AgentProfile` for named user-defined roles but add a dynamic selection layer between the scheduler and runner.

## 3. The complete OpenCode-only discovery system

This is the first subsystem I would build.

BarkCLI must stop asking, "Which coding agents are installed?" as its primary question.

Instead, it should ask:

"What executable AI capabilities are available on this machine, and which models can actually perform this work?"

### Discovery pipeline

### Step A. Detect OpenCode

BarkCLI checks the installed executable, its version, startup health and relevant capabilities.

It should understand three conditions:

| Condition                                             | Action                                                           |
| ----------------------------------------------------- | ---------------------------------------------------------------- |
| OpenCode installed and working                        | Use it                                                           |
| OpenCode missing, another supported runtime installed | Use the other runtime                                            |
| No supported runtime installed                        | Offer setup or manual mode; do not silently attempt AI execution |

The user should never be forced to install Claude Code or Codex just because a built-in BarkCLI role was originally associated with one of them.

### Step B. Discover models from OpenCode

Use the OpenCode server API as the preferred structured source.

Its documented endpoints include:

| Endpoint                | Purpose                                                  |
| ----------------------- | -------------------------------------------------------- |
| `GET /global/health`    | Check server health and version                          |
| `GET /provider`         | Discover provider catalog and connected provider IDs     |
| `GET /config/providers` | Obtain configured providers and default model selections |
| `GET /config`           | Read effective configuration                             |
| `GET /agent`            | Discover available OpenCode agent configurations         |
| `GET /session/status`   | Observe active sessions                                  |

OpenCode also exposes session APIs, per-message model selection and server-sent events, making it suitable for an external orchestration controller.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://docs.opencode.ai\&sz=32)

OpenCode+2



The fallback discovery command is:

```
opencode models
```

For verbose model information:

```
opencode models --verbose
```

This is preferable to maintaining a static list of model names that will become outdated.

### Step C. Separate listed models from usable models

This is critically important.

OpenCode can know about a model that the current user cannot successfully invoke. Credentials, project configuration, enabled status and provider availability can all affect selection.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://opencode.ai\&sz=32)

OpenCode



I recommend these model states:

| Status          | Meaning                                | Eligible for automatic execution? |
| --------------- | -------------------------------------- | --------------------------------- |
| Discovered      | Appears in the catalog                 | No, not yet validated             |
| Configured      | Enabled through an accessible provider | Conditional                       |
| Ready           | Verified as usable                     | Yes                               |
| Unverified      | No successful check or run yet         | Only with explicit policy         |
| Rate limited    | Temporarily unavailable                | No                                |
| Quota exhausted | Access limit reached                   | No                                |
| Auth required   | Missing or invalid authentication      | No                                |
| Unsupported     | Missing a required capability          | No                                |
| Offline         | Endpoint unavailable                   | No                                |
| Disabled        | User or project disallows it           | No                                |

To verify readiness, first use existing provider information and previous successful runs. Optionally perform a very small, explicitly authorized model probe when confirmation is necessary.

Do not test every discovered model automatically. A machine could expose hundreds of catalog entries, and those probes might cost money or exhaust free quotas.

### Step D. Enrich each model with metadata

Use the OpenCode effective catalog as the first source for selectable models and their capabilities. Enrich missing information from Models.dev.

Models.dev provides a machine-readable API for specifications, pricing and capabilities, and OpenCode itself uses its catalog.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://github.com\&sz=32)

GitHub



The normalized BarkCLI model record should include:

| Field                     | Why it matters                                   |
| ------------------------- | ------------------------------------------------ |
| Runtime ID                | OpenCode or other execution harness              |
| Provider ID               | Which provider serves the model                  |
| Model ID                  | Exact executable model identifier                |
| Variant                   | Reasoning effort or model-specific configuration |
| Tool calling              | Necessary for autonomous coding                  |
| Context limit             | Suitability for large contexts                   |
| Output limit              | Capacity for long responses                      |
| Supported input types     | Text, images and other modalities                |
| Pricing                   | Estimated input, output and cache costs          |
| Access type               | API, subscription, free tier or local            |
| Authentication status     | Whether access is configured                     |
| Quota / rate-limit status | Whether work can start                           |
| Historical reliability    | Success and failure observations                 |
| Task-specific quality     | Performance by engineering task category         |
| Observed latency          | Speed under actual conditions                    |
| Last checked              | Metadata freshness and confidence                |

Be careful with the free label. A zero-price catalog entry does not necessarily mean unlimited usage, and a subscription-backed model may have no visible per-token billing while still having usage limits.

### Model catalog example

This is an illustrative result after discovery, not a claim about the models configured on your Mac.

| Model   | Capability          | Access       | Recommended work                        |
| ------- | ------------------- | ------------ | --------------------------------------- |
| Model A | Fast, tool capable  | Free tier    | Documentation, small fixes, exploration |
| Model B | Strong reasoning    | Paid API     | Architecture, complex debugging         |
| Model C | Strong code editing | Subscription | Implementation, refactoring             |
| Model D | Small local model   | Offline      | Summaries, classification               |

The model catalog should display where every assessment came from: metadata, public benchmark, local benchmark, or measured project performance.

## 4. Build a Model Intelligence Engine

This is where BarkCLI can become meaningfully better than a basic multi-agent manager.

The challenge is not simply finding the largest model. It's selecting a model that can complete a specific engineering task with the desired quality, speed, cost and reliability.

### Models are not universally good at everything

A model that performs well on complex algorithms might be inefficient for README updates. A fast model might be excellent at codebase exploration but struggle with multi-file architecture changes.

A model's performance also depends on the agent harness, tools, prompts and reasoning settings. Terminal-Bench, for example, reports model-agent combinations rather than treating the underlying model as the only determinant of performance.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://epoch.ai\&sz=32)

Epoch AI



BarkCLI therefore needs two different knowledge sources.

### Layer 1. Public model intelligence

Useful sources include:

| Source                                                                                                | Best use                                                       | Important limitation                                  |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------- |
| [Models.dev](https://models.dev/?utm_source=chatgpt.com)                                              | Pricing, model capabilities, context                           | Not a coding-quality leaderboard                      |
| [Artificial Analysis](https://artificialanalysis.ai/?utm_source=chatgpt.com)                          | Intelligence, coding evaluations, latency and cost comparisons | Broad scores may not reflect an individual repository |
| [Terminal-Bench](https://www.tbench.ai/?utm_source=chatgpt.com)                                       | Agentic terminal execution                                     | Results depend on the model and agent harness         |
| [SWE-Bench Pro V2](https://labs.scale.com/leaderboard/swe_bench_pro_public_v2?utm_source=chatgpt.com) | Complex real-world repository issue resolution                 | Benchmark tasks differ from each user's workload      |

Public benchmarks should provide an initial prior, not an absolute ranking. SWE-Bench Pro V2's September 2026 update also shows why evaluation hygiene matters: tasks and grading conditions had to be corrected, and submitted patches are independently checked.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://labs.scale.com\&sz=32)

labs.scale.com



For the first release, these scores can be maintained in a curated versioned dataset rather than building integrations with every leaderboard.

### Layer 2. BarkCLI's own performance database

This should eventually become the more valuable source.

Every completed run already produces useful evidence. Extend that into model performance records:

```
Model: provider/model-abc
Runtime: opencode
Task class: backend_bug_fix
Language: TypeScript
Difficulty: medium

Attempts: 12
Verified successes: 9
Failures: 3
Median duration: 84 seconds
Median estimated cost: $0.03
Interventions: 2
Regressions found: 1
```

Illustrative measurements only.

Do not rely on the model saying it finished. Use task acceptance gates, independent tests, user approval and post-merge outcomes.

Also record the model's exact revision or ID, variant, OpenCode version, task category and relevant configuration. Otherwise, a model update or harness change can make historical comparisons misleading.

### Add small local evaluations

BarkCLI should have a benchmark mode that selects a handful of representative tasks and runs candidate models under comparable conditions.

Example benchmark categories:

| Category            | Evaluation                                   |
| ------------------- | -------------------------------------------- |
| Code comprehension  | Identify relevant files and explain behavior |
| Bug fixing          | Fix a reproducible failing test              |
| Code editing        | Apply a small change without regressions     |
| Refactoring         | Preserve behavior across multiple files      |
| Test generation     | Create useful tests that expose known issues |
| Security review     | Detect seeded vulnerabilities                |
| Structured planning | Produce a valid dependency-aware task plan   |
| Tool calling        | Correctly execute multi-step workflows       |

Start with 5 to 10 inexpensive tasks, not a huge benchmark suite.

For a fair comparison, use the same starting commit, same task instructions, isolated worktrees, fixed tool permissions and equivalent limits. A model that receives more context or more attempts should not automatically score higher.

For the user's own projects, maintain a separate evaluation dataset. Do not benchmark directly against production secrets or destructive tasks.

### Confidence matters

Suppose Model A completes one bug fix successfully and Model B completes 88 of 100.

Model A should not immediately be ranked above B because it has a 100% observed success rate.

Use Bayesian smoothing or a confidence-adjusted estimate. For example, a Beta prior can prevent models with only a few attempts from appearing unrealistically reliable. Keep statistics separate by task type rather than treating all software engineering tasks as equivalent.

After enough observations, BarkCLI can learn statements such as:

> Model A is usually the most efficient for documentation and small fixes. Model B has stronger verified outcomes on complex Rust changes. Model C is fastest on front-end tasks but has a higher retry rate.

Those would be actual project-specific observations, not marketing labels.

## 5. Design the intelligent model router

The model router decides which runtime, model and configuration should execute each task.

The router should operate after the work has been analyzed, and immediately before dispatch. That ensures recent changes in model availability and provider quotas are taken into account.

### First classify the task

Each task should receive a structured analysis.

| Dimension             | Examples                                                         |
| --------------------- | ---------------------------------------------------------------- |
| Work type             | Research, design, implementation, testing, review, documentation |
| Difficulty            | Simple, moderate, complex                                        |
| Risk                  | Low, medium, high, security-critical                             |
| Scope                 | One file, several files, entire repository                       |
| Required capabilities | Tool calling, vision, long context, structured output            |
| Languages             | Rust, TypeScript, Python, Swift                                  |
| Expected context      | Small, medium, large                                             |
| Dependencies          | Independent, blocked, integration-dependent                      |
| Verification          | Unit tests, integration tests, browser tests, human review       |

Start with deterministic repository signals and task metadata. An inexpensive model can refine the classification when needed, but its output must be schema-validated.

For example, touching authentication code does not always mean a task is technically difficult, but it may still be high-risk and require stronger verification.

### Then filter models before scoring them

This separation is essential.

Hard constraints eliminate unsuitable candidates. A model without usable tool calling should not be chosen for an autonomous editing task simply because it is cheap.

The router should enforce permissions, authentication, supported capabilities, project policies, budget and availability first.

Only the remaining candidates are scored.

### Proposed initial scoring function

For an eligible model \\(m\\) and task \\(t\\):

\\[ S(m,t)=0.45Q+0.20R+0.15C+0.10L+0.10H \\]

Where every term is normalized between 0 and 1:

| Variable | Meaning                                                   |
| -------- | --------------------------------------------------------- |
| \\(Q\\)  | Estimated verified success on this task type              |
| \\(R\\)  | Tool-use and execution reliability                        |
| \\(C\\)  | Cost efficiency for the estimated workload                |
| \\(L\\)  | Latency suitability                                       |
| \\(H\\)  | Historical compatibility with the repo, language and task |

These weights are design defaults, not empirically optimized values.

I would not put a model's overall benchmark score directly into \\(Q\\). Instead, blend public task-relevant evidence with local success history, giving local observations more weight as confidence grows.

For complex jobs, estimate the expected cost to complete successfully, including likely retries, not just the price of one attempt.

### Interactive routing policy simulator

The following example shows how the router could rank three hypothetical models under different user preferences. The values are illustrative, not real model benchmark scores.

Model selection strategy

Balanced

Maximum quality

Cost efficient

Fastest completion

\#1

Model C

Selected

83.0

\#2

Model B

79.2

\#3

Model A

77.0

Demonstrates preference-sensitive ranking only. Real routing must first pass hard constraints, assess confidence and enforce quotas.

### Add intelligent exploration later

Initially, BarkCLI should use predictable, explainable rankings.

Once it has enough historical executions, introduce a contextual bandit or uncertainty-aware exploration strategy. This allows it to occasionally try a promising alternative rather than permanently choosing whichever model won the first few tasks.

Exploration must be bounded. Never use an unproven model on a high-risk production task merely to collect statistics.

## 6. Agent roles should be dynamic, not tied permanently to models

Instead of creating a fixed collection of profiles such as:

```
Architect = Claude Code
Developer = Codex
Tester = OpenCode
```

BarkCLI should define reusable roles and then assign an eligible model at runtime.

| BarkCLI role        | Primary requirements                          | Recommended policy                     |
| ------------------- | --------------------------------------------- | -------------------------------------- |
| Scout               | Fast code search and comprehension            | Fast or economical                     |
| Architect           | Long-context reasoning, planning              | Quality first                          |
| Implementer         | Reliable tool calling and code editing        | Best coding success                    |
| Debugger            | Iterative diagnosis and test repair           | Quality first                          |
| Test engineer       | Test design and execution                     | Balanced                               |
| Security reviewer   | Careful analysis, security-focused evaluation | High confidence, separate review       |
| Integrator          | Conflict resolution, regression testing       | Quality first                          |
| Documentation agent | Clear writing and repository understanding    | Economy first                          |
| Coordinator         | Task state, dependencies and scheduling       | Deterministic core plus optional model |

This gives you maximum flexibility.

If the user has only one good model, the same model can occupy several different roles in separate sessions.

If the user has ten models, BarkCLI can distribute roles according to comparative capability.

If a model becomes unavailable, its role can be reassigned without redesigning the workflow.

### Don't make every role an LLM

This is another major design improvement.

Dependency checking, concurrency control, budget limits, determining whether a process is alive, validating schema and running tests should be deterministic Rust logic.

Use models where judgment is useful: understanding an ambiguous goal, designing a solution, coding, debugging and assessing changes.

This reduces token usage, nondeterminism and opportunities for autonomous agents to override project policies.

### Role configurations

An agent template should contain:

```
# Illustrative BarkCLI configuration, not an existing schema
id: backend-developer
role: implementation

model_policy:
  strategy: quality_balanced
  allowed_runtimes:
    - opencode
  require:
    tool_calling: true
  min_quality_confidence: 0.6
  allow_free_models: true
  allow_local_models: true

execution:
  workspace: isolated_worktree
  max_attempts: 2
  max_duration_minutes: 25
  permission_profile: standard_build

verification:
  require_tests: true
  require_review: true
```

Notice that this role contains no fixed model ID.

A user can optionally pin a model, and that pin should take priority provided the model is available and safe.

## 7. How multiple models actually execute through one OpenCode installation

This needs to be designed carefully because there are two levels of orchestration.

### Option A. Let OpenCode internally manage subagents

OpenCode supports primary agents and subagents with their own models, instructions and permissions.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://opencode.ai\&sz=32)

OpenCode



That makes it possible to build a small multi-agent workflow inside OpenCode.

However, if BarkCLI delegates the entire workflow to OpenCode's internal subagent manager, BarkCLI loses some control over scheduling, model selection, retries, cost and verification.

### Option B. BarkCLI manages independent OpenCode sessions

This is my recommended approach.

BarkCLI Scheduler

Owns execution policy and task state

Session 1

Model A

Worktree A

Session 2

Model B

Worktree B

Session 3

Model C

Worktree C

All sessions execute through OpenCode

BarkCLI should create separate sessions with explicit model selections and separate working directories.

This provides isolation of file changes and session context. The underlying model calls may still share provider quotas, and CPU, memory and network resources remain shared unless stronger isolation is added.

### Preferred integration: OpenCode Server API

For interactive orchestration, use OpenCode's server as the primary integration.

The execution sequence would be:

```
1. BarkCLI acquires an isolated worktree.

2. BarkCLI resolves a compatible model.

3. Runtime manager starts or reuses an
   appropriate OpenCode server.

4. BarkCLI creates an OpenCode session.

5. BarkCLI sends the task with an explicit
   model and permission-controlled agent.

6. OpenCode executes the task.

7. BarkCLI consumes live events and
   maintains its own run state.

8. BarkCLI collects the diff and results.

9. BarkCLI runs independent verification.

10. BarkCLI retains the worktree for
    review or safe integration.
```

The current OpenCode APIs support creating sessions, submitting messages asynchronously, retrieving diffs, aborting sessions and subscribing to events.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://docs.opencode.ai\&sz=32)

OpenCode



For the Rust backend, I would use an HTTP client and typed response structures instead of adding a permanent Node.js process solely for the JavaScript SDK.

### CLI fallback

When rich server integration is unsupported by a particular OpenCode version, retain the existing CLI execution path.

For example:

```
opencode run \
  --model "provider/model-id" \
  --format json \
  "Implement the assigned task"
```

This command chooses a model for the individual run instead of requiring a global OpenCode configuration change.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://docs.opencode.ai\&sz=32)

OpenCode



BarkCLI must pass arguments directly to the process rather than assembling unsafe shell strings from user input.

### Lightweight local runtime management

I would avoid launching a heavyweight stack just for the orchestrator.

Use a lazy runtime manager:

| Situation                   | Behavior                                               |
| --------------------------- | ------------------------------------------------------ |
| No active tasks             | No unnecessary worker processes                        |
| One task                    | One managed session                                    |
| Several independent tasks   | Concurrent sessions with bounded capacity              |
| Existing compatible server  | Reuse if ownership, scope and security can be verified |
| Incompatible server version | Fall back to a supported CLI adapter                   |
| Worktree completed          | Preserve or clean up according to retention policy     |
| App restarted               | Reconcile persisted runs with actual sessions          |

OpenCode's server can bind to loopback and supports HTTP Basic authentication. BarkCLI-managed instances should be loopback-only, use unique credentials and should not be exposed to the network by default.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://docs.opencode.ai\&sz=32)

OpenCode



For the initial release, I would favor separate managed execution contexts per worktree, then optimize process reuse after measuring memory and startup overhead. Never assume one session's working directory automatically isolates another session's filesystem access.

Do not let OpenCode independently orchestrate a large second agent tree by default. BarkCLI should own the top-level task graph, and nested provider subagents should be explicitly enabled only when their work and costs can be attributed correctly.

## 8. How the dynamic scheduler chooses and reallocates models

The scheduler must handle three separate decisions:

- Which task can run now?
- Which model is best suited to that task?
- How much parallel execution is safe?

These decisions must be evaluated together.

### Proposed scheduling algorithm

```
        candidates = [            model for model in model_inventory            if model.runtime_available            and model.is_usable            and supports_required_tools(model, task)            and within_policy(model, task, policy)            and quota_available(model)            and capacity_available(model, capacity)        ]        if not candidates:            mark_waiting(task, reason="No eligible model")            continue        ranked = sorted(            candidates,            key=lambda model: score_model(model, task, policy),            reverse=True        )        selected = ranked[0]        if not reserve_capacity_and_budget(selected, task):            continue        assignments.append(            create_execution_assignment(task, selected)        )    return assignments
```

The production implementation should use a transactional reservation mechanism so two concurrent scheduler cycles cannot both claim the same task or quota slot.

### Recommended dispatch flow

\#chatgpt-mermaid-\_r_20s\_{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;fill:rgb(237, 237, 237);}@keyframes edge-animation-frame{from{stroke-dashoffset:0;}}@keyframes dash{to{stroke-dashoffset:0;}}#chatgpt-mermaid-\_r_20s\_ .edge-animation-slow{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 50s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-\_r_20s\_ .edge-animation-fast{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 20s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-\_r_20s\_ .error-icon{fill:rgb(48, 48, 48);}#chatgpt-mermaid-\_r_20s\_ .error-text{fill:rgb(237, 237, 237);stroke:rgb(237, 237, 237);}#chatgpt-mermaid-\_r_20s\_ .edge-thickness-normal{stroke-width:1px;}#chatgpt-mermaid-\_r_20s\_ .edge-thickness-thick{stroke-width:3.5px;}#chatgpt-mermaid-\_r_20s\_ .edge-pattern-solid{stroke-dasharray:0;}#chatgpt-mermaid-\_r_20s\_ .edge-thickness-invisible{stroke-width:0;fill:none;}#chatgpt-mermaid-\_r_20s\_ .edge-pattern-dashed{stroke-dasharray:3;}#chatgpt-mermaid-\_r_20s\_ .edge-pattern-dotted{stroke-dasharray:2;}#chatgpt-mermaid-\_r_20s\_ .marker{fill:rgb(175, 175, 175);stroke:rgb(175, 175, 175);}#chatgpt-mermaid-\_r_20s\_ .marker.cross{stroke:rgb(175, 175, 175);}#chatgpt-mermaid-\_r_20s\_ svg{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;}#chatgpt-mermaid-\_r_20s\_ p{margin:0;}#chatgpt-mermaid-\_r_20s\_ .label{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";color:rgb(237, 237, 237);}#chatgpt-mermaid-\_r_20s\_ .cluster-label text{fill:rgb(237, 237, 237);}#chatgpt-mermaid-\_r_20s\_ .cluster-label span{color:rgb(237, 237, 237);}#chatgpt-mermaid-\_r_20s\_ .cluster-label span p{background-color:transparent;}#chatgpt-mermaid-\_r_20s\_ .label text,#chatgpt-mermaid-\_r_20s\_ span{fill:rgb(237, 237, 237);color:rgb(237, 237, 237);}#chatgpt-mermaid-\_r_20s\_ .node rect,#chatgpt-mermaid-\_r_20s\_ .node circle,#chatgpt-mermaid-\_r_20s\_ .node ellipse,#chatgpt-mermaid-\_r_20s\_ .node polygon,#chatgpt-mermaid-\_r_20s\_ .node path{fill:rgb(9, 23, 44);stroke:rgb(31, 78, 148);stroke-width:1px;}#chatgpt-mermaid-\_r_20s\_ .rough-node .label text,#chatgpt-mermaid-\_r_20s\_ .node .label text,#chatgpt-mermaid-\_r_20s\_ .image-shape .label,#chatgpt-mermaid-\_r_20s\_ .icon-shape .label{text-anchor:middle;}#chatgpt-mermaid-\_r_20s\_ .node .katex path{fill:#000;stroke:#000;stroke-width:1px;}#chatgpt-mermaid-\_r_20s\_ .rough-node .label,#chatgpt-mermaid-\_r_20s\_ .node .label,#chatgpt-mermaid-\_r_20s\_ .image-shape .label,#chatgpt-mermaid-\_r_20s\_ .icon-shape .label{text-align:center;}#chatgpt-mermaid-\_r_20s\_ .node.clickable{cursor:pointer;}#chatgpt-mermaid-\_r_20s\_ .root .anchor path{fill:rgb(175, 175, 175)!important;stroke-width:0;stroke:rgb(175, 175, 175);}#chatgpt-mermaid-\_r_20s\_ .arrowheadPath{fill:rgb(175, 175, 175);}#chatgpt-mermaid-\_r_20s\_ .edgePath .path{stroke:rgb(175, 175, 175);stroke-width:1px;}#chatgpt-mermaid-\_r_20s\_ .flowchart-link{stroke:rgb(175, 175, 175);fill:none;}#chatgpt-mermaid-\_r_20s\_ .edgeLabel{background-color:rgb(0, 0, 0);text-align:center;}#chatgpt-mermaid-\_r_20s\_ .edgeLabel p{background-color:rgb(0, 0, 0);}#chatgpt-mermaid-\_r_20s\_ .edgeLabel rect{opacity:0.5;background-color:rgb(0, 0, 0);fill:rgb(0, 0, 0);}#chatgpt-mermaid-\_r_20s\_ .labelBkg{background-color:rgba(0, 0, 0, 0.5);}#chatgpt-mermaid-\_r_20s\_ .cluster rect{fill:rgb(48, 48, 48);stroke:rgba(255, 255, 255, 0.15);stroke-width:1px;}#chatgpt-mermaid-\_r_20s\_ .cluster text{fill:rgb(237, 237, 237);}#chatgpt-mermaid-\_r_20s\_ .cluster span{color:rgb(237, 237, 237);}#chatgpt-mermaid-\_r_20s\_ div.mermaidTooltip{position:absolute;text-align:center;max-width:200px;padding:2px;font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:12px;background:rgb(48, 48, 48);border:1px solid rgba(255, 255, 255, 0.15);border-radius:2px;pointer-events:none;z-index:100;}#chatgpt-mermaid-\_r_20s\_ .flowchartTitleText{text-anchor:middle;font-size:18px;fill:rgb(237, 237, 237);}#chatgpt-mermaid-\_r_20s\_ rect.text{fill:none;stroke-width:0;}#chatgpt-mermaid-\_r_20s\_ .icon-shape,#chatgpt-mermaid-\_r_20s\_ .image-shape{background-color:rgb(0, 0, 0);text-align:center;}#chatgpt-mermaid-\_r_20s\_ .icon-shape p,#chatgpt-mermaid-\_r_20s\_ .image-shape p{background-color:rgb(0, 0, 0);padding:2px;}#chatgpt-mermaid-\_r_20s\_ .icon-shape .label rect,#chatgpt-mermaid-\_r_20s\_ .image-shape .label rect{opacity:0.5;background-color:rgb(0, 0, 0);fill:rgb(0, 0, 0);}#chatgpt-mermaid-\_r_20s\_ .label-icon{display:inline-block;height:1em;overflow:visible;vertical-align:-0.125em;}#chatgpt-mermaid-\_r_20s\_ .node .label-icon path{fill:currentColor;stroke:revert;stroke-width:revert;}#chatgpt-mermaid-\_r_20s\_ .node .neo-node{stroke:rgb(31, 78, 148);}#chatgpt-mermaid-\_r_20s\_ [data-look="neo"].node rect,#chatgpt-mermaid-\_r_20s\_ [data-look="neo"].cluster rect,#chatgpt-mermaid-\_r_20s\_ [data-look="neo"].node polygon{stroke:url(#chatgpt-mermaid-\_r_20s\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_20s\_ [data-look="neo"].swimlane.cluster rect{filter:none;}#chatgpt-mermaid-\_r_20s\_ [data-look="neo"].node path{stroke:url(#chatgpt-mermaid-\_r_20s\_-gradient);stroke-width:1px;}#chatgpt-mermaid-\_r_20s\_ [data-look="neo"].node .outer-path{filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_20s\_ [data-look="neo"].node .neo-line path{stroke:rgb(31, 78, 148);filter:none;}#chatgpt-mermaid-\_r_20s\_ [data-look="neo"].node circle{stroke:url(#chatgpt-mermaid-\_r_20s\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_20s\_ [data-look="neo"].node circle .state-start{fill:#000000;}#chatgpt-mermaid-\_r_20s\_ [data-look="neo"].icon-shape .icon{fill:url(#chatgpt-mermaid-\_r_20s\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_20s\_ [data-look="neo"].icon-shape .icon-neo path{stroke:url(#chatgpt-mermaid-\_r_20s\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_20s\_ .node text{font-size:14px;font-weight:600;letter-spacing:normal;fill:rgb(153, 206, 255);}#chatgpt-mermaid-\_r_20s\_ .edgeLabels text{font-size:13px;font-weight:600;letter-spacing:-0.08px;fill:rgb(153, 206, 255);}#chatgpt-mermaid-\_r_20s\_ .node tspan[font-weight="normal"],#chatgpt-mermaid-\_r_20s\_ .edgeLabels tspan[font-weight="normal"]{font-weight:600;}#chatgpt-mermaid-\_r_20s\_ .edgeLabel .label rect{opacity:1;rx:13px;ry:13px;fill:rgb(0, 14, 26);stroke:rgb(26, 62, 95);stroke-width:1px;}#chatgpt-mermaid-\_r_20s\_ .node rect,#chatgpt-mermaid-\_r_20s\_ .node circle,#chatgpt-mermaid-\_r_20s\_ .node ellipse,#chatgpt-mermaid-\_r_20s\_ .node polygon,#chatgpt-mermaid-\_r_20s\_ .node path{fill:rgb(0, 40, 77);stroke:rgba(255, 255, 255, 0.1);stroke-width:1px;}#chatgpt-mermaid-\_r_20s\_ .node rect{rx:16px;ry:16px;}#chatgpt-mermaid-\_r_20s\_ .mermaid-decision .label-container{fill:rgb(0, 14, 26);stroke:rgb(26, 62, 95);stroke-dasharray:2,2;}#chatgpt-mermaid-\_r_20s\_ .edgePaths .flowchart-link{stroke:rgb(175, 175, 175);stroke-width:1px;stroke-linecap:round;stroke-linejoin:round;}#chatgpt-mermaid-\_r_20s\_ .marker{fill:rgb(175, 175, 175);stroke:rgb(175, 175, 175);}#chatgpt-mermaid-\_r_20s\_ :root{--mermaid-font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";}Ready taskAnalyze requirementsFind installed runtimesLoad usable modelsEligible models?Wait and explain whyScore candidatesReserve budget and capacityReservation valid?Start isolated workerMonitor executionOutcomeIndependent verificationRecovery policyApproval or interventionReview and integrationNoYesNoYesPassedRetryable failureNeeds user input

### Scheduling policies

Users should be able to select from a small number of understandable strategies.

| Policy        | Intended behavior                                      |
| ------------- | ------------------------------------------------------ |
| Auto Balanced | Optimize expected quality, cost and speed              |
| Best Quality  | Prefer strongest verified task performance             |
| Free Only     | Restrict to genuinely eligible zero-charge usage       |
| Cheapest      | Minimize estimated billed cost                         |
| Fastest       | Prefer low-latency, adequately capable models          |
| Local Only    | Use local inference endpoints                          |
| Custom        | Model allowlists, pins, quotas and task-specific rules |

For paid models, the user should set an explicit spending allowance. If the estimated spending exceeds the limit, ask for approval rather than silently escalating.

A free tier should never be interpreted as permission to launch unlimited parallel requests.

### Provider-level rate limits

Suppose three different models are available through the same OpenRouter account.

They are three model choices, but they may share a single provider-level quota or other account restrictions.

Track separate capacity constraints for:

| Constraint | Example                                       |
| ---------- | --------------------------------------------- |
| Machine    | Maximum simultaneous workers                  |
| Runtime    | OpenCode process/session limits               |
| Provider   | Requests per minute or account concurrency    |
| Model      | Model-specific throughput restrictions        |
| Account    | Credit balance or subscription quota          |
| Task       | Maximum permitted cost, duration and attempts |

When provider limits are unknown, start with conservative concurrency and adapt to observed `429` responses and documented reset information.

Rate limiting and quota exhaustion must not be confused with model incompetence. A temporary service failure should influence availability and reliability data, not unfairly reduce the model's coding-quality score.

## 9. Three important scenarios BarkCLI must handle

### Scenario A: Only OpenCode installed, several models available

Consider this simulated inventory:

| Model | Quality profile       | Access       |
| ----- | --------------------- | ------------ |
| A     | Fast, adequate coding | Free         |
| B     | Strong reasoning      | Paid         |
| C     | Strong implementation | Subscription |
| D     | Local, lightweight    | Offline      |

User request:

> Refactor the authentication layer, improve performance, add regression tests and update the documentation.

BarkCLI could create the following assignments:

| Task                 | Model selected   | Reason                                |
| -------------------- | ---------------- | ------------------------------------- |
| Explore repository   | A                | Low-cost comprehension                |
| Design refactor      | B                | Higher reasoning requirement          |
| Implement changes    | C                | Stronger task-specific coding history |
| Generate test cases  | A or C           | Depends on complexity                 |
| Security review      | B                | High-risk analysis                    |
| Update documentation | A                | Adequate capability, lower cost       |
| Run verification     | Rust test runner | No LLM required                       |

All model-based tasks still execute through OpenCode.

This is the key behavior you want.

### Scenario B: Only OpenCode installed, only one model available

BarkCLI should still work.

The planner, developer and reviewer can each use the same model in separate sessions with different role instructions and permissions.

But the product should not falsely imply that three distinct models are collaborating. The UI should show three workers sharing one model.

For tasks requiring independent review, BarkCLI can run separate evaluation sessions, but it should disclose that these use the same underlying model. They offer procedural separation, not full independence of model biases.

Parallelism should depend on quotas and machine capacity. If that one model is rate-limited, BarkCLI may need to execute tasks sequentially.

### Scenario C: OpenCode installed, but no usable models

Do not fall back to an invented provider or a model that requires payment.

The UI should say something like:

> OpenCode is installed, but no configured model is ready for execution. Connect a provider, configure local inference, or continue with manual task management.

Offer OpenCode's supported authentication flow and optional local model setup. For local inference, verify the necessary capabilities before accepting the model for autonomous coding.

The rest of BarkCLI should remain usable: task planning from deterministic rules, boards, Git worktrees, tests, memory and manual assignment should not require an LLM.

## 10. Intelligent failure recovery and model switching

This is one of the most challenging pieces.

Imagine Model A has already edited several files, then its provider becomes unavailable. BarkCLI decides Model B is the next suitable candidate.

It should not simply replace the model ID inside the same session and assume the new model understands everything.

### Safe model handoff

Create a structured handoff artifact:

```
task_id: auth-refactor-02

previous:
  runtime: opencode
  model: provider-a/model-a
  session_id: original-session

completed:
  - Updated authentication service
  - Added refresh-token validation

remaining:
  - Fix two failing tests
  - Complete rate-limit handling

workspace:
  branch: bark/auth-refactor-02
  status: unmerged

verification:
  passed: 12
  failed: 2

handoff:
  required_files:
    - src/auth/service.ts
    - src/auth/service.test.ts
  verified_context: true
```

This is an illustrative schema. In production, every claim should be linked to actual files, test results or events.

Model B should receive the relevant task context, current repository state, changes already made, failed tests and acceptance criteria.

It should not receive the entire previous chat by default.

### Failure matrix

| Failure                                  | Correct response                                         |
| ---------------------------------------- | -------------------------------------------------------- |
| Temporary provider outage                | Bounded retry with backoff                               |
| Quota exhausted                          | Wait for reset or choose eligible alternative            |
| Model lacks tool support                 | Remove candidate and reroute                             |
| Context overflow                         | Compact context or use a compatible larger-context model |
| Agent produces failing tests             | Return actionable failure to same or another worker      |
| Agent repeats same unsuccessful approach | Stop repeated retries and escalate strategy              |
| Agent stops responding                   | Detect timeout, inspect session before recovery          |
| OpenCode process crashes                 | Recover persisted task and worktree state                |
| Mac app closes unexpectedly              | Reconcile live processes on restart                      |
| Merge conflict                           | Use isolated conflict resolution and retest              |
| User cancels task                        | Stop execution and preserve useful artifacts             |

Model switching must respect task policies. If the user selected Free Only, a paid model must not be chosen without an explicit policy change.

For high-risk tasks, unexpected provider switching should require user approval.

A useful advanced feature is progress-based recovery: if the same model fails twice without meaningful improvement, BarkCLI should consider changing strategy, not just increasing the attempt count.

## 11. Design the BarkCLI Mac app around model-aware orchestration

I would organize the experience into five primary surfaces.

### A. Model Hub

The most important new screen.

Model Hub

Concept

Detected runtime: OpenCode

| Model   | Status     | Best use    |
| ------- | ---------- | ----------- |
| Model A | Ready      | Quick tasks |
| Model B | Ready      | Reasoning   |
| Model C | Unverified | Coding      |
| Model D | Offline    | Local tasks |

Source: OpenCode + local evaluations

Last scan: illustrative

Users should be able to inspect each model's capabilities, pricing, availability, preferred tasks and measured performance. This is also where they enable, disable or pin models.

### B. Team Builder

This screen maps roles to model-selection policies, not just fixed providers.

Example:

| Role          | Selection                            |
| ------------- | ------------------------------------ |
| Architect     | Auto, quality first                  |
| Developer     | Auto, best coding model              |
| Reviewer      | Auto, independent verified review    |
| Documentation | Auto, cheapest capable               |
| Security      | Approved high-confidence models only |

A role can still be pinned to a model when the user prefers deterministic assignments.

### C. Orchestra Canvas

A live DAG of work, showing tasks, dependencies, actual model assignments, worktrees and states.

Each task should answer: what is being done, by which model, why that model was selected, what files it may change, and what evidence is needed before completion.

### D. Execution Inspector

Clicking a worker shows its real session events, terminal output where applicable, model and variant, token usage, estimated cost, file diff, errors, recovery attempts and verification.

Model reassignment should be a first-class action, with a clear indication of what context will be preserved.

### E. Review and Delivery

This surface combines independent verification, cross-task integration, approval requests, security warnings and merge receipts.

You already have several elements of this, so extend them rather than building another unrelated review system.

## 12. Proposed Rust architecture

I would introduce the following internal services while keeping the existing BarkCLI runtime as the execution authority.

\#chatgpt-mermaid-\_r_21c\_{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;fill:rgb(237, 237, 237);}@keyframes edge-animation-frame{from{stroke-dashoffset:0;}}@keyframes dash{to{stroke-dashoffset:0;}}#chatgpt-mermaid-\_r_21c\_ .edge-animation-slow{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 50s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-\_r_21c\_ .edge-animation-fast{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 20s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-\_r_21c\_ .error-icon{fill:rgb(48, 48, 48);}#chatgpt-mermaid-\_r_21c\_ .error-text{fill:rgb(237, 237, 237);stroke:rgb(237, 237, 237);}#chatgpt-mermaid-\_r_21c\_ .edge-thickness-normal{stroke-width:1px;}#chatgpt-mermaid-\_r_21c\_ .edge-thickness-thick{stroke-width:3.5px;}#chatgpt-mermaid-\_r_21c\_ .edge-pattern-solid{stroke-dasharray:0;}#chatgpt-mermaid-\_r_21c\_ .edge-thickness-invisible{stroke-width:0;fill:none;}#chatgpt-mermaid-\_r_21c\_ .edge-pattern-dashed{stroke-dasharray:3;}#chatgpt-mermaid-\_r_21c\_ .edge-pattern-dotted{stroke-dasharray:2;}#chatgpt-mermaid-\_r_21c\_ .marker{fill:rgb(175, 175, 175);stroke:rgb(175, 175, 175);}#chatgpt-mermaid-\_r_21c\_ .marker.cross{stroke:rgb(175, 175, 175);}#chatgpt-mermaid-\_r_21c\_ svg{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;}#chatgpt-mermaid-\_r_21c\_ p{margin:0;}#chatgpt-mermaid-\_r_21c\_ .label{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";color:rgb(237, 237, 237);}#chatgpt-mermaid-\_r_21c\_ .cluster-label text{fill:rgb(237, 237, 237);}#chatgpt-mermaid-\_r_21c\_ .cluster-label span{color:rgb(237, 237, 237);}#chatgpt-mermaid-\_r_21c\_ .cluster-label span p{background-color:transparent;}#chatgpt-mermaid-\_r_21c\_ .label text,#chatgpt-mermaid-\_r_21c\_ span{fill:rgb(237, 237, 237);color:rgb(237, 237, 237);}#chatgpt-mermaid-\_r_21c\_ .node rect,#chatgpt-mermaid-\_r_21c\_ .node circle,#chatgpt-mermaid-\_r_21c\_ .node ellipse,#chatgpt-mermaid-\_r_21c\_ .node polygon,#chatgpt-mermaid-\_r_21c\_ .node path{fill:rgb(9, 23, 44);stroke:rgb(31, 78, 148);stroke-width:1px;}#chatgpt-mermaid-\_r_21c\_ .rough-node .label text,#chatgpt-mermaid-\_r_21c\_ .node .label text,#chatgpt-mermaid-\_r_21c\_ .image-shape .label,#chatgpt-mermaid-\_r_21c\_ .icon-shape .label{text-anchor:middle;}#chatgpt-mermaid-\_r_21c\_ .node .katex path{fill:#000;stroke:#000;stroke-width:1px;}#chatgpt-mermaid-\_r_21c\_ .rough-node .label,#chatgpt-mermaid-\_r_21c\_ .node .label,#chatgpt-mermaid-\_r_21c\_ .image-shape .label,#chatgpt-mermaid-\_r_21c\_ .icon-shape .label{text-align:center;}#chatgpt-mermaid-\_r_21c\_ .node.clickable{cursor:pointer;}#chatgpt-mermaid-\_r_21c\_ .root .anchor path{fill:rgb(175, 175, 175)!important;stroke-width:0;stroke:rgb(175, 175, 175);}#chatgpt-mermaid-\_r_21c\_ .arrowheadPath{fill:rgb(175, 175, 175);}#chatgpt-mermaid-\_r_21c\_ .edgePath .path{stroke:rgb(175, 175, 175);stroke-width:1px;}#chatgpt-mermaid-\_r_21c\_ .flowchart-link{stroke:rgb(175, 175, 175);fill:none;}#chatgpt-mermaid-\_r_21c\_ .edgeLabel{background-color:rgb(0, 0, 0);text-align:center;}#chatgpt-mermaid-\_r_21c\_ .edgeLabel p{background-color:rgb(0, 0, 0);}#chatgpt-mermaid-\_r_21c\_ .edgeLabel rect{opacity:0.5;background-color:rgb(0, 0, 0);fill:rgb(0, 0, 0);}#chatgpt-mermaid-\_r_21c\_ .labelBkg{background-color:rgba(0, 0, 0, 0.5);}#chatgpt-mermaid-\_r_21c\_ .cluster rect{fill:rgb(48, 48, 48);stroke:rgba(255, 255, 255, 0.15);stroke-width:1px;}#chatgpt-mermaid-\_r_21c\_ .cluster text{fill:rgb(237, 237, 237);}#chatgpt-mermaid-\_r_21c\_ .cluster span{color:rgb(237, 237, 237);}#chatgpt-mermaid-\_r_21c\_ div.mermaidTooltip{position:absolute;text-align:center;max-width:200px;padding:2px;font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:12px;background:rgb(48, 48, 48);border:1px solid rgba(255, 255, 255, 0.15);border-radius:2px;pointer-events:none;z-index:100;}#chatgpt-mermaid-\_r_21c\_ .flowchartTitleText{text-anchor:middle;font-size:18px;fill:rgb(237, 237, 237);}#chatgpt-mermaid-\_r_21c\_ rect.text{fill:none;stroke-width:0;}#chatgpt-mermaid-\_r_21c\_ .icon-shape,#chatgpt-mermaid-\_r_21c\_ .image-shape{background-color:rgb(0, 0, 0);text-align:center;}#chatgpt-mermaid-\_r_21c\_ .icon-shape p,#chatgpt-mermaid-\_r_21c\_ .image-shape p{background-color:rgb(0, 0, 0);padding:2px;}#chatgpt-mermaid-\_r_21c\_ .icon-shape .label rect,#chatgpt-mermaid-\_r_21c\_ .image-shape .label rect{opacity:0.5;background-color:rgb(0, 0, 0);fill:rgb(0, 0, 0);}#chatgpt-mermaid-\_r_21c\_ .label-icon{display:inline-block;height:1em;overflow:visible;vertical-align:-0.125em;}#chatgpt-mermaid-\_r_21c\_ .node .label-icon path{fill:currentColor;stroke:revert;stroke-width:revert;}#chatgpt-mermaid-\_r_21c\_ .node .neo-node{stroke:rgb(31, 78, 148);}#chatgpt-mermaid-\_r_21c\_ [data-look="neo"].node rect,#chatgpt-mermaid-\_r_21c\_ [data-look="neo"].cluster rect,#chatgpt-mermaid-\_r_21c\_ [data-look="neo"].node polygon{stroke:url(#chatgpt-mermaid-\_r_21c\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_21c\_ [data-look="neo"].swimlane.cluster rect{filter:none;}#chatgpt-mermaid-\_r_21c\_ [data-look="neo"].node path{stroke:url(#chatgpt-mermaid-\_r_21c\_-gradient);stroke-width:1px;}#chatgpt-mermaid-\_r_21c\_ [data-look="neo"].node .outer-path{filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_21c\_ [data-look="neo"].node .neo-line path{stroke:rgb(31, 78, 148);filter:none;}#chatgpt-mermaid-\_r_21c\_ [data-look="neo"].node circle{stroke:url(#chatgpt-mermaid-\_r_21c\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_21c\_ [data-look="neo"].node circle .state-start{fill:#000000;}#chatgpt-mermaid-\_r_21c\_ [data-look="neo"].icon-shape .icon{fill:url(#chatgpt-mermaid-\_r_21c\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_21c\_ [data-look="neo"].icon-shape .icon-neo path{stroke:url(#chatgpt-mermaid-\_r_21c\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_21c\_ .node text{font-size:14px;font-weight:600;letter-spacing:normal;fill:rgb(153, 206, 255);}#chatgpt-mermaid-\_r_21c\_ .edgeLabels text{font-size:13px;font-weight:600;letter-spacing:-0.08px;fill:rgb(153, 206, 255);}#chatgpt-mermaid-\_r_21c\_ .node tspan[font-weight="normal"],#chatgpt-mermaid-\_r_21c\_ .edgeLabels tspan[font-weight="normal"]{font-weight:600;}#chatgpt-mermaid-\_r_21c\_ .edgeLabel .label rect{opacity:1;rx:13px;ry:13px;fill:rgb(0, 14, 26);stroke:rgb(26, 62, 95);stroke-width:1px;}#chatgpt-mermaid-\_r_21c\_ .node rect,#chatgpt-mermaid-\_r_21c\_ .node circle,#chatgpt-mermaid-\_r_21c\_ .node ellipse,#chatgpt-mermaid-\_r_21c\_ .node polygon,#chatgpt-mermaid-\_r_21c\_ .node path{fill:rgb(0, 40, 77);stroke:rgba(255, 255, 255, 0.1);stroke-width:1px;}#chatgpt-mermaid-\_r_21c\_ .node rect{rx:16px;ry:16px;}#chatgpt-mermaid-\_r_21c\_ .mermaid-decision .label-container{fill:rgb(0, 14, 26);stroke:rgb(26, 62, 95);stroke-dasharray:2,2;}#chatgpt-mermaid-\_r_21c\_ .edgePaths .flowchart-link{stroke:rgb(175, 175, 175);stroke-width:1px;stroke-linecap:round;stroke-linejoin:round;}#chatgpt-mermaid-\_r_21c\_ .marker{fill:rgb(175, 175, 175);stroke:rgb(175, 175, 175);}#chatgpt-mermaid-\_r_21c\_ :root{--mermaid-font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";}Bark macOS UIOrchestra ServiceTask PlannerDependency SchedulerModel RouterCapability RegistryQuality and Cost IndexBudget and Quota ManagerExecution ManagerOpenCode AdapterOptional Other RuntimesSelected ModelVerifierIntegration ManagerReceipts and MemoryDurable Event Store

### Suggested Rust data structures

A model must have an identity independent of its execution runtime.

```
#[derive(Clone, Debug)]
pub struct ModelRef {
    pub runtime_id: String,
    pub provider_id: String,
    pub model_id: String,
    pub variant: Option<String>,
}

#[derive(Clone, Debug)]
pub struct ModelCapabilities {
    pub tool_calling: bool,
    pub vision: bool,
    pub structured_output: bool,
    pub context_tokens: Option<u64>,
    pub output_tokens: Option<u64>,
}

#[derive(Clone, Debug)]
pub enum ModelAvailability {
    Discovered,
    Ready,
    Unverified,
    RateLimited,
    QuotaExhausted,
    AuthRequired,
    Unsupported,
    Offline,
    Disabled,
}

#[derive(Clone, Debug)]
pub struct ModelAssignment {
    pub model: ModelRef,
    pub task_id: String,
    pub role_id: String,
    pub policy_id: String,
    pub selection_reason: String,
}
```

This is an architectural sketch, not a drop-in patch. Preserve compatibility with your existing serialized models during migration.

### New modules

| Proposed module              | Responsibility                                |
| ---------------------------- | --------------------------------------------- |
| `models/catalog.rs`          | Normalized discovered model inventory         |
| `models/discovery.rs`        | Runtime and model discovery                   |
| `models/capabilities.rs`     | Capability and eligibility checks             |
| `models/health.rs`           | Availability, quotas, provider errors         |
| `models/quality.rs`          | Benchmark and historical evaluation data      |
| `models/router.rs`           | Task-aware model ranking                      |
| `models/policy.rs`           | User preferences, allowlists and restrictions |
| `models/usage.rs`            | Token usage, cost estimates and accounting    |
| `agent/scheduler.rs`         | Unified dependency and capacity scheduling    |
| `runtime/opencode_server.rs` | Managed OpenCode server sessions              |
| `runtime/recovery.rs`        | Restart reconciliation and safe retries       |

Introduce these incrementally. Some existing code already owns related responsibilities, and it is better to refactor those modules than duplicate their behavior under new filenames.

### Storage design

I recommend keeping three distinct forms of data:

| Data                                                          | Storage                                     |
| ------------------------------------------------------------- | ------------------------------------------- |
| User-defined roles, routing policies, task specs              | Existing Git-friendly project configuration |
| Live sessions, leases, event projections, local metrics       | Rebuildable SQLite runtime store            |
| Executed work, receipts, verified decisions, long-term memory | Existing repository-backed BarkCLI records  |

Do not write every model token or streaming event to Git. Store the detailed operational trace locally, and publish concise verifiable summaries where needed.

## 13. Example user configuration

BarkCLI should work with sensible defaults, but advanced users will want control.

A conceptual configuration could look like this:

```
{
  "orchestra": {
    "runtime": {
      "mode": "auto",
      "preferred": ["opencode"]
    },
    "models": {
      "discovery": true,
      "selection": "task_aware",
      "benchmark_source": "hybrid",
      "allow_unverified": false,
      "allow_paid": false,
      "prefer_free": true,
      "prefer_local": false
    },
    "routing": {
      "planning": "quality",
      "implementation": "balanced",
      "testing": "balanced",
      "review": "quality",
      "documentation": "economy"
    },
    "resources": {
      "max_parallel_workers": 3,
      "max_task_attempts": 2,
      "max_task_minutes": 30
    },
    "budget": {
      "currency": "USD",
      "daily_limit": 0,
      "require_approval_for_paid": true
    },
    "verification": {
      "run_project_tests": true,
      "require_integration_tests": true,
      "require_human_merge_approval": true
    }
  }
}
```

This is a proposed BarkCLI schema, not a current working configuration.

With these values, the user has explicitly disabled paid execution. A zero daily limit should not block local inference or eligible free-tier models, but those providers' rate limits must still be respected.

If the default automatic routing has no suitable candidate, the system should explain why and offer available policy-compliant alternatives.

## 14. Phased engineering plan

I would split this upgrade into six milestones.

| Phase                       | Priority | Implementation                                                    | Acceptance condition                                                 |
| --------------------------- | -------- | ----------------------------------------------------------------- | -------------------------------------------------------------------- |
| 1. Discovery                | P0       | OpenCode inventory, model metadata, project-specific availability | One OpenCode installation exposes all eligible models correctly      |
| 2. Model-aware roles        | P0       | Dynamic roles, model policies, overrides                          | Multiple roles can use different models through OpenCode             |
| 3. Intelligent router       | P0       | Task classification, hard constraints, scoring, budget            | Every dispatch records an explainable model decision                 |
| 4. Reliable orchestration   | P0       | Capacity, dependencies, durable runs, recovery                    | Concurrent execution survives failures without duplicate task claims |
| 5. Performance intelligence | P1       | Local evaluations, success history, pricing and latency estimates | Model routing improves from verified observations                    |
| 6. Mac experience           | P1       | Model Hub, Team Builder, live canvas, inspector                   | Complete OpenCode-only workflow accessible through desktop UI        |

### The first five pull requests I would implement

PR 1: Separate runtime identity from model identity

Introduce normalized model structures, runtime capabilities, migration logic and tests. Preserve existing agent profiles and run records.

PR 2: Rich OpenCode model discovery

Replace the ID-only model list with project-aware inventory from supported OpenCode APIs. Add caching, availability states and safe fallback behavior.

PR 3: Dynamic model routing

Implement eligibility constraints, task classification, policies, model scoring, cost constraints and explainable selections. Keep manual model pins.

PR 4: Multi-model execution tests

Prove that one installed OpenCode runtime can start distinct sessions using different models and worktrees, including failure and restart scenarios.

PR 5: Model Hub and routing inspector

Expose discovered models, recommendations, assignments, routing reasons, budget state and per-run model history in the macOS app.

The most important milestone is PR 4. Until that is demonstrated with real sessions, the system remains a design rather than a validated orchestration capability.

## 15. How I would benchmark whether BarkCLI is actually better

I would compare three workflows on the same repository:

| Workflow              | Description                                         |
| --------------------- | --------------------------------------------------- |
| Baseline              | One OpenCode model handles the full task serially   |
| Static team           | Several BarkCLI agents use manually assigned models |
| Intelligent Orchestra | BarkCLI selects and schedules models dynamically    |

Use the same starting commit, task list, acceptable models, budget and verification criteria.

Measure:

| Metric                   | What success looks like                            |
| ------------------------ | -------------------------------------------------- |
| Verified task completion | More tasks passing independent acceptance criteria |
| End-to-end time          | Less time to deliver a verified result             |
| Effective cost           | Lower cost per verified successful task            |
| Human intervention       | Fewer unnecessary manual actions                   |
| Recovery success         | More interrupted runs safely completed             |
| Regressions              | Fewer integration failures                         |
| Resource overhead        | Lightweight idle and active execution              |
| Routing quality          | Better choices than a simple fixed-model baseline  |

Also compare model routing against an oracle that selects the best candidate in hindsight. This measures how much performance the router leaves on the table.

If dynamic routing does not outperform a static baseline, do not add more routing complexity until the data explains why.

## 16. Non-negotiable engineering safeguards

Before calling this production-ready, BarkCLI must satisfy these requirements:

- No fake availability: A catalog entry is not proof of usable access.
- No surprise paid models: User budget policies override optimization scores.
- No fake independence: Separate sessions using the same model must be identified as such.
- No uncontrolled spawning: All worker and subagent capacity is centrally accounted for.
- No unsafe default approvals: Shell, network, credential and destructive operations need enforceable policies.
- No assumed Git isolation: Worktrees do not provide process-level sandboxing.
- No blind retries: Persist state and inspect existing processes before restarting.
- No silent model switching: Record every model selection and handoff.
- No self-reported verification: Actual checks and evidence determine completion.
- No unnecessary installations: The minimum setup should remain one supported runtime with one usable model.

One security detail is particularly important: OpenCode's Plan agent is meant for planning, but its command execution permissions still depend on configuration. BarkCLI must enforce read-only requirements through real permissions and filesystem isolation, not through prompt wording alone.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://docs.dev.opencode.ai\&sz=32)

OpenCode



# Final architectural recommendation

## Build three intelligence layers on top of your existing BarkCLI core

Layer 1: Model Intelligence

Knows which models exist, what they support, whether they are usable, what they cost and how well they perform.

Layer 2: Task Intelligence

Understands task requirements, risk, dependencies, verification needs and which model is likely to succeed.

Layer 3: Orchestration Intelligence

Coordinates sessions, agents, worktrees, budgets, retries, collaboration, testing, review and integration.

The best initial implementation would be OpenCode-first but not OpenCode-dependent.

OpenCode is an especially powerful starting point because it already aggregates providers, models, tools and local inference. Build excellent model discovery and scheduling for it first. Then expose the same architecture to additional runtimes and direct model backends only when there is a concrete benefit.

Your real advantage will not be supporting 100 models on a selection screen. It will be understanding which models are usable, choosing the appropriate one for each engineering task, recovering intelligently when something fails, and producing verified results with minimal user effort.

That is the foundation I would use to turn BarkCLI from an agent management layer into a genuinely intelligent, multi-model software engineering orchestrator.
use super::queue::TaskRequest;

/// Build the full session prompt for a task: skills + goal + acceptance
/// criteria + file context + verify instructions + report-back contract.
///
/// This is the core-side version of the listener's prompt builder so that
/// MCP-spawned sessions (`session_spawn`) and CLI-spawned sessions get the
/// exact same packet as listener-driven agents.
pub fn build_task_prompt(task: &TaskRequest, branch: &str, skills_md: Option<&str>) -> String {
    let mut prompt = String::new();

    if let Some(skills) = skills_md {
        if !skills.trim().is_empty() {
            prompt.push_str(skills);
            if !skills.ends_with('\n') {
                prompt.push('\n');
            }
            prompt.push('\n');
        }
    }

    prompt.push_str(&format!("# Task: {}\n\n", task.title));

    if !task.description.is_empty() {
        prompt.push_str(&format!("## Description\n{}\n\n", task.description));
    }

    if !task.acceptance_criteria.is_empty() {
        prompt.push_str("## Acceptance Criteria\n");
        for ac in &task.acceptance_criteria {
            prompt.push_str(&format!("- [ ] {}\n", ac));
        }
        prompt.push('\n');
    }

    if !task.context_files.is_empty() {
        prompt.push_str("## Files to Modify\n");
        for f in &task.context_files {
            prompt.push_str(&format!("- `{}`", f.path));
            if !f.symbols.is_empty() {
                prompt.push_str(&format!(" (symbols: {})", f.symbols.join(", ")));
            }
            prompt.push('\n');
        }
        prompt.push('\n');
    }

    prompt.push_str(&format!("## Branch\n{}\n\n", branch));

    prompt.push_str("## Instructions\n");
    prompt.push_str("1. Read the relevant files to understand the current code\n");
    prompt.push_str("2. Implement the changes needed to satisfy the acceptance criteria\n");
    prompt.push_str("3. Run the repo's verification (tests/lint/build) to verify your changes\n");
    prompt.push_str("4. Commit your work on the task branch with a clear message\n");
    prompt.push_str("5. Report back: summary, files changed, commit SHA, test evidence, and\n");
    prompt.push_str("   an acceptance-criteria map (each criterion → met/how)\n");

    prompt
}

/// Render matched skills for a task into prompt markdown.
pub fn skills_for_task(task: &TaskRequest) -> Option<String> {
    let reg = crate::skills::SkillRegistry::load_all(None).ok()?;
    let ctx = crate::skills::registry::MatchContext {
        labels: vec![task.priority.clone()],
        area: None,
        title: task.title.clone(),
        pipeline_phase: "dispatch".into(),
    };
    reg.render_for_prompt(&ctx)
}

/// Build an invariant prefix prompt optimized for LLM prompt caching.
///
/// Static invariants (system role, core instructions, skills, architecture context)
/// are strictly placed at the prefix to maximize cache hits.
/// Dynamic context (task specifics, acceptance criteria, branch, diagnostics)
/// is placed at the suffix. An optional token budget guarantees size limits.
pub fn build_cached_task_prompt(
    task: &TaskRequest,
    branch: &str,
    skills_md: Option<&str>,
    arch_context: Option<&str>,
    max_tokens_budget: Option<usize>,
) -> String {
    let mut prompt = String::new();

    // 1. Static Prefix: System rules & base instructions
    prompt.push_str("# Identity and Operational Directives\n");
    prompt.push_str("You are an autonomous engineering agent managed by barkcli.\n");
    prompt.push_str("Your task is to satisfy the acceptance criteria with clean, verified code.\n\n");

    prompt.push_str("## Core Instructions\n");
    prompt.push_str("1. Inspect designated context files and symbols before modifying.\n");
    prompt.push_str("2. Implement the minimal clean changes required for acceptance criteria.\n");
    prompt.push_str("3. Run project verification suites (tests, linter, formatting) to verify.\n");
    prompt.push_str("4. Commit changes on the specified branch with a concise, descriptive message.\n");
    prompt.push_str("5. Produce an acceptance verification summary linking each criterion to its proof.\n\n");

    // 2. Static Prefix: Skills definitions
    if let Some(skills) = skills_md {
        if !skills.trim().is_empty() {
            prompt.push_str(skills);
            if !skills.ends_with('\n') {
                prompt.push('\n');
            }
            prompt.push('\n');
        }
    }

    // 3. Static Prefix: Architecture context if available
    if let Some(arch) = arch_context {
        if !arch.trim().is_empty() {
            prompt.push_str("## Architecture Context\n");
            prompt.push_str(arch);
            if !arch.ends_with('\n') {
                prompt.push('\n');
            }
            prompt.push('\n');
        }
    }

    // 4. Dynamic Suffix: Task specification & acceptance criteria
    prompt.push_str(&format!("## Task: {}\n\n", task.title));

    if !task.description.is_empty() {
        prompt.push_str(&format!("### Description\n{}\n\n", task.description));
    }

    if !task.acceptance_criteria.is_empty() {
        prompt.push_str("### Acceptance Criteria\n");
        for ac in &task.acceptance_criteria {
            prompt.push_str(&format!("- [ ] {}\n", ac));
        }
        prompt.push('\n');
    }

    // 5. Dynamic Suffix: Files to modify with AST symbol hints
    if !task.context_files.is_empty() {
        prompt.push_str("### Context Files\n");
        for f in &task.context_files {
            prompt.push_str(&format!("- `{}`", f.path));
            if !f.symbols.is_empty() {
                prompt.push_str(&format!(" (symbols: {})", f.symbols.join(", ")));
            }
            prompt.push('\n');
        }
        prompt.push('\n');
    }

    // 6. Dynamic Suffix: Target branch
    prompt.push_str(&format!("### Working Branch\n{}\n", branch));

    // Optional token budget enforcement (rough heuristic: ~4 chars per token)
    if let Some(budget) = max_tokens_budget {
        let max_chars = budget.saturating_mul(4);
        if prompt.len() > max_chars {
            prompt.truncate(max_chars);
            prompt.push_str("\n\n[Warning: prompt truncated to fit token budget]");
        }
    }

    prompt
}

/// Build a focused retry prompt injecting compiler diagnostics and test failure output.
pub fn build_retry_prompt(
    task: &TaskRequest,
    branch: &str,
    attempt: usize,
    failure_diagnostic: &str,
) -> String {
    let mut prompt = String::new();
    prompt.push_str(&format!("# Task Retry Attempt {}: {}\n\n", attempt, task.title));
    prompt.push_str(&format!("Branch: {}\n\n", branch));
    prompt.push_str("## Failure Diagnostic\n");
    prompt.push_str("The previous attempt failed acceptance verification. Review the diagnostic output below:\n\n");
    prompt.push_str("```\n");
    prompt.push_str(failure_diagnostic.trim());
    prompt.push_str("\n```\n\n");
    prompt.push_str("## Action Required\n");
    prompt.push_str("1. Diagnose the root cause of the failure above.\n");
    prompt.push_str("2. Fix the error in the task worktree.\n");
    prompt.push_str("3. Run the verification tests again to confirm the fix.\n");
    prompt.push_str("4. Commit the fix on the task branch.\n");
    prompt
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent::queue::create_task;

    #[test]
    fn test_build_task_prompt_sections() {
        let task = create_task(
            "card-1",
            "Fix login",
            "Login is broken",
            vec!["User can log in".into()],
            vec![],
            "high",
        );
        let prompt = build_task_prompt(&task, "bark/fix-login", Some("## Skills\n- Be nice\n"));
        assert!(prompt.contains("# Task: Fix login"));
        assert!(prompt.contains("## Skills"));
        assert!(prompt.contains("## Branch\nbark/fix-login"));
        assert!(prompt.contains("## Instructions"));
    }

    #[test]
    fn test_build_cached_task_prompt_order() {
        let task = create_task(
            "card-2",
            "Optimize database",
            "Queries are slow",
            vec!["Response time < 100ms".into()],
            vec![],
            "critical",
        );
        let prompt = build_cached_task_prompt(
            &task,
            "bark/opt-db",
            Some("## Skills\n- Indexing\n"),
            Some("Postgres schema v2"),
            Some(1000),
        );
        assert!(prompt.contains("# Identity and Operational Directives"));
        assert!(prompt.contains("## Architecture Context"));
        assert!(prompt.contains("## Task: Optimize database"));
        assert!(prompt.contains("### Working Branch\nbark/opt-db"));
    }

    #[test]
    fn test_build_retry_prompt() {
        let task = create_task(
            "card-3",
            "Add auth",
            "Add JWT",
            vec!["Tokens validate".into()],
            vec![],
            "medium",
        );
        let retry = build_retry_prompt(&task, "bark/auth", 2, "error[E0432]: unresolved import");
        assert!(retry.contains("# Task Retry Attempt 2: Add auth"));
        assert!(retry.contains("error[E0432]: unresolved import"));
        assert!(retry.contains("Branch: bark/auth"));
    }
}

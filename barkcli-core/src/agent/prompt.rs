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
}

pub fn builtin_skills() -> Vec<crate::skills::Skill> {
    vec![
        load_builtin(include_str!("builtin/mvp.md"), "mvp.md"),
        load_builtin(include_str!("builtin/planning.md"), "planning.md"),
        load_builtin(include_str!("builtin/scrum-master.md"), "scrum-master.md"),
        load_builtin(include_str!("builtin/test.md"), "test.md"),
        load_builtin(include_str!("builtin/tdd.md"), "tdd.md"),
        load_builtin(include_str!("builtin/code-review.md"), "code-review.md"),
        load_builtin(include_str!("builtin/security-audit.md"), "security-audit.md"),
        load_builtin(include_str!("builtin/performance-engineer.md"), "performance-engineer.md"),
        load_builtin(include_str!("builtin/database-architect.md"), "database-architect.md"),
        load_builtin(include_str!("builtin/architecture-review.md"), "architecture-review.md"),
    ]
}

fn load_builtin(content: &str, filename: &str) -> crate::skills::Skill {
    crate::skills::loader::parse_skill(content, filename, crate::skills::SkillSource::Builtin)
}

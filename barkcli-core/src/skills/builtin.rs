pub fn builtin_skills() -> Vec<crate::skills::Skill> {
    vec![
        load_builtin(include_str!("builtin/mvp.md"), "mvp.md"),
        load_builtin(include_str!("builtin/planning.md"), "planning.md"),
        load_builtin(include_str!("builtin/scrum-master.md"), "scrum-master.md"),
        load_builtin(include_str!("builtin/test.md"), "test.md"),
    ]
}

fn load_builtin(content: &str, filename: &str) -> crate::skills::Skill {
    crate::skills::loader::parse_skill(content, filename, crate::skills::SkillSource::Builtin)
}

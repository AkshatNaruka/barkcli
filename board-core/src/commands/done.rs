use anyhow::Result;

pub fn run(board_name: &str, id: &str) -> Result<()> {
    crate::commands::card::move_cmd::run(board_name, &[id.to_string(), "done".into()])
}

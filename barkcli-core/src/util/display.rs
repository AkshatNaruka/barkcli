use comfy_table::Table;
use comfy_table::presets::ASCII_MARKDOWN;

pub fn table() -> Table {
    let mut t = Table::new();
    t.load_preset(ASCII_MARKDOWN);
    t
}



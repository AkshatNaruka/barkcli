use comfy_table::presets::UTF8_FULL;
use comfy_table::{Attribute, Cell, ContentArrangement, Table};

/// Professional table factory — UTF8 borders, dynamic layout, styled headers.
pub fn table() -> Table {
    let mut t = Table::new();
    t.load_preset(UTF8_FULL)
        .set_content_arrangement(ContentArrangement::Dynamic)
        .set_width(100);
    t
}

/// Styled header row — bold.
pub fn header(cols: Vec<&str>) -> Vec<Cell> {
    cols.into_iter()
        .map(|c| Cell::new(c).add_attribute(Attribute::Bold))
        .collect()
}

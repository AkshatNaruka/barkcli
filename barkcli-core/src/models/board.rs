use serde::{Deserialize, Serialize};

use crate::models::card::Card;
use crate::models::column::Column;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Board {
    pub title: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub columns: Vec<Column>,
    #[serde(default)]
    pub cards: Vec<Card>,
}

impl Board {
    pub fn new(title: impl Into<String>) -> Self {
        Self {
            title: title.into(),
            description: None,
            columns: vec![
                Column::new("todo", "Todo"),
                Column::new("doing", "Doing"),
                Column::new("review", "Review"),
                Column::new("done", "Done"),
            ],
            cards: Vec::new(),
        }
    }
}

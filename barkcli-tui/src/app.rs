use anyhow::{Context, Result};
use barkcli_core::models::{Board, Card};
use barkcli_core::storage::board_file::{read_board, write_board};
use barkcli_core::storage::history;
use barkcli_core::util::slug::unique_slug;
use chrono::Utc;
use ratatui::{style::Color, Terminal};
use crossterm::event::{self, Event, KeyEventKind};

use crate::handlers;
use crate::ui;

#[derive(Clone, Copy, PartialEq)]
pub enum AppMode {
    BoardPicker,
    Normal,
    FilterInput,
    CommandPalette,
    AddingTitle,
    EditingCard,
    ViewingDetail,
    ConfirmDelete,
}

#[derive(Clone, Copy, PartialEq)]
pub enum EditField {
    Title,
    Description,
    Priority,
    Labels,
    Assignee,
    Done,
}

#[derive(Clone, Copy, PartialEq)]
pub enum Theme {
    Dark,
    Light,
}

pub struct App {
    pub board: Board,
    pub board_name: String,
    pub all_boards: Vec<String>,

    pub focused_column: usize,
    pub card_focus: usize,

    pub filter: String,
    pub filter_query: ParsedQuery,

    pub mode: AppMode,

    pub edit_buffer: String,
    pub edit_field: EditField,
    pub edit_card_idx: Option<usize>,

    pub should_quit: bool,

    pub theme: Theme,
    pub palette_matches: Vec<String>,
}

#[derive(Clone, Default)]
pub struct ParsedQuery {
    pub text: String,
    pub column: Option<String>,
    pub priority: Option<String>,
    pub label: Option<String>,
    pub assignee: Option<String>,
    pub is_raw: String,
}

impl App {
    pub fn from_board_name(name: &str) -> Result<Self> {
        let board = read_board(name).context(format!("board '{}' not found", name))?;
        Ok(Self {
            board,
            board_name: name.to_string(),
            all_boards: Vec::new(),
            focused_column: 0,
            card_focus: 0,
            filter: String::new(),
            filter_query: ParsedQuery::default(),
            mode: AppMode::Normal,
            edit_buffer: String::new(),
            edit_field: EditField::Title,
            edit_card_idx: None,
            should_quit: false,
            theme: Theme::Dark,
            palette_matches: Vec::new(),
        })
    }

    pub fn for_picker(boards: Vec<String>) -> Self {
        Self {
            board: Board::new(""),
            board_name: String::new(),
            all_boards: boards,
            focused_column: 0,
            card_focus: 0,
            filter: String::new(),
            filter_query: ParsedQuery::default(),
            mode: AppMode::BoardPicker,
            edit_buffer: String::new(),
            edit_field: EditField::Title,
            edit_card_idx: None,
            should_quit: false,
            theme: Theme::Dark,
            palette_matches: Vec::new(),
        }
    }

    pub fn cards_in_column(&self, col_idx: usize) -> Vec<(usize, &Card)> {
        if col_idx >= self.board.columns.len() {
            return Vec::new();
        }
        let col_id = &self.board.columns[col_idx].id;
        let all: Vec<(usize, &Card)> = self
            .board
            .cards
            .iter()
            .enumerate()
            .filter(|(_, c)| c.column == *col_id)
            .collect();

        let query = &self.filter_query;
        let mut cards: Vec<(usize, &Card)> = all
            .into_iter()
            .filter(|(_, c)| {
                if !query.text.is_empty()
                    && !c.title.to_lowercase().contains(&query.text.to_lowercase())
                    && !c.labels.iter().any(|l| l.to_lowercase().contains(&query.text.to_lowercase()))
                    && !c.assignee.as_deref().unwrap_or("").to_lowercase().contains(&query.text.to_lowercase())
                {
                    return false;
                }
                if let Some(ref p) = query.priority {
                    if c.priority != *p {
                        return false;
                    }
                }
                if let Some(ref a) = query.assignee {
                    if c.assignee.as_deref().unwrap_or("") != a.as_str() {
                        return false;
                    }
                }
                if let Some(ref l) = query.label {
                    if !c.labels.iter().any(|x| x == l) {
                        return false;
                    }
                }
                if let Some(ref col) = query.column {
                    if c.column != *col {
                        return false;
                    }
                }
                true
            })
            .collect();

        // Also check raw filter for backward compat
        if !self.filter.is_empty() && query.text.is_empty() && query.priority.is_none() && query.label.is_none() {
            let flt = self.filter.to_lowercase();
            cards.retain(|(_, c)| {
                c.title.to_lowercase().contains(&flt)
                    || c.labels.iter().any(|l| l.to_lowercase().contains(&flt))
                    || c.assignee.as_deref().unwrap_or("").to_lowercase().contains(&flt)
            });
        } else if !query.is_raw.is_empty() {
            let raw = query.is_raw.to_lowercase();
            cards.retain(|(_, c)| {
                c.title.to_lowercase().contains(&raw)
                    || c.labels.iter().any(|l| l.to_lowercase().contains(&raw))
                    || c.assignee.as_deref().unwrap_or("").to_lowercase().contains(&raw)
            });
        }
        cards
    }

    pub fn focused_column_card_count(&self) -> usize {
        self.cards_in_column(self.focused_column).len()
    }

    pub fn selected_card(&self) -> Option<(usize, &Card)> {
        let cards = self.cards_in_column(self.focused_column);
        if cards.is_empty() {
            return None;
        }
        let idx = self.card_focus.min(cards.len() - 1);
        Some(cards[idx])
    }

    pub fn parse_query(&mut self) {
        if self.filter.is_empty() {
            self.filter_query = ParsedQuery::default();
            return;
        }
        // Check for query syntax: key:value pairs
        let mut text_parts = Vec::new();
        let mut column = None;
        let mut priority = None;
        let mut label = None;
        let mut assignee = None;
        for token in self.filter.split_whitespace() {
            if let Some((key, value)) = token.split_once(':') {
                match key {
                    "is" | "column" | "col" => column = Some(value.to_string()),
                    "priority" | "pri" | "p" => priority = Some(value.to_string()),
                    "label" | "l" => label = Some(value.to_string()),
                    "assignee" | "a" | "who" => assignee = Some(value.to_string()),
                    _ => text_parts.push(token),
                }
            } else {
                text_parts.push(token);
            }
        }
        self.filter_query = ParsedQuery {
            text: text_parts.join(" "),
            column,
            priority,
            label,
            assignee,
            is_raw: String::new(),
        }
    }

    pub fn save(&mut self) -> Result<()> {
        write_board(&self.board_name, &self.board).context("failed to write board")
    }

    pub fn run(&mut self, terminal: &mut Terminal<impl ratatui::backend::Backend>) -> Result<()> {
        while !self.should_quit {
            terminal.draw(|f| ui::draw(f, self))?;
            if let Event::Key(key) = event::read()? {
                if key.kind == KeyEventKind::Press {
                    handlers::handle_key(self, key)?;
                }
            }
        }
        Ok(())
    }

    pub fn add_card(&mut self, title: &str) -> Result<String> {
        let column_id = if self.focused_column < self.board.columns.len() {
            self.board.columns[self.focused_column].id.clone()
        } else {
            self.board.columns[0].id.clone()
        };
        let existing_ids: Vec<String> = self.board.cards.iter().map(|c| c.id.clone()).collect();
        let id = unique_slug(title, &existing_ids);
        let now = Utc::now();
        let card = Card {
            id: id.clone(),
            title: title.to_string(),
            description: None,
            column: column_id,
            priority: "medium".to_string(),
            labels: Vec::new(),
            assignee: None,
            checklist: Vec::new(),
            due_date: None,
            comments: Vec::new(),
            blocked_by: None,
            attachments: Vec::new(),
            pinned: false,
            created_at: now,
            updated_at: now,
        };
        self.board.cards.push(card);
        let _ = history::log_add(&self.board_name, &id, title);
        self.save()?;
        Ok(id)
    }

    pub fn remove_card(&mut self, idx: usize) -> Result<()> {
        if idx < self.board.cards.len() {
            let card = &self.board.cards[idx];
            let _ = history::log_remove(&self.board_name, &card.id, &card.title);
            self.board.cards.remove(idx);
            self.save()?;
        }
        Ok(())
    }

    pub fn update_card(
        &mut self, idx: usize, title: &str, description: &str,
        priority: &str, labels: &str, assignee: &str,
    ) -> Result<()> {
        if idx < self.board.cards.len() {
            let card = &mut self.board.cards[idx];
            let old_title = card.title.clone();
            let old_priority = card.priority.clone();
            card.title = title.to_string();
            card.description = if description.is_empty() { None } else { Some(description.to_string()) };
            card.priority = priority.to_string();
            card.labels = labels.split(',').map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect();
            card.assignee = if assignee.is_empty() { None } else { Some(assignee.to_string()) };
            card.updated_at = Utc::now();
            if card.title != old_title {
                let _ = history::log_update(&self.board_name, &card.id, "title", &old_title, &card.title);
            }
            if card.priority != old_priority {
                let _ = history::log_update(&self.board_name, &card.id, "priority", &old_priority, &card.priority);
            }
            self.save()?;
        }
        Ok(())
    }

    pub fn move_card_to_column(&mut self, card_idx: usize, target_col: usize) -> Result<()> {
        if card_idx < self.board.cards.len() && target_col < self.board.columns.len() {
            let target_id = &self.board.columns[target_col].id.clone();
            let old_col = self.board.cards[card_idx].column.clone();
            self.board.cards[card_idx].column = target_id.clone();
            self.board.cards[card_idx].updated_at = Utc::now();
            let _ = history::log_move(&self.board_name, &self.board.cards[card_idx].id, &old_col, target_id);
            self.save()?;
        }
        Ok(())
    }

    pub fn theme_bg(&self) -> Color {
        match self.theme {
            Theme::Dark => Color::Rgb(10, 10, 15),
            Theme::Light => Color::Rgb(245, 245, 250),
        }
    }

    pub fn theme_text(&self) -> Color {
        match self.theme {
            Theme::Dark => Color::Rgb(220, 220, 230),
            Theme::Light => Color::Rgb(30, 30, 40),
        }
    }

    pub fn theme_col_bg(&self) -> Color {
        match self.theme {
            Theme::Dark => Color::Rgb(18, 18, 28),
            Theme::Light => Color::Rgb(235, 235, 245),
        }
    }

    pub fn theme_card_bg(&self) -> Color {
        match self.theme {
            Theme::Dark => Color::Rgb(25, 25, 38),
            Theme::Light => Color::Rgb(255, 255, 255),
        }
    }

    pub fn theme_muted(&self) -> Color {
        match self.theme {
            Theme::Dark => Color::Rgb(80, 80, 100),
            Theme::Light => Color::Rgb(160, 160, 170),
        }
    }
}

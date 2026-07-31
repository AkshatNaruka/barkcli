use anyhow::{Context, Result};
use board_core::models::{Board, Card};
use board_core::storage::board_file::{read_board, write_board};
use board_core::storage::history;
use board_core::util::slug::unique_slug;
use chrono::Utc;
use ratatui::Terminal;
use crossterm::event::{self, Event, KeyEventKind};

use crate::handlers;
use crate::ui;

#[derive(Clone, Copy, PartialEq)]
pub enum AppMode {
    BoardPicker,
    Normal,
    FilterInput,
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
    Column,
    Done,
}

pub struct App {
    pub board: Board,
    pub board_name: String,
    pub all_boards: Vec<String>,

    pub focused_column: usize,
    pub card_focus: usize,

    pub filter: String,

    pub mode: AppMode,

    pub edit_buffer: String,
    pub edit_field: EditField,
    pub edit_card_idx: Option<usize>,

    pub should_quit: bool,
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
            mode: AppMode::Normal,
            edit_buffer: String::new(),
            edit_field: EditField::Title,
            edit_card_idx: None,
            should_quit: false,
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
            mode: AppMode::BoardPicker,
            edit_buffer: String::new(),
            edit_field: EditField::Title,
            edit_card_idx: None,
            should_quit: false,
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
        if self.filter.is_empty() {
            return all;
        }
        let flt = self.filter.to_lowercase();
        all.into_iter()
            .filter(|(_, c)| {
                c.title.to_lowercase().contains(&flt)
                    || c.labels.iter().any(|l| l.to_lowercase().contains(&flt))
                    || c.assignee.as_deref().unwrap_or("").to_lowercase().contains(&flt)
            })
            .collect()
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

    pub fn save(&mut self) -> Result<()> {
        write_board(&self.board_name, &self.board)
            .context("failed to write board")
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
            attachments: Vec::new(),
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

    pub fn update_card(&mut self, idx: usize, title: &str, description: &str, priority: &str, labels: &str, assignee: &str) -> Result<()> {
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
}

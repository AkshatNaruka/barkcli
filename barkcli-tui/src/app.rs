use anyhow::{Context, Result};
use barkcli_core::agent::identity::{AgentIdentity, AgentRegistry, AgentStatus};
use barkcli_core::agent::queue::{TaskQueue, TaskRequest, TaskStatus};
use barkcli_core::code::index::ScoredFile;
use barkcli_core::code::SymbolIndex;
use barkcli_core::models::card::LinkType;
use barkcli_core::models::context::BoardContext;
use barkcli_core::models::{Board, Card, Sprint};
use barkcli_core::storage::board_dir::find_project_root;
use barkcli_core::storage::board_file::{read_board, write_board};
use barkcli_core::storage::context::read_context;
use barkcli_core::storage::history;
use barkcli_core::storage::sprints;
use barkcli_core::util::slug::unique_slug;
use chrono::{DateTime, Local, Utc};
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
    CodeSearch,
    LinkTarget,
    LinkKind,
    UnlinkTarget,
    AgentDetail,
    OrchestrateTask,
}

#[derive(Clone, Copy, PartialEq)]
pub enum Tab {
    Board,
    List,
    Tree,
    Agenda,
    Reports,
    Code,
    Agents,
    Orchestrate,
}

impl Tab {
    pub fn from_key(c: char) -> Option<Tab> {
        match c {
            '1' => Some(Tab::Board),
            '2' => Some(Tab::List),
            '3' => Some(Tab::Tree),
            '4' => Some(Tab::Agenda),
            '5' => Some(Tab::Reports),
            '6' => Some(Tab::Code),
            '7' => Some(Tab::Agents),
            '8' => Some(Tab::Orchestrate),
            _ => None,
        }
    }
    pub fn label(&self) -> &'static str {
        match self {
            Tab::Board => "1 Board",
            Tab::List => "2 List",
            Tab::Tree => "3 Tree",
            Tab::Agenda => "4 Agenda",
            Tab::Reports => "5 Reports",
            Tab::Code => "6 Code",
            Tab::Agents => "7 Agents",
            Tab::Orchestrate => "8 Orchestrate",
        }
    }
    pub fn next(&self) -> Tab {
        match self {
            Tab::Board => Tab::List,
            Tab::List => Tab::Tree,
            Tab::Tree => Tab::Agenda,
            Tab::Agenda => Tab::Reports,
            Tab::Reports => Tab::Code,
            Tab::Code => Tab::Agents,
            Tab::Agents => Tab::Orchestrate,
            Tab::Orchestrate => Tab::Board,
        }
    }
    pub fn prev(&self) -> Tab {
        match self {
            Tab::Board => Tab::Orchestrate,
            Tab::List => Tab::Board,
            Tab::Tree => Tab::List,
            Tab::Agenda => Tab::Tree,
            Tab::Reports => Tab::Agenda,
            Tab::Code => Tab::Reports,
            Tab::Agents => Tab::Code,
            Tab::Orchestrate => Tab::Agents,
        }
    }
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

#[derive(Clone, Copy, PartialEq)]
pub enum SortKey {
    Priority,
    Title,
    Effort,
    Due,
}

pub struct ReportRow {
    pub label: String,
    pub count: u64,
    pub effort: u64,
}

pub struct SprintBurndown {
    pub name: String,
    pub state: String,
    pub total: u64,
    pub done: u64,
    pub effort_total: u64,
    pub effort_done: u64,
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
    pub tab: Tab,

    pub edit_buffer: String,
    pub edit_field: EditField,
    pub edit_card_idx: Option<usize>,

    pub should_quit: bool,

    pub theme: Theme,
    pub palette_matches: Vec<String>,

    pub sprints: Vec<Sprint>,
    pub context: BoardContext,
    pub detail_card_id: Option<String>,
    pub list_sort: SortKey,
    pub code_query: String,
    pub code_results: Vec<ScoredFile>,
    pub status_msg: Option<String>,
    pub link_state: LinkState,

    // Agent & orchestration state
    pub agents: Vec<AgentIdentity>,
    pub agent_cursor: usize,
    pub task_queue: Vec<TaskRequest>,
    pub task_cursor: usize,
    pub orchestration_status: Option<String>,
}

pub enum LinkState {
    None,
    /// pending link: (source card id, target id)
    Target { from: String },
    /// pending link: (source card id, target id) — choose type
    Kind { from: String, target: String },
    /// pending unlink: (source card id)
    Unlink { from: String },
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
        let mut app = Self {
            board,
            board_name: name.to_string(),
            all_boards: Vec::new(),
            focused_column: 0,
            card_focus: 0,
            filter: String::new(),
            filter_query: ParsedQuery::default(),
            mode: AppMode::Normal,
            tab: Tab::Board,
            edit_buffer: String::new(),
            edit_field: EditField::Title,
            edit_card_idx: None,
            should_quit: false,
            theme: Theme::Dark,
            palette_matches: Vec::new(),
            sprints: sprints::read_sprints(name).unwrap_or_default(),
            context: read_context(name).unwrap_or_default(),
            detail_card_id: None,
            list_sort: SortKey::Priority,
            code_query: String::new(),
            code_results: Vec::new(),
            status_msg: None,
            link_state: LinkState::None,
            agents: Vec::new(),
            agent_cursor: 0,
            task_queue: Vec::new(),
            task_cursor: 0,
            orchestration_status: None,
        };
        app.load_agents();
        app.load_task_queue();
        Ok(app)
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
            tab: Tab::Board,
            edit_buffer: String::new(),
            edit_field: EditField::Title,
            edit_card_idx: None,
            should_quit: false,
            theme: Theme::Dark,
            palette_matches: Vec::new(),
            sprints: Vec::new(),
            context: BoardContext::new(),
            detail_card_id: None,
            list_sort: SortKey::Priority,
            code_query: String::new(),
            code_results: Vec::new(),
            status_msg: None,
            link_state: LinkState::None,
            agents: Vec::new(),
            agent_cursor: 0,
            task_queue: Vec::new(),
            task_cursor: 0,
            orchestration_status: None,
        }
    }

    // ── Filtering ──

    fn matches_filter(&self, c: &Card) -> bool {
        let q = &self.filter_query;
        if !q.text.is_empty()
            && !c.title.to_lowercase().contains(&q.text.to_lowercase())
            && !c.labels.iter().any(|l| l.to_lowercase().contains(&q.text.to_lowercase()))
            && !c.assignee.as_deref().unwrap_or("").to_lowercase().contains(&q.text.to_lowercase())
        {
            return false;
        }
        if let Some(ref p) = q.priority {
            if c.priority != *p {
                return false;
            }
        }
        if let Some(ref a) = q.assignee {
            if c.assignee.as_deref().unwrap_or("") != a.as_str() {
                return false;
            }
        }
        if let Some(ref l) = q.label {
            if !c.labels.iter().any(|x| x == l) {
                return false;
            }
        }
        if let Some(ref col) = q.column {
            if c.column != *col {
                return false;
            }
        }
        true
    }

    pub fn cards_in_column(&self, col_idx: usize) -> Vec<(usize, &Card)> {
        if col_idx >= self.board.columns.len() {
            return Vec::new();
        }
        let col_id = &self.board.columns[col_idx].id;
        let mut cards: Vec<(usize, &Card)> = self
            .board
            .cards
            .iter()
            .enumerate()
            .filter(|(_, c)| c.column == *col_id && self.matches_filter(c))
            .collect();

        if !self.filter.is_empty() && self.filter_query.text.is_empty()
            && self.filter_query.priority.is_none() && self.filter_query.label.is_none()
        {
            let flt = self.filter.to_lowercase();
            cards.retain(|(_, c)| {
                c.title.to_lowercase().contains(&flt)
                    || c.labels.iter().any(|l| l.to_lowercase().contains(&flt))
                    || c.assignee.as_deref().unwrap_or("").to_lowercase().contains(&flt)
            });
        } else if !self.filter_query.is_raw.is_empty() {
            let raw = self.filter_query.is_raw.to_lowercase();
            cards.retain(|(_, c)| {
                c.title.to_lowercase().contains(&raw)
                    || c.labels.iter().any(|l| l.to_lowercase().contains(&raw))
                    || c.assignee.as_deref().unwrap_or("").to_lowercase().contains(&raw)
            });
        }
        cards
    }

    fn all_filtered(&self) -> Vec<(usize, &Card)> {
        self.board
            .cards
            .iter()
            .enumerate()
            .filter(|(_, c)| self.matches_filter(c))
            .collect()
    }

    /// Cards shown in the current tab (board tab = focused column).
    pub fn visible_cards(&self) -> Vec<(usize, &Card)> {
        match self.tab {
            Tab::Board => self.cards_in_column(self.focused_column),
            Tab::List => self.sorted_cards(),
            Tab::Tree => self.tree_flat(),
            Tab::Agenda => self.agenda_flat(),
            Tab::Reports | Tab::Code | Tab::Agents | Tab::Orchestrate => Vec::new(),
        }
    }

    fn priority_rank(p: &str) -> u8 {
        match p {
            "high" => 0,
            "medium" => 1,
            "low" => 2,
            _ => 3,
        }
    }

    fn sorted_cards(&self) -> Vec<(usize, &Card)> {
        let mut cards = self.all_filtered();
        match self.list_sort {
            SortKey::Priority => cards.sort_by_key(|(_, c)| Self::priority_rank(&c.priority)),
            SortKey::Title => cards.sort_by_key(|(_, c)| c.title.to_lowercase()),
            SortKey::Effort => cards.sort_by_key(|(_, c)| c.effort.unwrap_or(0)),
            SortKey::Due => {
                cards.sort_by_key(|(_, c)| c.due_date.clone().unwrap_or_else(|| "9999".into()));
                cards.reverse();
                cards.sort_by_key(|(_, c)| c.due_date.is_none());
            }
        }
        cards
    }

    // ── Tree ──

    fn tree_flat(&self) -> Vec<(usize, &Card)> {
        let mut out: Vec<(usize, &Card)> = Vec::new();
        let order: Vec<String> = self.board.cards.iter().map(|c| c.id.clone()).collect();
        let mut roots: Vec<String> = self
            .board
            .cards
            .iter()
            .filter(|c| !c.links.iter().any(|l| l.ty == LinkType::Parent))
            .map(|c| c.id.clone())
            .collect();
        roots.sort_by_key(|r| order.iter().position(|c| c == r).unwrap_or(usize::MAX));
        for root in &roots {
            self.tree_node(root, &mut out);
        }
        out
    }

    fn tree_node<'a>(&'a self, id: &str, out: &mut Vec<(usize, &'a Card)>) {
        let Some((idx, card)) = self.board.cards.iter().enumerate().find(|(_, c)| c.id == id) else {
            return;
        };
        out.push((idx, card));
        let order: Vec<String> = self.board.cards.iter().map(|c| c.id.clone()).collect();
        let mut children: Vec<String> = card
            .links
            .iter()
            .filter(|l| l.ty == LinkType::Child)
            .map(|l| l.target.clone())
            .collect();
        children.sort_by_key(|c| order.iter().position(|x| x == c).unwrap_or(usize::MAX));
        for child in children {
            self.tree_node(&child, out);
        }
    }

    // ── Agenda ──

    fn agenda_flat(&self) -> Vec<(usize, &Card)> {
        let (o, t, n, l) = self.agenda_sections();
        o.into_iter().chain(t).chain(n).chain(l).map(|(i, c)| (i, c)).collect()
    }

    pub fn agenda_sections(&self) -> (Vec<(usize, &Card)>, Vec<(usize, &Card)>, Vec<(usize, &Card)>, Vec<(usize, &Card)>) {
        let today = Local::now().format("%Y-%m-%d").to_string();
        let mut overdue = Vec::new();
        let mut today_cards = Vec::new();
        let mut next7 = Vec::new();
        let mut later = Vec::new();
        for (i, c) in self.all_filtered() {
            let Some(due) = &c.due_date else { continue };
            let d = &due[..10.min(due.len())];
            let days = days_until(d, &today);
            if c.column == "done" {
                continue;
            }
            if days < 0 {
                overdue.push((i, c));
            } else if days == 0 {
                today_cards.push((i, c));
            } else if days <= 7 {
                next7.push((i, c));
            } else {
                later.push((i, c));
            }
        }
        overdue.sort_by_key(|(_, c)| c.due_date.clone());
        today_cards.sort_by_key(|(_, c)| c.due_date.clone());
        next7.sort_by_key(|(_, c)| c.due_date.clone());
        later.sort_by_key(|(_, c)| c.due_date.clone());
        (overdue, today_cards, next7, later)
    }

    // ── Reports ──

    pub fn report_columns(&self) -> Vec<ReportRow> {
        self.board
            .columns
            .iter()
            .map(|col| {
                let cards: Vec<&Card> = self.board.cards.iter().filter(|c| c.column == col.id).collect();
                ReportRow {
                    label: col.name.clone(),
                    count: cards.len() as u64,
                    effort: cards.iter().map(|c| c.effort.unwrap_or(0) as u64).sum(),
                }
            })
            .collect()
    }

    pub fn report_areas(&self) -> Vec<ReportRow> {
        let mut areas: Vec<(String, u64, u64)> = Vec::new();
        for c in &self.board.cards {
            let key = c.area.clone().unwrap_or_else(|| "(none)".into());
            if let Some(e) = areas.iter_mut().find(|(k, _, _)| *k == key) {
                e.1 += 1;
                e.2 += c.effort.unwrap_or(0) as u64;
            } else {
                areas.push((key, 1, c.effort.unwrap_or(0) as u64));
            }
        }
        areas.sort_by_key(|(_, _, e)| std::cmp::Reverse(*e));
        areas.into_iter().map(|(label, count, effort)| ReportRow { label, count, effort }).collect()
    }

    pub fn sprint_burndowns(&self) -> Vec<SprintBurndown> {
        let today = Local::now().format("%Y-%m-%d").to_string();
        self.sprints
            .iter()
            .map(|s| {
                let label = format!("sprint:{}", s.name);
                let cards: Vec<&Card> = self.board.cards.iter().filter(|c| c.labels.contains(&label)).collect();
                let done = cards.iter().filter(|c| c.column == "done").count() as u64;
                let state = match (&s.start, &s.end) {
                    (Some(st), Some(en)) if st.as_str() <= today.as_str() && today.as_str() <= en.as_str() => "active",
                    (Some(_), Some(en)) if en.as_str() < today.as_str() => "ended",
                    _ => "upcoming",
                };
                SprintBurndown {
                    name: s.name.clone(),
                    state: state.into(),
                    total: cards.len() as u64,
                    done,
                    effort_total: cards.iter().map(|c| c.effort.unwrap_or(0) as u64).sum(),
                    effort_done: cards.iter().filter(|c| c.column == "done").map(|c| c.effort.unwrap_or(0) as u64).sum(),
                }
            })
            .collect()
    }

    // ── Code search ──

    pub fn run_code_search(&mut self) {
        let q = self.code_query.trim();
        if q.is_empty() {
            self.code_results.clear();
            return;
        }
        let root = match find_project_root() {
            Ok(r) => r,
            Err(_) => {
                self.code_results.clear();
                return;
            }
        };
        let index = SymbolIndex::build(&root);
        self.code_results = index.search(q, 12);
    }

    // ── Selection ──

    pub fn focused_column_card_count(&self) -> usize {
        self.cards_in_column(self.focused_column).len()
    }

    pub fn selected_card(&self) -> Option<(usize, &Card)> {
        if let Some(id) = &self.detail_card_id {
            if let Some(idx) = self.board.cards.iter().position(|c| &c.id == id) {
                return Some((idx, &self.board.cards[idx]));
            }
        }
        let cards = self.visible_cards();
        if cards.is_empty() {
            return None;
        }
        let idx = self.card_focus.min(cards.len() - 1);
        Some(cards[idx])
    }

    pub fn card_by_id(&self, id: &str) -> Option<&Card> {
        self.board.cards.iter().find(|c| c.id == id)
    }

    // ── Mutations ──

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
        let column_id = if self.tab == Tab::Board && self.focused_column < self.board.columns.len() {
            self.board.columns[self.focused_column].id.clone()
        } else if let Some(first) = self.board.columns.first() {
            first.id.clone()
        } else {
            "todo".to_string()
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
            remind_at: None,
            comments: Vec::new(),
            blocked_by: None,
            attachments: Vec::new(),
            links: Vec::new(),
            acceptance_criteria: Vec::new(),
            effort: None,
            area: None,
            spec_id: None,
            pinned: false,
            version: 1,
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
            if self.detail_card_id.is_some() {
                self.detail_card_id = None;
            }
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

    // ── Links (mirrors core link.rs semantics) ──

    pub fn perform_link(&mut self, id: &str, target: &str, ty: LinkType) -> Result<()> {
        if id == target {
            anyhow::bail!("cannot link a card to itself");
        }
        if self.card_by_id(id).is_none() {
            anyhow::bail!("card '{}' not found", id);
        }
        if self.card_by_id(target).is_none() {
            anyhow::bail!("card '{}' not found", target);
        }
        self.ensure_no_cycle(id, target, ty)?;

        let primary = match ty {
            LinkType::Child => LinkType::Parent,
            LinkType::Parent => LinkType::Child,
            other => other,
        };
        let added = self
            .board
            .cards
            .iter_mut()
            .find(|c| c.id == id)
            .map(|c| c.add_link(primary, target))
            .unwrap_or(false);
        let mirror = match ty {
            LinkType::Child => Some(LinkType::Child),
            LinkType::Parent => Some(LinkType::Parent),
            _ => None,
        };
        if let Some(mt) = mirror {
            if let Some(other) = self.board.cards.iter_mut().find(|c| c.id == target) {
                other.add_link(mt, id);
            }
        }
        if added {
            self.save()?;
            let _ = history::log_update(&self.board_name, id, "links", "-", &format!("{} {}", ty, target));
            self.status_msg = Some(format!("Linked '{}' {} '{}'", id, ty, target));
        } else {
            self.status_msg = Some(format!("'{}' already linked to '{}'", id, target));
        }
        Ok(())
    }

    pub fn perform_unlink(&mut self, id: &str, target: &str) -> Result<()> {
        let primary = LinkType::Parent;
        let removed = self
            .board
            .cards
            .iter_mut()
            .find(|c| c.id == id)
            .map(|c| c.remove_link(primary, target))
            .unwrap_or(false);
        if let Some(other) = self.board.cards.iter_mut().find(|c| c.id == target) {
            other.remove_link(LinkType::Child, id);
        }
        if removed {
            self.save()?;
            let _ = history::log_update(&self.board_name, id, "links", &format!("child {}", target), "-");
            self.status_msg = Some(format!("Unlinked '{}' from '{}'", id, target));
        } else {
            self.status_msg = Some(format!("no parent link from '{}' to '{}'", id, target));
        }
        Ok(())
    }

    fn ensure_no_cycle(&self, id: &str, target: &str, ty: LinkType) -> Result<()> {
        let (start, forbidden) = if ty == LinkType::Child {
            (target, id)
        } else if ty == LinkType::Parent {
            (id, target)
        } else {
            return Ok(());
        };
        let mut current = start.to_string();
        for _ in 0..self.board.cards.len() {
            let next: Option<String> = self
                .board
                .cards
                .iter()
                .find(|c| c.id == current)
                .and_then(|c| c.links.iter().find(|l| l.ty == LinkType::Parent))
                .map(|l| l.target.clone());
            match next {
                Some(p) if p == forbidden => {
                    anyhow::bail!("linking '{}' as {} of '{}' would create a cycle", id, ty, target)
                }
                Some(p) => current = p,
                None => break,
            }
        }
        Ok(())
    }

    pub fn parse_query(&mut self) {
        if self.filter.is_empty() {
            self.filter_query = ParsedQuery::default();
            return;
        }
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

    // ── Theme ──

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

    pub fn theme_accent(&self) -> Color {
        match self.theme {
            Theme::Dark => Color::Rgb(96, 165, 250),
            Theme::Light => Color::Rgb(37, 99, 235),
        }
    }

    pub fn theme_selection(&self) -> Color {
        match self.theme {
            Theme::Dark => Color::Rgb(30, 41, 59),
            Theme::Light => Color::Rgb(219, 234, 254),
        }
    }

    pub fn theme_danger(&self) -> Color {
        match self.theme {
            Theme::Dark => Color::Rgb(248, 113, 113),
            Theme::Light => Color::Rgb(220, 38, 38),
        }
    }

    pub fn theme_success(&self) -> Color {
        match self.theme {
            Theme::Dark => Color::Rgb(52, 211, 153),
            Theme::Light => Color::Rgb(5, 150, 105),
        }
    }

    pub fn theme_warning(&self) -> Color {
        match self.theme {
            Theme::Dark => Color::Rgb(251, 191, 36),
            Theme::Light => Color::Rgb(217, 119, 6),
        }
    }

    pub fn theme_border(&self) -> Color {
        match self.theme {
            Theme::Dark => Color::Rgb(60, 60, 80),
            Theme::Light => Color::Rgb(200, 200, 215),
        }
    }

    // ── Agent & Orchestration ──

    pub fn load_agents(&mut self) {
        if let Ok(root) = find_project_root() {
            let path = root.join(".board").join("agents").join("registry.json");
            if let Ok(registry) = AgentRegistry::load(&path) {
                self.agents = registry.agents;
            }
        }
    }

    pub fn load_task_queue(&mut self) {
        if let Ok(root) = find_project_root() {
            let path = root.join(".board").join("tasks").join(format!("{}.json", self.board_name));
            if let Ok(queue) = TaskQueue::load(&path) {
                self.task_queue = queue.tasks;
            }
        }
    }

    pub fn run_orchestration_cycle(&mut self) -> Result<()> {
        // Simplified orchestration: find unassigned pending tasks and assign to available agents
        let available_agent = self.agents.iter().find(|a| a.status == AgentStatus::Idle && a.can_accept_task());
        if let Some(agent) = available_agent {
            let agent_id = agent.id.clone();
            if let Some(task) = self.task_queue.iter_mut().find(|t| t.status == TaskStatus::Pending) {
                task.status = TaskStatus::Assigned;
                task.assigned_agent = Some(agent_id.clone());
                self.orchestration_status = Some(format!("Assigned task {} to {}", task.id, agent_id));
            } else {
                self.orchestration_status = Some("No pending tasks".to_string());
            }
        } else {
            self.orchestration_status = Some("No available agents".to_string());
        }
        Ok(())
    }

    pub fn claim_selected_task(&mut self) -> Result<()> {
        if let Some(task) = self.task_queue.get_mut(self.task_cursor) {
            if task.status == TaskStatus::Pending || task.status == TaskStatus::Assigned {
                task.status = TaskStatus::InProgress;
                self.status_msg = Some(format!("Claimed task: {}", task.id));
            }
        }
        Ok(())
    }
}

fn days_until(due: &str, today: &str) -> i64 {
    match (DateTime::parse_from_str(&format!("{}T00:00:00Z", due), "%Y-%m-%dT%H:%M:%S%z"),
           DateTime::parse_from_str(&format!("{}T00:00:00Z", today), "%Y-%m-%dT%H:%M:%S%z")) {
        (Ok(a), Ok(b)) => a.signed_duration_since(b).num_days(),
        _ => 0,
    }
}

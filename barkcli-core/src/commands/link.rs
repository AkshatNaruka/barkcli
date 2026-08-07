use anyhow::{Context, Result};

use crate::models::card::LinkType;
use crate::storage::board_file::{read_board, write_board};
use crate::storage::history;
use crate::util::style;

/// `barkcli link <id> <target> [--as parent|child|related|blocked-by]`
///
/// Convention: `X.add_link(Parent, Y)` means "Y is X's parent";
/// `X.add_link(Child, Y)` means "Y is X's child". So `--as child` on `id`
/// against `target` means "id's parent is target" (stored on `id` as Parent)
/// mirrored by "target's child is id" (stored on `target` as Child).
pub fn run_link(name: &str, args: &[String]) -> Result<()> {
    if args.len() < 2 {
        anyhow::bail!("usage: barkcli link <id> <target-id> [--as parent|child|related|blocked-by]");
    }
    let id = &args[0];
    let target = &args[1];
    let ty = parse_link_type(args);

    if id == target {
        anyhow::bail!("cannot link a card to itself");
    }

    let mut board = read_board(name).context(format!("board '{}' not found", name))?;
    if !board.cards.iter().any(|c| c.id == *id) {
        anyhow::bail!("card '{}' not found in '{}'", id, name);
    }
    if !board.cards.iter().any(|c| c.id == *target) {
        anyhow::bail!("card '{}' not found in '{}'", target, name);
    }

    ensure_no_cycle(&board, id, target, ty)?;

    // Primary link: `id` related to `target` as `ty`.
    let card = board
        .cards
        .iter_mut()
        .find(|c| c.id == *id)
        .expect("checked above");
    let primary = match ty {
        // id is a child of target → id's parent is target
        LinkType::Child => LinkType::Parent,
        // id is a parent of target → target is id's child
        LinkType::Parent => LinkType::Child,
        other => other,
    };
    if !card.add_link(primary, target) {
        println!(
            "{} '{}' already linked to '{}' as {}",
            style::muted("Link:"),
            id,
            target,
            ty
        );
        return Ok(());
    }

    // Mirror on the other card for parent/child.
    let mirror: Option<LinkType> = match ty {
        LinkType::Child => Some(LinkType::Child),   // target's child is id
        LinkType::Parent => Some(LinkType::Parent), // target's parent is id
        _ => None,
    };
    if let Some(mt) = mirror {
        if let Some(other) = board.cards.iter_mut().find(|c| c.id == *target) {
            other.add_link(mt, id);
        }
    }

    write_board(name, &board)?;
    let _ = history::log_update(name, id, "links", "-", &format!("{} {}", ty, target));
    println!(
        "{} '{}' {} '{}'",
        style::ok("Linked:"),
        id,
        ty,
        target
    );
    Ok(())
}

/// `barkcli unlink <id> <target> [--as parent|child|related|blocked-by]`
pub fn run_unlink(name: &str, args: &[String]) -> Result<()> {
    if args.len() < 2 {
        anyhow::bail!("usage: barkcli unlink <id> <target-id> [--as parent|child|related|blocked-by]");
    }
    let id = &args[0];
    let target = &args[1];
    let ty = parse_link_type(args);

    let primary = match ty {
        LinkType::Child => LinkType::Parent,
        LinkType::Parent => LinkType::Child,
        other => other,
    };

    let mut board = read_board(name)?;
    let removed = board
        .cards
        .iter_mut()
        .find(|c| c.id == *id)
        .map(|c| c.remove_link(primary, target))
        .unwrap_or(false);

    // Mirror removal
    let mirror: Option<LinkType> = match ty {
        LinkType::Child => Some(LinkType::Child),
        LinkType::Parent => Some(LinkType::Parent),
        _ => None,
    };
    if let Some(mt) = mirror {
        if let Some(other) = board.cards.iter_mut().find(|c| c.id == *target) {
            other.remove_link(mt, id);
        }
    }

    if removed {
        write_board(name, &board)?;
        let _ = history::log_update(name, id, "links", &format!("{} {}", ty, target), "-");
        println!("{} '{}' unlinked from '{}' ({})", style::ok("Unlinked:"), id, target, ty);
    } else {
        println!("{} no {} link found", style::muted("Unlink:"), ty);
    }
    Ok(())
}

/// `barkcli tree [<parent-id>]` — render the parent→child hierarchy.
pub fn run_tree(name: &str, args: &[String]) -> Result<()> {
    let board = read_board(name)?;
    if board.cards.is_empty() {
        println!("{} no cards on '{}'", style::muted("Tree:"), name);
        return Ok(());
    }

    let mut roots: Vec<String> = board
        .cards
        .iter()
        .filter(|c| !c.links.iter().any(|l| l.ty == LinkType::Parent))
        .map(|c| c.id.clone())
        .collect();

    if let Some(start) = args.first() {
        if board.cards.iter().any(|c| c.id == *start) {
            roots = vec![start.clone()];
        }
    }

    // Deterministic order: keep board order (roots as they appear in cards)
    let card_order: Vec<String> = board.cards.iter().map(|c| c.id.clone()).collect();
    roots.sort_by_key(|r| card_order.iter().position(|c| c == r).unwrap_or(usize::MAX));

    for root in &roots {
        print_node(&board, root, 0, &card_order);
    }
    Ok(())
}

fn print_node(board: &crate::models::Board, id: &str, depth: usize, order: &[String]) {
    let Some(card) = board.cards.iter().find(|c| c.id == id) else { return };
    let indent = "  ".repeat(depth);
    let done = if card.column == "done" { style::ok("✓") } else { style::muted("•") };
    println!(
        "{}{} {} [{}]",
        indent,
        done,
        style::strong(&card.title),
        style::muted(id)
    );

    let mut children: Vec<String> = card
        .links
        .iter()
        .filter(|l| l.ty == LinkType::Child)
        .map(|l| l.target.clone())
        .collect();
    children.sort_by_key(|c| order.iter().position(|x| x == c).unwrap_or(usize::MAX));
    for child in children {
        print_node(board, &child, depth + 1, order);
    }
}

fn parse_link_type(args: &[String]) -> LinkType {
    args.iter()
        .position(|a| a == "--as")
        .and_then(|i| args.get(i + 1))
        .and_then(|v| LinkType::parse(v))
        .unwrap_or(LinkType::Child)
}

/// Prevent parent/child cycles. New link `ty` between `id` and `target`:
/// - Child (`id` is child of `target`): walking parents from `target` must not reach `id`.
/// - Parent (`id` is parent of `target`): walking parents from `id` must not reach `target`.
fn ensure_no_cycle(
    board: &crate::models::Board,
    id: &str,
    target: &str,
    ty: LinkType,
) -> Result<()> {
    let (start, forbidden) = if ty == LinkType::Child {
        (target, id)
    } else if ty == LinkType::Parent {
        (id, target)
    } else {
        return Ok(());
    };
    let mut current = start.to_string();
    for _ in 0..board.cards.len() {
        let next: Option<String> = board
            .cards
            .iter()
            .find(|c| c.id == current)
            .and_then(|c| c.links.iter().find(|l| l.ty == LinkType::Parent))
            .map(|l| l.target.clone());
        match next {
            Some(p) if p == forbidden => {
                anyhow::bail!(
                    "linking '{}' as {} of '{}' would create a cycle",
                    id,
                    ty,
                    target
                )
            }
            Some(p) => current = p,
            None => break,
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::Board;
    use crate::models::card::Card;

    fn board_with(ids: &[&str]) -> Board {
        let mut b = Board::new("t");
        for id in ids {
            let mut c = Card::new(*id, *id, "todo");
            c.id = id.to_string();
            b.cards.push(c);
        }
        b
    }

    #[test]
    fn cycle_detected_on_child() {
        let mut b = board_with(&["a", "b", "c"]);
        // a's parent is b, b's parent is c → hierarchy c ← b ← a
        b.cards[0].add_link(LinkType::Parent, "b");
        b.cards[1].add_link(LinkType::Parent, "c");
        // linking c as child of a: a becomes parent of c → cycle a→c→b→a
        let err = ensure_no_cycle(&b, "c", "a", LinkType::Child);
        assert!(err.is_err());
        // linking b as child of a: a becomes parent of b, but a's parent is already b
        let err2 = ensure_no_cycle(&b, "b", "a", LinkType::Child);
        assert!(err2.is_err());
        // linking a as child of c: c becomes parent of a → fine (deepens the tree)
        let ok = ensure_no_cycle(&b, "a", "c", LinkType::Child);
        assert!(ok.is_ok());
    }

    #[test]
    fn cycle_detected_on_parent() {
        let mut b = board_with(&["a", "b", "c"]);
        b.cards[0].add_link(LinkType::Parent, "b");
        b.cards[1].add_link(LinkType::Parent, "c");
        let err = ensure_no_cycle(&b, "a", "c", LinkType::Parent);
        assert!(err.is_err());
    }

    #[test]
    fn add_link_rejects_self_and_dup() {
        let mut c = Card::new("x", "X", "todo");
        assert!(!c.add_link(LinkType::Child, "x"));
        assert!(c.add_link(LinkType::Child, "y"));
        assert!(!c.add_link(LinkType::Child, "y"));
        assert!(c.add_link(LinkType::Related, "y"));
        assert_eq!(c.links.len(), 2);
        assert!(c.remove_link(LinkType::Child, "y"));
        assert_eq!(c.links.len(), 1);
    }

    #[test]
    fn link_type_parse() {
        assert_eq!(LinkType::parse("parent"), Some(LinkType::Parent));
        assert_eq!(LinkType::parse("child"), Some(LinkType::Child));
        assert_eq!(LinkType::parse("related"), Some(LinkType::Related));
        assert_eq!(LinkType::parse("blocked-by"), Some(LinkType::BlockedBy));
        assert_eq!(LinkType::parse("nope"), None);
    }
}

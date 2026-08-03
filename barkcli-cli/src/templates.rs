use std::path::PathBuf;

use anyhow::{bail, Result};

use barkcli_core::models::Board;
use barkcli_core::storage::board_file::{read_board, write_board};

/// Shipped templates. Each includes a title and list of card (title, description, priority, labels).
type Template = (&'static str, &'static str, &'static [(&'static str, &'static str, &'static str, &'static [&'static str])]);

const TEMPLATES: &[Template] = &[
    ("saas-launch", "SaaS Launch Checklist", &[
        ("Set up auth (OAuth/JWT)", "Implement authentication with JWT and OAuth providers", "high", &["backend", "auth"]),
        ("Landing page", "Build a responsive landing page with hero, features, pricing, CTA", "high", &["frontend", "design"]),
        ("User onboarding flow", "Design and implement user signup, welcome email, and first-run experience", "high", &["frontend", "ux"]),
        ("Stripe integration", "Set up subscription billing with Stripe", "high", &["backend", "payments"]),
        ("Email notifications", "Transactional emails: welcome, verify, password reset", "medium", &["backend"]),
        ("API rate limiting", "Implement rate limiting to protect the API", "medium", &["backend", "security"]),
        ("Error tracking (Sentry)", "Set up Sentry or similar error monitoring", "medium", &["devops"]),
        ("Database backups", "Configure automated daily database backups", "medium", &["devops"]),
        ("SEO basics", "Meta tags, sitemap, robots.txt, structured data", "medium", &["frontend", "seo"]),
        ("Pricing page", "Design and build pricing page with monthly/annual toggle", "medium", &["frontend", "design"]),
        ("Write docs", "Write user documentation and API reference", "low", &["docs"]),
        ("Set up analytics", "Add Plausible/Fathom/GA for traffic analytics", "low", &["frontend"]),
        ("Legal - Terms & Privacy", "Write or generate Terms of Service and Privacy Policy", "low", &["legal"]),
        ("Social media accounts", "Create Twitter/X, LinkedIn, and other social accounts", "low", &["marketing"]),
        ("Launch on Product Hunt", "Prepare assets and launch on Product Hunt", "low", &["marketing"]),
    ]),
    ("mobile-app", "Mobile App Launch", &[
        ("App store metadata", "Title, description, keywords, screenshots for App Store and Google Play", "high", &["marketing"]),
        ("Push notifications", "Implement push notification infrastructure", "high", &["backend"]),
        ("Offline support", "Add offline data persistence and sync", "high", &["frontend"]),
        ("Deep linking", "Configure universal links and app links", "medium", &["frontend"]),
        ("In-app purchases", "Set up IAP products in App Store Connect / Google Play Console", "medium", &["backend", "payments"]),
        ("Crash reporting", "Integrate Crashlytics or similar", "medium", &["devops"]),
        ("App rating prompt", "Implement smart in-app review prompt", "low", &["frontend", "ux"]),
    ]),
    ("fundraising", "Fundraising Prep", &[
        ("Update pitch deck", "Revise slide deck with latest metrics and narrative", "high", &["fundraising"]),
        ("Financial model", "Build or update 3-year financial projections", "high", &["fundraising"]),
        ("Competitor analysis", "Research and document competitive landscape", "high", &["fundraising"]),
        ("Investor CRM", "Build list of target investors with notes and status", "medium", &["fundraising"]),
        ("Data room setup", "Organize diligence materials in a shared data room", "medium", &["fundraising"]),
        ("Practice pitch", "Record and review pitch with advisors", "medium", &["fundraising"]),
        ("Cap table cleanup", "Review and update cap table for accuracy", "low", &["legal"]),
    ]),
    ("hiring", "First Hires", &[
        ("Write job descriptions", "Draft JDs for each open role", "high", &["hiring"]),
        ("Set up hiring pipeline", "Configure ATS (Lever/Greenhouse/Ashby)", "high", &["hiring"]),
        ("Interview question bank", "Create structured interview questions per role", "medium", &["hiring"]),
        ("Onboarding checklist", "IT setup, accounts, docs, buddy system", "medium", &["hiring", "ops"]),
        ("Post to job boards", "LinkedIn, Wellfound, YC Work, remote job boards", "medium", &["hiring"]),
        ("Compensation bands", "Research and set salary bands per role and level", "low", &["hiring"]),
    ]),
    ("open-source", "Open Source Project", &[
        ("README with badges", "Clear README with install, usage, contributing", "high", &["docs"]),
        ("CONTRIBUTING.md", "How to contribute, code of conduct, dev setup", "high", &["docs"]),
        ("CI/CD pipeline", "GitHub Actions for tests, lint, build, release", "high", &["devops"]),
        ("License file", "Choose and add LICENSE file", "high", &["legal"]),
        ("Issue templates", "Bug report and feature request templates", "medium", &["docs"]),
        ("Changelog automation", "Auto-generate changelog from conventional commits", "medium", &["devops"]),
        ("Release process", "Tag, build, publish workflow", "medium", &["devops"]),
        ("Community guidelines", "Code of conduct and community health files", "low", &["docs"]),
    ]),
];

pub fn list_templates() {
    println!("Available templates:");
    for (id, name, items) in TEMPLATES {
        println!("  {}  {} ({} tasks)", id, name, items.len());
    }
    println!();
    println!("Install: board template install <name>");
}

pub fn install_template(board_name: Option<&str>, template_id: &str) -> Result<()> {
    let template = TEMPLATES.iter().find(|(id, _, _)| *id == template_id)
        .ok_or_else(|| {
            let ids: Vec<_> = TEMPLATES.iter().map(|(id, _, _)| *id).collect();
            anyhow::anyhow!("Unknown template '{}'. Available: {}", template_id, ids.join(", "))
        })?;

    let name = barkcli_core::commands::boards::resolve_board(board_name)?;
    let mut board = read_board(&name)?;
    let existing_ids: Vec<String> = board.cards.iter().map(|c| c.id.clone()).collect();
    let now = chrono::Utc::now();
    let first_col = board.columns.first().map(|c| c.id.clone()).unwrap_or_else(|| "todo".into());

    let mut added = 0;
    for (title, desc, priority, labels) in template.2 {
        let id = barkcli_core::util::slug::unique_slug(title, &existing_ids);
        let mut card = barkcli_core::models::Card::new(&id, *title, &first_col);
        card.priority = (*priority).to_string();
        card.description = if desc.is_empty() { None } else { Some((*desc).to_string()) };
        card.labels = labels.iter().map(|s| s.to_string()).collect();
        card.created_at = now;
        card.updated_at = now;
        board.cards.push(card);
        added += 1;
    }

    write_board(&name, &board)?;
    println!("Added {} tasks from '{}' template to {}.board", added, template.0, name);
    println!("  → board list");
    Ok(())
}

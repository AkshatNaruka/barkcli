use clap::{Arg, ArgAction, Command};

fn main() {
    let cmd = build_cli();
    let markdown = clap_markdown::help_markdown_command(&cmd);
    print!("{}", markdown);
}

fn build_cli() -> Command {
    Command::new("barkcli")
        .version("0.2.0")
        .about("Git-native Kanban board CLI — tasks as YAML in your repo")
        .long_about("barkcli is a git-native Kanban board CLI that stores tasks as YAML files in your repository.\n\nTasks are stored in .board files, committed to git, and accessible to both humans and AI agents via CLI, TUI, Web UI, VS Code, and MCP server.")
        // Setup commands
        .subcommand(
            Command::new("init")
                .about("Set up .board/ directory, config.json, and .gitignore")
        )
        .subcommand(
            Command::new("create")
                .about("Create a new board <name>.board")
                .arg(Arg::new("name").required(true).help("Board name"))
        )
        // Card operations
        .subcommand(
            Command::new("add")
                .about("Add a new card to a board")
                .arg(Arg::new("title").required(true).help("Card title"))
                .arg(Arg::new("column").short('c').long("column").help("Column to add to"))
                .arg(Arg::new("priority").short('p').long("priority").help("Priority: high, medium, low").default_value("medium"))
                .arg(Arg::new("description").short('d').long("description").help("Card description"))
                .arg(Arg::new("label").short('l').long("label").action(ArgAction::Append).help("Label (repeatable)"))
                .arg(Arg::new("assignee").short('a').long("assignee").help("Assignee"))
                .arg(Arg::new("due").long("due").help("Due date (YYYY-MM-DD)"))
                .arg(Arg::new("effort").long("effort").help("Effort estimate (story points)"))
                .arg(Arg::new("area").long("area").help("Area/component"))
                .arg(Arg::new("ac").long("ac").action(ArgAction::Append).help("Acceptance criteria (repeatable)"))
        )
        .subcommand(
            Command::new("list")
                .about("List cards grouped by column")
                .alias("ls")
                .arg(Arg::new("column").short('c').long("column").help("Filter by column"))
                .arg(Arg::new("priority").short('p').long("priority").help("Filter by priority"))
                .arg(Arg::new("label").short('l').long("label").help("Filter by label"))
        )
        .subcommand(
            Command::new("show")
                .about("Show full card details")
                .arg(Arg::new("id").required(true).help("Card ID"))
        )
        .subcommand(
            Command::new("move")
                .about("Move a card to a column")
                .alias("mv")
                .arg(Arg::new("id").required(true).help("Card ID"))
                .arg(Arg::new("column").required(true).help("Target column"))
        )
        .subcommand(
            Command::new("done")
                .about("Move a card to done (shortcut)")
                .arg(Arg::new("id").required(true).help("Card ID"))
        )
        .subcommand(
            Command::new("update")
                .about("Update a card's fields")
                .alias("up")
                .arg(Arg::new("id").required(true).help("Card ID"))
                .arg(Arg::new("title").short('t').long("title").help("New title"))
                .arg(Arg::new("description").short('d').long("description").help("New description"))
                .arg(Arg::new("priority").short('p').long("priority").help("New priority"))
                .arg(Arg::new("label").short('l').long("label").action(ArgAction::Append).help("Add label"))
                .arg(Arg::new("assignee").short('a').long("assignee").help("New assignee"))
                .arg(Arg::new("column").short('c').long("column").help("Move to column"))
                .arg(Arg::new("due").long("due").help("Set due date"))
                .arg(Arg::new("effort").long("effort").help("Set effort"))
                .arg(Arg::new("area").long("area").help("Set area"))
        )
        .subcommand(
            Command::new("remove")
                .about("Delete a card")
                .alias("rm")
                .arg(Arg::new("id").required(true).help("Card ID"))
        )
        .subcommand(
            Command::new("pin")
                .about("Pin a card to top of column")
                .arg(Arg::new("id").required(true).help("Card ID"))
        )
        .subcommand(
            Command::new("unpin")
                .about("Unpin a card")
                .arg(Arg::new("id").required(true).help("Card ID"))
        )
        .subcommand(
            Command::new("comment")
                .about("Add a comment to a card")
                .arg(Arg::new("id").required(true).help("Card ID"))
                .arg(Arg::new("text").required(true).help("Comment text"))
        )
        // Links & hierarchy
        .subcommand(
            Command::new("link")
                .about("Link two cards")
                .arg(Arg::new("id").required(true).help("Source card ID"))
                .arg(Arg::new("target").required(true).help("Target card ID"))
                .arg(Arg::new("as").long("as").help("Link type: parent, child, related, blocked-by").default_value("child"))
        )
        .subcommand(
            Command::new("unlink")
                .about("Remove a link between cards")
                .arg(Arg::new("id").required(true).help("Source card ID"))
                .arg(Arg::new("target").required(true).help("Target card ID"))
        )
        .subcommand(
            Command::new("tree")
                .about("Render parent->child card hierarchy")
                .arg(Arg::new("parent-id").help("Root card ID (optional)"))
        )
        // History & undo
        .subcommand(
            Command::new("log")
                .about("View change history")
        )
        .subcommand(
            Command::new("undo")
                .about("Revert the last change")
        )
        .subcommand(
            Command::new("diff")
                .about("Show what changed since last operation")
        )
        .subcommand(
            Command::new("blame")
                .about("See who changed what, when")
                .arg(Arg::new("id").required(true).help("Card ID"))
        )
        .subcommand(
            Command::new("snapshot")
                .about("Save a named checkpoint")
                .arg(Arg::new("label").required(true).help("Checkpoint label"))
        )
        // Calendar & reminders
        .subcommand(
            Command::new("today")
                .about("Agenda: overdue, today, next 7 days, backlog")
        )
        .subcommand(
            Command::new("calendar")
                .about("ASCII month calendar of due cards + sprints")
                .arg(Arg::new("month").help("Month (YYYY-MM, default: current)"))
        )
        .subcommand(
            Command::new("remind")
                .about("Cards with a reminder due")
                .arg(Arg::new("hours").long("hours").help("Hours ahead to check").default_value("24"))
        )
        // Code context
        .subcommand(
            Command::new("code")
                .about("Search symbols/files, report linked cards")
                .arg(Arg::new("query").required(true).help("Search query"))
                .arg(Arg::new("top").long("top").help("Number of results").default_value("10"))
        )
        .subcommand(
            Command::new("context")
                .about("Code context management")
                .subcommand(
                    Command::new("scan")
                        .about("Auto-map cards to code via fuzzy symbols")
                        .arg(Arg::new("top").long("top").help("Max results per card").default_value("10"))
                )
                .subcommand(
                    Command::new("link")
                        .about("Pin a file/symbol to a card")
                        .arg(Arg::new("card").required(true).help("Card ID"))
                        .arg(Arg::new("path").required(true).help("File path or symbol"))
                )
                .subcommand(
                    Command::new("unlink")
                        .about("Remove context link")
                        .arg(Arg::new("card").required(true).help("Card ID"))
                        .arg(Arg::new("path").required(true).help("File path"))
                )
                .subcommand(
                    Command::new("status")
                        .about("Coverage + staleness table")
                )
                .subcommand(
                    Command::new("show")
                        .about("Full code context for a card")
                        .arg(Arg::new("card").required(true).help("Card ID"))
                )
                .subcommand(
                    Command::new("sync")
                        .about("Git-aware refresh of mapped files")
                )
                .subcommand(
                    Command::new("autosync")
                        .about("Post-commit context sync")
                        .arg(Arg::new("mode").required(true).help("on/off/enable/disable"))
                )
                .subcommand(
                    Command::new("clear")
                        .about("Wipe the context sidecar")
                )
        )
        // Board management
        .subcommand(
            Command::new("boards")
                .about("List all boards")
        )
        .subcommand(
            Command::new("switch")
                .about("Make a board the default")
                .arg(Arg::new("name").required(true).help("Board name"))
        )
        .subcommand(
            Command::new("status")
                .about("Summary: counts per column across boards")
        )
        .subcommand(
            Command::new("validate")
                .about("Check task files for errors")
        )
        .subcommand(
            Command::new("doctor")
                .about("Validate + auto-fix board issues")
        )
        .subcommand(
            Command::new("clean")
                .about("Clean orphaned metadata")
        )
        // Import/Export
        .subcommand(
            Command::new("export")
                .about("Export tasks (json/yaml)")
                .arg(Arg::new("name").help("Board name"))
                .arg(Arg::new("format").help("Output format: json or yaml").default_value("json"))
        )
        .subcommand(
            Command::new("import")
                .about("Import tasks from file or stdin")
                .arg(Arg::new("name").required(true).help("Board name"))
                .arg(Arg::new("file").help("File path (or stdin)"))
        )
        .subcommand(
            Command::new("merge")
                .about("3-way board merge from a git branch")
                .arg(Arg::new("branch").required(true).help("Branch name"))
                .arg(Arg::new("board").short('b').long("board").help("Board name"))
        )
        // Sessions & checkpoints
        .subcommand(
            Command::new("session")
                .about("Agent session management")
                .subcommand(
                    Command::new("list")
                        .about("Show captured agent sessions")
                        .alias("ls")
                )
                .subcommand(
                    Command::new("show")
                        .about("Full session detail")
                        .arg(Arg::new("id").required(true).help("Session ID"))
                )
                .subcommand(
                    Command::new("resume")
                        .about("Print context to hand your agent")
                        .arg(Arg::new("id").required(true).help("Session ID"))
                )
        )
        .subcommand(
            Command::new("checkpoint")
                .about("Checkpoint management")
                .subcommand(
                    Command::new("list")
                        .about("List manual + auto checkpoints")
                        .alias("ls")
                )
                .subcommand(
                    Command::new("save")
                        .about("Save a manual checkpoint")
                        .arg(Arg::new("label").help("Checkpoint label"))
                )
                .subcommand(
                    Command::new("restore")
                        .about("Restore board from a checkpoint")
                        .arg(Arg::new("id").required(true).help("Checkpoint ID"))
                )
        )
        .subcommand(
            Command::new("hooks")
                .about("Agent hook management")
                .subcommand(
                    Command::new("install")
                        .about("Install agent hooks")
                        .arg(Arg::new("agent").short('a').long("agent").help("Agent name"))
                )
                .subcommand(
                    Command::new("status")
                        .about("Show installed agent hooks")
                )
                .subcommand(
                    Command::new("remove")
                        .about("Remove installed hooks")
                        .arg(Arg::new("agent").short('a').long("agent").help("Agent name"))
                )
        )
        // Interfaces
        .subcommand(
            Command::new("tui")
                .about("Terminal Kanban board (ratatui)")
                .arg(Arg::new("board").help("Board name"))
        )
        .subcommand(
            Command::new("serve")
                .about("Browser Kanban server (axum + WebSocket)")
                .arg(Arg::new("port").short('p').long("port").help("Server port").default_value("4321"))
                .arg(Arg::new("board").short('b').long("board").help("Board name"))
                .arg(Arg::new("host").long("host").help("Bind address").default_value("127.0.0.1"))
                .arg(Arg::new("token").long("token").help("Auth token"))
                .arg(Arg::new("open").short('o').long("open").action(ArgAction::SetTrue).help("Open browser"))
                .arg(Arg::new("daemon").short('d').long("daemon").action(ArgAction::SetTrue).help("Run as daemon"))
                .arg(Arg::new("stop").long("stop").action(ArgAction::SetTrue).help("Stop daemon"))
                .arg(Arg::new("status").long("status").action(ArgAction::SetTrue).help("Check daemon status"))
        )
        .subcommand(
            Command::new("open")
                .about("Open TUI if terminal, browser otherwise")
                .arg(Arg::new("board").help("Board name"))
        )
        // Management layer
        .subcommand(
            Command::new("intake")
                .about("Classify input -> card + spec")
                .arg(Arg::new("text").required(true).help("Input text"))
                .arg(Arg::new("bug").long("bug").action(ArgAction::SetTrue).help("Mark as bug"))
                .arg(Arg::new("feature").long("feature").action(ArgAction::SetTrue).help("Mark as feature"))
                .arg(Arg::new("board").short('b').long("board").help("Board name"))
                .arg(Arg::new("dry-run").long("dry-run").action(ArgAction::SetTrue).help("Preview without saving"))
        )
        .subcommand(
            Command::new("plan")
                .about("Generate spec + decomposition for a card")
                .arg(Arg::new("card-id").required(true).help("Card ID"))
                .arg(Arg::new("auto").long("auto").action(ArgAction::SetTrue).help("Auto-apply"))
                .arg(Arg::new("dry-run").long("dry-run").action(ArgAction::SetTrue).help("Preview"))
                .arg(Arg::new("board").short('b').long("board").help("Board name"))
                .arg(Arg::new("tasks").long("tasks").action(ArgAction::SetTrue).help("Generate tasks"))
        )
        .subcommand(
            Command::new("memory")
                .about("Cross-session memory management")
                .alias("mem")
                .subcommand(
                    Command::new("add")
                        .about("Store a memory")
                        .arg(Arg::new("text").required(true).help("Memory content"))
                        .arg(Arg::new("tier").short('t').long("tier").help("Tier: working, short, long, external"))
                        .arg(Arg::new("tags").long("tags").help("Comma-separated tags"))
                )
                .subcommand(
                    Command::new("search")
                        .about("Search memories (BM25)")
                        .alias("find")
                        .arg(Arg::new("query").required(true).help("Search query"))
                        .arg(Arg::new("top").short('n').long("top").help("Max results").default_value("5"))
                )
                .subcommand(
                    Command::new("list")
                        .about("List recent memories")
                        .alias("ls")
                        .arg(Arg::new("tier").short('t').long("tier").help("Filter by tier"))
                        .arg(Arg::new("recent").short('n').long("recent").help("Max results").default_value("20"))
                )
                .subcommand(
                    Command::new("stats")
                        .about("Show memory statistics")
                )
                .subcommand(
                    Command::new("compress")
                        .about("Compress short-term -> long-term")
                )
                .subcommand(
                    Command::new("clear")
                        .about("Clear all memories")
                )
                .subcommand(
                    Command::new("fact")
                        .about("Project facts management")
                        .subcommand(
                            Command::new("add")
                                .about("Add a project fact")
                                .arg(Arg::new("text").required(true).help("Fact content"))
                                .arg(Arg::new("category").short('c').long("category").help("Category: convention, pattern, decision, preference"))
                        )
                        .subcommand(
                            Command::new("list")
                                .about("List project facts")
                        )
                )
        )
        .subcommand(
            Command::new("monitor")
                .about("Dashboard: agents, tasks, insights")
                .arg(Arg::new("watch").long("watch").action(ArgAction::SetTrue).help("Watch mode"))
                .arg(Arg::new("interval").long("interval").help("Refresh interval (seconds)").default_value("5"))
                .arg(Arg::new("board").short('b').long("board").help("Board name"))
        )
        .subcommand(
            Command::new("review")
                .about("Validate completed tasks")
                .arg(Arg::new("card-id").help("Specific card ID"))
                .arg(Arg::new("all").long("all").action(ArgAction::SetTrue).help("Review all"))
                .arg(Arg::new("board").short('b').long("board").help("Board name"))
                .arg(Arg::new("auto").long("auto").action(ArgAction::SetTrue).help("Auto-review"))
        )
        // Spec management
        .subcommand(
            Command::new("spec")
                .about("Specifications management")
                .subcommand(
                    Command::new("list")
                        .about("List all specs")
                        .alias("ls")
                )
                .subcommand(
                    Command::new("show")
                        .about("Show spec details")
                        .arg(Arg::new("id").required(true).help("Spec ID"))
                )
                .subcommand(
                    Command::new("create")
                        .about("Create a new spec")
                        .alias("new")
                        .arg(Arg::new("title").required(true).help("Spec title"))
                        .arg(Arg::new("description").short('d').long("description").help("Description"))
                        .arg(Arg::new("priority").short('p').long("priority").help("Priority"))
                )
                .subcommand(
                    Command::new("update")
                        .about("Update a spec")
                        .arg(Arg::new("id").required(true).help("Spec ID"))
                        .arg(Arg::new("status").short('s').long("status").help("New status"))
                        .arg(Arg::new("priority").short('p').long("priority").help("New priority"))
                        .arg(Arg::new("description").short('d').long("description").help("New description"))
                )
                .subcommand(
                    Command::new("delete")
                        .about("Delete a spec")
                        .alias("rm")
                        .arg(Arg::new("id").required(true).help("Spec ID"))
                )
                .subcommand(
                    Command::new("add-req")
                        .about("Add a requirement to a spec")
                        .arg(Arg::new("spec-id").required(true).help("Spec ID"))
                        .arg(Arg::new("title").required(true).help("Requirement title"))
                )
                .subcommand(
                    Command::new("trace")
                        .about("Show full traceability")
                        .arg(Arg::new("id").required(true).help("Spec ID"))
                )
                .subcommand(
                    Command::new("coverage")
                        .about("Show coverage stats")
                )
                .subcommand(
                    Command::new("scan-stale")
                        .about("Scan for stale requirements")
                        .arg(Arg::new("files").required(true).num_args(1..).help("Files to scan"))
                )
        )
        // AI & Agents
        .subcommand(
            Command::new("mcp")
                .about("Start MCP JSON-RPC server on stdio")
        )
        .subcommand(
            Command::new("listener")
                .about("Start a coding agent listener that polls for tasks")
                .arg(Arg::new("agent-id").long("agent-id").help("Unique agent identifier").required(true))
                .arg(Arg::new("agent-name").long("agent-name").help("Human-readable agent name").required(true))
                .arg(Arg::new("role").long("role").help("Agent role").default_value("tech-lead"))
                .arg(Arg::new("poll-interval").long("poll-interval").help("Poll interval in seconds").default_value("30"))
                .arg(Arg::new("board").long("board").help("Board name"))
                .arg(Arg::new("server-url").long("server-url").help("Management server URL").default_value("http://localhost:3000"))
                .arg(Arg::new("once").long("once").action(ArgAction::SetTrue).help("Run single poll cycle and exit"))
                .arg(Arg::new("dry-run").long("dry-run").action(ArgAction::SetTrue).help("Claim and show task details without executing"))
        )
        .subcommand(
            Command::new("orchestrate")
                .about("Orchestration engine")
                .subcommand(
                    Command::new("start")
                        .about("Start continuous orchestration loop")
                        .arg(Arg::new("board").help("Board name"))
                        .arg(Arg::new("role").help("Role: scrum-master, product-owner, tech-lead, project-manager"))
                )
                .subcommand(
                    Command::new("cycle")
                        .about("Run single orchestration cycle")
                        .arg(Arg::new("board").help("Board name"))
                        .arg(Arg::new("role").help("Role"))
                )
                .subcommand(
                    Command::new("status")
                        .about("Show orchestration status")
                        .arg(Arg::new("board").help("Board name"))
                )
        )
        // Pro commands
        .subcommand(
            Command::new("ai")
                .about("AI task breakdown (Pro)")
                .arg(Arg::new("prompt").required(true).help("Feature description"))
                .arg(Arg::new("dry-run").long("dry-run").action(ArgAction::SetTrue).help("Preview"))
                .arg(Arg::new("model").long("model").help("Model to use").default_value("gpt-4o-mini"))
        )
        .subcommand(
            Command::new("report")
                .about("Weekly markdown report (Pro)")
                .arg(Arg::new("since").help("Start date (default: 7 days ago)"))
                .arg(Arg::new("json").long("json").action(ArgAction::SetTrue).help("JSON output"))
                .arg(Arg::new("sprint").long("sprint").help("Sprint name"))
        )
        .subcommand(
            Command::new("changelog")
                .about("Auto-generate changelog from git tags (Pro)")
                .arg(Arg::new("since").help("Start tag (default: last tag)"))
        )
        .subcommand(
            Command::new("stats")
                .about("Progress bar + analytics (Pro)")
        )
        .subcommand(
            Command::new("template")
                .about("Template management (Pro)")
                .subcommand(Command::new("list").about("Show available templates"))
                .subcommand(
                    Command::new("install")
                        .about("Load a template")
                        .arg(Arg::new("name").required(true).help("Template name"))
                )
        )
        .subcommand(
            Command::new("sprint")
                .about("Sprint management (Pro)")
                .subcommand(
                    Command::new("start")
                        .about("Start a sprint")
                        .arg(Arg::new("name").required(true).help("Sprint name"))
                        .arg(Arg::new("start").long("start").help("Start date (YYYY-MM-DD)"))
                        .arg(Arg::new("end").short('e').long("end").help("End date (YYYY-MM-DD)"))
                )
                .subcommand(
                    Command::new("end")
                        .about("End sprint, show velocity")
                        .arg(Arg::new("name").required(true).help("Sprint name"))
                )
                .subcommand(
                    Command::new("list")
                        .about("List sprints")
                        .alias("ls")
                )
        )
        .subcommand(
            Command::new("sync")
                .about("Push/pull GitHub Issues (Pro)")
                .arg(Arg::new("push").long("push").action(ArgAction::SetTrue).help("Push to GitHub"))
                .arg(Arg::new("pull").long("pull").action(ArgAction::SetTrue).help("Pull from GitHub"))
        )
        .subcommand(
            Command::new("license")
                .about("License management")
                .subcommand(
                    Command::new("activate")
                        .about("Activate a license key")
                        .arg(Arg::new("key").required(true).help("License key"))
                )
                .subcommand(
                    Command::new("status")
                        .about("Show license status")
                )
        )
        // Global flags
        .arg(
            Arg::new("board")
                .short('b')
                .long("board")
                .global(true)
                .help("Target a specific board")
        )
}

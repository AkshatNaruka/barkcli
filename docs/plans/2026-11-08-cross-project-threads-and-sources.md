# Cross-Project Threads, Project Sources, and Project Management

Modernize Bark's desktop and web interface to provide streamlined cross-project thread management, project source integration, and project configuration settings matching modern developer workflow standards.

## Objectives
1. **Cross-Project Thread Rows in Sidebar:**
   - Redesign thread list rows into a clean 2-line layout:
     - Row 1: Project avatar badge (initials/color or dashed scratch indicator), project name, and status/relative timestamp (`✓ Settle`, `(!) Failed`, `2m`, etc.).
     - Row 2: Thread title with truncation and workspace/worktree indicator.
   - Highlight current thread with warm subtle card glow and border.
2. **Project Sources Modal:**
   - Dedicated Sources dialog with search input, keyboard navigation (`↑`/`↓`, `Enter`, `Backspace`, `Esc`), and source options:
     - New project
     - Local folder (native directory picker)
     - Git URL (remote clone)
     - GitHub repository
     - Azure DevOps repository (Setup Required)
     - Bitbucket repository (Setup Required)
3. **Project Picker Modal:**
   - Quick switcher / selector dialog for threads and projects:
     - Filterable project list with badges, paths, pin indicators, and direct shortcuts (`⌘1`, `⌥⌘N`, `⌘2`, etc.).
     - Keyboard navigation footer.
4. **Settings / Projects View:**
   - Dedicated `Settings / Projects` view with breadcrumbs, scope filters (`All projects`, `All environments`), descriptive guide, and interactive project cards with badges, paths, and management actions.

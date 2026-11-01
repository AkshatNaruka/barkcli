fn main() {
    // The webview is served by the local sidecar (`http://127.0.0.1:*`), which
    // Tauri treats as a remote origin. Remote origins only reach custom
    // commands when those commands are declared and granted explicitly.
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "current_project",
            "open_project_dialog",
            "switch_project",
            "recent_projects",
            "project_summaries",
            "reveal_project",
            "open_provider_login",
            "open_terminal",
            "open_logs",
            "notify",
            "sidebar_layout_get",
            "sidebar_layout_set",
                "thread_preference_set",
        ]),
    ))
    .expect("failed to run tauri build")
}

fn main() {
    let attributes =
        tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(&[
            "open_source_window",
            "test_model_connection",
            "generate_resume",
            "analyze_interview_experience",
            "cancel_interview_generation",
            "get_app_update_status",
            "check_app_update",
            "install_app_update",
            "open_app_release_page",
            "open_android_update",
        ]));
    tauri_build::try_build(attributes).expect("failed to run Tauri build helpers");
}

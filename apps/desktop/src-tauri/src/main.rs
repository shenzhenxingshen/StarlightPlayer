// Release builds are GUI applications on Windows; keep the console for debugging.
#![cfg_attr(
    all(target_os = "windows", not(debug_assertions)),
    windows_subsystem = "windows"
)]

use serde_json::Value;
use starlight_desktop::host::{Command, Host};
use starlight_desktop::runtime::RuntimePaths;
use std::sync::Arc;
use tauri::{Manager, State};
mod shell;

#[tauri::command]
fn snapshot(window: tauri::Window, host: State<'_, Arc<Host>>) -> Result<Value, String> {
    if window.label() != "main" {
        return Err("Unapproved window".into());
    }
    Ok(host.snapshot())
}

#[tauri::command]
async fn control(
    window: tauri::Window,
    app: tauri::AppHandle,
    host: State<'_, Arc<Host>>,
    command: Command,
) -> Result<Value, String> {
    if window.label() != "main" {
        return Err("Unapproved window".into());
    }
    let host = host.inner().clone();
    let export = matches!(command, Command::ExportDiagnostics {});
    let result = tauri::async_runtime::spawn_blocking(move || host.command(command))
        .await
        .map_err(|e| e.to_string())??;
    if export {
        use tauri_plugin_opener::OpenerExt;
        if let Some(path) = result["path"].as_str() {
            // Path comes only from the native exporter, never from the caller.
            if let Err(e) = app.opener().reveal_item_in_dir(path) {
                eprintln!("Cannot reveal exported file: {e}");
            }
        }
    }
    Ok(result)
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Debug builds may use the development checkout. Release builds must be
            // self-contained and fail clearly instead of using Homebrew/source paths.
            #[cfg(debug_assertions)]
            let runtime = RuntimePaths::development().map_err(std::io::Error::other)?;
            #[cfg(not(debug_assertions))]
            let runtime = RuntimePaths::bundled(&app.path().resource_dir()?)
                .map_err(std::io::Error::other)?;
            let host = Host::spawn_with_runtime(app.path().app_data_dir()?, false, runtime)
                .map_err(std::io::Error::other)?;
            let host = Arc::new(host);
            app.manage(host.clone());
            shell::install(app, host)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let host = window.state::<Arc<Host>>();
                if host.snapshot()["preferences"]["closeToBackground"] == true {
                    // Default on, respecting saved opt-out; no wake-from-sleep promise.
                    api.prevent_close();
                    let _ = window.hide();
                } else {
                    window.app_handle().exit(0);
                }
            }
        })
        .invoke_handler(tauri::generate_handler![snapshot, control])
        .run(tauri::generate_context!())
        .expect("Desktop host initialization failed");
}

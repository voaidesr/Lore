use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf, process::Command};
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
struct LibraryData {
    books: Vec<Book>,
    sessions: Vec<ReadingSession>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Book {
    id: String,
    title: String,
    author: String,
    #[serde(default = "default_category")]
    category: String,
    #[serde(default)]
    shelf: BookShelf,
    cover_image: Option<String>,
    #[serde(default)]
    pdf_path: Option<String>,
    total_pages: u32,
    current_page: u32,
    target: ReadingTarget,
    added_at: String,
    updated_at: String,
    finished_at: Option<String>,
}

fn default_category() -> String {
    "Unsorted".to_string()
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
enum BookShelf {
    #[default]
    Active,
    ReadingList,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
enum ReadingTarget {
    PagesPerDay { pages: u32 },
    PagesEveryDays { pages: u32, days: u32 },
    PagesPerWeek { pages: u32 },
    Deadline { finish_by: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReadingSession {
    id: String,
    book_id: String,
    date: String,
    from_page: u32,
    to_page: u32,
    pages_read: u32,
    created_at: String,
}

fn library_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("Could not resolve app data directory: {err}"))?;

    fs::create_dir_all(&dir).map_err(|err| {
        format!(
            "Could not create app data directory {}: {err}",
            dir.display()
        )
    })?;

    Ok(dir.join("library.json"))
}

#[tauri::command]
fn load_library(app: AppHandle) -> Result<LibraryData, String> {
    let path = library_path(&app)?;

    if !path.exists() {
        return Ok(LibraryData::default());
    }

    let content = fs::read_to_string(&path)
        .map_err(|err| format!("Could not read {}: {err}", path.display()))?;

    if content.trim().is_empty() {
        return Ok(LibraryData::default());
    }

    serde_json::from_str(&content)
        .map_err(|err| format!("Could not parse {}: {err}", path.display()))
}

#[tauri::command]
fn save_library(app: AppHandle, data: LibraryData) -> Result<(), String> {
    let path = library_path(&app)?;
    let temp_path = path.with_extension("json.tmp");
    let json = serde_json::to_string_pretty(&data)
        .map_err(|err| format!("Could not serialize library data: {err}"))?;

    fs::write(&temp_path, json)
        .map_err(|err| format!("Could not write {}: {err}", temp_path.display()))?;
    fs::rename(&temp_path, &path).map_err(|err| {
        format!(
            "Could not replace {} with {}: {err}",
            path.display(),
            temp_path.display()
        )
    })?;

    Ok(())
}

#[tauri::command]
fn open_pdf_in_okular(path: String) -> Result<(), String> {
    let pdf_path = PathBuf::from(path);

    if !pdf_path.exists() {
        return Err(format!("PDF not found: {}", pdf_path.display()));
    }

    Command::new("okular")
        .arg(&pdf_path)
        .spawn()
        .map_err(|err| {
            format!("Could not open Okular. Install it with `sudo dnf install okular`: {err}")
        })?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            load_library,
            save_library,
            open_pdf_in_okular
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

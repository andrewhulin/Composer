mod db;
mod prototypes;
mod secrets;
mod share;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            let db = db::Db::open(&dir.join("composer.db"))?;
            app.manage(db);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            db::db_all,
            db::db_run,
            db::db_tx,
            prototypes::prototype_write,
            secrets::secret_get,
            secrets::secret_set,
            secrets::secret_delete,
            share::renderer_default_dir,
            share::story_render,
            share::reference_frames,
            share::pr_open,
            share::reveal_path,
            share::open_url,
            share::gh_status,
            share::read_folder,
            share::read_text_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Design Composer");
}

use tauri::{plugin::{Builder, TauriPlugin}, AppHandle, Runtime};
#[cfg(target_os = "android")]
use tauri::Manager;
#[cfg(target_os = "android")]
struct Fullscreen<R: Runtime>(tauri::plugin::PluginHandle<R>);

#[tauri::command]
async fn set_fullscreen<R: Runtime>(app: AppHandle<R>, enabled: bool) -> Result<(), String> {
    #[cfg(target_os = "android")]
    app.state::<Fullscreen<R>>().0
        .run_mobile_plugin::<serde_json::Value>("setFullscreen", serde_json::json!({ "enabled": enabled }))
        .map(|_| ())
        .map_err(|error| error.to_string())?;
    #[cfg(not(target_os = "android"))]
    let _ = (app, enabled);
    Ok(())
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("player-fullscreen")
        .invoke_handler(tauri::generate_handler![set_fullscreen])
        .setup(|_app, _api| {
            #[cfg(target_os = "android")]
            _app.manage(Fullscreen(_api.register_android_plugin(
                "io.github.luckye1120.fullscreen", "PlayerFullscreenPlugin"
            )?));
            Ok(())
        })
        .build()
}

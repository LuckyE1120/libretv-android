fn main() {
    tauri_plugin::Builder::new(&["set_fullscreen"])
        .android_path("android")
        .build();
}

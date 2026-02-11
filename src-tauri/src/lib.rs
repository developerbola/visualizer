use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use rustfft::FftPlanner;
use rustfft::num_complex::Complex;
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager, Runtime};

#[tauri::command]
fn start_audio_capture<R: Runtime>(app: tauri::AppHandle<R>) {
    std::thread::spawn(move || {
        let host = cpal::default_host();
        
        // Use default input device (microphone)
        let device = host.default_input_device().expect("no input device available");

        println!("Using default input device (Microphone): {:?}", device.name());

        let config = device
            .default_input_config()
            .expect("Failed to get default input config");

        let channels = config.channels() as usize;

        let fft_size = 1024;
        let mut planner = FftPlanner::new();
        let fft = planner.plan_fft_forward(fft_size);

        let buffer = Arc::new(Mutex::new(Vec::with_capacity(fft_size)));

        let buffer_clone = Arc::clone(&buffer);
        let stream = device.build_input_stream(
            &config.into(),
            move |data: &[f32], _: &_| {
                let mut buf = buffer_clone.lock().unwrap();
                for &sample in data.iter().step_by(channels) {
                    buf.push(sample);
                    if buf.len() >= fft_size {
                        let mut input: Vec<Complex<f32>> = buf
                            .iter()
                            .map(|&s| Complex { re: s, im: 0.0 })
                            .collect();
                        
                        fft.process(&mut input);
                        
                        // Calculate magnitudes and send to frontend
                        let magnitudes: Vec<f32> = input
                            .iter()
                            .take(fft_size / 2)
                            .map(|c| (c.re * c.re + c.im * c.im).sqrt())
                            .collect();
                        
                        let _ = app.emit("audio-data", magnitudes);
                        buf.clear();
                    }
                }
            },
            |err| eprintln!("An error occurred on stream: {}", err),
            None,
        ).expect("Failed to build input stream");

        stream.play().expect("Failed to play stream");
        
        // Keep the thread alive
        loop {
            std::thread::sleep(std::time::Duration::from_millis(100));
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
#[tauri::command]
fn update_window_position(app: tauri::AppHandle, x: f32, y: f32) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_position(tauri::PhysicalPosition::new(x as i32, y as i32));
    }
}

#[tauri::command]
fn set_always_on_top(app: tauri::AppHandle, always: bool) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_always_on_top(always);
    }
}

#[tauri::command]
fn set_visible_on_all_workspaces(app: tauri::AppHandle, visible: bool) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_visible_on_all_workspaces(visible);
    }
}

use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Hide the dock icon on macOS
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let settings_i = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&settings_i, &quit_i])?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(true)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "settings" => {
                        if let Some(window) = app.get_webview_window("settings") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .build(app)?;

            let _visualizer = app.get_webview_window("main").unwrap();
            
            // Allow settings window to be backgrounded easily
            if let Some(settings) = app.get_webview_window("settings") {
                let _ = settings.set_focus();
            }

            // Make the main visualizer window click-through by default
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_ignore_cursor_events(true);
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            start_audio_capture,
            update_window_position,
            set_always_on_top,
            set_visible_on_all_workspaces
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

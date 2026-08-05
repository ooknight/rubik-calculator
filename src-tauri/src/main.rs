// 主进程为纯壳：仅创建窗口，不含任何业务逻辑。
// 全部计算与状态均在 React/TS 前端完成。
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

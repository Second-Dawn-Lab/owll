fn main() {
    // A local test that reads a real recording lives in a file that is not committed; it is only built when the file exists.
    println!("cargo::rustc-check-cfg=cfg(live_local)");
    println!("cargo:rerun-if-changed=src/live_local_test.rs");
    if std::path::Path::new("src/live_local_test.rs").exists() {
        println!("cargo:rustc-cfg=live_local");
    }
    tauri_build::build()
}

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The shared @seconddawn/* packages are linked from the sibling dawn-core repository (../dawn-core).
// They ship TypeScript sources, so Vite compiles them with the app and edits there hot reload.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  resolve: {
    // One copy of React, even though the linked packages sit in another folder.
    dedupe: ["react", "react-dom"],
  },
  // Tauri expects a fixed dev port (see src-tauri/tauri.conf.json).
  server: {
    port: 1420,
    strictPort: true,
    // Allow serving files from ../dawn-core.
    fs: { allow: [".."] },
    // Cargo writes build files into target folders (also in ../dawn-core); watching them causes EBUSY on Windows.
    watch: {
      ignored: [
        "**/src-tauri/**",
        "**/target/**",
        "**/target-*/**",
        "**/src-tauri/target/**",
        "**/node_modules/**",
      ],
    },
  },
});

/**
 * Renderer-only dev server, for working on the UI in a plain browser.
 *
 * `window.matter` is absent here, so src/renderer/src/lib/api.ts falls back to its demo
 * backend. Use `npm run dev` (electron-vite) for the real thing.
 */
import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";
import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
    root: resolve(__dirname, "src/renderer"),
    plugins: [vue(), tailwindcss()],
    resolve: {
        alias: {
            "@": resolve(__dirname, "src/renderer/src"),
            "@shared": resolve(__dirname, "src/shared"),
        },
    },
    server: { port: 5199, strictPort: true },
});

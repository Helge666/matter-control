import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import { resolve } from "node:path";

export default defineConfig({
    main: {
        // matter.js stays in node_modules: it resolves platform modules dynamically and
        // must not be flattened into the bundle.
        plugins: [externalizeDepsPlugin()],
        build: {
            rollupOptions: { input: { index: resolve(__dirname, "src/main/index.ts") } },
        },
        resolve: {
            alias: { "@shared": resolve(__dirname, "src/shared") },
        },
    },
    preload: {
        plugins: [externalizeDepsPlugin()],
        build: {
            rollupOptions: { input: { index: resolve(__dirname, "src/preload/index.ts") } },
        },
        resolve: {
            alias: { "@shared": resolve(__dirname, "src/shared") },
        },
    },
    renderer: {
        root: resolve(__dirname, "src/renderer"),
        plugins: [vue(), tailwindcss()],
        resolve: {
            alias: {
                "@": resolve(__dirname, "src/renderer/src"),
                "@shared": resolve(__dirname, "src/shared"),
            },
        },
        build: {
            rollupOptions: { input: { index: resolve(__dirname, "src/renderer/index.html") } },
        },
    },
});

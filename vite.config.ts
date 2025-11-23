import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    hmr: process.env.DISABLE_HMR ? false : undefined,
    watch: {
      // THIS STOPS THE ZOMBIE LOOP
      // It tells Vite: "Don't reload when the database or logs change"
      ignored: [
        "**/electron/**",
        "**/dist/**",
        "**/results/**",
        "**/benchmarks/**",
        "**/.vscode/**",
        "**/.idea/**",
        "**/userData/**",
        "**/*.sqlite",
        "**/*.sqlite-journal",
        "**/*.db",
        "**/logs/**",
        "**/*.json",
        "**/*.log",
        "**/*.py",
      ]
    }
  }
})

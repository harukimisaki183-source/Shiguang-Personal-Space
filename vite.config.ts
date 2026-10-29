import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Electron 通过 app://shiguang/index.html 加载打包结果，资源需要使用相对路径。
  base: './',
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
  },
})

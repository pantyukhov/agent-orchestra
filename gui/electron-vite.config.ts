import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename2 = fileURLToPath(import.meta.url)
const __dirname2 = dirname(__filename2)

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: resolve(__dirname2, 'src/main/index.ts'),
        external: [/\.node$/]
      }
    }
  },
  preload: {
    build: {
      rollupOptions: {
        input: resolve(__dirname2, 'src/preload/index.ts')
      }
    }
  },
  renderer: {
    root: resolve(__dirname2, 'src/renderer'),
    build: {
      rollupOptions: {
        input: resolve(__dirname2, 'src/renderer/index.html')
      }
    },
    resolve: {
      alias: {
        '@': resolve(__dirname2, 'src/renderer')
      }
    },
    plugins: [react()]
  }
})

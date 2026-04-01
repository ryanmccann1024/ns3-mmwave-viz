import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import outputsPlugin from './vite-plugin-outputs'

export default defineConfig({
  plugins: [react(), outputsPlugin()],
})

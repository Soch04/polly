import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Split vendor chunks from app code so browsers can cache them separately.
        // React + router rarely change; Firebase changes more often but is still
        // worth separating from application code.
        manualChunks: {
          vendor:   ['react', 'react-dom', 'react-router-dom'],
          firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/storage'],
        },
      },
    },
  },
})

import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
    server: {
        port: 5173,
        proxy: {
            '/socket.io': {
                target: 'http://localhost:3000',
                ws: true,
            }
        }
    },
    build: {
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
                editor: resolve(__dirname, 'editor.html'),
            }
        }
    }
});

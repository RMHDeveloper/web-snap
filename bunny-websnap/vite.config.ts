import path from 'path';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Serve the /api/* serverless functions during `vite dev` so local dev matches
// production. In production Vercel runs these same files from ../api.
function devApi(env: Record<string, string>): Plugin {
  return {
    name: 'dev-api',
    apply: 'serve',
    configureServer(server) {
      // The functions read process.env; mirror .env.local into it for dev.
      if (env.GEMINI_API_KEY && !process.env.GEMINI_API_KEY) {
        process.env.GEMINI_API_KEY = env.GEMINI_API_KEY;
      }
      const routes: Record<string, string> = {
        '/api/analyze': '../api/analyze.ts',
        '/api/transcribe': '../api/transcribe.ts',
      };
      server.middlewares.use(async (req, res, next) => {
        const pathname = (req.url || '').split('?')[0];
        const modPath = routes[pathname];
        if (!modPath) return next();
        try {
          const mod = await server.ssrLoadModule(path.resolve(__dirname, modPath));
          await mod.default(req, res);
        } catch (err: any) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: err?.message || 'dev api error' }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
      // Allow the dev-api plugin to load ../api/*.ts (one level above the app).
      fs: { allow: [path.resolve(__dirname, '..')] },
    },
    plugins: [react(), devApi(env)],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});

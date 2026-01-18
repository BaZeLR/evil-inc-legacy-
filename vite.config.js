import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';

const DB_VERSION_TTL_MS = 4000;
const APP_NAME = 'EVIL Incorporated — The Legacy AI Edition';
const APP_VERSION = process.env.npm_package_version || '0.0.0';
const APP_BUILD_TIME = new Date().toISOString();

const dbChangeState = {
  version: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  source: 'init',
  path: null,
  at: Date.now()
};

const recentDbWrites = new Map();

function bumpDbVersion(source, changedPath) {
  dbChangeState.version = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  dbChangeState.source = source || 'unknown';
  dbChangeState.path = changedPath || null;
  dbChangeState.at = Date.now();
}

function recordDbWrite(relativePath) {
  const key = String(relativePath ?? '');
  if (!key) return;
  recentDbWrites.set(key, Date.now());
  bumpDbVersion('write', key);
}

function isRecentlyWritten(relativePath) {
  const key = String(relativePath ?? '');
  if (!key) return false;

  const now = Date.now();
  for (const [pathKey, at] of recentDbWrites) {
    if (now - at > DB_VERSION_TTL_MS) recentDbWrites.delete(pathKey);
  }

  const at = recentDbWrites.get(key);
  return typeof at === 'number' && now - at <= DB_VERSION_TTL_MS;
}

function dbServePlugin() {
  return {
    name: 'db-serve-plugin',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        try {
          if (req.method !== 'GET' && req.method !== 'HEAD') return next();

          const url = decodeURIComponent(String(req.url ?? '').split('?')[0] || '');
          if (!url.startsWith('/DB/')) return next();

          const baseDir = path.resolve(process.cwd(), 'public', 'DB') + path.sep;
          const targetPath = path.resolve(process.cwd(), 'public', url.replace(/^\/+/, ''));
          if (!targetPath.startsWith(baseDir)) return next();

          const content = await fs.readFile(targetPath);
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.end(content);
        } catch {
          next();
        }
      });
    }
  };
}

function dbVersionPlugin() {
  return {
    name: 'db-version-plugin',
    configureServer(server) {
      const dbDir = path.resolve(process.cwd(), 'public', 'DB');
      let watcher = null;

      try {
        watcher = fsSync.watch(dbDir, { recursive: true }, (eventName, filename) => {
          const raw = filename ? String(filename) : '';
          const normalized = raw.replace(/\\/g, '/').replace(/^\/+/, '');
          const dbPath = normalized ? `DB/${normalized}` : null;
          if (dbPath && isRecentlyWritten(dbPath)) return;
          bumpDbVersion('fs', dbPath);
        });
        server.httpServer?.once('close', () => watcher?.close());
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn('db-version-plugin: fs.watch failed:', error?.message || String(error));
      }

      server.middlewares.use('/api/db/version', (req, res, next) => {
        try {
          if (req.method !== 'GET' && req.method !== 'HEAD') return next();
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify(dbChangeState));
        } catch {
          next();
        }
      });
    }
  };
}

function dbWritePlugin() {
  return {
    name: 'db-write-plugin',
    configureServer(server) {
      server.middlewares.use('/api/db/write', (req, res, next) => {
        if (req.method !== 'POST') return next();

        let body = '';
        req.on('data', chunk => {
          body += chunk;
        });

        req.on('end', async () => {
          try {
            const payload = JSON.parse(body || '{}');
            const relativePath = String(payload?.path ?? '').replace(/^\/+/, '');
            if (!relativePath.startsWith('DB/')) throw new Error('Path must start with DB/');

            const baseDir = path.resolve(process.cwd(), 'public', 'DB') + path.sep;
            const targetPath = path.resolve(process.cwd(), 'public', relativePath);
            if (!targetPath.startsWith(baseDir)) throw new Error('Invalid path');

            await fs.mkdir(path.dirname(targetPath), { recursive: true });
            await fs.writeFile(targetPath, `${JSON.stringify(payload?.data ?? null, null, 2)}\n`, 'utf8');
            recordDbWrite(relativePath);

            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true }));
          } catch (error) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: false, error: error?.message || String(error) }));
          }
        });
      });
    }
  };
}

async function listJsonFiles(rootDir, publicDir) {
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listJsonFiles(fullPath, publicDir)));
      continue;
    }
    if (!entry.isFile()) continue;
    if (!entry.name.toLowerCase().endsWith('.json')) continue;
    const relative = path.relative(publicDir, fullPath).replace(/\\/g, '/');
    if (relative) files.push(relative);
  }

  return files;
}

function dbListPlugin() {
  return {
    name: 'db-list-plugin',
    configureServer(server) {
      server.middlewares.use('/api/db/list', async (req, res, next) => {
        try {
          if (req.method !== 'GET' && req.method !== 'HEAD') return next();

          const requestUrl = new URL(String(req.url ?? ''), 'http://localhost');
          const dirParam = String(requestUrl.searchParams.get('dir') ?? '').replace(/^\/+/, '');
          if (!dirParam.startsWith('DB/')) throw new Error('dir must start with DB/');

          const publicDir = path.resolve(process.cwd(), 'public');
          const baseDir = path.resolve(publicDir, 'DB') + path.sep;
          const targetDir = path.resolve(publicDir, dirParam);
          if (!targetDir.startsWith(baseDir)) throw new Error('Invalid dir');

          const files = await listJsonFiles(targetDir, publicDir);
          files.sort((a, b) => a.localeCompare(b));

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify({ ok: true, dir: dirParam, files }));
        } catch (error) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify({ ok: false, error: error?.message || String(error) }));
        }
      });
    }
  };
}

export default defineConfig({
  plugins: [react(), dbServePlugin(), dbWritePlugin(), dbListPlugin(), dbVersionPlugin()],
  root: '.',
  publicDir: 'public',
  define: {
    __APP_NAME__: JSON.stringify(APP_NAME),
    __APP_VERSION__: JSON.stringify(APP_VERSION),
    __APP_BUILD_TIME__: JSON.stringify(APP_BUILD_TIME)
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    open: true,
    watch: {
      ignored: ['**/regalia/**', '**/public/DB/**'],
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
    open: true
  },
  optimizeDeps: {
    exclude: ['regalia']
  },
  build: {
    assetsDir: '_vite',
    rollupOptions: {
      input: './index.html',
      external: ['regalia']
    }
  }
});

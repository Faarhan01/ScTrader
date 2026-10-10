import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { setupWebSocketServer } from './backend/services/websocketServer.js';
import { mt5Router } from './backend/routes/mt5Routes.js';
import { apiRouter } from './backend/routes/apiRoutes.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isProd = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT) || 3000;
const MT5_PORT = 7777;

async function startServer() {
  const app = express();

  // Middleware
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // CORS headers for local MT5 and external AI agents
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // Mount MT5 direct routes for http://127.0.0.1:7777 and http://127.0.0.1:3000
  app.use('/', mt5Router);
  app.use('/api/mt5', mt5Router);

  // Mount API & MCP routes
  app.use('/api', apiRouter);

  const server = http.createServer(app);

  // Attach WebSocket server for real-time tick streaming and order events
  setupWebSocketServer(server);

  // Vite middleware in dev or static files in production
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist/index.html'));
    });
  }

  // Start Main Server on Port 3000
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[MT5 Bridge Terminal] Web UI & WebSocket Server running at http://localhost:${PORT}`);
  });

  // Start Dedicated MT5 Listener on Port 7777 (http://127.0.0.1:7777)
  try {
    const mt5App = express();
    mt5App.use(express.json({ limit: '10mb' }));
    mt5App.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
      if (req.method === 'OPTIONS') return res.sendStatus(200);
      next();
    });

    mt5App.use('/', mt5Router);
    mt5App.use('/api/mt5', mt5Router);
    mt5App.use('/api', apiRouter);

    const mt5Server = http.createServer(mt5App);
    mt5Server.listen(MT5_PORT, '0.0.0.0', () => {
      console.log(`[MT5 Bridge Hub] Dedicated MT5 Endpoint running at http://127.0.0.1:${MT5_PORT}`);
    });
    mt5Server.on('error', (err: any) => {
      console.warn(`[MT5 Bridge Hub] Port ${MT5_PORT} notice: ${err.message}. Port ${PORT} remains fully active for MT5 routing.`);
    });
  } catch (err: any) {
    console.warn(`[MT5 Bridge Hub] Could not bind port ${MT5_PORT}: ${err.message}`);
  }
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

import { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import jwt from 'jsonwebtoken';

interface AuthenticatedSocket extends WebSocket {
  userId?: string;
  isAlive?: boolean;
  subscriptions?: Set<string>;
}

let wss: WebSocketServer | null = null;

export function initializeWebSocket(server: HttpServer): void {
  wss = new WebSocketServer({
    server,
    path: '/ws/signals',
  });

  // Heartbeat to detect stale connections
  const heartbeat = setInterval(() => {
    wss?.clients.forEach((ws) => {
      const socket = ws as AuthenticatedSocket;
      if (socket.isAlive === false) {
        socket.terminate();
        return;
      }
      socket.isAlive = false;
      socket.ping();
    });
  }, 30000);

  wss.on('close', () => {
    clearInterval(heartbeat);
  });

  wss.on('connection', (ws: AuthenticatedSocket, req) => {
    // Authenticate on connection
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const token = url.searchParams.get('token');

    if (!token) {
      ws.close(4001, 'Missing authentication token');
      return;
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || '') as { sub: string };
      ws.userId = decoded.sub;
      ws.isAlive = true;
      ws.subscriptions = new Set();
      console.log(`[WebSocket] Client connected: user=${ws.userId}`);
    } catch {
      ws.close(4002, 'Invalid authentication token');
      return;
    }

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', async (message: Buffer) => {
      try {
        const msg = JSON.parse(message.toString());

        switch (msg.type) {
          case 'subscribe': {
            // Subscribe to signal updates
            const channels = Array.isArray(msg.channels) ? msg.channels : [msg.channels];
            channels.forEach((ch: string) => ws.subscriptions?.add(ch));
            ws.send(JSON.stringify({ type: 'subscribed', channels }));
            break;
          }

          case 'unsubscribe': {
            const channels = Array.isArray(msg.channels) ? msg.channels : [msg.channels];
            channels.forEach((ch: string) => ws.subscriptions?.delete(ch));
            ws.send(JSON.stringify({ type: 'unsubscribed', channels }));
            break;
          }

          case 'ping': {
            ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
            break;
          }

          default:
            ws.send(JSON.stringify({ type: 'error', message: `Unknown message type: ${msg.type}` }));
        }
      } catch {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON message' }));
      }
    });

    ws.on('close', () => {
      console.log(`[WebSocket] Client disconnected: user=${ws.userId}`);
    });

    ws.on('error', (err) => {
      console.error(`[WebSocket] Error for user ${ws.userId}:`, err.message);
    });

    // Send welcome message
    ws.send(JSON.stringify({
      type: 'connected',
      userId: ws.userId,
      timestamp: new Date().toISOString(),
    }));
  });

  console.log('[WebSocket] Server initialized on /ws/signals');
}

/**
 * Broadcast a signal update to all connected clients subscribed to a channel.
 */
export function broadcastSignal(channel: string, data: unknown): void {
  if (!wss) return;

  const payload = JSON.stringify({
    type: 'signal_update',
    channel,
    data,
    timestamp: new Date().toISOString(),
  });

  wss.clients.forEach((ws) => {
    const socket = ws as AuthenticatedSocket;
    if (socket.readyState === WebSocket.OPEN && socket.subscriptions?.has(channel)) {
      socket.send(payload);
    }
  });
}

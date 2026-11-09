import { WebSocketServer } from 'ws';
import { User } from '../models/User.js';
import { entitlementsFor } from '../services/entitlementService.js';
import { authorizeRoom } from '../services/chatService.js';
import { blockedIds } from '../services/communityService.js';
import { verifyAccessToken } from '../utils/tokens.js';

/**
 * Live delivery for chat. Messages are created and validated through the REST API (so rate limits,
 * moderation and persistence are in one place) and then pushed here to everyone who has joined the room.
 * The WebSocket is only a delivery channel: clients can always fall back to polling the REST endpoint.
 *
 * One process holds the room map. Running several API instances needs a shared pub/sub (e.g. Redis)
 * between them — noted in the README.
 */
const rooms = new Map(); // room -> Set<WebSocket>
const MAX_ROOMS_PER_SOCKET = 20;

const send = (ws, payload) => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(payload)); };

/** Push `payload` to a room, skipping anyone who blocked (or is blocked by) `authorId`. */
export async function broadcast(room, payload, authorId = null) {
  const sockets = rooms.get(room);
  if (!sockets?.size) return;
  const hidden = authorId ? new Set((await blockedIds(authorId)).map(String)) : new Set();
  for (const ws of sockets) if (!hidden.has(String(ws.userId))) send(ws, payload);
}

export const connectedCount = (room) => rooms.get(room)?.size ?? 0;

function leaveAll(ws) {
  for (const room of ws.rooms) rooms.get(room)?.delete(ws);
  ws.rooms.clear();
}

export function attachChat(server) {
  const wss = new WebSocketServer({ server, path: '/v1/chat/ws', maxPayload: 4096 });

  wss.on('connection', (ws, req) => {
    ws.rooms = new Set();
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('close', () => { clearTimeout(ws.expiry); leaveAll(ws); });
    ws.on('error', () => {});

    // Authenticate with the same short-lived access token as the REST API. This is async, so the message
    // handler below is attached immediately and waits for it — a client that sends `join` the instant the
    // socket opens must not have that message dropped while we look the user up.
    const authenticated = (async () => {
      let payload;
      try {
        payload = verifyAccessToken(new URL(req.url, 'http://x').searchParams.get('token') || '');
      } catch {
        ws.close(4401, 'unauthorized');
        return false;
      }
      const user = await User.findOne({ _id: payload.sub, deletedAt: null, status: 'active' }).lean();
      if (!user) { ws.close(4401, 'unauthorized'); return false; }
      ws.userId = String(user._id);
      // A socket must not outlive its token; the app reconnects with a refreshed one.
      ws.expiry = setTimeout(() => ws.close(4401, 'token expired'), Math.max(1000, payload.exp * 1000 - Date.now()));
      send(ws, { type: 'ready' });
      return true;
    })();

    ws.on('message', async (raw) => {
      if (!(await authenticated)) return;
      let msg;
      try { msg = JSON.parse(String(raw)); } catch { return send(ws, { type: 'error', code: 'bad_message' }); }

      if (msg.type === 'ping') return send(ws, { type: 'pong' });
      if (msg.type === 'leave') { rooms.get(msg.room)?.delete(ws); ws.rooms.delete(msg.room); return undefined; }
      if (msg.type !== 'join') return send(ws, { type: 'error', code: 'unknown_type' });

      try {
        // Re-checked on every join: membership and area can change while a socket stays open.
        const fresh = await User.findById(ws.userId).lean();
        if (!(await entitlementsFor(fresh)).features.community) return send(ws, { type: 'error', code: 'membership_required', room: msg.room });
        if (ws.rooms.size >= MAX_ROOMS_PER_SOCKET) return send(ws, { type: 'error', code: 'too_many_rooms' });
        const info = await authorizeRoom(fresh, msg.room);
        if (!rooms.has(info.room)) rooms.set(info.room, new Set());
        rooms.get(info.room).add(ws);
        ws.rooms.add(info.room);
        send(ws, { type: 'joined', room: info.room });
      } catch (e) {
        send(ws, { type: 'error', code: e.code || 'forbidden', room: msg.room, message: e.message });
      }
    });
  });

  // Drop connections that stopped answering pings (phones that lost signal).
  const beat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) { ws.terminate(); continue; }
      ws.isAlive = false;
      ws.ping();
    }
  }, 30_000);
  beat.unref();
  wss.on('close', () => clearInterval(beat));
  return wss;
}

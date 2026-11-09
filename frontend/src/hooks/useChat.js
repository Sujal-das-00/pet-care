import { useCallback, useEffect, useRef, useState } from 'react';
import { API_URL } from '../config';
import { ChatApi, MeApi } from '../api/resources';
import { currentSession } from '../api/client';

const POLL_MS = 6000;
const wsUrl = (token) => `${API_URL.replace(/^http/, 'ws')}/v1/chat/ws?token=${encodeURIComponent(token)}`;

/** Chronological, de-duplicated by id. */
const merge = (a, b) => {
  const map = new Map();
  [...a, ...b].forEach((m) => map.set(m.id, m));
  return [...map.values()].sort((x, y) => new Date(x.createdAt) - new Date(y.createdAt) || x.id.localeCompare(y.id));
};

/**
 * One chat room. History comes from the REST API (the source of truth). New messages arrive over a
 * WebSocket; if it can't connect (or drops) we fall back to polling, so chat keeps working either way.
 * status: connecting | live | polling | locked
 */
export function useChatRoom(room) {
  const [messages, setMessages] = useState([]);
  const [info, setInfo] = useState(null);
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('connecting');
  const [error, setError] = useState(null);
  const alive = useRef(true);
  const socket = useRef(null);

  const append = useCallback((list) => { if (alive.current) setMessages((cur) => merge(cur, list)); }, []);

  const loadLatest = useCallback(async () => {
    try {
      const r = await ChatApi.messages(room, { limit: 40 });
      if (!alive.current) return;
      setInfo(r.room);
      setMessages((cur) => merge(cur, [...r.items].reverse()));
      setCursor((c) => (c === null ? r.nextCursor : c));
      setError(null);
    } catch (e) {
      if (!alive.current) return;
      if (e.code === 'membership_required') setStatus('locked');
      setError(e);
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [room]);

  const loadOlder = useCallback(async () => {
    if (!cursor) return;
    const r = await ChatApi.messages(room, { limit: 40, cursor });
    append([...r.items].reverse());
    if (alive.current) setCursor(r.nextCursor);
  }, [room, cursor, append]);

  const send = useCallback(async (text) => {
    const r = await ChatApi.send(room, text);
    append([r.message]);
    return r.message;
  }, [room, append]);

  const remove = useCallback(async (id) => {
    await ChatApi.remove(room, id);
    if (alive.current) setMessages((cur) => cur.filter((m) => m.id !== id));
  }, [room]);

  useEffect(() => {
    alive.current = true;
    let retry = 0;
    let timer;
    let poller;
    let stopped = false;

    loadLatest();

    const startPolling = () => {
      if (poller) return;
      setStatus((s) => (s === 'locked' ? s : 'polling'));
      poller = setInterval(loadLatest, POLL_MS);
    };
    const stopPolling = () => { clearInterval(poller); poller = null; };

    async function connect() {
      if (stopped) return;
      try {
        await MeApi.get(); // refreshes the access token if it has expired, so the socket gets a valid one
        const token = currentSession()?.accessToken;
        if (!token || typeof WebSocket === 'undefined') throw new Error('no websocket');
        const ws = new WebSocket(wsUrl(token));
        socket.current = ws;
        ws.onopen = () => { retry = 0; };
        ws.onmessage = (ev) => {
          let m;
          try { m = JSON.parse(ev.data); } catch { return; }
          if (m.type === 'ready') ws.send(JSON.stringify({ type: 'join', room })); // the server has authenticated us
          else if (m.type === 'joined') { stopPolling(); setStatus('live'); loadLatest(); } // catch up on anything missed
          else if (m.type === 'message' && m.message?.room === room) append([m.message]);
          else if (m.type === 'deleted' && m.room === room) setMessages((cur) => cur.filter((x) => x.id !== m.id));
          else if (m.type === 'error' && m.code === 'membership_required') setStatus('locked');
        };
        ws.onclose = () => {
          socket.current = null;
          if (stopped) return;
          startPolling();
          retry += 1;
          timer = setTimeout(connect, Math.min(30_000, 1000 * 2 ** Math.min(retry, 5)));
        };
        ws.onerror = () => {};
      } catch {
        if (stopped) return;
        startPolling();
        retry += 1;
        timer = setTimeout(connect, Math.min(30_000, 1000 * 2 ** Math.min(retry, 5)));
      }
    }
    connect();

    return () => {
      stopped = true;
      alive.current = false;
      clearTimeout(timer);
      stopPolling();
      try { socket.current?.close(); } catch { /* already closed */ }
    };
  }, [room, loadLatest, append]);

  return { messages, info, loading, status, error, hasOlder: Boolean(cursor), loadOlder, send, remove };
}

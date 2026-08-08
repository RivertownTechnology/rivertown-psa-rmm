import { useEffect, useRef } from 'react';
import { API_BASE, getAccessToken } from './api';

export interface LiveTicketEvent {
  type: 'ticket.created' | 'ticket.updated' | 'ticket.comment.created';
  ticketId: string;
}

type Listener = (evt: LiveTicketEvent) => void;

// One shared WebSocket for the whole tab — every subscriber (ticket detail,
// eventually a live tickets list, etc.) rides the same connection instead of
// each opening its own.
const listeners = new Set<Listener>();
let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;

function buildWsUrl(token: string): string {
  const path = `${API_BASE}/ws`;
  if (path.startsWith('/')) {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}${path}?token=${encodeURIComponent(token)}`;
  }
  return `${path.replace(/^http/, 'ws')}?token=${encodeURIComponent(token)}`;
}

function scheduleReconnect() {
  if (reconnectTimer || listeners.size === 0) return;
  const delay = Math.min(30_000, 1000 * 2 ** reconnectAttempts);
  reconnectAttempts += 1;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delay);
}

function connect() {
  const token = getAccessToken();
  if (!token || listeners.size === 0) return;
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;

  socket = new WebSocket(buildWsUrl(token));

  socket.onopen = () => {
    reconnectAttempts = 0;
  };

  socket.onmessage = (event) => {
    let data: LiveTicketEvent;
    try {
      data = JSON.parse(event.data);
    } catch {
      return;
    }
    for (const listener of listeners) listener(data);
  };

  socket.onclose = () => {
    socket = null;
    scheduleReconnect();
  };

  socket.onerror = () => {
    socket?.close();
  };
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  connect();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      socket?.close();
      socket = null;
    }
  };
}

// Subscribes to live ticket events for the lifetime of the component.
// `onEvent` doesn't need to be memoized by the caller — the connection is
// only opened/closed once per mount, not on every render.
export function useLiveTicketEvents(onEvent: Listener) {
  const handlerRef = useRef(onEvent);
  useEffect(() => {
    handlerRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => subscribe((evt) => handlerRef.current(evt)), []);
}

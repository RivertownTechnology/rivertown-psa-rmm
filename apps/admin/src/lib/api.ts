const API_BASE = (import.meta as any).env?.VITE_API_URL
  ? `${(import.meta as any).env.VITE_API_URL}/api/v1`
  : '/api/v1';

let accessToken: string | null = localStorage.getItem('forgeadmin.accessToken');
let refreshToken: string | null = localStorage.getItem('forgeadmin.refreshToken');

export function setTokens(a: string, r: string) {
  accessToken = a;
  refreshToken = r;
  localStorage.setItem('forgeadmin.accessToken', a);
  localStorage.setItem('forgeadmin.refreshToken', r);
}

export function clearTokens() {
  accessToken = null;
  refreshToken = null;
  localStorage.removeItem('forgeadmin.accessToken');
  localStorage.removeItem('forgeadmin.refreshToken');
}

export function getAccessToken() {
  return accessToken;
}

async function refreshAccess(): Promise<boolean> {
  if (!refreshToken) return false;
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    accessToken = data.accessToken;
    if (data.refreshToken) refreshToken = data.refreshToken;
    localStorage.setItem('forgeadmin.accessToken', data.accessToken);
    if (data.refreshToken) localStorage.setItem('forgeadmin.refreshToken', data.refreshToken);
    return true;
  } catch {
    return false;
  }
}

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function api<T = unknown>(path: string, init: RequestInit = {}, retryOnAuth = true): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });

  if (res.status === 401 && retryOnAuth) {
    const ok = await refreshAccess();
    if (ok) return api<T>(path, init, false);
    clearTokens();
    throw new ApiError(401, 'Session expired');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body?.message ?? body?.error ?? res.statusText, body?.error);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export async function login(email: string, password: string) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const b = await res.json().catch(() => ({}));
    throw new ApiError(res.status, b?.message ?? 'Invalid credentials');
  }
  return res.json();
}

const API_BASE = '/api/v1';

let accessToken: string | null = localStorage.getItem('portal_accessToken');
let refreshToken: string | null = localStorage.getItem('portal_refreshToken');

export function setTokens(access: string, refresh: string) {
  accessToken = access;
  refreshToken = refresh;
  localStorage.setItem('portal_accessToken', access);
  localStorage.setItem('portal_refreshToken', refresh);
}

export function clearTokens() {
  accessToken = null;
  refreshToken = null;
  localStorage.removeItem('portal_accessToken');
  localStorage.removeItem('portal_refreshToken');
}

export function getAccessToken() {
  return accessToken;
}

async function refreshAccessToken(): Promise<boolean> {
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
    localStorage.setItem('portal_accessToken', data.accessToken);
    return true;
  } catch {
    return false;
  }
}

export async function api<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  let res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  // Auto-refresh on 401
  if (res.status === 401 && refreshToken) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      headers['Authorization'] = `Bearer ${accessToken}`;
      res = await fetch(`${API_BASE}${path}`, { ...options, headers });
    }
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: 'Request failed' }));
    throw new ApiError(res.status, error.message || 'Request failed', error.error);
  }

  return res.json();
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

// The portal is served under /:slug and every auth call includes the slug so
// the server can (a) scope the login to the right tenant and (b) reject a
// contact from tenant A trying to log in on tenant B's branded URL.
export function getSlugFromPath(): string {
  // /acme-msp/login → "acme-msp"
  const seg = window.location.pathname.split('/').filter(Boolean)[0];
  return seg ?? '';
}

export async function login(email: string, password: string) {
  const res = await fetch(`${API_BASE}/portal/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, slug: getSlugFromPath() }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Login failed' }));
    throw new ApiError(res.status, err.message);
  }
  return res.json();
}

// Branding — fetched before login so the login page can render the MSP's logo/colors.
export interface PortalBranding {
  slug: string;
  tenantId: string;
  businessName: string;
  businessLogo: string;
  businessPhone: string;
  businessEmail: string;
  businessWebsite: string;
  primaryColor: string;
  portalWelcomeText: string;
}

export async function fetchBranding(slug: string): Promise<PortalBranding> {
  const res = await fetch(`${API_BASE}/portal/branding/${encodeURIComponent(slug)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Portal not found' }));
    throw new ApiError(res.status, err.message);
  }
  return res.json();
}

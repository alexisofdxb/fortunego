export const PLAYER_ID_KEY = "plotgo.playerId";

export function getPlayerId(): string {
  return localStorage.getItem(PLAYER_ID_KEY) ?? "";
}

export function setPlayerId(playerId: string) {
  localStorage.setItem(PLAYER_ID_KEY, playerId);
}

// --- Auth plumbing ------------------------------------------------------------
// Privy mode: the auth layer installs a token provider that returns the current
// Privy access token (auto-refreshed, 1h expiry). Dev mode: no provider — the
// legacy x-player-id header is sent instead.
let tokenProvider: (() => Promise<string | null>) | null = null;

export function setTokenProvider(provider: (() => Promise<string | null>) | null) {
  tokenProvider = provider;
}

export async function getAuthHeaders(): Promise<Record<string, string>> {
  if (tokenProvider) {
    const token = await tokenProvider();
    if (token) return { Authorization: `Bearer ${token}` };
    return {};
  }
  const playerId = getPlayerId();
  return playerId ? { "x-player-id": playerId } : {};
}

export async function api<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(await getAuthHeaders()),
      ...(init?.headers ?? {}),
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? res.statusText);
  return data as T;
}

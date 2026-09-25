export const PLAYER_ID_KEY = "plotgo.playerId";

export function getPlayerId(): string {
  return localStorage.getItem(PLAYER_ID_KEY) ?? "";
}

export function setPlayerId(playerId: string) {
  localStorage.setItem(PLAYER_ID_KEY, playerId);
}

export async function api<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-player-id": getPlayerId(),
      ...(init?.headers ?? {}),
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? res.statusText);
  return data as T;
}

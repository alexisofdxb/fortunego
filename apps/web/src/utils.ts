export function cashLabel(minor: number) {
  const sign = minor < 0 ? "-" : "";
  return `${sign}$${Math.floor(Math.abs(minor) / 100).toLocaleString()}`;
}

import { useUiStore } from "../state/ui";

/** Single persistent toast line — never auto-clears (same as the old UI). */
export function Toast() {
  const toast = useUiStore((s) => s.toast);
  return <p className="toast strip-toast">{toast}</p>;
}

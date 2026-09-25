import type { PlotSnapshot } from "@plotgo/shared";
import { cashLabel } from "../utils";

export function ReceiptBanner({ plot }: { plot: PlotSnapshot }) {
  const receipt = plot.session?.receipt;
  if (!receipt) return null;
  return (
    <div className="receipt">
      <b>Today&apos;s receipt</b>
      <span>{receipt.lines.map((line) => `${line.label}: ${cashLabel(line.amountMinor)}`).join(" · ")}</span>
      <strong>{cashLabel(receipt.cashDeltaMinor)} Cash</strong>
    </div>
  );
}

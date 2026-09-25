import type { PlotSnapshot } from "@plotgo/shared";

export function Header({ plot }: { plot: PlotSnapshot }) {
  return (
    <header className="top">
      <div>
        <h1 className="brand">PlotGo</h1>
        <p className="sub">Founder · 12×12</p>
      </div>
      <div className="top-stats">
        <div>
          <span>Cash</span>
          <b>{plot.cash}</b>
        </div>
        <div>
          <span>Empire</span>
          <b>{plot.empireValue}</b>
        </div>
      </div>
    </header>
  );
}

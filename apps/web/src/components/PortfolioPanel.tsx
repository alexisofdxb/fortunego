import { useRef } from "react";
import { CARDS } from "@plotgo/game";
import type { PlotSnapshot } from "@plotgo/shared";
import { useInvestments, useRebalance } from "../api/hooks";
import { cashLabel } from "../utils";

function InvestmentsSection() {
  const investments = useInvestments();
  const asVisitor = investments.data?.asVisitor ?? [];
  const asHost = investments.data?.asHost ?? [];
  if (!investments.data || (asVisitor.length === 0 && asHost.length === 0)) return null;
  return (
    <div className="portfolio-book investments-book">
      <div className="portfolio-heading">
        <b>Investments</b>
        <span>Revenue shares · principal guaranteed</span>
      </div>
      {asVisitor.length > 0 && (
        <div className="position-list">
          {asVisitor.map((investment) => (
            <div className="position-row" key={investment.investmentId}>
              <div>
                <b>{investment.building?.name ?? "Removed building"}</b>
                <small>
                  {investment.hostName} · {investment.shareBps / 100}% share · yield {cashLabel(investment.yieldPaidMinor)}
                  {investment.status === "active"
                    ? investment.owedMinor > 0 && investment.daysRemaining === 0
                      ? " · awaiting repayment"
                      : ` · ${investment.daysRemaining ?? 0}d left`
                    : ` · ${investment.status}`}
                  {investment.owedMinor > 0 && investment.status === "active" && investment.daysRemaining === 0 ? ` · owed ${cashLabel(investment.owedMinor)}` : ""}
                </small>
              </div>
              <span />
              <strong>{cashLabel(investment.amountMinor)}</strong>
            </div>
          ))}
        </div>
      )}
      {asHost.length > 0 && (
        <div className="position-list">
          {asHost.map((investment) => (
            <div className="position-row" key={investment.investmentId}>
              <div>
                <b>{investment.building?.name ?? "Removed building"}</b>
                <small>
                  {investment.visitorName} invested · {investment.shareBps / 100}% share · paid {cashLabel(investment.yieldPaidMinor)} yield
                  {investment.status === "active" ? ` · liability ${cashLabel(investment.owedMinor)}` : ` · ${investment.status}`}
                </small>
              </div>
              <span />
              <strong>{cashLabel(investment.amountMinor)}</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const HARDCODED_TICKERS = ["NVDA", "AAPL", "TSLA", "CASH"] as const;

export function PortfolioPanel({ plot }: { plot: PlotSnapshot }) {
  const rebalance = useRebalance();
  const inputs = useRef(new Map<string, HTMLInputElement>());
  const positionAumMinor = plot.positions.reduce((sum, p) => sum + p.allocatedMinor, 0);
  const portfolioEligible = plot.cards.some((card) => ["broker", "fund"].includes(CARDS[card.type]?.lineage ?? ""));

  const save = () => {
    const weights = Object.fromEntries(
      HARDCODED_TICKERS.map((ticker) => [ticker, Math.round(Number(inputs.current.get(ticker)?.value ?? 0) * 100)]),
    );
    rebalance.mutate({ weights });
  };

  return (
    <section className="portfolio-panel" data-onboarding-target="portfolio-panel">
      <div className="portfolio-heading">
        <b>Stock Portfolio</b>
        <span>In-game fragments</span>
      </div>
      <div className="portfolio-list">
        {plot.portfolio.length ? (
          plot.portfolio.map((stock) => (
            <span className="stock-chip" key={stock.ticker}>
              <b>{stock.ticker}</b> {stock.units.toFixed(6)} <small>{stock.sector}</small>
            </span>
          ))
        ) : (
          <span className="portfolio-empty">Complete a Market Hunt to discover your first stock fragment.</span>
        )}
      </div>
      <div className="collection-list">
        {plot.collections.map((collection) => (
          <span className={`collection-chip ${collection.complete ? "complete" : ""}`} key={collection.id}>
            {collection.name} {collection.owned}/{collection.total}
          </span>
        ))}
      </div>
      <div className="portfolio-book">
        <div className="portfolio-heading">
          <b>Simulated portfolio book</b>
          <span>AUM {cashLabel(positionAumMinor)}</span>
        </div>
        <small className="settled">
          In-game assets · deterministic daily marks · not real securities. Fee: 150 bps/year, charged daily on
          end-of-day AUM.
        </small>
        <div className="position-list">
          {plot.positions.map((position) => {
            const mark = position.lastMarkDay
              ? `${position.markBps >= 0 ? "+" : ""}${(position.markBps / 100).toFixed(2)}%`
              : "pending";
            return (
              <div className="position-row" key={position.ticker}>
                <div>
                  <b>{position.ticker}</b>
                  <small>
                    {position.name} · {position.sector} · {mark}
                  </small>
                </div>
                <label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.01}
                    defaultValue={(position.weightBps / 100).toFixed(2)}
                    key={`${position.ticker}:${position.weightBps}`}
                    ref={(el) => {
                      if (el) inputs.current.set(position.ticker, el);
                      else inputs.current.delete(position.ticker);
                    }}
                    disabled={!portfolioEligible}
                  />
                  %
                </label>
                <strong>{cashLabel(position.allocatedMinor)}</strong>
              </div>
            );
          })}
        </div>
        <div className="portfolio-actions">
          <button className="performance-claim" type="button" disabled={!portfolioEligible} onClick={save}>
            Save weights
          </button>
          <small>
            {portfolioEligible
              ? "Weights total 100%. Rebalance takes effect next UTC day."
              : "Place a Brokerage or Fund building to allocate."}
          </small>
        </div>
      </div>
      <InvestmentsSection />
    </section>
  );
}

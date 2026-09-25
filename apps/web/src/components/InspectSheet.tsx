import { useState } from "react";
import {
  CARDS,
  STAGE_LABEL,
  cardCustomers,
  cardHourMinor,
  lineageColor,
  moduleSlotsForRuntimeStage,
  orientedFootprint,
  upgradeCostMinor,
} from "@plotgo/game";
import type { PlotSnapshot } from "@plotgo/shared";
import { useModuleEquip, useModuleUnequip, useRotate, useUpgrade } from "../api/hooks";
import { useUiStore } from "../state/ui";
import { cashLabel } from "../utils";

export function InspectSheet({ plot }: { plot: PlotSnapshot }) {
  const inspectId = useUiStore((s) => s.inspectId);
  const setInspectId = useUiStore((s) => s.setInspectId);
  const rotate = useRotate();
  const upgrade = useUpgrade();
  const equip = useModuleEquip(inspectId ?? "");
  const unequip = useModuleUnequip(inspectId ?? "");
  const [equipSelection, setEquipSelection] = useState<Record<string, string>>({});

  if (!inspectId) return null;
  const card = plot.cards.find((c) => c.id === inspectId);
  if (!card) return null;

  const spec = CARDS[card.type];
  const [w, h] = orientedFootprint(card.type, card.orientation ?? 0);
  const hour = cardHourMinor(card, plot.cards);
  const customers = cardCustomers(card);
  const revenue = plot.attributes.revenue.find((item) => item.buildingId === card.id);
  const next = card.stage < 3 ? upgradeCostMinor(card.type, card.stage as 1 | 2) : null;
  const moduleSlots = moduleSlotsForRuntimeStage(card.type, card.stage);
  const moduleSummary = plot.modules?.loadouts.find((loadout) => loadout.buildingId === card.id);
  const moduleProfile = plot.catalog.find((item) => item.id === card.type)?.moduleProfile;
  const equipped = new Map((moduleSummary?.slots ?? []).map((slot) => [slot.slotIndex, slot]));
  const compatibleInventory = (plot.modules?.inventory ?? []).filter(
    (module) => !moduleProfile || moduleProfile.allowedCategories.includes(module.category),
  );
  const close = () => setInspectId(null);

  return (
    <>
      <div className="modal-backdrop" onClick={close} />
      <div className="modal-card" role="dialog">
        <button className="modal-x" type="button" onClick={close}>
          ×
        </button>
        <div className="modal-art" data-type={lineageColor(spec.lineage)}>
          <span>{spec.name}</span>
          <small>
            {w}×{h} · {STAGE_LABEL[card.stage]}
          </small>
        </div>
        <h2>{spec.name}</h2>
        <p className="modal-desc">{spec.description}</p>
        <div className="modal-stats">
          <div>
            <span>Revenue model</span>
            <b>{revenue?.model ?? "service"}</b>
          </div>
          <div>
            <span>Level</span>
            <b>{card.stage} / 3</b>
          </div>
          <div>
            <span>Customers</span>
            <b>{customers.toLocaleString()}</b>
          </div>
          <div>
            <span>Earn / hour</span>
            <b>{cashLabel(hour)}</b>
          </div>
          <div>
            <span>Footprint</span>
            <b>
              {w}×{h}
            </b>
          </div>
          <div>
            <span>Orientation</span>
            <b>{card.orientation ?? 0}°</b>
          </div>
          <div>
            <span>Module slots</span>
            <b>{moduleSlots}</b>
          </div>
        </div>
        <div className="lvl-row">
          {([1, 2, 3] as const).map((s) => (
            <span className={`lvl ${s <= card.stage ? "on" : ""}`} key={s}>
              {s} {STAGE_LABEL[s]}
            </span>
          ))}
        </div>
        {moduleSummary ? (
          <div className="module-panel">
            <div className="module-panel-head">
              <span>Modules</span>
              <small>
                {moduleSummary.unlockedSlots}/{moduleSummary.maxModuleSlots} slots unlocked · v
                {moduleSummary.loadoutVersion}
              </small>
            </div>
            {Array.from({ length: moduleSummary.maxModuleSlots }, (_, slotIndex) => {
              const slot = equipped.get(slotIndex);
              if (slotIndex >= moduleSummary.unlockedSlots) {
                return (
                  <div className="module-slot locked" key={slotIndex}>
                    <span>Slot {slotIndex + 1}</span>
                    <small>Unlocks with building progression</small>
                  </div>
                );
              }
              const selectKey = `${card.id}-${slotIndex}`;
              return (
                <div className="module-slot" key={slotIndex}>
                  <div>
                    <b>Slot {slotIndex + 1}</b>
                    <span>{slot ? `${slot.module} · ${slot.rarity}` : "Empty"}</span>
                  </div>
                  <div className="module-slot-actions">
                    <select
                      data-module-select={selectKey}
                      value={equipSelection[selectKey] ?? ""}
                      disabled={!compatibleInventory.length}
                      onChange={(e) => setEquipSelection((prev) => ({ ...prev, [selectKey]: e.target.value }))}
                    >
                      {compatibleInventory.length ? (
                        compatibleInventory.map((module) => (
                          <option value={module.moduleId} key={module.moduleId}>
                            {module.name} · {module.rarity} ({module.quantityAvailable})
                          </option>
                        ))
                      ) : (
                        <option value="">Earn a Module from Hunts or Events</option>
                      )}
                    </select>
                    <button
                      className="claim"
                      type="button"
                      disabled={!compatibleInventory.length || !(equipSelection[selectKey] ?? compatibleInventory[0]?.moduleId)}
                      onClick={() =>
                        equip.mutate({
                          slot: slotIndex,
                          moduleId: equipSelection[selectKey] ?? compatibleInventory[0]?.moduleId ?? "",
                          idempotencyKey: crypto.randomUUID(),
                        })
                      }
                    >
                      Equip
                    </button>
                    {slot ? (
                      <button
                        className="claim secondary"
                        type="button"
                        onClick={() => unequip.mutate({ slot: slotIndex, idempotencyKey: crypto.randomUUID() })}
                      >
                        Unequip
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
        <button
          className="claim"
          type="button"
          onClick={() => rotate.mutate({ cardId: card.id, orientation: (((card.orientation ?? 0) + 90) % 360) as 0 | 90 | 180 | 270 })}
        >
          Rotate building 90°
        </button>
        {next === null ? (
          <p className="note">Max stage. Drag the building to move it.</p>
        ) : (
          <button className="claim" type="button" onClick={() => upgrade.mutate({ cardId: card.id })}>
            Upgrade to {STAGE_LABEL[(card.stage + 1) as 2 | 3]} · {cashLabel(next)}
          </button>
        )}
      </div>
    </>
  );
}

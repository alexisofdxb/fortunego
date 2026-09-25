# modules

Building module system: equip/unequip loadouts, module inventory/parts, crafting,
dismantle, and mastery tiers (`modules.routes.ts` / `modules.service.ts`). Owns the
module catalog boot seeding (`ensureModuleConfig`) and the idempotent module-reward
grant pipeline used by hunts and events.

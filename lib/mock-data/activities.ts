/**
 * Intentionally empty.
 *
 * Demo activities were removed in Phase E: the lead history is now a real,
 * immutable audit trail at `leads/{leadId}/activities` (see
 * lib/firebase/activities.ts). This file only exists so the repository never
 * passes through a state where a stale module is still present but its
 * exports are gone — it is not re-exported from lib/mock-data/index.ts and
 * nothing imports it. Safe to delete in a later cleanup.
 */
export {}

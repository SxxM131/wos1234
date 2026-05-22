/**
 * Unit tests: batch assignment 2nd pass (scenarios 8–9).
 * Run: npx tsx test/assignment.test.ts
 */
import {
  runSecondPassMatching,
  mergeMatchings,
  computeEligibleByBlock,
  buildMatchingEdges,
  buildSecondPassEdges,
  hopcroftKarp,
  type BatchApplicant,
  type DaySlotRow,
} from "../lib/assignment";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const block0Slots: DaySlotRow[] = [0, 1, 2, 3].map((i) => ({
  id: i + 1,
  block_start_utc: 0,
  slot_index: i,
}));

const block6Slots: DaySlotRow[] = [0, 1, 2, 3].map((i) => ({
  id: i + 5,
  block_start_utc: 6,
  slot_index: i,
}));

const mockSlots: DaySlotRow[] = [...block0Slots, ...block6Slots];

const A = 9201;
const B = 9202;
const C = 9203;
const D = 9204;
const E = 9205;

const mockApplicants = new Map<number, BatchApplicant>([
  [
    A,
    {
      playerId: A,
      speedup: 490,
      appliedAt: "2025-01-01T00:00:00Z",
      blocks: new Set([0, 6]),
    },
  ],
  [
    B,
    {
      playerId: B,
      speedup: 480,
      appliedAt: "2025-01-01T01:00:00Z",
      blocks: new Set([0, 6]),
    },
  ],
  [
    C,
    {
      playerId: C,
      speedup: 470,
      appliedAt: "2025-01-01T02:00:00Z",
      blocks: new Set([0]),
    },
  ],
  [
    D,
    {
      playerId: D,
      speedup: 440,
      appliedAt: "2025-01-01T03:00:00Z",
      blocks: new Set([0]),
    },
  ],
  [
    E,
    {
      playerId: E,
      speedup: 430,
      appliedAt: "2025-01-01T04:00:00Z",
      blocks: new Set([0]),
    },
  ],
]);

function blockForSlot(slotId: number): number {
  return mockSlots.find((s) => s.id === slotId)!.block_start_utc;
}

function scenario8(): void {
  // Simulate 1st pass: A,B → block 6, C,D → block 0 (2 empty slots in block 0)
  const phase1 = new Map<number, number>([
    [A, 5],
    [B, 6],
    [C, 1],
    [D, 2],
  ]);

  const phase2 = runSecondPassMatching(phase1, mockApplicants, mockSlots);
  const matching = mergeMatchings(phase1, phase2);

  const block0Assigned = Array.from(matching.entries())
    .filter(([, slotId]) => blockForSlot(slotId) === 0)
    .map(([playerId]) => playerId);

  assert(phase2.has(E), "E should be assigned in 2nd pass");
  assert(
    block0Assigned.includes(C) && block0Assigned.includes(D),
    "C and D stay in block 0 from 1st pass"
  );
  assert(
    block0Assigned.length === 3,
    `block 0 should have 3 assignments, got ${block0Assigned.length}: ${block0Assigned}`
  );
  assert(
    blockForSlot(matching.get(A)!) === 6 && blockForSlot(matching.get(B)!) === 6,
    "A and B remain in block 6"
  );

  const eligible0 = computeEligibleByBlock(mockApplicants, mockSlots).get(0);
  assert(!eligible0?.has(E), "E must be outside Top-4 for block 0");

  console.log("✅ Scenario 8 — 2nd pass fills empty block-0 slot for E");
}

function scenario9(): void {
  const allSlotIds = mockSlots.map((s) => s.id);
  const eligibleByBlock = computeEligibleByBlock(mockApplicants, mockSlots);
  const phase1Edges = buildMatchingEdges(
    mockApplicants,
    mockSlots,
    eligibleByBlock
  );
  const phase1 = hopcroftKarp(
    Array.from(mockApplicants.keys()),
    allSlotIds,
    phase1Edges
  );

  const matchedSlotIds = new Set(phase1.values());
  const emptySlotIds = new Set(
    allSlotIds.filter((id) => !matchedSlotIds.has(id))
  );
  const matchedPlayerIds = new Set(phase1.keys());
  const phase2Edges = buildSecondPassEdges(
    mockApplicants,
    mockSlots,
    emptySlotIds,
    matchedPlayerIds
  );

  for (const playerId of phase1.keys()) {
    assert(
      !phase2Edges.has(playerId),
      `Phase-1 player ${playerId} must not appear in 2nd-pass edges`
    );
  }

  const phase2Players = Array.from(phase2Edges.keys());
  assert(
    phase2Players.every((id) => !matchedPlayerIds.has(id)),
    "All 2nd-pass players must be unassigned after phase 1"
  );

  console.log("✅ Scenario 9 — no duplicate players in 2nd pass");
}

function main(): void {
  scenario8();
  scenario9();
  console.log("\nAll assignment unit tests (8–9) passed.");
}

main();

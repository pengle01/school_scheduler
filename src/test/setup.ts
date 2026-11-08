// Global test setup: unit tests never touch the database.
import { vi } from "vitest";

vi.mock("@/server/db", () => ({
  db: {
    teacher: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    lesson: { findMany: vi.fn(), count: vi.fn() },
    rule: { findMany: vi.fn(), upsert: vi.fn() },
    setting: { findUnique: vi.fn(), upsert: vi.fn() },
    $transaction: vi.fn((ops: unknown[]) => Promise.all(ops)),
  },
}));

import { describe, it, expect } from "vitest";
import { createClaimLock } from "./claim-lock.js";

describe("claim lock", () => {
  it("serializes concurrent executions", async () => {
    const lock = createClaimLock();
    const order: number[] = [];

    const run = async (id: number, delay: number) => {
      await lock.acquire(id.toString(), async () => {
        order.push(id);
        await new Promise((r) => setTimeout(r, delay));
      });
    };

    // Start 3 concurrent tasks — they should run in order
    await Promise.all([run(1, 50), run(2, 10), run(3, 10)]);

    expect(order).toEqual([1, 2, 3]);
  });

  it("releases lock even if callback throws", async () => {
    const lock = createClaimLock();
    let secondRan = false;

    await expect(
      lock.acquire("first", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    await lock.acquire("second", async () => {
      secondRan = true;
    });

    expect(secondRan).toBe(true);
  });

  it("allows re-acquisition after release", async () => {
    const lock = createClaimLock();
    let count = 0;

    await lock.acquire("a", async () => {
      count++;
    });
    await lock.acquire("b", async () => {
      count++;
    });

    expect(count).toBe(2);
  });
});

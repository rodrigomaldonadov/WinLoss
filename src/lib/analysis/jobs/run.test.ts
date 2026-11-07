import { describe, expect, it } from "vitest";

import { createInMemoryLock } from "./lock";
import { runAnalysisRefresh, type RefreshSteps } from "./run";

function steps(
  calls: string[],
  results: Partial<Record<keyof RefreshSteps, boolean>> = {},
): RefreshSteps {
  return {
    import: async () => {
      calls.push("import");
      return { ok: results.import ?? true };
    },
    sync: async () => {
      calls.push("sync");
      return { ok: results.sync ?? true };
    },
    results: async () => {
      calls.push("results");
      return { ok: results.results ?? true };
    },
    generate: async () => {
      calls.push("generate");
      return { ok: results.generate ?? true };
    },
  };
}

describe("runAnalysisRefresh", () => {
  it("ejecuta import → sync → generate y continúa si un paso falla", async () => {
    const calls: string[] = [];
    const summary = await runAnalysisRefresh({
      lock: createInMemoryLock(),
      steps: steps(calls, { import: false }),
      logger: () => {},
    });

    expect(calls).toEqual(["import", "sync", "results", "generate"]);
    expect(summary.status).toBe("PARTIAL");
    expect(summary.steps.map((step) => step.name)).toEqual([
      "import",
      "sync",
      "results",
      "generate",
    ]);
    expect(summary.steps[0]?.status).toBe("failed");
    expect(summary.steps[1]?.status).toBe("success");
  });

  it("devuelve SUCCESS si todos los pasos terminan bien", async () => {
    const summary = await runAnalysisRefresh({
      lock: createInMemoryLock(),
      steps: steps([]),
      logger: () => {},
    });
    expect(summary.status).toBe("SUCCESS");
  });

  it("no solapa dos ejecuciones simultáneas", async () => {
    const lock = createInMemoryLock();
    let release!: () => void;
    let started!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const startedPromise = new Promise<void>((resolve) => {
      started = resolve;
    });

    const first = runAnalysisRefresh({
      lock,
      steps: {
        import: async () => {
          started();
          await gate;
          return { ok: true };
        },
        sync: async () => ({ ok: true }),
        results: async () => ({ ok: true }),
        generate: async () => ({ ok: true }),
      },
      logger: () => {},
    });

    await startedPromise;
    const second = await runAnalysisRefresh({
      lock,
      steps: steps([]),
      logger: () => {},
    });
    expect(second.status).toBe("SKIPPED");
    expect(second.reason).toBe("locked");

    release();
    const firstSummary = await first;
    expect(firstSummary.status).toBe("SUCCESS");
  });

  it("respeta el límite de tiempo y omite los pasos restantes", async () => {
    const summary = await runAnalysisRefresh({
      lock: createInMemoryLock(),
      timeoutMs: 20,
      steps: {
        import: async () => {
          await new Promise((resolve) => setTimeout(resolve, 35));
          return { ok: true };
        },
        sync: async () => ({ ok: true }),
        results: async () => ({ ok: true }),
        generate: async () => ({ ok: true }),
      },
      logger: () => {},
    });

    expect(summary.steps[0]?.status).toBe("success");
    expect(summary.steps[1]?.status).toBe("skipped");
    expect(summary.steps[1]?.error).toBe("timeout");
    expect(summary.status).toBe("PARTIAL");
  });
});

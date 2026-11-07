import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOTS = ["src/app/(app)/analysis", "src/lib/analysis"];

function files(dir: string): string[] {
  const full = join(process.cwd(), dir);
  if (!statSync(full).isDirectory()) return [full];
  const result: string[] = [];
  for (const entry of readdirSync(full, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const child = join(full, entry.name);
    if (entry.isDirectory()) result.push(...files(join(dir, entry.name)));
    else if (entry.isFile()) result.push(child);
  }
  return result;
}

const sourceFiles = ROOTS.flatMap(files).filter(
  (file) =>
    /\.(ts|tsx)$/.test(file) &&
    !file.endsWith(".test.ts") &&
    !file.includes("__fixtures__"),
);

describe("guardas de /analysis", () => {
  it("no usa aleatoriedad ni datos de ejemplo fijos", () => {
    for (const file of sourceFiles) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/Math\.random\s*\(/);
      expect(source, file).not.toMatch(/\bfaker\b/i);
      expect(source, file).not.toMatch(/\bconst\s+(SAMPLE|MOCK|EXAMPLE)_/);
    }
  });

  it("no llama a football-data.co.uk en runtime", () => {
    for (const file of sourceFiles) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(
        /fetch\s*\(\s*["'`]https?:\/\/(?:www\.)?football-data\.co\.uk/i,
      );
    }
  });

  it("no importa el proveedor fake de deportes", () => {
    for (const file of sourceFiles) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/sports-api\/fake|fakeProvider/);
    }
  });

  it("el job de import no hace red", () => {
    const source = readFileSync(
      join(process.cwd(), "src/lib/analysis/jobs/import-job.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/\bfetch\s*\(/);
  });

  it("excluye data-football de Git y de la imagen Docker", () => {
    expect(readFileSync(join(process.cwd(), ".gitignore"), "utf8")).toContain(
      "/data-football/",
    );
    expect(
      readFileSync(join(process.cwd(), ".dockerignore"), "utf8"),
    ).toContain("data-football");
  });
});

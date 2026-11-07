import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export type ImportFileKind = "historical" | "fixtures";

export type ImportFileFingerprint = {
  /** Ruta relativa normalizada con `/`. */
  path: string;
  kind: ImportFileKind;
  size: number;
  mtime: Date;
  hash: string;
};

export type ImportFileState = {
  path: string;
  size: number;
  mtime: Date;
  hash: string;
};

export function hashFile(fullPath: string): string {
  return createHash("sha256")
    .update(readFileSync(/* turbopackIgnore: true */ fullPath))
    .digest("hex");
}

/**
 * Evita leer el archivo si tamaño y mtime no cambiaron. Si cambiaron, hay que
 * calcular el hash para distinguir un toque de mtime de un cambio real.
 */
export function needsHashCheck(
  file: Pick<ImportFileFingerprint, "size" | "mtime">,
  state: Pick<ImportFileState, "size" | "mtime"> | undefined,
): boolean {
  if (!state) return true;
  return (
    state.size !== file.size ||
    state.mtime.getTime() !== file.mtime.getTime()
  );
}

export function isContentChanged(
  file: Pick<ImportFileFingerprint, "size" | "hash">,
  state: Pick<ImportFileState, "size" | "hash"> | undefined,
): boolean {
  if (!state) return true;
  return state.size !== file.size || state.hash !== file.hash;
}

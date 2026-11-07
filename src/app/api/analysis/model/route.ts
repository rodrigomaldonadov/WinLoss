import { getModelAccuracy } from "@/lib/data/analysis";

/** Datos del panel “Precisión del modelo”. No expone datos de usuarios. */
export async function GET() {
  return Response.json(getModelAccuracy());
}

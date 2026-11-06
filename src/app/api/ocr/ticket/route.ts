import { NextResponse } from "next/server";
import { auth } from "@/auth";

function isoDateInDays(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

/** POST /api/ocr/ticket
 *  Recibe multipart/form-data con un campo `ticketImage` (archivo).
 *  Simula un procesamiento de IA de 1.5 a 2 segundos.
 *
 *  Devuelve uno de los dos boletos de ejemplo:
 *  - `?variant=multiple`: múltiple de 2 legs (1.55 x 1.44, stake 100).
 *  - `?variant=builder`: Bet Builder de 1 leg con 2 selecciones (cuota 3.00).
 *  Sin variante se alterna aleatoriamente entre ambos.
 */
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return new NextResponse("No autorizado", { status: 401 });
    }

    const formData = await request.formData();
    const image = formData.get("ticketImage") as File;

    if (!image || !image.type?.startsWith("image/")) {
      return new NextResponse(
        JSON.stringify({ success: false, error: "Imagen inválida" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Simulate AI processing time: 1.5 - 2.0 seconds
    await new Promise((resolve) => setTimeout(resolve, 1800));

    const placedAt = new Date().toISOString();
    const eventDate = isoDateInDays(2);

    const multiple = {
      externalId: "WL-MULTI-155144",
      placedAt,
      stake: 100,
      isFreeBet: false,
      legs: [
        {
          sport: "Fútbol",
          eventName: "PSG vs. Marsella",
          eventDate,
          isBuilder: false,
          odds: 1.55,
          selections: [
            { market: "Ganador del partido", selection: "PSG" },
          ],
        },
        {
          sport: "Fútbol",
          eventName: "Real Madrid vs. Barcelona",
          eventDate,
          isBuilder: false,
          odds: 1.44,
          selections: [
            { market: "Ambos equipos marcan", selection: "Sí" },
          ],
        },
      ],
    };

    const builder = {
      externalId: "WL-BUILDER-300",
      placedAt,
      stake: 100,
      isFreeBet: false,
      legs: [
        {
          sport: "Fútbol",
          eventName: "PSG vs. Marsella",
          eventDate,
          isBuilder: true,
          odds: 3,
          selections: [
            { market: "Total de goles", selection: "Más de 5.5 goles" },
            { market: "Total de córneres", selection: "Más de 10.5 córneres" },
          ],
        },
      ],
    };

    const variant = new URL(request.url).searchParams.get("variant");
    const data =
      variant === "multiple"
        ? multiple
        : variant === "builder"
          ? builder
          : Math.random() < 0.5
            ? multiple
            : builder;

    return new NextResponse(JSON.stringify({ success: true, data }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("OCR ticket endpoint error:", error);
    return new NextResponse(
      JSON.stringify({ success: false, error: "Error interno del servidor" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

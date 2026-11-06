import { NextResponse } from "next/server";
import { auth } from "@/auth";

const MOCK_LIKELIHOOD = {
  sport: ["Fútbol", "Baloncesto", "Tenis", "Vóley", "Béisbol"],
  market: ["1X2", "Más/Menos 2.5", "Ambas anotan", "Handicap"],
};

/** POST /api/ocr/ticket
 *  Recibe multipart/form-data con un campo `ticketImage` (archivo).
 *  Simula un procesamiento de IA de 1.5 a 2 segundos.
 *  Devuelve un JSON mockeado con los datos extraídos.
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
        }
      );
    }

    // Simulate AI processing time: 1.5 - 2.0 seconds
    await new Promise((resolve) => setTimeout(resolve, 1800));

    // Generar datos simulados con alta "confianza"
    const mockSport =
      MOCK_LIKELIHOOD.sport[
        Math.floor(Math.random() * MOCK_LIKELIHOOD.sport.length)
      ];
    const mockMarket =
      MOCK_LIKELIHOOD.market[
        Math.floor(Math.random() * MOCK_LIKELIHOOD.market.length)
      ];
    const mockOdds = Number((Math.random() * (5 - 1.5) + 1.5).toFixed(2));
    const mockStake = Math.floor(Math.random() * 200) + 5; // 5 - 205

    const mockData = {
      success: true,
      data: {
        sport: mockSport,
        market: mockMarket,
        odds: mockOdds,
        stake: mockStake,
        isFreeBet: false,
      },
    };

    return new NextResponse(JSON.stringify(mockData), {
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
      }
    );
  }
}
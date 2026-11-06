import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import {
  MAX_BET_LEGS,
  MAX_SELECTIONS_PER_LEG,
} from "@/lib/constants";

export const maxDuration = 60;

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const selectionSchema = z.object({
  market: z.string().trim().min(1).max(80),
  selection: z.string().trim().min(1).max(100),
});

const legSchema = z.object({
  sport: z.string().trim().min(1).max(60),
  eventName: z.string().trim().min(2).max(120),
  eventDate: z.string().nullish(),
  isBuilder: z.boolean(),
  odds: z.coerce.number().min(1.01).max(1000),
  selections: z.array(selectionSchema).min(1).max(MAX_SELECTIONS_PER_LEG),
});

const ticketSchema = z.object({
  externalId: z.string().trim().max(80).nullish(),
  placedAt: z.string().nullish(),
  stake: z.coerce.number().positive().max(1_000_000),
  isFreeBet: z.boolean(),
  legs: z.array(legSchema).min(1).max(MAX_BET_LEGS),
});

const SYSTEM_PROMPT = `Eres un extractor de datos de boletos de apuestas deportivas.
Devuelve EXCLUSIVAMENTE un objeto JSON válido, sin markdown ni texto adicional.

Formato exacto:
{
  "externalId": string | null,
  "placedAt": string | null,        // ISO 8601 si aparece en el boleto
  "stake": number,                  // importe apostado, > 0
  "isFreeBet": boolean,
  "legs": [
    {
      "sport": string,              // "Fútbol", "Baloncesto", ...
      "eventName": string,          // "Equipo A vs. Equipo B"
      "eventDate": string | null,   // ISO 8601 si aparece
      "isBuilder": boolean,         // true solo si es Bet Builder
      "odds": number,               // cuota del partido/builder, > 1
      "selections": [
        { "market": string, "selection": string }
      ]
    }
  ]
}

Reglas:
- Un boleto simple o múltiple normal: una selección por leg.
- Bet Builder: un único leg con isBuilder=true y 2+ selecciones.
- No inventes datos: si algo no aparece, usa valores plausibles solo para sport/market;
  para importes y cuotas usa los visibles en el boleto.
- No incluyas moneda en stake ni en odds.`;

const USER_PROMPT = `Extrae los datos de este boleto de apuestas y responde solo con el JSON indicado.`;

function mockData(variant: string | null) {
  const isoDateInDays = (days: number) =>
    new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

  const multiple = {
    externalId: "WL-MULTI-155144",
    placedAt: new Date().toISOString(),
    stake: 100,
    isFreeBet: false,
    legs: [
      {
        sport: "Fútbol",
        eventName: "PSG vs. Marsella",
        eventDate: isoDateInDays(2),
        isBuilder: false,
        odds: 1.55,
        selections: [{ market: "Ganador del partido", selection: "PSG" }],
      },
      {
        sport: "Fútbol",
        eventName: "Real Madrid vs. Barcelona",
        eventDate: isoDateInDays(2),
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
    placedAt: new Date().toISOString(),
    stake: 100,
    isFreeBet: false,
    legs: [
      {
        sport: "Fútbol",
        eventName: "PSG vs. Marsella",
        eventDate: isoDateInDays(2),
        isBuilder: true,
        odds: 3,
        selections: [
          { market: "Total de goles", selection: "Más de 5.5 goles" },
          { market: "Total de córneres", selection: "Más de 10.5 córneres" },
        ],
      },
    ],
  };

  if (variant === "multiple") return multiple;
  if (variant === "builder") return builder;
  return Math.random() < 0.5 ? multiple : builder;
}

function extractJson(text: string): unknown {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  return JSON.parse(cleaned);
}

async function extractWithOpenAI(base64: string, mimeType: string) {
  const apiKey = process.env.OPENAI_API_KEY!;
  const model = process.env.OPENAI_VISION_MODEL ?? "gpt-4o-mini";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: USER_PROMPT },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType};base64,${base64}`,
                  detail: "high",
                },
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`OpenAI ${response.status}: ${detail.slice(0, 300)}`);
    }

    const json = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = json.choices?.[0]?.message?.content;
    if (!content) throw new Error("OpenAI devolvió una respuesta vacía.");
    return extractJson(content);
  } finally {
    clearTimeout(timer);
  }
}

async function extractWithGemini(base64: string, mimeType: string) {
  const apiKey = process.env.GEMINI_API_KEY!;
  const model = process.env.GEMINI_VISION_MODEL ?? "gemini-2.0-flash";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [
            {
              role: "user",
              parts: [
                { text: USER_PROMPT },
                { inlineData: { mimeType, data: base64 } },
              ],
            },
          ],
          generationConfig: {
            temperature: 0,
            responseMimeType: "application/json",
          },
        }),
      },
    );

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Gemini ${response.status}: ${detail.slice(0, 300)}`);
    }

    const json = (await response.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const content = json.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("");
    if (!content) throw new Error("Gemini devolvió una respuesta vacía.");
    return extractJson(content);
  } finally {
    clearTimeout(timer);
  }
}

/** POST /api/ocr/ticket
 *  multipart/form-data con `ticketImage`.
 *  - Con OPENAI_API_KEY o GEMINI_API_KEY: usa visión real.
 *  - Sin claves (o con `?variant=`): devuelve un boleto de ejemplo.
 */
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return new NextResponse("No autorizado", { status: 401 });
    }

    const formData = await request.formData();
    const image = formData.get("ticketImage") as File | null;

    if (!image || !image.type?.startsWith("image/")) {
      return NextResponse.json(
        { success: false, error: "Imagen inválida" },
        { status: 400 },
      );
    }

    if (image.size > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        { success: false, error: "La imagen supera los 10 MB" },
        { status: 413 },
      );
    }

    const variant = new URL(request.url).searchParams.get("variant");
    const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);
    const hasGemini = Boolean(process.env.GEMINI_API_KEY);

    if (variant || (!hasOpenAI && !hasGemini)) {
      // Simula el tiempo de procesamiento del proveedor.
      await new Promise((resolve) => setTimeout(resolve, 1800));
      return NextResponse.json({ success: true, data: mockData(variant) });
    }

    const base64 = Buffer.from(await image.arrayBuffer()).toString("base64");
    const raw = hasOpenAI
      ? await extractWithOpenAI(base64, image.type)
      : await extractWithGemini(base64, image.type);

    const parsed = ticketSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error:
            "No pudimos interpretar el boleto. Prueba con una captura más clara o completa los datos a mano.",
        },
        { status: 422 },
      );
    }

    const data = parsed.data;

    return NextResponse.json({
      success: true,
      data: {
        externalId: data.externalId ?? null,
        placedAt: data.placedAt ?? null,
        stake: data.stake,
        isFreeBet: data.isFreeBet,
        legs: data.legs.map((leg) => ({
          ...leg,
          eventDate: leg.eventDate ?? null,
        })),
      },
    });
  } catch (error) {
    console.error("OCR ticket endpoint error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          "El servicio de lectura de boletos no está disponible ahora. Inténtalo de nuevo.",
      },
      { status: 502 },
    );
  }
}

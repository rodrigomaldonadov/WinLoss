import { auth } from "@/auth";
import { getAnalysisFeed } from "@/lib/data/analysis";

const ALLOWED_DAYS = [3, 7, 14] as const;

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "No autenticado" }, { status: 401 });
  }

  const url = new URL(request.url);
  const requested = Number(url.searchParams.get("dias") ?? "7");
  const days = ALLOWED_DAYS.includes(requested as (typeof ALLOWED_DAYS)[number])
    ? requested
    : 7;

  const items = await getAnalysisFeed(session.user.id, { days });
  return Response.json({
    items,
    days,
    generatedAt: new Date().toISOString(),
  });
}

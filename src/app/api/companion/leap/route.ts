import {
  beginLeap,
  isCompanionAuthorized,
  seedThread,
} from "@/lib/companion/store";
import type {
  CompanionDevice,
  CompanionSpeaker,
} from "@/lib/companion/protocol";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function device(raw: unknown): CompanionDevice | null {
  return raw === "pc" || raw === "phone" ? raw : null;
}

function speaker(raw: unknown): CompanionSpeaker | null {
  return raw === "pc" || raw === "phone" || raw === "pet" ? raw : null;
}

export async function POST(req: Request) {
  if (!isCompanionAuthorized(req)) {
    return new Response("unauthorized", { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const from = device(body.from);
  const to = device(body.to);
  if (typeof body.id !== "string" || !from || !to) {
    return Response.json({ error: "invalid" }, { status: 400 });
  }
  if (to === "phone" && Array.isArray(body.seed)) {
    const seed = body.seed
      .map((row) => {
        if (!row || typeof row !== "object") return null;
        const rec = row as Record<string, unknown>;
        const who = speaker(rec.from);
        if (!who || typeof rec.text !== "string") return null;
        return { from: who, text: rec.text };
      })
      .filter((row): row is { from: CompanionSpeaker; text: string } =>
        Boolean(row)
      );
    if (seed.length) seedThread(body.id, seed);
  }
  const event = beginLeap({
    id: body.id,
    from,
    to,
    durationMs: typeof body.durationMs === "number" ? body.durationMs : undefined,
    overlapAt: typeof body.overlapAt === "number" ? body.overlapAt : undefined,
    t0: typeof body.t0 === "number" ? body.t0 : undefined,
  });
  if (!event) return Response.json({ error: "invalid" }, { status: 400 });
  return Response.json(event);
}

import { NextResponse } from "next/server";
import {
  MAX_POINTS_IN_STORE,
  MAX_POINTS_PER_BATCH,
  guardManage,
} from "@/lib/api-guard";
import { rateLimit } from "@/lib/rate-limit";
import { ensureStoreReady, ingestPoints } from "@/lib/store";
import type { RawPoint } from "@/lib/types";

const MAX_BODY_BYTES = 256_000;

export async function POST(req: Request) {
  const auth = await guardManage(req);
  if (auth instanceof NextResponse) return auth;
  await ensureStoreReady();

  const limited = rateLimit(`points:${auth.email}`, 30, 60_000);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "rate_limited", retry_after: limited.retryAfterSec },
      {
        status: 429,
        headers: { "Retry-After": String(limited.retryAfterSec) },
      },
    );
  }

  // Do not trust Content-Length alone — read with a hard byte cap
  const reader = req.body?.getReader();
  if (!reader) {
    return NextResponse.json({ error: "empty body" }, { status: 400 });
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      try {
        await reader.cancel();
      } catch {
        /* ignore */
      }
      return NextResponse.json({ error: "payload too large" }, { status: 413 });
    }
    chunks.push(value);
  }

  const text = new TextDecoder().decode(Buffer.concat(chunks.map((c) => Buffer.from(c))));
  let body: { points?: RawPoint[] };
  try {
    body = JSON.parse(text) as { points?: RawPoint[] };
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (!Array.isArray(body.points) || !body.points.length) {
    return NextResponse.json({ error: "points required" }, { status: 400 });
  }
  if (body.points.length > MAX_POINTS_PER_BATCH) {
    return NextResponse.json(
      { error: `batch too large (max ${MAX_POINTS_PER_BATCH})` },
      { status: 429 },
    );
  }

  const cleaned: RawPoint[] = [];
  for (const raw of body.points) {
    if (
      typeof raw.employee_id !== "string" ||
      typeof raw.device_id !== "string" ||
      typeof raw.ts !== "string" ||
      typeof raw.lat !== "number" ||
      typeof raw.lon !== "number"
    ) {
      continue;
    }
    if (!Number.isFinite(raw.lat) || !Number.isFinite(raw.lon)) continue;
    if (Math.abs(raw.lat) > 90 || Math.abs(raw.lon) > 180) continue;
    cleaned.push({
      device_id: raw.device_id.slice(0, 64),
      employee_id: raw.employee_id.slice(0, 64),
      ts: raw.ts.slice(0, 40),
      lat: raw.lat,
      lon: raw.lon,
      accuracy_m: Math.min(Math.max(Number(raw.accuracy_m) || 0, 0), 5000),
      speed_mps: Math.min(Math.max(Number(raw.speed_mps) || 0, 0), 100),
      is_moving: Boolean(raw.is_moving),
      wifi_bssid:
        typeof raw.wifi_bssid === "string" ? raw.wifi_bssid.slice(0, 32) : null,
      mock: Boolean(raw.mock),
      battery: Math.min(Math.max(Number(raw.battery) || 0, 1), 1),
    });
  }

  const result = ingestPoints(cleaned, {
    maxBatch: MAX_POINTS_PER_BATCH,
    maxStore: MAX_POINTS_IN_STORE,
  });

  if (!result.ok) {
    return NextResponse.json(result, { status: 429 });
  }
  return NextResponse.json(result);
}

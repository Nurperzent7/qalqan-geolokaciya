import { NextResponse } from "next/server";
import {
  MAX_POINTS_IN_STORE,
  MAX_POINTS_PER_BATCH,
  guardManage,
} from "@/lib/api-guard";
import { ingestPoints } from "@/lib/store";
import type { RawPoint } from "@/lib/types";

export async function POST(req: Request) {
  const auth = await guardManage(req);
  if (auth instanceof NextResponse) return auth;

  const contentLength = Number(req.headers.get("content-length") || "0");
  if (contentLength > 256_000) {
    return NextResponse.json({ error: "payload too large" }, { status: 413 });
  }

  const body = (await req.json()) as { points?: RawPoint[] };
  if (!Array.isArray(body.points) || !body.points.length) {
    return NextResponse.json({ error: "points required" }, { status: 400 });
  }
  if (body.points.length > MAX_POINTS_PER_BATCH) {
    return NextResponse.json(
      { error: `batch too large (max ${MAX_POINTS_PER_BATCH})` },
      { status: 429 },
    );
  }

  // sanitize fields — ignore unexpected extras / clamp numbers
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
      battery: Math.min(Math.max(Number(raw.battery) || 0, 0), 1),
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

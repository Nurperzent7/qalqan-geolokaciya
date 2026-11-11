import { NextResponse } from "next/server";
import {
  MAX_POINTS_IN_STORE,
  MAX_POINTS_PER_BATCH,
  MAX_POINTS_PER_EMPLOYEE,
  requireCsrf,
  requireViewer,
  storeScopeFor,
} from "@/lib/api-guard";
import { rateLimit } from "@/lib/rate-limit";
import { ensureStoreReady, ingestPoints } from "@/lib/store";
import type { RawPoint } from "@/lib/types";

const MAX_BODY_BYTES = 256_000;

export async function POST(req: Request) {
  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  const viewer = await requireViewer(req);
  if (viewer instanceof NextResponse) return viewer;

  const limited = await rateLimit(`points:${viewer.email}`, 20, 60_000);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "rate_limited", retry_after: limited.retryAfterSec },
      {
        status: 429,
        headers: { "Retry-After": String(limited.retryAfterSec) },
      },
    );
  }

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

  const text = new TextDecoder().decode(
    Buffer.concat(chunks.map((c) => Buffer.from(c))),
  );
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

  const employeeIds = new Set(
    body.points
      .map((p) => (typeof p.employee_id === "string" ? p.employee_id : null))
      .filter(Boolean) as string[],
  );
  if (employeeIds.size !== 1) {
    return NextResponse.json(
      { error: "batch must target exactly one employee" },
      { status: 400 },
    );
  }
  const employeeId = [...employeeIds][0];
  if (!viewer.canManage && viewer.employeeId !== employeeId) {
    return NextResponse.json(
      { error: "forbidden", reason: "not_your_employee" },
      { status: 403 },
    );
  }

  const scopeId = storeScopeFor(viewer);
  const store = await ensureStoreReady(scopeId);
  const target = store.employees.find((e) => e.id === employeeId);
  if (!target) {
    return NextResponse.json({ error: "employee not found" }, { status: 404 });
  }
  if (!target.collection_enabled || !target.consent_at) {
    return NextResponse.json(
      {
        error: "collection_disabled",
        detail: "Сбор геолокации выключен для этого сотрудника",
      },
      { status: 403 },
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
    if (raw.employee_id !== employeeId) continue;
    if (!Number.isFinite(raw.lat) || !Number.isFinite(raw.lon)) continue;
    if (Math.abs(raw.lat) > 90 || Math.abs(raw.lon) > 180) continue;
    if (raw.mock) continue;
    cleaned.push({
      device_id: raw.device_id.slice(0, 64),
      employee_id: employeeId,
      ts: raw.ts.slice(0, 40),
      lat: raw.lat,
      lon: raw.lon,
      accuracy_m: Math.min(Math.max(Number(raw.accuracy_m) || 0, 0), 5000),
      speed_mps: Math.min(Math.max(Number(raw.speed_mps) || 0, 0), 100),
      is_moving: Boolean(raw.is_moving),
      wifi_bssid: null,
      mock: false,
      battery: Math.min(Math.max(Number(raw.battery) || 0, 0), 1),
    });
  }

  if (!cleaned.length) {
    return NextResponse.json(
      { error: "no valid points", added: 0 },
      { status: 400 },
    );
  }

  const result = ingestPoints(scopeId, cleaned, {
    maxBatch: MAX_POINTS_PER_BATCH,
    maxStore: MAX_POINTS_IN_STORE,
    maxPerEmployee: MAX_POINTS_PER_EMPLOYEE,
  });

  if (!result.ok) {
    return NextResponse.json(result, { status: 429 });
  }
  return NextResponse.json(result);
}

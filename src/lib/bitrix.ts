/**
 * Bitrix24 client for QALQAN Advisors portal.
 * Portal: https://qalqanadvisors.bitrix24.kz/
 * Uses incoming webhook (BITRIX_WEBHOOK_URL) for user.get + timeman.
 */

import type { BitrixPunch, Employee, Role } from "./types";

/** Canonical portal host — webhook must belong to this Bitrix24. */
export const BITRIX_PORTAL_HOST = "qalqanadvisors.bitrix24.kz";
export const BITRIX_PORTAL_URL = `https://${BITRIX_PORTAL_HOST}/`;

export function hasBitrixWebhook(): boolean {
  return Boolean(webhookBase());
}

/**
 * Normalize Secrets value: accept either
 *   https://…/rest/57/token/
 * or a method URL like
 *   https://…/rest/57/token/profile.json
 */
function webhookBase(): string | null {
  const raw = process.env.BITRIX_WEBHOOK_URL?.trim().replace(/^["']|["']$/g, "");
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return null;
    if (u.hostname.toLowerCase() !== BITRIX_PORTAL_HOST) return null;
    const m = u.pathname.match(/^\/rest\/(\d+)\/([^/]+)(?:\/.*)?$/i);
    if (!m) return null;
    return `${u.origin}/rest/${m[1]}/${m[2]}`;
  } catch {
    return null;
  }
}

export function bitrixPortalStatus(): {
  configured: boolean;
  host: string;
  portalUrl: string;
} {
  return {
    configured: Boolean(webhookBase()),
    host: BITRIX_PORTAL_HOST,
    portalUrl: BITRIX_PORTAL_URL,
  };
}

async function bitrixCall<T>(
  method: string,
  body: Record<string, unknown> = {},
): Promise<{ ok: true; result: T } | { ok: false; status: number }> {
  const base = webhookBase();
  if (!base) return { ok: false, status: 0 };
  try {
    const res = await fetch(`${base}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      await res.text().catch(() => "");
      return { ok: false, status: res.status };
    }
    const json = (await res.json()) as { result?: T; error?: string };
    if (json.error || json.result === undefined) {
      return { ok: false, status: 502 };
    }
    return { ok: true, result: json.result };
  } catch {
    return { ok: false, status: 0 };
  }
}

type BitrixUser = {
  ID: string;
  NAME?: string;
  LAST_NAME?: string;
  SECOND_NAME?: string;
  WORK_POSITION?: string;
  ACTIVE?: boolean | string;
  UF_DEPARTMENT?: number[];
};

function mapBitrixUser(u: BitrixUser): Employee | null {
  const idNum = Number(u.ID);
  if (!Number.isFinite(idNum) || idNum <= 0) return null;
  const active = u.ACTIVE === true || u.ACTIVE === "Y" || u.ACTIVE === undefined;
  if (!active) return null;
  const name = [u.NAME, u.LAST_NAME].filter(Boolean).join(" ").trim() || `User ${idNum}`;
  return {
    id: `bx-${idNum}`,
    name,
    title: (u.WORK_POSITION || "").trim() || "сотрудник",
    practice: "",
    bitrix_user_id: idNum,
    role: "employee" as Role,
    collection_enabled: false,
    consent_at: null,
    last_lat: null,
    last_lon: null,
    last_status: "Сбор выключен",
    last_seen_at: null,
  };
}

/** Active Bitrix users → employee roster. Empty if webhook missing/fails. */
export async function fetchBitrixEmployees(): Promise<{
  ok: boolean;
  employees: Employee[];
  detail?: string;
}> {
  if (!webhookBase()) {
    return { ok: false, employees: [], detail: "webhook_missing" };
  }

  const all: Employee[] = [];
  let start = 0;
  for (let page = 0; page < 20; page += 1) {
    const res = await bitrixCall<BitrixUser[]>("user.get", {
      FILTER: { ACTIVE: true },
      ADMIN_MODE: true,
      start,
    });
    if (!res.ok) {
      return {
        ok: false,
        employees: all,
        detail: `user.get ${res.status || "failed"}`,
      };
    }
    const batch = Array.isArray(res.result) ? res.result : [];
    for (const u of batch) {
      const emp = mapBitrixUser(u);
      if (emp) all.push(emp);
    }
    if (batch.length < 50) break;
    start += batch.length;
  }

  return { ok: true, employees: all };
}

export async function punchWorkday(params: {
  employeeBitrixId: number;
  type: BitrixPunch["type"];
  at: string;
  employeeId: string;
  note: string;
}): Promise<{
  ok: boolean;
  mode: "live" | "mock";
  punch: BitrixPunch;
  detail?: string;
}> {
  const punch: BitrixPunch = {
    id: `punch-${params.employeeId}-${params.type}-${Date.parse(params.at)}`,
    employee_id: params.employeeId,
    type: params.type,
    at: params.at,
    source: "geo_auto",
    note: params.note,
  };

  if (!webhookBase()) {
    return {
      ok: true,
      mode: "mock",
      punch,
      detail: "Битрикс не подключён — демо-режим",
    };
  }

  const method =
    params.type === "open"
      ? "timeman.open"
      : params.type === "close"
        ? "timeman.close"
        : params.type === "pause"
          ? "timeman.pause"
          : "timeman.open";

  const res = await bitrixCall<unknown>(method, {
    USER_ID: params.employeeBitrixId,
    TIME: params.at,
  });
  if (!res.ok) {
    return {
      ok: false,
      mode: "live",
      punch,
      detail: res.status ? `Bitrix HTTP ${res.status}` : "Bitrix request failed",
    };
  }
  return { ok: true, mode: "live", punch };
}

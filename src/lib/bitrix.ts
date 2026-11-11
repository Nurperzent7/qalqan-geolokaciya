/**
 * Bitrix24 timeman client.
 * Uses incoming webhook when BITRIX_WEBHOOK_URL is set; otherwise mock punches.
 * Replaces Clockster attendance write path from the IT instruction.
 */

import type { BitrixPunch } from "./types";

export function hasBitrixWebhook(): boolean {
  return Boolean(process.env.BITRIX_WEBHOOK_URL?.trim());
}

export async function punchWorkday(params: {
  employeeBitrixId: number;
  type: BitrixPunch["type"];
  at: string;
  employeeId: string;
  note: string;
}): Promise<{ ok: boolean; mode: "live" | "mock"; punch: BitrixPunch; detail?: string }> {
  const punch: BitrixPunch = {
    id: `punch-${params.employeeId}-${params.type}-${Date.parse(params.at)}`,
    employee_id: params.employeeId,
    type: params.type,
    at: params.at,
    source: "geo_auto",
    note: params.note,
  };

  const base = process.env.BITRIX_WEBHOOK_URL?.replace(/\/$/, "");
  if (!base) {
    return { ok: true, mode: "mock", punch, detail: "BITRIX_WEBHOOK_URL не задан — демо-режим" };
  }

  // timeman.open / timeman.close via REST webhook
  const method =
    params.type === "open"
      ? "timeman.open"
      : params.type === "close"
        ? "timeman.close"
        : params.type === "pause"
          ? "timeman.pause"
          : "timeman.open";

  try {
    const url = `${base}/${method}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        USER_ID: params.employeeBitrixId,
        TIME: params.at,
      }),
    });
    if (!res.ok) {
      // Do not forward upstream body — may leak portal internals.
      await res.text().catch(() => "");
      return {
        ok: false,
        mode: "live",
        punch,
        detail: `Bitrix HTTP ${res.status}`,
      };
    }
    return { ok: true, mode: "live", punch };
  } catch {
    return {
      ok: false,
      mode: "live",
      punch,
      detail: "Bitrix request failed",
    };
  }
}

"use client";

import dynamic from "next/dynamic";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  MapPinned,
  NotebookPen,
  BriefcaseBusiness,
  Landmark,
  SlidersHorizontal,
  RefreshCw,
  Send,
  ShieldAlert,
  Smartphone,
} from "lucide-react";
import type {
  BitrixPunch,
  CaseOption,
  DaySummary,
  Employee,
  GeoSettings,
  Place,
  Visit,
} from "@/lib/types";
import {
  apiGet,
  apiMutate,
  clearAppToken,
  getAppToken,
  setAppToken,
} from "@/lib/api-client";
import { EMPLOYEES as DEMO_EMPLOYEES } from "@/lib/seed";
import { cn, formatMinutes, formatTime } from "@/lib/utils";

const MapPanel = dynamic(() => import("./MapPanel"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-[var(--muted)]">
      Загрузка карты…
    </div>
  ),
});

type Tab = "map" | "journal" | "visits" | "places" | "phone" | "settings";

interface StatePayload {
  demo_date: string;
  bitrix_mode: "live" | "mock";
  persistence?: "postgres" | "memory";
  settings: Partial<GeoSettings> & Pick<GeoSettings, "work_window" | "lunch_window" | "draft_refresh_min">;
  employees: Employee[];
  places: Place[];
  visits: Visit[];
  days: Record<string, DaySummary>;
  punches: BitrixPunch[];
  cases: CaseOption[];
  viewer_id: string;
  sample_notice: string;
  viewer: {
    email: string;
    name: string;
    role: "admin" | "employee";
    employee_id: string | null;
    can_manage: boolean;
  };
}

const TABS: { id: Tab; label: string; icon: typeof MapPinned }[] = [
  { id: "map", label: "Карта", icon: MapPinned },
  { id: "journal", label: "Журнал дня", icon: NotebookPen },
  { id: "visits", label: "Мои визиты", icon: BriefcaseBusiness },
  { id: "places", label: "Справочник мест", icon: Landmark },
  { id: "phone", label: "Симулятор", icon: Smartphone },
  { id: "settings", label: "Настройки", icon: SlidersHorizontal },
];

export default function GeoApp() {
  const [tab, setTab] = useState<Tab>("map");
  const [data, setData] = useState<StatePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsToken, setNeedsToken] = useState(false);
  const [loginRole, setLoginRole] = useState<"admin" | "employee">("admin");
  const [loginEmployeeId, setLoginEmployeeId] = useState("e-askar");
  const [tokenInput, setTokenInput] = useState("");
  const [selectedId, setSelectedId] = useState<string>("e-askar");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const load = useCallback(async () => {
    try {
      const res = await apiGet("/api/state");
      if (res.status === 401 || res.status === 403) {
        setNeedsToken(true);
        setData(null);
        setError(null);
        return;
      }
      if (!res.ok) throw new Error("Не удалось загрузить состояние");
      const json = (await res.json()) as StatePayload;
      startTransition(() => {
        setData(json);
        if (json.viewer.employee_id) setSelectedId(json.viewer.employee_id);
        else if (json.employees[0]) setSelectedId(json.employees[0].id);
        setNeedsToken(false);
        setError(null);
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => {
      if (getAppToken()) void load();
    }, 30_000);
    return () => clearInterval(t);
  }, [load]);

  async function submitLogin(e: React.FormEvent) {
    e.preventDefault();
    const password = tokenInput.trim();
    if (!password) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiMutate("/api/auth/login", {
        method: "POST",
        body: {
          role: loginRole,
          password,
          employee_id: loginRole === "employee" ? loginEmployeeId : undefined,
        },
      });
      const json = await res.json();
      if (!res.ok) {
        if (json.error === "employee_login_disabled") {
          setError(
            "Вход сотрудника выключен. Выберите «Админ» и пароль из APP_ADMIN_TOKEN.",
          );
        } else if (json.error === "invalid credentials") {
          setError("Неверный пароль. Проверьте APP_ADMIN_TOKEN в Secrets.");
        } else if (json.error === "rate_limited") {
          setError(json.detail || "Слишком много попыток, подождите.");
        } else if (json.reason === "csrf" || json.reason === "origin") {
          setError(
            json.detail ||
              "Браузер заблокировал вход. Обновите страницу (Ctrl+Shift+R) и войдите снова.",
          );
        } else {
          setError(
            json.detail ||
              (json.reason
                ? `${json.error}: ${json.reason}`
                : json.error) ||
              "Неверный логин",
          );
        }
        return;
      }
      if (!json.token || typeof json.token !== "string") {
        setError("Сервер не выдал сессию. Попробуйте ещё раз.");
        return;
      }
      setAppToken(json.token);
      setTokenInput("");
      const stateRes = await apiGet("/api/state");
      if (!stateRes.ok) {
        const st = await stateRes.json().catch(() => ({}));
        clearAppToken();
        setError(
          st.detail ||
            st.error ||
            `Вход принят, но данные не загрузились (${stateRes.status}).`,
        );
        setNeedsToken(true);
        return;
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка входа");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    try {
      await apiMutate("/api/auth/logout", { method: "POST" });
    } catch {
      /* ignore */
    }
    clearAppToken();
    setData(null);
    setNeedsToken(true);
  }

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const day = useMemo(() => {
    if (!data) return null;
    return data.days[`${selectedId}:${data.demo_date}`] ?? null;
  }, [data, selectedId]);

  const myVisits = useMemo(
    () => data?.visits.filter((v) => v.employee_id === selectedId) ?? [],
    [data, selectedId],
  );

  async function syncBitrix() {
    setBusy(true);
    try {
      const res = await apiMutate("/api/sync", {
        method: "POST",
        body: { employee_id: selectedId },
      });
      const json = await res.json();
      setToast(
        json.ok
          ? `Отметки ушли в Битрикс (${json.mode === "mock" ? "демо" : "live"})`
          : json.detail || json.error || "Ошибка синхронизации",
      );
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function linkVisit(visitId: string, caseId: string | null, reject = false) {
    setBusy(true);
    try {
      await apiMutate("/api/visits", {
        method: "PATCH",
        body: { visit_id: visitId, case_id: caseId, reject },
      });
      await load();
      setToast(reject ? "Визит помечен как личный" : "Дело привязано");
    } finally {
      setBusy(false);
    }
  }

  async function approvePlace(id: string) {
    await apiMutate("/api/places", {
      method: "PATCH",
      body: { id, action: "approve" },
    });
    await load();
    setToast("Место подтверждено");
  }

  async function toggleCollection(employeeId: string, enabled: boolean) {
    await apiMutate("/api/employees", {
      method: "PATCH",
      body: { employee_id: employeeId, collection_enabled: enabled },
    });
    await load();
  }

  async function saveSettings(patch: Partial<GeoSettings>) {
    await apiMutate("/api/settings", {
      method: "PATCH",
      body: patch,
    });
    await load();
    setToast("Настройки сохранены, день пересчитан");
  }

  async function resetDemo() {
    setBusy(true);
    try {
      await apiMutate("/api/reset", { method: "POST" });
      await load();
      setToast("Демо сброшено");
    } finally {
      setBusy(false);
    }
  }

  if (needsToken && !data) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <form
          onSubmit={(e) => void submitLogin(e)}
          className="w-full max-w-md border border-[var(--line)] bg-[var(--panel)] p-6 shadow-[var(--shadow)]"
        >
          <ShieldAlert className="mb-3 h-8 w-8 text-[var(--accent)]" />
          <p className="brand-mark">QALQAN · геолокация</p>
          <h1 className="mt-2 font-display text-2xl text-[var(--ink)]">Вход</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Админ — пароль из секрета приложения. Сотрудник — персональный PIN
            (если настроен секрет EMPLOYEE_PIN_HASHES). У каждой сессии свои
            данные.
          </p>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              className={cn("btn-ghost flex-1", loginRole === "admin" && "tab-active")}
              onClick={() => setLoginRole("admin")}
            >
              Админ
            </button>
            <button
              type="button"
              className={cn("btn-ghost flex-1", loginRole === "employee" && "tab-active")}
              onClick={() => setLoginRole("employee")}
            >
              Сотрудник
            </button>
          </div>
          {loginRole === "employee" && (
            <label className="mt-3 block text-sm">
              Кто вы
              <select
                className="select mt-1"
                value={loginEmployeeId}
                onChange={(e) => setLoginEmployeeId(e.target.value)}
              >
                {DEMO_EMPLOYEES.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <input
            className="input mt-3"
            type="password"
            autoComplete="current-password"
            placeholder={loginRole === "admin" ? "Пароль админа" : "PIN"}
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
          />
          {error && <p className="mt-2 text-sm text-[var(--danger)]">{error}</p>}
          <button className="btn mt-4 w-full" type="submit" disabled={busy}>
            Войти
          </button>
        </form>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-md text-center">
          <ShieldAlert className="mx-auto mb-3 h-8 w-8 text-[var(--accent)]" />
          <p className="text-lg font-semibold">{error}</p>
          <button className="btn mt-4" onClick={() => void load()}>
            Повторить
          </button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center text-[var(--muted)]">
        Собираем день…
      </div>
    );
  }

  const selected = data.employees.find((e) => e.id === selectedId);
  const isAdmin = data.viewer.can_manage;
  const visibleTabs = TABS.filter((t) => {
    if (t.id === "settings" || t.id === "places") return isAdmin;
    return true;
  });

  return (
    <div className="min-h-screen">
      <header className="relative overflow-hidden border-b border-[var(--line)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(196,163,90,0.18),transparent_55%),radial-gradient(ellipse_at_bottom_left,rgba(31,75,58,0.22),transparent_50%)]" />
        <div className="relative mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="brand-mark">QALQAN · геолокация</p>
            <h1 className="mt-1 font-display text-3xl tracking-tight text-[var(--ink)] sm:text-4xl">
              Учёт визитов без Clockster
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--muted)] sm:text-base">
              Точки с телефона → офис / визиты / чистое время. Отметки прихода и ухода
              пишутся в Битрикс24 (рабочий день), 2ГИС только для справочника мест.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="chip">
              {isAdmin ? "Роль: админ" : `Роль: ${data.viewer.name}`}
            </span>
            <span className="chip">
              {data.bitrix_mode === "mock" ? "Битрикс: демо" : "Битрикс: live"}
            </span>
            <span className="chip">
              {data.persistence === "postgres" ? "БД: Postgres" : "БД: память"}
            </span>
            <span className="chip">День {data.demo_date}</span>
            <button className="btn-ghost" onClick={() => void load()} disabled={busy}>
              <RefreshCw className="h-4 w-4" /> Обновить
            </button>
            <button className="btn" onClick={() => void syncBitrix()} disabled={busy}>
              <Send className="h-4 w-4" /> В Битрикс
            </button>
            <button className="btn-ghost" type="button" onClick={() => void logout()}>
              Выйти
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6">
        <div className="mb-4 rounded-lg border border-dashed border-[var(--line)] bg-[var(--panel)]/70 px-3 py-2 text-xs text-[var(--muted)] sm:text-sm">
          {data.sample_notice}
        </div>

        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <nav className="flex gap-1 overflow-x-auto pb-1">
            {visibleTabs.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  className={cn("tab", tab === t.id && "tab-active")}
                  onClick={() => setTab(t.id)}
                >
                  <Icon className="h-4 w-4" />
                  {t.label}
                </button>
              );
            })}
          </nav>
          {isAdmin ? (
            <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
              Сотрудник
              <select
                className="select"
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
              >
                {data.employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <span className="text-sm text-[var(--muted)]">{selected?.name}</span>
          )}
        </div>

        {tab === "map" && (
          <section className="grid gap-4 lg:grid-cols-[1.4fr_0.8fr]">
            <div className="map-shell h-[420px] overflow-hidden sm:h-[560px]">
              <MapPanel employees={data.employees} places={data.places} />
            </div>
            <aside className="space-y-3">
              <h2 className="section-title">Сейчас на карте</h2>
              <p className="section-lead">
                Статус обновляется пачками (~каждые {data.settings.draft_refresh_min} мин), не
                секунда в секунду.
              </p>
              <ul className="space-y-2">
                {data.employees.map((e) => (
                  <li key={e.id}>
                    <button
                      className={cn(
                        "w-full border border-[var(--line)] bg-[var(--panel)] px-3 py-3 text-left transition hover:border-[var(--accent)]",
                        selectedId === e.id && "border-[var(--accent)] bg-[var(--panel-strong)]",
                      )}
                      onClick={() => setSelectedId(e.id)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium text-[var(--ink)]">{e.name}</p>
                          <p className="text-xs text-[var(--muted)]">
                            {e.title} · {e.practice}
                          </p>
                        </div>
                        <span
                          className={cn(
                            "text-[10px] uppercase tracking-wide",
                            e.collection_enabled ? "text-[var(--ok)]" : "text-[var(--muted)]",
                          )}
                        >
                          {e.collection_enabled ? "сбор" : "выкл"}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-[var(--ink)]">{e.last_status}</p>
                      <p className="text-xs text-[var(--muted)]">
                        {e.last_seen_at
                          ? formatTime(e.last_seen_at)
                          : "нет сигнала"}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            </aside>
          </section>
        )}

        {tab === "journal" && (
          <section className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">
            <div>
              <h2 className="section-title">Журнал · {selected?.name}</h2>
              <p className="section-lead">
                Приход {formatTime(day?.first_in)} · уход {formatTime(day?.last_out)} · чистое
                время{" "}
                <strong className="text-[var(--ink)]">
                  {formatMinutes(day?.net_minutes ?? 0)}
                </strong>
              </p>
              {!day?.segments.length ? (
                <p className="mt-6 text-sm text-[var(--muted)]">Нет сегментов за день.</p>
              ) : (
                <ol className="mt-4 space-y-2">
                  {day.segments.map((s, idx) => (
                    <li
                      key={`${s.kind}-${s.start}-${idx}`}
                      className="flex items-start gap-3 border-l-2 border-[var(--accent)] bg-[var(--panel)] px-3 py-3"
                    >
                      <div className="min-w-[88px] text-sm tabular-nums text-[var(--muted)]">
                        {formatTime(s.start)}–{formatTime(s.end)}
                      </div>
                      <div>
                        <p className="font-medium text-[var(--ink)]">{s.label}</p>
                        <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
                          {s.kind}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
            <div className="space-y-4">
              <div className="border border-[var(--line)] bg-[var(--panel)] p-4">
                <h3 className="font-display text-xl">Итог дня</h3>
                <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  {Object.entries(day?.minutes_by_kind ?? {}).map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-[var(--muted)]">{k}</dt>
                      <dd className="font-medium">{formatMinutes(v)}</dd>
                    </div>
                  ))}
                </dl>
                <button
                  className="btn mt-4 w-full"
                  disabled={busy || !day}
                  onClick={() => void syncBitrix()}
                >
                  Записать приход/уход в Битрикс
                </button>
              </div>
              <div className="border border-[var(--line)] bg-[var(--panel)] p-4">
                <h3 className="font-display text-lg">Отметки Битрикс</h3>
                {!data.punches.filter((p) => p.employee_id === selectedId).length ? (
                  <p className="mt-2 text-sm text-[var(--muted)]">
                    Пока пусто — нажмите синхронизацию.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-2 text-sm">
                    {data.punches
                      .filter((p) => p.employee_id === selectedId)
                      .map((p) => (
                        <li key={p.id} className="border-b border-[var(--line)] pb-2">
                          <span className="font-medium">{p.type}</span> · {formatTime(p.at)}
                          <p className="text-xs text-[var(--muted)]">{p.note}</p>
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            </div>
          </section>
        )}

        {tab === "visits" && (
          <section>
            <h2 className="section-title">Мои визиты · {selected?.name}</h2>
            <p className="section-lead">
              Без дела визит не идёт в KPI. Выберите дело или отметьте «не по работе».
            </p>
            <div className="mt-4 space-y-3">
              {!myVisits.length && (
                <p className="text-sm text-[var(--muted)]">Визитов за день нет.</p>
              )}
              {myVisits.map((v) => {
                const place = data.places.find((p) => p.id === v.place_id);
                return (
                  <div
                    key={v.id}
                    className="border border-[var(--line)] bg-[var(--panel)] p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-[var(--ink)]">{place?.name}</p>
                        <p className="text-sm text-[var(--muted)]">
                          {formatTime(v.start)}–{formatTime(v.end)} · зачёт{" "}
                          {formatMinutes(v.credited_minutes)}
                        </p>
                      </div>
                      <span className="chip">{v.status}</span>
                    </div>
                    {v.status === "awaiting_choice" ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {data.cases.map((c) => (
                          <button
                            key={c.id}
                            className="btn-ghost"
                            disabled={busy}
                            onClick={() => void linkVisit(v.id, c.id)}
                          >
                            {c.title}
                          </button>
                        ))}
                        <button
                          className="btn-danger"
                          disabled={busy}
                          onClick={() => void linkVisit(v.id, null, true)}
                        >
                          Не по работе
                        </button>
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-[var(--muted)]">
                        {v.case_title ?? "без дела"} · {v.link_method ?? "—"}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {tab === "places" && (
          <section>
            <h2 className="section-title">Справочник мест</h2>
            <p className="section-lead">
              Офис вручную, госорганы из 2ГИС, клиенты из CRM Битрикс. Неизвестное место = личное.
            </p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--line)] text-[var(--muted)]">
                    <th className="py-2 pr-3 font-medium">Место</th>
                    <th className="py-2 pr-3 font-medium">Тип</th>
                    <th className="py-2 pr-3 font-medium">Источник</th>
                    <th className="py-2 pr-3 font-medium">Радиус</th>
                    <th className="py-2 pr-3 font-medium">Статус</th>
                    <th className="py-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {data.places.map((p) => (
                    <tr key={p.id} className="border-b border-[var(--line)]/70">
                      <td className="py-3 pr-3">
                        <p className="font-medium text-[var(--ink)]">{p.name}</p>
                        <p className="text-xs text-[var(--muted)]">{p.address}</p>
                      </td>
                      <td className="py-3 pr-3">{p.type}</td>
                      <td className="py-3 pr-3">{p.source}</td>
                      <td className="py-3 pr-3">{p.radius_m} м</td>
                      <td className="py-3 pr-3">{p.status}</td>
                      <td className="py-3">
                        {p.status === "pending" && (
                          <button className="btn-ghost" onClick={() => void approvePlace(p.id)}>
                            Подтвердить
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {tab === "phone" && (
          <PhoneSimPanel
            employeeId={selectedId}
            employeeName={selected?.name ?? selectedId}
            places={data.places}
            onSent={() => void load()}
            setToast={setToast}
          />
        )}

        {tab === "settings" && isAdmin && (
          <SettingsPanel
            settings={data.settings as GeoSettings}
            employees={data.employees}
            onSave={(patch) => void saveSettings(patch)}
            onToggle={toggleCollection}
            onReset={() => void resetDemo()}
            busy={busy}
          />
        )}
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function PhoneSimPanel({
  employeeId,
  employeeName,
  places,
  onSent,
  setToast,
}: {
  employeeId: string;
  employeeName: string;
  places: Place[];
  onSent: () => void;
  setToast: (msg: string) => void;
}) {
  const [running, setRunning] = useState(false);
  const [placeId, setPlaceId] = useState("p-office");
  const [log, setLog] = useState<string[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const place = places.find((p) => p.id === placeId) ?? places[0];

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  async function pushOnce(atPlace: Place, moving: boolean) {
    const jitter = () => (Math.random() - 0.5) * 0.00025;
    const point = {
      device_id: `sim-${employeeId}`,
      employee_id: employeeId,
      ts: new Date().toISOString(),
      lat: atPlace.lat + jitter(),
      lon: atPlace.lon + jitter(),
      accuracy_m: 12 + Math.round(Math.random() * 8),
      speed_mps: moving ? 1.2 : 0,
      is_moving: moving,
      wifi_bssid:
        atPlace.type === "office" ? atPlace.bssid_list[0] ?? null : null,
      mock: false,
      battery: 0.82,
    };
    const res = await apiMutate("/api/points", {
      method: "POST",
      body: { points: [point] },
    });
    const json = await res.json();
    if (!res.ok) {
      setToast(json.error || "Ошибка отправки точки");
      stop();
      return;
    }
    setLog((prev) =>
      [
        `${new Date().toLocaleTimeString("ru-RU", { timeZone: "Asia/Qyzylorda" })} · ${atPlace.name} · +${json.added}`,
        ...prev,
      ].slice(0, 12),
    );
    onSent();
  }

  function stop() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    setRunning(false);
  }

  function start() {
    if (!place) return;
    stop();
    setRunning(true);
    void pushOnce(place, false);
    timerRef.current = setInterval(() => {
      const p = places.find((x) => x.id === placeId) ?? place;
      void pushOnce(p, false);
    }, 8_000);
  }

  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <div>
        <h2 className="section-title">Симулятор телефона</h2>
        <p className="section-lead">
          Имитация фоновой геолокации для {employeeName}: точки уходят на сервер
          каждые 8 сек (как пачки с телефона).
        </p>
        <div className="mt-4 space-y-3 border border-[var(--line)] bg-[var(--panel)] p-4">
          <label className="block text-sm">
            Место
            <select
              className="select mt-1"
              value={placeId}
              disabled={running}
              onChange={(e) => setPlaceId(e.target.value)}
            >
              {places
                .filter((p) => p.status === "approved")
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-2">
            {!running ? (
              <button className="btn" type="button" onClick={start}>
                Начать сбор
              </button>
            ) : (
              <button className="btn-danger" type="button" onClick={stop}>
                Остановить
              </button>
            )}
            <button
              className="btn-ghost"
              type="button"
              disabled={!place}
              onClick={() => place && void pushOnce(place, true)}
            >
              Одна точка сейчас
            </button>
          </div>
          <p className="text-xs text-[var(--muted)]">
            В офисе точка получает BSSID офисного Wi‑Fi. Смените место и
            перезапустите сбор, чтобы смоделировать визит.
          </p>
        </div>
      </div>
      <div>
        <h3 className="font-display text-xl">Лог отправки</h3>
        {!log.length ? (
          <p className="mt-2 text-sm text-[var(--muted)]">Пока тихо.</p>
        ) : (
          <ul className="mt-3 space-y-1 text-sm text-[var(--muted)]">
            {log.map((line) => (
              <li key={line} className="border-b border-[var(--line)]/60 py-1">
                {line}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function SettingsPanel({
  settings,
  employees,
  onSave,
  onToggle,
  onReset,
  busy,
}: {
  settings: GeoSettings;
  employees: Employee[];
  onSave: (patch: Partial<GeoSettings>) => void;
  onToggle: (id: string, enabled: boolean) => void;
  onReset: () => void;
  busy: boolean;
}) {
  const [visitMin, setVisitMin] = useState(settings.visit_min);
  const [personalMin, setPersonalMin] = useState(settings.personal_stop_min);
  const [officeExit, setOfficeExit] = useState(settings.office_exit_min);

  useEffect(() => {
    setVisitMin(settings.visit_min);
    setPersonalMin(settings.personal_stop_min);
    setOfficeExit(settings.office_exit_min);
  }, [settings]);

  return (
    <section className="grid gap-6 lg:grid-cols-2">
      <div>
        <h2 className="section-title">Пороги</h2>
        <p className="section-lead">Все пороги из таблицы settings — без хардкода в алгоритме.</p>
        <div className="mt-4 space-y-4 border border-[var(--line)] bg-[var(--panel)] p-4">
          <label className="block text-sm">
            Визит, мин
            <input
              className="input mt-1"
              type="number"
              value={visitMin}
              onChange={(e) => setVisitMin(Number(e.target.value))}
            />
          </label>
          <label className="block text-sm">
            Личная остановка, мин
            <input
              className="input mt-1"
              type="number"
              value={personalMin}
              onChange={(e) => setPersonalMin(Number(e.target.value))}
            />
          </label>
          <label className="block text-sm">
            Выход из офиса, мин
            <input
              className="input mt-1"
              type="number"
              value={officeExit}
              onChange={(e) => setOfficeExit(Number(e.target.value))}
            />
          </label>
          <button
            className="btn"
            disabled={busy}
            onClick={() =>
              onSave({
                visit_min: visitMin,
                personal_stop_min: personalMin,
                office_exit_min: officeExit,
              })
            }
          >
            Сохранить и пересчитать
          </button>
        </div>
      </div>
      <div>
        <h2 className="section-title">Сбор по сотрудникам</h2>
        <p className="section-lead">Без согласия сбор не включается.</p>
        <ul className="mt-4 space-y-2">
          {employees.map((e) => (
            <li
              key={e.id}
              className="flex items-center justify-between border border-[var(--line)] bg-[var(--panel)] px-3 py-3"
            >
              <div>
                <p className="font-medium">{e.name}</p>
                <p className="text-xs text-[var(--muted)]">
                  согласие: {e.consent_at ? "есть" : "нет"}
                </p>
              </div>
              <button
                className={cn("btn-ghost", e.collection_enabled && "tab-active")}
                onClick={() => onToggle(e.id, !e.collection_enabled)}
              >
                {e.collection_enabled ? "Выключить" : "Включить"}
              </button>
            </li>
          ))}
        </ul>
        <button className="btn-danger mt-4" onClick={onReset} disabled={busy}>
          Сбросить демо-данные
        </button>
      </div>
    </section>
  );
}

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatMinutes(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (h <= 0) return `${min} мин`;
  return `${h} ч ${String(min).padStart(2, "0")} мин`;
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Qyzylorda",
  });
}

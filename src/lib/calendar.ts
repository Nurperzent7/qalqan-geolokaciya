/** Working calendar day in Asia/Qyzylorda (UTC+5). */
export const APP_TZ = "Asia/Qyzylorda";

export function todayDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

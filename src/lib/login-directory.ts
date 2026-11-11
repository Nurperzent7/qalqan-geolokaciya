/**
 * Public login picker only — id + display name.
 * Never put Bitrix IDs, roles, or coordinates here (ships to the browser).
 */
export type LoginEmployee = { id: string; name: string };

export const LOGIN_EMPLOYEES: LoginEmployee[] = [
  { id: "e-askar", name: "Аскар Бекенов" },
  { id: "e-ann", name: "Анна Серикова" },
  { id: "e-nurlan", name: "Нурлан Касымов" },
  { id: "e-dana", name: "Дана Омарова" },
  { id: "e-aigerim", name: "Айгерим Жумабаева" },
];

export function loginEmployeeName(id: string): string | null {
  return LOGIN_EMPLOYEES.find((e) => e.id === id)?.name ?? null;
}

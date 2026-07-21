import { db } from "../db";

export function normalizeName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Returns true if a customer with the same normalized name already exists (optionally excluding one id). */
export async function isDuplicateCustomerName(name: string, excludeId?: number): Promise<boolean> {
  const norm = normalizeName(name);
  if (!norm) return false;
  const all = await db.customers.toArray();
  return all.some((c) => normalizeName(c.name) === norm && c.id !== excludeId);
}

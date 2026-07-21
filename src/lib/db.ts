import Dexie, { type Table } from "dexie";

export interface Customer {
  id?: number;
  name: string;
  createdAt: number;
  updatedAt?: number;
  mobileNumber?: string;   // optional, digits only, 10-15 chars
  whatsappNumber?: string; // optional, digits only, 10-15 chars
}

export interface Transaction {
  id?: number;
  customerId: number;
  serial: number;
  item: string;
  price: number; // positive = udhari (owed), negative = payment
  date: string; // DD/MM/YYYY
  createdAt: number;
}

export interface MetaEntry {
  key: string;
  value: unknown;
}

class UdhariDB extends Dexie {
  customers!: Table<Customer, number>;
  transactions!: Table<Transaction, number>;
  meta!: Table<MetaEntry, string>;

  constructor() {
    super("bharti_udhari");
    this.version(1).stores({
      customers: "++id, name, createdAt",
      transactions: "++id, customerId, serial, date, createdAt",
    });
    this.version(2)
      .stores({
        customers: "++id, name, createdAt",
        transactions: "++id, customerId, serial, date, createdAt",
        meta: "&key",
      })
      .upgrade(async (tx) => {
        const now = Date.now();
        await tx.table("customers").toCollection().modify((c: Customer) => {
          if (!c.updatedAt) c.updatedAt = c.createdAt ?? now;
        });
      });
    // v3: mobileNumber + whatsappNumber added (non-indexed, no data migration needed)
    this.version(3).stores({
      customers: "++id, name, createdAt",
      transactions: "++id, customerId, serial, date, createdAt",
      meta: "&key",
    });
  }
}

export const db = new UdhariDB();

// ---------- Meta keyval helpers ----------
export async function metaGet<T = unknown>(key: string): Promise<T | undefined> {
  const row = await db.meta.get(key);
  return row?.value as T | undefined;
}
export async function metaSet(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value });
}
export async function metaDelete(key: string): Promise<void> {
  await db.meta.delete(key);
}

// ---------- Utilities ----------
export function todayDDMMYYYY(d: Date = new Date()): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export function dayFromDDMMYYYY(s: string): string {
  const [dd, mm, yyyy] = s.split("/").map(Number);
  if (!dd || !mm || !yyyy) return "";
  const d = new Date(yyyy, mm - 1, dd);
  return ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][d.getDay()];
}

export function formatINR(n: number): string {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(Math.round(n));
  return `${sign}₹${abs.toLocaleString("en-IN")}`;
}

export async function getCustomerBalance(customerId: number): Promise<number> {
  const txs = await db.transactions.where("customerId").equals(customerId).toArray();
  return txs.reduce((s, t) => s + t.price, 0);
}

export async function nextSerial(customerId: number): Promise<number> {
  const count = await db.transactions.where("customerId").equals(customerId).count();
  return count + 1;
}

export function customerFileId(numericId: number): string {
  return `customer_${String(numericId).padStart(6, "0")}`;
}
export function parseCustomerFileId(s: string): number | null {
  const m = /^customer_(\d+)$/.exec(s);
  return m ? Number(m[1]) : null;
}

import { db, customerFileId, dayFromDDMMYYYY, type Customer, type Transaction } from "../db";

export interface SerializedTx {
  serial: number;
  item: string;
  price: number;
  date: string;
  day: string;
  createdAt: number;
}

export interface SerializedCustomer {
  id: string; // customer_000001
  numericId: number;
  name: string;
  mobileNumber?: string;
  whatsappNumber?: string;
  createdAt: number;
  updatedAt: number;
  transactions: SerializedTx[];
}

export async function serializeCustomer(c: Customer, txs?: Transaction[]): Promise<SerializedCustomer> {
  const list = txs ?? (await db.transactions.where("customerId").equals(c.id!).toArray());
  list.sort((a, b) => a.serial - b.serial);
  const lastTx = list.reduce((m, t) => Math.max(m, t.createdAt), 0);
  return {
    id: customerFileId(c.id!),
    numericId: c.id!,
    name: c.name,
    mobileNumber: c.mobileNumber,
    whatsappNumber: c.whatsappNumber,
    createdAt: c.createdAt,
    updatedAt: Math.max(c.updatedAt ?? c.createdAt, lastTx),
    transactions: list.map((t) => ({
      serial: t.serial,
      item: t.item,
      price: t.price,
      date: t.date,
      day: dayFromDDMMYYYY(t.date),
      createdAt: t.createdAt,
    })),
  };
}

export async function sha256Hex(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

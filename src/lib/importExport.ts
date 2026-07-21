// Modular import/export layer. UI-agnostic.
// Real logic uses Dexie tables; kept small so it can be swapped later.
import { db, type Customer, type Transaction } from "./db";

export interface BackupPayload {
  version: 1;
  exportedAt: string;
  customers: Customer[];
  transactions: Transaction[];
}

// ---------- JSON ----------
export async function exportJSON(): Promise<BackupPayload> {
  const customers = await db.customers.toArray();
  const transactions = await db.transactions.toArray();
  return { version: 1, exportedAt: new Date().toISOString(), customers, transactions };
}

export async function importJSON(payload: BackupPayload, mode: "replace" | "merge" = "replace") {
  if (!payload || payload.version !== 1) throw new Error("Invalid backup file");
  await db.transaction("rw", db.customers, db.transactions, async () => {
    if (mode === "replace") {
      await db.transactions.clear();
      await db.customers.clear();
    }
    if (payload.customers?.length) await db.customers.bulkPut(payload.customers);
    if (payload.transactions?.length) await db.transactions.bulkPut(payload.transactions);
  });
}

// ---------- CSV ----------
function toCSV(rows: (string | number)[][]): string {
  return rows
    .map((r) =>
      r
        .map((v) => {
          const s = String(v ?? "");
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(","),
    )
    .join("\n");
}

export async function exportCustomersCSV(): Promise<string> {
  const cs = await db.customers.toArray();
  const rows: (string | number)[][] = [["id", "name", "mobileNumber", "whatsappNumber", "createdAt"]];
  cs.forEach((c) =>
    rows.push([c.id ?? "", c.name, c.mobileNumber ?? "", c.whatsappNumber ?? "", c.createdAt]),
  );
  return toCSV(rows);
}

export async function exportTransactionsCSV(): Promise<string> {
  const ts = await db.transactions.toArray();
  const rows: (string | number)[][] = [
    ["id", "customerId", "serial", "item", "price", "date", "createdAt"],
  ];
  ts.forEach((t) =>
    rows.push([t.id ?? "", t.customerId, t.serial, t.item, t.price, t.date, t.createdAt]),
  );
  return toCSV(rows);
}

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else cell += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ",") { cur.push(cell); cell = ""; }
      else if (ch === "\n") { cur.push(cell); rows.push(cur); cur = []; cell = ""; }
      else if (ch === "\r") { /* skip */ }
      else cell += ch;
    }
  }
  if (cell.length || cur.length) { cur.push(cell); rows.push(cur); }
  return rows.filter((r) => r.length > 1 || (r[0] && r[0].length));
}

export async function importCustomersCSV(text: string) {
  const rows = parseCSV(text);
  const [header, ...data] = rows;
  // detect column positions for forward-compat with old (3-col) and new (5-col) CSVs
  const idx = (name: string) => header.findIndex((h) => h.trim().toLowerCase() === name);
  const iId   = idx("id");
  const iName = idx("name");
  const iMob  = idx("mobilenumber");
  const iWa   = idx("whatsappnumber");
  const iCa   = idx("createdat");
  const items: Customer[] = data.map((r) => ({
    id:            iId   >= 0 && r[iId]   ? Number(r[iId])  : undefined,
    name:          iName >= 0             ? (r[iName] ?? "") : (r[1] ?? ""),
    mobileNumber:  iMob  >= 0 && r[iMob]  ? r[iMob] : undefined,
    whatsappNumber:iWa   >= 0 && r[iWa]   ? r[iWa]  : undefined,
    createdAt:     iCa   >= 0 && r[iCa]   ? Number(r[iCa])  : Date.now(),
  }));
  await db.customers.bulkPut(items);
}

export async function importTransactionsCSV(text: string) {
  const rows = parseCSV(text);
  const [, ...data] = rows;
  const items: Transaction[] = data.map((r) => ({
    id: r[0] ? Number(r[0]) : undefined,
    customerId: Number(r[1]),
    serial: Number(r[2]),
    item: r[3] ?? "",
    price: Number(r[4]),
    date: r[5] ?? "",
    createdAt: r[6] ? Number(r[6]) : Date.now(),
  }));
  await db.transactions.bulkPut(items);
}

// ---------- Helpers for UI ----------
export function downloadBlob(filename: string, content: string, type = "text/plain") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}

export async function clearAll() {
  await db.transaction("rw", db.customers, db.transactions, async () => {
    await db.transactions.clear();
    await db.customers.clear();
  });
}

export async function storageEstimate(): Promise<{ usedMB: number; quotaMB: number } | null> {
  if (!("storage" in navigator) || !navigator.storage.estimate) return null;
  const e = await navigator.storage.estimate();
  return {
    usedMB: +((e.usage ?? 0) / (1024 * 1024)).toFixed(2),
    quotaMB: +((e.quota ?? 0) / (1024 * 1024)).toFixed(0),
  };
}

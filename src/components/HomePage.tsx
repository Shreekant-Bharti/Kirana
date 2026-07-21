import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { Search, X, Plus, ChevronRight, Users, UserPlus, SearchX } from "lucide-react";
import { db, formatINR } from "../lib/db";
import { isDuplicateCustomerName, normalizeName } from "../lib/backup/validation";
import { TopBar } from "./TopBar";
import { EmptyState, ListSkeleton } from "./EmptyState";
import { Sheet, SheetButtons } from "./Sheet";

interface CustomerRow {
  id: number;
  name: string;
  balance: number;
  lastUpdated: number | null;
}

function timeAgo(ts: number | null): string {
  if (!ts) return "No transactions yet";
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} day${d > 1 ? "s" : ""} ago`;
  const date = new Date(ts);
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

/** Returns an error string when entered, or null if empty (optional) or valid (10-15 digits). */
function validatePhone(v: string): string | null {
  if (!v) return null;
  if (v.length < 10 || v.length > 15) return "Must be 10–15 digits";
  return null;
}

export default function HomePage() {
  const [search, setSearch] = useState("");
  const [newName, setNewName] = useState("");
  const [newMobile, setNewMobile] = useState("");
  const [newWhatsapp, setNewWhatsapp] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  const rows = useLiveQuery<CustomerRow[] | undefined>(async () => {
    const all = await db.customers.orderBy("name").toArray();
    const result: CustomerRow[] = [];
    for (const c of all) {
      const txs = await db.transactions.where("customerId").equals(c.id!).toArray();
      const balance = txs.reduce((s, t) => s + t.price, 0);
      const lastUpdated = txs.length ? Math.max(...txs.map((t) => t.createdAt)) : null;
      result.push({ id: c.id!, name: c.name, balance, lastUpdated });
    }
    return result;
  }, []);

  const loading = rows === undefined;
  const customers = rows ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) => c.name.toLowerCase().includes(q));
  }, [customers, search]);

  const total = customers.reduce((s, c) => s + c.balance, 0);

  const [dupError, setDupError] = useState<string | null>(null);
  const normalized = normalizeName(newName);
  const existingNames = useMemo(
    () => new Set(customers.map((c) => normalizeName(c.name))),
    [customers],
  );
  const isDup = normalized.length > 0 && existingNames.has(normalized);
  const mobileErr = validatePhone(newMobile);
  const waErr = validatePhone(newWhatsapp);
  const canSave = normalized.length > 0 && !isDup && !mobileErr && !waErr;

  async function addCustomer() {
    const name = newName.trim();
    if (!name) return;
    if (await isDuplicateCustomerName(name)) {
      setDupError("Customer already exists.");
      return;
    }
    const now = Date.now();
    await db.customers.add({
      name,
      createdAt: now,
      updatedAt: now,
      mobileNumber: newMobile || undefined,
      whatsappNumber: newWhatsapp || undefined,
    });
    setNewName("");
    setNewMobile("");
    setNewWhatsapp("");
    setDupError(null);
    setShowAdd(false);
  }

  return (
    <div className="app-frame flex flex-col">
      <TopBar title="Bharti Udhari" onPrint={() => window.print()} />

      {/* Balance hero */}
      <section className="no-print px-4 pt-2 pb-4">
        <div className="rounded-[20px] bg-[color:var(--surface)] px-5 py-5 shadow-[var(--shadow-card)] border border-[color:var(--border)]">
          <div className="text-[12px] font-medium uppercase tracking-wider text-[color:var(--muted-foreground)]">
            Total Udhari
          </div>
          <div className="mt-1 text-[34px] font-semibold tracking-tight tabular-nums">{formatINR(total)}</div>
          <div className="mt-1 text-[13px] text-[color:var(--muted-foreground)]">
            Across {customers.length} customer{customers.length === 1 ? "" : "s"}
          </div>
        </div>
      </section>

      {/* Sticky search */}
      <div className="no-print sticky top-[54px] z-10 bg-[color:var(--background)]/85 px-4 pb-3 backdrop-blur-xl">
        <div className="relative">
          <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[color:var(--muted-foreground)]" />
          <input
            type="text"
            inputMode="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search Customer"
            className="h-11 w-full rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] pl-10 pr-10 text-[15px] outline-none placeholder:text-[color:var(--muted-foreground)] focus:border-[color:var(--accent)]"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              aria-label="Clear"
              className="absolute right-2.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full bg-[color:var(--muted)] text-[color:var(--muted-foreground)]"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Customer list */}
      <main className="no-print flex-1 pb-28">
        {loading ? (
          <ListSkeleton />
        ) : customers.length === 0 ? (
          <EmptyState
            icon={<Users size={28} />}
            title="No customers yet"
            description="Tap the + button to add your first customer and start tracking udhari."
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<SearchX size={28} />}
            title="No matches"
            description={`No customer named "${search}".`}
          />
        ) : (
          <ul className="space-y-3 px-3 animate-fade-up">
            {filtered.map((c) => (
              <li key={c.id}>
                <Link
                  to="/customer/$id"
                  params={{ id: String(c.id) }}
                  className="tap flex items-center gap-3 rounded-[16px] border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-3.5 shadow-[var(--shadow-card)]"
                >
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[color:var(--muted)] text-[15px] font-semibold uppercase text-[color:var(--muted-foreground)]">
                    {c.name.trim().charAt(0) || "?"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[16px] font-semibold">{c.name}</div>
                    <div className="mt-0.5 truncate text-[12.5px] text-[color:var(--muted-foreground)]">
                      {timeAgo(c.lastUpdated)}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div
                      className={`text-[16px] font-semibold tabular-nums ${
                        c.balance > 0
                          ? "text-[color:var(--foreground)]"
                          : c.balance < 0
                            ? "text-[color:var(--success)]"
                            : "text-[color:var(--muted-foreground)]"
                      }`}
                    >
                      {formatINR(c.balance)}
                    </div>
                    <div className="mt-0.5 text-[11px] uppercase tracking-wider text-[color:var(--muted-foreground)]">
                      Pending
                    </div>
                  </div>
                  <ChevronRight size={18} className="shrink-0 text-[color:var(--hairline)]" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>

      {/* FAB */}
      <button
        onClick={() => setShowAdd(true)}
        aria-label="Add customer"
        className="no-print fixed bottom-6 grid h-14 w-14 place-items-center rounded-full bg-[color:var(--accent)] text-white shadow-[var(--shadow-fab)] transition active:scale-95"
        style={{ right: "max(1rem, calc(50vw - 240px + 1rem))" }}
      >
        <Plus size={26} strokeWidth={2.5} />
      </button>

      <Sheet open={showAdd} title="New Customer" onClose={() => { setShowAdd(false); setDupError(null); }}>
        {/* Name */}
        <label className="mb-1 block px-1 text-[12px] font-medium uppercase tracking-wider text-[color:var(--muted-foreground)]">
          Name
        </label>
        <input
          autoFocus
          value={newName}
          onChange={(e) => { setNewName(e.target.value); setDupError(null); }}
          onKeyDown={(e) => e.key === "Enter" && canSave && addCustomer()}
          placeholder="e.g. Ramesh Kumar"
          className={`h-14 w-full rounded-[14px] border bg-[color:var(--surface-2)] px-4 text-[17px] outline-none ${
            isDup || dupError
              ? "border-[color:var(--danger)] focus:border-[color:var(--danger)]"
              : "border-[color:var(--border)] focus:border-[color:var(--accent)]"
          }`}
        />
        {(isDup || dupError) && (
          <div className="mt-2 px-1 text-[13px] text-[color:var(--danger)]">
            Customer already exists.
          </div>
        )}

        {/* Mobile */}
        <label className="mt-3 mb-1 block px-1 text-[12px] font-medium uppercase tracking-wider text-[color:var(--muted-foreground)]">
          Mobile Number <span className="normal-case font-normal">(Optional)</span>
        </label>
        <input
          type="tel"
          inputMode="numeric"
          value={newMobile}
          onChange={(e) => setNewMobile(e.target.value.replace(/\D/g, "").slice(0, 15))}
          placeholder="10–15 digits"
          className={`h-14 w-full rounded-[14px] border bg-[color:var(--surface-2)] px-4 text-[17px] outline-none ${
            mobileErr
              ? "border-[color:var(--danger)] focus:border-[color:var(--danger)]"
              : "border-[color:var(--border)] focus:border-[color:var(--accent)]"
          }`}
        />
        {mobileErr && (
          <div className="mt-1 px-1 text-[13px] text-[color:var(--danger)]">{mobileErr}</div>
        )}

        {/* WhatsApp */}
        <label className="mt-3 mb-1 block px-1 text-[12px] font-medium uppercase tracking-wider text-[color:var(--muted-foreground)]">
          WhatsApp Number <span className="normal-case font-normal">(Optional)</span>
        </label>
        <input
          type="tel"
          inputMode="numeric"
          value={newWhatsapp}
          onChange={(e) => setNewWhatsapp(e.target.value.replace(/\D/g, "").slice(0, 15))}
          placeholder="10–15 digits"
          className={`h-14 w-full rounded-[14px] border bg-[color:var(--surface-2)] px-4 text-[17px] outline-none ${
            waErr
              ? "border-[color:var(--danger)] focus:border-[color:var(--danger)]"
              : "border-[color:var(--border)] focus:border-[color:var(--accent)]"
          }`}
        />
        {waErr && (
          <div className="mt-1 px-1 text-[13px] text-[color:var(--danger)]">{waErr}</div>
        )}

        <div className={canSave ? "" : "pointer-events-none opacity-50"}>
          <SheetButtons onCancel={() => { setShowAdd(false); setDupError(null); }} onConfirm={addCustomer} confirmLabel="Add Customer" />
        </div>
      </Sheet>

      <PrintAll customers={customers} total={total} />
    </div>
  );
}

function PrintAll({
  customers,
  total,
}: {
  customers: CustomerRow[];
  total: number;
}) {
  const today = new Date().toLocaleDateString("en-IN");
  return (
    <div className="print-area p-8 text-black">
      <h1 className="mb-1 text-2xl font-bold">Bharti Udhari — Customer Balances</h1>
      <div className="mb-4 text-sm">Date: {today}</div>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="border border-black px-2 py-1 text-left">#</th>
            <th className="border border-black px-2 py-1 text-left">Customer Name</th>
            <th className="border border-black px-2 py-1 text-right">Pending Amount</th>
          </tr>
        </thead>
        <tbody>
          {customers.map((c, i) => (
            <tr key={c.id}>
              <td className="border border-black px-2 py-1">{i + 1}</td>
              <td className="border border-black px-2 py-1">{c.name}</td>
              <td className="border border-black px-2 py-1 text-right">{formatINR(c.balance)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td className="border border-black px-2 py-1 font-bold" colSpan={2}>
              Total Customers: {customers.length}
            </td>
            <td className="border border-black px-2 py-1 text-right font-bold">{formatINR(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

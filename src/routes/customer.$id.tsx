import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useParams, useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus, Trash2, Receipt, Phone, MessageCircle, Pencil } from "lucide-react";
import {
  db,
  formatINR,
  todayDDMMYYYY,
  dayFromDDMMYYYY,
  nextSerial,
  type Transaction,
} from "../lib/db";
import { useSyncTrigger } from "../lib/sync/syncHooks";
import { getShopName, getIncludeShopName } from "../lib/communicationSettings";
import { TopBar } from "../components/TopBar";
import { Sheet, SheetButtons } from "../components/Sheet";
import { EmptyState } from "../components/EmptyState";

export const Route = createFileRoute("/customer/$id")({
  component: CustomerPage,
});

/* ── helpers ─────────────────────────────────────────────────────────── */

function validatePhone(v: string): string | null {
  if (!v) return null;
  if (v.length < 10 || v.length > 15) return "Must be 10–15 digits";
  return null;
}

function formatPhoneForCall(phone: string): string {
  const d = phone.replace(/\D/g, "");
  if (d.length === 10) return `+91${d}`;
  return d.startsWith("+") ? d : `+${d}`;
}

function formatPhoneForWhatsApp(phone: string): string {
  const d = phone.replace(/\D/g, "");
  return d.length === 10 ? `91${d}` : d;
}

function generateWhatsAppMessage(
  name: string,
  transactions: Transaction[],
  total: number,
  shopN: string,
): string {
  const lines: string[] = [];
  lines.push(`Hello ${name} Ji,`);
  lines.push("");
  lines.push("Here is your current Udhari account.");
  lines.push("");
  lines.push("---");
  transactions.forEach((t) => {
    lines.push("");
    lines.push(`${t.serial}. ${t.item}`);
    lines.push(formatINR(t.price));
    lines.push(t.date);
    lines.push(dayFromDDMMYYYY(t.date));
    lines.push("---");
  });
  lines.push("");
  lines.push("Total Pending");
  lines.push(formatINR(total));
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("Thank you.");
  if (shopN) {
    lines.push("");
    lines.push(shopN);
  }
  return lines.join("\n");
}

/* ── component ───────────────────────────────────────────────────────── */

function CustomerPage() {
  const { id } = useParams({ from: "/customer/$id" });
  const customerId = Number(id);
  const navigate = useNavigate();
  const { notifyChange } = useSyncTrigger();

  const customer = useLiveQuery(() => db.customers.get(customerId), [customerId]);
  const txs =
    useLiveQuery(
      () => db.transactions.where("customerId").equals(customerId).sortBy("serial"),
      [customerId],
    ) ?? [];

  const total = useMemo(() => txs.reduce((s, t) => s + t.price, 0), [txs]);

  /* transaction state */
  const [showAdd, setShowAdd] = useState(false);
  const [item, setItem] = useState("");
  const [price, setPrice] = useState("");
  const [editTx, setEditTx] = useState<Transaction | null>(null);
  const [deleteTx, setDeleteTx] = useState<Transaction | null>(null);
  const [confirmDeleteCustomer, setConfirmDeleteCustomer] = useState(false);

  /* communication / edit state */
  const [toast, setToast] = useState<string | null>(null);
  const [showEditCustomer, setShowEditCustomer] = useState(false);
  const [editCustName, setEditCustName] = useState("");
  const [editCustMobile, setEditCustMobile] = useState("");
  const [editCustWhatsapp, setEditCustWhatsapp] = useState("");
  const [shopNameState, setShopNameState] = useState("Bharti Udhari");

  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);

  useEffect(() => {
    setShopNameState(getShopName());
  }, []);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  }

  /* long-press handlers */
  function startPress(tx: Transaction) {
    longPressed.current = false;
    pressTimer.current = setTimeout(() => {
      longPressed.current = true;
      setDeleteTx(tx);
    }, 500);
  }
  function endPress(tx: Transaction) {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    if (!longPressed.current) setEditTx(tx);
  }
  function cancelPress() {
    if (pressTimer.current) clearTimeout(pressTimer.current);
  }

  /* edit customer */
  function openEditCustomer() {
    if (!customer) return;
    setEditCustName(customer.name);
    setEditCustMobile(customer.mobileNumber ?? "");
    setEditCustWhatsapp(customer.whatsappNumber ?? "");
    setShowEditCustomer(true);
  }

  const editMobileErr = validatePhone(editCustMobile);
  const editWaErr = validatePhone(editCustWhatsapp);
  const canSaveEdit = editCustName.trim().length > 0 && !editMobileErr && !editWaErr;

  async function saveEditCustomer() {
    if (!customer?.id) return;
    const name = editCustName.trim();
    if (!name) return;
    await db.customers.update(customer.id, {
      name,
      mobileNumber: editCustMobile || undefined,
      whatsappNumber: editCustWhatsapp || undefined,
      updatedAt: Date.now(),
    });
    notifyChange(customerId);
    setShowEditCustomer(false);
  }

  /* call */
  function handleCall() {
    if (!customer?.mobileNumber) {
      flash("No mobile number available.");
      return;
    }
    window.open(`tel:${formatPhoneForCall(customer.mobileNumber)}`);
  }

  /* whatsapp */
  function handleWhatsApp() {
    if (!customer?.whatsappNumber) {
      flash("No WhatsApp number available.");
      return;
    }
    const include = getIncludeShopName();
    const msg = generateWhatsAppMessage(
      customer.name,
      txs,
      total,
      include ? shopNameState : "",
    );
    const url = `https://wa.me/${formatPhoneForWhatsApp(customer.whatsappNumber)}?text=${encodeURIComponent(msg)}`;
    window.open(url, "_blank");
  }

  /* transaction CRUD */
  async function saveNew() {
    const p = parseFloat(price);
    if (!item.trim() || Number.isNaN(p)) return;
    const serial = await nextSerial(customerId);
    await db.transactions.add({
      customerId,
      serial,
      item: item.trim(),
      price: p,
      date: todayDDMMYYYY(),
      createdAt: Date.now(),
    });
    await db.customers.update(customerId, { updatedAt: Date.now() });
    notifyChange(customerId);
    setItem("");
    setPrice("");
    setShowAdd(false);
  }

  async function saveEdit() {
    if (!editTx?.id) return;
    await db.transactions.update(editTx.id, {
      item: editTx.item,
      price: editTx.price,
      date: editTx.date,
    });
    await db.customers.update(customerId, { updatedAt: Date.now() });
    notifyChange(customerId);
    setEditTx(null);
  }

  async function confirmDelete() {
    if (!deleteTx?.id) return;
    await db.transactions.delete(deleteTx.id);
    const remaining = await db.transactions
      .where("customerId")
      .equals(customerId)
      .sortBy("serial");
    await db.transaction("rw", db.transactions, async () => {
      for (let i = 0; i < remaining.length; i++) {
        if (remaining[i].serial !== i + 1) {
          await db.transactions.update(remaining[i].id!, { serial: i + 1 });
        }
      }
    });
    await db.customers.update(customerId, { updatedAt: Date.now() });
    notifyChange(customerId);
    setDeleteTx(null);
  }

  async function deleteCustomer() {
    await db.transactions.where("customerId").equals(customerId).delete();
    await db.customers.delete(customerId);
    notifyChange(customerId, "delete");
    navigate({ to: "/" });
  }

  if (!customer) {
    return (
      <div className="app-frame">
        <TopBar title="Loading…" showBack />
      </div>
    );
  }

  return (
    <div className="app-frame flex flex-col">
      {/* TopBar: edit + delete in right slot; print via onPrint prop */}
      <TopBar
        title={customer.name}
        showBack
        onPrint={() => window.print()}
        right={
          <div className="flex items-center">
            <button
              onClick={openEditCustomer}
              aria-label="Edit customer"
              className="tap grid h-10 w-9 place-items-center rounded-lg text-[color:var(--accent)]"
            >
              <Pencil size={16} />
            </button>
            <button
              onClick={() => setConfirmDeleteCustomer(true)}
              aria-label="Delete customer"
              className="tap grid h-10 w-9 place-items-center rounded-lg text-[color:var(--danger)]"
            >
              <Trash2 size={18} />
            </button>
          </div>
        }
      />

      {/* Balance hero */}
      <section className="no-print px-4 pt-1 pb-3">
        <div className="rounded-[20px] border border-[color:var(--border)] bg-[color:var(--surface)] px-5 py-5 shadow-[var(--shadow-card)]">
          <div className="text-[12px] font-medium uppercase tracking-wider text-[color:var(--muted-foreground)]">
            Total Pending
          </div>
          <div className="mt-1 text-[34px] font-semibold tracking-tight tabular-nums">{formatINR(total)}</div>
          <div className="mt-1 text-[13px] text-[color:var(--muted-foreground)]">
            {txs.length} transaction{txs.length === 1 ? "" : "s"}
          </div>
        </div>
      </section>

      {/* Call / WhatsApp */}
      <section className="no-print px-4 pb-3 flex gap-2">
        <button
          onClick={handleCall}
          className="flex-1 flex items-center justify-center gap-1.5 h-11 rounded-[14px] bg-[color:var(--surface)] border border-[color:var(--border)] text-[color:var(--accent)] font-semibold text-[15px] shadow-[var(--shadow-card)] tap"
        >
          <Phone size={17} strokeWidth={2} />
          Call
        </button>
        <button
          onClick={handleWhatsApp}
          className="flex-1 flex items-center justify-center gap-1.5 h-11 rounded-[14px] bg-[#25d366] text-white font-semibold text-[15px] shadow-[var(--shadow-card)] tap"
        >
          <MessageCircle size={17} strokeWidth={2} />
          WhatsApp
        </button>
      </section>

      {/* Transactions */}
      <main className="no-print flex-1 pb-28">
        {txs.length === 0 ? (
          <EmptyState
            icon={<Receipt size={28} />}
            title="No transactions"
            description="Tap the + button to add a new transaction."
          />
        ) : (
          <div className="mx-3 overflow-hidden rounded-[16px] border border-[color:var(--border)] bg-[color:var(--surface)] shadow-[var(--shadow-card)] animate-fade-up">
            <div className="max-h-[calc(100dvh-372px)] overflow-auto">
              <table className="w-full border-collapse text-[13px]">
                <thead className="sticky top-0 z-[5] bg-[color:var(--surface-2)]">
                  <tr>
                    <th className="border-b border-[color:var(--border)] px-2 py-2.5 text-left font-semibold text-[color:var(--muted-foreground)]">#</th>
                    <th className="border-b border-[color:var(--border)] px-2 py-2.5 text-right font-semibold text-[color:var(--muted-foreground)]">Price</th>
                    <th className="border-b border-[color:var(--border)] px-2 py-2.5 text-left font-semibold text-[color:var(--muted-foreground)]">Item</th>
                    <th className="border-b border-[color:var(--border)] px-2 py-2.5 text-left font-semibold text-[color:var(--muted-foreground)]">Date</th>
                    <th className="border-b border-[color:var(--border)] px-2 py-2.5 text-left font-semibold text-[color:var(--muted-foreground)]">Day</th>
                  </tr>
                </thead>
                <tbody>
                  {txs.map((t, i) => (
                    <tr
                      key={t.id}
                      className={`${i % 2 === 1 ? "bg-[color:var(--surface-2)]" : ""} transition-colors active:bg-[color:var(--muted)]`}
                      onMouseDown={() => startPress(t)}
                      onMouseUp={() => endPress(t)}
                      onMouseLeave={cancelPress}
                      onTouchStart={() => startPress(t)}
                      onTouchEnd={() => endPress(t)}
                      onTouchCancel={cancelPress}
                      style={{ WebkitUserSelect: "none", userSelect: "none" }}
                    >
                      <td className="border-b border-[color:var(--border)] px-2 py-3 text-[color:var(--muted-foreground)]">{t.serial}</td>
                      <td className="border-b border-[color:var(--border)] px-2 py-3 text-right font-semibold tabular-nums whitespace-nowrap">{formatINR(t.price)}</td>
                      <td className="border-b border-[color:var(--border)] px-2 py-3 max-w-[130px] truncate">{t.item}</td>
                      <td className="border-b border-[color:var(--border)] px-2 py-3 whitespace-nowrap text-[color:var(--muted-foreground)]">{t.date}</td>
                      <td className="border-b border-[color:var(--border)] px-2 py-3 whitespace-nowrap text-[color:var(--muted-foreground)]">{dayFromDDMMYYYY(t.date)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-[color:var(--surface-2)] font-semibold">
                    <td className="px-2 py-2.5"></td>
                    <td className="px-2 py-2.5 text-right tabular-nums whitespace-nowrap">{formatINR(total)}</td>
                    <td className="px-2 py-2.5 text-[color:var(--muted-foreground)]" colSpan={3}>Total</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="px-3 py-2 text-center text-[11px] text-[color:var(--muted-foreground)]">
              Tap a row to edit · Long press to delete
            </div>
          </div>
        )}
      </main>

      {/* FAB */}
      <button
        onClick={() => setShowAdd(true)}
        aria-label="Add transaction"
        className="no-print fixed bottom-6 grid h-14 w-14 place-items-center rounded-full bg-[color:var(--accent)] text-white shadow-[var(--shadow-fab)] transition active:scale-95"
        style={{ right: "max(1rem, calc(50vw - 240px + 1rem))" }}
      >
        <Plus size={26} strokeWidth={2.5} />
      </button>

      {/* ── Sheets ────────────────────────────────────────────────────────── */}

      {/* Add transaction */}
      <Sheet open={showAdd} title="New Transaction" onClose={() => setShowAdd(false)}>
        <label className="mb-1 block px-1 text-[12px] font-medium uppercase tracking-wider text-[color:var(--muted-foreground)]">
          Item Name
        </label>
        <input
          autoFocus
          value={item}
          onChange={(e) => setItem(e.target.value)}
          placeholder="e.g. Rice"
          className="mb-3 h-14 w-full rounded-[14px] border border-[color:var(--border)] bg-[color:var(--surface-2)] px-4 text-[17px] outline-none focus:border-[color:var(--accent)]"
        />
        <label className="mb-1 block px-1 text-[12px] font-medium uppercase tracking-wider text-[color:var(--muted-foreground)]">
          Price (₹)
        </label>
        <input
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          inputMode="decimal"
          pattern="[0-9]*"
          placeholder="0"
          onKeyDown={(e) => e.key === "Enter" && saveNew()}
          className="h-14 w-full rounded-[14px] border border-[color:var(--border)] bg-[color:var(--surface-2)] px-4 text-[17px] tabular-nums outline-none focus:border-[color:var(--accent)]"
        />
        <SheetButtons onCancel={() => setShowAdd(false)} onConfirm={saveNew} confirmLabel="Save Transaction" />
      </Sheet>

      {/* Edit transaction */}
      {editTx && (
        <Sheet open title="Edit Transaction" onClose={() => setEditTx(null)}>
          <label className="mb-1 block px-1 text-[12px] font-medium uppercase tracking-wider text-[color:var(--muted-foreground)]">
            Item Name
          </label>
          <input
            value={editTx.item}
            onChange={(e) => setEditTx({ ...editTx, item: e.target.value })}
            className="mb-3 h-14 w-full rounded-[14px] border border-[color:var(--border)] bg-[color:var(--surface-2)] px-4 text-[17px] outline-none focus:border-[color:var(--accent)]"
          />
          <label className="mb-1 block px-1 text-[12px] font-medium uppercase tracking-wider text-[color:var(--muted-foreground)]">
            Price (₹)
          </label>
          <input
            value={String(editTx.price)}
            inputMode="decimal"
            onChange={(e) => setEditTx({ ...editTx, price: parseFloat(e.target.value) || 0 })}
            className="mb-3 h-14 w-full rounded-[14px] border border-[color:var(--border)] bg-[color:var(--surface-2)] px-4 text-[17px] tabular-nums outline-none focus:border-[color:var(--accent)]"
          />
          <label className="mb-1 block px-1 text-[12px] font-medium uppercase tracking-wider text-[color:var(--muted-foreground)]">
            Date (DD/MM/YYYY)
          </label>
          <input
            value={editTx.date}
            onChange={(e) => setEditTx({ ...editTx, date: e.target.value })}
            placeholder="DD/MM/YYYY"
            className="h-14 w-full rounded-[14px] border border-[color:var(--border)] bg-[color:var(--surface-2)] px-4 text-[17px] outline-none focus:border-[color:var(--accent)]"
          />
          <div className="mt-2 px-1 text-[12px] text-[color:var(--muted-foreground)]">
            Day: {dayFromDDMMYYYY(editTx.date) || "—"}
          </div>
          <SheetButtons onCancel={() => setEditTx(null)} onConfirm={saveEdit} confirmLabel="Save Changes" />
        </Sheet>
      )}

      {/* Delete transaction */}
      {deleteTx && (
        <Sheet open title="Delete Transaction?" onClose={() => setDeleteTx(null)}>
          <div className="rounded-[14px] bg-[color:var(--surface-2)] px-4 py-4 text-center">
            <div className="text-[15px] font-semibold">{deleteTx.item}</div>
            <div className="mt-1 text-[13px] text-[color:var(--muted-foreground)]">
              {formatINR(deleteTx.price)} · {deleteTx.date}
            </div>
          </div>
          <SheetButtons
            onCancel={() => setDeleteTx(null)}
            onConfirm={confirmDelete}
            confirmLabel="Delete"
            danger
          />
        </Sheet>
      )}

      {/* Delete customer */}
      {confirmDeleteCustomer && (
        <Sheet open title="Delete Customer?" onClose={() => setConfirmDeleteCustomer(false)}>
          <div className="text-center text-[14px] text-[color:var(--muted-foreground)]">
            This will remove{" "}
            <span className="font-semibold text-[color:var(--foreground)]">{customer.name}</span>{" "}
            and all their transactions. This action cannot be undone.
          </div>
          <SheetButtons
            onCancel={() => setConfirmDeleteCustomer(false)}
            onConfirm={deleteCustomer}
            confirmLabel="Delete Customer"
            danger
          />
        </Sheet>
      )}

      {/* Edit customer */}
      {showEditCustomer && (
        <Sheet open title="Edit Customer" onClose={() => setShowEditCustomer(false)}>
          <label className="mb-1 block px-1 text-[12px] font-medium uppercase tracking-wider text-[color:var(--muted-foreground)]">
            Name
          </label>
          <input
            autoFocus
            value={editCustName}
            onChange={(e) => setEditCustName(e.target.value)}
            placeholder="Customer name"
            className="h-14 w-full rounded-[14px] border border-[color:var(--border)] bg-[color:var(--surface-2)] px-4 text-[17px] outline-none focus:border-[color:var(--accent)]"
          />

          <label className="mt-3 mb-1 block px-1 text-[12px] font-medium uppercase tracking-wider text-[color:var(--muted-foreground)]">
            Mobile Number <span className="normal-case font-normal">(Optional)</span>
          </label>
          <input
            type="tel"
            inputMode="numeric"
            value={editCustMobile}
            onChange={(e) => setEditCustMobile(e.target.value.replace(/\D/g, "").slice(0, 15))}
            placeholder="10–15 digits"
            className={`h-14 w-full rounded-[14px] border bg-[color:var(--surface-2)] px-4 text-[17px] outline-none ${
              editMobileErr
                ? "border-[color:var(--danger)] focus:border-[color:var(--danger)]"
                : "border-[color:var(--border)] focus:border-[color:var(--accent)]"
            }`}
          />
          {editMobileErr && (
            <div className="mt-1 px-1 text-[13px] text-[color:var(--danger)]">{editMobileErr}</div>
          )}

          <label className="mt-3 mb-1 block px-1 text-[12px] font-medium uppercase tracking-wider text-[color:var(--muted-foreground)]">
            WhatsApp Number <span className="normal-case font-normal">(Optional)</span>
          </label>
          <input
            type="tel"
            inputMode="numeric"
            value={editCustWhatsapp}
            onChange={(e) => setEditCustWhatsapp(e.target.value.replace(/\D/g, "").slice(0, 15))}
            placeholder="10–15 digits"
            className={`h-14 w-full rounded-[14px] border bg-[color:var(--surface-2)] px-4 text-[17px] outline-none ${
              editWaErr
                ? "border-[color:var(--danger)] focus:border-[color:var(--danger)]"
                : "border-[color:var(--border)] focus:border-[color:var(--accent)]"
            }`}
          />
          {editWaErr && (
            <div className="mt-1 px-1 text-[13px] text-[color:var(--danger)]">{editWaErr}</div>
          )}

          <div className={canSaveEdit ? "" : "pointer-events-none opacity-50"}>
            <SheetButtons
              onCancel={() => setShowEditCustomer(false)}
              onConfirm={saveEditCustomer}
              confirmLabel="Save Changes"
            />
          </div>
        </Sheet>
      )}

      {/* Toast */}
      {toast && (
        <div className="no-print fixed inset-x-0 bottom-6 z-50 flex justify-center px-6 pointer-events-none">
          <div className="rounded-full bg-black/85 px-4 py-2 text-[13px] font-medium text-white shadow-lg animate-fade-up">
            {toast}
          </div>
        </div>
      )}

      {/* Print area */}
      <div className="print-area p-8 text-black">
        <h1 className="mb-1 text-2xl font-bold">Bharti Udhari — {customer.name}</h1>
        <div className="mb-4 text-sm">Printed: {new Date().toLocaleDateString("en-IN")}</div>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="border border-black px-2 py-1 text-left">#</th>
              <th className="border border-black px-2 py-1 text-left">Item</th>
              <th className="border border-black px-2 py-1 text-right">Price</th>
              <th className="border border-black px-2 py-1 text-left">Date</th>
              <th className="border border-black px-2 py-1 text-left">Day</th>
            </tr>
          </thead>
          <tbody>
            {txs.map((t) => (
              <tr key={t.id}>
                <td className="border border-black px-2 py-1">{t.serial}</td>
                <td className="border border-black px-2 py-1">{t.item}</td>
                <td className="border border-black px-2 py-1 text-right">{formatINR(t.price)}</td>
                <td className="border border-black px-2 py-1">{t.date}</td>
                <td className="border border-black px-2 py-1">{dayFromDDMMYYYY(t.date)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="border border-black px-2 py-1 font-bold" colSpan={2}>Total</td>
              <td className="border border-black px-2 py-1 text-right font-bold">{formatINR(total)}</td>
              <td className="border border-black px-2 py-1" colSpan={2}></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

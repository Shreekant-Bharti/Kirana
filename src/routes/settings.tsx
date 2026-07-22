import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import {
  User, Database, FileDown, FileUp, FileJson, FileSpreadsheet, HardDrive,
  Fingerprint, Lock, Clock, Sun, Moon, SunMoon, Info, Shield, FileText,
  Trash2, Printer, Sparkles, FolderOpen, Cloud, RefreshCw, CheckCircle2, CloudUpload,
  MessageCircle, Store, QrCode, Link as LinkIcon, LogOut, CloudDownload,
  Wifi, WifiOff, CircleDot,
} from "lucide-react";
import { loadDemoData } from "../lib/seed";
import { db } from "../lib/db";
import { TopBar } from "../components/TopBar";
import { Group, Row } from "../components/IosGroup";
import { Sheet, SheetButtons } from "../components/Sheet";
import { useTheme, type ThemeMode } from "../lib/theme";
import { getPrintSize, setPrintSize, type PrintSize } from "../lib/printSettings";
import {
  exportJSON, importJSON, exportCustomersCSV, exportTransactionsCSV,
  importCustomersCSV, importTransactionsCSV, downloadBlob, pickFile,
  clearAll, storageEstimate,
} from "../lib/importExport";
import {
  backupNow, getLastBackupTime, getSavedDirectoryHandle,
  pickBackupDirectory, clearBackupDirectory, isFileSystemAccessSupported,
} from "../lib/backup/backupManager";
import { restoreFromDirectory } from "../lib/backup/restoreManager";
import {
  getShopName, setShopName as saveShopName,
  getIncludeShopName, setIncludeShopName as saveIncludeShopName,
} from "../lib/communicationSettings";
import { useAuth } from "../lib/authContext";
import { requestDrivePermission, signOut } from "../lib/googleAuth";
import { getLastDriveBackup, clearDriveMeta } from "../lib/driveBackup";
import { fullSync } from "../lib/sync/syncEngine";
import { useSyncStatus } from "../lib/sync/syncStatus";
import { clearQueue } from "../lib/sync/syncQueue";

const APP_VERSION = "1.0.0";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

function formatTime(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  const date = d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  return `${isToday ? "Today" : date} · ${time}`;
}

function SettingsPage() {
  const navigate = useNavigate();
  const { mode, setMode } = useTheme();
  const { session, setSession } = useAuth();
  const [size, setSizeState] = useState<PrintSize>("a4");
  const [storage, setStorage] = useState<{ usedMB: number; quotaMB: number } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const [backupFolderName, setBackupFolderName] = useState<string | null>(null);
  // Account / Drive
  const [driveBusy, setDriveBusy] = useState(false);
  const [lastDriveBackup, setLastDriveBackupState] = useState<string | null>(null);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [confirmClearData, setConfirmClearData] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);
  // communication
  const [shopName, setShopNameState] = useState("Bharti Udhari");
  const [includeShopName, setIncludeShopNameState] = useState(true);
  const [showShopNameEdit, setShowShopNameEdit] = useState(false);
  const [shopNameInput, setShopNameInput] = useState("");
  const syncStatus = useSyncStatus();

  const fsaSupported = isFileSystemAccessSupported();
  const customerCount = useLiveQuery(() => db.customers.count(), []) ?? 0;
  const txCount = useLiveQuery(() => db.transactions.count(), []) ?? 0;

  useEffect(() => {
    setSizeState(getPrintSize());
    storageEstimate().then(setStorage);
    getLastBackupTime().then(setLastBackup);
    getSavedDirectoryHandle().then((h) => setBackupFolderName(h?.name ?? null));
    setShopNameState(getShopName());
    setIncludeShopNameState(getIncludeShopName());
    setLastDriveBackupState(getLastDriveBackup());
  }, []);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
  }

  // ── Drive sync ────────────────────────────────────────────────────────────────────
  async function doSyncNow() {
    setDriveBusy(true);
    try {
      await requestDrivePermission("Google Drive permission is required for cloud sync.");
      const r = await fullSync();
      setLastDriveBackupState(new Date().toISOString());
      flash(`Sync Complete · ${r.updated} updated, ${r.unchanged} unchanged`);
    } catch (e) {
      flash(e instanceof Error ? e.message : "Sync failed");
    } finally { setDriveBusy(false); }
  }

  // ── Logout ──────────────────────────────────────────────────────────────────
  function doLogout() {
    setConfirmLogout(false);
    signOut();
    setSession(null);
    // Show "remove data?" next
    setConfirmClearData(true);
  }

  async function doLogoutClearData() {
    setConfirmClearData(false);
    await clearAll();
    clearDriveMeta();
    await clearQueue();
    navigate({ to: "/login", replace: true });
  }

  function doLogoutKeepData() {
    setConfirmClearData(false);
    navigate({ to: "/login", replace: true });
  }

  async function doBackupNow() {
    setBackupBusy(true);
    setLastResult(null);
    try {
      const res = await backupNow({ theme: mode, printSize: size });
      setLastBackup(res.lastBackup);
      setLastResult(
        `Updated ${res.updated}, unchanged ${res.unchanged}${res.removed ? `, removed ${res.removed}` : ""}.`,
      );
      const h = await getSavedDirectoryHandle();
      setBackupFolderName(h?.name ?? null);
      flash("Backup Completed Successfully");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Backup failed";
      if (!/aborted|cancel/i.test(msg)) flash(msg);
    } finally {
      setBackupBusy(false);
    }
  }

  async function doPickFolder() {
    try {
      const h = await pickBackupDirectory();
      setBackupFolderName(h.name);
      flash("Backup folder set");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to set folder";
      if (!/aborted|cancel/i.test(msg)) flash(msg);
    }
  }

  async function doRestore() {
    setConfirmRestore(false);
    setRestoreBusy(true);
    try {
      const res = await restoreFromDirectory();
      setLastBackup(await getLastBackupTime());
      flash(`Restore Completed · ${res.customers} customers, ${res.transactions} txns`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Restore failed";
      if (!/aborted|cancel/i.test(msg)) flash(msg);
    } finally {
      setRestoreBusy(false);
    }
  }

  async function doForgetFolder() {
    await clearBackupDirectory();
    setBackupFolderName(null);
    setLastResult(null);
    flash("Backup folder cleared");
  }

  async function doExportJSON() {
    const data = await exportJSON();
    downloadBlob(`bharti-udhari-${Date.now()}.json`, JSON.stringify(data, null, 2), "application/json");
    flash("JSON downloaded");
  }
  async function doImportJSON() {
    const file = await pickFile("application/json,.json");
    if (!file) return;
    const text = await file.text();
    await importJSON(JSON.parse(text));
    flash("JSON imported");
  }
  async function doExportCustomersCSV() {
    downloadBlob("customers.csv", await exportCustomersCSV(), "text/csv");
    flash("customers.csv downloaded");
  }
  async function doExportTxCSV() {
    downloadBlob("transactions.csv", await exportTransactionsCSV(), "text/csv");
    flash("transactions.csv downloaded");
  }
  async function doImportCustomersCSV() {
    const f = await pickFile(".csv,text/csv");
    if (!f) return;
    await importCustomersCSV(await f.text());
    flash("Customers imported");
  }
  async function doImportTxCSV() {
    const f = await pickFile(".csv,text/csv");
    if (!f) return;
    await importTransactionsCSV(await f.text());
    flash("Transactions imported");
  }
  async function doClear() {
    await clearAll();
    setConfirmClear(false);
    flash("All data cleared");
  }

  const ThemeIcon = mode === "light" ? Sun : mode === "dark" ? Moon : SunMoon;

  return (
    <div className="app-frame flex flex-col">
      <TopBar title="Settings" showBack />
      <main className="flex-1 pb-16">

        {/* ── Account ─────────────────────────────────────────── */}
        {session && (
          <Group title="Account">
            {/* Profile card */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-[color:var(--border)]">
              <img
                src={session.picture}
                alt={session.name}
                className="h-12 w-12 rounded-full object-cover ring-2 ring-[color:var(--border)] shrink-0"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
              <div className="min-w-0">
                <div className="font-semibold text-[15px] text-[color:var(--foreground)] truncate">
                  {session.name}
                </div>
                <div className="text-[13px] text-[color:var(--muted-foreground)] truncate">
                  {session.email}
                </div>
              </div>
            </div>
            {/* Sync status */}
            <Row
              icon={
                syncStatus.state === "syncing" ? <RefreshCw size={16} className="animate-spin" /> :
                syncStatus.state === "offline" ? <WifiOff size={16} /> :
                syncStatus.state === "synced" ? <CheckCircle2 size={16} /> :
                syncStatus.state === "error" ? <CircleDot size={16} /> :
                <Cloud size={16} />
              }
              iconBg={
                syncStatus.state === "synced" ? "#34c759" :
                syncStatus.state === "pending" ? "#ff9500" :
                syncStatus.state === "syncing" ? "#007aff" :
                syncStatus.state === "offline" ? "#ff3b30" :
                syncStatus.state === "error" ? "#ff3b30" : "#8e8e93"
              }
              label="Sync Status"
              value={
                syncStatus.state === "synced" ? "All synced" :
                syncStatus.state === "pending" ? `${syncStatus.pendingCount} pending` :
                syncStatus.state === "syncing" ? "Syncing…" :
                syncStatus.state === "offline" ? "Offline" :
                syncStatus.state === "error" ? (syncStatus.error ?? "Error") : "—"
              }
            />
            <Row
              icon={driveBusy ? <RefreshCw size={16} className="animate-spin" /> : <CloudUpload size={16} />}
              iconBg="#007aff"
              label={driveBusy ? "Syncing…" : "Sync Now"}
              onClick={!driveBusy ? doSyncNow : undefined}
            />
            <Row
              icon={<CheckCircle2 size={16} />}
              iconBg={lastDriveBackup ? "#34c759" : "#8e8e93"}
              label="Last Sync"
              value={lastDriveBackup ? formatTime(lastDriveBackup) : "Never"}
            />
            <Row
              icon={<LogOut size={16} />}
              iconBg="#ff3b30"
              label="Logout"
              danger
              onClick={() => setConfirmLogout(true)}
            />
          </Group>
        )}

        {/* General */}
        <Group title="General">
          <Row icon={<Info size={16} />} iconBg="#8e8e93" label="App Version" value={APP_VERSION} />
          <Row icon={<HardDrive size={16} />} iconBg="#5856d6" label="Storage Used" value={storage ? `${storage.usedMB} MB` : "—"} />
          <Row icon={<User size={16} />} iconBg="#34c759" label="Total Customers" value={customerCount} />

          <Row icon={<Database size={16} />} iconBg="#007aff" label="Total Transactions" value={txCount} />
        </Group>

        {/* Backup & Restore */}
        <Group
          title="Backup & Restore"
          footer={
            fsaSupported
              ? "Incremental backup — only changed customer files are rewritten. Each customer has one permanent file inside Bharti_Udhari_Backup/."
              : "Folder backups need Chrome, Edge, or another Chromium browser. Use JSON export below as a fallback."
          }
        >
          <Row
            icon={<CheckCircle2 size={16} />}
            iconBg={lastBackup ? "#34c759" : "#8e8e93"}
            label="Last Backup"
            value={lastBackup ? formatTime(lastBackup) : "Never"}
          />
          <Row
            icon={<FolderOpen size={16} />}
            iconBg="#ff9500"
            label="Backup Folder"
            value={backupFolderName ?? "Not selected"}
            onClick={fsaSupported ? doPickFolder : undefined}
          />
          <Row
            icon={backupBusy ? <RefreshCw size={16} className="animate-spin" /> : <CloudUpload size={16} />}
            iconBg="#007aff"
            label={backupBusy ? "Backing up…" : "Backup Now"}
            onClick={fsaSupported && !backupBusy ? doBackupNow : undefined}
          />
          <Row
            icon={restoreBusy ? <RefreshCw size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            iconBg="#5856d6"
            label={restoreBusy ? "Restoring…" : "Restore Backup"}
            onClick={fsaSupported && !restoreBusy ? () => setConfirmRestore(true) : undefined}
          />
          {backupFolderName && (
            <Row
              icon={<Trash2 size={16} />}
              iconBg="#8e8e93"
              label="Forget Backup Folder"
              onClick={doForgetFolder}
            />
          )}
          {lastResult && (
            <Row
              icon={<Info size={16} />}
              iconBg="#34c759"
              label="Backup Status"
              value={lastResult}
            />
          )}
          <Row icon={<Cloud size={16} />} iconBg="#0a84ff" label="Google Drive Sync" value="Automatic" />
          <Row icon={<Clock size={16} />} iconBg="#ff9500" label="Auto Backup" value="Enabled" />
        </Group>

        {/* Data */}
        <Group title="Data Management" footer="CSV is for Excel. JSON is for debugging or advanced users. Primary backup is the folder above.">
          <Row icon={<FileSpreadsheet size={16} />} iconBg="#34c759" label="Export Customers CSV" onClick={doExportCustomersCSV} />
          <Row icon={<FileSpreadsheet size={16} />} iconBg="#34c759" label="Export Transactions CSV" onClick={doExportTxCSV} />
          <Row icon={<FileDown size={16} />} iconBg="#0a84ff" label="Import Customers CSV" onClick={doImportCustomersCSV} />
          <Row icon={<FileDown size={16} />} iconBg="#0a84ff" label="Import Transactions CSV" onClick={doImportTxCSV} />
          <Row icon={<FileJson size={16} />} iconBg="#ff9500" label="Export JSON" onClick={doExportJSON} />
          <Row icon={<FileUp size={16} />} iconBg="#ff9500" label="Import JSON" onClick={doImportJSON} />
          <Row icon={<Sparkles size={16} />} iconBg="#af52de" label="Load Demo Data" onClick={async () => { const r = await loadDemoData(); flash(`Added ${r.customers} customers, ${r.transactions} txns`); }} />
          <Row icon={<Trash2 size={16} />} iconBg="#ff3b30" label="Clear All Data" danger onClick={() => setConfirmClear(true)} />
        </Group>

        {/* Print */}
        <Group title="Print">
          <PrintSizeRow current={size} onChange={(v) => { setSizeState(v); setPrintSize(v); }} />
        </Group>

        {/* Communication */}
        <Group title="Communication" footer="Shop name appears at the bottom of WhatsApp account summaries sent to customers.">
          <Row
            icon={<MessageCircle size={16} />}
            iconBg="#25d366"
            label="Include Shop Name"
            right={
              <Toggle
                checked={includeShopName}
                onChange={(v) => {
                  setIncludeShopNameState(v);
                  saveIncludeShopName(v);
                }}
              />
            }
          />
          <Row
            icon={<Store size={16} />}
            iconBg="#007aff"
            label="Shop Name"
            value={shopName}
            onClick={() => {
              setShopNameInput(shopName);
              setShowShopNameEdit(true);
            }}
          />
          <Row icon={<QrCode size={16} />} iconBg="#8e8e93" label="Include QR Code" right={<SoonBadge />} />
          <Row icon={<LinkIcon size={16} />} iconBg="#8e8e93" label="Include Payment Link" right={<SoonBadge />} />
        </Group>

        {/* Security */}
        <Group title="Security" footer="Fingerprint and PIN unlock will be available in a future update.">
          <Row icon={<Fingerprint size={16} />} iconBg="#5856d6" label="Fingerprint" right={<SoonBadge />} />
          <Row icon={<Lock size={16} />} iconBg="#8e8e93" label="PIN Lock" right={<SoonBadge />} />
          <Row icon={<Clock size={16} />} iconBg="#ff9500" label="Auto Lock" right={<SoonBadge />} />
        </Group>

        {/* Appearance */}
        <Group title="Appearance">
          <ThemeRow mode={mode} setMode={setMode} />
        </Group>

        {/* About */}
        <Group title="About">
          <Row icon={<Info size={16} />} iconBg="#8e8e93" label="Application" value="Bharti Udhari" />
          <Row icon={<FileText size={16} />} iconBg="#8e8e93" label="Version" value={APP_VERSION} />
          <Row icon={<User size={16} />} iconBg="#8e8e93" label="Developer" value="Bharti" />
          <Row icon={<Shield size={16} />} iconBg="#34c759" label="Privacy" value="100% Offline" />
          <Row icon={<FileText size={16} />} iconBg="#8e8e93" label="Licenses" value="MIT" />
        </Group>

        <div className="mt-2 mb-8 flex flex-col items-center gap-1 text-[12px] text-[color:var(--muted-foreground)]">
          <ThemeIcon size={16} />
          <span>Bharti Udhari · v{APP_VERSION}</span>
          <span>Works offline. No account. No cloud.</span>
        </div>
      </main>

      {confirmClear && (
        <Sheet open title="Clear All Data?" onClose={() => setConfirmClear(false)}>
          <div className="text-center text-[14px] text-[color:var(--muted-foreground)]">
            This will permanently delete all customers and transactions from this device. Consider backing up first.
          </div>
          <SheetButtons
            onCancel={() => setConfirmClear(false)}
            onConfirm={doClear}
            confirmLabel="Delete Everything"
            danger
          />
        </Sheet>
      )}

      {confirmRestore && (
        <Sheet open title="Restore Backup?" onClose={() => setConfirmRestore(false)}>
          <div className="text-center text-[14px] text-[color:var(--muted-foreground)]">
            This will replace all current data on this device with the contents of the selected Bharti_Udhari_Backup folder.
          </div>
          <SheetButtons
            onCancel={() => setConfirmRestore(false)}
            onConfirm={doRestore}
            confirmLabel="Restore Now"
          />
        </Sheet>
      )}

      {showShopNameEdit && (
        <Sheet open title="Shop Name" onClose={() => setShowShopNameEdit(false)}>
          <label className="mb-1 block px-1 text-[12px] font-medium uppercase tracking-wider text-[color:var(--muted-foreground)]">
            Shop Name
          </label>
          <input
            autoFocus
            value={shopNameInput}
            onChange={(e) => setShopNameInput(e.target.value)}
            placeholder="Bharti Udhari"
            className="h-14 w-full rounded-[14px] border border-[color:var(--border)] bg-[color:var(--surface-2)] px-4 text-[17px] outline-none focus:border-[color:var(--accent)]"
          />
          <SheetButtons
            onCancel={() => setShowShopNameEdit(false)}
            onConfirm={() => {
              const name = shopNameInput.trim() || "Bharti Udhari";
              setShopNameState(name);
              saveShopName(name);
              setShowShopNameEdit(false);
              flash("Shop name saved");
            }}
            confirmLabel="Save"
          />
        </Sheet>
      )}

      {/* Logout confirmation */}
      {confirmLogout && (
        <Sheet open title="Logout" onClose={() => setConfirmLogout(false)}>
          <p className="text-center text-[14px] text-[color:var(--muted-foreground)] leading-relaxed">
            Logout from this device?<br />
            <span className="text-[13px]">You can sign back in anytime.</span>
          </p>
          <SheetButtons
            onCancel={() => setConfirmLogout(false)}
            onConfirm={doLogout}
            confirmLabel="Logout"
            danger
          />
        </Sheet>
      )}

      {/* Remove local data after logout */}
      {confirmClearData && (
        <Sheet open title="Remove Local Data?" onClose={doLogoutKeepData}>
          <p className="text-center text-[14px] text-[color:var(--muted-foreground)] leading-relaxed">
            Remove all local data from this device?<br />
            <span className="text-[13px]">Your Google Drive backup will be kept safe.</span>
          </p>
          <div className="mt-4 flex flex-col gap-2">
            <button
              onClick={doLogoutClearData}
              className="w-full h-12 rounded-[12px] bg-[color:var(--danger)] text-white font-semibold text-[15px] tap"
            >
              Remove Local Data
            </button>
            <button
              onClick={doLogoutKeepData}
              className="w-full h-12 rounded-[12px] bg-[color:var(--surface-2)] border border-[color:var(--border)] text-[color:var(--foreground)] font-semibold text-[15px] tap"
            >
              Keep Local Data
            </button>
          </div>
        </Sheet>
      )}

      {toast && (
        <div className="no-print fixed inset-x-0 bottom-6 z-50 flex justify-center px-6">
          <div className="rounded-full bg-black/85 px-4 py-2 text-[13px] font-medium text-white shadow-lg animate-fade-up">
            {toast}
          </div>
        </div>
      )}
    </div>
  );
}

function SoonBadge() {
  return (
    <span className="rounded-full bg-[color:var(--muted)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--muted-foreground)]">
      Coming Soon
    </span>
  );
}

/** iOS-style toggle switch, matches the app's design language. */
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative flex-shrink-0 h-[28px] w-[50px] rounded-full transition-colors duration-200 ${
        checked ? "bg-[color:var(--accent)]" : "bg-[color:var(--hairline)]"
      }`}
    >
      <span
        className={`absolute top-[3px] h-[22px] w-[22px] rounded-full bg-white shadow-sm transition-transform duration-200 ${
          checked ? "translate-x-[25px]" : "translate-x-[3px]"
        }`}
      />
    </button>
  );
}

function PrintSizeRow({ current, onChange }: { current: PrintSize; onChange: (v: PrintSize) => void }) {
  const opts: { value: PrintSize; label: string }[] = [
    { value: "a4", label: "A4" },
    { value: "thermal58", label: "Thermal 58mm" },
    { value: "thermal80", label: "Thermal 80mm" },
  ];
  return (
    <div className="ios-row flex-col !items-stretch gap-2 py-3">
      <div className="flex items-center gap-2 text-[15px]">
        <span className="grid h-[28px] w-[28px] place-items-center rounded-[7px] bg-[#8e8e93] text-white">
          <Printer size={16} />
        </span>
        <span>Paper Size</span>
      </div>
      <div className="flex gap-2 rounded-[10px] bg-[color:var(--muted)] p-1">
        {opts.map((o) => (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={`flex-1 rounded-[8px] px-2 py-1.5 text-[13px] font-medium transition ${
              current === o.value
                ? "bg-[color:var(--surface)] text-[color:var(--foreground)] shadow-[var(--shadow-card)]"
                : "text-[color:var(--muted-foreground)]"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ThemeRow({ mode, setMode }: { mode: ThemeMode; setMode: (m: ThemeMode) => void }) {
  const opts: { value: ThemeMode; label: string; Icon: typeof Sun }[] = [
    { value: "light", label: "Light", Icon: Sun },
    { value: "dark", label: "Dark", Icon: Moon },
    { value: "system", label: "System", Icon: SunMoon },
  ];
  return (
    <div className="ios-row flex-col !items-stretch gap-2 py-3">
      <div className="flex items-center gap-2 text-[15px]">
        <span className="grid h-[28px] w-[28px] place-items-center rounded-[7px] bg-[#5856d6] text-white">
          <SunMoon size={16} />
        </span>
        <span>Theme</span>
      </div>
      <div className="flex gap-2 rounded-[10px] bg-[color:var(--muted)] p-1">
        {opts.map(({ value, label, Icon }) => (
          <button
            key={value}
            onClick={() => setMode(value)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-[8px] px-2 py-1.5 text-[13px] font-medium transition ${
              mode === value
                ? "bg-[color:var(--surface)] text-[color:var(--foreground)] shadow-[var(--shadow-card)]"
                : "text-[color:var(--muted-foreground)]"
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

export interface BackupManifest {
  appVersion: string;
  backupVersion: string;
  lastBackup: string; // ISO
  totalCustomers: number;
  totalTransactions: number;
  customerFiles: string[]; // e.g. ["customer_000001.json", ...]
}

export interface BackupSettings {
  theme?: string;
  printSize?: string;
  // Reserved for future keys: auth, printer, backup, app
  [key: string]: unknown;
}

export const APP_VERSION = "1.0.0";
export const BACKUP_VERSION = "1";

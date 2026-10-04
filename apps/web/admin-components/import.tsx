"use client";
import { useEffect, useRef, useState } from "react";
import { parseInventoryCsv, type InventoryImportRow } from "./inventory-csv";
import { request } from "./client";
export function InventoryImport({
  onClose,
  onComplete,
}: {
  onClose: () => void;
  onComplete: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    [rows, setRows] = useState<InventoryImportRow[]>([]),
    [errors, setErrors] = useState<string[]>([]),
    [report, setReport] = useState<string[]>([]),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  async function apply() {
    if (
      !window.confirm(
        `Apply ${rows.length} stock adjustments? Each row is committed independently and recorded in the ledger.`,
      )
    )
      return;
    setBusy(true);
    const results: string[] = [];
    for (const row of rows) {
      try {
        await request(`/admin/inventory/${encodeURIComponent(row.id)}/adjust`, {
          method: "POST",
          body: JSON.stringify({
            delta: row.delta,
            reason: row.reason,
            version: row.version,
          }),
        });
        results.push(
          `${row.id}: applied ${row.delta >= 0 ? "+" : ""}${row.delta}`,
        );
      } catch (err) {
        results.push(`${row.id}: rejected — ${(err as Error).message}`);
      }
      setReport([...results]);
    }
    setBusy(false);
    setRows([]);
    onComplete();
  }
  return (
    <dialog
      ref={ref}
      className="admin-dialog"
      aria-labelledby="admin-import-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="admin-dialog-heading">
        <h2 id="admin-import-title">Import stock adjustments</h2>
        <button disabled={busy} aria-label="Close import" onClick={onClose}>
          ×
        </button>
      </div>
      <p className="admin-help">
        Upload a UTF-8 CSV with headers <strong>id,delta,reason,version</strong>
        . Export inventory first to obtain record IDs and current versions.
        Maximum 500 rows / 1 MB. Stale versions are rejected. Each accepted
        adjustment has its own transaction.
      </p>
      <label className="admin-file">
        Adjustment CSV
        <input
          type="file"
          accept=".csv,text/csv"
          disabled={busy}
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            setReport([]);
            if (file.size > 1024 * 1024) {
              setErrors(["File exceeds 1 MB."]);
              setRows([]);
              return;
            }
            const result = parseInventoryCsv(await file.text());
            setRows(result.rows);
            setErrors(result.errors);
          }}
        />
      </label>
      {errors.length > 0 && (
        <div className="admin-error" role="alert">
          <strong>Validation failed. No rows applied.</strong>
          <ul>
            {errors.slice(0, 20).map((error, index) => (
              <li key={index}>{error}</li>
            ))}
          </ul>
        </div>
      )}
      {rows.length > 0 && (
        <div className="admin-notice" role="status">
          {rows.length} rows validated. Ready for confirmation.
        </div>
      )}
      {report.length > 0 && (
        <div role="status">
          <h3>Import report</h3>
          <ul>
            {report.map((line, index) => (
              <li key={index}>{line}</li>
            ))}
          </ul>
        </div>
      )}
      <footer className="admin-import-footer">
        <button disabled={busy} onClick={onClose}>
          Close
        </button>
        <button
          className="admin-primary"
          disabled={busy || !rows.length || errors.length > 0}
          onClick={() => void apply()}
        >
          {busy ? "Applying adjustments…" : "Apply validated adjustments"}
        </button>
      </footer>
    </dialog>
  );
}

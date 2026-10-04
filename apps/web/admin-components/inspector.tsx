"use client";
import { useEffect, useRef, useState } from "react";
import { present, type Row, type Cell, type Section } from "./contracts";
import { request } from "./client";
function Details({ item }: { item: Row }) {
  return (
    <dl className="admin-health">
      {Object.entries(item)
        .filter(([key]) => !["passwordHash", "tokenHash"].includes(key))
        .map(([key, val]) => (
          <div key={key}>
            <dt>{key.replace(/([A-Z])/g, " $1")}</dt>
            <dd>
              {val && typeof val === "object" ? (
                Array.isArray(val) ? (
                  val.length ? (
                    <ol>
                      {val.map((entry, index) => (
                        <li key={index}>
                          {entry && typeof entry === "object" ? (
                            <Details item={entry as Row} />
                          ) : (
                            present(entry as Cell)
                          )}
                        </li>
                      ))}
                    </ol>
                  ) : (
                    "No entries"
                  )
                ) : (
                  <Details item={val as Row} />
                )
              ) : (
                present(val, key)
              )}
            </dd>
          </div>
        ))}
    </dl>
  );
}
export function Inspector({
  row,
  section,
  canAssignRoles,
  onClose,
}: {
  row: Row;
  section: Section;
  canAssignRoles: boolean;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="admin-dialog admin-inspector"
      aria-labelledby="admin-inspector-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="admin-dialog-heading">
        <h2 id="admin-inspector-title">Record detail</h2>
        <button aria-label="Close record" onClick={onClose}>
          ×
        </button>
      </div>
      <Details item={row} />
      {section === "customers" && canAssignRoles && (
        <RoleAssignment row={row} />
      )}
      <button onClick={onClose}>Close</button>
    </dialog>
  );
}

function RoleAssignment({ row }: { row: Row }) {
  const [roles, setRoles] = useState<Row[]>([]),
    [message, setMessage] = useState(""),
    [saving, setSaving] = useState(false);
  useEffect(() => {
    request<{ items: Row[] }>("/admin/roles")
      .then((result) => setRoles(result.items))
      .catch((err) => setMessage(err.message));
  }, []);
  const current = Array.isArray(row.roleIds)
    ? (row.roleIds as string[])
    : Array.isArray(row.roles)
      ? (row.roles as Row[]).map((role) =>
          String(role.roleId ?? (role.role as Row)?.id ?? role.id),
        )
      : [];
  return (
    <section className="admin-variant-editors">
      <h3>Role assignment</h3>
      <p className="admin-help">
        Changing membership alters this account’s permissions and writes an
        audit event. Avoid removing the final administrator.
      </p>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (!window.confirm("Change this account’s role membership?")) return;
          const form = new FormData(event.currentTarget);
          setSaving(true);
          try {
            await request(`/admin/customers/${row.id}/roles`, {
              method: "POST",
              body: JSON.stringify({ roleIds: form.getAll("roleIds") }),
            });
            setMessage(
              "Roles updated. New permissions apply on the next request.",
            );
          } catch (err) {
            setMessage((err as Error).message);
          } finally {
            setSaving(false);
          }
        }}
      >
        {roles.map((role) => (
          <label className="admin-check" key={String(role.id)}>
            <input
              type="checkbox"
              name="roleIds"
              value={String(role.id)}
              defaultChecked={current.includes(String(role.id))}
            />
            {String(role.name)}
          </label>
        ))}
        <button disabled={saving || !roles.length}>
          {saving ? "Saving…" : "Save role membership"}
        </button>
        <p role="status">{message}</p>
      </form>
    </section>
  );
}

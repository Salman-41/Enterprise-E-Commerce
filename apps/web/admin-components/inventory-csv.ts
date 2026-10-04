export type InventoryImportRow = {
  id: string;
  delta: number;
  reason: string;
  version: number;
};
function records(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((v) => v.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  if (quoted) throw new Error("Unclosed quoted field.");
  row.push(cell);
  if (row.some((v) => v.trim())) rows.push(row);
  return rows;
}
export function parseInventoryCsv(text: string): {
  rows: InventoryImportRow[];
  errors: string[];
} {
  const errors: string[] = [],
    result: InventoryImportRow[] = [];
  let all: string[][];
  try {
    all = records(text.replace(/^\uFEFF/, ""));
  } catch (err) {
    return { rows: [], errors: [(err as Error).message] };
  }
  const header = all.shift()?.map((value) => value.trim()) ?? [];
  const required = ["id", "delta", "reason", "version"];
  if (!required.every((key) => header.includes(key)))
    return { rows: [], errors: ["Required headers: id,delta,reason,version."] };
  if (all.length > 500)
    return { rows: [], errors: ["Maximum 500 adjustments per import."] };
  const seen = new Set<string>();
  all.forEach((record, index) => {
    const item = Object.fromEntries(
      header.map((name, n) => [name, record[n]?.trim() ?? ""]),
    );
    const delta = Number(item.delta),
      version = Number(item.version);
    const line = index + 2;
    if (!item.id || !/^[\w-]+$/.test(item.id))
      errors.push(`Row ${line}: invalid record ID.`);
    if (seen.has(item.id))
      errors.push(
        `Row ${line}: duplicate ID; use one adjustment per inventory record.`,
      );
    seen.add(item.id);
    if (
      !item.delta ||
      !Number.isSafeInteger(delta) ||
      Math.abs(delta) > 100000 ||
      delta === 0
    )
      errors.push(
        `Row ${line}: delta must be a nonzero integer between -100000 and 100000.`,
      );
    if (!item.version || !Number.isSafeInteger(version) || version < 1)
      errors.push(`Row ${line}: version must be a positive integer.`);
    if (item.reason.length < 5 || item.reason.length > 1000)
      errors.push(`Row ${line}: reason must contain 5–1000 characters.`);
    result.push({ id: item.id, delta, reason: item.reason, version });
  });
  return { rows: errors.length ? [] : result, errors };
}

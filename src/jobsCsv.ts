import { randomUUID } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";

export type JobRow = Record<string, string>;

export interface JobsTable {
  columns: string[]; // in file order, including columns the user added
  rows: JobRow[];
}

export class CsvLockedError extends Error {
  constructor(public readonly csvPath: string) {
    super(`${csvPath} is open in another program`);
    this.name = "CsvLockedError";
  }
}

export async function readJobs(csvPath: string): Promise<JobsTable> {
  const text = await readFile(csvPath, "utf8");
  const records: string[][] = parse(text, {
    bom: true,
    skip_empty_lines: true,
    relax_column_count: true,
  });
  const [columns = [], ...data] = records;
  const rows = data.map((values) =>
    Object.fromEntries(columns.map((column, i) => [column, values[i] ?? ""])),
  );
  return { columns, rows };
}

// Each write below re-reads the file first, so edits made in Excel since the
// last read are kept, and only the given cells change.

export async function addJobs(csvPath: string, newRows: JobRow[]): Promise<void> {
  const table = await readJobs(csvPath);
  for (const row of newRows) {
    addMissingColumns(table, Object.keys(row));
    table.rows.push(row);
  }
  await writeJobs(csvPath, table);
}

export async function updateJob(csvPath: string, id: string, changes: JobRow): Promise<void> {
  const table = await readJobs(csvPath);
  const row = table.rows.find((r) => r.id === id);
  if (!row) throw new Error(`No job with id ${id} in ${csvPath}`);
  addMissingColumns(table, Object.keys(changes));
  Object.assign(row, changes);
  await writeJobs(csvPath, table);
}

function addMissingColumns(table: JobsTable, names: string[]): void {
  for (const name of names) {
    if (!table.columns.includes(name)) table.columns.push(name);
  }
}

// Writes to a temporary file, then renames it over the CSV, so a crash never
// leaves a half-written tracker.
async function writeJobs(csvPath: string, table: JobsTable): Promise<void> {
  const records = [table.columns, ...table.rows.map((row) => table.columns.map((c) => row[c] ?? ""))];
  const tempPath = `${csvPath}.${randomUUID()}.tmp`;
  await writeFile(tempPath, stringify(records, { bom: true }), "utf8");
  try {
    await rename(tempPath, csvPath);
  } catch (err) {
    await rm(tempPath, { force: true });
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "EBUSY" || code === "EPERM") throw new CsvLockedError(csvPath);
    throw err;
  }
}

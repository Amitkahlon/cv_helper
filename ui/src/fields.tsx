import type { ReactNode } from "react";

// How a field is edited: one line, free text, a list with one item per line,
// or a comma-separated list.
export type FieldKind = "text" | "long" | "lines" | "list";

export interface Field {
  key: string;
  label: string;
  kind?: FieldKind;
  suggestions?: string; // id of a <datalist> to suggest values from (one-line fields)
}

type Item = Record<string, any>;

export function FieldInput({ field, value, onChange }: { field: Field; value: any; onChange: (value: any) => void }) {
  const kind = field.kind ?? "text";
  let input: ReactNode;
  if (kind === "text") {
    input = <input dir="auto" list={field.suggestions} value={value} onChange={(e) => onChange(e.target.value)} />;
  } else if (kind === "long") {
    input = <textarea dir="auto" rows={3} value={value} onChange={(e) => onChange(e.target.value)} />;
  } else if (kind === "lines") {
    // Empty lines are kept while typing; the server drops them on save.
    input = (
      <textarea
        dir="auto"
        rows={Math.max(3, value.length + 1)}
        value={value.join("\n")}
        onChange={(e) => onChange(e.target.value.split("\n"))}
      />
    );
  } else {
    input = <input dir="auto" value={value.join(",")} onChange={(e) => onChange(e.target.value.split(","))} />;
  }
  return (
    <label className="field">
      <span>{field.label}</span>
      {input}
    </label>
  );
}

export function emptyItem(fields: Field[]): Item {
  return Object.fromEntries(
    fields.map((f) => [f.key, f.kind === "lines" || f.kind === "list" ? [] : ""]),
  );
}

export function ObjectEditor({
  fields,
  value,
  onChange,
}: {
  fields: Field[];
  value: Item;
  onChange: (value: Item) => void;
}) {
  return (
    <div className="fields">
      {fields.map((field) => (
        <FieldInput
          key={field.key}
          field={field}
          value={value[field.key]}
          onChange={(v) => onChange({ ...value, [field.key]: v })}
        />
      ))}
    </div>
  );
}

// A list of items (jobs, projects, ...) each edited with the same fields.
export function ListEditor({
  fields,
  items,
  onChange,
  itemLabel,
  extra,
}: {
  fields: Field[];
  items: Item[];
  onChange: (items: Item[]) => void;
  itemLabel: (item: Item) => string;
  extra?: (item: Item, update: (item: Item) => void) => ReactNode;
}) {
  const update = (index: number, item: Item) => onChange(items.map((old, i) => (i === index ? item : old)));
  return (
    <>
      {items.map((item, i) => (
        <fieldset key={i} className="entry">
          <legend dir="auto">{itemLabel(item) || `Item ${i + 1}`}</legend>
          <ObjectEditor fields={fields} value={item} onChange={(v) => update(i, v)} />
          {extra?.(item, (v) => update(i, v))}
          <button onClick={() => onChange(items.filter((_, j) => j !== i))}>Remove</button>
        </fieldset>
      ))}
      <button onClick={() => onChange([...items, emptyItem(fields)])}>Add</button>
    </>
  );
}

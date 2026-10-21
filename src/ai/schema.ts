// Small helpers for writing the JSON Schemas the AI must answer in.
// Every property is required and nothing else is allowed, so answers always
// have the full shape.

export const STRING = { type: "string" };
export const STRINGS = { type: "array", items: STRING };

export function object(properties: Record<string, object>): object {
  return { type: "object", properties, required: Object.keys(properties), additionalProperties: false };
}

export function arrayOf(items: object): object {
  return { type: "array", items };
}

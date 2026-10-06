import type { Schema } from "electron-store";
import type { StoreVersion } from "./store-repository";

export const versionSchema = {
  _schemaVersion: { type: "integer", const: 1 },
  _revision: { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
} satisfies Schema<StoreVersion>;

export const stringSchema = {
  type: "string",
  pattern: "^[^\\u0000]*$",
} as const;
export const timeSchema = { type: "number", minimum: 0 } as const;
export const campaigns = ["WOL", "HOTS", "LOTV", "NCO"] as const;
const metadataSchema = {
  type: "object",
  required: ["name", "description", "version", "author", "type", "localinfo"],
  properties: {
    name: { ...stringSchema, pattern: "\\S" },
    description: stringSchema,
    version: stringSchema,
    author: stringSchema,
    type: stringSchema,
    snid: { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
    localinfo: { type: "object" },
  },
} as const;

export function contentSchema(
  field: "CAMPAIGN_LIST_SET" | "CAMPAIGN_SET" | "CUSTOMIZE_LIST",
) {
  const indexed = Object.fromEntries(
    campaigns.map((campaign) => {
      const item = {
        ...metadataSchema,
        required: [...metadataSchema.required, "campaign"],
        properties: {
          ...metadataSchema.properties,
          campaign: { const: campaign },
        },
      };
      return [
        campaign,
        field === "CAMPAIGN_SET" ? item : { type: "array", items: item },
      ];
    }),
  );
  return {
    ...versionSchema,
    ININTIALIZED: { type: "boolean" },
    LAST_REFRESH_TIME: timeSchema,
    [field]:
      field === "CUSTOMIZE_LIST"
        ? { type: "array", items: metadataSchema }
        : {
            type: "object",
            properties: indexed,
            additionalProperties: false,
            ...(field === "CAMPAIGN_LIST_SET"
              ? { required: [...campaigns] }
              : {}),
          },
  };
}

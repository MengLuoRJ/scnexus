import { join, isAbsolute } from "node:path";
import type { SciiGameSetting } from "@scnexus/app-shared/types/content.type";
import { createRepository, isRecord, invalidData } from "./store-repository";
export function createSciiGameSettingRepository(documents: () => string) {
  return createRepository<SciiGameSetting>({
    defaults: () => ({
      _schemaVersion: 3,
      _revision: 0,
      gameRoot: null,
      customizeDataRoot: null,
      documentRoot: documents(),
      confirmedAt: null,
    }),
    schema: {
      _schemaVersion: { const: 3 },
      _revision: { type: "integer", minimum: 0 },
      gameRoot: { type: ["string", "null"] },
      customizeDataRoot: { type: ["string", "null"] },
      documentRoot: { type: "string" },
      confirmedAt: { type: ["number", "null"] },
    },
    validate(data) {
      if (!isRecord(data)) invalidData("Invalid game setting");
      if (
        data.gameRoot !== null &&
        (typeof data.gameRoot !== "string" || !isAbsolute(data.gameRoot))
      )
        invalidData("Invalid game root");
      if (
        data.customizeDataRoot !==
        (data.gameRoot
          ? join(data.gameRoot as string, "SCNexusCustomizeData")
          : null)
      )
        invalidData("Invalid derived management root");
    },
    migrate(data, defaults) {
      if (!isRecord(data)) invalidData("Invalid old game setting");
      if (data._schemaVersion === 2) {
        const { SCNEXUS_CUTOMIZE_DATA_ROOT, ...fields } = data;
        return {
          ...fields,
          _schemaVersion: defaults._schemaVersion,
          customizeDataRoot: SCNEXUS_CUTOMIZE_DATA_ROOT,
        } as SciiGameSetting;
      }
      const game = isRecord(data.PROFILE_GAME) ? data.PROFILE_GAME : {};
      const root =
        typeof game.GAME_ROOT === "string" && game.GAME_ROOT
          ? game.GAME_ROOT
          : null;
      return {
        ...defaults,
        gameRoot: root,
        customizeDataRoot: root ? join(root, "SCNexusCustomizeData") : null,
      };
    },
  });
}
let documents = "";
export function configureGameDefaults(value: string) {
  documents = value;
}
export const sciiGameSettingRepository = createSciiGameSettingRepository(
  () => documents,
);

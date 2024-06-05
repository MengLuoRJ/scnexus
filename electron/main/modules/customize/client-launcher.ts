import { profileStore } from "@electron/main/stores/profile";
import { execFile, exec } from "child_process";

export function runGameClient(path?: string) {
  // const gameExecutable = profileStore.get("PROFILE_GAME").GAME_EXECUTABLE_X64;
  const gameClient = profileStore.get("PROFILE_GAME").GAME_CLIENT;
  if (!gameClient) return;
  if (path) {
  } else {
    // execFile(gameClient, ["-sso=1 -launch -uid s2"]);
    // exec(`"${gameClient}" -sso=1 -launch -uid s2`);
    exec(`"${gameClient}" -sso=1 -launch -uid s2`);
  }
}

export function runEditorClient(path?: string) {
  const editorClientPath =
    profileStore.get("PROFILE_GAME").GAME_EDITOR_EXECUTABLE_X64;
  if (!editorClientPath) return;
  if (path) {
  } else {
    execFile(editorClientPath);
  }
}

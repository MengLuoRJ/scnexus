import { profileStore } from "@/stores/profile";
import { execFile, exec } from "child_process";
import { GameExecutableParameters } from "@scnexus/app-shared/types/customize/client-launcher.type";

export function runGameClient() {
  const gameClient = profileStore.get("PROFILE_GAME").GAME_CLIENT;
  if (!gameClient) return;
  // execFile(gameClient, ["-sso=1 -launch -uid s2"]);
  // exec(`"${gameClient}" -sso=1 -launch -uid s2`);
  exec(`"${gameClient}" -sso=1 -launch -uid s2`);
}

export function runGameExecutable(parameters?: GameExecutableParameters) {
  const gameExecutable = profileStore.get("PROFILE_GAME").GAME_EXECUTABLE_X64;
  if (!gameExecutable) return;
  if (!parameters?.run) {
    execFile(gameExecutable);
  } else {
    let command = `"${gameExecutable}" -run "${parameters.run}"`;
    if (parameters.testmod) command += ` -testmod "${parameters.testmod}"`;
    if (parameters.displaymode)
      command += ` -displaymode ${parameters.displaymode}`;
    if (parameters.trigdebug) command += ` -trigdebug`;
    if (parameters.preload) command += ` -preload ${parameters.preload}`;
    if (parameters.NoUserCheats) command += ` -NoUserCheats`;
    if (parameters.reloadcheck) command += ` -reloadcheck`;
    if (parameters.meleeMod) command += ` -meleeMod "${parameters.meleeMod}"`;
    if (parameters.difficulty)
      command += ` -difficulty ${parameters.difficulty}`;
    if (parameters.speed) command += ` -speed ${parameters.speed}`;
    exec(command);
  }
}

export function runEditorExecutable(file_path?: string) {
  const editorExecutable =
    profileStore.get("PROFILE_GAME").GAME_EDITOR_EXECUTABLE_X64;
  if (!editorExecutable) return;
  if (!file_path) {
    execFile(editorExecutable);
  } else {
    exec(`"${editorExecutable}" "${file_path}"`);
  }
}

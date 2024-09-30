import { profileStore } from "@/stores/profile";
import { execFile, exec } from "child_process";
import { GameExcutableParameters } from "@scnexus/app-shared/types/customize/client-launcher.type";

export function runGameClient() {
  const gameClient = profileStore.get("PROFILE_GAME").GAME_CLIENT;
  if (!gameClient) return;
  // execFile(gameClient, ["-sso=1 -launch -uid s2"]);
  // exec(`"${gameClient}" -sso=1 -launch -uid s2`);
  exec(`"${gameClient}" -sso=1 -launch -uid s2`);
}

export function runGameExecutable(parameters?: GameExcutableParameters) {
  const gameExecutable = profileStore.get("PROFILE_GAME").GAME_EXECUTABLE_X64;
  if (!gameExecutable) return;
  if (!parameters?.run) {
    execFile(gameExecutable);
  } else {
    const command = `"${gameExecutable}" -run "${parameters.run}"`;
    parameters.testmod && command.concat(` -testmod "${parameters.testmod}"`);
    parameters.displaymode &&
      command.concat(` -displaymode ${parameters.displaymode}`);
    parameters.trigdebug && command.concat(` -trigdebug`);
    parameters.preload && command.concat(` -preload ${parameters.preload}`);
    parameters.NoUserCheats && command.concat(` -NoUserCheats`);
    parameters.reloadcheck && command.concat(` -reloadcheck`);
    parameters.meleeMod &&
      command.concat(` -meleeMod "${parameters.meleeMod}"`);
    parameters.difficulty &&
      command.concat(` -difficulty ${parameters.difficulty}`);
    parameters.speed && command.concat(` -speed ${parameters.speed}`);
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

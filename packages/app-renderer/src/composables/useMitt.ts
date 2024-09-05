import { tryOnScopeDispose } from "@vueuse/core";
import mitt from "mitt";

const emitter = mitt();

function emitterOn(type: string | symbol, handler: (evt?: any) => void) {
  emitter.on(type, handler);
}

function emitterOff(type: string | symbol, handler: (evt?: any) => void) {
  emitter.off(type, handler);
}

export function emitterEmit(type: string | symbol, evt?: any) {
  emitter.emit(type, evt);
}

export function useEmitter(
  type: string | symbol,
  handler: (evt?: any) => void
) {
  tryOnScopeDispose(() => {
    emitterOff(type, handler);
  });
  emitterOn(type, handler);
}

import mitt from "mitt";

const emitter = mitt();

export function emiiterOn(type: string | symbol, handler: (evt?: any) => void) {
  emitter.on(type, handler);
}

export function emiiterOff(
  type: string | symbol,
  handler: (evt?: any) => void
) {
  emitter.off(type, handler);
}

export function emiiterEmit(type: string | symbol, evt?: any) {
  emitter.emit(type, evt);
}

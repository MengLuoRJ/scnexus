// Polyfill Symbol.dispose for Node versions / TS targets without it (TS <5.2 / Node <20).
// This keeps `using` blocks working with newer toolchains while compiling cleanly under ES2022.
export const kDispose: symbol = (Symbol as any).dispose ?? Symbol.for('nodejs.dispose');
if (!(Symbol as any).dispose) {
  (Symbol as any).dispose = kDispose;
}

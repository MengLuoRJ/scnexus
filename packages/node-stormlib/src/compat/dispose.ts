// Polyfill Symbol.dispose for Node versions / TS targets without it (TS <5.2 / Node <20).
// This keeps `using` blocks working with newer toolchains while compiling cleanly under ES2022.
const symbolWithDispose = Symbol as { dispose?: symbol }
export const kDispose: symbol = symbolWithDispose.dispose ?? Symbol.for('nodejs.dispose')
if (!symbolWithDispose.dispose) {
  symbolWithDispose.dispose = kDispose
}

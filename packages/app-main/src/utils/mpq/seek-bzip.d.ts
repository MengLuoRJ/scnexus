declare module 'seek-bzip' {
  const bunzip: {
    decode(input: Uint8Array, output: { writeByte(value: number): void }): void
  }
  export default bunzip
}

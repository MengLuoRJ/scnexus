export const MPQ_HASH = {
  TABLE_INDEX: 0x000,
  NAME_A: 0x100,
  NAME_B: 0x200,
  FILE_KEY: 0x300,
  KEY2_MIX: 0x400,
} as const;

export const MPQ_TABLE_KEYS = {
  HASH_TABLE: 0xc3af3770,
  BLOCK_TABLE: 0xec83b3a3,
} as const;

export const MPQ_HASH_ENTRY_DELETED = 0xfffffffe;
export const MPQ_HASH_ENTRY_FREE = 0xffffffff;

const cryptTable = createCryptTable();

export function hashString(value: string, hashType: number): number {
  let seed1 = 0x7fed7fed;
  let seed2 = 0xeeeeeeee;

  for (let index = 0; index < value.length; index += 1) {
    const character = normalizeCharacter(value.charCodeAt(index) & 0xff);
    seed1 =
      (cryptTable[hashType + character] ^ ((seed1 + seed2) >>> 0)) >>> 0;
    seed2 =
      (character + seed1 + seed2 + ((seed2 << 5) >>> 0) + 3) >>> 0;
  }

  return seed1;
}

export function decryptBlock(data: Buffer, key: number): Buffer {
  return transformBlock(data, key, false);
}

export function encryptBlock(data: Buffer, key: number): Buffer {
  return transformBlock(data, key, true);
}

export function calculateFileKey(
  path: string,
  fileOffset: bigint,
  fileSize: number,
  fixKey: boolean,
): number {
  const plainName = path.replaceAll("/", "\\").split("\\").at(-1) ?? path;
  let key = hashString(plainName, MPQ_HASH.FILE_KEY);
  if (fixKey) key = ((key + Number(fileOffset & 0xffffffffn)) ^ fileSize) >>> 0;
  return key;
}

export function normalizeMpqPath(path: string): string {
  return path.replaceAll("/", "\\");
}

function createCryptTable(): Uint32Array {
  const table = new Uint32Array(0x500);
  let seed = 0x00100001;

  for (let first = 0; first < 0x100; first += 1) {
    let second = first;
    for (let index = 0; index < 5; index += 1, second += 0x100) {
      seed = (seed * 125 + 3) % 0x2aaaab;
      const high = (seed & 0xffff) << 16;
      seed = (seed * 125 + 3) % 0x2aaaab;
      table[second] = (high | (seed & 0xffff)) >>> 0;
    }
  }

  return table;
}

function transformBlock(data: Buffer, initialKey: number, encrypt: boolean) {
  const result = Buffer.from(data);
  let key = initialKey >>> 0;
  let seed = 0xeeeeeeee;

  for (let offset = 0; offset + 4 <= result.length; offset += 4) {
    seed = (seed + cryptTable[MPQ_HASH.KEY2_MIX + (key & 0xff)]) >>> 0;
    const input = result.readUInt32LE(offset);
    const output = (input ^ ((key + seed) >>> 0)) >>> 0;
    result.writeUInt32LE(output, offset);
    key = ((((~key << 21) >>> 0) + 0x11111111) | (key >>> 11)) >>> 0;
    const plain = encrypt ? input : output;
    seed = (plain + seed + ((seed << 5) >>> 0) + 3) >>> 0;
  }

  return result;
}

function normalizeCharacter(character: number): number {
  if (character === 0x2f) return 0x5c;
  if (character >= 0x61 && character <= 0x7a) return character - 0x20;
  return character;
}
import * as _AdmZip from "adm-zip";

export type AdmZip = _AdmZip;
export type IZipEntry = _AdmZip.IZipEntry;
export function getZip(path: string) {
  return new _AdmZip.default(path);
}

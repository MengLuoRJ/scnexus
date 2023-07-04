import AdmZip from 'adm-zip';

export function getZip(path: string) {
  return new AdmZip(path);
}
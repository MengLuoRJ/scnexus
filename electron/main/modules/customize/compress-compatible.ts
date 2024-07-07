import { profileStore } from "@electron/main/stores/profile";
import { szExtract, szExtractFull } from "@electron/main/utils/7zip";
import { mkdirIfNotExist, rmIfExist } from "@electron/main/utils/fs-util";
import { Logger } from "@electron/main/utils/logger";
import { readdir, rename, readFile } from "node:fs/promises";
import { join, basename } from "node:path";


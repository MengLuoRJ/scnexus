import { profileStore } from "@/stores/profile";
import { szExtract, szExtractFull } from "@/utils/7zip";
import { mkdirIfNotExist, rmIfExist } from "@/utils/fs-util";
import { Logger } from "@/utils/logger";
import { readdir, rename, readFile } from "node:fs/promises";
import { join, basename } from "node:path";

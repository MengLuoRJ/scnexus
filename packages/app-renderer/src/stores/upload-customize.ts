import { ref } from "vue";
import { defineStore } from "pinia";
import type { FormInst } from "naive-ui";
import type {
  CampaignType,
  MetadataStandard,
  MetadataType,
} from "scnexus-standard/metadata";
import { set } from "@vueuse/core";

export const useUploadCustomizeStore = defineStore(
  "upload-customize",
  () => {
    const uploader_step = ref<
      "pending" | "editing" | "filing" | "finished" | "generater"
    >("pending");

    const uploader_type = ref<"create" | "update">("create");

    const file_path = ref("");
    const upload_url = ref("");
    const upload_ref = ref<FormInst | null>(null);
    const upload_data = ref<{
      snid: number | undefined;
      name: string | undefined;
      description: string | undefined;
      type: MetadataType;
      campaign: CampaignType | undefined;
      tags: string[] | undefined;
      version: string;
      author: string | undefined;
      metadata: MetadataStandard | undefined;
      file_size: number;
      file_md5: string | undefined;
    }>({
      snid: undefined,
      name: "这是另一个作品",
      description: "这是一段作品描述",
      type: "Campaign",
      campaign: undefined,
      tags: undefined,
      version: "0.0.1",
      author: undefined,
      metadata: undefined,
      file_size: 0,
      file_md5: undefined,
    });

    const pre_data = ref<{
      snid: number | undefined;
      name: string | undefined;
      description: string | undefined;
      type: MetadataType;
      campaign: CampaignType | undefined;
      tags: string[] | undefined;
      version: string;
      author: string | undefined;
      metadata: MetadataStandard | undefined;
      file_size: number;
      file_md5: string | undefined;
    }>({
      snid: undefined,
      name: undefined,
      description: undefined,
      type: "Campaign",
      campaign: undefined,
      tags: undefined,
      version: "0.0.1",
      author: undefined,
      metadata: undefined,
      file_size: 0,
      file_md5: undefined,
    });

    const upload_progress = ref<{
      total?: number;
      progress?: number;
      bytes: number;
      rate?: number;
      estimated?: number;
    }>({
      total: undefined,
      progress: undefined,
      bytes: 0,
      rate: undefined,
      estimated: undefined,
    });

    function updateStep(step: "pending" | "editing" | "filing" | "finished") {
      set(uploader_step, step);
    }

    function updateType(type: "create" | "update") {
      set(uploader_type, type);
    }

    function setFilePath(path: string) {
      set(file_path, path);
    }

    function setUploadUrl(url: string) {
      set(upload_url, url);
    }

    function updateData(data: typeof upload_data.value) {
      set(upload_data, data);
    }

    function updatePreData(data: typeof pre_data.value) {
      set(pre_data, data);
    }

    function updateProgress(data: typeof upload_progress.value) {
      set(upload_progress, data);
    }

    function clean() {
      set(uploader_step, "pending");
      set(file_path, "");
      set(upload_url, "");
      set(upload_ref, null);
      set(upload_data, {
        snid: undefined,
        name: undefined,
        description: undefined,
        type: "Campaign",
        campaign: undefined,
        tags: [],
        version: "0.0.1",
        author: undefined,
        metadata: undefined,
        file_size: 0,
        file_md5: undefined,
      });
      set(pre_data, {
        snid: undefined,
        name: undefined,
        description: undefined,
        type: "Campaign",
        campaign: undefined,
        tags: undefined,
        version: "0.0.1",
        author: undefined,
        metadata: undefined,
        file_size: 0,
        file_md5: undefined,
      });
      set(upload_progress, {
        total: undefined,
        progress: undefined,
        bytes: 0,
        rate: undefined,
        estimated: undefined,
      });
    }

    return {
      uploader_step,
      uploader_type,
      file_path,
      upload_url,
      upload_ref,
      upload_data,
      pre_data,
      upload_progress,
      updateStep,
      updateType,
      setFilePath,
      setUploadUrl,
      updateData,
      updatePreData,
      updateProgress,
      clean,
    };
  },
  { persist: false }
);

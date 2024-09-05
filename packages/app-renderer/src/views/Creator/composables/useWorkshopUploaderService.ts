import { useUploadCustomizeStore } from "@/stores/upload-customize";
import { storeToRefs } from "pinia";
import { useFetch } from "../../../composables/useFetch";
import { get } from "@vueuse/core";
import { toRaw } from "vue";
import { useTrans } from "../../../composables/useTrans";
import { useDiscreteApi } from "../../../composables/useDiscreteApi";
import { ipcCustomize } from "@/apis/ipcs/customize";
import { ipcWorkshop } from "@/apis/ipcs/workshop";

const { t } = useTrans();
const { dialog } = useDiscreteApi(["dialog", "notification"]);

const uploadCustomizeStore = useUploadCustomizeStore();

const { file_path, upload_url, upload_data } =
  storeToRefs(uploadCustomizeStore);

export const metadataTypes = [
  {
    label: "自定义",
    value: "Customize",
  },
  {
    label: "战役包",
    value: "Campaign",
  },
];

export const metadataCampaignTypes = [
  {
    label: "自由之翼",
    value: "WOL",
  },
  {
    label: "虫群之心",
    value: "HOTS",
  },
  {
    label: "虚空之遗",
    value: "LOTV",
  },
  {
    label: "诺娃隐秘行动",
    value: "NCO",
  },
];

export async function readCompressFile(path: string) {
  const { data: cfi } = await ipcCustomize.readCompressFileInfo(path);
  if (!cfi?.metadata) {
    dialog.error({
      title: t("customize.drop-zone.process-dialog.cfi-error-title"),
      content: t("customize.drop-zone.process-dialog.cfi-error-message"),
    });
    return;
  }

  const { metadata, compress_info } = cfi;

  let md5: string | undefined = undefined;
  if (compress_info.size < 1024 * 1024) {
    const { data } = await ipcWorkshop.getFileMd5(path);
    md5 = data;
  } else {
    const { data } = await ipcWorkshop.getFileMd5Wasm(path);
    md5 = data;
  }

  if (!md5) {
    return;
  }

  return {
    snid: metadata.snid,
    name: metadata.name,
    description: metadata.description,
    type: metadata.type,
    campaign: metadata.campaign,
    tags: metadata.tags,
    version: metadata.version,
    author: metadata.author,
    metadata: metadata,
    file_size: compress_info.size_compressed,
    file_md5: md5,
  };
}

export async function syncMetadata() {
  await ipcWorkshop.writeMetadata(get(file_path), {
    ...toRaw(get(upload_data).metadata),
    snid: get(upload_data).snid,
    name: get(upload_data).name!,
    description: get(upload_data).description!,
    type: get(upload_data).type,
    campaign: get(upload_data).campaign,
    tags: toRaw(get(upload_data).tags),
    version: get(upload_data).version,
    author: get(upload_data).author!,
  });

  const newData = await readCompressFile(get(file_path));
  uploadCustomizeStore.updateData(newData!);
}

export async function initUploader() {
  const snid = get(upload_data).snid;
  const customize = snid ? await getCustomize(snid) : null;

  if (customize) {
    uploadCustomizeStore.updatePreData(customize);
    uploadCustomizeStore.updateData({
      ...customize,
      ...get(upload_data),
    });
    uploadCustomizeStore.updateType("update");
  } else {
    uploadCustomizeStore.updateData({
      ...get(upload_data),
      snid: undefined,
    });
    uploadCustomizeStore.updateType("create");
  }

  uploadCustomizeStore.updateStep("editing");
}

export async function getCustomize(snid: number) {
  const { data, error } = await useFetch("/workshop/customize/snid/" + snid)
    .get()
    .json();
  if (get(error)) {
    console.log(error);
  }
  if (get(data)) {
    return get(data);
  }
}

export async function createCustomize() {
  const { data, error } = await useFetch("/workshop/customize/create")
    .post({
      ...get(upload_data),
    })
    .json();
  console.log(get(data));
  if (get(error)) {
    console.log(error);
  }
  if (get(data)) {
    upload_data.value.snid = get(data).snid;
    await syncMetadata();
    return get(data);
  }
}

export async function updateCustomoize() {
  const { data, error } = await useFetch("/workshop/customize/update")
    .post({
      ...get(upload_data),
    })
    .json();
  if (get(error)) {
    console.log(error);
  }
  if (get(data)) {
    return get(data);
  }
}

export async function createDraft() {
  const { data, error } = await useFetch("/workshop/customize/draft/create")
    .post({
      ...get(upload_data),
      customize_snid: get(upload_data).snid,
    })
    .json();
  if (get(error)) {
    console.log(error);
  }
  if (get(data)) {
    return get(data);
  }
}

export async function updateDraft(id: number) {
  const { data, error } = await useFetch("/workshop/customize/draft/update")
    .post({
      ...get(upload_data),
      id: id,
    })
    .json();
  if (get(error)) {
    console.log(error);
  }
  if (get(data)) {
    return get(data);
  }
}

async function getPresignedUploadUrl(id: number) {
  const { data, error } = await useFetch(
    "/workshop/customize/draft/upload/generate"
  )
    .post({
      id: id,
    })
    .text();
  if (get(error)) {
    console.log(error);
  }
  if (get(data)) {
    console.log(get(data));
    return get(data);
  }
}

export async function uploadDraft(id: number) {
  await updateDraft(id);

  // const url = await getPresignedUploadUrl(id);
  // if (!url) {
  //   return;
  // }
  // uploadCustomizeStore.setUploadUrl(url);

  // window.ipcRenderer.workshop.onUploadProgress((event, progress) => {
  //   console.log(progress);
  //   uploadCustomizeStore.updateProgress({
  //     ...progress,
  //   });
  // });

  // await ipcWorkshop.uploadCompressedFile(
  //   get(file_path),
  //   get(upload_url),
  //   get(upload_data).file_md5!
  // );

  // window.ipcRenderer.workshop.clearUploadProgress();
}

export async function filedDraft(id: number) {
  const { data, error } = await useFetch("/workshop/customize/draft/filed")
    .post({
      id: id,
    })
    .json();
  if (get(error)) {
    console.log(error);
  }
  if (get(data)) {
    return get(data);
  }
}

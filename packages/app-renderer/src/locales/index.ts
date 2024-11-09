import { createI18n } from "vue-i18n";

function importMessages() {
  const messageFiles = import.meta.glob("./**/*.json", { eager: true });
  console.log(messageFiles);
  type Message = { [x: string]: string | Message };
  type Messages = { [x: string]: Message };
  let messages: Messages = {};
  // let messages: { [x: string]: object } = {};
  for (const path in messageFiles) {
    const locale = path.match(/\.\/(.*)\/.*\.json/)![1];
    // const locale = path.match(/\.\/locales\/(.*)\/.*\.json/)![1];
    // const file = path.match(/\.\/locales\/.*\/(.*)\.json/)![1];
    // @ts-ignore
    const msg = messageFiles[path].default;
    // messages[locale]
    //   ? (messages[locale] = { ...messages[locale], ...{ [file]: msg } })
    //   : (messages[locale] = { [file]: msg });
    messages[locale]
      ? (messages[locale] = { ...messages[locale], ...msg })
      : (messages[locale] = msg);
  }
  return messages;
}

export const i18n = createI18n({
  legacy: false,
  locale: "zh",
  fallbackLocale: "zh",
  messages: importMessages(),
  globalInjection: true,
  scope: "global",
});

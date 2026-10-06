export type DeepLinkMessage =
  | {
      channel: "deeplink:authentication";
      data: { access_token: string | null; refresh_token: string | null };
    }
  | { channel: "deeplink:workshop"; data: string | undefined };

export function parseDeepLink(input: string): DeepLinkMessage | undefined {
  if (typeof input !== "string") return;
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return;
  }
  if (url.protocol !== "scnexus:" || url.username || url.password || url.port)
    return;
  if (url.hostname === "authentication") {
    return {
      channel: "deeplink:authentication",
      data: {
        access_token: url.searchParams.get("access_token"),
        refresh_token: url.searchParams.get("refresh_token"),
      },
    };
  }
  if (url.hostname === "workshop") {
    return {
      channel: "deeplink:workshop",
      data: input.split("scnexus://workshop/")[1],
    };
  }
}

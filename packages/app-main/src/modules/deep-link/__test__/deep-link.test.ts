import assert from "node:assert/strict";
import { test } from "vitest";
import { parseDeepLink } from "../deep-link-url";

test("authentication links preserve decoded tokens and nullable missing tokens", () => {
  assert.deepEqual(
    parseDeepLink(
      "scnexus://authentication?access_token=a%2Bb&refresh_token=c%26d",
    ),
    {
      channel: "deeplink:authentication",
      data: { access_token: "a+b", refresh_token: "c&d" },
    },
  );
  assert.deepEqual(parseDeepLink("scnexus://authentication"), {
    channel: "deeplink:authentication",
    data: { access_token: null, refresh_token: null },
  });
});

test("workshop links preserve the existing renderer payload", () => {
  assert.deepEqual(parseDeepLink("scnexus://workshop/item-id"), {
    channel: "deeplink:workshop",
    data: "item-id",
  });
});

test("invalid, foreign and lookalike links are ignored", () => {
  for (const input of [
    "",
    "not a URL",
    "https://authentication",
    "scnexus://authentication.attacker",
    "scnexus://workshop.attacker/item",
    "scnexus://user@authentication",
    "scnexus://workshop:80/item",
    "scnexus://unknown",
  ]) {
    assert.equal(parseDeepLink(input), undefined, input);
  }
});

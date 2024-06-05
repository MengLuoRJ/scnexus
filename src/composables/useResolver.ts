export const REGION_LIST = [
  {
    id: 1,
    server: "US",
    code: "US",
    name: "America",
  },
  {
    id: 2,
    server: "EU",
    code: "EU",
    name: "Europe",
  },
  {
    id: 3,
    server: "Asia",
    code: "TW",
    name: "Asia",
  },
  {
    id: 5,
    server: "CN",
    code: "CN",
    name: "China",
  },
];

export function regionById(id: number) {
  return REGION_LIST.find((x) => x.id === id);
}

export function formatDescription(s: string) {
  const regURL =
    /(http(s)?:\/\/)?(www\.)?[-a-zA-Z0-9@:%._+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_+.~#?&//=]*)/g;
  const regMail = /^\S+@\S+$/;
  const regURLWithScheme = /^([a-z]+:)?\/\//i;

  s = s.trim().replace(/\n/g, "<br>");
  s = s.replace(regURL, (substring) => {
    let href = substring;
    if (href.match(regMail)) {
      href = `mailto:${href}`;
    } else if (!href.match(regURLWithScheme)) {
      href = `http://${href}`;
    }
    return `<a href="${href}" target="_blank">${substring}</a>`;
  });
  return s;
}

export function dImageResolve(imgHash: string, regionId: number) {
  return (
    "https://static.sc2arcade.com/dimg/" +
    imgHash +
    ".jpg?region=" +
    REGION_LIST.find((x) => x.id === regionId)?.code.toLowerCase()
  );
}

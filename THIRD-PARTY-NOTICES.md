# Third-Party Notices

SCNexus is distributed under the BSD 3-Clause License (see [LICENSE](./LICENSE)). The application also contains, bundles or links against the third-party components listed below. Each component remains under its own license; the terms of the BSD 3-Clause License do not extend to them.

This file summarizes the components that are redistributed with the application. Full license texts are shipped inside the corresponding packages under `node_modules/<package>/LICENSE` (or an equivalently named file) in the published application resources.

## Application runtime

| Component | Version                     | License                                    |
| --------- | --------------------------- | ------------------------------------------ |
| Electron  | 45.x                        | MIT                                        |
| Chromium  | 156.x                       | BSD 3-Clause and other permissive licenses |
| Node.js   | 24.x (embedded in Electron) | MIT                                        |

## Bundled binary components

| Component                                | Version   | License                                           | Notes                                                                                                                               |
| ---------------------------------------- | --------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 7-Zip standalone binaries (via `7z-bin`) | 26.4.0    | GNU LGPL 2.1 or later, with the unRAR restriction | Extracted to the application resources by `asarUnpack`. Source code is available at <https://www.7-zip.org/>.                       |
| StormLib                                 | submodule | MIT                                               | Vendored as a Git submodule under `packages/node-stormlib/vendor/StormLib`; upstream <https://github.com/ladislav-zezula/StormLib>. |
| CascLib                                  | submodule | MIT                                               | Vendored as a Git submodule under `packages/node-casclib/vendor/CascLib`; upstream <https://github.com/ladislav-zezula/CascLib>.    |

The unRAR restriction of 7-Zip states that the unRAR code must not be used to develop a RAR (WinRAR) compatible archiver. SCNexus uses 7-Zip only to read and list archive contents.

## Source-embedded third-party code and data

| Component                               | Location                                                                                                                                                                                  | License                                                                                               |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| libbz2 1.0.8 (bzip2)                    | `packages/bzip2-wasm/native/bzip2-1.0.8`                                                                                                                                                  | bzip2 license (BSD-style, Julian R Seward) — see `packages/bzip2-wasm/LICENSE.libbz2`                 |
| Emscripten runtime                      | `packages/bzip2-wasm`                                                                                                                                                                     | MIT / University of Illinois-NCSA — see `packages/bzip2-wasm/LICENSE.runtime`                         |
| Blizzard s2protocol-derived definitions | `packages/replay-parser/src/protocols` (official definitions pinned to commit `3b40c5ef01834096b4305172ef5485ec00133dcc`; runtime uses generated TypeScript data, not the Python decoder) | MIT, Copyright (c) 2015-2017 Blizzard Entertainment — see `packages/replay-parser/LICENSE.s2protocol` |

## JavaScript dependencies

The application's production dependencies are distributed under permissive licenses:

| License      | Packages                                                                                                                                                                                                                                                                                                                                             |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MIT          | `@comark/vue`, `@iconify/vue`, `@modelcontextprotocol/sdk`, `@nuxt/ui`, `@sentry/electron`, `@sentry/vue`, `@tiptap/core`, `@vueuse/core`, `ajv`, `axios`, `comark`, `electron-log`, `electron-store`, `electron-updater`, `hash-wasm`, `motion-v`, `pinia`, `regedit`, `tailwindcss`, `uqr`, `uuid`, `vccs`, `vue`, `vue-i18n`, `vue-router`, `zod` |
| ISC          | `semver`                                                                                                                                                                                                                                                                                                                                             |
| BSD 3-Clause | `filesize`                                                                                                                                                                                                                                                                                                                                           |
| BSD 3-Clause | `@scnexus/standard`, `@scnexus/app-shared` (first-party packages)                                                                                                                                                                                                                                                                                    |
| MIT          | `@scnexus/bzip2-wasm`, `@scnexus/replay-parser`, `@scnexus/node-stormlib`, `@scnexus/node-casclib` (first-party packages)                                                                                                                                                                                                                            |

Development-only tooling (build, lint, format and test dependencies) is not redistributed with the application.

## Artwork and trademarks

StarCraft II, Blizzard Entertainment and related names, logos and artwork are trademarks or registered trademarks of Blizzard Entertainment, Inc. Image assets under `packages/app-renderer-v2/src/assets` that depict Blizzard campaigns, mutators or products remain the property of their respective rights holders and are not licensed under the BSD 3-Clause License. They are included solely to identify the corresponding in-game content.

SCNexus is an unofficial community project. It is not affiliated with, endorsed by, or sponsored by Blizzard Entertainment, Inc.

## Reporting an omission

If you believe a component is missing from this list or is attributed incorrectly, please open an issue at <https://github.com/MengLuoRJ/scnexus/issues>.

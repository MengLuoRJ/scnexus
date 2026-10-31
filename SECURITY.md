# Security Policy

## Supported Versions

Security fixes are applied to the current release line and to the `main` branch of this repository.

| Version           | Supported |
| ----------------- | --------- |
| 0.1.x (current)   | Yes       |
| Earlier snapshots | No        |

## Reporting a Vulnerability

Please do not report security vulnerabilities through public GitHub issues, discussions or community channels.

Use **GitHub Private Vulnerability Reporting** for this repository (`Security` → `Report a vulnerability`). If that channel is unavailable, send a report to **mengluorj@aiurcovenant.net** with the subject prefix `[SCNexus Security]`.

A useful report includes:

- affected version or commit,
- operating system and build type (installed build or local build),
- a description of the impact and the conditions required to trigger it,
- reproduction steps or a proof of concept, and
- any suggested mitigation.

Please avoid including real account credentials, personal data or third-party content in the report. Synthetic reproductions are preferred.

## Scope

Reports are in scope when they concern:

- **IPC and process isolation** — bypassing the preload bridge, escaping `contextIsolation` or `sandbox`, reaching Node.js APIs from the renderer, or invoking privileged handlers without the intended validation.
- **Local service exposure** — unauthenticated or cross-origin access to the locally bound HTTP service used for assistant integration, token leakage, or listening on non-loopback interfaces.
- **Archive and file handling** — path traversal, symbolic link or hard link abuse during extraction, archive bombs, size or member-count limit bypasses, or writes outside managed directories.
- **Credential and session handling** — storage of authentication material, decryption of another account's data on the same machine, session confusion between accounts, or tokens written to logs.
- **Renderer content security** — content security policy bypasses, unsafe handling of remote content, or navigation to untrusted origins.
- **Update integrity** — tampering with update metadata or packages delivered to the update feed.
- **Dependency and supply chain** — a vulnerable dependency that is reachable from application code.

## Out of Scope

- Vulnerabilities that require physical access to an already unlocked machine, or that require an attacker to control the user's operating system account.
- Vulnerabilities in third-party components that have no application-specific exploitation path; report those upstream. If a dependency issue is reachable through SCNexus, we still want to know.
- Issues that depend on a modified application bundle, a disabled signature check, or unsupported platform builds.
- Social engineering, spam, denial of service through extreme local resource exhaustion without a security boundary crossing, and reports produced solely by automated scanners without a demonstrated impact.
- Missing hardening headers or best-practice findings with no demonstrated security consequence.

## Disclosure Process

1. We acknowledge receipt, normally within five business days.
2. We confirm the affected versions and assess severity together with the reporter.
3. We prepare and validate a fix, and coordinate a disclosure date with the reporter.
4. We publish the fix and, where appropriate, an advisory describing the issue and the affected versions.

Please allow reasonable time for a fix before public disclosure. We will credit reporters in the advisory unless anonymity is requested.

This project does not operate a paid bug bounty program.

## Hardening Notes

For researchers reviewing the codebase:

- The renderer runs with `contextIsolation` enabled and Node.js integration disabled; privileged operations are exposed only through the enumerable methods of the preload bridge.
- The main process validates IPC arguments and callers at runtime; TypeScript types alone are not treated as a security boundary.
- Archive extraction validates normalized paths against managed directory boundaries and enforces size and member limits.
- Credentials are stored with Electron `safeStorage`; sensitive values are excluded from log output.
- The packaged application loads renderer content from the application bundle and restricts remote origins through a content security policy.

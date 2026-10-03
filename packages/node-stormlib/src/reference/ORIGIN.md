# Reference Binding Sources

The C++ files in this directory and TypeScript files in `../compat` are adapted from the MIT-licensed
`jamiephan/casclib-stormlib-monorepo`, package `stormlib`, commit
`9afb1fb34be82d58d1483a0242a3a93a1b1a2838`.

The original license is included as `LICENSE`. Local fixes are recorded in
this repository's commit history. These bindings are compiled separately from
the Worker binding to avoid sharing persistent constructor references between
Node environments. The original low-level API is synchronous unless explicitly
named as an async helper; callers must respect native handle lifetimes and must
not perform other operations on an archive/file during a pending async helper.

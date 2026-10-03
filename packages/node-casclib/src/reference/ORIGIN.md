# Reference Sources

The C++ files in this directory and TypeScript files in `../compat` are adapted
from the MIT-licensed `jamiephan/casclib-stormlib-monorepo`, package `casclib`,
commit `9afb1fb34be82d58d1483a0242a3a93a1b1a2838`. The original license is included
as `LICENSE`. Local changes are recorded in this repository's commit history.

The reference binding is compiled separately from the serialized Worker binding
to avoid sharing persistent native constructors across Node environments. It
retains ANSI filesystem-path semantics on Windows. Do not load this binding in
multiple Node Worker environments. Close files before their owning storage and
do not close or mutate a native handle while its asynchronous operation is pending.

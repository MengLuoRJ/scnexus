"""Regenerate public-domain synthetic test data using Python's standard-library bz2."""
import bz2
import json
from pathlib import Path

vectors = {
    "empty": (b"", 1),
    "text": (b"Hello, StarCraft II!\n" * 7, 1),
    "binary": (bytes(range(256)) * 11, 1),
    "multiBlock": (bytes((i * 73 + i // 256) % 256 for i in range(350000)), 1),
    "maxOutput": (bytes(128 * 1024 * 1024), 9),
}
result = {
    name: {"compressedHex": bz2.compress(data, compresslevel=level).hex(), "size": len(data)}
    for name, (data, level) in vectors.items()
}
(Path(__file__).resolve().parent.parent / "tests" / "vectors.json").write_text(
    json.dumps(result, indent=2) + "\n", encoding="utf-8"
)

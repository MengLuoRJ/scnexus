{
  "targets": [{
    "target_name": "node_stormlib",
    "cflags!": ["-fno-exceptions"],
    "cflags_cc!": ["-fno-exceptions"],
    "cflags_cc": ["-std=c++17"],
    "include_dirs": ["<!@(node -p \"require('node-addon-api').include\")", "vendor/StormLib/src"],
    "defines": ["NAPI_VERSION=8", "NAPI_CPP_EXCEPTIONS", "__STORMLIB_NO_STATIC_LINK__", "_7ZIP_ST"],
    "sources": [
      "src/native.cpp",
      "vendor/StormLib/src/FileStream.cpp",
      "vendor/StormLib/src/SBaseCommon.cpp",
      "vendor/StormLib/src/SBaseDumpData.cpp",
      "vendor/StormLib/src/SBaseFileTable.cpp",
      "vendor/StormLib/src/SBaseSubTypes.cpp",
      "vendor/StormLib/src/SCompression.cpp",
      "vendor/StormLib/src/SFileAddFile.cpp",
      "vendor/StormLib/src/SFileAttributes.cpp",
      "vendor/StormLib/src/SFileCompactArchive.cpp",
      "vendor/StormLib/src/SFileCreateArchive.cpp",
      "vendor/StormLib/src/SFileExtractFile.cpp",
      "vendor/StormLib/src/SFileFindFile.cpp",
      "vendor/StormLib/src/SFileGetFileInfo.cpp",
      "vendor/StormLib/src/SFileListFile.cpp",
      "vendor/StormLib/src/SFileOpenArchive.cpp",
      "vendor/StormLib/src/SFileOpenFileEx.cpp",
      "vendor/StormLib/src/SFilePatchArchives.cpp",
      "vendor/StormLib/src/SFileReadFile.cpp",
      "vendor/StormLib/src/SFileVerify.cpp",
      "vendor/StormLib/src/SMemUtf8.cpp",
      "vendor/StormLib/src/adpcm/adpcm.cpp",
      "vendor/StormLib/src/huffman/huff.cpp",
      "vendor/StormLib/src/sparse/sparse.cpp",
      "vendor/StormLib/src/jenkins/lookup3.c",
      "vendor/StormLib/src/pklib/explode.c",
      "vendor/StormLib/src/pklib/implode.c",
      "vendor/StormLib/src/pklib/crc32.c",
      "vendor/StormLib/src/bzip2/blocksort.c",
      "vendor/StormLib/src/bzip2/bzlib.c",
      "vendor/StormLib/src/bzip2/compress.c",
      "vendor/StormLib/src/bzip2/crctable.c",
      "vendor/StormLib/src/bzip2/decompress.c",
      "vendor/StormLib/src/bzip2/huffman.c",
      "vendor/StormLib/src/bzip2/randtable.c",
      "vendor/StormLib/src/zlib/adler32.c",
      "vendor/StormLib/src/zlib/compress.c",
      "vendor/StormLib/src/zlib/crc32.c",
      "vendor/StormLib/src/zlib/deflate.c",
      "vendor/StormLib/src/zlib/inffast.c",
      "vendor/StormLib/src/zlib/inflate.c",
      "vendor/StormLib/src/zlib/inftrees.c",
      "vendor/StormLib/src/zlib/trees.c",
      "vendor/StormLib/src/zlib/zutil.c",
      "vendor/StormLib/src/lzma/C/LzFind.c",
      "vendor/StormLib/src/lzma/C/LzmaDec.c",
      "vendor/StormLib/src/lzma/C/LzmaEnc.c",
      "vendor/StormLib/src/LibTomMath.c",
      "vendor/StormLib/src/LibTomMathDesc.c",
      "vendor/StormLib/src/LibTomCrypt.c"
    ],
    "conditions": [
      ["OS=='win'", {
        "defines": ["UNICODE", "_UNICODE", "WIN32", "_WINDOWS"],
        "libraries": ["wininet.lib"],
        "msvs_settings": { "VCCLCompilerTool": { "ExceptionHandling": 1, "AdditionalOptions": ["/std:c++17"] } }
      }],
      ["OS=='linux'", { "defines": ["BZ_STRICT_ANSI"] }],
      ["OS=='mac'", { "xcode_settings": {
        "GCC_ENABLE_CPP_EXCEPTIONS": "YES", "CLANG_CXX_LANGUAGE_STANDARD": "c++17",
        "CLANG_CXX_LIBRARY": "libc++", "MACOSX_DEPLOYMENT_TARGET": "10.15"
      } }]
    ]
  }, {
    "target_name": "stormlib_bindings",
    "cflags!": ["-fno-exceptions"],
    "cflags_cc!": ["-fno-exceptions"],
    "cflags_cc": ["-std=c++17"],
    "include_dirs": ["<!@(node -p \"require('node-addon-api').include\")", "vendor/StormLib/src"],
    "defines": ["NAPI_VERSION=8", "NAPI_CPP_EXCEPTIONS", "__STORMLIB_NO_STATIC_LINK__", "_7ZIP_ST"],
    "sources": [
      "src/reference/addon.cpp", "src/reference/archive.cpp", "src/reference/file.cpp", "src/reference/errors.cpp",
      "<!@(node scripts/list-storm-sources.mjs)"
    ],
    "conditions": [
      ["OS=='win'", {
        "defines": ["WIN32", "_WINDOWS"], "libraries": ["wininet.lib"],
        "msvs_settings": { "VCCLCompilerTool": { "ExceptionHandling": 1, "AdditionalOptions": ["/std:c++17"] } }
      }],
      ["OS=='linux'", { "defines": ["BZ_STRICT_ANSI"] }],
      ["OS=='mac'", { "xcode_settings": {
        "GCC_ENABLE_CPP_EXCEPTIONS": "YES", "CLANG_CXX_LANGUAGE_STANDARD": "c++17",
        "CLANG_CXX_LIBRARY": "libc++", "MACOSX_DEPLOYMENT_TARGET": "10.15"
      } }]
    ]
  }]
}
{
  "targets": [{
    "target_name": "node_casclib",
    "cflags!": ["-fno-exceptions"],
    "cflags_cc!": ["-fno-exceptions"],
    "cflags_cc": ["-std=c++17"],
    "defines": ["NAPI_VERSION=8", "NAPI_CPP_EXCEPTIONS", "CASCLIB_NO_AUTO_LINK_LIBRARY", "CASCLIB_NODEBUG"],
    "include_dirs": ["<!@(node -p \"require('node-addon-api').include\")", "vendor/CascLib/src"],
    "sources": [
      "src/native.cpp",
      "vendor/CascLib/src/common/Common.cpp", "vendor/CascLib/src/common/Directory.cpp",
      "vendor/CascLib/src/common/Csv.cpp", "vendor/CascLib/src/common/FileStream.cpp",
      "vendor/CascLib/src/common/FileTree.cpp", "vendor/CascLib/src/common/ListFile.cpp",
      "vendor/CascLib/src/common/Mime.cpp", "vendor/CascLib/src/common/RootHandler.cpp",
      "vendor/CascLib/src/common/Sockets.cpp", "vendor/CascLib/src/hashes/md5.cpp",
      "vendor/CascLib/src/hashes/sha1.cpp", "vendor/CascLib/src/jenkins/lookup3.c",
      "vendor/CascLib/src/overwatch/apm.cpp", "vendor/CascLib/src/overwatch/cmf.cpp",
      "vendor/CascLib/src/overwatch/aes.cpp", "vendor/CascLib/src/CascDecompress.cpp",
      "vendor/CascLib/src/CascDecrypt.cpp", "vendor/CascLib/src/CascDumpData.cpp",
      "vendor/CascLib/src/CascFiles.cpp", "vendor/CascLib/src/CascFindFile.cpp",
      "vendor/CascLib/src/CascIndexFiles.cpp", "vendor/CascLib/src/CascOpenFile.cpp",
      "vendor/CascLib/src/CascOpenStorage.cpp", "vendor/CascLib/src/CascReadFile.cpp",
      "vendor/CascLib/src/CascRootFile_Diablo3.cpp", "vendor/CascLib/src/CascRootFile_Install.cpp",
      "vendor/CascLib/src/CascRootFile_MNDX.cpp", "vendor/CascLib/src/CascRootFile_Text.cpp",
      "vendor/CascLib/src/CascRootFile_TVFS.cpp", "vendor/CascLib/src/CascRootFile_OW.cpp",
      "vendor/CascLib/src/CascRootFile_WoW.cpp", "vendor/CascLib/src/zlib/adler32.c",
      "vendor/CascLib/src/zlib/crc32.c", "vendor/CascLib/src/zlib/inffast.c",
      "vendor/CascLib/src/zlib/inflate.c", "vendor/CascLib/src/zlib/inftrees.c",
      "vendor/CascLib/src/zlib/zutil.c"
    ],
    "conditions": [
      ["OS=='win'", {
        "defines": ["UNICODE", "_UNICODE", "WIN32", "_WINDOWS"],
        "libraries": ["wininet.lib"],
        "msvs_settings": { "VCCLCompilerTool": { "ExceptionHandling": 1, "AdditionalOptions": ["/std:c++17"] } }
      }],
      ["OS=='mac'", { "xcode_settings": {
        "GCC_ENABLE_CPP_EXCEPTIONS": "YES", "CLANG_CXX_LANGUAGE_STANDARD": "c++17",
        "CLANG_CXX_LIBRARY": "libc++", "MACOSX_DEPLOYMENT_TARGET": "10.15",
        "OTHER_CFLAGS": ["-include", "stdio.h"]
      } }]
    ]
  }]
}
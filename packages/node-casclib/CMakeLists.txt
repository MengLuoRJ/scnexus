cmake_minimum_required(VERSION 3.25)
project(node_casclib LANGUAGES C CXX)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)
set(CMAKE_POLICY_VERSION_MINIMUM 3.5)
set(CASC_BUILD_SHARED_LIB OFF CACHE BOOL "" FORCE)
set(CASC_BUILD_STATIC_LIB ON CACHE BOOL "" FORCE)
set(CASC_BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(CASC_UNICODE ON CACHE BOOL "" FORCE)
set(CMAKE_DISABLE_FIND_PACKAGE_ZLIB ON)
set(CASCLIB_SOURCE_DIR "" CACHE PATH "Existing CascLib source checkout")
if(CASCLIB_SOURCE_DIR)
  add_subdirectory("${CASCLIB_SOURCE_DIR}" casclib)
else()
  include(FetchContent)
  FetchContent_Declare(casclib
    GIT_REPOSITORY https://github.com/ladislav-zezula/CascLib.git
    GIT_TAG 2a280f5a231966dc5d1b534978dd9f9f04a374cd)
  FetchContent_MakeAvailable(casclib)
endif()
execute_process(COMMAND node -p "require('node-addon-api').include_dir"
  WORKING_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}"
  OUTPUT_VARIABLE NAPI_INCLUDE OUTPUT_STRIP_TRAILING_WHITESPACE
  COMMAND_ERROR_IS_FATAL ANY)
add_library(node_casclib SHARED src/native.cpp ${CMAKE_JS_SRC})
set_target_properties(node_casclib PROPERTIES PREFIX "" SUFFIX ".node"
  LIBRARY_OUTPUT_DIRECTORY "$<1:${CMAKE_CURRENT_BINARY_DIR}/Release>"
  RUNTIME_OUTPUT_DIRECTORY "$<1:${CMAKE_CURRENT_BINARY_DIR}/Release>")
target_include_directories(node_casclib PRIVATE ${CMAKE_JS_INC} "${CMAKE_CURRENT_SOURCE_DIR}/${NAPI_INCLUDE}")
target_compile_definitions(node_casclib PRIVATE NAPI_VERSION=8 NAPI_CPP_EXCEPTIONS)
if(WIN32)
  target_compile_definitions(node_casclib PRIVATE UNICODE _UNICODE)
endif()
target_link_libraries(node_casclib PRIVATE casc_static ${CMAKE_JS_LIB})
get_target_property(CASC_SOURCE_ROOT casc_static SOURCE_DIR)
file(GLOB_RECURSE CASC_LICENSES RELATIVE "${CASC_SOURCE_ROOT}"
  "${CASC_SOURCE_ROOT}/*LICENSE*" "${CASC_SOURCE_ROOT}/*COPYING*")
list(APPEND CASC_LICENSES src/zlib/README src/zlib/zlib.h)
foreach(LICENSE_PATH IN LISTS CASC_LICENSES)
  if(EXISTS "${CASC_SOURCE_ROOT}/${LICENSE_PATH}")
    configure_file("${CASC_SOURCE_ROOT}/${LICENSE_PATH}"
      "${CMAKE_CURRENT_SOURCE_DIR}/dist/licenses/CascLib/${LICENSE_PATH}" COPYONLY)
  endif()
endforeach()
if(MSVC AND CMAKE_JS_NODELIB_DEF AND CMAKE_JS_NODELIB_TARGET)
  execute_process(COMMAND ${CMAKE_AR} /def:${CMAKE_JS_NODELIB_DEF}
    /out:${CMAKE_JS_NODELIB_TARGET} ${CMAKE_STATIC_LINKER_FLAGS}
    COMMAND_ERROR_IS_FATAL ANY)
endif()

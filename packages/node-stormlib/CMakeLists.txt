cmake_minimum_required(VERSION 3.25)
project(node_stormlib LANGUAGES C CXX)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)
set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)
set(STORM_USE_BUNDLED_LIBRARIES ON CACHE BOOL "" FORCE)
set(STORM_SKIP_INSTALL ON CACHE BOOL "" FORCE)
set(STORM_BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(STORM_UNICODE ON CACHE BOOL "" FORCE)
set(STORMLIB_SOURCE_DIR "" CACHE PATH "Existing StormLib source checkout")
if(STORMLIB_SOURCE_DIR)
  add_subdirectory("${STORMLIB_SOURCE_DIR}" stormlib)
else()
  include(FetchContent)
  FetchContent_Declare(stormlib
    GIT_REPOSITORY https://github.com/ladislav-zezula/StormLib.git
    GIT_TAG 44ebfbfc109d76e2a85bbd5d8b0c949df7e65c6f)
  FetchContent_MakeAvailable(stormlib)
endif()
execute_process(COMMAND node -p "require('node-addon-api').include_dir"
  WORKING_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}"
  OUTPUT_VARIABLE NAPI_INCLUDE OUTPUT_STRIP_TRAILING_WHITESPACE
  COMMAND_ERROR_IS_FATAL ANY)
add_library(node_stormlib SHARED src/native.cpp ${CMAKE_JS_SRC})
set_target_properties(node_stormlib PROPERTIES PREFIX "" SUFFIX ".node")
target_include_directories(node_stormlib PRIVATE ${CMAKE_JS_INC} "${CMAKE_CURRENT_SOURCE_DIR}/${NAPI_INCLUDE}")
target_compile_definitions(node_stormlib PRIVATE NAPI_VERSION=8 NAPI_CPP_EXCEPTIONS)
if(WIN32)
  target_compile_definitions(node_stormlib PRIVATE UNICODE _UNICODE)
endif()
target_link_libraries(node_stormlib PRIVATE StormLib::storm ${CMAKE_JS_LIB})
if(MSVC AND CMAKE_JS_NODELIB_DEF AND CMAKE_JS_NODELIB_TARGET)
  execute_process(COMMAND ${CMAKE_AR} /def:${CMAKE_JS_NODELIB_DEF}
    /out:${CMAKE_JS_NODELIB_TARGET} ${CMAKE_STATIC_LINKER_FLAGS}
    COMMAND_ERROR_IS_FATAL ANY)
endif()
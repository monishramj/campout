cmake_minimum_required(VERSION 3.14)

project(campout LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)

include(FetchContent)
FetchContent_Declare(json URL https://github.com/nlohmann/json/releases/download/v3.11.3/json.tar.xz)
FetchContent_MakeAvailable(json)

add_executable(campout src/main.cpp src/game_server.cpp src/map.cpp)

target_link_libraries(campout PRIVATE nlohmann_json::nlohmann_json)
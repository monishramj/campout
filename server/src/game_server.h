#ifndef GAME_SERVER
#define GAME_SERVER

#include "map.h"
#include "player.h"
#include "types.h"
#include <nlohmann/json.hpp>
#include <string>
#include <unordered_map>

constexpr int TICK_RATE = 50;
constexpr int MAX_FRAME_TIME_MULTIPLIER = 5;
constexpr int MAX_OWED_TICKS = 15;
constexpr float CAMPFIRE_RATE = .083f;
constexpr int DAY_LENGTH = 7200;
constexpr size_t MAX_LINE_LEN = 8192;

constexpr float HEALTH_DRAIN_RATE = .04f;
constexpr float FOOD_DRAIN_RATE = .02f;
constexpr float FOOD_RESTORE = 25.0f;
constexpr float FUEL_RESTORE = 30.0f;
constexpr float PICKUP_RADIUS = 0.6f;
constexpr float PLAYER_SPEED = .2f;
constexpr int SPAWN_X = 10;
constexpr int SPAWN_Y = 10;

extern std::unordered_map<std::string, Player> players;
extern int tick_count;
extern int server_fd;

void start();
void tick();
void add_player(Player player);
void remove_player(std::string sess_id);
void move_player(std::string sess_id, InputType dir);
void handle_player_action(std::string sess_id, nlohmann::json &j);
static bool write_all(int fd, const std::string &data);
// std::string get_state();
std::string get_snapshot();
std::string get_map();

#endif

#ifndef GAME_SERVER
#define GAME_SERVER

#include "map.h"
#include "types.h"
#include "player.h"
#include <unordered_map>
#include <string>

constexpr int TICK_RATE = 50;
constexpr float CAMPFIRE_RATE = .083f;

constexpr float PICKUP_RADIUS = 0.6f;
constexpr float PLAYER_SPEED = .1f;
constexpr int SPAWN_X = 10;
constexpr int SPAWN_Y = 10;

extern std::unordered_map<std::string, Player>
    players;
extern int tick_count;
extern int server_fd;

void start();
void tick();
void add_player(Player player);
void remove_player(std::string sess_id);
void move_player(std::string sess_id, InputType dir);
std::string get_state();

#endif
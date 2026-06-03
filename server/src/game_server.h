#ifndef GAME_SERVER
#define GAME_SERVER

#include "map.h"
#include "types.h"
#include "player.h"
#include <unordered_map>
#include <string>

extern std::unordered_map<std::string, Player> players;
extern int tick_count;
extern int server_fd;

void start();
void tick();
void socket_thread_func();
void add_player(const Player &player);
void remove_player(const std::string &sess_id);
void move_player(const std::string &sess_id, InputType dir);
std::string get_state();

#endif
#include "game_server.h"
#include <queue>
#include <mutex>
#include <sys/un.h>
#include <sys/socket.h>
#include <unistd.h>
#include <thread>
#include <cstdlib>
#include <ctime>
#include <chrono>
#include <algorithm>
#include <nlohmann/json.hpp>
#include <iostream>

struct InputMsg
{
  std::string sess_id;
  std::string type;
  std::string json;
};

static std::queue<InputMsg> input_q;
static std::mutex mutex_q;
std::unordered_map<std::string, Player> players{};
int tick_count = 0;
int server_fd = -1;

static void handle_connections(int client_fd)
{
  std::string buf;
  char tmp_buf[4096]{};
  int read_len = 0;
  do
  {
    read_len = read(client_fd, tmp_buf, sizeof(tmp_buf));
    buf.append(tmp_buf, read_len);
    size_t pos = buf.find("\n");
    while (pos != std::string::npos)
    {
      std::string line = buf.substr(0, pos);
      buf.erase(0, pos + 1);
      pos = buf.find("\n");

      try
      {
        nlohmann::json j = nlohmann::json::parse(line);
        InputMsg msg = {j["sess_id"], j["type"], line};
        std::lock_guard<std::mutex> lock(mutex_q);
        input_q.push(msg);
      }
      catch (const std::exception &e)
      {
        std::cerr << e.what() << '\n';
      }
    }
  } while (read_len > 0);

  close(client_fd);
}

static void socket_thread_func()
{
  const char *s_path = "/tmp/campout.sock";

  // socket
  sockaddr_un addr{};
  addr.sun_family = AF_UNIX;
  memcpy(addr.sun_path, s_path, sizeof(addr.sun_path));

  server_fd = socket(AF_UNIX, SOCK_STREAM, 0);
  if (server_fd < 0)
    return;

  // unlink
  unlink(s_path);

  // bind
  if (bind(server_fd, (struct sockaddr *)&addr, sizeof(addr)) < 0)
    return;

  // listen
  listen(server_fd, 3);

  // accept
  while (true)
  {
    int client_fd = accept(server_fd, nullptr, nullptr);
    std::thread(handle_connections, client_fd).detach();
  }
}

void add_player(Player player)
{
  std::string sess_id = std::to_string(tick_count) + "_" + std::to_string(rand()); // will be handled by Python lter
  player.sess_id = sess_id;
  player.x = SPAWN_X;
  player.y = SPAWN_Y;
  player.campsite.xpos = SPAWN_X;
  player.campsite.ypos = SPAWN_Y;

  players[sess_id] = player;
}

void remove_player(std::string sess_id)
{
  players.erase(sess_id);
}

void move_player(std::string sess_id, InputType dir)
{
  if (players.find(sess_id) == players.end())
    return;
  Player &player = players[sess_id];
  float new_x = player.x;
  float new_y = player.y;

  switch (dir)
  {
  case MOVE_LEFT:
    new_x -= PLAYER_SPEED;
    break;
  case MOVE_RIGHT:
    new_x += PLAYER_SPEED;
    break;
  case MOVE_UP:
    new_y += PLAYER_SPEED;
    break;
  case MOVE_DOWN:
    new_y -= PLAYER_SPEED;
    break;
  default:
    break;
  }

  if (new_x >= 0 && new_x < MAP_WIDTH && new_y >= 0 && new_y < MAP_HEIGHT)
  {
    if (map[(int)new_x][(int)new_y] < WALL)
    {
      player.x = new_x;
      player.y = new_y;
    }
  }
}

std::string get_state()
{
  //?! WIP
  nlohmann::json j;
  j["tick"] = tick_count;

  j["players"] = nlohmann::json::array();

  for (auto &[sess_id, player] : players)
  {
    j["players"].push_back({{"sess_id", player.sess_id},
                            {"name", player.name},
                            {"x", player.x},
                            {"y", player.y},
                            {"health", player.health},
                            {"fuel", player.campsite.fuel}});
  }

  j["items"] = nlohmann::json::array();
  for (auto &item : items)
  {
    if (!item.active)
      continue;
    j["items"].push_back({{"type", item.type},
                          {"subtype", item.subtype},
                          {"x", item.x},
                          {"y", item.y}});
  }

  return j.dump();
}

void tick()
{
  tick_count++;

  std::vector<InputMsg> input_v;

  // read input q
  mutex_q.lock();
  while (!input_q.empty())
  {
    input_v.push_back(std::move(input_q.front()));
    input_q.pop();
  }
  mutex_q.unlock();

  // input q - player add/remove, mvm, actions
  while (!input_v.empty())
  {
    InputMsg msg = input_v.back();
    input_v.pop_back();

    nlohmann::json j = nlohmann::json::parse(msg.json);
    if (msg.type == "add_player")
      add_player(Player{}); // will be handled by Python later
    else if (msg.type == "remove_player")
      remove_player(msg.sess_id);
    else if (msg.type == "move_player")
      move_player(msg.sess_id, j["dir"].get<InputType>());
    // TODO: add health checks for combat
  }

  // rate ticks - fuel - items

  // currently looping thru everything: naive approach, cna be fixed later if player map size increases
  for (auto &[sess_id, player] : players)
  {
    player.campsite.fuel -= CAMPFIRE_RATE;

    // if (player.health <= 0)
    //   remove_player(sess_id);
    for (int i = 0; i < MAX_ITEMS; i++)
    {
      if (!items[i].active)
        continue;
      if ((abs(player.x - items[i].x) < PICKUP_RADIUS) &&
          (abs(player.y - items[i].y) < PICKUP_RADIUS))
      {
        auto it = std::find_if(player.inven.begin(), player.inven.end(),
                               [&](const InventoryItem &inv)
                               { return inv.type == items[i].type &&
                                        inv.subtype == items[i].subtype; });
        if (it != player.inven.end())
          it->amt++;
        else
          player.inven.push_back({items[i].type, items[i].subtype, 1});
        items[i].active = false;
      }
    }
  }
}

void start()
{
  srand(time(nullptr));

  // set up items across map
  int items_idx = 0;
  int drop_chance = 40;
  for (int x = 0; x < MAP_WIDTH; x++)
  {
    for (int y = 0; y < MAP_HEIGHT; y++)
    {
      TileType tile = map[x][y];
      if (tile == HOUSE_FLOOR && (rand() % 100) < drop_chance)
      {
        WorldItem item = {
            (ItemType)(rand() % 3),
            "",
            (float)x, (float)y, true};
        if (items_idx >= MAX_ITEMS)
          break;
        items[items_idx++] = item;
      }
    }
    if (items_idx >= MAX_ITEMS)
      break;
  }

  // spawn thread
  std::thread(socket_thread_func).detach();

  // game loop
  while (1)
  {
    auto start = std::chrono::steady_clock::now();

    tick();

    auto end = std::chrono::steady_clock::now();
    auto duration = (std::chrono::duration_cast<std::chrono::milliseconds>(end - start));

    if (duration < std::chrono::milliseconds(TICK_RATE))
      std::this_thread::sleep_for(std::chrono::milliseconds(TICK_RATE) - duration);
  }
}
#include "game_server.h"
#include <algorithm>
#include <cerrno>
#include <chrono>
#include <condition_variable>
#include <cstdlib>
#include <ctime>
#include <iostream>
#include <mutex>
#include <nlohmann/json.hpp>
#include <queue>
#include <sys/socket.h>
#include <sys/un.h>
#include <thread>
#include <unistd.h>

struct InputMsg {
  std::string sess_id;
  std::string type;
  nlohmann::json j;
  int client_fd;
};

struct InputPayload {
  int client_fd;
  std::string payload;
};

struct DeathEvent {
  std::string sess_id;
  int kills;
  int days_survived;
};

static std::queue<InputMsg> input_q;
static std::queue<DeathEvent> death_q;
static std::mutex mutex_q;

static std::queue<InputPayload> payload_q;
static std::mutex mutex_pl;
static std::condition_variable cv_pl;

std::unordered_map<std::string, Player> players{};
int tick_count = 0;
int server_fd = -1;

static bool write_all(int fd, const std::string &data) {
  size_t total = 0;
  while (total < data.size()) {
    ssize_t write_len = write(fd, data.data() + total, data.size() - total);
    if (write_len == -1) {
      if (errno == EINTR) { // retry
        continue;
      } else {
        std::cerr << "Write returned -1, no EINTR: " << errno << '\n';
        return false;
      }
    }

    total += write_len;
  }
  return true;
}

static void enqueue_write(InputPayload msg) {
  mutex_pl.lock();
  payload_q.push(msg);
  mutex_pl.unlock();
  cv_pl.notify_one();
}

static void handle_writes_func() {
  while (true) {
    std::unique_lock<std::mutex> lk(mutex_pl);
    cv_pl.wait(lk, [] {
      return !payload_q.empty();
    }); // waits until a queue to write was notified

    std::vector<InputPayload> payload_v;

    // read payload q
    while (!payload_q.empty()) {
      payload_v.push_back(std::move(payload_q.front()));
      payload_q.pop();
    }
    lk.unlock();

    for (InputPayload &msg : payload_v) {
      write_all(msg.client_fd, msg.payload);
    }
  }
}

static void handle_connections(int client_fd) {
  std::string buf;
  char tmp_buf[4096]{};
  ssize_t read_len = 0;
  do {
    read_len = read(client_fd, tmp_buf, sizeof(tmp_buf));
    if (read_len == 0) { // if EOF
      close(client_fd);
      return;
    } else if (read_len == -1) {
      if (errno == EINTR) { // retry
        continue;
      } else {
        std::cerr << "Read returned -1, no EINTR: " << errno << '\n';
        close(client_fd);
        return;
      }
    }

    buf.append(tmp_buf, read_len);
    size_t pos = buf.find("\n");
    while (pos != std::string::npos) {
      std::string line = buf.substr(0, pos);
      buf.erase(0, pos + 1);
      pos = buf.find("\n");

      try {
        nlohmann::json j = nlohmann::json::parse(line);
        std::lock_guard<std::mutex> lock(mutex_q);
        input_q.push({j.value("sess_id", ""), j["type"], j, client_fd});
      } catch (const std::exception &e) {
        std::cerr << e.what() << '\n';
      }
    }
    if (buf.size() > MAX_LINE_LEN) {
      std::cerr << "Buffer size overloaded" << '\n';
      close(client_fd);
      return;
    }
  } while (read_len > 0);

  close(client_fd);
}

static void socket_thread_func() {
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
  while (true) {
    int client_fd = accept(server_fd, nullptr, nullptr);
    std::thread(handle_connections, client_fd).detach();
  }
}

void add_player(Player player) {
  player.x = SPAWN_X;
  player.y = SPAWN_Y;
  player.campsite.xpos = SPAWN_X;
  player.campsite.ypos = SPAWN_Y;
  player.joined_tick = tick_count;

  players[player.sess_id] = player;
}

void remove_player(std::string sess_id) { players.erase(sess_id); }

void move_player(std::string sess_id, InputType dir) {
  if (players.find(sess_id) == players.end())
    return;
  Player &player = players[sess_id];
  float new_x = player.x;
  float new_y = player.y;

  switch (dir) {
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

  if (new_x >= 0 && new_x < MAP_WIDTH && new_y >= 0 && new_y < MAP_HEIGHT) {
    if (map[(int)new_x][(int)new_y] < WALL) // make explicit function check
    {
      player.x = new_x;
      player.y = new_y;
    }
  }
}

void handle_player_action(std::string sess_id, nlohmann::json &j) {
  if (players.find(sess_id) == players.end())
    return;
  Player &player = players[sess_id];
  std::string action = j["action"];

  if (action == "CONSUME") {
    for (size_t i = 0; i < player.inven.size(); i++) {
      InventoryItem &item = player.inven[i];
      if (item.type == FOOD && item.amt > 0) {
        player.food = ((player.food + FOOD_RESTORE) <= MAX_FOOD)
                          ? (player.food + FOOD_RESTORE)
                          : MAX_FOOD;
        if (--item.amt <= 0) {
          player.inven.erase(player.inven.begin() + i);
        }
        break;
      }
    }
  } else if (action == "USE_FUEL") {
    for (size_t i = 0; i < player.inven.size(); i++) {
      InventoryItem &item = player.inven[i];
      if (item.type == FUEL && item.amt > 0) {
        player.campsite.fuel =
            ((player.campsite.fuel + FUEL_RESTORE) <= MAX_FUEL)
                ? (player.campsite.fuel + FUEL_RESTORE)
                : MAX_FUEL;
        if (--item.amt <= 0) {
          player.inven.erase(player.inven.begin() + i);
        }
        break;
      }
    }
  }
}

std::string get_state() {
  nlohmann::json j;
  j["tick"] = tick_count;

  j["players"] = nlohmann::json::array();

  for (auto &[sess_id, player] : players) {
    nlohmann::json inv = nlohmann::json::array();
    for (auto &item : player.inven)
      inv.push_back(
          {{"type", item.type}, {"subtype", item.subtype}, {"amt", item.amt}});

    j["players"].push_back({{"sess_id", player.sess_id},
                            {"name", player.name},
                            {"x", player.x},
                            {"y", player.y},
                            {"health", player.health},
                            {"food", player.food},
                            {"fuel", player.campsite.fuel},
                            {"campsite_x", player.campsite.xpos},
                            {"campsite_y", player.campsite.ypos},
                            {"inventory", inv}});
  }

  j["items"] = nlohmann::json::array();
  for (auto &item : items) {
    if (!item.active)
      continue;
    j["items"].push_back({{"type", item.type},
                          {"subtype", item.subtype},
                          {"x", item.x},
                          {"y", item.y}});
  }

  return j.dump();
}

std::string get_map() {
  nlohmann::json j;
  j["width"] = MAP_WIDTH;
  j["height"] = MAP_HEIGHT;
  j["tiles"] = nlohmann::json::array();
  for (int x = 0; x < MAP_WIDTH; x++) {
    nlohmann::json col = nlohmann::json::array();
    for (int y = 0; y < MAP_HEIGHT; y++)
      col.push_back((int)map[x][y]);
    j["tiles"].push_back(col);
  }
  return j.dump();
}

std::string _get_deaths() {
  nlohmann::json j;
  j["deaths"] = nlohmann::json::array();
  while (!death_q.empty()) {
    DeathEvent event = death_q.front();
    death_q.pop();
    j["deaths"].push_back({{"sess_id", event.sess_id},
                           {"kills", event.kills},
                           {"days_survived", event.days_survived}});
  }
  return j.dump();
}

void tick() {
  tick_count++;

  std::vector<InputMsg> input_v;

  // read input q
  mutex_q.lock();
  while (!input_q.empty()) {
    input_v.push_back(std::move(input_q.front()));
    input_q.pop();
  }
  mutex_q.unlock();

  // input q - player add/remove, mvm, actions
  for (InputMsg &msg : input_v) {

    if (msg.type == "add_player") {
      Player p{};
      p.sess_id = msg.sess_id;
      add_player(p);
    } else if (msg.type == "remove_player") {
      // phase 3: mark sessions inactive, meaning equivalent to death so a
      // session stops then make sure that way the days survived is counted
      // accurately if player leaves they must restart the game to play again,
      // so they will have to start from day 1
      remove_player(msg.sess_id);
    } else if (msg.type == "move_player") {
      move_player(msg.sess_id, msg.j["dir"].get<InputType>());
    } else if (msg.type == "action") {
      handle_player_action(msg.sess_id, msg.j);
    } else if (msg.type == "get_state") {
      std::string state = get_state() + "\n";
      enqueue_write({msg.client_fd, state});
    } else if (msg.type == "get_map") {
      std::string m = get_map() + "\n";
      enqueue_write({msg.client_fd, m});
    } else if (msg.type == "get_deaths") {
      std::string deaths = _get_deaths() + "\n";
      enqueue_write({msg.client_fd, deaths});
    } else {
      std::cerr << "Unknown message type: " << msg.type << std::endl;
    }
    // TODO: add health checks for combat
  }

  // currently looping thru everything: naive approach, can be fixed later if
  // player map size increases
  std::vector<std::string> dead_players{};
  for (auto &[sess_id, player] : players) {
    // all rates
    if (player.campsite.fuel > 0) {
      player.campsite.fuel -= CAMPFIRE_RATE;
      if (player.campsite.fuel < 0)
        player.campsite.fuel = 0;
    }

    if (player.food <= 0) {
      player.health -= HEALTH_DRAIN_RATE;
    } else {
      player.food -= FOOD_DRAIN_RATE;
      if (player.food < 0)
        player.food = 0;
    }

    if (player.health <= 0) {
      dead_players.push_back(player.sess_id);
      continue;
    }

    // item pickups
    for (int i = 0; i < MAX_ITEMS; i++) {
      if (!items[i].active)
        continue;
      if ((abs(player.x - items[i].x) < PICKUP_RADIUS) &&
          (abs(player.y - items[i].y) < PICKUP_RADIUS)) {
        auto it = std::find_if(player.inven.begin(), player.inven.end(),
                               [&](const InventoryItem &inv) {
                                 return inv.type == items[i].type &&
                                        inv.subtype == items[i].subtype;
                               });
        if (it != player.inven.end())
          it->amt++;
        else
          player.inven.push_back({items[i].type, items[i].subtype, 1});
        items[i].active = false;
      }
    }
  }

  for (std::string sess_id : dead_players) {
    int days_survived =
        (tick_count - players[sess_id].joined_tick) / DAY_LENGTH;
    DeathEvent event = {sess_id, players[sess_id].kills, days_survived};
    death_q.push(event);
    remove_player(sess_id);
  }
}

void start() {
  srand(time(nullptr));

  // set up items across map
  int items_idx = 0;
  int drop_chance = 40;
  for (int x = 0; x < MAP_WIDTH; x++) {
    for (int y = 0; y < MAP_HEIGHT; y++) {
      TileType tile = map[x][y];
      if (tile == HOUSE_FLOOR && (rand() % 100) < drop_chance) {
        WorldItem item = {(ItemType)(rand() % 3), "", (float)x, (float)y, true};
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
  std::thread(handle_writes_func).detach();

  // game loop
  while (1) {
    auto start = std::chrono::steady_clock::now();

    tick();

    auto end = std::chrono::steady_clock::now();
    auto duration =
        (std::chrono::duration_cast<std::chrono::milliseconds>(end - start));

    if (duration < std::chrono::milliseconds(TICK_RATE))
      std::this_thread::sleep_for(std::chrono::milliseconds(TICK_RATE) -
                                  duration);
  }
}

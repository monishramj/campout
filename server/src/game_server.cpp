#include "game_server.h"
#include <queue>
#include <mutex>
#include <sys/un.h>
#include <sys/socket.h>
#include <unistd.h>
#include <thread>

struct InputMsg
{
  std::string sess_id;
  std::string type;
  std::string json;
};

static std::queue<InputMsg> input_queue;
static std::mutex queue_mutex;
std::unordered_map<std::string, Player> players{};
int tick_count = 0;
int server_fd = -1;

void start()
{
}

void tick()
{
}

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

      // parse it!
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

void add_player(const Player &player)
{
}

void remove_player(const std::string &sess_id)
{
}

void move_player(const std::string &sess_id, InputType dir)
{
}

std::string get_state()
{
  // TODO
  return "";
}
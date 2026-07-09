#include "game_server.h"
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>

int main(int argc, char const *argv[]) {

  struct sigaction sa;

  sa.sa_handler = SIG_IGN;
  sigemptyset(&sa.sa_mask);
  sa.sa_flags = 0;

  if (sigaction(SIGPIPE, &sa, NULL) == -1) {
    perror("sigaction");
    exit(EXIT_FAILURE);
  }
  start();
  return 0;
}

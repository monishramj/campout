## Phase 2.5

- for the read(), wrap in a try catch?
- no, just if else for return val

- for SIGPIPE, i odn't need to mind about the OS differences, I always test in
  Linux. so, i jsut want safer code with less implementation, which is most
  likely SIG_IGN at startup which covers everything in the future verses send
  with the flag per call. i think...

- write() moved ot own thread, using conditional var with mutex for its own
  output payloads...
  - now, system isn't hit with crashes or stutters when one write stalls, its
    async
  - this does mean when reconnected, any writes queued will be immediately
    pushed, causing a lag spike.
    - this will be fixed soon with websockets

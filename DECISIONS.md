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

- PROTOCOL done: multiplexing is one connection with types for each msg, and an
  req_id (the sess_id), response echoes it. both are needed for single
  connection. moving away from two connections.

- fixed timestep, now simulates missed timesteps and caps
  - issue is that i beleive the day system might be a little cooked but i think
    we fix that later, as ticks might not be the best way to count day length.

- !ISSUE!! : tick rate based day system is variable and not right, make it
  server side on a set itmer so tick lag doens't increase day itme length

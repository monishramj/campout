## Phase 2.5

- for the read(), wrap in a try catch?
- no, just if else for return val

- for SIGPIPE, i odn't need to mind about the OS differences, I always test in
  Linux. so, i jsut want safer code with less implementation, which is most
  likely SIG_IGN at startup which covers everything in the future verses send
  with the flag per call. i think...

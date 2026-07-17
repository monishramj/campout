# Campout Websocket Protocol

## Notes

- all sess_id are the token_id, not the sequential ID of the session itself.

## Version

v1.1

basic version numbering: v.x.y (e.g. v.1.0)

x - big changes (big msg additions)

y - smaller fix ups / changes

both sides need to operate on the same protocol version

## C++ <-> Gateway (Unix socket, /tmp/campout.sock)

newline-delimited JSON, UTF-8, max line length 8192 bytes <MAX_LINE_LEN> in
game_server.h

### Multiplexing

Single persistent connection, shared by requests and unsolicited pushes. Every
message carries a `type`; the reader on each side dispatches by type.

req_id: UUID, not based off time, unique per request, echoed in response. newly
gen by whoever sends request (the gateway, for every C++-bound request) -- NOT
the sess_id, since one session issues many requests and sess_id can't
disambiguate between them. Messages with no request/response pairing
(`move_player`, `action`, `attack`, `snapshot`, `death_ack`) do not carry
a req_id.

### Messages: gateway -> C++

type: add_player, remove_player, move_player, action, attack, get_map,
death_ack

json body

- add_player
  - req_id
  - sess_id
  - player
    - currently we spawn in a new player but eventually we will need the
      player's information for stuff that stays between sessions
  - request/response: rejected if the world is at MAX_PLAYERS (50) AND
    sess_id is not already present (a reconnect for an existing sess_id
    always succeeds -- it isn't a new slot). See response below.

- remove_player
  - req_id
  - sess_id

- move_player
  - sess_id
  - seq
    - identifies the client INPUT CYCLE, not the message. every direction held
      in one cycle is sent as its own message sharing that seq; C++ folds them
      into one intent vector (per-axis, last one wins) so a diagonal is one
      step, not two. monotonically increasing per session.
  - direction
    - folded into the cycle's intent vector server-side (0.D), not applied
      immediately -- fire-and-forget, no req_id
  - cycles QUEUE server-side and exactly one is applied per tick (that is the
    per-tick speed cap -- spamming inputs just fills the queue, capped at
    MAX_PENDING_INTENTS, drop-oldest on overflow). a cycle is never collapsed
    into another, so "one client cycle == one step" holds exactly and client
    prediction does not drift.
  - a message whose seq <= last_procs_seq is ignored (its cycle already ran)

- action
  - sess_id
  - action_type
    - CONSUME
    - USE_FUEL
  - fire-and-forget, no req_id

- attack
  - sess_id
  - fire-and-forget, no req_id; resolved server-side against a per-player attack
    cooldown (ticks) and 1.5-tile proximity check

- get_map
  - req_id

- death_ack
  - acked_id
    - highest DeathEvent id the gateway has durably written to Postgres; C++
      discards every buffered death with id <= acked_id
  - no req_id (not a request/response pair)

### Messages: C++ -> gateway

snapshot sent out every tick to gateway, no req_id:

- tick
- world_id
  - reserved for Phase 4 sharding; always 0 for now
- players[]
  - last_procs_seq
    - highest move_player seq whose cycle is APPLIED into this snapshot's x/y
      (acked on apply, not on receive). the client drops every pending cycle
      <= this and replays the rest from x/y. -1 before any cycle has run.
- items[]
- entities[]
- cycle
  - phase: DAY | NIGHT
  - time_remaining (ticks)

type: add_player, get_map, get_deaths, snapshot

req_id: UUID, not based off time, unique per request, echoed in response

- add_player
  - req_id (echoed)
  - success
    - false only when sess_id is new and the world is at MAX_PLAYERS; the
      gateway rejects the WebSocket connection on false, never lets it go
      live

- get_map
  - req_id (echoed)
  - map

- get_deaths
  - req_id (echoed)
  - deaths[]
    - id
      - monotonic, assigned by C++ when the death is recorded
    - sess_id
    - kills
    - days_survived
  - non-destructive: includes every event with id > last acked_id, does NOT
    remove them from the pending buffer -- only death_ack does that

## Browser <-> Gateway (WebSocket)

- connect: websocket handshake gets done, no player attached yet
  - starts authenticate + timeout
- authenticate: client sends `{type: authenticate, token}` -> gateway validates
  against is_active, and token_id
  - timeout: 15 seconds
  - failure: asks for restart of client browser / retry log in. gateway sends
    error and closes the initial connection
    - {type: auth_fail, reason:}
- live: browser->gateway then gateway->server
  - gateway pushes snapshot to browser every tick (fan-out: one C++ snapshot, N
    identical sends -- never re-serialized per client)
  - client never sends sess_id after authenticate -- identity is bound to the
    connection, stamped server-side
  - duplicate token: take the new one, remove the old
    - old conection shows it's been reassigned
      - {type: kicked, reason: new connection}
- disconnect:
  - removes the player, routed through the same session-end path as an in-game
    death (days_survived etc. get written, not silently dropped)

# Campout Websocket Protocol

## Notes

- all sess_id are the token_id, not the sequential ID of the session itself.

## Version

v1.0

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
(`move_player`, `player_action`, `attack`, `snapshot`, `death_ack`) do not carry
a req_id.

### Messages: gateway -> C++

type: add_player, remove_player, move_player, player_action, attack, get_map,
death_ack

json body

- add_player
  - req_id
  - sess_id
  - player
    - currently we spawn in a new player but eventually we will need the
      player's information for stuff that stays between sessions

- remove_player
  - req_id
  - sess_id

- move_player
  - sess_id
  - direction
    - accumulated into a per-tick intent vector server-side (0.D), not applied
      immediately -- fire-and-forget, no req_id

- player_action
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
- items[]
- entities[]
- cycle
  - phase: DAY | NIGHT
  - time_remaining (ticks)

type: get_map, get_deaths, snapshot

req_id: UUID, not based off time, unique per request, echoed in response

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

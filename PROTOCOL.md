# Campout Websocket Protocol

## Notes

- all sess_id are the token_id, not the sequential ID of the session itself.

## Version

basic version numbering: v.x.y (e.g. v.1.0)

x - big changes (big msg additions)

y - smaller fix ups / changeshow am

both sides need to operate on the same protocol version

## C++ <-> Gateway (Unix socket, /tmp/campout.sock)

newline-delimited JSON, UTF-8, max line length <MAX_LINE_LEN>.

### Multiplexing

req_id, UUID, routed based on type.

### Messages: gateway -> C++

type: add_player, remove_player, move_player, player_action, death_ack

json body

- add_player
  - player
    - currently we spawn in a new player but eventually we will need the
      player's information for stuff that stays between sessions
  - sess_id

- remove_player
  - sess_id

- move_player
  - sess_id
  - direction

- player_action
  - sess_id
  - action_type
    - CONSUME
    - USE_FUEL

- death_ack
  - list of sess_ids (deaths written)
    - C++ handles whether death is sent or not, (waiting->sent->received)
    - C++'s get_deaths includes waiting and sent, gateway sends every tick,
      deletes from mem once death_ack confirms it

### Messages: C++ -> gateway

snapshots lways sent out every tick to gateway:

- tick
- world_id
- players[]
- items[]

type: get_state, get_map, get_deaths, snapshot

req_id: UUID, not based off time.

- get_state
  - state

- get_map
  - map

- get_deaths
  - deaths
    - death
      - sess_id

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
  - gateway pushes snapshot to browser
  - duplicate token: take the new one, remove the old
    - old conection shows it's been reassigned
      - {type: kicked, reason: new connection}
- disconnect:
  - removes the player

#ifndef PLAYER_H
#define PLAYER_H

#include "types.h"
#include <deque>
#include <string>
#include <vector>

constexpr float MAX_HEALTH = 100.0f;
constexpr float MAX_FUEL = 100.0f;
constexpr float MAX_FOOD = 100.0f;

struct InventoryItem {
  ItemType type;
  std::string subtype;
  int amt;
};

// One client input cycle == one server step. Every move_player message the
// client sent in the same cycle shares a seq and folds into one of these, so a
// diagonal is one step, not two.
struct IntentCycle {
  int seq;
  float dx = 0, dy = 0;
};

struct Player {
  std::string sess_id;
  float x, y;
  float health = MAX_HEALTH;
  float food = MAX_FOOD;
  int joined_tick = 0;
  int kills = 0;
  struct Campsite {
    float xpos, ypos;
    float fuel = MAX_FUEL;
  } campsite;
  std::string name;
  std::vector<InventoryItem> inven;

  // Cycles wait their turn instead of overwriting each other -- exactly one is
  // applied per tick. That IS the speed cap (0.D): a client spamming inputs just
  // fills the queue, it never gets more than one step per tick. Collapsing them
  // (the old behaviour) silently ate cycles the client had already predicted.
  std::deque<IntentCycle> intent_q;
  int last_procs_seq = -1; // -1 = nothing applied yet; seq 0 is a real cycle
};

#endif

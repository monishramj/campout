#ifndef PLAYER_H
#define PLAYER_H

#include "types.h"
#include <string>
#include <vector>

constexpr float MAX_HEALTH = 100.0f;
constexpr float MAX_FUEL = 100.0f;
constexpr float MAX_FOOD = 100.0f;

struct InventoryItem
{
  ItemType type;
  std::string subtype;
  int amt;
};

struct Player
{
  std::string sess_id;
  float x, y;
  float health = MAX_HEALTH;
  float food = MAX_FOOD;
  struct Campsite
  {
    float xpos, ypos;
    float fuel = MAX_FUEL;
  } campsite;
  std::string name;
  std::vector<InventoryItem> inven;
};

#endif
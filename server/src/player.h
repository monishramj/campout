#ifndef PLAYER_H
#define PLAYER_H

#include "types.h"
#include <string>
#include <vector>

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
  float health = 100.0f;
  struct Campsite
  {
    float xpos, ypos;
    float fuel = 100.0f;
  } campsite;
  std::string name;
  std::vector<InventoryItem> inven;
};

#endif
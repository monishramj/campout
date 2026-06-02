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
  int health;
  struct Campsite
  {
    float xpos, ypos;
    float fuel;
  } campsite;
  std::string name;
  std::vector<InventoryItem> inven;
};

#endif
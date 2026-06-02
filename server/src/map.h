#ifndef MAP_H
#define MAP_H

#include "types.h"
#include <string>

struct WorldItem
{
  ItemType type;
  std::string subtype;
  float x;
  float y;
};

constexpr int MAP_WIDTH = 20;
constexpr int MAP_HEIGHT = 20;
constexpr int MAX_ITEMS = 100;
extern TileType map[MAP_WIDTH][MAP_HEIGHT];
extern WorldItem items[MAX_ITEMS]; // not sure if to hard code # of total items on the map at a hard cap or no? for now, set

#endif

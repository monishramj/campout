#include "map.h"

#define G GRASS
#define F FOREST
#define W WALL
#define H HOUSE_FLOOR
#define P WATER

// very basic map for testing
TileType map[MAP_WIDTH][MAP_HEIGHT] = {
    {F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F},
    {F, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, F},
    {F, G, W, W, W, W, W, G, G, G, G, G, G, G, G, G, G, G, G, F},
    {F, G, W, H, H, H, W, G, G, G, G, G, G, G, G, G, G, G, G, F},
    {F, G, W, H, H, H, W, G, G, G, G, G, G, G, G, G, G, G, G, F},
    {F, G, W, H, H, H, W, G, G, G, G, G, G, G, G, G, G, G, G, F},
    {F, G, W, H, H, H, W, G, G, G, G, G, G, G, G, G, G, G, G, F},
    {F, G, W, W, W, W, W, G, G, G, G, G, G, G, G, G, G, G, G, F},
    {F, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, F},
    {F, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, F},
    {F, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, F},
    {F, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, F},
    {F, G, G, G, G, G, G, G, G, G, G, G, G, P, P, P, P, G, G, F},
    {F, G, G, G, G, G, G, G, G, G, G, G, G, P, P, P, P, G, G, F},
    {F, G, G, G, G, G, G, G, G, G, G, G, G, P, P, P, P, G, G, F},
    {F, G, G, G, G, G, G, G, G, G, G, G, G, P, P, P, P, G, G, F},
    {F, G, G, G, G, G, G, G, G, G, G, G, G, P, P, P, P, G, G, F},
    {F, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, F},
    {F, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, F},
    {F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F, F},
};

#undef G
#undef F
#undef W
#undef H
#undef P

WorldItem items[MAX_ITEMS]{};
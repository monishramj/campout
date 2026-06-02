#ifndef GAME_TYPES
#define GAME_TYPES

enum TileType
{
  GRASS,
  FOREST,
  WALL,
  HOUSE_FLOOR,
  WATER
};

enum ItemType
{
  FUEL,
  MELEE,
  FOOD
};

enum InputType
{
  MOVE_UP,
  MOVE_DOWN,
  MOVE_LEFT,
  MOVE_RIGHT
};

enum ActionType
{
  CONSUME,
  USE_FUEL
};

#endif

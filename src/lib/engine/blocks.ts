// ==========================================
// SinCraft - Block Types & Definitions
// Extended block palette for survival gameplay
// ==========================================

export enum BlockType {
  Air = 0,
  // Natural
  Grass = 1,
  Dirt = 2,
  Stone = 3,
  Cobblestone = 4,
  Sand = 5,
  Gravel = 6,
  // Wood
  OakLog = 10,
  OakLeaves = 11,
  BirchLog = 12,
  BirchLeaves = 13,
  SpruceLog = 14,
  SpruceLeaves = 15,
  OakPlanks = 20,
  BirchPlanks = 21,
  SprucePlanks = 22,
  // Ores
  CoalOre = 30,
  IronOre = 31,
  GoldOre = 32,
  DiamondOre = 33,
  // Building
  Glass = 40,
  Brick = 41,
  StoneBrick = 42,
  Snow = 50,
  Ice = 51,
  Water = 60,
  Lava = 61,
  Bedrock = 70,
  // Farming
  Farmland = 80,
  Wheat = 81,
  // Lighting
  Torch = 90,
  Glowstone = 91,
  // Decorative
  WoolWhite = 100,
  WoolRed = 101,
  WoolBlue = 102,
  WoolGreen = 103,
  WoolYellow = 104,
  WoolBlack = 105,
}

// Block properties: colors per face, solid, transparent, light emission
export interface BlockDef {
  top: number[];
  side: number[];
  bottom: number[];
  solid: boolean;
  transparent: boolean;
  emissive: number; // 0-1 light emission
  name: string;
  hardness: number; // 0-10, time to break
  drops?: BlockType; // what it drops when broken
}

export const BLOCK_COLORS: Record<number, BlockDef> = {
  // Natural blocks
  [BlockType.Grass]: {
    top: [0.35, 0.55, 0.20], side: [0.55, 0.41, 0.08], bottom: [0.55, 0.41, 0.08],
    solid: true, transparent: false, emissive: 0, name: 'Grass', hardness: 3, drops: BlockType.Dirt,
  },
  [BlockType.Dirt]: {
    top: [0.55, 0.41, 0.08], side: [0.55, 0.41, 0.08], bottom: [0.50, 0.37, 0.07],
    solid: true, transparent: false, emissive: 0, name: 'Dirt', hardness: 2,
  },
  [BlockType.Stone]: {
    top: [0.55, 0.55, 0.55], side: [0.50, 0.50, 0.50], bottom: [0.45, 0.45, 0.45],
    solid: true, transparent: false, emissive: 0, name: 'Stone', hardness: 6, drops: BlockType.Cobblestone,
  },
  [BlockType.Cobblestone]: {
    top: [0.42, 0.42, 0.42], side: [0.38, 0.38, 0.38], bottom: [0.35, 0.35, 0.35],
    solid: true, transparent: false, emissive: 0, name: 'Cobblestone', hardness: 6,
  },
  [BlockType.Sand]: {
    top: [0.85, 0.80, 0.52], side: [0.80, 0.75, 0.47], bottom: [0.75, 0.70, 0.42],
    solid: true, transparent: false, emissive: 0, name: 'Sand', hardness: 2,
  },
  [BlockType.Gravel]: {
    top: [0.50, 0.48, 0.46], side: [0.47, 0.45, 0.43], bottom: [0.43, 0.41, 0.39],
    solid: true, transparent: false, emissive: 0, name: 'Gravel', hardness: 3,
  },
  // Wood - Oak
  [BlockType.OakLog]: {
    top: [0.63, 0.50, 0.37], side: [0.42, 0.26, 0.15], bottom: [0.63, 0.50, 0.37],
    solid: true, transparent: false, emissive: 0, name: 'Oak Log', hardness: 4,
  },
  [BlockType.OakLeaves]: {
    top: [0.18, 0.42, 0.18], side: [0.15, 0.38, 0.15], bottom: [0.12, 0.32, 0.12],
    solid: true, transparent: false, emissive: 0, name: 'Oak Leaves', hardness: 1,
  },
  // Wood - Birch
  [BlockType.BirchLog]: {
    top: [0.78, 0.72, 0.62], side: [0.85, 0.82, 0.75], bottom: [0.78, 0.72, 0.62],
    solid: true, transparent: false, emissive: 0, name: 'Birch Log', hardness: 4,
  },
  [BlockType.BirchLeaves]: {
    top: [0.30, 0.50, 0.20], side: [0.25, 0.45, 0.18], bottom: [0.20, 0.38, 0.15],
    solid: true, transparent: false, emissive: 0, name: 'Birch Leaves', hardness: 1,
  },
  // Wood - Spruce
  [BlockType.SpruceLog]: {
    top: [0.45, 0.32, 0.20], side: [0.30, 0.20, 0.12], bottom: [0.45, 0.32, 0.20],
    solid: true, transparent: false, emissive: 0, name: 'Spruce Log', hardness: 4,
  },
  [BlockType.SpruceLeaves]: {
    top: [0.12, 0.28, 0.15], side: [0.10, 0.25, 0.12], bottom: [0.08, 0.22, 0.10],
    solid: true, transparent: false, emissive: 0, name: 'Spruce Leaves', hardness: 1,
  },
  // Planks
  [BlockType.OakPlanks]: {
    top: [0.75, 0.60, 0.38], side: [0.72, 0.56, 0.34], bottom: [0.70, 0.54, 0.32],
    solid: true, transparent: false, emissive: 0, name: 'Oak Planks', hardness: 4,
  },
  [BlockType.BirchPlanks]: {
    top: [0.85, 0.78, 0.65], side: [0.82, 0.75, 0.62], bottom: [0.80, 0.72, 0.60],
    solid: true, transparent: false, emissive: 0, name: 'Birch Planks', hardness: 4,
  },
  [BlockType.SprucePlanks]: {
    top: [0.55, 0.40, 0.25], side: [0.50, 0.37, 0.22], bottom: [0.48, 0.35, 0.20],
    solid: true, transparent: false, emissive: 0, name: 'Spruce Planks', hardness: 4,
  },
  // Ores
  [BlockType.CoalOre]: {
    top: [0.40, 0.40, 0.40], side: [0.38, 0.38, 0.38], bottom: [0.35, 0.35, 0.35],
    solid: true, transparent: false, emissive: 0, name: 'Coal Ore', hardness: 6,
  },
  [BlockType.IronOre]: {
    top: [0.55, 0.52, 0.48], side: [0.50, 0.48, 0.44], bottom: [0.45, 0.42, 0.38],
    solid: true, transparent: false, emissive: 0, name: 'Iron Ore', hardness: 7,
  },
  [BlockType.GoldOre]: {
    top: [0.55, 0.52, 0.35], side: [0.50, 0.48, 0.32], bottom: [0.45, 0.42, 0.28],
    solid: true, transparent: false, emissive: 0, name: 'Gold Ore', hardness: 7,
  },
  [BlockType.DiamondOre]: {
    top: [0.50, 0.58, 0.65], side: [0.48, 0.55, 0.62], bottom: [0.45, 0.52, 0.58],
    solid: true, transparent: false, emissive: 0, name: 'Diamond Ore', hardness: 8,
  },
  // Building
  [BlockType.Glass]: {
    top: [0.70, 0.80, 0.90], side: [0.65, 0.75, 0.85], bottom: [0.60, 0.70, 0.80],
    solid: true, transparent: true, emissive: 0, name: 'Glass', hardness: 1,
  },
  [BlockType.Brick]: {
    top: [0.60, 0.30, 0.25], side: [0.55, 0.28, 0.22], bottom: [0.50, 0.25, 0.20],
    solid: true, transparent: false, emissive: 0, name: 'Brick', hardness: 6,
  },
  [BlockType.StoneBrick]: {
    top: [0.48, 0.48, 0.48], side: [0.45, 0.45, 0.45], bottom: [0.42, 0.42, 0.42],
    solid: true, transparent: false, emissive: 0, name: 'Stone Brick', hardness: 7,
  },
  [BlockType.Snow]: {
    top: [0.95, 0.95, 0.98], side: [0.88, 0.88, 0.92], bottom: [0.80, 0.80, 0.85],
    solid: true, transparent: false, emissive: 0, name: 'Snow', hardness: 2,
  },
  [BlockType.Ice]: {
    top: [0.60, 0.75, 0.90], side: [0.55, 0.70, 0.85], bottom: [0.50, 0.65, 0.80],
    solid: true, transparent: true, emissive: 0, name: 'Ice', hardness: 2,
  },
  [BlockType.Water]: {
    top: [0.20, 0.40, 0.70], side: [0.15, 0.35, 0.65], bottom: [0.10, 0.30, 0.60],
    solid: false, transparent: true, emissive: 0, name: 'Water', hardness: 0,
  },
  [BlockType.Lava]: {
    top: [0.90, 0.40, 0.10], side: [0.80, 0.30, 0.05], bottom: [0.70, 0.20, 0.02],
    solid: true, transparent: false, emissive: 1.0, name: 'Lava', hardness: 100,
  },
  [BlockType.Bedrock]: {
    top: [0.20, 0.20, 0.20], side: [0.18, 0.18, 0.18], bottom: [0.15, 0.15, 0.15],
    solid: true, transparent: false, emissive: 0, name: 'Bedrock', hardness: 100,
  },
  // Farming
  [BlockType.Farmland]: {
    top: [0.45, 0.32, 0.15], side: [0.55, 0.41, 0.08], bottom: [0.55, 0.41, 0.08],
    solid: true, transparent: false, emissive: 0, name: 'Farmland', hardness: 2,
  },
  [BlockType.Wheat]: {
    top: [0.65, 0.55, 0.20], side: [0.55, 0.45, 0.15], bottom: [0.45, 0.35, 0.08],
    solid: true, transparent: false, emissive: 0, name: 'Wheat', hardness: 1,
  },
  // Lighting
  [BlockType.Torch]: {
    top: [0.90, 0.75, 0.30], side: [0.80, 0.65, 0.20], bottom: [0.50, 0.35, 0.10],
    solid: false, transparent: true, emissive: 0.8, name: 'Torch', hardness: 1,
  },
  [BlockType.Glowstone]: {
    top: [0.85, 0.80, 0.55], side: [0.80, 0.75, 0.50], bottom: [0.75, 0.70, 0.45],
    solid: true, transparent: false, emissive: 0.9, name: 'Glowstone', hardness: 4,
  },
  // Decorative
  [BlockType.WoolWhite]: {
    top: [0.90, 0.90, 0.90], side: [0.85, 0.85, 0.85], bottom: [0.80, 0.80, 0.80],
    solid: true, transparent: false, emissive: 0, name: 'White Wool', hardness: 3,
  },
  [BlockType.WoolRed]: {
    top: [0.75, 0.20, 0.20], side: [0.70, 0.18, 0.18], bottom: [0.65, 0.15, 0.15],
    solid: true, transparent: false, emissive: 0, name: 'Red Wool', hardness: 3,
  },
  [BlockType.WoolBlue]: {
    top: [0.20, 0.30, 0.75], side: [0.18, 0.28, 0.70], bottom: [0.15, 0.25, 0.65],
    solid: true, transparent: false, emissive: 0, name: 'Blue Wool', hardness: 3,
  },
  [BlockType.WoolGreen]: {
    top: [0.20, 0.55, 0.20], side: [0.18, 0.50, 0.18], bottom: [0.15, 0.45, 0.15],
    solid: true, transparent: false, emissive: 0, name: 'Green Wool', hardness: 3,
  },
  [BlockType.WoolYellow]: {
    top: [0.80, 0.75, 0.20], side: [0.75, 0.70, 0.18], bottom: [0.70, 0.65, 0.15],
    solid: true, transparent: false, emissive: 0, name: 'Yellow Wool', hardness: 3,
  },
  [BlockType.WoolBlack]: {
    top: [0.15, 0.15, 0.15], side: [0.12, 0.12, 0.12], bottom: [0.10, 0.10, 0.10],
    solid: true, transparent: false, emissive: 0, name: 'Black Wool', hardness: 3,
  },
};

// Hotbar blocks for creative mode
export const HOTBAR_BLOCKS = [
  BlockType.Grass,
  BlockType.Dirt,
  BlockType.Stone,
  BlockType.OakLog,
  BlockType.OakPlanks,
  BlockType.Cobblestone,
  BlockType.Sand,
  BlockType.Glass,
  BlockType.Brick,
];

export const BLOCK_NAMES: Record<number, string> = {};
for (const [id, def] of Object.entries(BLOCK_COLORS)) {
  BLOCK_NAMES[Number(id)] = def.name;
}

// ==========================================
// Crafting Recipes
// ==========================================

export interface CraftingRecipe {
  result: BlockType;
  count: number;
  ingredients: { block: BlockType; count: number }[];
  pattern?: boolean; // if true, needs shapeless crafting
}

export const CRAFTING_RECIPES: CraftingRecipe[] = [
  // Planks from logs
  { result: BlockType.OakPlanks, count: 4, ingredients: [{ block: BlockType.OakLog, count: 1 }] },
  { result: BlockType.BirchPlanks, count: 4, ingredients: [{ block: BlockType.BirchLog, count: 1 }] },
  { result: BlockType.SprucePlanks, count: 4, ingredients: [{ block: BlockType.SpruceLog, count: 1 }] },
  // Building
  { result: BlockType.StoneBrick, count: 4, ingredients: [{ block: BlockType.Stone, count: 4 }] },
  { result: BlockType.Brick, count: 4, ingredients: [{ block: BlockType.Cobblestone, count: 4 }, { block: BlockType.Sand, count: 4 }] },
  // Glass
  { result: BlockType.Glass, count: 1, ingredients: [{ block: BlockType.Sand, count: 1 }] },
  // Glowstone
  { result: BlockType.Glowstone, count: 1, ingredients: [{ block: BlockType.Torch, count: 4 }] },
  // Torch
  { result: BlockType.Torch, count: 4, ingredients: [{ block: BlockType.OakPlanks, count: 1 }, { block: BlockType.CoalOre, count: 1 }] },
  // Wool
  { result: BlockType.WoolWhite, count: 1, ingredients: [{ block: BlockType.Wheat, count: 2 }] },
];

// ==========================================
// Inventory / Item helpers
// ==========================================

export interface ItemStack {
  block: BlockType;
  count: number;
}

export function createInventory(): ItemStack[] {
  // 36 slots: 9 hotbar + 27 main
  return new Array(36).fill(null).map(() => ({ block: BlockType.Air, count: 0 }));
}

export function addToInventory(inventory: ItemStack[], block: BlockType, count: number): boolean {
  // First try to stack with existing
  for (let i = 0; i < inventory.length; i++) {
    if (inventory[i].block === block && inventory[i].count > 0 && inventory[i].count < 64) {
      const canAdd = Math.min(count, 64 - inventory[i].count);
      inventory[i].count += canAdd;
      count -= canAdd;
      if (count <= 0) return true;
    }
  }
  // Then find empty slot
  for (let i = 0; i < inventory.length; i++) {
    if (inventory[i].count === 0) {
      const canAdd = Math.min(count, 64);
      inventory[i].block = block;
      inventory[i].count = canAdd;
      count -= canAdd;
      if (count <= 0) return true;
    }
  }
  return count <= 0;
}

export function removeFromInventory(inventory: ItemStack[], block: BlockType, count: number): boolean {
  // Remove from slots that have this block
  for (let i = 0; i < inventory.length && count > 0; i++) {
    if (inventory[i].block === block && inventory[i].count > 0) {
      const canRemove = Math.min(count, inventory[i].count);
      inventory[i].count -= canRemove;
      count -= canRemove;
      if (inventory[i].count === 0) {
        inventory[i].block = BlockType.Air;
      }
    }
  }
  return count <= 0;
}

export function hasItems(inventory: ItemStack[], block: BlockType, count: number): boolean {
  let total = 0;
  for (const slot of inventory) {
    if (slot.block === block) total += slot.count;
  }
  return total >= count;
}

export function getHotbarItems(inventory: ItemStack[]): ItemStack[] {
  return inventory.slice(0, 9);
}

export function countInventoryItems(inventory: ItemStack[]): number {
  return inventory.reduce((sum, s) => sum + s.count, 0);
}

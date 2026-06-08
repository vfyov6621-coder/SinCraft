// ==========================================
// Block types and face colors for voxel game
// ==========================================

export enum BlockType {
  Air = 0,
  Grass = 1,
  Dirt = 2,
  Stone = 3,
  Wood = 4,
  Leaves = 5,
  Sand = 6,
  Water = 7,
  Planks = 8,
  Cobblestone = 9,
  Snow = 10,
}

// Block colors per face: [top, side, bottom]
// Each color: [r, g, b] in 0-1
export const BLOCK_COLORS: Record<number, { top: number[]; side: number[]; bottom: number[]; solid: boolean }> = {
  [BlockType.Grass]: {
    top: [0.35, 0.55, 0.20],
    side: [0.55, 0.41, 0.08],
    bottom: [0.55, 0.41, 0.08],
    solid: true,
  },
  [BlockType.Dirt]: {
    top: [0.55, 0.41, 0.08],
    side: [0.55, 0.41, 0.08],
    bottom: [0.50, 0.37, 0.07],
    solid: true,
  },
  [BlockType.Stone]: {
    top: [0.55, 0.55, 0.55],
    side: [0.50, 0.50, 0.50],
    bottom: [0.45, 0.45, 0.45],
    solid: true,
  },
  [BlockType.Wood]: {
    top: [0.63, 0.50, 0.37],
    side: [0.42, 0.26, 0.15],
    bottom: [0.63, 0.50, 0.37],
    solid: true,
  },
  [BlockType.Leaves]: {
    top: [0.18, 0.42, 0.18],
    side: [0.15, 0.38, 0.15],
    bottom: [0.12, 0.32, 0.12],
    solid: true,
  },
  [BlockType.Sand]: {
    top: [0.85, 0.80, 0.52],
    side: [0.80, 0.75, 0.47],
    bottom: [0.75, 0.70, 0.42],
    solid: true,
  },
  [BlockType.Planks]: {
    top: [0.75, 0.60, 0.38],
    side: [0.72, 0.56, 0.34],
    bottom: [0.70, 0.54, 0.32],
    solid: true,
  },
  [BlockType.Cobblestone]: {
    top: [0.42, 0.42, 0.42],
    side: [0.38, 0.38, 0.38],
    bottom: [0.35, 0.35, 0.35],
    solid: true,
  },
  [BlockType.Snow]: {
    top: [0.95, 0.95, 0.98],
    side: [0.88, 0.88, 0.92],
    bottom: [0.80, 0.80, 0.85],
    solid: true,
  },
  [BlockType.Water]: {
    top: [0.20, 0.40, 0.70],
    side: [0.15, 0.35, 0.65],
    bottom: [0.10, 0.30, 0.60],
    solid: false,
  },
};

// Hotbar blocks for player
export const HOTBAR_BLOCKS = [
  BlockType.Grass,
  BlockType.Dirt,
  BlockType.Stone,
  BlockType.Wood,
  BlockType.Planks,
  BlockType.Cobblestone,
  BlockType.Sand,
  BlockType.Leaves,
  BlockType.Snow,
];

export const BLOCK_NAMES: Record<number, string> = {
  [BlockType.Grass]: 'Grass',
  [BlockType.Dirt]: 'Dirt',
  [BlockType.Stone]: 'Stone',
  [BlockType.Wood]: 'Wood',
  [BlockType.Leaves]: 'Leaves',
  [BlockType.Sand]: 'Sand',
  [BlockType.Planks]: 'Planks',
  [BlockType.Cobblestone]: 'Cobble',
  [BlockType.Snow]: 'Snow',
};

// ==========================================
// Chunk - 16x16 block column storage unit
// ==========================================

export const CHUNK_SIZE = 16;

export class Chunk {
  cx: number;
  cz: number;
  blocks: Uint8Array;
  dirty = true;
  private height: number;

  constructor(cx: number, cz: number, height: number) {
    this.cx = cx;
    this.cz = cz;
    this.height = height;
    this.blocks = new Uint8Array(CHUNK_SIZE * height * CHUNK_SIZE);
  }

  private idx(lx: number, ly: number, lz: number): number {
    return ly * CHUNK_SIZE * CHUNK_SIZE + lz * CHUNK_SIZE + lx;
  }

  getBlock(lx: number, ly: number, lz: number): number {
    if (lx < 0 || lx >= CHUNK_SIZE || ly < 0 || ly >= this.height || lz < 0 || lz >= CHUNK_SIZE) return 0;
    return this.blocks[this.idx(lx, ly, lz)];
  }

  setBlock(lx: number, ly: number, lz: number, type: number): void {
    if (lx < 0 || lx >= CHUNK_SIZE || ly < 0 || ly >= this.height || lz < 0 || lz >= CHUNK_SIZE) return;
    this.blocks[this.idx(lx, ly, lz)] = type;
    this.dirty = true;
  }

  isEmpty(): boolean {
    for (let i = 0; i < this.blocks.length; i++) {
      if (this.blocks[i] !== 0) return false;
    }
    return true;
  }

  nonEmptyCount(): number {
    let count = 0;
    for (let i = 0; i < this.blocks.length; i++) {
      if (this.blocks[i] !== 0) count++;
    }
    return count;
  }

  serialize(): string {
    let binary = '';
    for (let i = 0; i < this.blocks.length; i++) {
      binary += String.fromCharCode(this.blocks[i]);
    }
    return btoa(binary);
  }

  deserialize(data: string): void {
    const binary = atob(data);
    const len = Math.min(this.blocks.length, binary.length);
    for (let i = 0; i < len; i++) {
      this.blocks[i] = binary.charCodeAt(i);
    }
    for (let i = len; i < this.blocks.length; i++) {
      this.blocks[i] = 0;
    }
    this.dirty = true;
  }
}

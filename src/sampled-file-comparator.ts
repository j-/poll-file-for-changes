export type Region = {
  offset: number;
  length: number;
};

type Sample = Region & {
  data: Uint8Array;
};

export type SampledFileComparatorOptions = {
  /**
   * Target bytes per sample block.
   * For tiny files, blocks will be smaller and may cover the whole file.
   */
  blockSize?: number;

  /**
   * Target number of sample blocks.
   * For small files, the actual number of samples will be reduced.
   */
  sampleCount?: number;
};

/**
 * Probabilistic file equality checker based on sampling blocks.
 *
 * Call `init(file)` once to capture a baseline, then `isSame(file)` to compare
 * future snapshots against that baseline.
 *
 * For files <= blockSize, it reads and compares the entire file, so equality
 * is exact. For larger files, it samples multiple blocks.
 */
export class SampledFileComparator {
  private readonly blockSize: number;
  private readonly sampleCount: number;

  private baselineSize: number | null = null;
  private samples: Sample[] | null = null;

  constructor(options: SampledFileComparatorOptions = {}) {
    this.blockSize = options.blockSize ?? 4096;    // 4 KiB default
    this.sampleCount = options.sampleCount ?? 64;  // 64 samples default
  }

  getRegions() {
    if (!this.samples) {
      throw new Error('Comparator not yet initialized');
    }
    return this.samples.map((sample) => ({
      offset: sample.offset,
      length: sample.length,
    }));
  }

  /**
   * Initialize / persist a baseline from a File.
   * Must be called before `isSame`.
   */
  async init(file: File): Promise<void> {
    const size = file.size;

    // Empty file: trivial baseline.
    if (size === 0) {
      this.baselineSize = 0;
      this.samples = [];
      return;
    }

    // Tiny file: read the entire file as a single sample.
    if (size <= this.blockSize) {
      const data = await this.readBlock(file, 0, size);
      this.baselineSize = size;
      this.samples = [
        {
          offset: 0,
          length: data.length,
          data,
        },
      ];
      return;
    }

    // Larger file: sample multiple blocks.
    const blockSize = this.blockSize;

    // Maximum number of non-trivially overlapping blocks we can fit.
    const maxSamples = Math.ceil(size / blockSize);
    const count = Math.min(this.sampleCount, maxSamples);

    const samples: Sample[] = [];

    // Evenly spread `count` samples across the file.
    for (let i = 0; i < count; i++) {
      const ratio = (i + 0.5) / count; // midpoints over [0, 1)
      let offset = Math.floor(ratio * size) - Math.floor(blockSize / 2);

      if (offset < 0) offset = 0;
      if (offset + blockSize > size) {
        offset = Math.max(0, size - blockSize);
      }

      const data = await this.readBlock(file, offset, blockSize);
      samples.push({
        offset,
        length: data.length,
        data,
      });
    }

    this.baselineSize = size;
    this.samples = samples;
  }

  /**
   * Compare a new File to the persisted baseline.
   * Returns true if "considered the same" (all sampled blocks match).
   */
  async isSame(file: File): Promise<boolean> {
    if (this.baselineSize === null || this.samples === null) {
      throw new Error('SampledFileComparator: baseline not initialized. Call init(file) first.');
    }

    // Quick reject by size.
    if (file.size !== this.baselineSize) {
      return false;
    }

    // Empty baseline: already know size matches, so both are empty.
    if (this.baselineSize === 0 || this.samples.length === 0) {
      return true;
    }

    // Compare each sampled block.
    for (const sample of this.samples) {
      const block = await this.readBlock(file, sample.offset, sample.length);
      if (!this.buffersEqual(block, sample.data)) {
        return false;
      }
    }

    return true;
  }

  // --- Internal helpers ----------------------------------------------------

  private async readBlock(file: File, offset: number, length: number): Promise<Uint8Array> {
    const end = Math.min(offset + length, file.size);
    const blob = file.slice(offset, end);
    const buf = await blob.arrayBuffer();
    return new Uint8Array(buf);
  }

  private buffersEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }
}

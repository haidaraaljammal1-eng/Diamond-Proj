declare module "bidi-js" {
  export interface EmbeddingLevelsResult {
    levels: Uint8Array;
    paragraphs: { start: number; end: number; level: number }[];
  }
  export interface Bidi {
    getEmbeddingLevels(text: string, baseDirection?: "ltr" | "rtl" | "auto"): EmbeddingLevelsResult;
    getReorderedIndices(text: string, embeddingLevels: EmbeddingLevelsResult, start?: number, end?: number): number[];
    getReorderedString(text: string, embeddingLevels: EmbeddingLevelsResult, start?: number, end?: number): string;
    getReorderSegments(text: string, embeddingLevels: EmbeddingLevelsResult, start?: number, end?: number): number[][];
    getMirroredCharactersMap(text: string, embeddingLevels: Uint8Array, start?: number, end?: number): Map<number, string>;
    getMirroredCharacter(char: string): string | null;
    getBidiCharType(char: number): number;
    getBidiCharTypeName(char: number): string;
  }
  /** Factory — call once to get a Bidi instance. */
  export default function bidiFactory(): Bidi;
}

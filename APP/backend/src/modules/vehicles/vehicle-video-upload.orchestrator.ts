import path from "node:path";
import { mkdir, rename, unlink } from "node:fs/promises";
import { resolveStoragePath } from "src/lib/files/storage-key";

export const VEHICLE_VIDEO_MUTATION_LOCK_NS = "vehicle_video_mutation";

type FileIo = {
  rename: typeof rename;
  unlink: typeof unlink;
  mkdir: typeof mkdir;
};

/**
 * Promote validated temp bytes to their final storage key, then commit database state.
 * On database failure, remove the unreferenced file so committed rows never point at missing bytes.
 */
export async function commitVehicleVideoAfterFileOnDisk<T>(input: {
  storageDir: string;
  storageKey: string;
  tempPath: string;
  commitDatabase: () => Promise<T>;
  io?: Partial<FileIo>;
}): Promise<T> {
  const renameFn = input.io?.rename ?? rename;
  const unlinkFn = input.io?.unlink ?? unlink;
  const mkdirFn = input.io?.mkdir ?? mkdir;
  const finalPath = resolveStoragePath(input.storageDir, input.storageKey);
  await mkdirFn(path.dirname(finalPath), { recursive: true });
  await renameFn(input.tempPath, finalPath);
  try {
    return await input.commitDatabase();
  } catch (error) {
    await unlinkFn(finalPath).catch(() => undefined);
    throw error;
  }
}

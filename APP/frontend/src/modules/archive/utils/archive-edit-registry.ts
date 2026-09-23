type ArchiveCellCommitter = () => Promise<void>;

const committers = new Set<ArchiveCellCommitter>();

export function registerArchiveCellCommitter(committer: ArchiveCellCommitter): () => void {
  committers.add(committer);
  return () => {
    committers.delete(committer);
  };
}

export async function commitAllArchiveCellDrafts(): Promise<void> {
  const pending = [...committers];
  for (const commit of pending) {
    await commit();
  }
}

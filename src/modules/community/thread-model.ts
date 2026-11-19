import type { PublicComment } from "./policy";

/** Root pagination and reply pagination are independent; render each reply once. */
export function commentThreads(items: PublicComment[]) {
  const unique = [...new Map(items.map(item => [item.id, item])).values()];
  const roots = unique.filter(item => item.parentId === null);
  const byParent = new Map<number, PublicComment[]>();
  for (const item of unique) if (item.parentId !== null) {
    const replies = byParent.get(item.parentId) ?? [];
    replies.push(item); byParent.set(item.parentId, replies);
  }
  return roots.map(root => ({ root, replies: (byParent.get(root.id) ?? []).sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt) || a.id - b.id) }));
}

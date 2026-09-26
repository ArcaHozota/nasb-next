// src/lib/pagination.ts
// ページャー(shadcn/ui の Pagination)に並べるページ番号の列を作る共通ヘルパー。
// 賛美歌一覧(siblingCount=1)とホーム(siblingCount=2、旧 MUI Pagination 相当)で共用する。

export type PageItem = number | "ellipsis";

/**
 * 先頭・末尾のページと、現在ページの前後 siblingCount 件を常に表示し、
 * 間が空く所を "ellipsis" にする。"ellipsis" が1ページ分しか隠さない場合は
 * その番号をそのまま出す(例: 1 … 3 → 1 2 3)。
 *
 * siblingCount=1: 現在5/20 → [1, …, 4, 5, 6, …, 20](最大7個)
 * siblingCount=2: 現在10/20 → [1, …, 8, 9, 10, 11, 12, …, 20](最大9個)
 */
export function getPageItems(
  page: number,
  total: number,
  siblingCount = 1,
): PageItem[] {
  // 先頭 + 末尾 + 現在 + 前後の兄弟 + 省略記号2つ
  const maxItems = siblingCount * 2 + 5;
  if (total <= maxItems) return Array.from({ length: total }, (_, i) => i + 1);

  // 先頭側/末尾側に寄っている時も、常に同じ個数の番号が並ぶようにする
  let start = Math.max(
    2,
    Math.min(page - siblingCount, total - 2 - siblingCount * 2),
  );
  let end = Math.min(
    total - 1,
    Math.max(page + siblingCount, 3 + siblingCount * 2),
  );
  if (start === 3) start = 2;
  if (end === total - 2) end = total - 1;

  const items: PageItem[] = [1];
  if (start > 2) items.push("ellipsis");
  for (let i = start; i <= end; i++) items.push(i);
  if (end < total - 1) items.push("ellipsis");
  items.push(total);
  return items;
}

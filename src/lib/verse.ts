/** バックエンド BookService.inRange と同じ、節番号1〜999の検証。 */
export function verseNumberError(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "入力してください。";
  return /^\d+$/.test(trimmed) && Number(trimmed) >= 1 && Number(trimmed) <= 999
    ? ""
    : "節は1〜999の整数で入力してください。";
}

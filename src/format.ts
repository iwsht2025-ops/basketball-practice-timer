export function formatRemaining(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
export function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60),
    remainder = seconds % 60;
  return `${minutes ? `${minutes}分` : ""}${remainder || !minutes ? `${remainder}秒` : ""}`;
}

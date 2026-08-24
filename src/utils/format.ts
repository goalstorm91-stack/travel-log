export function formatMoney(amount: number, currency: string): string {
  const rounded = Math.round(amount);
  return `${currency} ${rounded.toLocaleString("ko-KR")}`;
}

export function formatDateKR(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${y}년 ${m}월 ${d}일`;
}

const PALETTE = ['#e03e3e', '#d9730d', '#dfab01', '#0f7b6c', '#0b6e99', '#6940a5', '#ad1a72', '#64473a'];

/** Stable collaborator colour derived from a user id. */
export function colorFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length] ?? '#9b9a97';
}

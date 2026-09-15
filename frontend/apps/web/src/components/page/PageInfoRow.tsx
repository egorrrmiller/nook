export function PageInfoRow({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd data-testid={testId}>{value}</dd>
    </div>
  );
}

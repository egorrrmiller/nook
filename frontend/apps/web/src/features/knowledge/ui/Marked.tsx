import type { SnippetPart } from '../lib/snippet';

/** Renders tokenised snippet parts; marks use the selection colour so they read in every theme. */
export function Marked({ parts, className }: { parts: SnippetPart[]; className?: string }) {
  return (
    <span className={className}>
      {parts.map((p, i) =>
        p.mark ? (
          <mark key={i} className="rounded-[2px] bg-[var(--selection)] px-px text-inherit">
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </span>
  );
}

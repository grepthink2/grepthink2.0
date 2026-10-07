/** Marks a card that shows the board as it is now, not the selected range (brief §3.2). */
export function LivePill() {
  return (
    <span className="gt-live-pill" role="status" aria-label="Live data">
      <span className="gt-live-pill__dot" aria-hidden="true" />
      LIVE
    </span>
  );
}

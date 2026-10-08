/** Marks a card that shows the board as it is now, not the selected range (brief §3.2). Static text, so no live region. */
export function LivePill() {
  return (
    <span className="gt-live-pill">
      <span className="gt-live-pill__dot" aria-hidden="true" />
      LIVE
    </span>
  );
}

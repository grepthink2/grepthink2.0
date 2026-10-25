import { useId, useState } from 'react';
import { Info } from 'lucide-react';
import { NewDot } from '@/components/NewDot/NewDot';
import { WhatsNewModal } from '@features/releases/components/WhatsNewModal';
import { preloadReleaseFeed } from '@features/releases/loadReleaseFeed';
import { openWhatsNew } from '@features/releases/seenStore';
import { useWhatsNew } from '@features/releases/useWhatsNew';

/**
 * The landing header's "What's new" tab, ported from WhatsNewTab in
 * design/components/marketing/LandingHeader.jsx: a button in the header link's clothes, with the Info icon
 * and the label, that opens the release notes in the dark modal. Its name is always "What's new", so at
 * 400px and below the label can go and the icon stands alone. While a release is unread the dot sits on the
 * icon and the button is also described as "New release notes". Hover and focus warm the feed's chunk.
 *
 * The modal keeps the release this browser had seen when it opened, so its "New" markers stay put while
 * it is open; closing it leaves that value alone, and the next opening reads it again.
 */
export default function WhatsNewTab() {
  const { unseen } = useWhatsNew();
  const [whatsNew, setWhatsNew] = useState<{ open: boolean; lastSeen: string | null }>({ open: false, lastSeen: null });
  const descriptionId = useId();

  const open = () => {
    const lastSeen = openWhatsNew();
    setWhatsNew({ open: true, lastSeen });
  };

  return (
    <>
      <button
        type="button"
        className="landing-header__link landing-header__tab"
        aria-label="What's new"
        aria-haspopup="dialog"
        aria-describedby={unseen ? descriptionId : undefined}
        onClick={open}
        onMouseEnter={preloadReleaseFeed}
        onFocus={preloadReleaseFeed}
      >
        <span className="landing-header__tab-icon">
          <Info size={16} aria-hidden="true" />
          {unseen && <NewDot ring />}
        </span>
        <span className="landing-header__tab-text">What&apos;s new</span>
        {unseen && <span id={descriptionId} className="gt-visually-hidden">New release notes</span>}
      </button>
      <WhatsNewModal
        open={whatsNew.open}
        onClose={() => setWhatsNew((state) => ({ ...state, open: false }))}
        tone="dark"
        lastSeen={whatsNew.lastSeen}
      />
    </>
  );
}

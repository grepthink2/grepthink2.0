import React from 'react';
import { Bell, MessageSquare, Send, Shuffle, Users } from 'lucide-react';
import { BAND_BADGES, SECTION_IDS } from '../../landing.config';
import Spotlight, { type SpotlightPoint } from './Spotlight';
import StageCard from './StageCard';
import StageSwap from './StageSwap';
import './MessagingSpotlight.scss';

const POINTS: SpotlightPoint[] = [
  { icon: Users, text: 'Team, TA and Instructor channels for every project' },
  { icon: MessageSquare, text: 'Direct messages with classmates and course staff' },
  { icon: Shuffle, text: "Channels follow the roster: join a team and you're in" },
  { icon: Bell, text: 'Live notifications for messages, join requests and team changes' },
];

interface ConversationProps {
  initials: string;
  tone: 'green' | 'blue' | 'amber' | 'purple';
  /** Channels use a square avatar; people a round one. */
  square?: boolean;
  name: string;
  channel?: { label: string; tone: 'green' | 'blue' | 'amber' };
  preview: React.ReactNode;
  time: string;
  unread?: React.ReactNode;
  active?: boolean;
}

const Conversation: React.FC<ConversationProps> = ({
  initials,
  tone,
  square = false,
  name,
  channel,
  preview,
  time,
  unread,
  active = false,
}) => (
  <div className={`msg-conv${active ? ' msg-conv--active' : ''}`}>
    <span
      className={`stage-avatar stage-avatar--lg stage-avatar--${tone}${square ? ' stage-avatar--square' : ''}`}
    >
      {initials}
    </span>
    <span className="msg-conv__body">
      <span className="msg-conv__name">
        {name}
        {channel && <span className={`stage-pill stage-pill--${channel.tone}`}>{channel.label}</span>}
      </span>
      <span className="msg-conv__preview">{preview}</span>
    </span>
    <span className="msg-conv__side">
      <span className="msg-conv__time">{time}</span>
      {unread && <span className="msg-conv__unread">{unread}</span>}
    </span>
  </div>
);

const MessagingSpotlight: React.FC = () => (
  <Spotlight
    id={SECTION_IDS.messaging}
    label="Messaging"
    badge={BAND_BADGES.messaging}
    title="One inbox for your team and"
    accent="course staff"
    lead="Every project gets three channels: one for the team, one with your TA and one with your instructor. Direct messages cover everything else. Messages and notifications arrive live, with unread counts wherever you are in the app."
    points={POINTS}
    textSide="right"
    tone="tinted"
  >
    <StageCard className="msg-inbox-card" order={0}>
      <div className="stage-card__head">
        <span className="stage-card__title">Messages</span>
        <span className="stage-card__meta">
          <StageSwap before="2 unread" after="3 unread" />
        </span>
      </div>
      <Conversation
        active
        initials="SS"
        tone="green"
        square
        name="ShoeShopper"
        channel={{ label: 'Team', tone: 'green' }}
        preview={<StageSwap before="Standup moved to 3pm" after="Jordan: Merged, thanks!" />}
        time="2m"
        unread={<StageSwap before={2} after={3} />}
      />
      <Conversation
        initials="SS"
        tone="blue"
        square
        name="ShoeShopper"
        channel={{ label: 'TA', tone: 'blue' }}
        preview="Great demo today, see notes"
        time="1h"
      />
      <Conversation
        initials="SS"
        tone="amber"
        square
        name="ShoeShopper"
        channel={{ label: 'Instructor', tone: 'amber' }}
        preview="Final review slot confirmed"
        time="Tue"
      />
      <Conversation initials="PS" tone="purple" name="Priya Shah" preview="Can you look at my PR?" time="Mon" />
    </StageCard>

    <StageCard className="msg-thread-card stage-card--mobile" order={1}>
      <div className="stage-card__head">
        <span className="stage-card__title">
          ShoeShopper <span className="stage-pill stage-pill--green">Team</span>
        </span>
        <span className="stage-card__meta">5 members</span>
      </div>
      <div className="msg-thread">
        <div className="msg-row">
          <span className="stage-avatar stage-avatar--purple">PS</span>
          <div className="msg-bubble">
            Can someone review GT-12 before standup?<small>Priya · 10:02</small>
          </div>
        </div>
        <div className="msg-row msg-row--mine">
          <div className="msg-bubble msg-bubble--mine">
            On it. PR #41 is up.<small>You · 10:04</small>
          </div>
        </div>
        {/* One row for Jordan: the avatar arrives with the typing dots and stays when the reply lands. */}
        <div className="msg-row msg-row--live">
          <span className="stage-avatar stage-avatar--blue">JL</span>
          <div className="msg-live">
            <span className="msg-live__typing">
              <i />
              <i />
              <i />
            </span>
            <div className="msg-bubble msg-live__landed">
              Merged, thanks!<small>Jordan · 10:09</small>
            </div>
          </div>
        </div>
      </div>
      <div className="msg-composer">
        Message the team…
        <span className="msg-composer__send">
          <Send size={12} strokeWidth={2.5} />
        </span>
      </div>
    </StageCard>
  </Spotlight>
);

export default MessagingSpotlight;

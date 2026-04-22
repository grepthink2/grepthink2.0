import React from 'react';
import type { ProjectChoice, ProjectSlots } from '../interestTypes';
import RankedProjectSlot from '../RankedProjectSlot';

interface ProjectInterestsSectionProps {
  slots: ProjectSlots;
  onSlotSelect: (index: number, choice: ProjectChoice) => void;
  onSlotClear: (index: number) => void;
  onSlotReasoning: (index: number, reasoning: string) => void;
}

/** Returns the set of already-selected project ids excluding a given slot. */
const takenIdsExcluding = (slots: ProjectSlots, excludeIndex: number): Set<string> =>
  new Set(
    slots
      .filter((s, i) => i !== excludeIndex && s !== null)
      .map((s) => (s as ProjectChoice).projectId),
  );

const ProjectInterestsSection: React.FC<ProjectInterestsSectionProps> = ({
  slots,
  onSlotSelect,
  onSlotClear,
  onSlotReasoning,
}) => (
  <section className="if-section">
    <header className="if-section__header">
      <h3 className="if-section__title">
        Project Interests <span className="if-required">*</span>
      </h3>
      <p className="if-section__subtitle">
        Rank your top 5 project choices (#1 is your top pick) and explain your interest in each.
      </p>
    </header>

    <div className="if-section__body if-slots">
      {slots.map((slot, i) => (
        <RankedProjectSlot
          key={i}
          rank={i + 1}
          choice={slot}
          takenIds={takenIdsExcluding(slots, i)}
          onSelect={(c) => onSlotSelect(i, c)}
          onClear={() => onSlotClear(i)}
          onReasoningChange={(r) => onSlotReasoning(i, r)}
        />
      ))}
    </div>
  </section>
);

export default ProjectInterestsSection;

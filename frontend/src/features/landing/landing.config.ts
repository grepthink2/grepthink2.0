/**
 * Launch settings for the landing page's feature bands. Change a band's badge when its
 * feature's status changes, and set ANNOUNCEMENT to null to retire the hero pill (the plain
 * eyebrow and the original subtitle come back).
 */
export type BandBadge = 'new' | 'soon' | null;

export interface Announcement {
  /** Visible text of the hero pill, after its NEW badge. */
  label: string;
  /** Id of the section the pill scrolls to. */
  targetId: string;
}

export const SECTION_IDS = {
  scrum: 'scrum-board',
  messaging: 'messaging',
  assistant: 'project-assistant',
} as const;

export const BAND_BADGES: Record<keyof typeof SECTION_IDS, BandBadge> = {
  scrum: 'new',
  messaging: 'new',
  assistant: 'soon',
};

export const ANNOUNCEMENT: Announcement | null = {
  label: 'Scrum boards and team channels',
  targetId: SECTION_IDS.scrum,
};

/** Router target for a landing section; works from any page that renders the header or footer. */
export const sectionLink = (id: string) => ({ pathname: '/', hash: `#${id}` });

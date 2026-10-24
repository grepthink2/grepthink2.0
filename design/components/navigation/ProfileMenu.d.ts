// Intentional addition: ProfileMenu — confirmed, no counterpart in the Figma kit; named after the codebase (readme.md → Intentional additions).
import * as React from 'react';

export interface ProfileMenuSchool {
  id: string;
  name: string;
}

export interface ProfileMenuProps {
  /** The user's name (the avatar's alt fallback). */
  name?: string;
  /** Profile image; without one the button shows the user icon. */
  avatarUrl?: string | null;
  /** The account's schools; two or more render the "School" group of radio rows. */
  schools?: ProfileMenuSchool[];
  currentSchoolId?: string;
  onPickSchool?: (schoolId: string) => void;
  /** In a class the user teaches: the "View class as student" / "Instructor view" row. @default false */
  teaching?: boolean;
  /** Preview mode is on: the row reads "Instructor view". @default false */
  previewing?: boolean;
  onTogglePreview?: () => void;
  onSettings?: () => void;
  /** Closes the menu (focus back on the button) and opens the What's new modal in the light look. */
  onWhatsNew?: () => void;
  onLogout?: () => void;
  /** A release this browser has not opened What's new on: the NewDot on the avatar, the "New" marker on the row, and "New release notes" as both descriptions. @default false */
  unseen?: boolean;
  /** Open on mount (galleries). @default false */
  defaultOpen?: boolean;
  className?: string;
}

/** The app header's profile button + Popover + Menu: School radio rows · preview toggle · Settings · What's new · Log Out. */
export function ProfileMenu(props: ProfileMenuProps): React.JSX.Element;

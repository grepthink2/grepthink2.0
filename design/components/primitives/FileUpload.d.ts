// Intentional addition: FileUpload — confirmed, no counterpart in the Figma kit; named after the codebase (readme.md → Intentional additions).
import * as React from 'react';

export interface FileUploadProps {
  id?: string;
  /** 'image': avatar / project-logo picker with a preview. 'drop': dashed drop area for a CSV. @default 'drop' */
  variant?: 'image' | 'drop';
  /** Names the group ("Profile photo", "Roster CSV"). */
  label: React.ReactNode;
  /** @default false */
  hideLabel?: boolean;
  /** The accepted types and size, in words: "PNG or JPG, up to 2 MB." */
  helperText?: React.ReactNode;
  error?: React.ReactNode;
  /** @default false */
  optional?: boolean;
  /** Passed to the file input and checked on drop (".csv", "image/png,image/jpeg"). */
  accept?: string;
  /** Bytes; larger files are refused with "That file is 3.2 MB. The limit is 2 MB." */
  maxSize?: number;
  /** Words for the type error: "Choose {typeHint}." → "Choose a .csv file." */
  typeHint?: string;
  disabled?: boolean;
  /** drop: the chosen file (a File or { name, size }); shows the file row instead of the drop area. */
  file?: { name: string; size?: number } | null;
  /** drop: extra detail after the size ("62 rows"). */
  fileMeta?: string;
  /** image: current image URL (object URL or saved). */
  previewUrl?: string;
  /** image: 'circle' for avatars, 'square' (radius 10) for logos. @default 'circle' */
  shape?: 'circle' | 'square';
  /** Called with a file that passed `accept` and `maxSize`. */
  onSelect?: (file: File) => void;
  onRemove?: () => void;
  /** @default 'Upload image' / 'Choose file' */
  chooseLabel?: string;
  /** @default 'Drag a file here' */
  dropTitle?: string;
  className?: string;
}

export function FileUpload(props: FileUploadProps): React.JSX.Element;
/** "512 KB" / "3.2 MB". */
export function formatFileSize(bytes: number): string;

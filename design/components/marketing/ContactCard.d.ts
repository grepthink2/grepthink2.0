import * as React from 'react';

export interface ContactValues { name: string; email: string; message: string; }

export interface ContactCardProps {
  /** @default 'Contact' */
  eyebrow?: string;
  /** @default 'Get in touch' */
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  /** @default 'idle' */
  status?: 'idle' | 'sending' | 'success' | 'error';
  values?: ContactValues;
  onChange?: (values: ContactValues) => void;
  onSubmit?: (values: ContactValues) => void;
  className?: string;
}

export function ContactCard(props: ContactCardProps): React.JSX.Element;

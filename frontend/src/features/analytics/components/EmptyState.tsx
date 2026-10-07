import type { LucideIcon } from 'lucide-react';

export interface EmptyStateProps { icon: LucideIcon; title: string; hint: string }

export function EmptyState({ icon: Icon, title, hint }: EmptyStateProps) {
  return (
    <div className="gt-empty" role="status">
      <Icon className="gt-empty__icon" size={20} strokeWidth={2} aria-hidden="true" />
      <p className="gt-empty__title">{title}</p>
      <p className="gt-empty__hint">{hint}</p>
    </div>
  );
}

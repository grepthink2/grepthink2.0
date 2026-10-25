import { createRef } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { cssRules } from '@/test/cssRules';
import '@/styles/tokens/colors.css';
import { Badge } from '../Badge';
import { BADGE_STATUS, roleKey, toProjectRoleKey, type BadgeCategory, type BadgeStatus, type BadgeTone } from '../badgeStatus';

const TONES: BadgeTone[] = ['neutral', 'success', 'warning', 'error', 'info', 'gold', 'merged'];

describe('Badge', () => {
  it('tone classes, neutral by default', () => {
    const { rerender } = render(<Badge>Draft</Badge>);
    expect(screen.getByText('Draft')).toHaveClass('gt-badge', 'gt-badge--neutral');
    for (const tone of TONES) {
      rerender(<Badge tone={tone}>Pill</Badge>);
      expect(screen.getByText('Pill')).toHaveClass('gt-badge', `gt-badge--${tone}`);
    }
  });

  it('status maps through BADGE_STATUS, colour and default label, over any tone', () => {
    const { rerender } = render(<Badge status="task.blocked" />);
    expect(screen.getByText('Blocked')).toHaveClass('gt-badge', 'gt-badge--error');
    rerender(<Badge status="request.pending">Invited</Badge>);
    expect(screen.getByText('Invited')).toHaveClass('gt-badge--info');
    rerender(<Badge status="pr.merged" tone="success" />);
    expect(screen.getByText('Merged')).toHaveClass('gt-badge--merged');
    expect(screen.getByText('Merged')).not.toHaveClass('gt-badge--success');
  });

  it('carries the attendance map, the final-review keys, live and the release marker', () => {
    const expected: [BadgeStatus, BadgeTone, string][] = [
      ['attendance.present', 'success', 'Present'], ['attendance.late', 'warning', 'Late'],
      ['attendance.absent', 'error', 'Absent'], ['attendance.unmarked', 'neutral', 'Not marked'],
      ['signups.open', 'success', 'Sign-ups open'], ['signups.closed', 'neutral', 'Sign-ups closed'],
      ['slot.free', 'success', 'Free'], ['slot.yours', 'info', 'Your team'], ['slot.past', 'neutral', 'Past'],
      ['review.no_review_ta', 'warning', 'No Review TA'], ['review.no_product_owner', 'warning', 'No Product Owner'],
      ['live', 'info', 'Live'], ['release.new', 'info', 'New'],
    ];
    for (const [key, tone, label] of expected) expect(BADGE_STATUS[key]).toEqual([tone, label]);
    expect(Object.keys(BADGE_STATUS)).toHaveLength(56);
  });

  it('every status tone has its colours in the stylesheet', () => {
    render(<Badge status="live" />);
    for (const [tone] of Object.values(BADGE_STATUS)) {
      const [rule] = cssRules(`.gt-badge--${tone}`);
      expect(rule.getPropertyValue('background-color')).toMatch(/^var\(--gt-/);
      expect(rule.getPropertyValue('color')).toMatch(/^var\(--gt-/);
    }
  });

  it('an unknown status falls back to the tone, even one named like a built-in', () => {
    const unknown = 'constructor' as BadgeStatus;
    render(<Badge status={unknown} tone="warning">Odd</Badge>);
    expect(screen.getByText('Odd')).toHaveClass('gt-badge--warning');
  });

  it('category is the outlined look with its icon and label', () => {
    const { container } = render(<Badge category="sponsored" />);
    const badge = screen.getByText('Company Sponsored');
    expect(badge).toHaveClass('gt-badge', 'gt-badge--category');
    expect(badge).not.toHaveClass('gt-badge--neutral');
    const icon = container.querySelector('.gt-badge__icon');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
    expect(icon?.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(icon?.querySelector('svg')).toHaveAttribute('width', '12');
  });

  it('a category with no preset keeps its own words, and icon replaces or drops a category’s', () => {
    const { container, rerender } = render(<Badge category={'alumni' as BadgeCategory} />);
    expect(screen.getByText('alumni')).toHaveClass('gt-badge--category');
    expect(container.querySelector('.gt-badge__icon')).toBeNull();
    rerender(<Badge category="ta" icon={null} />);
    expect(screen.getByText('TA')).toHaveClass('gt-badge--category');
    expect(container.querySelector('.gt-badge__icon')).toBeNull();
    rerender(<Badge category="members" icon={<svg data-testid="count" />}>4 members</Badge>);
    expect(screen.getByTestId('count').parentElement).toHaveClass('gt-badge__icon');
    expect(container.querySelector('.lucide-users')).toBeNull();
  });

  it('projectRole takes the stored spaced value and wins over category and tone', () => {
    const { container, rerender } = render(<Badge projectRole="product owner" category="ta" tone="gold" />);
    const badge = screen.getByText('Product Owner');
    expect(badge).toHaveClass('gt-badge', 'gt-badge--category', 'gt-badge--role-product_owner');
    expect(badge).not.toHaveClass('gt-badge--gold');
    expect(container.querySelector('.gt-badge__icon svg')).toHaveClass('lucide-star');

    rerender(<Badge projectRole="Scrum-Master" />);
    expect(screen.getByText('Scrum Master')).toHaveClass('gt-badge--role-scrum_master');
    expect(container.querySelector('.gt-badge__icon svg')).toHaveClass('lucide-shield');

    rerender(<Badge projectRole="member" />);
    expect(screen.getByText('Member')).toHaveClass('gt-badge--category');
    expect(container.querySelector('.gt-badge__icon')).toBeNull();

    // A role with no preset keeps its own words, in the category look, with no icon.
    rerender(<Badge projectRole="Tech lead" />);
    expect(screen.getByText('Tech lead')).toHaveClass('gt-badge--category', 'gt-badge--role-tech_lead');
    expect(container.querySelector('.gt-badge__icon')).toBeNull();
  });

  it('status wins over projectRole', () => {
    render(<Badge status="live" projectRole="owner" />);
    const badge = screen.getByText('Live');
    expect(badge).toHaveClass('gt-badge--info');
    expect(badge).not.toHaveClass('gt-badge--category');
  });

  it('icon overrides the preset’s, and null drops it', () => {
    const { container, rerender } = render(<Badge projectRole="owner" icon={<svg data-testid="mine" />} />);
    expect(screen.getByTestId('mine').parentElement).toHaveClass('gt-badge__icon');
    expect(container.querySelector('.lucide-crown')).toBeNull();
    rerender(<Badge projectRole="owner" icon={null} />);
    expect(container.querySelector('.gt-badge__icon')).toBeNull();
    expect(screen.getByText('Owner')).toBeInTheDocument();
    rerender(<Badge status="live" icon={<svg data-testid="dot" />} />);
    expect(screen.getByTestId('dot').parentElement).toHaveClass('gt-badge__icon');
  });

  it('solid is for status tones only', () => {
    const { rerender } = render(<Badge status="task.done" solid />);
    expect(screen.getByText('Done')).toHaveClass('gt-badge--solid', 'gt-badge--success');
    rerender(<Badge category="ta" solid />);
    expect(screen.getByText('TA')).not.toHaveClass('gt-badge--solid');
  });

  it('spreads title, native props, className and ref, and never sets a role itself', () => {
    const ref = createRef<HTMLSpanElement>();
    const { rerender } = render(<Badge status="roster.waitlisted" title="Position 3" className="x" data-key="b" ref={ref} />);
    const badge = screen.getByText('Waitlisted');
    expect(ref.current).toBe(badge);
    expect(badge.tagName).toBe('SPAN');
    expect(badge).toHaveClass('gt-badge', 'x');
    expect(badge).toHaveAttribute('title', 'Position 3');
    expect(badge).toHaveAttribute('data-key', 'b');
    expect(badge).not.toHaveAttribute('role');
    // `role` is an attribute like any other: projectRole took its old meaning.
    rerender(<Badge status="live" role="status" />);
    expect(screen.getByRole('status')).toHaveTextContent('Live');
  });

  it('toProjectRoleKey maps stored roles', () => {
    expect(toProjectRoleKey('product owner')).toBe('product_owner');
    expect(toProjectRoleKey('scrum master')).toBe('scrum_master');
    expect(toProjectRoleKey('member')).toBe('member');
    expect(toProjectRoleKey(' Product  Owner ')).toBe('product_owner');
    expect(toProjectRoleKey('scrum-master')).toBe('scrum_master');
    expect(toProjectRoleKey('unknown')).toBeUndefined();
    expect(toProjectRoleKey('constructor')).toBeUndefined();
    expect(toProjectRoleKey('')).toBeUndefined();
    expect(toProjectRoleKey(null)).toBeUndefined();
    expect(toProjectRoleKey(undefined)).toBeUndefined();
    expect(roleKey('Tech lead')).toBe('tech_lead');
  });

  it('ports the pill’s type and resets the text styles of the heading it sits in', () => {
    render(<Badge>x</Badge>);
    const [base, reset] = cssRules('.gt-badge');
    expect(base.getPropertyValue('font-size')).toBe('0.8rem');
    expect(base.getPropertyValue('line-height')).toBe('1.25');
    expect(base.getPropertyValue('box-sizing')).toBe('border-box');
    expect(reset.getPropertyValue('text-transform')).toBe('none');
    expect(reset.getPropertyValue('letter-spacing')).toBe('normal');
    expect(reset.getPropertyValue('font-style')).toBe('normal');
  });

  it('fills gold and merged from their soft tokens', () => {
    render(<Badge tone="gold">Team set</Badge>);
    expect(cssRules('.gt-badge--gold')[0].getPropertyValue('background-color')).toBe('var(--gt-gold-soft)');
    expect(cssRules('.gt-badge--merged')[0].getPropertyValue('background-color')).toBe('var(--gt-purple-soft)');
    const root = cssRules(':root').find((r) => r.getPropertyValue('--gt-gold-soft'));
    const token = (name: string) => root?.getPropertyValue(name).replace(/\s+/g, '');
    expect(token('--gt-gold-soft')).toBe('rgba(253,199,0,0.18)');
    expect(token('--gt-purple-soft')).toBe('rgba(125,60,152,0.12)');
  });

  it('is md by default; size="sm" is the 11px marker for heading rows and menu rows', () => {
    const { rerender } = render(<Badge status="release.new" />);
    expect(screen.getByText('New')).toHaveClass('gt-badge', 'gt-badge--info');
    expect(screen.getByText('New')).not.toHaveClass('gt-badge--sm');
    rerender(<Badge status="release.new" size="sm" />);
    expect(screen.getByText('New')).toHaveClass('gt-badge', 'gt-badge--info', 'gt-badge--sm');
    const [sm] = cssRules('.gt-badge--sm');
    expect(sm.getPropertyValue('padding')).toBe('2px 8px');
    expect(sm.getPropertyValue('font-size')).toBe('11px');
    expect(cssRules('.gt-badge--sm.gt-badge--category')[0].getPropertyValue('padding')).toBe('1px 7px');
  });
});

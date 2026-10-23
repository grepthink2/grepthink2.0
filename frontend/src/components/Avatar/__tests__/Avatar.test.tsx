import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { cssRules } from '@/test/cssRules';
import { Avatar, AvatarGroup } from '../Avatar';
import { AVATAR_PX, hashColor, type AvatarSize } from '../avatarHelpers';

const SIZES: AvatarSize[] = ['xs', 'sm', 'md', 'lg', 'xl'];
const TEAM = ['Ana Ruiz', 'Ben Ko', 'Cy Diaz', 'Di Park', 'Ed Moss', 'Flo Hart'];

describe('Avatar', () => {
  it('Avatar shows initials on a hashed colour with role img', () => {
    render(<Avatar name="Ashton Liu" />);
    const avatar = screen.getByRole('img', { name: 'Ashton Liu' });
    expect(avatar.tagName).toBe('SPAN');
    expect(avatar).toHaveTextContent(/^AL$/);
    expect(avatar).toHaveClass('gt-avatar', 'gt-avatar--md');
    expect(avatar.style.backgroundColor).toBe(hashColor('Ashton Liu'));
  });

  it('takes each size, and the square shape', () => {
    const { rerender } = render(<Avatar name="Tony Wu" />);
    for (const size of SIZES) {
      rerender(<Avatar name="Tony Wu" size={size} />);
      expect(screen.getByRole('img')).toHaveClass(`gt-avatar--${size}`);
    }
    expect(screen.getByRole('img')).not.toHaveClass('gt-avatar--square');
    rerender(<Avatar name="GrepThink 2.0" square />);
    expect(screen.getByRole('img', { name: 'GrepThink 2.0' })).toHaveClass('gt-avatar--square');
  });

  it('decorative hides it', () => {
    const { container, rerender } = render(<Avatar name="Tony Wu" decorative />);
    const initials = container.firstChild as HTMLElement;
    expect(initials).toHaveAttribute('aria-hidden', 'true');
    expect(initials).not.toHaveAttribute('role');
    expect(initials).not.toHaveAttribute('aria-label');
    expect(initials).toHaveTextContent('TW');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();

    rerender(<Avatar name="Tony Wu" src="https://img.example/tony.png" decorative />);
    const photo = container.querySelector('img');
    expect(photo).toHaveAttribute('alt', '');
    expect(photo).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('a photo is an img named by the name, with no colour behind it', () => {
    render(<Avatar name="Pat Lee" src="https://img.example/pat.png" size="sm" />);
    const photo = screen.getByRole('img', { name: 'Pat Lee' });
    expect(photo.tagName).toBe('IMG');
    expect(photo).toHaveAttribute('src', 'https://img.example/pat.png');
    expect(photo).toHaveClass('gt-avatar', 'gt-avatar--sm');
    expect(photo).not.toHaveAttribute('aria-hidden');
    expect(photo.style.backgroundColor).toBe('');
  });

  it('falls back to initials when the image fails', () => {
    const onError = vi.fn();
    render(<Avatar name="Pat Lee" src="https://img.example/broken.png" onError={onError} />);
    fireEvent.error(screen.getByRole('img', { name: 'Pat Lee' }));
    const initials = screen.getByRole('img', { name: 'Pat Lee' });
    expect(initials.tagName).toBe('SPAN');
    expect(initials).toHaveTextContent('PL');
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('gives a new photo its own try after one failed', () => {
    const { rerender } = render(<Avatar name="Pat Lee" src="https://img.example/broken.png" />);
    fireEvent.error(screen.getByRole('img'));
    expect(screen.getByRole('img').tagName).toBe('SPAN');
    rerender(<Avatar name="Pat Lee" src="https://img.example/pat.png" />);
    expect(screen.getByRole('img').tagName).toBe('IMG');
    // The photo that failed last stays failed, with no flash of a broken image.
    rerender(<Avatar name="Pat Lee" src="https://img.example/broken.png" />);
    expect(screen.getByRole('img').tagName).toBe('SPAN');
  });

  it('draws "?" for a missing name, named Avatar', () => {
    const { rerender } = render(<Avatar />);
    expect(screen.getByRole('img', { name: 'Avatar' })).toHaveTextContent('?');
    rerender(<Avatar name="   " src="https://img.example/x.png" />);
    expect(screen.getByRole('img')).toHaveAttribute('alt', 'Avatar');
  });

  it('passes className, style, native props and ref, and keeps its role and aria attributes to itself', () => {
    const ref = createRef<HTMLElement>();
    render(<Avatar name="Tony Wu" className="x" title="Tony Wu · TA" data-key="a" style={{ marginLeft: 4 }} ref={ref} />);
    const avatar = screen.getByRole('img', { name: 'Tony Wu' });
    expect(ref.current).toBe(avatar);
    expect(avatar).toHaveClass('gt-avatar', 'x');
    expect(avatar).toHaveAttribute('title', 'Tony Wu · TA');
    expect(avatar).toHaveAttribute('data-key', 'a');
    expect(avatar.style.marginLeft).toBe('4px');
    expect(avatar.style.backgroundColor).toBe(hashColor('Tony Wu'));

    // @ts-expect-error: decorative decides the role
    const roled = <Avatar name="A B" role="presentation" />;
    // @ts-expect-error: the name comes from `name`
    const labelled = <Avatar name="C D" aria-label="Someone" />;
    // @ts-expect-error: hide it with `decorative`
    const hidden = <Avatar name="E F" aria-hidden />;
    render(<div>{roled}{labelled}{hidden}</div>);
    expect(screen.getByRole('img', { name: 'A B' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'C D' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'E F' })).toBeInTheDocument();
  });

  it('lets a caller’s style colour the initials over the hashed colour', () => {
    render(<Avatar name="Tony Wu" style={{ backgroundColor: 'var(--gt-gray-200)', color: 'var(--gt-text-secondary)' }} />);
    const avatar = screen.getByRole('img', { name: 'Tony Wu' });
    expect(avatar.style.backgroundColor).toBe('var(--gt-gray-200)');
    expect(avatar.style.color).toBe('var(--gt-text-secondary)');
  });

  it('sizes each step as AVATAR_PX says, and resets the text styles of the row it sits in', () => {
    render(<Avatar name="Tony Wu" />);
    for (const size of SIZES) {
      const [rule] = cssRules(`.gt-avatar--${size}`);
      expect(rule.getPropertyValue('width')).toBe(`${AVATAR_PX[size]}px`);
      expect(rule.getPropertyValue('height')).toBe(`${AVATAR_PX[size]}px`);
    }
    const [, reset] = cssRules('.gt-avatar');
    expect(reset.getPropertyValue('letter-spacing')).toBe('normal');
    expect(reset.getPropertyValue('text-transform')).toBe('none');
  });
});

describe('AvatarGroup', () => {
  it('AvatarGroup collapses to +n', () => {
    const { container } = render(<AvatarGroup names={TEAM} />);
    const group = screen.getByRole('img', { name: 'Ana Ruiz, Ben Ko, Cy Diaz, Di Park and 2 more' });
    expect(group).toHaveClass('gt-avatar-group');
    const faces = container.querySelectorAll('.gt-avatar:not(.gt-avatar--extra)');
    expect(faces).toHaveLength(4);
    faces.forEach((face) => {
      expect(face).toHaveAttribute('aria-hidden', 'true');
      expect(face).toHaveClass('gt-avatar--sm');
    });
    const extra = container.querySelector('.gt-avatar--extra');
    expect(extra).toHaveTextContent('+2');
    expect(extra).toHaveClass('gt-avatar', 'gt-avatar--sm');
    expect(extra).toHaveAttribute('aria-hidden', 'true');
  });

  it('names everyone when they fit, takes max and size, and is no image with no names', () => {
    const { container, rerender } = render(<AvatarGroup names={['Ana Ruiz', 'Ben Ko']} />);
    expect(screen.getByRole('img', { name: 'Ana Ruiz, Ben Ko' })).toBeInTheDocument();
    expect(container.querySelector('.gt-avatar--extra')).toBeNull();
    rerender(<AvatarGroup names={TEAM} max={2} size="xs" />);
    expect(screen.getByRole('img', { name: 'Ana Ruiz, Ben Ko and 4 more' })).toBeInTheDocument();
    expect(container.querySelector('.gt-avatar--extra')).toHaveClass('gt-avatar--xs');
    // Two people with one name still get a face each, with no duplicate-key warning.
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    rerender(<AvatarGroup names={['Sam Kim', 'Ana Ruiz', 'Sam Kim']} />);
    expect(container.querySelectorAll('.gt-avatar')).toHaveLength(3);
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
    rerender(<AvatarGroup names={[]} />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(container.querySelector('.gt-avatar-group')).not.toHaveAttribute('aria-label');
  });

  it('shows at least one face, whatever max says', () => {
    const { container, rerender } = render(<AvatarGroup names={TEAM} max={0} />);
    expect(screen.getByRole('img', { name: 'Ana Ruiz and 5 more' })).toBeInTheDocument();
    expect(container.querySelectorAll('.gt-avatar:not(.gt-avatar--extra)')).toHaveLength(1);
    expect(container.querySelector('.gt-avatar--extra')).toHaveTextContent('+5');
    // A negative max would count from the end of the list.
    rerender(<AvatarGroup names={TEAM} max={-2} />);
    expect(screen.getByRole('img', { name: 'Ana Ruiz and 5 more' })).toBeInTheDocument();
    expect(container.querySelector('.gt-avatar--extra')).toHaveTextContent('+5');
    rerender(<AvatarGroup names={TEAM} max={Number.NaN} />);
    expect(screen.getByRole('img', { name: 'Ana Ruiz and 5 more' })).toBeInTheDocument();
  });

  it('passes className, native props and ref, and keeps its role and name to itself', () => {
    const ref = createRef<HTMLSpanElement>();
    render(<AvatarGroup names={['Ana Ruiz']} className="x" data-key="g" ref={ref} />);
    const group = screen.getByRole('img', { name: 'Ana Ruiz' });
    expect(ref.current).toBe(group);
    expect(group).toHaveClass('gt-avatar-group', 'x');
    expect(group).toHaveAttribute('data-key', 'g');

    // @ts-expect-error: the group is one image
    const roled = <AvatarGroup names={['Ben Ko']} role="list" />;
    // @ts-expect-error: the name comes from the names
    const labelled = <AvatarGroup names={['Cy Diaz']} aria-label="Team" />;
    render(<div>{roled}{labelled}</div>);
    expect(screen.getByRole('img', { name: 'Ben Ko' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Cy Diaz' })).toBeInTheDocument();
  });

  it('draws the ring outside each face, as the design sizes it, and overlaps them', () => {
    render(<AvatarGroup names={TEAM} />);
    const [ring] = cssRules('.gt-avatar-group .gt-avatar');
    expect(ring.getPropertyValue('border')).toBe('2px solid var(--gt-surface)');
    // The design's box is content-box; index.css's border-box would draw the ring inside the face.
    expect(ring.getPropertyValue('box-sizing')).toBe('content-box');
    expect(cssRules('.gt-avatar-group .gt-avatar + .gt-avatar')[0].getPropertyValue('margin-left')).toBe('-8px');
    const [extra] = cssRules('.gt-avatar--extra');
    expect(extra.getPropertyValue('background-color')).toBe('var(--gt-gray-200)');
  });
});

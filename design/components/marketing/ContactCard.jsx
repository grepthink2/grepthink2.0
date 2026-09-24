import React from 'react';
import { Eyebrow } from './Eyebrow.jsx';

/**
 * Contact page card: eyebrow, title, lede, name/email/message form with
 * honeypot, submit, and success/error status. Presentational — the page
 * owns the POST. Note the marketing exception: fields focus with a green glow.
 */
export function ContactCard({
  eyebrow = 'Contact',
  title = 'Get in touch',
  subtitle,
  status = 'idle',
  values = { name: '', email: '', message: '' },
  onChange,
  onSubmit,
  className = '',
}) {
  const sending = status === 'sending';
  const set = (k) => (e) => onChange && onChange({ ...values, [k]: e.target.value });
  return (
    <div className={['gt-contact-card', className].filter(Boolean).join(' ')}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h1 className="gt-contact-card__title">{title}</h1>
      {subtitle && <p className="gt-contact-card__sub">{subtitle}</p>}
      <form className="gt-contact-card__form" onSubmit={(e) => { e.preventDefault(); if (!sending && onSubmit) onSubmit(values); }}>
        <label className="gt-contact-card__field"><span>Name</span>
          <input type="text" name="name" autoComplete="name" placeholder="Your name" value={values.name} onChange={set('name')} required />
        </label>
        <label className="gt-contact-card__field"><span>Email</span>
          <input type="email" name="email" autoComplete="email" placeholder="you@university.edu" value={values.email} onChange={set('email')} required />
        </label>
        <label className="gt-contact-card__field"><span>Message</span>
          <textarea name="message" rows={5} placeholder="How can we help?" value={values.message} onChange={set('message')} required />
        </label>
        <div className="gt-contact-card__honeypot" aria-hidden="true">
          <label>Website<input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" /></label>
        </div>
        <button type="submit" className="gt-contact-card__submit" disabled={sending}>{sending ? 'Sending…' : 'Send message'}</button>
        {status === 'success' && <p className="gt-contact-card__status gt-contact-card__status--success" role="status">Thanks! Your message is on its way, we'll be in touch soon.</p>}
        {status === 'error' && <p className="gt-contact-card__status gt-contact-card__status--error" role="alert">Something went wrong sending your message. Please try again.</p>}
      </form>
    </div>
  );
}

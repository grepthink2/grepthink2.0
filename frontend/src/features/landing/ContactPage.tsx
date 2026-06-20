import React, { useState } from 'react';
import Header from './components/Header';
import Footer from './components/Footer';
import './ContactPage.scss';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

type Status = 'idle' | 'sending' | 'success' | 'error';

/**
 * Contact page. Submitting POSTs the message to the backend, which emails it
 * to the grepthink support inbox. The hidden `website` field is a honeypot —
 * humans never see it, so a filled value flags a bot on the server.
 */
const ContactPage: React.FC = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [website, setWebsite] = useState(''); // honeypot
  const [status, setStatus] = useState<Status>('idle');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === 'sending') return;

    setStatus('sending');
    try {
      const res = await fetch(`${API_BASE_URL}/api/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, message, website }),
      });

      if (!res.ok) throw new Error(`Request failed: ${res.status}`);

      setStatus('success');
      setName('');
      setEmail('');
      setMessage('');
      setWebsite('');
    } catch {
      setStatus('error');
    }
  };

  const sending = status === 'sending';

  return (
    <div className="contact-page">
      <Header />

      <main className="contact-page__main">
        <div className="contact-page__card">
          <span className="contact-page__eyebrow">Contact</span>
          <h1 className="contact-page__title">Get in touch</h1>
          <p className="contact-page__sub">
            Questions about grepthink for your class? Send us a note and we&apos;ll
            get back to you.
          </p>

          <form className="contact-page__form" onSubmit={handleSubmit}>
            <label className="contact-page__field">
              <span>Name</span>
              <input
                type="text"
                name="name"
                autoComplete="name"
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </label>
            <label className="contact-page__field">
              <span>Email</span>
              <input
                type="email"
                name="email"
                autoComplete="email"
                placeholder="you@university.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            <label className="contact-page__field">
              <span>Message</span>
              <textarea
                name="message"
                rows={5}
                placeholder="How can we help?"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                required
              />
            </label>

            {/* Honeypot: hidden from humans, attractive to bots. */}
            <div className="contact-page__honeypot" aria-hidden="true">
              <label>
                Website
                <input
                  type="text"
                  name="website"
                  tabIndex={-1}
                  autoComplete="off"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                />
              </label>
            </div>

            <button
              type="submit"
              className="contact-page__submit"
              disabled={sending}
            >
              {sending ? 'Sending…' : 'Send message'}
            </button>

            {status === 'success' && (
              <p className="contact-page__status contact-page__status--success" role="status">
                Thanks! Your message is on its way, we&apos;ll be in touch soon.
              </p>
            )}
            {status === 'error' && (
              <p className="contact-page__status contact-page__status--error" role="alert">
                Something went wrong sending your message. Please try again.
              </p>
            )}
          </form>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default ContactPage;

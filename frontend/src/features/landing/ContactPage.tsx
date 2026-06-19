import React from 'react';
import Header from './components/Header';
import Footer from './components/Footer';
import './ContactPage.scss';

/**
 * Contact page stub. The form is intentionally non-functional for now —
 * submitting is prevented and wiring to a backend/email service comes later.
 */
const ContactPage: React.FC = () => {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: wire up to support inbox / backend endpoint.
  };

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
              <input type="text" name="name" autoComplete="name" placeholder="Your name" />
            </label>
            <label className="contact-page__field">
              <span>Email</span>
              <input
                type="email"
                name="email"
                autoComplete="email"
                placeholder="you@university.edu"
              />
            </label>
            <label className="contact-page__field">
              <span>Message</span>
              <textarea name="message" rows={5} placeholder="How can we help?" />
            </label>
            <button type="submit" className="contact-page__submit">
              Send message
            </button>
          </form>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default ContactPage;

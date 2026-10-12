import React from 'react';
import Header from './components/Header';
import Footer from './components/Footer';
import ContactCard from './components/ContactCard';
import './ContactPage.scss';

/** The contact page: its cards sit side by side on wide screens and stack on narrow ones. */
const ContactPage: React.FC = () => (
  <div className="contact-page">
    <Header />

    <main className="contact-page__main">
      <div className="contact-page__cards">
        <ContactCard />
      </div>
    </main>

    <Footer />
  </div>
);

export default ContactPage;

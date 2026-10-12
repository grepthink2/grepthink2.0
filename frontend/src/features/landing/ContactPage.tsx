import React from 'react';
import Header from './components/Header';
import Footer from './components/Footer';
import ContactCard from './components/ContactCard';
import IssueCard from './components/IssueCard';
import './ContactPage.scss';

/** The contact page: a note to the team (email) and an issue report (GitHub), side by side on wide screens. */
const ContactPage: React.FC = () => (
  <div className="contact-page">
    <Header />

    <main className="contact-page__main">
      <div className="contact-page__cards">
        <ContactCard />
        <IssueCard />
      </div>
    </main>

    <Footer />
  </div>
);

export default ContactPage;

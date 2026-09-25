import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import Header from './components/Header';
import Hero from './components/Hero';
import Solutions from './components/Solutions';
import ScrumSpotlight from './components/spotlights/ScrumSpotlight';
import MessagingSpotlight from './components/spotlights/MessagingSpotlight';
import AssistantSpotlight from './components/spotlights/AssistantSpotlight';
import ClosingBand from './components/ClosingBand';
import Footer from './components/Footer';
import { scrollToSection } from './sectionScroll';
import './LandingPage.scss';

const LandingPage: React.FC = () => {
  const { hash, key } = useLocation();

  // React Router doesn't scroll to hashes. This covers arriving with one (a reload, or a
  // SectionLink followed from another page or to another band); a click on the link the page
  // is already at never reaches the router, so SectionLink scrolls for that case itself.
  useEffect(() => {
    if (hash) scrollToSection(decodeURIComponent(hash.slice(1)));
  }, [hash, key]);

  return (
    <div className="landing">
      <Header />
      <main>
        <Hero />
        <Solutions />
        <ScrumSpotlight />
        <MessagingSpotlight />
        <AssistantSpotlight />
        <ClosingBand />
      </main>
      <Footer />
    </div>
  );
};

export default LandingPage;

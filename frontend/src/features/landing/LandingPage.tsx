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
import './LandingPage.scss';

const LandingPage: React.FC = () => {
  const { hash, key } = useLocation();

  // React Router doesn't scroll to hashes; the header, footer and hero pill link here with one.
  // `key` changes on every navigation, so following the same link twice scrolls again.
  useEffect(() => {
    if (!hash) return;
    const target = document.getElementById(decodeURIComponent(hash.slice(1)));
    if (!target) return;
    const reduceMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
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

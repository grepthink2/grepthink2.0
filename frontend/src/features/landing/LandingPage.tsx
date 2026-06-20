import React from 'react';
import Header from './components/Header';
import Hero from './components/Hero';
import Solutions from './components/Solutions';
import Footer from './components/Footer';
import './LandingPage.scss';

const LandingPage: React.FC = () => {
  return (
    <div className="landing">
      <Header />
      <main>
        <Hero />
        <Solutions />
      </main>
      <Footer />
    </div>
  );
};

export default LandingPage;

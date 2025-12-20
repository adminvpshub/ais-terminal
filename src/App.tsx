import React, { useState, useEffect } from 'react';
import TerminalApp from './components/TerminalApp';
import { LandingPage } from './components/LandingPage';

const App: React.FC = () => {
  // Simple state-based routing
  const [currentView, setCurrentView] = useState<'landing' | 'app'>('landing');

  useEffect(() => {
    // Check path on load to determine view
    const path = window.location.pathname;
    if (path === '/app') {
      setCurrentView('app');
    } else {
      setCurrentView('landing');
    }

    // Handle back button
    const onPopState = () => {
       if (window.location.pathname === '/app') {
         setCurrentView('app');
       } else {
         setCurrentView('landing');
       }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigateToApp = () => {
    window.history.pushState(null, '', '/app');
    setCurrentView('app');
  };

  return (
    <>
      {currentView === 'landing' ? (
        <div className="h-screen overflow-auto">
          <LandingPage onLaunch={navigateToApp} />
        </div>
      ) : (
        <TerminalApp />
      )}
    </>
  );
};

export default App;

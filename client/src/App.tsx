import { useEffect, useState } from 'react';
import { useIdentityStore } from './store/identityStore';
import { useSocket } from './hooks/useSocket';
import Onboarding from './pages/Onboarding';
import Chat from './pages/Chat';
import Dashboard from './pages/Dashboard';

type View = 'onboarding' | 'chat' | 'dashboard';

export default function App() {
  const { isOnboarded, restoreIdentity, reset } = useIdentityStore();
  const [view, setView] = useState<View>('onboarding');

  // Restore identity from localStorage on mount
  useEffect(() => {
    const existing = restoreIdentity();
    if (existing) setView('chat');
  }, []);

  function handleOnboardingComplete() {
    setView('chat');
  }

  function handleLogout() {
    if (confirm('Clear your identity? This cannot be undone.')) {
      reset();
      setView('onboarding');
    }
  }

  // Socket connection is active whenever identity exists
  useSocket();

  if (view === 'onboarding' || !isOnboarded) {
    return <Onboarding onComplete={handleOnboardingComplete} />;
  }

  if (view === 'dashboard') {
    return <Dashboard onBack={() => setView('chat')} />;
  }

  return (
    <Chat
      onShowDashboard={() => setView('dashboard')}
      onLogout={handleLogout}
    />
  );
}

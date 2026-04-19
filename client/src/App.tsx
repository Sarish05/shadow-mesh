import { useEffect, useState } from 'react';
import { useIdentityStore } from './store/identityStore';
import { useSocket } from './hooks/useSocket';
import Onboarding from './pages/Onboarding';
import Chat from './pages/Chat';
import Dashboard from './pages/Dashboard';

type View = 'onboarding' | 'chat' | 'dashboard';

export default function App() {
  const { isOnboarded, restoreIdentity, reset } = useIdentityStore();
  const [view, setView] = useState<View>('chat');
  const [isRestoring, setIsRestoring] = useState(true);

  // Restore identity from localStorage on mount
  useEffect(() => {
    restoreIdentity().then(existing => {
      if (existing) {
        setView('chat');
      } else {
        setView('onboarding');
      }
      setIsRestoring(false);
    });
  }, []);

  function handleOnboardingComplete() {
    setView('chat');
  }

  function handleLogout() {
    if (confirm('Clear your identity? This cannot be undone.')) {
      void reset();
      setView('onboarding');
    }
  }

  // Socket connection is active whenever identity exists
  useSocket();

  if (isRestoring) return <div className="flex h-screen items-center justify-center bg-[var(--bg-base)] text-[var(--text-muted)]">Initializing Secure Enclave...</div>;

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


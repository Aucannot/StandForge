import { useEffect } from 'react';
import { FloatingWindow } from './components/FloatingWindow';
import { setupTimerListeners, useTimerStore } from './stores/useTimerStore';

function App() {
  const syncState = useTimerStore((state) => state.syncState);

  useEffect(() => {
    document.body.classList.add('is-floating');
    document.documentElement.classList.add('is-floating');
    const colorScheme = window.matchMedia('(prefers-color-scheme: dark)');
    const applyColorScheme = (isDark: boolean) => {
      document.documentElement.classList.toggle('dark', isDark);
    };
    applyColorScheme(colorScheme.matches);
    const handleColorSchemeChange = (event: MediaQueryListEvent) => applyColorScheme(event.matches);
    colorScheme.addEventListener('change', handleColorSchemeChange);

    return () => {
      colorScheme.removeEventListener('change', handleColorSchemeChange);
      document.body.classList.remove('is-floating');
      document.documentElement.classList.remove('is-floating');
      document.documentElement.classList.remove('dark');
    };
  }, []);

  useEffect(() => {
    setupTimerListeners();
    void syncState();

    const syncInterval = window.setInterval(() => {
      void syncState();
    }, 30_000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void syncState();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.clearInterval(syncInterval);
    };
  }, [syncState]);

  return <FloatingWindow />;
}

export default App;

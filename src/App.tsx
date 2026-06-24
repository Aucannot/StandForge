import { useEffect } from 'react';
import { FloatingWindow } from './components/FloatingWindow';
import { setupTimerListeners, useTimerStore } from './stores/useTimerStore';

function App() {
  const syncState = useTimerStore((state) => state.syncState);

  useEffect(() => {
    document.body.classList.add('is-floating');
    document.documentElement.classList.add('is-floating');

    return () => {
      document.body.classList.remove('is-floating');
      document.documentElement.classList.remove('is-floating');
    };
  }, []);

  useEffect(() => {
    setupTimerListeners();
    void syncState();

    const syncInterval = window.setInterval(() => {
      void syncState();
    }, 1000);

    return () => window.clearInterval(syncInterval);
  }, [syncState]);

  return <FloatingWindow />;
}

export default App;

import { createContext, useContext, useState, useCallback } from 'react';

// Shared state for in-flight image/video generation jobs.
// Mount <GenerationJobsProvider> ABOVE your <Routes>/router in App.jsx so it does
// NOT unmount when the user navigates between Image Studio, Video Studio, etc.
// Each studio page calls useGenerationJobs() instead of keeping isPolling /
// pollingStatus / stageStartedAt as local useState.
//
// IMPORTANT: this is intentionally in-memory only (plain useState, no
// localStorage/sessionStorage). That gives us exactly the behavior we want:
//   - Survives navigating between pages in-app (provider stays mounted,
//     since it sits above the router and React Router never reloads the page)
//   - Does NOT survive a hard refresh (the whole JS app restarts from
//     scratch on reload, so this state naturally resets - no extra code
//     needed to "clear on refresh", it's just the default behavior of
//     in-memory state)
// Do not add localStorage/sessionStorage persistence back without checking
// with the team first - that was intentionally removed because a stale
// generation surviving a hard refresh was reported as unwanted behavior.

const GenerationJobsContext = createContext(null);

export function GenerationJobsProvider({ children }) {
  const [jobs, setJobs] = useState({});

  const setJob = useCallback((type, patch) => {
    setJobs((prev) => ({
      ...prev,
      [type]: patch === null ? null : { ...(prev[type] || {}), ...patch },
    }));
  }, []);

  const clearJob = useCallback((type) => {
    setJobs((prev) => ({ ...prev, [type]: null }));
  }, []);

  const getJob = useCallback((type) => jobs[type] || null, [jobs]);

  return (
    <GenerationJobsContext.Provider value={{ jobs, setJob, clearJob, getJob }}>
      {children}
    </GenerationJobsContext.Provider>
  );
}

export function useGenerationJobs() {
  const ctx = useContext(GenerationJobsContext);
  if (!ctx) {
    throw new Error('useGenerationJobs must be used within a GenerationJobsProvider');
  }
  return ctx;
}
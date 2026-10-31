import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext';
import {
  synchronizeUserQueue,
  getSyncQueueItems,
  getOfflineStorageSummary,
} from '../services/offlineDb';

const OfflineContext = createContext();

export const useOffline = () => {
  const ctx = useContext(OfflineContext);
  if (!ctx) throw new Error('useOffline must be used within OfflineProvider');
  return ctx;
};

export const OfflineProvider = ({ children }) => {
  const { user } = useAuth();
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [syncing, setSyncing] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [failedSyncCount, setFailedSyncCount] = useState(0);
  const [offlineCourseIds, setOfflineCourseIds] = useState([]);
  const syncingRef = useRef(false);

  const refreshOfflineStatus = useCallback(async () => {
    if (!user?.id) {
      setPendingSyncCount(0);
      setFailedSyncCount(0);
      setOfflineCourseIds([]);
      return;
    }
    try {
      const [queue, summary] = await Promise.all([
        getSyncQueueItems(user.id),
        getOfflineStorageSummary(user.id),
      ]);
      setPendingSyncCount(queue.length);
      setFailedSyncCount(queue.filter((q) => q.status === 'failed').length);
      setOfflineCourseIds(
        summary.courses
          .filter((c) => !c.isPartialCache)
          .map((c) => Number(c.courseId))
      );
    } catch (_e) {
      // IndexedDB unavailable in non-browser environment
    }
  }, [user?.id]);

  const triggerSync = useCallback(
    async ({ forceRetryAll = false } = {}) => {
      if (!user?.id || syncingRef.current) return null;
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        await refreshOfflineStatus();
        return null;
      }

      syncingRef.current = true;
      setSyncing(true);
      try {
        const result = await synchronizeUserQueue(user.id, { forceRetryAll });
        await refreshOfflineStatus();
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('rural-learning-progress-synced'));
        }
        return result;
      } finally {
        syncingRef.current = false;
        setSyncing(false);
      }
    },
    [refreshOfflineStatus, user?.id]
  );

  useEffect(() => {
    refreshOfflineStatus();
  }, [refreshOfflineStatus]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      triggerSync({ forceRetryAll: true });
    };
    const handleOffline = () => {
      setIsOnline(false);
    };
    const handleSwMessage = (event) => {
      if (event.data?.type === 'TRIGGER_OFFLINE_SYNC') {
        triggerSync({ forceRetryAll: false });
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleSwMessage);
    }

    // Foreground periodic retry every 45s ONLY when pending items exist and browser is online
    const retryInterval = window.setInterval(() => {
      if (navigator.onLine && pendingSyncCount > 0 && !syncingRef.current) {
        triggerSync({ forceRetryAll: false });
      }
    }, 45000);

    if (navigator.onLine && user?.id) {
      triggerSync({ forceRetryAll: false });
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', handleSwMessage);
      }
      window.clearInterval(retryInterval);
    };
  }, [pendingSyncCount, triggerSync, user?.id]);

  return (
    <OfflineContext.Provider
      value={{
        isOnline,
        isOffline: !isOnline,
        syncing,
        pendingSyncCount,
        failedSyncCount,
        offlineCourseIds,
        refreshOfflineStatus,
        triggerSync,
      }}
    >
      {children}
    </OfflineContext.Provider>
  );
};

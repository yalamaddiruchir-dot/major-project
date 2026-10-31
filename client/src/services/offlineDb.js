import axios from 'axios';

const DB_NAME = 'rural_learning_offline_v1';
const DB_VERSION = 1;

const STORES = {
  COURSES: 'courses',
  LESSONS: 'lessons',
  MEDIA: 'media_blobs',
  PROGRESS: 'offline_progress',
  SYNC_QUEUE: 'sync_queue',
};

const activeObjectUrls = new Set();

export const canonicalizeMediaKey = (rawUrl) => {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  const withoutQuery = rawUrl.split('?')[0];
  return withoutQuery.replace(/^\/api\/files\//, '/uploads/');
};

export const formatBytes = (bytes) => {
  const n = Number(bytes || 0);
  if (n <= 0) return '0 KB';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
};

let dbPromise = null;

export const openOfflineDb = () => {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is not supported in this browser environment.'));
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORES.COURSES)) {
        const s = db.createObjectStore(STORES.COURSES, { keyPath: 'key' });
        s.createIndex('by_user', 'userId', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.LESSONS)) {
        const s = db.createObjectStore(STORES.LESSONS, { keyPath: 'key' });
        s.createIndex('by_user', 'userId', { unique: false });
        s.createIndex('by_user_course', ['userId', 'courseId'], { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.MEDIA)) {
        const s = db.createObjectStore(STORES.MEDIA, { keyPath: 'key' });
        s.createIndex('by_user', 'userId', { unique: false });
        s.createIndex('by_user_course', ['userId', 'courseId'], { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.PROGRESS)) {
        const s = db.createObjectStore(STORES.PROGRESS, { keyPath: 'key' });
        s.createIndex('by_user', 'userId', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.SYNC_QUEUE)) {
        const s = db.createObjectStore(STORES.SYNC_QUEUE, { keyPath: 'idempotency_key' });
        s.createIndex('by_user', 'userId', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      dbPromise = null;
      reject(request.error);
    };
  });

  return dbPromise;
};

export const resetOfflineDbHandleForTests = async () => {
  if (dbPromise) {
    try {
      const db = await dbPromise;
      db.close();
    } catch (_e) {
      // ignore
    }
    dbPromise = null;
  }
};

const runTx = async (storeNames, mode, callback) => {
  const db = await openOfflineDb();
  return new Promise((resolve, reject) => {
    const names = Array.isArray(storeNames) ? storeNames : [storeNames];
    const tx = db.transaction(names, mode);
    let result;
    Promise.resolve(callback(tx))
      .then((res) => {
        result = res;
      })
      .catch((err) => {
        try { tx.abort(); } catch (_e) { /* ignore */ }
        reject(err);
      });
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
  });
};

const reqToPromise = (request) => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

const getAllByUser = async (storeName, userId) => {
  if (!userId) return [];
  return runTx(storeName, 'readonly', (tx) => {
    const index = tx.objectStore(storeName).index('by_user');
    return reqToPromise(index.getAll(Number(userId)));
  });
};

// Cache individual lesson opened online
export const cacheOpenedLesson = async (userId, lesson, course) => {
  if (!userId || !lesson?.id) return;
  const uid = Number(userId);
  const serializedSize = new Blob([JSON.stringify(lesson)]).size;
  await runTx([STORES.LESSONS, STORES.COURSES], 'readwrite', async (tx) => {
    tx.objectStore(STORES.LESSONS).put({
      key: `${uid}:${lesson.id}`,
      userId: uid,
      courseId: Number(lesson.course_id),
      lessonId: Number(lesson.id),
      lesson,
      sizeBytes: serializedSize,
      downloadedAt: new Date().toISOString(),
    });
    if (course?.id) {
      const existingCourse = await reqToPromise(tx.objectStore(STORES.COURSES).get(`${uid}:${course.id}`));
      if (!existingCourse) {
        tx.objectStore(STORES.COURSES).put({
          key: `${uid}:${course.id}`,
          userId: uid,
          courseId: Number(course.id),
          course,
          courseMaterials: [],
          isPartialCache: true,
          sizeBytes: new Blob([JSON.stringify(course)]).size,
          downloadedAt: new Date().toISOString(),
        });
      }
    }
  });
};

export const getOfflineCourse = async (userId, courseId) => {
  if (!userId || !courseId) return null;
  return runTx(STORES.COURSES, 'readonly', (tx) => (
    reqToPromise(tx.objectStore(STORES.COURSES).get(`${Number(userId)}:${Number(courseId)}`))
  ));
};

export const getOfflineCoursesList = async (userId) => {
  const rows = await getAllByUser(STORES.COURSES, userId);
  return rows.sort((a, b) => String(b.downloadedAt).localeCompare(String(a.downloadedAt)));
};

export const getOfflineLesson = async (userId, lessonId) => {
  if (!userId || !lessonId) return null;
  const rec = await runTx(STORES.LESSONS, 'readonly', (tx) => (
    reqToPromise(tx.objectStore(STORES.LESSONS).get(`${Number(userId)}:${Number(lessonId)}`))
  ));
  return rec ? rec.lesson || rec : null;
};

export const getOfflineCourseBundle = async (userId, courseId) => {
  if (!userId || !courseId) return null;
  const uid = Number(userId);
  const cid = Number(courseId);
  const courseRec = await getOfflineCourse(uid, cid);
  if (!courseRec) return null;
  const allLessons = await getAllByUser(STORES.LESSONS, uid);
  const courseLessons = allLessons
    .filter((r) => Number(r.courseId) === cid)
    .map((r) => r.lesson || r)
    .sort((a, b) => Number(a.order_index || 0) - Number(b.order_index || 0));
  return {
    ...courseRec,
    lessons: courseLessons,
    materials: courseRec.courseMaterials || [],
  };
};

export const getOfflineLessonIdsForCourse = async (userId, courseId) => {
  if (!userId || !courseId) return [];
  const rows = await getAllByUser(STORES.LESSONS, userId);
  return rows
    .filter((r) => Number(r.courseId) === Number(courseId))
    .map((r) => Number(r.lessonId));
};

// Download and store a media file (PDF, audio, image, video, document) as an ArrayBuffer in IndexedDB
export const saveMediaBlobOffline = async (
  userId,
  {
    canonicalUrl,
    downloadUrl,
    courseId,
    lessonId = null,
    fileName = null,
    mimeType = null,
    onProgress = null,
  },
  apiClient = axios
) => {
  const uid = Number(userId);
  const canon = canonicalizeMediaKey(canonicalUrl || downloadUrl);
  if (!uid || !canon) throw new Error('Valid user and media URL required');

  const response = await apiClient.get(downloadUrl || canonicalUrl, {
    responseType: 'arraybuffer',
    onDownloadProgress: (evt) => {
      if (onProgress && evt.total) {
        onProgress(Math.round((evt.loaded / evt.total) * 100));
      }
    },
  });

  const buffer = response.data;
  const detectedMime = mimeType
    || response.headers?.['content-type']
    || 'application/octet-stream';
  const byteLength = buffer?.byteLength || 0;

  await runTx(STORES.MEDIA, 'readwrite', (tx) => {
    tx.objectStore(STORES.MEDIA).put({
      key: `${uid}:${canon}`,
      userId: uid,
      courseId: courseId ? Number(courseId) : null,
      lessonId: lessonId ? Number(lessonId) : null,
      canonicalPath: canon,
      fileName: fileName || canon.split('/').pop(),
      mimeType: detectedMime,
      arrayBuffer: buffer,
      sizeBytes: byteLength,
      downloadedAt: new Date().toISOString(),
    });
  });

  if (onProgress) onProgress(100);
  return { canonicalPath: canon, sizeBytes: byteLength, mimeType: detectedMime };
};

export const hasOfflineMedia = async (userId, rawUrl) => {
  const canon = canonicalizeMediaKey(rawUrl);
  if (!userId || !canon) return false;
  const rec = await runTx(STORES.MEDIA, 'readonly', (tx) => (
    reqToPromise(tx.objectStore(STORES.MEDIA).get(`${Number(userId)}:${canon}`))
  ));
  return Boolean(rec && rec.arrayBuffer);
};

export const getOfflineMediaObjectUrl = async (userId, rawUrl) => {
  const canon = canonicalizeMediaKey(rawUrl);
  if (!userId || !canon) return null;
  const rec = await runTx(STORES.MEDIA, 'readonly', (tx) => (
    reqToPromise(tx.objectStore(STORES.MEDIA).get(`${Number(userId)}:${canon}`))
  ));
  if (!rec || !rec.arrayBuffer) return null;
  const blob = new Blob([rec.arrayBuffer], { type: rec.mimeType || 'application/octet-stream' });
  if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
    const objUrl = URL.createObjectURL(blob);
    activeObjectUrls.add(objUrl);
    return objUrl;
  }
  return null;
};

// Download an entire course bundle + all offline-compatible assets into IndexedDB
export const downloadFullCourseOffline = async (
  userId,
  courseId,
  { includeVideos = true, lowBandwidth = false, onProgress = null } = {},
  apiClient = axios
) => {
  const uid = Number(userId);
  const cid = Number(courseId);
  if (onProgress) onProgress(5);

  const bundleRes = await apiClient.get(`/api/courses/${cid}/offline-bundle`);
  const { course, lessons = [], courseMaterials = [] } = bundleRes.data.bundle;

  const mediaTasks = [];
  const collectMediaTask = (rawUrl, signedUrl, lessonId, mType) => {
    if (!rawUrl) return;
    // YouTube streams cannot be downloaded as raw files; direct/uploaded videos CAN be downloaded
    if (mType === 'video' && (!includeVideos || /youtube\.com|youtu\.be/i.test(rawUrl))) return;
    if (/^https?:\/\//i.test(rawUrl) && !/\.(mp4|webm|ogg|mp3|wav|m4a|pdf|png|jpe?g|webp|txt|csv)$/i.test(rawUrl.split('?')[0])) {
      return;
    }
    mediaTasks.push({
      canonicalUrl: rawUrl,
      downloadUrl: signedUrl || rawUrl,
      courseId: cid,
      lessonId,
    });
  };

  for (const lesson of lessons) {
    collectMediaTask(lesson.pdf_url, lesson.pdf_url_signed, lesson.id, 'pdf');
    collectMediaTask(lesson.audio_url, lesson.audio_url_signed, lesson.id, 'audio');
    if (!lowBandwidth) {
      collectMediaTask(lesson.image_url, lesson.image_url_signed, lesson.id, 'image');
    }
    const chosenVideo = lowBandwidth && lesson.low_bandwidth_video_url
      ? lesson.low_bandwidth_video_url
      : lesson.video_url;
    const chosenSignedVideo = lowBandwidth && lesson.low_bandwidth_video_url_signed
      ? lesson.low_bandwidth_video_url_signed
      : lesson.video_url_signed;
    collectMediaTask(chosenVideo, chosenSignedVideo, lesson.id, 'video');

    for (const mat of lesson.materials || []) {
      const matUrl = lowBandwidth && mat.low_bandwidth_url ? mat.low_bandwidth_url : mat.file_url;
      const matSigned = lowBandwidth && mat.low_bandwidth_url_signed ? mat.low_bandwidth_url_signed : mat.file_url_signed;
      collectMediaTask(matUrl, matSigned, lesson.id, mat.material_type);
    }
  }

  for (const mat of courseMaterials) {
    const matUrl = lowBandwidth && mat.low_bandwidth_url ? mat.low_bandwidth_url : mat.file_url;
    const matSigned = lowBandwidth && mat.low_bandwidth_url_signed ? mat.low_bandwidth_url_signed : mat.file_url_signed;
    collectMediaTask(matUrl, matSigned, null, mat.material_type);
  }

  let totalBytes = new Blob([JSON.stringify(bundleRes.data.bundle)]).size;

  await runTx([STORES.COURSES, STORES.LESSONS], 'readwrite', (tx) => {
    for (const lesson of lessons) {
      const sz = new Blob([JSON.stringify(lesson)]).size;
      tx.objectStore(STORES.LESSONS).put({
        key: `${uid}:${lesson.id}`,
        userId: uid,
        courseId: cid,
        lessonId: Number(lesson.id),
        lesson,
        sizeBytes: sz,
        downloadedAt: new Date().toISOString(),
      });
    }
    tx.objectStore(STORES.COURSES).put({
      key: `${uid}:${cid}`,
      userId: uid,
      courseId: cid,
      course,
      courseMaterials,
      isPartialCache: false,
      lessonCount: lessons.length,
      sizeBytes: totalBytes,
      downloadedAt: new Date().toISOString(),
    });
  });

  if (mediaTasks.length === 0) {
    if (onProgress) onProgress(100);
    return { courseId: cid, lessonsCount: lessons.length, mediaCount: 0, totalBytes };
  }

  let completedMedia = 0;
  for (const task of mediaTasks) {
    try {
      const saved = await saveMediaBlobOffline(uid, task, apiClient);
      totalBytes += saved.sizeBytes;
    } catch (_mediaErr) {
      // Keep text & remaining media even if one external link fails
    }
    completedMedia += 1;
    if (onProgress) {
      onProgress(Math.min(99, 15 + Math.round((completedMedia / mediaTasks.length) * 84)));
    }
  }

  await runTx(STORES.COURSES, 'readwrite', async (tx) => {
    const store = tx.objectStore(STORES.COURSES);
    const rec = await reqToPromise(store.get(`${uid}:${cid}`));
    if (rec) {
      rec.sizeBytes = totalBytes;
      store.put(rec);
    }
  });

  if (onProgress) onProgress(100);
  return { courseId: cid, lessonsCount: lessons.length, mediaCount: completedMedia, totalBytes };
};

export const removeOfflineCourse = async (userId, courseId) => {
  const uid = Number(userId);
  const cid = Number(courseId);
  const lessons = await getAllByUser(STORES.LESSONS, uid);
  const media = await getAllByUser(STORES.MEDIA, uid);

  await runTx([STORES.COURSES, STORES.LESSONS, STORES.MEDIA], 'readwrite', (tx) => {
    tx.objectStore(STORES.COURSES).delete(`${uid}:${cid}`);
    lessons
      .filter((l) => Number(l.courseId) === cid)
      .forEach((l) => tx.objectStore(STORES.LESSONS).delete(l.key));
    media
      .filter((m) => Number(m.courseId) === cid)
      .forEach((m) => tx.objectStore(STORES.MEDIA).delete(m.key));
  });
};

// Monotonic local progress cache & offline synchronization queue
export const recordLocalProgress = async (userId, progressRow) => {
  if (!userId || !progressRow?.lesson_id) return null;
  const uid = Number(userId);
  const lid = Number(progressRow.lesson_id);
  const key = `${uid}:${lid}`;

  return runTx(STORES.PROGRESS, 'readwrite', async (tx) => {
    const store = tx.objectStore(STORES.PROGRESS);
    const prev = await reqToPromise(store.get(key));
    const mergedStatus = prev?.completion_status === 'completed'
      ? 'completed'
      : (progressRow.completion_status || prev?.completion_status || 'in_progress');
    const mergedPct = mergedStatus === 'completed'
      ? 100
      : Math.max(Number(prev?.progress_percentage || 0), Number(progressRow.progress_percentage || 0));

    const next = {
      key,
      userId: uid,
      course_id: Number(progressRow.course_id || prev?.course_id),
      lesson_id: lid,
      completion_status: mergedStatus,
      progress_percentage: mergedPct,
      time_spent_minutes: Number(progressRow.time_spent_minutes ?? prev?.time_spent_minutes ?? 0),
      last_position_seconds: Number(progressRow.last_position_seconds ?? prev?.last_position_seconds ?? 0),
      updated_at: new Date().toISOString(),
    };
    store.put(next);
    return next;
  });
};

export const getOfflineProgressForUser = async (userId, filter = {}) => {
  const opts = typeof filter === 'number' || typeof filter === 'string'
    ? { courseId: Number(filter) }
    : (filter || {});
  const all = await getAllByUser(STORES.PROGRESS, userId);
  return all.filter((item) => {
    if (opts.courseId && Number(item.course_id) !== Number(opts.courseId)) return false;
    if (opts.lessonId && Number(item.lesson_id) !== Number(opts.lessonId)) return false;
    return true;
  });
};

export const recordLessonProgressWithOfflineSupport = async (userId, payload, apiClient = axios) => {
  const uid = Number(userId);
  const minutes = payload.time_spent_minutes !== undefined
    ? Number(payload.time_spent_minutes)
    : Math.max(1, Math.round(Number(payload.time_spent_delta || 60) / 60));

  const cleanBody = {
    course_id: Number(payload.course_id),
    lesson_id: Number(payload.lesson_id),
    completion_status: payload.completion_status || 'in_progress',
    progress_percentage: Number(payload.progress_percentage ?? (payload.completion_status === 'completed' ? 100 : 50)),
    time_spent_minutes: minutes,
    last_position_seconds: Math.max(0, Math.floor(Number(payload.last_position_seconds || 0))),
  };

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    const queued = await enqueueOfflineProgress(uid, cleanBody);
    return { progress: queued, queuedOffline: true };
  }

  try {
    const res = await apiClient.post('/api/progress', cleanBody);
    const saved = res.data.progress || cleanBody;
    await recordLocalProgress(uid, saved);
    return { progress: saved, queuedOffline: false };
  } catch (err) {
    if (!err.response || err.response.status >= 500) {
      const queued = await enqueueOfflineProgress(uid, cleanBody);
      return { progress: queued, queuedOffline: true };
    }
    throw err;
  }
};

export const enqueueOfflineProgress = async (userId, payload) => {
  const uid = Number(userId);
  const idempotencyKey = payload.idempotency_key
    || `prog-${uid}-${payload.lesson_id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const cleanPayload = {
    course_id: Number(payload.course_id),
    lesson_id: Number(payload.lesson_id),
    completion_status: payload.completion_status || 'in_progress',
    progress_percentage: Number(payload.progress_percentage ?? 0),
    time_spent_minutes: Number(payload.time_spent_minutes ?? 0),
    last_position_seconds: Number(payload.last_position_seconds ?? 0),
    idempotency_key: idempotencyKey,
  };

  await recordLocalProgress(uid, cleanPayload);

  await runTx(STORES.SYNC_QUEUE, 'readwrite', (tx) => {
    tx.objectStore(STORES.SYNC_QUEUE).put({
      idempotency_key: idempotencyKey,
      userId: uid,
      type: 'progress',
      payload: cleanPayload,
      status: 'pending',
      permanent: false,
      retryCount: 0,
      nextRetryAt: 0,
      lastError: null,
      createdAt: new Date().toISOString(),
    });
  });

  // Request Background Sync if supported by browser; foreground fallback also runs automatically
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator && navigator.serviceWorker.ready) {
    navigator.serviceWorker.ready
      .then((reg) => {
        if (reg && 'sync' in reg) {
          return reg.sync.register('rural-learning-sync');
        }
        return null;
      })
      .catch(() => {});
  }

  return cleanPayload;
};

export const getSyncQueueItems = async (userId) => {
  const items = await getAllByUser(STORES.SYNC_QUEUE, userId);
  return items.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
};

export const removeSyncQueueItem = async (idempotencyKey) => {
  await runTx(STORES.SYNC_QUEUE, 'readwrite', (tx) => {
    tx.objectStore(STORES.SYNC_QUEUE).delete(idempotencyKey);
  });
};

export const synchronizeUserQueue = async (userId, { forceRetryAll = false } = {}, apiClient = axios) => {
  if (!userId) return { syncedCount: 0, remainingCount: 0, failedCount: 0 };
  const uid = Number(userId);
  const now = Date.now();
  const queue = await getSyncQueueItems(uid);
  if (queue.length === 0) return { syncedCount: 0, remainingCount: 0, failedCount: 0 };

  const eligible = queue.filter((item) => {
    if (forceRetryAll) return true;
    if (item.permanent) return false;
    return !item.nextRetryAt || now >= item.nextRetryAt;
  });

  if (eligible.length === 0) {
    return {
      syncedCount: 0,
      remainingCount: queue.length,
      failedCount: queue.filter((q) => q.status === 'failed').length,
    };
  }

  try {
    const response = await apiClient.post('/api/progress/sync', {
      updates: eligible.map((item) => item.payload),
    });

    const { synced = [], skipped_duplicates: skipped = [], failed = [] } = response.data;
    const completedKeys = new Set([
      ...synced.map((s) => s.idempotency_key),
      ...skipped.map((s) => s.idempotency_key),
    ]);

    for (const s of [...synced, ...skipped]) {
      if (s.progress) {
        await recordLocalProgress(uid, s.progress);
      }
    }

    const failedByKey = new Map(failed.map((f) => [f.idempotency_key, f]));

    await runTx(STORES.SYNC_QUEUE, 'readwrite', (tx) => {
      const store = tx.objectStore(STORES.SYNC_QUEUE);
      for (const item of eligible) {
        if (completedKeys.has(item.idempotency_key)) {
          store.delete(item.idempotency_key);
        } else if (failedByKey.has(item.idempotency_key)) {
          const errInfo = failedByKey.get(item.idempotency_key);
          const nextRetries = Number(item.retryCount || 0) + 1;
          store.put({
            ...item,
            status: 'failed',
            permanent: Boolean(errInfo.permanent),
            retryCount: nextRetries,
            nextRetryAt: Date.now() + Math.min(300000, 2000 * (2 ** nextRetries)),
            lastError: errInfo.message || 'Synchronization rejected by server',
          });
        }
      }
    });

    const updatedQueue = await getSyncQueueItems(uid);
    return {
      syncedCount: completedKeys.size,
      remainingCount: updatedQueue.length,
      failedCount: updatedQueue.filter((q) => q.status === 'failed').length,
    };
  } catch (networkErr) {
    // Preserve every item in queue with exponential backoff; never silently drop data
    await runTx(STORES.SYNC_QUEUE, 'readwrite', (tx) => {
      const store = tx.objectStore(STORES.SYNC_QUEUE);
      for (const item of eligible) {
        const nextRetries = Number(item.retryCount || 0) + 1;
        store.put({
          ...item,
          status: 'failed',
          retryCount: nextRetries,
          nextRetryAt: Date.now() + Math.min(120000, 2000 * (2 ** Math.min(nextRetries, 5))),
          lastError: networkErr.response?.data?.message || networkErr.message || 'Network unavailable',
        });
      }
    });

    const updatedQueue = await getSyncQueueItems(uid);
    return {
      syncedCount: 0,
      remainingCount: updatedQueue.length,
      failedCount: updatedQueue.length,
      error: networkErr.message,
    };
  }
};

export const getOfflineStorageSummary = async (userId) => {
  const uid = Number(userId);
  if (!uid) {
    return { courses: [], lessonsCount: 0, mediaCount: 0, usedBytes: 0, quotaBytes: null, syncQueue: [] };
  }
  const [courses, lessons, media, syncQueue] = await Promise.all([
    getOfflineCoursesList(uid),
    getAllByUser(STORES.LESSONS, uid),
    getAllByUser(STORES.MEDIA, uid),
    getSyncQueueItems(uid),
  ]);

  const lessonBytes = lessons.reduce((acc, l) => acc + Number(l.sizeBytes || 0), 0);
  const mediaBytes = media.reduce((acc, m) => acc + Number(m.sizeBytes || 0), 0);

  let quotaBytes = null;
  if (typeof navigator !== 'undefined' && navigator.storage && typeof navigator.storage.estimate === 'function') {
    try {
      const est = await navigator.storage.estimate();
      quotaBytes = est?.quota || null;
    } catch (_e) {
      quotaBytes = null;
    }
  }

  const fullCourses = courses.filter((c) => !c.isPartialCache).map((c) => ({
    ...c,
    downloadedBytes: Number(c.sizeBytes || 0),
  }));

  return {
    courses: fullCourses,
    courseCount: fullCourses.length,
    lessonsCount: lessons.length,
    mediaCount: media.length,
    usedBytes: lessonBytes + mediaBytes,
    totalMediaBytes: lessonBytes + mediaBytes,
    quotaBytes,
    browserQuotaBytes: quotaBytes,
    syncQueue,
    pendingSyncCount: syncQueue.length,
    failedSyncCount: syncQueue.filter((q) => q.status === 'failed').length,
  };
};

export const downloadCourseForOffline = async (
  userId,
  courseId,
  { includeVideo = true, lowBandwidth = false, onProgress = null } = {},
  apiClient = axios
) => downloadFullCourseOffline(
  userId,
  courseId,
  {
    includeVideos: includeVideo,
    lowBandwidth,
    onProgress: onProgress
      ? (pct) => onProgress({ percent: pct, label: pct < 100 ? 'Downloading course & media...' : 'Complete' })
      : null,
  },
  apiClient
);

export const clearOfflineDownloads = async (userId) => purgeUserOfflineCache(userId, { preservePendingSync: true });

// Clear downloaded content or perform full private cache wipe on logout
export const purgeUserOfflineCache = async (userId, { preservePendingSync = false } = {}) => {
  activeObjectUrls.forEach((objUrl) => {
    try { URL.revokeObjectURL(objUrl); } catch (_e) { /* ignore */ }
  });
  activeObjectUrls.clear();

  if (userId) {
    const uid = Number(userId);
    const [courses, lessons, media, progress, queue] = await Promise.all([
      getAllByUser(STORES.COURSES, uid),
      getAllByUser(STORES.LESSONS, uid),
      getAllByUser(STORES.MEDIA, uid),
      getAllByUser(STORES.PROGRESS, uid),
      getAllByUser(STORES.SYNC_QUEUE, uid),
    ]);

    const storesToClear = preservePendingSync
      ? [STORES.COURSES, STORES.LESSONS, STORES.MEDIA]
      : [STORES.COURSES, STORES.LESSONS, STORES.MEDIA, STORES.PROGRESS, STORES.SYNC_QUEUE];

    await runTx(storesToClear, 'readwrite', (tx) => {
      courses.forEach((c) => tx.objectStore(STORES.COURSES).delete(c.key));
      lessons.forEach((l) => tx.objectStore(STORES.LESSONS).delete(l.key));
      media.forEach((m) => tx.objectStore(STORES.MEDIA).delete(m.key));
      if (!preservePendingSync) {
        progress.forEach((p) => tx.objectStore(STORES.PROGRESS).delete(p.key));
        queue.forEach((q) => tx.objectStore(STORES.SYNC_QUEUE).delete(q.idempotency_key));
      }
    });
  }

  // Also remove legacy localStorage keys if any existed
  if (typeof localStorage !== 'undefined' && !preservePendingSync) {
    try {
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const k = localStorage.key(i);
        if (k && (k.startsWith('rural-learning-lessons-') || k.startsWith('rural-learning-progress-'))) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));
    } catch (_e) {
      // ignore
    }
  }

  if (
    !preservePendingSync
    && typeof navigator !== 'undefined'
    && 'serviceWorker' in navigator
    && navigator.serviceWorker.controller
  ) {
    try {
      navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_PRIVATE_CACHES' });
    } catch (_e) {
      // ignore
    }
  }
};

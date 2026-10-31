import {
  downloadCourseForOffline,
  getOfflineCourseBundle,
  getOfflineCoursesList,
  getOfflineLesson,
  recordLessonProgressWithOfflineSupport,
  getOfflineProgressForUser,
  getOfflineStorageSummary,
  synchronizeUserQueue,
  purgeUserOfflineCache,
} from '../services/offlineDb';

describe('Offline Learning Engine (IndexedDB Storage, Progress Queue, Exponential Backoff, Multi-User Isolation & Logout Wipe)', () => {
  const originalOnLine = navigator.onLine;

  const setOnlineState = (isOnline) => {
    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      value: isOnline,
    });
  };

  afterEach(async () => {
    setOnlineState(originalOnLine);
    await purgeUserOfflineCache(101);
    await purgeUserOfflineCache(202);
  });

  test('Downloads course bundle + media into IndexedDB, serves offline, queues offline progress, survives failed sync, and wipes on logout', async () => {
    const userId = 101;
    setOnlineState(true);

    const pdfArrayBuffer = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]).buffer;
    const mockApiClient = {
      get: jest.fn((url, config) => {
        if (url === '/api/courses/7/offline-bundle') {
          return Promise.resolve({
            data: {
              bundle: {
                course: {
                  id: 7,
                  title: 'Offline Rural Mathematics',
                  description: 'Geometry & Fractions for Class 7',
                  category: 'Mathematics',
                  language: 'en',
                  lessons_count: 1,
                },
                lessons: [
                  {
                    id: 70,
                    course_id: 7,
                    title: 'Understanding Triangles',
                    content: 'Sum of interior angles of a triangle is 180 degrees.',
                    lesson_type: 'pdf',
                    pdf_url: '/uploads/pdfs/triangles.pdf',
                    pdf_url_signed: '/api/files/pdfs/triangles.pdf?media_token=abc',
                    materials: [],
                    assessments: [],
                  },
                ],
                courseMaterials: [],
              },
            },
          });
        }
        if (config?.responseType === 'arraybuffer') {
          return Promise.resolve({
            data: pdfArrayBuffer,
            headers: { 'content-type': 'application/pdf' },
          });
        }
        return Promise.reject(new Error(`Unexpected GET ${url}`));
      }),
      post: jest.fn(),
    };

    const progressUpdates = [];
    await downloadCourseForOffline(
      userId,
      7,
      {
        includeVideo: true,
        onProgress: (info) => progressUpdates.push(info.percent),
      },
      mockApiClient
    );

    expect(progressUpdates[progressUpdates.length - 1]).toBe(100);

    // Switch device to OFFLINE mode
    setOnlineState(false);

    const offlineCourses = await getOfflineCoursesList(userId);
    expect(offlineCourses.length).toBe(1);
    expect(offlineCourses[0].course.title).toBe('Offline Rural Mathematics');

    const bundle = await getOfflineCourseBundle(userId, 7);
    expect(bundle.lessons.length).toBe(1);

    const offlineLesson = await getOfflineLesson(userId, 70);
    expect(offlineLesson.content).toContain('180 degrees');

    // Record lesson completion while offline -> stored locally & queued for sync
    const offlineRecord = await recordLessonProgressWithOfflineSupport(
      userId,
      {
        course_id: 7,
        lesson_id: 70,
        completion_status: 'completed',
        progress_percentage: 100,
        time_spent_minutes: 14,
      },
      mockApiClient
    );
    expect(offlineRecord.queuedOffline).toBe(true);

    const localProg = await getOfflineProgressForUser(userId, { courseId: 7 });
    expect(localProg.length).toBe(1);
    expect(localProg[0].completion_status).toBe('completed');

    let summary = await getOfflineStorageSummary(userId);
    expect(summary.pendingSyncCount).toBe(1);

    // Reconnect, but simulate transient 2G drop -> item MUST stay preserved in queue with backoff!
    setOnlineState(true);
    mockApiClient.post.mockRejectedValueOnce(new Error('Network timeout on 2G link'));
    const failedAttempt = await synchronizeUserQueue(userId, { forceRetryAll: true }, mockApiClient);
    expect(failedAttempt.failedCount).toBe(1);
    expect(failedAttempt.remainingCount).toBe(1);

    // Multi-user isolation: user 202 cannot see user 101's cached courses or sync queue
    const otherUserCourses = await getOfflineCoursesList(202);
    expect(otherUserCourses.length).toBe(0);

    // Secure logout wipes private IndexedDB data for shared school tablet safety
    await purgeUserOfflineCache(userId);
    const afterLogoutCourses = await getOfflineCoursesList(userId);
    const afterLogoutSummary = await getOfflineStorageSummary(userId);
    expect(afterLogoutCourses.length).toBe(0);
    expect(afterLogoutSummary.pendingSyncCount).toBe(0);
  });

  test('Queued offline progress flushes cleanly to /api/progress/sync when connection returns', async () => {
    const userId = 202;
    setOnlineState(false);

    const mockApiClient = {
      post: jest.fn().mockResolvedValue({
        data: {
          synced: [{ progress: { course_id: 3, lesson_id: 31, completion_status: 'completed', progress_percentage: 100 } }],
          skipped_duplicates: [],
          failed: [],
        },
      }),
    };

    const recorded = await recordLessonProgressWithOfflineSupport(
      userId,
      {
        course_id: 3,
        lesson_id: 31,
        completion_status: 'completed',
        progress_percentage: 100,
        time_spent_minutes: 8,
      },
      mockApiClient
    );

    setOnlineState(true);
    mockApiClient.post.mockResolvedValueOnce({
      data: {
        synced: [
          {
            idempotency_key: recorded.progress.idempotency_key,
            progress: { course_id: 3, lesson_id: 31, completion_status: 'completed', progress_percentage: 100 },
          },
        ],
        skipped_duplicates: [],
        failed: [],
      },
    });

    const res = await synchronizeUserQueue(userId, { forceRetryAll: true }, mockApiClient);
    expect(res.syncedCount).toBe(1);
    expect(res.remainingCount).toBe(0);
    expect(mockApiClient.post).toHaveBeenCalledWith(
      '/api/progress/sync',
      expect.objectContaining({
        updates: expect.arrayContaining([
          expect.objectContaining({ course_id: 3, lesson_id: 31, completion_status: 'completed' }),
        ]),
      })
    );
  });
});

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { axe } from 'jest-axe';
import { AppProviders, AppRoutes } from '../App';
import AudioLessonPlayer from '../components/AudioLessonPlayer';
import { resolveEntityTranslation } from '../i18n/translations';

const renderWithProviders = (initialPath = '/') =>
  render(
    <MemoryRouter initialEntries={[initialPath]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AppProviders>
        <AppRoutes />
      </AppProviders>
    </MemoryRouter>
  );

describe('Multilingual (en/te/hi), Accessibility (WCAG/jest-axe), Audio Player & Rural Low-Bandwidth UI', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('Switches UI language across English, Telugu, and Hindi with persistence and html[lang] updates', async () => {
    renderWithProviders('/login');

    expect(document.documentElement.lang).toBe('en');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Welcome Back/i);

    // Switch to Telugu via language selector in Navbar
    const langSelect = screen.getByRole('combobox', { name: /Language/i });
    fireEvent.mouseDown(langSelect);
    const teOption = await screen.findByRole('option', { name: /తెలుగు/i });
    fireEvent.click(teOption);

    expect(localStorage.getItem('rural_learning_ui_lang')).toBe('te');
    expect(document.documentElement.lang).toBe('te');
    expect(screen.getByRole('heading', { level: 1 })).not.toHaveTextContent(/Welcome Back/i);

    // Switch to Hindi
    const teLangSelect = screen.getByRole('combobox');
    fireEvent.mouseDown(teLangSelect);
    const hiOption = await screen.findByRole('option', { name: /हिन्दी/i });
    fireEvent.click(hiOption);

    expect(localStorage.getItem('rural_learning_ui_lang')).toBe('hi');
    expect(document.documentElement.lang).toBe('hi');
    expect(screen.getByRole('button', { name: /साइन इन|लॉग/i })).toBeInTheDocument();
  });

  test('Text resizing and Low-Bandwidth mode persist user preferences cleanly', () => {
    renderWithProviders('/login');

    const textSizeBtn = screen.getByRole('button', { name: /Text Size 100%/i });
    fireEvent.click(textSizeBtn);
    expect(screen.getByRole('button', { name: /Text Size 115%/i })).toBeInTheDocument();

    const lowBwBtn = screen.getByRole('button', { name: /Low Data/i });
    expect(lowBwBtn).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(lowBwBtn);
    expect(screen.getByRole('button', { name: /Low Data/i })).toHaveAttribute('aria-pressed', 'true');
  });

  test('resolveEntityTranslation uses genuine teacher translations and NEVER invents missing translations', () => {
    const course = {
      title: 'Basic Fractions',
      description: 'Learn numerator and denominator.',
      language: 'en',
      translations: {
        te: {
          title: 'ప్రాథమిక భిన్నాలు',
          description: 'లవం మరియు హారం నేర్చుకోండి.',
        },
      },
    };

    const teView = resolveEntityTranslation(course, 'te');
    expect(teView.title).toBe('ప్రాథమిక భిన్నాలు');
    expect(teView.isFallbackLanguage).toBe(false);
    expect(teView.activeLanguage).toBe('te');

    // Hindi was NOT provided by teacher -> falls back honestly to original English with flag
    const hiView = resolveEntityTranslation(course, 'hi');
    expect(hiView.title).toBe('Basic Fractions');
    expect(hiView.isFallbackLanguage).toBe(true);
    expect(hiView.activeLanguage).toBe('en');
  });

  test('AudioLessonPlayer supports play/pause and 0.75x to 2x playback speeds with accessible controls', async () => {
    render(
      <MemoryRouter>
        <AppProviders>
          <AudioLessonPlayer
            src="/api/files/audio/sample-lesson.mp3"
            lessonId={10}
            courseId={2}
            userId={5}
            title="Spoken Science Narration"
          />
        </AppProviders>
      </MemoryRouter>
    );

    expect(screen.getByText(/Spoken Science Narration/i)).toBeInTheDocument();

    const playBtn = screen.getByRole('button', { name: /Play/i });
    fireEvent.click(playBtn);
    expect(window.HTMLMediaElement.prototype.play).toHaveBeenCalled();

    // Change playback speed to 1.5x and 0.75x
    const speedSelect = screen.getByLabelText(/Playback Speed/i);
    fireEvent.mouseDown(speedSelect);
    const speed15 = await screen.findByRole('option', { name: '1.5x' });
    fireEvent.click(speed15);

    const audioEl = document.querySelector('audio');
    expect(audioEl.playbackRate).toBe(1.5);

    fireEvent.mouseDown(screen.getByLabelText(/Playback Speed/i));
    const speed075 = await screen.findByRole('option', { name: '0.75x' });
    fireEvent.click(speed075);
    expect(audioEl.playbackRate).toBe(0.75);
  });

  test('Mobile navigation drawer opens cleanly on narrow Android screens', () => {
    renderWithProviders('/courses');
    const menuBtn = screen.getByRole('button', { name: /open navigation menu/i });
    fireEvent.click(menuBtn);
    expect(screen.getAllByText(/Verify Certificate/i).length).toBeGreaterThanOrEqual(1);
  });

  test('Public pages pass automated WCAG accessibility audit (jest-axe) with zero violations', async () => {
    for (const route of ['/', '/login', '/register', '/verify-certificate']) {
      const { container, unmount } = renderWithProviders(route);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
      unmount();
    }
  });
});

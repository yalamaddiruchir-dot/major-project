-- Digital Learning Platform for Rural Schools - Complete Database Schema

-- Schema migration tracking table
CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    description TEXT,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'teacher', 'admin')),
    school_name TEXT,
    class_grade TEXT,
    preferred_language TEXT DEFAULT 'en',
    low_bandwidth_mode BOOLEAN DEFAULT 0,
    is_active BOOLEAN DEFAULT 1,
    token_version INTEGER DEFAULT 0,
    failed_login_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMP,
    last_login_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Revoked JWT tokens table (supports immediate logout revocation)
CREATE TABLE IF NOT EXISTS revoked_tokens (
    jti TEXT PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMP NOT NULL,
    revoked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Courses table
CREATE TABLE IF NOT EXISTS courses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT,
    language TEXT DEFAULT 'en',
    level TEXT DEFAULT 'beginner',
    passing_percentage INTEGER DEFAULT 60 CHECK (passing_percentage >= 0 AND passing_percentage <= 100),
    thumbnail_url TEXT,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Lessons table
CREATE TABLE IF NOT EXISTS lessons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    content TEXT NOT NULL,
    lesson_type TEXT DEFAULT 'text' CHECK (lesson_type IN ('text', 'video', 'audio', 'pdf', 'image', 'interactive', 'quiz')),
    video_url TEXT,
    low_bandwidth_video_url TEXT,
    audio_url TEXT,
    pdf_url TEXT,
    image_url TEXT,
    alt_text TEXT,
    file_size_bytes INTEGER DEFAULT 0,
    order_index INTEGER DEFAULT 0,
    duration_minutes INTEGER DEFAULT 15,
    is_active BOOLEAN DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Teacher-authored multilingual content translations (never auto-invented)
CREATE TABLE IF NOT EXISTS content_translations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('course', 'lesson')),
    entity_id INTEGER NOT NULL,
    language TEXT NOT NULL CHECK (language IN ('en', 'te', 'hi')),
    title TEXT NOT NULL,
    description TEXT,
    content TEXT,
    updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(entity_type, entity_id, language)
);

-- Learning Materials table (PDFs, images, audio, videos, downloadable resources)
CREATE TABLE IF NOT EXISTS learning_materials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    lesson_id INTEGER REFERENCES lessons(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    material_type TEXT NOT NULL CHECK (material_type IN ('pdf', 'image', 'audio', 'video', 'document')),
    file_url TEXT NOT NULL,
    low_bandwidth_url TEXT,
    file_name TEXT,
    mime_type TEXT,
    file_size_bytes INTEGER DEFAULT 0,
    alt_text TEXT,
    language TEXT DEFAULT 'en',
    is_downloadable BOOLEAN DEFAULT 1,
    uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User Progress table
CREATE TABLE IF NOT EXISTS user_progress (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    completion_status TEXT DEFAULT 'not_started' CHECK (completion_status IN ('not_started', 'in_progress', 'completed')),
    progress_percentage INTEGER DEFAULT 0 CHECK (progress_percentage >= 0 AND progress_percentage <= 100),
    time_spent_minutes INTEGER DEFAULT 0 CHECK (time_spent_minutes >= 0),
    last_position_seconds INTEGER DEFAULT 0 CHECK (last_position_seconds >= 0),
    last_accessed TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, lesson_id)
);

-- Offline Sync Idempotency Log (prevents duplicate progress updates during retries)
CREATE TABLE IF NOT EXISTS sync_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    idempotency_key TEXT NOT NULL,
    event_type TEXT NOT NULL,
    processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, idempotency_key)
);

-- Inline Lesson Quick Quiz/Assessment table (preserved for compatibility)
CREATE TABLE IF NOT EXISTS assessments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    question TEXT NOT NULL,
    options TEXT NOT NULL, -- JSON array stored as TEXT
    correct_answer INTEGER NOT NULL,
    points INTEGER DEFAULT 1,
    order_index INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Inline Lesson Assessment Results
CREATE TABLE IF NOT EXISTS assessment_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    assessment_id INTEGER NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
    selected_answer INTEGER,
    is_correct BOOLEAN,
    score INTEGER,
    attempted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Full Course & Scheduled Assessments Module
CREATE TABLE IF NOT EXISTS course_assessments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    lesson_id INTEGER REFERENCES lessons(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT,
    instructions TEXT,
    time_limit_minutes INTEGER,
    passing_percentage INTEGER NOT NULL DEFAULT 60 CHECK (passing_percentage >= 0 AND passing_percentage <= 100),
    total_marks INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts >= 0),
    show_correct_answers TEXT NOT NULL DEFAULT 'after_submission' CHECK (show_correct_answers IN ('after_submission', 'after_pass', 'never')),
    available_from TIMESTAMP,
    available_until TIMESTAMP,
    is_required_for_certificate BOOLEAN DEFAULT 1,
    is_published BOOLEAN DEFAULT 1,
    is_active BOOLEAN DEFAULT 1,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Questions inside a Course Assessment (MCQ, True/False, Short Answer)
CREATE TABLE IF NOT EXISTS assessment_questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    assessment_id INTEGER NOT NULL REFERENCES course_assessments(id) ON DELETE CASCADE,
    question_type TEXT NOT NULL CHECK (question_type IN ('mcq', 'true_false', 'short_answer')),
    question_text TEXT NOT NULL,
    options_json TEXT,
    correct_answer_text TEXT NOT NULL,
    explanation TEXT,
    marks INTEGER NOT NULL DEFAULT 1 CHECK (marks >= 1 AND marks <= 100),
    order_index INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Student Attempts on Course Assessments
CREATE TABLE IF NOT EXISTS assessment_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    assessment_id INTEGER NOT NULL REFERENCES course_assessments(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    attempt_number INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'submitted', 'expired')),
    draft_answers_json TEXT DEFAULT '{}',
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    submitted_at TIMESTAMP,
    score REAL DEFAULT 0,
    total_marks INTEGER DEFAULT 0,
    percentage REAL DEFAULT 0,
    passed BOOLEAN DEFAULT 0,
    teacher_feedback TEXT,
    graded_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);

-- Individual Question Answers inside an Attempt
CREATE TABLE IF NOT EXISTS assessment_attempt_answers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    attempt_id INTEGER NOT NULL REFERENCES assessment_attempts(id) ON DELETE CASCADE,
    question_id INTEGER NOT NULL REFERENCES assessment_questions(id) ON DELETE CASCADE,
    answer_value TEXT,
    is_correct BOOLEAN DEFAULT 0,
    marks_awarded REAL DEFAULT 0,
    feedback TEXT,
    UNIQUE(attempt_id, question_id)
);

-- Class/Enrollment table
CREATE TABLE IF NOT EXISTS enrollments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, course_id)
);

-- Course Completion Certificates table
CREATE TABLE IF NOT EXISTS certificates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    certificate_code TEXT UNIQUE NOT NULL,
    verification_hash TEXT UNIQUE NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    student_name TEXT NOT NULL,
    course_title TEXT NOT NULL,
    institution_name TEXT NOT NULL,
    completion_percentage INTEGER NOT NULL DEFAULT 100,
    final_score_percentage REAL,
    issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, course_id)
);

-- Indexes for query optimization
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_revoked_tokens_expires ON revoked_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_courses_category ON courses(category);
CREATE INDEX IF NOT EXISTS idx_courses_language ON courses(language);
CREATE INDEX IF NOT EXISTS idx_courses_created_by ON courses(created_by);
CREATE INDEX IF NOT EXISTS idx_lessons_course ON lessons(course_id);
CREATE INDEX IF NOT EXISTS idx_translations_lookup ON content_translations(entity_type, entity_id, language);
CREATE INDEX IF NOT EXISTS idx_materials_course ON learning_materials(course_id);
CREATE INDEX IF NOT EXISTS idx_materials_lesson ON learning_materials(lesson_id);
CREATE INDEX IF NOT EXISTS idx_progress_user ON user_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_progress_course ON user_progress(course_id);
CREATE INDEX IF NOT EXISTS idx_progress_lesson ON user_progress(lesson_id);
CREATE INDEX IF NOT EXISTS idx_sync_events_user ON sync_events(user_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_user ON enrollments(user_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_course ON enrollments(course_id);
CREATE INDEX IF NOT EXISTS idx_assessments_lesson_order ON assessments(lesson_id, order_index);
CREATE INDEX IF NOT EXISTS idx_assessment_results_user ON assessment_results(user_id);
CREATE INDEX IF NOT EXISTS idx_assessment_results_assessment ON assessment_results(assessment_id);
CREATE INDEX IF NOT EXISTS idx_course_assessments_course ON course_assessments(course_id);
CREATE INDEX IF NOT EXISTS idx_assessment_questions_exam ON assessment_questions(assessment_id, order_index);
CREATE INDEX IF NOT EXISTS idx_assessment_attempts_user_exam ON assessment_attempts(user_id, assessment_id);
CREATE INDEX IF NOT EXISTS idx_assessment_attempts_exam ON assessment_attempts(assessment_id);
CREATE INDEX IF NOT EXISTS idx_certificates_user ON certificates(user_id);
CREATE INDEX IF NOT EXISTS idx_certificates_code ON certificates(certificate_code);

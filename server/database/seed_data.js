const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '../.env') });
const bcrypt = require('bcryptjs');

const dbPath = process.env.DB_PATH ? path.resolve(__dirname, '..', process.env.DB_PATH) : path.join(__dirname, 'digital_learning.sqlite');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database', err.message);
        process.exit(1);
    }
    console.log('Connected to the SQLite database.');
});

const COURSE_CATEGORIES = ['Digital Literacy', 'Programming', 'Mathematics', 'Science', 'Language', 'Arts & Culture', 'Vocational Skills', 'Health & Wellness'];
const LANGUAGES = ['english', 'hindi', 'regional'];

const generateCourses = (count, teacherId) => {
    const courses = [];
    for (let i = 1; i <= count; i++) {
        const category = COURSE_CATEGORIES[Math.floor(Math.random() * COURSE_CATEGORIES.length)];
        const language = LANGUAGES[Math.floor(Math.random() * LANGUAGES.length)];
        courses.push([
            `Comprehensive ${category} Course ${i}`,
            `This is a detailed course covering all aspects of ${category}. It includes over 20 modules to take you from beginner to advanced level.`,
            category,
            language,
            teacherId
        ]);
    }
    return courses;
};

const generateLessons = (courseId, count, courseTitle) => {
    const lessons = [];
    for (let i = 1; i <= count; i++) {
        lessons.push([
            courseId,
            `Module ${i}: Advanced Concepts in ${courseTitle.split(' ').slice(1, 3).join(' ')}`,
            `Detailed breakdown of topic ${i} in this module.`,
            `In this lesson, we will explore key concept ${i}. We will start with the basics and move to advanced applications. This content is designed to be comprehensive.`,
            'text',
            null, // Add a verified lesson video URL from the teacher dashboard when available
            i,
            15 + Math.floor(Math.random() * 45) // Random duration 15-60 mins
        ]);
    }
    return lessons;
};

const seedData = async () => {
    try {
        // Enable foreign keys
        await new Promise((resolve, reject) => {
            db.exec('PRAGMA foreign_keys = ON;', (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        if (process.env.CONFIRM_RESET !== 'YES') {
            throw new Error('This seed script deletes existing learning data. Set CONFIRM_RESET=YES to proceed.');
        }
        const demoPasswords = [process.env.SEED_ADMIN_PASSWORD, process.env.SEED_TEACHER_PASSWORD, process.env.SEED_STUDENT_PASSWORD];
        if (demoPasswords.some((password) => !password || password.length < 12)) {
            throw new Error('Set SEED_ADMIN_PASSWORD, SEED_TEACHER_PASSWORD and SEED_STUDENT_PASSWORD to unique passwords of at least 12 characters in server/.env before seeding.');
        }
        console.log('Clearing existing data...');
        const tables = ['user_progress', 'enrollments', 'lessons', 'courses', 'users'];
        for (const table of tables) {
            await new Promise((resolve, reject) => {
                db.run(`DELETE FROM ${table}`, (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
            await new Promise((resolve, reject) => {
                db.run(`DELETE FROM sqlite_sequence WHERE name='${table}'`, (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        }

        console.log('Seeding Users...');
        const adminHash = await bcrypt.hash(process.env.SEED_ADMIN_PASSWORD, 12);
        const teacherHash = await bcrypt.hash(process.env.SEED_TEACHER_PASSWORD, 12);
        const studentHash = await bcrypt.hash(process.env.SEED_STUDENT_PASSWORD, 12);

        const users = [
            ['admin', 'admin@school.com', adminHash, 'System Admin', 'admin', 'Rural High School', 'N/A'],
            ['teacher_priya', 'priya@school.com', teacherHash, 'Priya Sharma', 'teacher', 'Rural High School', 'N/A'],
            ['teacher_ravi', 'ravi@school.com', teacherHash, 'Ravi Kumar', 'teacher', 'Rural High School', 'N/A'],
            ['student_rahul', 'rahul@school.com', studentHash, 'Rahul Singh', 'student', 'Rural High School', '10th Grade'],
            ['student_anita', 'anita@school.com', studentHash, 'Anita Desai', 'student', 'Rural High School', '9th Grade'],
            ['student_vikram', 'vikram@school.com', studentHash, 'Vikram Patel', 'student', 'Rural High School', '10th Grade']
        ];

        for (const user of users) {
            await new Promise((resolve, reject) => {
                db.run(
                    `INSERT INTO users (username, email, password_hash, full_name, role, school_name, class_grade) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    user,
                    (err) => {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });
        }

        console.log('Seeding Courses...');
        const priyaId = await new Promise((resolve, reject) => {
            db.get("SELECT id FROM users WHERE username = 'teacher_priya'", (err, row) => {
                if (err) reject(err);
                else resolve(row ? row.id : 1);
            })
        });

        // Generate 25 courses
        const courses = generateCourses(25, priyaId);

        for (const course of courses) {
            await new Promise((resolve, reject) => {
                db.run(
                    `INSERT INTO courses (title, description, category, language, created_by) VALUES (?, ?, ?, ?, ?)`,
                    course,
                    (err) => {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });
        }

        const courseRows = await new Promise((resolve, reject) => {
            db.all("SELECT id, title FROM courses", (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        console.log('Seeding Lessons (20+ per course)...');
        for (const course of courseRows) {
            const lessons = generateLessons(course.id, 22, course.title); // 22 lessons per course
            for (const lesson of lessons) {
                await new Promise((resolve, reject) => {
                    db.run(
                        `INSERT INTO lessons (course_id, title, description, content, lesson_type, video_url, order_index, duration_minutes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                        lesson,
                        (err) => {
                            if (err) reject(err);
                            else resolve();
                        }
                    );
                });
            }
        }

        console.log('Seeding Enrollments and Progress...');
        const rahulId = await new Promise((resolve, reject) => {
            db.get("SELECT id FROM users WHERE username = 'student_rahul'", (err, row) => resolve(row ? row.id : null));
        });

        if (rahulId && courseRows.length > 0) {
            // Enroll Rahul in first 5 courses
            for (let i = 0; i < 5; i++) {
                const courseId = courseRows[i].id;
                await new Promise((resolve, reject) => {
                    db.run("INSERT INTO enrollments (user_id, course_id) VALUES (?, ?)", [rahulId, courseId], (err) => err ? reject(err) : resolve());
                });

                // Complete first 3 lessons of each enrolled course
                const lessons = await new Promise((resolve, reject) => {
                    db.all("SELECT id FROM lessons WHERE course_id = ? LIMIT 3", [courseId], (err, rows) => resolve(rows));
                });

                for (const lesson of lessons) {
                    await new Promise((resolve, reject) => {
                        db.run(
                            "INSERT INTO user_progress (user_id, course_id, lesson_id, completion_status, progress_percentage, last_accessed) VALUES (?, ?, ?, 'completed', 100, datetime('now'))",
                            [rahulId, courseId, lesson.id],
                            (err) => err ? reject(err) : resolve()
                        );
                    });
                }
            }
        }

        console.log('Database seeded successfully!');
        db.close();

    } catch (error) {
        console.error('Error seeding data:', error);
        db.close();
        process.exit(1);
    }
};

seedData();

const path = require('path');
const dotenv = require('dotenv');
const db = require('./connection');
const { runMigrations } = require('./migrate');

dotenv.config({ path: path.join(__dirname, '../.env') });

async function seedSafe() {
  try {
    await runMigrations({ includeBootstrap: false });

    const existingCourses = await db.get('SELECT COUNT(*) AS count FROM courses');
    if (Number(existingCourses.count) > 0) {
      console.log(`Safe seed skipped: ${existingCourses.count} course(s) already exist. Existing data preserved.`);
      return;
    }

    const owner = await db.get(
      "SELECT id FROM users WHERE role IN ('teacher', 'admin') ORDER BY CASE WHEN role = 'teacher' THEN 0 ELSE 1 END, id ASC LIMIT 1"
    );
    const ownerId = owner ? owner.id : null;

    const c1 = await db.query(
      `INSERT INTO courses (title, description, category, language, level, passing_percentage, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [
        'Digital Literacy Basics',
        'Essential computer, keyboard, internet safety, and offline digital skills for rural school students.',
        'Digital Literacy',
        'en',
        'beginner',
        60,
        ownerId,
      ]
    );
    const course1Id = c1.rows[0].id;

    // Teacher-authored translations for Course 1
    await db.query(
      `INSERT INTO content_translations (entity_type, entity_id, language, title, description, updated_by)
       VALUES ('course', $1, 'te', $2, $3, $4),
              ('course', $1, 'hi', $5, $6, $4)`,
      [
        course1Id,
        'డిజిటల్ అక్షరాస్యత ప్రాథమికాలు',
        'గ్రామీణ పాఠశాల విద్యార్థుల కోసం కంప్యూటర్, కీబోర్డ్ మరియు ఇంటర్నెట్ భద్రత నైపుణ్యాలు.',
        ownerId,
        'डिजिटल साक्षरता की मूल बातें',
        'ग्रामीण विद्यालय के छात्रों के लिए कंप्यूटर, कीबोर्ड और इंटरनेट सुरक्षा कौशल।',
      ]
    );

    const l1 = await db.query(
      `INSERT INTO lessons (course_id, title, description, content, lesson_type, order_index, duration_minutes)
       VALUES ($1, $2, $3, $4, 'text', 1, 15) RETURNING id`,
      [
        course1Id,
        'Introduction to Computers',
        'Understand hardware, software, input devices, and output devices.',
        'A computer is an electronic machine that accepts input, processes data according to stored instructions, and produces useful output.\n\n1. Hardware refers to physical parts you can touch: Monitor, Keyboard, Mouse, System Unit (CPU & Memory).\n2. Software refers to programs that tell hardware what to do: Operating Systems (Linux, Windows, Android) and Applications (Web Browsers, Text Editors).\n3. Saving files locally allows you to keep studying even when internet connectivity is unavailable.',
      ]
    );
    const lesson1Id = l1.rows[0].id;

    // Genuine teacher-provided Telugu & Hindi versions for Lesson 1
    await db.query(
      `INSERT INTO content_translations (entity_type, entity_id, language, title, description, content, updated_by)
       VALUES ('lesson', $1, 'te', $2, $3, $4, $5),
              ('lesson', $1, 'hi', $6, $7, $8, $5)`,
      [
        lesson1Id,
        'కంప్యూటర్ పరిచయం',
        'హార్డ్‌వేర్, సాఫ్ట్‌వేర్, ఇన్‌పుట్ మరియు అవుట్‌పుట్ పరికరాలను అర్థం చేసుకోండి.',
        'కంప్యూటర్ అనేది సమాచారాన్ని స్వీకరించి, సూచనల ప్రకారం ప్రాసెస్ చేసి, ఫలితాన్ని ఇచ్చే ఎలక్ట్రానిక్ పరికరం.\n\n1. హార్డ్‌వేర్: మనం తాకగలిగే భాగాలు — మానిటర్, కీబోర్డ్, మౌస్, మరియు సిస్టమ్ యూనిట్ (CPU, మెమరీ).\n2. సాఫ్ట్‌వేర్: హార్డ్‌వేర్‌కు సూచనలు ఇచ్చే ప్రోగ్రామ్‌లు — ఆపరేటింగ్ సిస్టమ్ మరియు అప్లికేషన్లు.\n3. ఫైళ్లను పరికరంలో భద్రపరచడం ద్వారా ఇంటర్నెట్ లేకపోయినా చదువు కొనసాగించవచ్చు.',
        ownerId,
        'कंप्यूटर का परिचय',
        'हार्डवेयर, सॉफ्टवेयर, इनपुट और आउटपुट उपकरणों को समझें।',
        'कंप्यूटर एक इलेक्ट्रॉनिक मशीन है जो डेटा स्वीकार करती है, निर्देशों के अनुसार उसे प्रोसेस करती है और परिणाम देती है।\n\n1. हार्डवेयर: वे भौतिक भाग जिन्हें हम छू सकते हैं — मॉनिटर, कीबोर्ड, माउस और सिस्टम यूनिट (CPU व मेमोरी)।\n2. सॉफ्टवेयर: वे प्रोग्राम जो हार्डवेयर को कार्य करने का निर्देश देते हैं।\n3. फ़ाइलों को डिवाइस पर सहेजने से इंटरनेट न होने पर भी पढ़ाई जारी रखी जा सकती है।',
      ]
    );

    const l2 = await db.query(
      `INSERT INTO lessons (course_id, title, description, content, lesson_type, order_index, duration_minutes)
       VALUES ($1, $2, $3, $4, 'interactive', 2, 20) RETURNING id`,
      [
        course1Id,
        'Online Safety and Strong Passwords',
        'Protect school accounts and identify unsafe links.',
        'Staying safe on shared school devices is essential:\n\n• Use passwords at least 8–12 characters long combining words, numbers, and symbols.\n• Never share your password or leave an account signed in on a shared lab computer — always click Logout when finished.\n• Verify website addresses carefully before entering school credentials.',
      ]
    );
    const lesson2Id = l2.rows[0].id;

    // Inline quick check on Lesson 1
    await db.query(
      `INSERT INTO assessments (lesson_id, question, options, correct_answer, points, order_index)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        lesson1Id,
        'Which of the following is an example of computer hardware?',
        JSON.stringify(['Web Browser', 'Keyboard', 'Spreadsheet Formula', 'Email Message']),
        1,
        2,
        1,
      ]
    );

    // Full Course Assessment for Course 1 (MCQ + True/False + Short Answer)
    const exam = await db.query(
      `INSERT INTO course_assessments (
        course_id, lesson_id, title, description, instructions,
        time_limit_minutes, passing_percentage, total_marks, max_attempts,
        show_correct_answers, is_required_for_certificate, is_published, created_by
      ) VALUES ($1, $2, $3, $4, $5, 15, 60, 5, 3, 'after_submission', 1, 1, $6) RETURNING id`,
      [
        course1Id,
        lesson2Id,
        'Digital Literacy Unit Assessment',
        'Verify your understanding of computer parts and digital safety.',
        'Answer all three questions before submitting. You have 15 minutes.',
        ownerId,
      ]
    );
    const examId = exam.rows[0].id;

    await db.query(
      `INSERT INTO assessment_questions (assessment_id, question_type, question_text, options_json, correct_answer_text, explanation, marks, order_index)
       VALUES
       ($1, 'mcq', $2, $3, '2', $4, 2, 1),
       ($1, 'true_false', $5, $6, '0', $7, 1, 2),
       ($1, 'short_answer', $8, NULL, $9, $10, 2, 3)`,
      [
        examId,
        'Which component acts as the primary processing unit of a computer?',
        JSON.stringify(['Monitor', 'Printer', 'CPU', 'Mouse Pad']),
        'The CPU (Central Processing Unit) executes program instructions.',
        'Always log out when finishing work on a shared school laboratory computer.',
        JSON.stringify(['True', 'False']),
        'Logging out clears private cached data so the next student cannot access your account.',
        'What does CPU stand for? (Write the full form or acronym CPU)',
        'central processing unit|cpu',
        'CPU stands for Central Processing Unit.',
      ]
    );

    // Course 2: Rural Science & Mathematics Foundations
    const c2 = await db.query(
      `INSERT INTO courses (title, description, category, language, level, passing_percentage, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [
        'Practical Mathematics for Everyday Life',
        'Measurements, percentages, crop-area calculations, and household budgeting.',
        'Mathematics',
        'en',
        'beginner',
        60,
        ownerId,
      ]
    );
    const course2Id = c2.rows[0].id;

    await db.query(
      `INSERT INTO lessons (course_id, title, description, content, lesson_type, order_index, duration_minutes)
       VALUES
       ($1, 'Understanding Percentages', 'Calculate discounts, marks, and yield improvements.', 'Percent means per hundred (out of 100). To find 60% of 50 marks, compute (60 / 100) × 50 = 30 marks.', 'text', 1, 20),
       ($1, 'Area and Perimeter of Fields', 'Measure rectangular plots in meters and square meters.', 'Perimeter = 2 × (Length + Width). Area = Length × Width. A rectangular school garden measuring 12 m by 8 m has an area of 96 square meters.', 'text', 2, 25)`,
      [course2Id]
    );

    console.log('Safe curriculum seed completed successfully.');
  } catch (error) {
    console.error('Safe seed error:', error.message);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  seedSafe().finally(() => db.close());
}

module.exports = { seedSafe };

const db = require('./connection');

async function addMoreCourses() {
  try {
    console.log('Adding more courses...');
    
    // Get admin and teacher users
    const adminResult = await db.query('SELECT id FROM users WHERE role = $1 LIMIT 1', ['admin']);
    const teacherResult = await db.query('SELECT id FROM users WHERE role = $1 LIMIT 1', ['teacher']);
    
    if (adminResult.rows.length === 0) {
      console.log('No admin user found. Please run migrations first.');
      process.exit(1);
    }
    
    const adminId = adminResult.rows[0].id;
    const teacherId = teacherResult.rows.length > 0 ? teacherResult.rows[0].id : adminId;
    
    // Course 1: Internet Basics
    const course1 = await db.query(
      `INSERT INTO courses (title, description, category, language, created_by) 
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [
        'Internet Basics',
        'Learn how to use the internet safely and effectively',
        'Digital Literacy',
        'en',
        adminId
      ]
    );
    const course1Id = course1.rows[0].id;
    console.log('✅ Created course: Internet Basics');
    
    // Lessons for Internet Basics
    await db.query(
      `INSERT INTO lessons (course_id, title, description, content, lesson_type, order_index, duration_minutes) 
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        course1Id,
        'What is the Internet?',
        'Understanding the basics of internet',
        'The Internet is a global network of computers connected together. It allows us to access information, communicate with others, and use various online services. Think of it as a huge library that is open 24/7, where you can find almost any information you need.',
        'text',
        1,
        20
      ]
    );
    
    await db.query(
      `INSERT INTO lessons (course_id, title, description, content, lesson_type, order_index, duration_minutes) 
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        course1Id,
        'Using a Web Browser',
        'Learn to navigate the web',
        'A web browser is a software application used to access the internet. Popular browsers include Google Chrome, Mozilla Firefox, and Microsoft Edge. Learn how to open a browser, type a website address (URL), and navigate between pages using back and forward buttons.',
        'text',
        2,
        25
      ]
    );
    
    await db.query(
      `INSERT INTO lessons (course_id, title, description, content, lesson_type, order_index, duration_minutes) 
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        course1Id,
        'Searching the Web',
        'Master web search techniques',
        'Search engines like Google help you find information on the internet. Learn how to type search queries, use keywords effectively, and evaluate search results. Practice searching for educational content, news, and useful information.',
        'interactive',
        3,
        30
      ]
    );
    
    // Course 2: Email Communication
    const course2 = await db.query(
      `INSERT INTO courses (title, description, category, language, created_by) 
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [
        'Email Communication',
        'Learn to send and receive emails professionally',
        'Digital Communication',
        'en',
        teacherId
      ]
    );
    const course2Id = course2.rows[0].id;
    console.log('✅ Created course: Email Communication');
    
    // Lessons for Email Communication
    await db.query(
      `INSERT INTO lessons (course_id, title, description, content, lesson_type, order_index, duration_minutes) 
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        course2Id,
        'Creating an Email Account',
        'Set up your first email account',
        'Learn how to create a free email account using services like Gmail. Understand the importance of choosing a strong password and keeping your account secure. Practice logging in and out of your email account.',
        'text',
        1,
        20
      ]
    );
    
    await db.query(
      `INSERT INTO lessons (course_id, title, description, content, lesson_type, order_index, duration_minutes) 
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        course2Id,
        'Composing and Sending Emails',
        'Write and send your first email',
        'Learn how to compose a professional email. Understand the importance of a clear subject line, proper greeting, and clear message body. Practice sending emails to teachers, classmates, and family members.',
        'interactive',
        2,
        25
      ]
    );
    
    await db.query(
      `INSERT INTO lessons (course_id, title, description, content, lesson_type, order_index, duration_minutes) 
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        course2Id,
        'Managing Your Inbox',
        'Organize and manage emails',
        'Learn how to read received emails, reply to messages, forward emails, and organize your inbox using folders. Understand how to delete unwanted emails and keep your inbox clean and organized.',
        'text',
        3,
        20
      ]
    );
    
    // Course 3: Microsoft Word Basics
    const course3 = await db.query(
      `INSERT INTO courses (title, description, category, language, created_by) 
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [
        'Microsoft Word Basics',
        'Create and format documents using Microsoft Word',
        'Office Applications',
        'en',
        teacherId
      ]
    );
    const course3Id = course3.rows[0].id;
    console.log('✅ Created course: Microsoft Word Basics');
    
    // Lessons for Microsoft Word
    await db.query(
      `INSERT INTO lessons (course_id, title, description, content, lesson_type, order_index, duration_minutes) 
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        course3Id,
        'Introduction to Word',
        'Getting started with Microsoft Word',
        'Microsoft Word is a word processing software used to create documents like letters, reports, and assignments. Learn how to open Word, create a new document, and understand the basic interface including the ribbon, toolbar, and document area.',
        'text',
        1,
        20
      ]
    );
    
    await db.query(
      `INSERT INTO lessons (course_id, title, description, content, lesson_type, order_index, duration_minutes) 
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        course3Id,
        'Typing and Formatting Text',
        'Type and format your document',
        'Learn how to type text in Word, change font size and style, make text bold or italic, and align text. Practice creating a simple document with proper formatting including headings, paragraphs, and lists.',
        'interactive',
        2,
        30
      ]
    );
    
    await db.query(
      `INSERT INTO lessons (course_id, title, description, content, lesson_type, order_index, duration_minutes) 
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        course3Id,
        'Saving and Printing Documents',
        'Save and print your work',
        'Learn how to save your documents with meaningful names, choose the right location to save files, and print documents. Understand the importance of saving your work regularly to avoid losing your progress.',
        'text',
        3,
        20
      ]
    );
    
    // Course 4: Online Safety
    const course4 = await db.query(
      `INSERT INTO courses (title, description, category, language, created_by) 
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [
        'Online Safety and Security',
        'Stay safe while using the internet',
        'Digital Literacy',
        'en',
        adminId
      ]
    );
    const course4Id = course4.rows[0].id;
    console.log('✅ Created course: Online Safety and Security');
    
    // Lessons for Online Safety
    await db.query(
      `INSERT INTO lessons (course_id, title, description, content, lesson_type, order_index, duration_minutes) 
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        course4Id,
        'Creating Strong Passwords',
        'Protect your accounts with strong passwords',
        'Learn how to create strong, secure passwords that are difficult for others to guess. Understand the importance of using different passwords for different accounts and never sharing your passwords with anyone.',
        'text',
        1,
        20
      ]
    );
    
    await db.query(
      `INSERT INTO lessons (course_id, title, description, content, lesson_type, order_index, duration_minutes) 
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        course4Id,
        'Recognizing Online Scams',
        'Identify and avoid online scams',
        'Learn to recognize common online scams and phishing attempts. Understand how to identify suspicious emails, websites, and messages. Know when to be cautious and when to report suspicious activity.',
        'text',
        2,
        25
      ]
    );
    
    await db.query(
      `INSERT INTO lessons (course_id, title, description, content, lesson_type, order_index, duration_minutes) 
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        course4Id,
        'Protecting Personal Information',
        'Keep your personal information safe',
        'Understand what personal information should never be shared online. Learn about privacy settings on social media and websites. Know how to protect your identity and personal data while using the internet.',
        'text',
        3,
        25
      ]
    );
    
    // Course 5: Excel Basics
    const course5 = await db.query(
      `INSERT INTO courses (title, description, category, language, created_by) 
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [
        'Microsoft Excel Basics',
        'Learn to work with spreadsheets and data',
        'Office Applications',
        'en',
        teacherId
      ]
    );
    const course5Id = course5.rows[0].id;
    console.log('✅ Created course: Microsoft Excel Basics');
    
    // Lessons for Excel
    await db.query(
      `INSERT INTO lessons (course_id, title, description, content, lesson_type, order_index, duration_minutes) 
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        course5Id,
        'Introduction to Excel',
        'Understanding spreadsheets',
        'Microsoft Excel is used to organize data in rows and columns. Learn about cells, rows, columns, and worksheets. Understand how to navigate Excel and enter data into cells.',
        'text',
        1,
        20
      ]
    );
    
    await db.query(
      `INSERT INTO lessons (course_id, title, description, content, lesson_type, order_index, duration_minutes) 
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        course5Id,
        'Basic Formulas',
        'Perform calculations in Excel',
        'Learn how to use basic formulas like SUM, AVERAGE, and COUNT. Practice creating simple calculations to add numbers, find averages, and count items in your spreadsheet.',
        'interactive',
        2,
        30
      ]
    );
    
    await db.query(
      `INSERT INTO lessons (course_id, title, description, content, lesson_type, order_index, duration_minutes) 
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        course5Id,
        'Formatting Spreadsheets',
        'Make your data look professional',
        'Learn how to format cells, change font styles, add borders, and apply colors to make your spreadsheet easy to read and professional looking. Practice creating a simple budget or grade sheet.',
        'text',
        3,
        25
      ]
    );
    
    // Course 6: Social Media Basics
    const course6 = await db.query(
      `INSERT INTO courses (title, description, category, language, created_by) 
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [
        'Social Media Basics',
        'Learn to use social media responsibly',
        'Digital Communication',
        'en',
        adminId
      ]
    );
    const course6Id = course6.rows[0].id;
    console.log('✅ Created course: Social Media Basics');
    
    // Lessons for Social Media
    await db.query(
      `INSERT INTO lessons (course_id, title, description, content, lesson_type, order_index, duration_minutes) 
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        course6Id,
        'Understanding Social Media',
        'What is social media?',
        'Social media platforms like Facebook, WhatsApp, and YouTube help us connect with others and share information. Learn about different types of social media and their purposes. Understand the benefits and responsibilities of using social media.',
        'text',
        1,
        20
      ]
    );
    
    await db.query(
      `INSERT INTO lessons (course_id, title, description, content, lesson_type, order_index, duration_minutes) 
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        course6Id,
        'Safe Social Media Practices',
        'Use social media safely',
        'Learn how to use privacy settings, control who can see your posts, and protect your personal information. Understand the importance of being respectful online and the consequences of cyberbullying.',
        'text',
        2,
        25
      ]
    );
    
    await db.query(
      `INSERT INTO lessons (course_id, title, description, content, lesson_type, order_index, duration_minutes) 
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        course6Id,
        'Creating Educational Content',
        'Use social media for learning',
        'Learn how to use social media platforms for educational purposes. Discover educational channels, groups, and pages that can help with your studies. Understand how to share knowledge responsibly.',
        'text',
        3,
        20
      ]
    );
    
    console.log('\n✅ Successfully added 6 new courses with lessons!');
    console.log('\nNew courses:');
    console.log('1. Internet Basics');
    console.log('2. Email Communication');
    console.log('3. Microsoft Word Basics');
    console.log('4. Online Safety and Security');
    console.log('5. Microsoft Excel Basics');
    console.log('6. Social Media Basics');
    
    process.exit(0);
  } catch (error) {
    console.error('Error adding courses:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

addMoreCourses();


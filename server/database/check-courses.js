const db = require('./connection');

async function checkAndCreateCourses() {
  try {
    console.log('Checking for courses...');
    
    // Check if courses exist
    const result = await db.query('SELECT COUNT(*) AS count FROM courses');
    const courseCount = parseInt(result.rows[0].count);
    
    console.log(`Found ${courseCount} courses in database`);
    
    if (courseCount === 0) {
      console.log('No courses found. Creating sample courses...');
      
      // Get admin user
      const adminResult = await db.query('SELECT id FROM users WHERE role = $1 LIMIT 1', ['admin']);
      if (adminResult.rows.length === 0) {
        console.log('No admin user found. Please run migrations first.');
        process.exit(1);
      }
      const adminId = adminResult.rows[0].id;
      
      // Get teacher user
      const teacherResult = await db.query('SELECT id FROM users WHERE role = $1 LIMIT 1', ['teacher']);
      let teacherId = adminId; // Fallback to admin if no teacher
      if (teacherResult.rows.length > 0) {
        teacherId = teacherResult.rows[0].id;
      }
      
      // Insert sample courses
      const course1 = await db.query(
        `INSERT INTO courses (title, description, category, language, created_by) 
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [
          'Digital Literacy Basics',
          'Learn the fundamentals of using computers and digital devices',
          'Digital Literacy',
          'en',
          adminId
        ]
      );
      
      const course2 = await db.query(
        `INSERT INTO courses (title, description, category, language, created_by) 
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [
          'Computer Fundamentals',
          'Introduction to computer hardware and software',
          'Computer Science',
          'en',
          teacherId
        ]
      );
      
      const course1Id = course1.rows[0].id;
      const course2Id = course2.rows[0].id;
      
      console.log('✅ Created course 1:', course1Id);
      console.log('✅ Created course 2:', course2Id);
      
      // Insert sample lessons for course 1
      await db.query(
        `INSERT INTO lessons (course_id, title, description, content, lesson_type, order_index, duration_minutes) 
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          course1Id,
          'Introduction to Computers',
          'Learn what computers are and how they work',
          'Computers are electronic devices that process data. They consist of hardware (physical components) and software (programs). Hardware includes the CPU (Central Processing Unit), memory (RAM), storage devices, input devices like keyboard and mouse, and output devices like monitor and printer. Software includes operating systems and applications that help us perform various tasks.',
          'text',
          1,
          15
        ]
      );
      
      await db.query(
        `INSERT INTO lessons (course_id, title, description, content, lesson_type, order_index, duration_minutes) 
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          course1Id,
          'Using a Mouse and Keyboard',
          'Master the basic input devices',
          'The mouse and keyboard are primary input devices. The mouse helps you navigate and click on items on the screen. Practice clicking, double-clicking, and right-clicking. The keyboard is used for typing text and entering commands. Learn the basic keys: letters, numbers, spacebar, Enter, Backspace, and arrow keys.',
          'interactive',
          2,
          20
        ]
      );
      
      await db.query(
        `INSERT INTO lessons (course_id, title, description, content, lesson_type, order_index, duration_minutes) 
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          course1Id,
          'Understanding the Desktop',
          'Learn about the computer desktop interface',
          'The desktop is the main screen you see when you start your computer. It contains icons, a taskbar, and a start menu. Icons are small pictures that represent programs or files. Double-click an icon to open it. The taskbar shows running programs and the start menu gives you access to all programs on your computer.',
          'text',
          3,
          15
        ]
      );
      
      // Insert sample lessons for course 2
      await db.query(
        `INSERT INTO lessons (course_id, title, description, content, lesson_type, order_index, duration_minutes) 
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          course2Id,
          'Computer Hardware',
          'Understanding computer components',
          'Learn about CPU (Central Processing Unit) - the brain of the computer, RAM (Random Access Memory) - temporary storage, hard drive - permanent storage, motherboard - connects all components, and other hardware components. Understanding hardware helps you know what your computer can do.',
          'text',
          1,
          25
        ]
      );
      
      await db.query(
        `INSERT INTO lessons (course_id, title, description, content, lesson_type, order_index, duration_minutes) 
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          course2Id,
          'Computer Software',
          'Understanding programs and applications',
          'Software is the set of instructions that tell the hardware what to do. There are two main types: system software (like Windows, Linux) and application software (like Word, Excel, browsers). Learn how to install, use, and manage software on your computer.',
          'text',
          2,
          20
        ]
      );
      
      console.log('✅ Created sample lessons');
      console.log('\n✅ Sample courses and lessons created successfully!');
    } else {
      // List existing courses
      const courses = await db.query('SELECT id, title, category FROM courses');
      console.log('\nExisting courses:');
      courses.rows.forEach(course => {
        console.log(`  - ${course.title} (${course.category})`);
      });
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

checkAndCreateCourses();


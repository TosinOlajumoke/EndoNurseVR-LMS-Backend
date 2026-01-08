-- Users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  email VARCHAR(150) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'trainee',
  title VARCHAR(50),
  trainee_id VARCHAR(20) UNIQUE,
  profile_picture TEXT DEFAULT '/uploads/default/default-avatar.png',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Admin (Library) Contents table
CREATE TABLE IF NOT EXISTS admin_contents ( 
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  image TEXT,
  video_url TEXT,     
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Modules table
CREATE TABLE IF NOT EXISTS modules (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    instructor_id INT REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Instructor contents table
CREATE TABLE IF NOT EXISTS instructor_contents (
    id SERIAL PRIMARY KEY,
    module_id INT REFERENCES modules(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    image VARCHAR(255),
    video VARCHAR(255),
    admin_content_id INT REFERENCES admin_contents(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Enrollments table
CREATE TABLE IF NOT EXISTS enrollments (
    id SERIAL PRIMARY KEY,
    content_id INT REFERENCES instructor_contents(id) ON DELETE CASCADE,
    trainee_id INT REFERENCES users(id) ON DELETE CASCADE,
    enrolled_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(content_id, trainee_id)
);

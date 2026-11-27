import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import { env } from './env.js';
import { initialStudents } from '../data/students-seed.js';

export const pool = mysql.createPool({
  ...env.db,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4',
  dateStrings: true,
  decimalNumbers: true
});

let runtimeSchemaPromise = null;

export async function checkDatabase() {
  await pool.query('SELECT 1');
}

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS users (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(120) NOT NULL,
    email VARCHAR(180) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('ADMINISTRADOR', 'PROFESSOR') NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    token_version INT UNSIGNED NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_users_email (email),
    KEY idx_users_role_active (role, active)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS students (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    registration VARCHAR(30) NOT NULL,
    name VARCHAR(120) NOT NULL,
    class_name VARCHAR(40) NOT NULL,
    guardian_name VARCHAR(120) NULL,
    guardian_phone VARCHAR(30) NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_students_registration (registration),
    KEY idx_students_name (name),
    KEY idx_students_class_active (class_name, active)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS categories (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(80) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    PRIMARY KEY (id),
    UNIQUE KEY uq_categories_name (name)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS locations (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(80) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    PRIMARY KEY (id),
    UNIQUE KEY uq_locations_name (name)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS occurrences (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    protocol VARCHAR(40) NOT NULL,
    occurrence_date DATE NOT NULL,
    occurrence_time TIME NOT NULL,
    category_id INT UNSIGNED NOT NULL,
    location_id INT UNSIGNED NOT NULL,
    description TEXT NOT NULL,
    status ENUM('PENDENTE', 'EM_ANALISE', 'EM_ACOMPANHAMENTO', 'ENCERRADA') NOT NULL DEFAULT 'PENDENTE',
    priority ENUM('BAIXA', 'MEDIA', 'ALTA', 'URGENTE') NOT NULL DEFAULT 'MEDIA',
    created_by INT UNSIGNED NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_occurrences_protocol (protocol),
    KEY idx_occurrences_date (occurrence_date),
    KEY idx_occurrences_status (status),
    KEY idx_occurrences_status_date (status, occurrence_date),
    KEY idx_occurrences_priority (priority),
    KEY idx_occurrences_category (category_id),
    KEY idx_occurrences_location (location_id),
    KEY idx_occurrences_created_by (created_by),
    KEY idx_occurrences_created_at (created_at),
    CONSTRAINT fk_occurrences_category FOREIGN KEY (category_id) REFERENCES categories(id),
    CONSTRAINT fk_occurrences_location FOREIGN KEY (location_id) REFERENCES locations(id),
    CONSTRAINT fk_occurrences_creator FOREIGN KEY (created_by) REFERENCES users(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS occurrence_students (
    occurrence_id INT UNSIGNED NOT NULL,
    student_id INT UNSIGNED NOT NULL,
    PRIMARY KEY (occurrence_id, student_id),
    KEY idx_occurrence_students_student (student_id),
    CONSTRAINT fk_os_occurrence FOREIGN KEY (occurrence_id) REFERENCES occurrences(id) ON DELETE CASCADE,
    CONSTRAINT fk_os_student FOREIGN KEY (student_id) REFERENCES students(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS occurrence_updates (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    occurrence_id INT UNSIGNED NOT NULL,
    observation VARCHAR(1000) NULL,
    action_taken VARCHAR(1000) NULL,
    previous_status ENUM('PENDENTE', 'EM_ANALISE', 'EM_ACOMPANHAMENTO', 'ENCERRADA') NULL,
    new_status ENUM('PENDENTE', 'EM_ANALISE', 'EM_ACOMPANHAMENTO', 'ENCERRADA') NULL,
    created_by INT UNSIGNED NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_updates_occurrence (occurrence_id, created_at),
    CONSTRAINT fk_updates_occurrence FOREIGN KEY (occurrence_id) REFERENCES occurrences(id) ON DELETE CASCADE,
    CONSTRAINT fk_updates_creator FOREIGN KEY (created_by) REFERENCES users(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS notification_reads (
    user_id INT UNSIGNED NOT NULL,
    notification_key VARCHAR(80) NOT NULL,
    read_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, notification_key),
    CONSTRAINT fk_notification_reads_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id INT UNSIGNED NOT NULL,
    action VARCHAR(40) NOT NULL,
    entity VARCHAR(60) NOT NULL,
    entity_id INT UNSIGNED NULL,
    details JSON NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_audit_created_at (created_at),
    KEY idx_audit_user (user_id),
    KEY idx_audit_entity_action (entity, action, created_at),
    CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
];

async function seedInitialDataIfEmpty() {
  const [[{ userCount }]] = await pool.query('SELECT COUNT(*) AS userCount FROM users');
  if (Number(userCount) > 0) return;

  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'Admin@123';
  const professorPassword = process.env.SEED_PROFESSOR_PASSWORD || 'Professor@123';
  const [adminHash, professorHash] = await Promise.all([
    bcrypt.hash(adminPassword, 10),
    bcrypt.hash(professorPassword, 10)
  ]);

  await pool.execute(
    `INSERT IGNORE INTO users (name, email, password_hash, role, active)
     VALUES (?, ?, ?, 'ADMINISTRADOR', TRUE), (?, ?, ?, 'PROFESSOR', TRUE)`,
    [
      'Marina Oliveira',
      'admin@monsenhor.edu.br',
      adminHash,
      'Carlos Henrique',
      'professor@monsenhor.edu.br',
      professorHash
    ]
  );

  const categories = [
    'Comportamento',
    'Conflito / Bullying',
    'Frequência / Atraso',
    'Saúde',
    'Material escolar',
    'Infraestrutura',
    'Outro'
  ];
  const locations = [
    'Sala de aula',
    'Pátio',
    'Quadra esportiva',
    'Corredor',
    'Biblioteca',
    'Refeitório',
    'Entrada / Saída',
    'Outro'
  ];

  for (const name of categories) {
    await pool.execute('INSERT IGNORE INTO categories (name) VALUES (?)', [name]);
  }
  for (const name of locations) {
    await pool.execute('INSERT IGNORE INTO locations (name) VALUES (?)', [name]);
  }

  const [[{ studentCount }]] = await pool.query('SELECT COUNT(*) AS studentCount FROM students');
  if (Number(studentCount) === 0 && initialStudents.length > 0) {
    const batchSize = 100;
    for (let i = 0; i < initialStudents.length; i += batchSize) {
      const slice = initialStudents.slice(i, i + batchSize);
      const placeholders = slice.map(() => '(?, ?, ?, ?, ?, TRUE)').join(', ');
      const values = slice.flatMap((s) => [
        s.registration,
        s.name,
        s.className,
        s.guardianName,
        s.guardianPhone
      ]);
      await pool.execute(
        `INSERT IGNORE INTO students (registration, name, class_name, guardian_name, guardian_phone, active)
         VALUES ${placeholders}`,
        values
      );
    }
  }
}

/**
 * Garante compatibilidade incremental e inicialização automática em bancos na nuvem.
 */
export async function ensureRuntimeSchema() {
  if (!runtimeSchemaPromise) {
    runtimeSchemaPromise = (async () => {
      for (const statement of SCHEMA_STATEMENTS) {
        await pool.query(statement);
      }

      const [tokenVersionCols] = await pool.execute(
        `SELECT COLUMN_NAME
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'users'
           AND COLUMN_NAME = 'token_version'
         LIMIT 1`
      );

      if (!tokenVersionCols.length) {
        await pool.query(
          'ALTER TABLE users ADD COLUMN token_version INT UNSIGNED NOT NULL DEFAULT 1 AFTER active'
        );
      }

      await seedInitialDataIfEmpty();
    })().catch((err) => {
      runtimeSchemaPromise = null;
      throw err;
    });
  }

  return runtimeSchemaPromise;
}

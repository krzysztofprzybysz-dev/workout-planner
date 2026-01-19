-- Ćwiczenia z programu
CREATE TABLE IF NOT EXISTS exercises (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    muscle_group TEXT,
    substitution_1 TEXT,
    substitution_2 TEXT,
    notes TEXT,
    video_url TEXT
);

-- Plan treningowy (tygodnie/dni)
CREATE TABLE IF NOT EXISTS workout_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    week INTEGER NOT NULL,
    day INTEGER NOT NULL,
    day_name TEXT,
    exercise_id INTEGER REFERENCES exercises(id),
    exercise_order INTEGER,
    warmup_sets INTEGER DEFAULT 0,
    working_sets INTEGER DEFAULT 1,
    target_reps TEXT,
    target_rpe INTEGER,
    rest_seconds INTEGER DEFAULT 120,
    set_type TEXT DEFAULT 'normal'
);

-- Sesje treningowe (wykonane treningi)
CREATE TABLE IF NOT EXISTS workout_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    week INTEGER,
    day INTEGER,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    finished_at DATETIME,
    overall_notes TEXT,
    ai_analysis TEXT
);

-- Logi pojedynczych serii
CREATE TABLE IF NOT EXISTS set_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER REFERENCES workout_sessions(id),
    exercise_id INTEGER REFERENCES exercises(id),
    set_number INTEGER,
    set_type TEXT,
    target_weight REAL,
    actual_weight REAL,
    target_reps TEXT,
    actual_reps INTEGER,
    rpe INTEGER,
    notes TEXT,
    completed BOOLEAN DEFAULT 0
);

-- Progresja (wyliczone ciężary na następny trening)
CREATE TABLE IF NOT EXISTS progression (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exercise_id INTEGER REFERENCES exercises(id),
    week INTEGER,
    day INTEGER,
    set_type TEXT,
    calculated_weight REAL,
    reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indeksy dla wydajności
CREATE INDEX IF NOT EXISTS idx_workout_plans_week_day ON workout_plans(week, day);
CREATE INDEX IF NOT EXISTS idx_set_logs_session ON set_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_set_logs_exercise ON set_logs(exercise_id);
CREATE INDEX IF NOT EXISTS idx_progression_exercise ON progression(exercise_id);

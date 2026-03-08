-- Attendance group migration
-- Add attendance_group column to classrooms and attendance_events
-- Run once only

ALTER TABLE classrooms
  ADD COLUMN IF NOT EXISTS attendance_group TEXT DEFAULT '';

ALTER TABLE attendance_events
  ADD COLUMN IF NOT EXISTS attendance_group TEXT DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_classrooms_attendance_group
  ON classrooms (attendance_group)
  WHERE attendance_group IS NOT NULL AND attendance_group != '';

CREATE INDEX IF NOT EXISTS idx_attendance_events_group
  ON attendance_events (attendance_group)
  WHERE attendance_group IS NOT NULL AND attendance_group != '';

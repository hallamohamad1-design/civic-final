-- Migration: 0004_ai_analysis_columns
-- Adds AI analysis fields to civic_issues_v2, populated by the n8n / AI pipeline.
-- Uses ADD COLUMN IF NOT EXISTS so it is safe to re-run.

ALTER TABLE `civic_issues_v2`
  ADD COLUMN IF NOT EXISTS `severity_score`          INT,
  ADD COLUMN IF NOT EXISTS `ai_summary`              TEXT,
  ADD COLUMN IF NOT EXISTS `detected_hazards`        TEXT,
  ADD COLUMN IF NOT EXISTS `recommended_action`      TEXT,
  ADD COLUMN IF NOT EXISTS `estimated_urgency_hours` INT,
  ADD COLUMN IF NOT EXISTS `ai_confidence`           TEXT,
  ADD COLUMN IF NOT EXISTS `analysis_timestamp`      TIMESTAMP NULL;

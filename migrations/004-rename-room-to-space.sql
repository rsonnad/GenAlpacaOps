-- =============================================
-- RENAME ROOM TAG GROUP TO SPACE
-- GenAlpaca - Migration 004
-- =============================================
-- Run this in your Supabase SQL Editor
-- This renames "room" tag group to "space" and adds new space tags
-- =============================================

-- Step 1: Update existing "room" tags to "space"
UPDATE media_tags
SET tag_group = 'space'
WHERE tag_group = 'room';

-- Step 2: Add new space tags
INSERT INTO media_tags (name, tag_group, color, description) VALUES
  ('house', 'space', '#8B4513', 'Main house/building'),
  ('front-yard', 'space', '#22C55E', 'Front yard area')
ON CONFLICT (name) DO NOTHING;

-- =============================================
-- DONE!
-- =============================================

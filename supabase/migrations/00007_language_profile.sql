-- 00007: profiles 表加 language 字段
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'zh';
UPDATE profiles SET language = 'fr' WHERE role = 'recorder';

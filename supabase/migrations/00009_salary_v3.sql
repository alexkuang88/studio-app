-- ============================================================
-- 00009: 阶梯工资 v3（按分段 12小时 2000万 1000/700）
-- 生效日期 2026-09-01
-- ============================================================

INSERT INTO settings (key, value, description) VALUES
  ('salary_v3_premium', '1000', 'V3高级单价（12h内≥2000万）Ar/100万'),
  ('salary_v3_base', '700', 'V3基础单价 Ar/100万'),
  ('salary_v3_threshold', '2000', 'V3成绩阈值（万）'),
  ('salary_v3_max_hours', '12', 'V3时限（小时）'),
  ('salary_v3_start_date', '2026-09-01', 'V3生效日期')
ON CONFLICT (key) DO NOTHING;

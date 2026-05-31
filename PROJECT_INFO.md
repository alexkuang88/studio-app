# Studio Manager — 项目关键信息

## 线上地址

部署后 Vercel 分配的域名（在 Vercel Dashboard 查看）：
👉 https://studio-app-xxx.vercel.app

## 账号

| 角色 | 邮箱 | 用途 |
|------|------|------|
| Admin | alexkuang1998@gmail.com | 老板 |

在 Supabase Auth 创建新用户自动获得 Operator 角色。

## Supabase

| 项目 | 地址 |
|------|------|
| 控制台 | https://supabase.com/dashboard/project/siriqcgcgbvakxfjtrre |
| SQL Editor | https://supabase.com/dashboard/project/siriqcgcgbvakxfjtrre/sql/new |
| API 设置 | https://supabase.com/dashboard/project/siriqcgcgbvakxfjtrre/settings/api |
| Project URL | https://siriqcgcgbvakxfjtrre.supabase.co |
| Table Editor | https://supabase.com/dashboard/project/siriqcgcgbvakxfjtrre/editor |

## GitHub

| 项目 | 地址 |
|------|------|
| 仓库 | https://github.com/alexkuang88/studio-app |

## Vercel

| 项目 | 地址 |
|------|------|
| 控制台 | https://vercel.com/dashboard |
| 部署设置 | Vercel Dashboard → studio-app → Settings |

## 环境变量

```
NEXT_PUBLIC_SUPABASE_URL=https://siriqcgcgbvakxfjtrre.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_x_XU70un46btJDE8W1tU9w_7EoiZ5qD
```

## 本地开发

```bash
cd ~/studio-app
npm run dev
# 打开 http://localhost:3000
```

## 部署更新

```bash
cd ~/studio-app
git add .
git commit -m "更新说明"
git push
# Vercel 自动部署
```

## 数据库建表 SQL

```bash
supabase/migrations/00001_initial_schema.sql
```

## 关键文件路径

| 功能 | 文件 |
|------|------|
| 类型定义 | src/lib/types/database.ts |
| 计算函数 | src/lib/utils/calculations.ts |
| 时间工具 | src/lib/utils/time-utils.ts |
| 校验函数 | src/lib/utils/validations.ts |
| API 路由 | src/app/api/ |
| 前端页面 | src/app/(authenticated)/ |
| 首页 Dashboard | src/app/(authenticated)/page.tsx |
| 添加打手 | src/app/(authenticated)/entry/start-session/page.tsx |
| 换人交接 | src/app/(authenticated)/entry/handover/page.tsx |
| 完成订单 | src/app/(authenticated)/entry/complete-order/page.tsx |
| 设备看板 | src/app/(authenticated)/machines/dashboard/page.tsx |
| 订单管理 | src/app/(authenticated)/orders/page.tsx |
| 订单详情 | src/app/(authenticated)/orders/[id]/page.tsx |
| 工资统计 | src/app/(authenticated)/salary/page.tsx |
| 订单收入 | src/app/(authenticated)/revenue/page.tsx |
| 员工管理 | src/app/(authenticated)/employees/page.tsx |
| 侧边栏菜单 | src/components/layout/Sidebar.tsx |

## 数据库备份

```bash
# Supabase Pro 自动每日备份
# 手动导出: Supabase Dashboard → Database → Backups
# pg_dump:
pg_dump -h db.siriqcgcgbvakxfjtrre.supabase.co -U postgres -d postgres -Fc > backup.dump
```

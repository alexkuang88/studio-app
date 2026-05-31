# Studio Manager — 游戏工作室内部管理系统

云端网页系统，用于 Madagascar 游戏工作室的内部管理，包括订单管理、设备/机号管理、打手分段成绩记录、换人交接、员工月成绩和工资统计。

## 技术栈

- **前端框架**: Next.js 16 (App Router) + TypeScript
- **样式**: Tailwind CSS 4
- **数据库**: Supabase PostgreSQL
- **认证**: Supabase Auth
- **部署**: Vercel
- **代码管理**: GitHub
- **Excel 导出**: ExcelJS

## 本地开发

### 前置条件

- Node.js >= 20.9
- npm
- Supabase 账号（免费版即可）

### 1. 克隆项目

```bash
git clone <your-repo-url>
cd studio-app
```

### 2. 安装依赖

```bash
npm install
```

### 3. 配置 Supabase

1. 在 [supabase.com](https://supabase.com) 创建新项目
2. 获取项目 URL 和 anon key
3. 创建 `.env.local` 文件：

```bash
cp .env.example .env.local
```

填入你的 Supabase 配置：

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### 4. 初始化数据库

在 Supabase Dashboard → SQL Editor 中执行：

```
supabase/migrations/00001_initial_schema.sql
```

这将创建所有表、索引、RLS 策略和触发器。

### 5. 创建管理员账号

在 Supabase Dashboard → Authentication → Users → Add User 创建第一个管理员。

然后到 SQL Editor 执行：

```sql
UPDATE profiles SET role = 'admin' WHERE email = 'admin@example.com';
```

### 6. 启动开发服务器

```bash
npm run dev
```

访问 [http://localhost:3000](http://localhost:3000)

## Vercel 部署

### 1. 推送代码到 GitHub

```bash
git add .
git commit -m "Initial commit: Studio Manager MVP"
git push origin main
```

### 2. 在 Vercel 导入项目

1. 登录 [vercel.com](https://vercel.com)
2. 点击 "Add New" → "Project"
3. 选择你的 GitHub 仓库
4. 配置环境变量（同 `.env.local` 中的变量）
5. 点击 "Deploy"

### 3. 绑定自定义域名（可选）

在 Vercel 项目设置 → Domains 中添加自定义域名。

## Supabase 配置说明

### 环境变量

| 变量 | 说明 | 获取方式 |
|------|------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 项目 URL | Supabase Dashboard → Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 匿名密钥（浏览器可用） | Supabase Dashboard → Settings → API → anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | 服务角色密钥（仅服务端） | Supabase Dashboard → Settings → API → service_role key |

### RLS 策略

系统使用 Row Level Security 保护数据：
- 所有登录用户可读取大部分数据
- 只有 Admin 可创建/修改员工、设备、设置
- 只有 Admin 可锁定/解锁工资
- 只有 Admin 可查看操作日志
- 用户不能真正删除数据（无 DELETE 策略）

### 部分唯一索引（防呆核心）

```sql
-- 同一订单同一时间只能有一条 running 记录
CREATE UNIQUE INDEX idx_one_running_per_order ON work_sessions(order_id) WHERE status = 'running';

-- 同一设备同一时间只能有一条 running 记录
CREATE UNIQUE INDEX idx_one_running_per_machine ON work_sessions(machine_id) WHERE status = 'running';

-- 同一打手同一时间只能有一条 running 记录
CREATE UNIQUE INDEX idx_one_running_per_employee ON work_sessions(employee_id) WHERE status = 'running';
```

## 数据库备份建议

### 正式使用后

1. **升级 Supabase Pro** ($25/月): 自动每日备份，7天备份保留
2. **手动导出备份**: Supabase Dashboard → Database → Backups → Download
3. **pg_dump 备份**:

```bash
pg_dump -h db.your-project.supabase.co -U postgres -d postgres -Fc > backup.dump
```

4. **建议备份频率**: 至少每天一次

## Excel 导出

系统支持以下类型的 Excel 导出：

| 导出类型 | API 路径 | 说明 |
|----------|----------|------|
| 订单列表 | `/api/export/orders` | 所有订单数据 |
| 工资统计 | `/api/export/salary?month=YYYY-MM` | 某月工资统计 |
| 作废记录 | `/api/export/voided` | 所有作废的分段记录 |
| 超时订单 | `/api/export/overdue` | 所有超时未完成订单 |
| 设备使用记录 | `/api/export/machines` | 设备历史使用记录 |

可通过在页面添加链接或按钮来触发下载。

## 系统角色

| 角色 | 说明 | 创建方式 |
|------|------|----------|
| Admin | 老板，拥有全部权限 | Supabase Dashboard 或 SQL 手动设置 |
| Operator | 中国现场管理员 | 自动为新注册用户分配的默认角色 |

注意：普通打手员工不需要账号，不需要登录系统。

## 业务逻辑要点

### 订单状态流转

```
not_started → in_progress → ready_to_complete → completed
                                                  → cancelled
```

- 没有 work_session 记录：`not_started`
- 有 running 记录：`in_progress`
- completed_amount >= target_amount：`ready_to_complete`
- 人工点击完成后：`completed`
- 超过要求完成时间未完成：显示超时提醒（状态仍为原状态）

### 核心计算公式

```
result_amount = end_amount - start_amount
work_hours = end_time - start_time（支持跨天）
efficiency = result_amount / work_hours
completed_amount = SUM(result_amount) WHERE order_id = ? AND status = 'completed'
salary = total_result / 100 × salary_rate
```

### 防呆机制

1. 数据库层面：部分唯一索引防止重复 running
2. API 层面：所有操作前进行冲突检查
3. UI 层面：下拉选择、自动计算、必填校验
4. 工资锁定：锁定后 Operator 不能修改该月份数据
5. 数据不能真删除，只能作废（void）

## 项目结构

```
src/
├── app/                    # Next.js App Router 页面
│   ├── (authenticated)/    # 需要登录的路由组
│   │   ├── page.tsx        # 首页 Dashboard
│   │   ├── employees/      # 员工管理
│   │   ├── machines/       # 设备管理 + 现场看板
│   │   ├── orders/         # 订单管理
│   │   ├── entry/          # 现场录入（核心操作）
│   │   ├── salary/         # 工资统计
│   │   ├── audit-logs/     # 操作日志
│   │   └── settings/       # 系统设置
│   ├── login/              # 登录页
│   └── api/                # API Routes
├── components/
│   ├── ui/                 # 基础 UI 组件
│   └── layout/             # 布局组件（侧边栏、顶栏）
├── lib/
│   ├── supabase/           # Supabase 客户端
│   ├── hooks/              # React Hooks
│   ├── types/              # TypeScript 类型
│   └── utils/              # 工具函数
└── middleware.ts           # Auth 中间件
```

## 测试

测试样例位于 `tests/test-scenario.md`，描述了完整的端到端测试场景：
- P001 订单由 4 个员工分段完成
- 验证金额自动计算、余额传递、设备状态同步
- 验证工资计算和防呆机制

## License

Private — 仅供工作室内部使用

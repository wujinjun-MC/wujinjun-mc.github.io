# 实时状态采集器（backend/status）

这个目录负责 `Live Status` 板块的数据来源。页面本身仍然是纯静态的：访客只读取同源的
`data/status.json` 和 `data/battery.json`，不会接触任何 API key、OAuth token 或 PAT。

## 数据流

```
Codex CLI auth.json ─┐
DeepSeek API ────────┴─> collect.mjs（本机，计划任务每 15 分钟）
                            └─> data/status.json ──git commit/push──> GitHub Pages

Android Termux ──workflow_dispatch──> .github/workflows/phone-battery.yml
                                          └─> data/battery.json ──commit──> GitHub Pages

浏览器 ──GET ./data/status.json?t=… + ./data/battery.json?t=…──> 合并渲染
```

- `collect.mjs` 只写 `data/status.json`；手机 workflow 只写 `data/battery.json`，两者不会冲突。
- PC 和 workflow 同时 push 时各自 `git pull --rebase` 并重试。
- 只有数值/可用性/错误状态发生变化时才写入文件，避免每次运行都产生空 commit。

## 一次性配置

### 1. 环境要求

- Node.js 18+（使用内置 `fetch`，无 npm 依赖）。
- Git，能非交互 push 到 `origin`（当前远程是 SSH：`git@github.com:wujinjun-MC/wujinjun-mc.github.io.git`）。
- 本机可访问 `api.deepseek.com` 和 `chatgpt.com`。

### 2. DeepSeek 余额

```powershell
Copy-Item backend/status/.env.example backend/status/.env
# 编辑 .env，填入 DEEPSEEK_API_KEY
```

`.env` 由 `run-collect.ps1` 自动加载；直接运行 `collect.mjs` 时要自己设置环境变量
（或在 Node 20.6+ 用 `--env-file`）：

```powershell
$env:DEEPSEEK_API_KEY = "sk-..."
node backend/status/collect.mjs --dry-run
# 或：node --env-file=backend/status/.env backend/status/collect.mjs --dry-run
```

`.env` 已被 `.gitignore` 忽略。也可以不建 `.env`，直接设置同名的用户环境变量。

- `DEEPSEEK_API_KEY`：必需；没有时页面显示“未配置密钥”。
- `DEEPSEEK_CURRENCY`：可选，默认 `CNY`，没有 CNY 时取接口返回的第一条。
- `HTTP_TIMEOUT_MS`：可选，默认 10000。
- `STATUS_OUT`：可选，默认 `<repo>/data/status.json`。
- 仅用于本地 mock 测试的覆盖项：`DEEPSEEK_BASE_URL`、`CODEX_USAGE_URL`、`CODEX_TOKEN_URL`；生产不要设置。

### 3. Codex 额度

```powershell
codex login
```

登录后 Codex CLI 会生成 `%USERPROFILE%\.codex\auth.json`（或 `$CODEX_HOME/auth.json`）。
采集器读取其中的 access token，调用未公开的 `GET https://chatgpt.com/backend-api/wham/usage`，
请求头包含 `Authorization: Bearer …`、`chatgpt-account-id`、`originator: codex_cli_rs`。

- access token 被拒（401/403）时，采集器会用 refresh token 调
  `https://auth.openai.com/oauth/token` 刷新，并把新 token 原子写回同一个 auth.json，
  与 Codex CLI 保持一致；刷新失败时提示 `codex login`。
- 只使用 API key、没有 ChatGPT 登录态时，没有 5h/周额度可查，页面会显示未登录。
- 该端点未公开，OpenAI 可能调整；失败时只会降级页面，不影响站点其他部分。
- 日志只打印指标状态和公开数值，**不会打印 token 或上游原始响应**。排查时可用
  `node backend/status/collect.mjs --debug` 查看 auth 文件路径和是否存在。

### 4. 首次采集与计划任务

> 先把本次新增文件提交并推送；`run-collect.ps1` 发现 `data/status.json` 之外的未提交改动
> 会跳过本轮，避免 autostash 你的代码。

先手动跑一次（会写文件并尝试提交）：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File backend\status\run-collect.ps1
```

然后用“任务计划程序”创建每 15 分钟一次的任务：

- 程序：`powershell.exe`
- 参数：`-NoProfile -ExecutionPolicy Bypass -File "C:\data\git\wujinjun-mc.github.io\backend\status\run-collect.ps1"`
- 起始于：`C:\data\git\wujinjun-mc.github.io`
- 选择“只在用户登录时运行”，这样 SSH key、Git 凭据和 Codex 登录态都可用。

等价命令行（按需修改路径）：

```powershell
schtasks /Create /TN "Resume Live Status" /SC MINUTE /MO 15 /TR "powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\data\git\wujinjun-mc.github.io\backend\status\run-collect.ps1" /F
```

- 工作区存在 `data/status.json` 之外的未提交改动时，脚本会跳过本轮，避免 autostash 你的代码。
- 日志在 `backend/status/.collect.log`（已忽略）。
- 电脑关机期间数据会停留，页面会显示每张卡的“更新于 … 前”。

### 5. 手机电量（Android / Termux）

1. 创建 GitHub 细粒度 PAT：只授权本仓库，权限 **Actions: Read and write**，设置过期时间。
   不要用 classic token 的 `repo` 全权限。
2. 手机安装 Termux、Termux:API，然后获取脚本（先把本目录推到仓库；也可以在 GitHub 页面
   打开文件后保存）：

```bash
pkg install termux-api jq curl
mkdir -p ~/.config ~/bin
curl -fsSL https://wujinjun-mc.github.io/backend/status/android/report-battery.sh -o ~/bin/report-battery.sh
chmod +x ~/bin/report-battery.sh
```

3. 创建手机端配置（不要把 token 写进仓库）：

```bash
cat > ~/.config/live-status.env <<'EOF'
STATUS_GH_TOKEN=github_pat_replace_me
GITHUB_REPO=wujinjun-MC/wujinjun-mc.github.io
REF=master
WORKFLOW_FILE=phone-battery.yml
EOF
chmod 600 ~/.config/live-status.env
bash ~/bin/report-battery.sh
```

4. 定时（Termux:JobScheduler；参数以设备上的 `-h` 为准）：

```bash
termux-job-scheduler --script ~/bin/report-battery.sh --period-ms 900000 --persisted true
```

备选：`cronie` + Termux:Boot，`crontab -e` 加 `*/15 * * * * bash ~/bin/report-battery.sh`。
也可以使用 Tasker / HTTP Shortcuts 等任意能发 HTTP POST 的工具，只要请求体与脚本生成的
JSON 相同（`level`、`charging`、`ts`）；电量变量名以各 App 文档为准（Tasker 常见为 `%BATT`）。
记得关闭 Termux 的电池优化，否则 JobScheduler 可能被延迟。

5. 也可以在 GitHub Actions 页面手动测试 workflow：
   `Update phone battery` → `Run workflow`，`level=50`、`charging=false`。
   成功后会看到 `data/battery.json` 的新 commit。

手机脚本每 15 分钟触发一次 workflow，但 `write-battery.mjs` 只在电量变化 ≥2 个百分点、
充电状态变化或首次上报时写文件；重复上报不会产生 commit。可用 `MIN_LEVEL_DELTA`
调整阈值（默认 2）。

手机 PAT 失效（过期/撤销）后电量会停止更新；重新生成并替换 env 文件即可。

## 数据契约

`data/status.json`：

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-11-04T08:30:00.000Z",
  "deepseek": {
    "ok": true,
    "currency": "CNY",
    "total": 42.5,
    "granted": 5,
    "toppedUp": 37.5,
    "available": true,
    "updatedAt": "2026-11-04T08:30:00.000Z"
  },
  "codex": {
    "ok": true,
    "planType": "plus",
    "primary": {
      "usedPercent": 36,
      "remainingPercent": 64,
      "windowSeconds": 18000,
      "resetAt": "2026-11-04T10:45:00.000Z"
    },
    "secondary": {
      "usedPercent": 58,
      "remainingPercent": 42,
      "windowSeconds": 604800,
      "resetAt": "2026-11-07T00:00:00.000Z"
    },
    "limitReached": false,
    "updatedAt": "2026-11-04T08:30:00.000Z"
  }
}
```

`data/battery.json`：

```json
{
  "schemaVersion": 1,
  "level": 87,
  "charging": true,
  "updatedAt": "2026-11-04T08:31:00.000Z",
  "reportedAt": "2026-11-04T08:31:00.000Z",
  "source": "android"
}
```

- 时间一律 ISO-8601 UTC。
- `updatedAt` 是最后一次成功取到该指标、且导致快照变化的时间；数值没变的采集不会刷新它。
  因此页面卡片上的“更新于”表示**数值最后一次变化**的时间，而非最后一次检查时间；页头的
  “上次同步”才是浏览器最近一次成功拉取时间。
- 失败时保留旧值、旧时间和 `ok:false` + `error`，页面会显示“更新失败”但继续展示旧值。
- 顶层 `generatedAt` 只在内容实质变化时更新。
- `remainingPercent = 100 - usedPercent`，`windowSeconds` 18000 = 5 小时、604800 = 7 天。
- 顶层 `ok:false` 的 `deepseek`/`codex` 仍可能带有上一次的数值，前端会显示“更新失败”并保留旧值。

## 常见错误码

| 错误码 | 含义 / 处理 |
| --- | --- |
| `not_configured` | 没有 `DEEPSEEK_API_KEY`；填写 `.env` 或环境变量 |
| `not_logged_in` | 没有 Codex 登录态；运行 `codex login` |
| `reauth_required` | Codex refresh 失败；重新 `codex login` |
| `auth_failed` | DeepSeek key 无效/被撤销 |
| `account_mismatch` | Codex account id 与 token 不匹配；重新登录 |
| `network_error` / `timeout` | 本机网络或代理问题；检查 `HTTP_TIMEOUT_MS` 和代理 |
| `rate_limited` | 上游限流；稍后重试 |
| `bad_response` | 上游返回结构变化；检查端点是否改版 |
| `http_<code>` | 上游 HTTP 状态；`http_404` 常见于端点变更 |

整个 `data/status.json` 损坏时，下次采集会重建文件（日志提示 warning）。

## 安全与隐私

- 仓库里只有公开的汇总值；**没有** API key、OAuth token、account id、邮箱或原始响应。
- `.env`、Termux 的 `live-status.env`、采集日志都在 `.gitignore` 中。
- 手机 PAT 只授予 Actions 写权限，不能直接改仓库文件；workflow 的输入会被校验并经
  `env` 传递，避免 shell 注入。
- DeepSeek 余额和电量会公开在页面上。如果不想公开某项，删除 `index.html` 里对应的
  `status-card` 即可（前端对缺失卡片安全跳过），或把 `config.liveStatus.enabled` 设为 `false`。
- 采集器与 Codex CLI 同时刷新 token 的竞态极罕见；若出现 `reauth_required`，重新登录即可。

## 测试与预览

```powershell
node --check JS/live-status.js
Get-ChildItem backend/status -Recurse -Filter *.mjs | ForEach-Object { node --check $_.FullName }
node --test backend/status/test
python -m http.server 8000
```

打开 `http://127.0.0.1:8000/?demo=1` 用示例数据查看完整界面；不带 `?demo=1` 时读取真实的
`data/*.json`，首次采集前会显示“暂无数据”。

如果本机环境禁止 `node --test` 派生子进程（例如受限沙箱），可用单进程模式：

```powershell
node --test --experimental-test-isolation=none backend/status/test/*.test.mjs
```

## 以后想改成 (b) C/S 架构

前端只依赖上面两个 JSON 契约。以后部署一个 API（Cloudflare Worker/VPS）时，让它返回
同样的 `status` 和 `battery` 文档，然后修改 `config/config.js`：

```js
liveStatus: {
    endpoint: "https://api.example.com/status.json",
    batteryEndpoint: "https://api.example.com/battery.json"
}
```

注意：Codex 的 OAuth token 会随刷新轮换，和本机 Codex CLI 共用同一份 auth.json；纯服务端
托管 refresh token 容易与 CLI 互相失效。更稳妥的 (b) 是：API 负责 DeepSeek 实时查询和
KV 缓存，Codex 仍由本机 publisher 推送快照，手机直接 POST 电池到 API。

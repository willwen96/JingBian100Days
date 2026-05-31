# 惊变100天

文字生存游戏 Demo（React 网页版 + 共享引擎）。

## 本地开发

```bash
npm install
npm run dev:web
```

打开 `http://localhost:5173`。

## 测试

```bash
npm test
```

## 通过 GitHub Pages 部署

本仓库已包含 [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml)。推送到 `main` 分支后会自动构建并发布 React 版。

### 首次设置

1. 在 GitHub 创建仓库（例如 `100Days`），将本项目推送上去：

   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/<你的用户名>/<仓库名>.git
   git push -u origin main
   ```

2. 打开仓库 **Settings → Pages**：
   - **Source** 选 **GitHub Actions**（不要选 Deploy from a branch）

3. 等待 Actions 跑完后，访问：

   ```
   https://<你的用户名>.github.io/<仓库名>/
   ```

   例如仓库名为 `100Days` 时：`https://wenju.github.io/100Days/`

### 手动触发

Actions 页选择 **Deploy to GitHub Pages** → **Run workflow**。

### 本地验证生产构建

模拟 GitHub Pages 子路径（把 `100Days` 换成你的仓库名）：

```bash
# PowerShell
$env:BASE_PATH="/100Days/"; npm run build:web; npm run preview:web
```

## 项目结构

| 路径 | 说明 |
|------|------|
| `web/` | React 前端（部署产物） |
| `demo/` | 原版静态 Demo + 游戏引擎 |
| `data/` | 游戏 JSON 数据 |
| `tests/` | Vitest 测试 |

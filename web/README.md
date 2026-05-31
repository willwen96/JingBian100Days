# 惊变100天 · React 网页版

基于共享游戏引擎（`demo/js/engine.js`）的 React 前端。

## 开发

在项目根目录：

```bash
npm run dev:web
```

浏览器打开终端显示的地址（默认 `http://localhost:5173`）。

## 构建

```bash
npm run build:web
npm run preview:web
```

产物输出到 `dist-web/`。

## GitHub Pages 部署

见项目根目录 [README.md](../README.md#通过-github-pages-部署)。CI 会自动设置 `BASE_PATH`；本地默认 `/` 不受影响。

## 说明

- 游戏数据来自根目录 `data/`（Vite `publicDir`）
- 引擎与 demo 版共用，存档槽位互通（localStorage）
- 移动端做了基础响应式适配，未单独做原生 App 级优化

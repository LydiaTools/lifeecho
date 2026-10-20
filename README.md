# LifeEcho

一个面向移动端的私密人生阶段对话应用。用户可以通过简短对话记录当下状态，并逐步形成个人生命阶段档案。

## 本地开发

需要 Node.js 22.13 或更高版本。

```bash
npm ci
npm run dev
```

## 质量检查

```bash
npm run lint
npm run build
```

## 数据与隐私

- `.env*`、本地数据库、构建产物和部署缓存不进入版本库。
- 仓库只保存应用源码；真实用户数据不应提交到 Git。
- `.openai/hosting.json` 用于现有 Sites 部署配置。

## 远程仓库

`origin` 保留为现有 Sites 部署仓库；GitHub 使用独立的 `github` 远程，避免影响部署流程。

# Changelog

格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 SemVer。

## [Unreleased]

## [0.7.1] - 2026-11-27

### Added
- 头部/页面背景图支持：上传自动压缩（≤5MB/≤1800px）、缩略预览、填充方式（铺满裁切/完整适应/平铺）、叠加蒙版（颜色+透明度）
- 引入 ONLYTOOLS Standard：AGENTS.md / CLAUDE.md / CODEX.md / GEMINI.md 跨代理工程规范、onlytools.config.json 产品元数据、ods.py 校验工具、验证与发布门禁工作流
- 导出图片成功横幅恢复「打开文件夹」按钮（桌面端）

### Changed
- README 按 ONLYTOOLS 规范重构（功能特性/系统要求/下载与安装/快速开始/数据与隐私/问题反馈/许可证必备章节）
- CHANGELOG 启用 Keep a Changelog 分类
- 发布资产命名标准化（OnlyRep-Setup/Portable/Web-v{version}-x64.*）并附 SHA256SUMS.txt

### Fixed
- 背景图配置误点「颜色」导致图片丢失需重新上传（切换只切视图，清除需显式按钮）
- 修复 ods.py release-notes 起草器正则转义过量

## [0.7.0] - 2026-11-25

### Added
- **AI 助手**（右下角 ✨ 会话面板）：对话搭建画布、📎 文件直传本机解析落数据源、多轮对话（历史窗口截断）、流式打字机输出、Markdown 排版（含表格渲染）
- 动作卡双形态：全量画布生成 + **增量 patch**（6 种画布块操作 + 3 种管道节点操作，采用可 Ctrl+Z 撤销）
- 校验失败自愈：AI 输出未过结构校验时自动回喂错误重试一次
- 回答人性化：节点类型中文化（修数节点（cellEdit））、节点 id 映射用户命名、参数 key 中文标注
- 节点浮动工具条「✨ 问 AI」：节点结构化信息一键发给助手
- 面板拖拽调宽、会话本机持久化

### Changed
- 画布/节点两条二级工具栏移除，控件上收顶栏（两视图各多一整行纵向空间）
- 应用标识统一为 `com.onlyrep.app`（自动迁移旧数据目录与存储键）

### Fixed
- **保存覆盖事故**：新建空白/从模板新建/载入示例后保存会覆盖旧项目（活动项目指针未清）——三处修复并加隔离回归测试
- 桌面端「导出模板 JSON」无反应（WebView 不支持浏览器下载，改走 Rust 落盘）
- AI 生成的手填表形状错误导致白屏（提示词修正 + 存量数据自动修复 + 渲染防御）

## [0.6.0] - 2026-11-24

### Changed
- **更名 OnlyRep**：产品名、二进制（onlyrep.exe）、安装包、存储键全量统一；旧数据自动迁移（存储键/SQLite/应用数据目录），旧键保留可回滚

### Fixed
- 项目库双写 .rkb 到项目目录（真实文件可备份可拷走）

## [0.5.0] - 2026-11-23

### Added
- 项目/模板双层体系：项目库（壳+数据）、模板库（版式壳）、启动页、.rkb 项目文件导入导出
- 连线中点「⊕ 插入 | ✕ 删除」胶囊
- 数据源填充引导（模板新建项目后逐个提示选文件）

### Changed
- 界面整体视觉升级（顶栏/检查器/节点卡片）

[Unreleased]: https://github.com/onlytools-lab/onlyrep/compare/v0.7.1...HEAD
[0.7.1]: https://github.com/onlytools-lab/onlyrep/releases/tag/v0.7.1
[0.7.0]: https://github.com/onlytools-lab/onlyrep/releases/tag/v0.7.0
[0.6.0]: https://github.com/onlytools-lab/onlyrep/releases/tag/v0.6.0
[0.5.0]: https://github.com/onlytools-lab/onlyrep/releases/tag/v0.5.0

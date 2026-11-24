# OnlyRep — 数据可视化日报工作台

> 把 Excel 变成一份好看的日报：**数据节点**负责把表算成数字，**日报画布**负责把数字摆成版面，一次搭好、换数即出图。
> 全程本地运行，数据不上传任何服务器；提供桌面应用（Windows）与单文件网页两种形态。

![License](https://img.shields.io/badge/license-private-blue) ![Version](https://img.shields.io/badge/version-0.6.0-blue) ![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Web-lightgrey)

---

## 🎯 解决什么问题

运营/业务同学每天要做同构的数据日报：导表 → 清洗 → 汇总 → 排版 → 出图发群。Excel + PPT 手工链路又慢又易错。OnlyRep 把这条链路固化成「**管道 + 版面**」：

- 数据变化（换一张今天的表）→ 全链路自动重算 → 版面自动刷新 → 导出图片
- 版面搭一次即成模板/项目，天天复用

## ✨ 核心能力

### 1. 数据节点（管道计算）

类工作流的可视化管道：左侧拖节点 → 连线成链 → 每步实时预览。

| 类别 | 节点 |
|---|---|
| 数据源 | 文件导入（xlsx/csv，多 sheet）、手填表（可直接编辑的表格）、表单（日期/参数，值进公式变量）、常量 |
| 筛选与整理 | 取行（前 N/区间/抽样）、筛选（条件过滤）、**修数**（批量规则改值 + 预览表双击定点改格）、排序·TopN |
| 计算与合并 | 计算字段（公式加列）、分组汇总、行差异（环比）、两表合并 |
| 取数与公式 | 取数（列聚合为变量）、公式节点（标量/逐行，进变量环境供画布引用） |

- **连线中点胶囊**：点选连线 → 「⊕ 插入 | ✕ 删除」一步插节点，不用删线重连
- 节点工具条：添加下游（搜索 + 分类）、停用、删除；框选多选整组拖动
- 每个节点右侧抽屉看实时输入/输出预览，修数节点的预览表可直接双击改数
- 同名列冲突 / 公式变量重名会亮红提醒

### 2. 日报画布（自由版面）

- 组件：标题、富文本、KPI 指标卡、数据表格、图表（柱状/条形/折线/饼图/漏斗/雷达）、排行榜（本项目的招牌）、logo、**分栏容器**（1~4 列，可嵌套，拖组件到另一组件侧边即分栏）
- 检查器 Figma 风格：灰底控件、内嵌前缀（px/%）、分段对齐控件
- 绑定变量：KPI/图表/表格绑定管道算出的取数/公式变量，换数据自动刷新
- 撤销/重做（Ctrl+Z / Ctrl+Shift+Z，含操作名提示）、框选多选、结构树导航、Esc 逐级上钻

### 3. 项目与模板

| | 模板 | 项目 |
|---|---|---|
| 内容 | 版式壳（组件+管道配置） | 壳 + **数据**（含原始文件字节） |
| 用途 | 分享、起始创建 | 日常工作单元 |

- **启动页**：最近项目卡片（画布缩略图、固定/移除）、继续上次工作区、新建（空白/官方模板/我的模板/导入 .rkb）
- **项目库**：多项目切换自动回写不丢数据；保存时自动双写 .rkb 到项目目录（备份=复制文件夹）
- **.rkb 项目文件**：壳 + 原始表字节自包含，拷给同事导入即用
- **数据源填充引导**：从模板新建项目后逐个提示选文件
- **保存提示**：任意变更打脏标记（头部 💾 橙点），Ctrl+S 一键保存
- 深浅色模式（全局统一切换，节点画布/弹窗跟随）

### 4. 导出

- 画布导出高清 PNG（缩放/留白可调，桌面端可选保存位置、导后一键打开文件夹）
- 网页单文件产物：`RankBoard-web-standalone.html`，双击即用、可内网分发

### 5. 数据安全

- 本地优先：桌面端数据落 SQLite（应用数据目录），缓存落 IndexedDB；无任何网络上传
- 导入文件原始字节随项目保存，换机器导入 .rkb 即完整还原
- 存储降级兜底：localStorage 不可用时内存兜底不白屏

## 🖥️ 形态与安装

| 形态 | 文件 | 说明 |
|---|---|---|
| Windows 安装包 | `RankBoard_x.x.x_x64-setup.exe` | 推荐，开始菜单/卸载齐全 |
| MSI | `RankBoard_x.x.x_x64_en-US.msi` | 备选安装包 |
| 免安装单文件 | `rankboard-standalone.exe` | 双击即用 |
| 单文件网页 | `RankBoard-web-standalone.html` | 浏览器打开，数据存浏览器 |

> 首次运行如弹 Windows SmartScreen：「更多信息」→「仍要运行」。

## 🧱 技术栈

- **前端**：React 18 + TypeScript + Vite + Tailwind CSS + Ant Design 6 + ECharts 6 + Zustand（persist）
- **桌面壳**：Tauri 2（Rust 后端：SQLite kv、文件对话框、导出落盘、单实例）
- **数据**：xlsx（@e965/xlsx）解析 → 清洗管线（脏数据规范化、合计行排除）→ 节点引擎（拓扑调度）
- **导出**：html-to-image 高清截图

## 🗂️ 代码结构（速览）

```
src/
  canvas/            日报画布（组件块、检查器、容器、结构树）
    flow/            数据节点（画布交互、节点注册表 nodes/steps/*、执行器）
    datasource/      数据源注册表（import/manual/form/constant）+ 快照缓存
    formula/         公式引擎（函数库、变量环境、重名检测）
    projectLibrary/  项目库、.rkb 项目文件、模板库
  pipeline/          节点执行（筛选/修数/聚合…）
  store/             Zustand stores（config、projects、history、uiTheme）
  storage/           safeStorage 降级、tariKv（SQLite 镜像）
src-tauri/           Rust 壳（kv/导出/项目文件落盘）
e2e/                 Playwright 回归（5 组脚本 40+ 断言）
```

## 🔧 开发

```bash
npm install          # 装依赖
npm run dev          # 浏览器开发（5173）
npm run tauri:dev    # 桌面开发（热更）
npm run verify       # 提交前闸门：tsc + 260+ 单测 + 构建
npm run test:e2e     # 端到端回归（需先 build）
npm run tauri:build  # 出 exe + 安装包
```

发布走 tag 流水线：`git tag vX.Y.Z && git push origin vX.Y.Z` → CI 质量门（tsc+单测）→ Windows 构建 → Release 自动挂四资产（安装包/MSI/免安装 exe/单文件网页）。

## 📚 更多文档

- `docs/使用手册.md` — 运营同学 5 分钟上手
- `docs/分发说明.md` — 给同事装包的话术（SmartScreen 等）
- `docs/桌面版-Tauri-SQLite.md` — 存储架构
- `docs/节点体系与新增节点指南.md` — 新增处理节点的规范路径

## 📋 版本亮点

- **v0.6.0** 修数节点（批量规则/定点改格）、连线中点插入、添加面板统一
- **v0.5.0** 节点工作区优化、统一主题与集中设置
- **v0.4.0** 项目体系（启动页/项目库/.rkb/保存提示）
- **v0.3.0** 分栏容器、深浅色模式、Figma 风格检查器

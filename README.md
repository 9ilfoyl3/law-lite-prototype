# AI辅助办案系统 - 产品原型

> 面向基层检法司办案人员的 AI 辅助办案工作台原型，运行在政法专网内。围绕"案件管理 → 材料组织 → 文书生成 → 个人配置"主链路，将 AI 能力以表单化、图形化方式嵌入法官/检察官/司法局工作人员的日常案头工作。

---

## 核心用户场景

1. **案件管理**：案件列表、新建/编辑/删除、文件上传、解析状态查看、生成文书入口、批量生成
2. **材料组织**：案件文件页按分类管理材料、文件问答、材料树操作
3. **文书生成**：一步生成（材料生成）+ 分步生成（仅裁判文书，6 步硬编码）两种模式，引入案由要件作为可选增强
4. **文书流转**：文书详情查看、下载打印、文书精修（多轮对话）、历史文书版本管理
5. **个人配置**：我的要件、我的模板、我的提示词，与系统/管理后台数据分层合并展示

> 业务系统通过顶部切换按钮（法院 / 检察院 / 司法局）切换，切换后案由树、案字、文书类型/模板、要件、示例案件随之联动。

---

## 页面索引

> 完整页面清单见 [docs/页面清单.md](docs/页面清单.md)，与 `pages/` 目录保持 1:1 映射。

### 用户侧页面

| 页面 | 文件路径 | 功能简述 |
|------|----------|----------|
| 登录页 | [pages/login.html](pages/login.html) | 系统入口，支持普通用户/管理员（超级管理员/法院管理员）身份切换登录 |
| 案件管理 | [pages/cases.html](pages/cases.html) | 案件列表、状态追踪、文件解析状态、生成文书、批量生成（异步队列） |
| 案件文件 | [pages/case-files.html](pages/case-files.html) | 三栏布局：左材料树 + 中/右文书生成配置区/文书展示区；一步生成/分步生成、引入要件、文书精修 |
| 文书详情 | [pages/document-detail.html](pages/document-detail.html) | 文书查看、下载、打印、精修跳转 |
| 文书精修 | [pages/document-polish.html](pages/document-polish.html) | 独立页面：左侧文书内容 + 右侧对话式精修，保存为新版本 |
| 我的要求件 | [pages/my-elements.html](pages/my-elements.html) | 按案由维护用户自定义要件（含案字白名单约束） |
| 我的模板 | [pages/my-templates.html](pages/my-templates.html) | 用户侧个人文书模板维护，关联文书类型 |
| 我的提示词 | [pages/my-prompts.html](pages/my-prompts.html) | 用户侧个人提示词维护（含历史版本管理） |
| AI 聊天 | [pages/chat.html](pages/chat.html) | 自然语言交互入口（演示性质，未来以浮窗形式整合） |
| 历史任务 | [pages/tasks.html](pages/tasks.html) | 按任务类型展示历史任务记录 |
| 知识库 | [pages/knowledge.html](pages/knowledge.html) | 全员公开库与个人知识库的浏览与管理（待开发） |
| 个人设置 | [pages/settings.html](pages/settings.html) | 账户信息、全员公开库管理（管理员权限） |

### 管理后台页面

| 页面 | 文件路径 | 功能简述 |
|------|----------|----------|
| 控制台 | [pages/admin/dashboard.html](pages/admin/dashboard.html) | 系统核心数据概览、快捷操作、系统通知（V1.1 待定） |
| 用户管理 | [pages/admin/users.html](pages/admin/users.html) | 用户全生命周期管理、批量导入/删除 |
| 法院维护 | [pages/admin/court-tree.html](pages/admin/court-tree.html) | 超管专用：维护法院上下级组织树，分配法院管理员账号 |
| 部门维护 | [pages/admin/department.html](pages/admin/department.html) | 法院管理员维护本法院部门组织 |
| 案件管理 | [pages/admin/cases.html](pages/admin/cases.html) | 全院视角案件管理（可编辑模式、多承办人） |
| 系统运行报告 | [pages/admin/system-report.html](pages/admin/system-report.html) | 静态周报/月报/自定义报告，支持导出 PDF（V1.1 待定） |
| 知识库分类管理 | [pages/admin/knowledge-base.html](pages/admin/knowledge-base.html) | 全员公开库分类体系维护（V1.1 待定） |
| 知识库文档管理 | [pages/admin/knowledge-documents.html](pages/admin/knowledge-documents.html) | 知识库文档上传、状态管理、解析索引（V1.1 待定） |
| 案由管理 | [pages/admin/cause-management.html](pages/admin/cause-management.html) | 三级案由层级结构维护，上线/下线管理 |
| 文书类型管理 | [pages/admin/doc-types.html](pages/admin/doc-types.html) | 文书类型 CRUD + workflow 子配置（仅一步生成型，移除使用模型字段） |
| 要件管理 | [pages/admin/element-presets.html](pages/admin/element-presets.html) | 标准要件维护（含案字白名单约束、启用/停用） |
| 文书模板管理 | [pages/admin/doc-templates.html](pages/admin/doc-templates.html) | 文书模板 CRUD（移除案由关联、启用/停用） |
| 提示词管理 | [pages/admin/prompt-templates.html](pages/admin/prompt-templates.html) | 提示词 CRUD（含历史版本管理、启用/停用） |
| 风控与审计 | [pages/admin/risk-audit.html](pages/admin/risk-audit.html) | 敏感词库、审计日志（含拦截记录），支持导出 PDF |
| 系统初始化配置 | [pages/admin/settings.html](pages/admin/settings.html) | 部署时一次性配置（含批量文书队列允许个数） |
| 模型配置与用量 | [pages/admin/model-management.html](pages/admin/model-management.html) | 模型部署清单、场景模型配置、配额与用量（V1.1 菜单入口已隐藏，代码保留） |

---

## 打开方式

**双击 `index.html` 即可在浏览器中打开使用。**

本项目为纯静态原型，不依赖任何网络、服务器、构建工具或命令行操作。所有资源均为本地相对路径引用，支持离线使用。

---

## 技术栈

- HTML5 + CSS3
- 原生 JavaScript（无框架依赖）
- Font Awesome 6.4.0 图标（本地副本）
- Google Fonts Noto Sans SC（本地副本）
- 数据存储：localStorage / sessionStorage / JS 内存变量

---

## 文档目录

### V1.1 版本（最新）

- [V1.1版本PRD](docs/V1.1版本PRD.md) - **最新权威来源**，覆盖登录页/用户侧案件模块/Workflow编排/管理后台
- [V1.1配图索引](docs/V1.1版本PRD.md#十三配图索引v11-评审材料) - V1.1 评审用 15 张分场景流程图索引（位于 `docs/clarify-diagrams/`，纯静态 HTML+SVG，双击即可打开）
- [V1.1修改清单](docs/修改清单_V1.1_20260728.md) - V1.1 原型代码修改任务清单 + PRD 校准动作清单附录

### 全局文档（已同步 V1.1 调整）

- [用户侧PRD](docs/用户侧PRD.md) - 用户侧系统完整需求（v1.7，已同步 V1.1 调整）
- [管理后台PRD](docs/管理后台PRD_0527.md) - 管理后台功能与权限设计（v1.19，已同步 V1.1 调整）

### 其他文档

- [页面清单](docs/页面清单.md) - 所有页面名称、文件路径、功能简述（与 `pages/` 1:1 映射）
- [交互说明](docs/交互说明.md) - 核心交互流程与状态流转
- [案件模块设计审视记录](docs/案件模块设计审视记录_20260728.md) - 开发视角审视结果，含已解决/待确认问题追踪
- [法院司法系统产品版本规划讨论](docs/法院司法系统产品版本规划讨论.md) - V1.1 评审会议记录

> 三份 PRD 文档关系说明：`V1.1版本PRD.md` 为最新版本（聚焦 V1.1 迭代的案件模块与管理后台调整）；`用户侧PRD.md` 与 `管理后台PRD_0527.md` 为历史全局文档，已通过版本记录与同步说明章节同步 V1.1 调整，供需要完整模块历史背景的读者查阅。如遇冲突，以 `V1.1版本PRD.md` 为准。

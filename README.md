# 法院Lite版AI法官助理 - 产品原型

> 面向基层民事法官的、运行在政法专网内的AI法官助理原型。聚焦法官核心案头工作场景，覆盖七大智能辅助能力。

---

## 核心用户场景

1. **裁判文书生成**：基于案件材料自动生成判决书初稿，将文书撰写时间缩短80%
2. **文书质量评查**：六维度智能评查已生成文书，一键修复格式/法条问题
3. **庭审提纲生成**：基于卷宗材料一键生成结构化庭审提纲
4. **法条检索与校验**：法条关键词检索 + 生成内容自动校验，杜绝法条幻觉
5. **案由智能推荐**：根据案情描述智能推理标准案由（三级置信度交互）
6. **证据梳理**：五步引导式证据梳理，支持电子聊天记录深度解析
7. **法律知识问答**：基于法律知识库的智能问答，支持多轮咨询

---

## 页面索引

### 用户侧页面

| 页面 | 文件路径 | 功能简述 |
|------|----------|----------|
| 登录页 | [pages/login.html](pages/login.html) | 系统入口，支持普通用户/管理员身份切换登录 |
| AI聊天（核心工作区） | [pages/chat.html](pages/chat.html) | 自然语言交互入口，支持七大智能体任务发起与处理 |
| 历史任务 | [pages/tasks.html](pages/tasks.html) | 按任务类型展示历史任务记录，与普通AI聊天会话分离 |
| 案件管理 | [pages/cases.html](pages/cases.html) | 案件列表、状态追踪、关联操作（含文书生成与文书详情，不再单设文书管理页） |
| 知识库 | [pages/knowledge.html](pages/knowledge.html) | 全员公开库与个人知识库的浏览与管理 |
| 个人设置 | [pages/settings.html](pages/settings.html) | 账户信息、全员公开库管理（管理员权限） |

### 管理后台页面

| 页面 | 文件路径 | 功能简述 |
|------|----------|----------|
| 控制台 | [pages/admin/dashboard.html](pages/admin/dashboard.html) | 系统核心数据概览、快捷操作、系统通知 |
| 用户管理 | [pages/admin/users.html](pages/admin/users.html) | 用户全生命周期管理、批量导入/删除 |
| 系统运行报告 | [pages/admin/system-report.html](pages/admin/system-report.html) | 系统运行报告生成与查看，支持周报/月报/自定义 |
| 知识库分类管理 | [pages/admin/knowledge-base.html](pages/admin/knowledge-base.html) | 全员公开库分类体系维护 |
| 知识库文档管理 | [pages/admin/knowledge-documents.html](pages/admin/knowledge-documents.html) | 知识库文档上传、状态管理、解析索引 |
| 案由管理 | [pages/admin/cause-management.html](pages/admin/cause-management.html) | 三级案由层级结构维护（供案由明鉴模块使用） |
| 文书类型管理 | [pages/admin/doc-types.html](pages/admin/doc-types.html) | 各业务系统文书类型维护（文书模板/提示词的父级分类） |
| 风控与审计 | [pages/admin/risk-audit.html](pages/admin/risk-audit.html) | 敏感词库、拦截记录、全链路审计日志 |
| 系统初始化配置 | [pages/admin/settings.html](pages/admin/settings.html) | 系统信息、安全策略、运行参数配置 |
| 模型配置与用量 | [pages/admin/model-management.html](pages/admin/model-management.html) | 模型列表、法院授权、Token配额与用量统计 |

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

- [法院Lite版PRD文档](docs/PRD_new.md) - 用户侧系统与七大智能体详细需求
- [管理后台PRD文档](docs/管理后台PRD_new.md) - 管理后台功能与权限设计
- [页面清单](docs/页面清单.md) - 所有页面名称、文件路径、功能简述
- [交互说明](docs/交互说明.md) - 核心交互流程与状态流转
- [数据结构](docs/数据结构.md) - Mock 数据结构定义

# 文书精修 Agent 编写方案

> 版本：v1.2  ·  适用范围：文书精修页（`document-polish.html`）底层 Agent 实现
> 关联原型：`pages/document-polish.html`、`js/document-polish.js`、`js/doc-editor.js`
> 关联 PRD：`docs/V1.1版本PRD（人看）.md` 功能7「文书精修」
> 关联测试集：`docs/文书评查黄金测试集.md`（见第 16 节）
> 关联数据：`docs/裁判文书常见错题集.json`（见第 5.6 节）
> 编写依据：原型现有数据结构、上下文来源、两类精修模式交互

> **v1.2 修订说明**（2026-08-17，依据产品对裁判文书精修的三原则 + 软指标 + 错题集输入）：
> 1. 三条硬原则升级为一级约束，写入角色边界与两个子 Agent Prompt 禁区（§1.1 / §8）：事实零改动（只动表达层）、法条引用条款项目逐字一致、裁判主文与诉讼请求逐项对应（不超不漏）
> 2. 检查项扩充（§5.4）：`typo` 补数字用法、`logic` 补"论述未判决/判决未论述"双向核对、`structure` 补裁判文书六部分结构完整性、新增 `claim_match`（诉请判项对应）；**检查项清单不锁定**，错题集作为检查清单的持续来源
> 3. 新增错题集机制（§5.6）：裁判文书常见错题集按"案由 → 场景错误"组织，评查时按案由动态注入为反面示例；命中场景错误时**只提示风险、不代改正文**（与"事实零改动"原则兼容）；本期不接法条检索库
> 4. "AI 建议采纳率"升级为北极星指标（§16）：明确口径、维度、告警阈值与退回归因；忽略归因沉淀为错题集素材，形成闭环
> 5. 格式张力调和：结构完整性（六部分齐全）属内容层提示，归入 `structure`；排版样式仍不动（维持 v1.1 决策）

> **v1.1 修订说明**（2026-08-13，依据产品评审 12 条决策答复）：
> 1. 新增「文书评查」能力：预置检查项驱动的全文评查（第 5.4 节）；**明确不做格式类、语气类检查**——格式由文书生成阶段定义，精修只调内容；公文写作语气不作要求
> 2. 文书类型适配走"评查 Agent/Workflow 灵活调整"路线：不建代码内置规则库、不建后台规则配置（第 5.5 节）
> 3. 不做精修程度档位（light/medium/deep 方案废弃）
> 4. ~~修正第 13/15 节~~（已撤销）：v1.1 修订时误读到旧版 `document-polish.js`（404 行旧文件），曾将第 13/15 节改为"mock 函数不存在"。经对**新版**（1665 行，含 `mockReviewMessage` / `streamAnalysisSteps` / `streamReviewCards` / `mockRewrite` / `reviewMessages` / `applyReview` 等全套实现）复核，v1.0 的函数引用**准确无误**，第 13/15 节已恢复 v1.0 内容，仅叠加 checkItems 与评查入口的新增说明
> 5. 二期/暂缓项：后置实体校验（二期）、长文书分段（暂缓）、用户自定义规则（本版不涉及）、兜底策略增强（暂缓）、建议续扫（暂缓）——汇总见第 17 节
> 6. 待定项：`reason` 修改理由展示、多轮会话记忆——Schema 预留字段，见第 9 节与第 17 节

---

## 0. 文档目的

本文档面向**后端 / 算法工程师**，定义文书精修场景下 Agent 的：
- 角色边界与能力清单
- 上下文组装规则（精修三卡片数据如何拼装为 Agent 输入）
- 两类精修模式 + 文书评查能力的 Agent 编排逻辑
- 文书评查预置检查项定义（第 5.4 节）
- 工具 / 函数调用清单
- SSE 事件流协议（替代现有 setTimeout mock）
- 状态机与异常熔断
- 模型选型与参数
- 具体Prompt 模板与输出 JSON Schema
- 质量评估与黄金测试集（第 16 节）

**不包含**：法条链接识别（该能力在文书生成阶段完成，精修页仅做查看跳转）、文书生成 、要件总结、**文书格式调整（格式由生成阶段定义，精修不动格式）**。

---

## 1. Agent 角色定义

### 1.1 角色定位

| 维度 | 说明 |
|------|------|
| 角色 | 法律文书精修助手（Legal Document Polish Agent） |
| 输入 | 用户指令 + 文书全文 + 个案知识库 + 结构化数据（要件清单 + 分步生成快照）+ 错题集反面示例（v1.2，按案由匹配注入） |
| 输出 | 结构化修改建议（含分析过程 + 修改点列表）或单点改写结果 |
| 边界 | **只改不创**——只对已生成文书做局部修改，不从头生成完整文书；不修改案件元数据；不调用外部法规检索（法条引用由文书生成阶段注入；本期不核验条文内容真实性） |
| 三条硬原则（v1.2） | ① **事实零改动**：裁判文书是对已审理查明事实的固化呈现，精修只涉及表达层（语法、用词、逻辑通顺），任何修改不得新增、删减或改变原案事实认定；② **法条引用逐字一致**：引用的法律名称及条、款、项、目与原文完全一致，不得增删改；③ **主文与诉请对应**：判项必须与诉讼请求逐项对应，不超范围、不遗漏——Agent 只发现与提示对应性问题，不代拟判项 |
| 拒绝策略 | 用户指令超出精修范围（如"重新写一份判决书"）时，返回 `reject` 事件并提示"该操作超出精修范围，请前往文书生成页重新生成"；指令要求改动事实认定或判项实质内容时同样拒绝，提示"事实认定/判项内容超出精修范围，请人工复核后修改" |

### 1.2 能力清单

Agent 支持两类精修模式，对应两个独立的子 Agent；其中结构化审查 Agent 支持两种触发方式（指令审查 / 文书评查）：

| 子 Agent | 触发入口 | 输入特征 | 输出形态 |
|---------|---------|---------|---------|
| **A. 单点改写 Agent**（`rewrite`） | 选中段落 → 点【系统改写】→ 输入指令 → 发送 | 局部原文片段（`selectedText`）+ 用户改写指令 | 单段改写结果文本 |
| **B. 结构化审查 Agent**（`review`）· 指令审查 | 右侧对话框输入精修指令 → 发送 | 文书全文 + 用户精修指令 | 分析过程 + N 条结构化修改建议 |
| **B. 结构化审查 Agent**（`review`）· 文书评查 | 点【文书评查】按钮（可勾选检查项） | 文书全文 + 预置检查项列表（`checkItems`），无用户指令 | 按检查项归类的分析过程 + N 条结构化修改建议 |

两个子 Agent 共享上下文组装逻辑（见第 3 节），但 Prompt、输出 Schema、流式协议不同。文书评查与指令审查复用同一子 Agent 与 SSE 协议，仅输入与 Prompt 不同（见 5.4）。

---

## 2. 上下文数据来源（原型现状）

精修页初始化时（`document-polish.js:40-89`）通过 URL 参数 `caseId` + `versionId` 加载，以下数据已就绪于全局变量，真实接入时需组装为 Agent 输入：

| 数据 | 来源 | 字段 |
|------|------|------|
| 案件基础 | `polishCaseItem` | `caseName`、`caseNumber`、`cause`、`caseWord`、`partyA`、`partyB`、`handler`、`handlers` |
| 文书全文 | `docEditor.getContent()` 或 `currentContent` | HTML 字符串 |
| 当前指令 | 用户输入 | `instruction`（单点改写）/ `message`（结构化审查） |
| 个案知识库 | `polishCaseItem.files` / `materials` + `cfg.materialIds` | 材料名、内容（需后端按 ID 拉取原文） |
| 分步生成快照 | `cfg.stepsSnapshot` | `[{stepId, stepName, items, materialIds}]` |
| 案件阶段 | `cfg.caseStage` | `first` / `second` |
| 本案要件清单 | `loadCaseElementsAll()` | `{standard:[], mine:[], case:[]}`（每项含 `name`、`desc`、`question`、`source`） |
| 本案要件答案 | `loadElementAnswers(caseId)` | `{[要件名]: 答案}` |
| 要件追问记录 | `loadElementFollowUps(caseId)` | `{[要件名]: [{q, a}, ...]}` |
| 文书类型/模板 | `cfg.docType`、`cfg.template` | 如 `judgment` / `trial` |
| 原始指令 | `cfg.prompt` | 生成该文书时用户填写的指令（供 Agent 理解原始意图） |
| 模型 | `cfg.modelId` | 如 `qwen3.6`、`deepseek-v4` |

**关键约束**（来自项目记忆）：
- 个案知识库必须完整保留用户前期卷宗总结、要件填写等输出，避免仅带入全量卷宗导致用户前期操作成果丢失。
- Agent 上下文不仅包含选中局部片段，还需自动带入全量文书、个案知识库、结构化数据，避免改写内容与整体逻辑冲突。

---

## 3. 上下文组装规则

### 3.1 组装优先级与截断策略

模型上下文窗口有限（千问3.6：128K；DeepSeek v4：256K），按以下优先级组装，超限时从低优先级开始截断：

| 优先级 | 数据 | 截断策略 |
|--------|------|---------|
| P0（必带） | 用户当前指令 + 选中原文（单点改写）/ 文书全文（结构化审查） | 不截断 |
| P1（必带） | 本案要件清单 + 要件答案 | 不截断（量小） |
| P2（必带） | 分步生成快照 | 不截断（量小） |
| P3（推荐） | 原始生成指令 `cfg.prompt` | 不截断 |
| P4（按需） | 个案知识库材料 | 按 `cfg.materialIds` 顺序拉取，累计 token 超过模型上限的 40% 时停止 |
| P5（兜底） | 案件基础元数据 | 不截断 |

### 3.2 上下文 JSON 结构（发送给后端）

```json
{
  "mode": "rewrite | review",
  "caseId": "case1",
  "versionId": "v1_xxx",
  "instruction": "增加被告电话：12345678909",
  "checkItems": ["typo", "wording", "logic", "facts", "law_ref", "structure", "placeholder", "brevity"],
  "selectedText": "被告二：张三，男，1985年出生。",
  "documentContent": "<div>...全文HTML...</div>",
  "caseContext": {
    "caseName": "张三诉李四民间借贷纠纷案",
    "caseNumber": "(2024)粤01民初12345号",
    "cause": "民间借贷纠纷",
    "caseWord": "民初",
    "caseStage": "first",
    "partyA": "张三",
    "partyB": "李四"
  },
  "elements": {
    "standard": [{"name":"借款合意","desc":"...","question":"..."}],
    "mine": [],
    "case": [{"name":"被告联系方式","desc":"...","question":"..."}]
  },
  "elementAnswers": {
    "借款合意": "2023年5月签订借条，金额10万元",
    "被告联系方式": "12345678909"
  },
  "elementFollowUps": {
    "借款合意": [{"q":"借条签订地点？","a":"广州市天河区"}]
  },
  "stepsSnapshot": [
    {"stepId":"plaintiff","stepName":"原告诉请","items":["..."],"materialIds":["case1_file_1"]}
  ],
  "materials": [
    {"id":"case1_file_1","name":"起诉状_1.pdf","content":"...材料原文..."}
  ],
  "errorCases": [
    {"id":"EC-FACT-03","category":"事实认定类","title":"实际用款人识别错误","errorContent":"仅凭形式债权凭证认定借款主体……","detectionHints":["仅凭借条认定借款主体","未审查资金最终流向"]}
  ],
  "docType": "judgment",
  "template": "tpl_judgment_default",
  "originalPrompt": "支持原告全部诉请",
  "modelId": "qwen3.6"
}
```

**字段说明**：
- `mode`：必填，决定走哪个子 Agent
- `checkItems`：仅 `mode=review` 的文书评查触发时必带（预置检查项 ID 数组，见 5.4）；指令审查时为空数组或缺省。`checkItems` 非空时 `instruction` 可为空
- `selectedText`：仅 `mode=rewrite` 时必填，`mode=review` 可空
- `documentContent`：`mode=review` 必带全文；`mode=rewrite` 推荐带全文（满足"关联全案上下文"约束），超时可降级为仅带选中段落所在章节
- `materials`：后端按 `cfg.materialIds` + `stepsSnapshot[].materialIds` 合并去重后拉取，前端只传 ID 列表，内容由后端填充
- `errorCases`：v1.2 新增，**仅后端注入**（前端不传）——按 `caseContext.cause` 匹配错题集（5.6）的 Top-N 场景错误；无匹配时为空数组，优先级 P4 参与截断

---

## 4. 子 Agent A：单点改写（rewrite）

### 4.1 编排逻辑

```
用户选中文本 → 输入改写指令 → 点击发送
  ↓
[1] 上下文组装（mode=rewrite，selectedText + 全案上下文）
  ↓
[2] 调用单点改写 Agent（单轮，非流式或轻量流式）
  ↓
[3] 返回改写结果文本
  ↓
[4] 前端展示在改写卡片结果态
  ↓
[5] 用户选择：重写 / 复制 / 插入 / 替换原文
```

### 4.2 Agent 输入

- System Prompt：见 8.1
- User Content：上下文 JSON + 用户指令
- 输出：纯文本改写结果（非 JSON）

### 4.3 输出要求

- 直接输出改写后的文本，**不要**输出原文、不要输出说明文字、不要包裹 markdown 代码块
- 保留原文段落格式（如缩进、标点风格）
- 改写后的文本应可直接替换原文，无需二次处理

### 4.4 重写逻辑

用户点【重写】时，沿用同一指令重新调用 Agent，可设置 `temperature` 略高（0.7→0.8）以产生差异。

---

## 5. 子 Agent B：结构化审查（review）

### 5.1 编排逻辑（流式）

```
用户输入精修指令 → 点击发送
  ↓
[1] 上下文组装（mode=review，文书全文 + 全案上下文）
  ↓
[2] 调用结构化审查 Agent（流式 SSE）
  ├─ 阶段一：流式输出分析过程（4-6 步）
  ├─ 阶段二：流式输出修改建议卡片（N 条）
  └─ 阶段三：完成事件
  ↓
[3] 前端按 SSE 事件逐步渲染
  ↓
[4] 用户操作：定位原文 / 撤销 / 忽略 / 插入 / 全部插入 / 全部撤销
```

### 5.2 Agent 输入

- System Prompt：见 8.2
- User Content：上下文 JSON + 用户精修指令
- 输出：流式 JSON 分片（见 6.2 SSE 协议）

### 5.3 输出要求

- 分析过程：4-6 步，每步标题 + 内容，标题应**根据用户指令动态变化**（如指令涉及格式则生成"读取文书结构 / 识别格式异常 / 生成格式修正建议"；指令涉及改写则生成"梳理历史任务 / 明确用户需求 / 定位与检索 / 起草与完善"）
- 修改建议：1-5 条，每条包含 `id`、`title`、`risk`、`solution`、`originalAnchor`、`revisedText`、`cleanText`
- `originalAnchor` 必须是文书中**真实存在**的连续文本片段（≥10 字），用于前端 `findText` 定位
- `revisedText` 用 `<del>` 标记删除、`<ins>` 标记新增
- `cleanText` 是修订后的纯净文本（无 `<del>/<ins>` 标签），用于直接替换原文

### 5.4 文书评查模式（预置检查项，v1.1 新增）

#### 触发与交互

- 入口：右侧对话区上方【文书评查】按钮；点击后展开检查项勾选面板（默认全选），确认后发起 `mode=review` 请求，`checkItems` 携带勾选项，`instruction` 为空
- SSE 协议、卡片渲染、应用/撤销等交互与指令审查完全一致，前端无需新增渲染逻辑
- 评查结果按检查项归类展示：每条 `review_card` 携带 `checkItem` 字段（见 9.2），前端在卡片上显示检查项标签（如"错别字""法条引用"）

#### 预置检查项（v1.2 扩充为 10 项，**清单不锁定**）

> 产品决策：评查**不检查格式**（格式由文书生成阶段定义）、**不检查语气**（公文写作语气不作要求）。
> v1.2 决策：**检查项清单不锁定**——随业务理解持续增补，错题集（5.6）是检查清单的重要来源：每条场景错误可反哺为一个检查要点。结构上"结构完整性"属内容层提示（缺失部分可提示补充内容），与"不动排版格式"不冲突。

| 检查项 ID | 名称 | 检查内容 |
|-----------|------|---------|
| `typo` | 语言规范性 | 错别字、多字漏字、标点误用、**数字用法**（v1.2 补充：如主文金额大小写规范、日期汉字/阿拉伯数字用法） |
| `wording` | 法律用语规范 | 术语误用、称谓前后不一（原告/被告/上诉人混用）、口语化表述 |
| `facts` | 事实要素一致性 | 人名、金额、日期、案号等关键要素在全文前后是否一致（如查明段转账金额与借条金额矛盾）——**仅核对一致性问题并提示，不得建议改动事实认定本身** |
| `logic` | 逻辑一致性 | 说理与结论是否脱节、前后认定是否矛盾；**论述了但未判决 / 判决了但未论述的双向核对**（v1.2 补充，与 `claim_match` 联动） |
| `law_ref` | 法条引用完整性 | 实体论证是否有法条支撑、引用条文与案由是否匹配、条文号格式是否存疑；**本期不核验条文内容真实性**（不接法条库），仅做缺失/匹配/存疑提示 |
| `structure` | 结构要素完整性 | 按 docType 通行结构检查必备板块（v1.2 补充裁判文书六部分：**首部、事实、理由、裁判依据、裁判主文、尾部**缺一不可；标题/正文/落款三部齐全）；缺失时提示补充内容，不改排版 |
| `claim_match` | 诉请判项对应（v1.2 新增） | 生成"诉讼请求—判项"对照：逐项核对回应情况，发现**漏判、超判、判项与诉请表述错位**；只提示不代拟判项 |
| `placeholder` | 残留占位符检测 | `[待补充]`、`[XX]`、`XXX` 等未填充占位符残留 |
| `brevity` | 语句精简 | 重复冗余表述、可合并的重复信息 |
| `scene_risk` | 场景错误风险提示（v1.2 新增） | 依据错题集（5.6）按案由匹配的场景错误逐项比对；命中时输出**风险提示类建议**（只提示法官复核，不代改正文） |

#### 评查专属输出要求（在 8.2 Prompt 基础上叠加）

- 分析过程步骤标题按检查项动态生成（如"通读全文校对错字"→"核对事实要素一致性"→"检查法条引用"→"汇总评查建议"）
- 每条建议必须标注 `checkItem`，且不得输出所选检查项之外的建议
- **严禁输出格式类建议**（标题层级、对齐、缩进、字体等）与语气风格类建议
- **三条硬原则贯穿所有检查项**：事实零改动、法条引用逐字一致、主文与诉请对应——任何建议的 `cleanText` 均不得违反；`facts` / `claim_match` / `scene_risk` 三类建议以"提示复核"为主，不提供直接替换判项/事实认定的 `cleanText`
- 未发现问题时返回 `review_done`（total=0），不得为凑数输出低质量建议
- 建议数量上限仍为 5 条；超出时按风险优先级排序（**场景错误/事实矛盾 > 判项诉请不对应 > 法条缺失 > 结构缺项 > 文字问题**）

### 5.5 文书类型适配策略（v1.1 决策）

管理后台已维护文书类型（裁判文书、庭审提纲等），但**不维护类型规则**。适配不走"代码内置规则库"（太重），也不走"后台规则配置"（太累），而是：

- 评查/审查 Agent 的 System Prompt 中声明：根据输入的 `docType` + `template`，按该类法律文书的**通行写作规范与必备结构**自行调整评查重点（如裁判文书重说理与主文对应，庭审提纲重争议焦点与调查重点）
- Prompt 与 workflow 编排（分析步骤、检查项执行顺序）作为 Agent 配置独立维护，调优时改 Prompt/编排即可，不动代码与后台
- 若某类型评查效果不佳，优先通过 Few-shot 示例（8.3）补充该类型样例解决

### 5.6 裁判文书错题集机制（v1.2 新增）

#### 定位

错题集是**评查的领域知识来源**，不是规则库：以"案由 → 场景错误 → 错误内容/错误原因"组织，作为反面示例动态注入评查 Prompt，让 Agent 知道"这类案件最容易在哪里出错"。不需要训练模型，不需要后台配置。

#### 数据形态

- 首版数据：`docs/裁判文书常见错题集.json`（由用户提供的《判决书常见错误分类整理.docx》结构化而来，3 大类 13 条：事实认定类 4 条、法律适用类 5 条、程序违法类 4 条，覆盖刑事与民间借贷两大案由方向）
- 每条结构：`{id, category, causeTags[], title, errorContent, errorReasons[], detectionHints[]}`
- 维护方式：运营/业务同学直接维护 JSON（或由 docx 定期转换），不碰代码；法官【忽略】建议时选填的归因（§16）经人工确认后沉淀为新条目

#### 注入与使用规则

- 触发：`mode=review`（指令审查与文书评查均生效）；后端按 `caseContext.cause` 匹配 `causeTags`，取 Top-N（默认 ≤5 条）注入上下文 `errorCases` 字段（见 3.2），优先级 P4（按需，参与截断）
- 使用方式：Prompt 要求 Agent 逐条比对文书是否存在错题集描述的同类问题
- **命中时的输出约束（关键）**：错题集中的错误多为实体性问题（事实认定方法、法律适用、程序记载），命中时输出 `checkItem=scene_risk` 的**风险提示类建议**——`risk` 描述命中的场景错误，`solution` 写明"建议人工复核 XX"，**不提供直接替换事实认定/判项的 `cleanText`**（此时 `cleanText` 与原文一致，前端卡片显示"仅提示"角标，【插入】按钮置灰）
- 与"事实零改动"原则的关系：错题集让 Agent **发现**实体性风险，但**修改权始终在法官**——这正是"只改不创"边界的体现

#### 闭环

法官对建议的 应用/忽略（含归因） → 采纳率统计（§16 北极星指标） → 误报/漏报案例人工确认 → 沉淀回错题集 → 后续评查更准。错题集同时反哺检查项清单（5.4）的持续扩充。

---

## 6. SSE 事件流协议

替代现有 `setTimeout` mock（`document-polish.js:715-755 streamAnalysisSteps`、`case-files.js:3670-3793 startStreamingOutput`）。

### 6.1 事件类型

| 事件 | 触发时机 | payload | 前端处理 |
|------|---------|---------|---------|
| `analysis_start` | Agent 开始分析 | `{msgId}` | 显示"分析中..."占位 |
| `analysis_step` | 每个分析步骤完成 | `{msgId, index, title, content}` | 追加一个 `.review-step` |
| `analysis_done` | 所有分析步骤完成 | `{msgId, total}` | 折叠分析区，0.3s 后开始渲染修改建议 |
| `review_start` | 修改建议开始输出 | `{msgId, total}` | 渲染修改建议列表头部（批量操作按钮） |
| `review_card` | 每条修改建议完成 | `{msgId, index, review}` | 追加一个 `.review-card` |
| `review_done` | 所有修改建议输出完成 | `{msgId, total}` | 启用发送按钮，记录 `reviewMessages[msgId]` |
| `error` | 异常 | `{msgId, code, message}` | 显示错误提示，启用发送按钮 |

### 6.2 单点改写 Agent 事件流（轻量）

单点改写结果较短，可不流式，或仅发 `chunk` 事件：

| 事件 | payload |
|------|---------|
| `rewrite_start` | `{msgId}` |
| `rewrite_chunk` | `{msgId, text}`（可选，分片输出） |
| `rewrite_done` | `{msgId, text}`（完整结果） |
| `error` | `{msgId, code, message}` |

### 6.3 SSE 数据格式示例

```
event: analysis_step
data: {"msgId":"msg-1234567890","index":0,"title":"梳理历史任务","content":"本次为首次精修，无历史任务可参考。"}

event: analysis_step
data: {"msgId":"msg-1234567890","index":1,"title":"明确用户需求","content":"用户希望补充被告联系方式。"}

event: review_card
data: {"msgId":"msg-1234567890","index":0,"review":{"id":"r1","title":"被告信息缺少联系方式","risk":"...","solution":"...","originalAnchor":"被告二：张三，男，1985年出生。","revisedText":"...","cleanText":"..."}}
```

### 6.4 前端接入改造点

| 现有代码 | 改造为 |
|---------|--------|
| `mockReviewMessage(instruction)` | `callReviewAgent(contextJson)` → 返回 EventSource |
| `streamAnalysisSteps(msgId, payload.analysis, cb)` | 监听 `analysis_step` / `analysis_done` 事件 |
| `streamReviewCards(msgId, payload.reviews)` | 监听 `review_card` / `review_done` 事件 |
| `generateAiRewriteResult(text, instruction)` | `callRewriteAgent(contextJson)` → 监听 `rewrite_done` |

---

## 7. 工具 / 函数调用清单

### 7.1 前端 → 后端 API

| API | 方法 | 入参 | 出参 |
|-----|------|------|------|
| `/api/polish/rewrite` | POST | 上下文 JSON（mode=rewrite） | SSE 流（rewrite_*） |
| `/api/polish/review` | POST | 上下文 JSON（mode=review） | SSE 流（analysis_* / review_*） |
| `/api/polish/cancel` | POST | `{msgId}` | `{ok}`（取消正在进行的 Agent 调用） |

### 7.2 Agent → 内部工具（可选，未来扩展）

当前版本 Agent 不调用外部工具，所有上下文由前端组装传入。未来可扩展：

| 工具 | 用途 | 触发条件 |
|------|------|---------|
| `search_law` | 检索内部法规库 | 用户指令涉及法条补充 |
| `search_similar_case` | 检索类似案例 | 用户指令涉及类案参考 |
| `get_material_content` | 按材料 ID 拉取原文 | 上下文截断后需补充材料 |

---

## 8. Prompt 模板

### 8.1 单点改写 Agent（rewrite）System Prompt

```
你是一名专业的法律文书精修助手。你的任务是根据用户给出的改写指令，对用户选中的法律文书片段进行精准改写。

【输入说明】
- selectedText：用户在文书中选中的原文片段
- instruction：用户的改写指令（如"更正式一些"、"补充法条引用"、"精简表述"）
- caseContext：案件基础信息（案由、当事人等）
- elements：本案要件清单（含案由要件、我的要件、个案要件）
- elementAnswers：要件答案
- stepsSnapshot：分步生成快照（如适用）
- documentContent：文书全文（如提供，用于理解上下文逻辑）

【改写原则】
1. 严格按用户指令方向改写，不要自行扩展改写范围
2. 保留原文段落格式（缩进、标点风格、人称视角）
3. 改写后的文本应可直接替换原文，无需二次处理
4. 保留原文中的法条引用（《xxx》第x条第x款第x项）逐字不变——法律名称、条、款、项、目均不得增删改，除非用户指令明确要求修改
5. 保留原文中的当事人称谓（原告/被告/上诉人/被上诉人）不变
6. 如指令涉及补充信息（如电话、地址），从 elementAnswers 中查找，找不到时用占位符 [待补充] 标记
7. 【事实零改动·v1.2】不得新增、删减或改变原文的事实认定内容（时间、金额、行为经过、证据认定、当事人陈述的事实部分）；指令要求改动事实认定或判项实质内容时，拒绝改写并说明理由
8. 【主文禁区·v1.2】选中片段为判决主文（判项）时，仅允许文字表述层面优化，不得改变判项的给付内容、金额、期限、义务主体

【输出要求】
- 直接输出改写后的文本，不要输出原文、不要输出说明文字、不要包裹 markdown 代码块
- 不要输出"修改说明"、"改写理由"等元信息
- 输出内容将作为 {text} 字段返回前端
```

**User Prompt 模板**：

```
【改写指令】
{instruction}

【选中原文】
{selectedText}

【案件上下文】
案由：{caseContext.cause}
案号：{caseContext.caseNumber}
当事人：原告 {caseContext.partyA} / 被告 {caseContext.partyB}

【本案要件答案】
{JSON.stringify(elementAnswers)}

【文书全文】（如提供）
{documentContent}

请按指令改写选中原文，直接输出改写结果。
```

### 8.2 结构化审查 Agent（review）System Prompt

```
你是一名专业的法律文书审查助手。你的任务是根据用户给出的精修指令，对整篇法律文书进行结构化审查，输出"分析过程"和"修改建议"。

【输入说明】
- instruction：用户的精修指令（如"审查本院认为部分的逻辑"、"检查格式问题"、"补充法条引用"）
- documentContent：文书全文（HTML）
- caseContext：案件基础信息
- elements + elementAnswers：本案要件清单及答案
- stepsSnapshot：分步生成快照（如适用）
- originalPrompt：生成该文书时的原始指令（供理解原始意图）
- errorCases：本案由的常见场景错误（错题集反面示例，v1.2；可能为空）

【审查原则】
1. 修改建议必须基于用户指令方向，不要输出无关的修改点
2. 每条修改建议的 originalAnchor 必须是文书中真实存在的连续文本片段（≥10 字），用于前端定位
3. 每条修改建议必须同时提供修订版（revisedText，含 <del>/<ins> 标签）和清洁版（cleanText，无标签）
4. revisedText 中用 <del>红色删除</del> 标记删除内容，<ins>绿色高亮</ins> 标记新增内容
5. cleanText 是修订后的纯净文本，可直接替换原文
6. 修改建议数量 1-5 条，聚焦关键问题，不要追求面面俱到
7. 保留原文段落格式，仅修改文本内容
8. 【文书类型适配】根据 docType/template 按该类法律文书的通行规范与必备结构审查：裁判文书重点审查说理充分性、诉请与主文对应、法条适用；庭审提纲重点审查争议焦点归纳与调查重点完备性；其他类型按通行规范处理
9. 【禁区】不得输出格式类建议（标题层级、对齐、缩进、字体、行距等——格式由生成阶段定义，不属于精修范围），不得输出语气风格类建议
10. 【评查模式】当输入中 checkItems 非空（无用户指令）时，按所选检查项逐项评查，每条建议标注所属 checkItem；未发现问题时诚实返回 0 条建议，不得凑数
11. 【事实零改动·v1.2】任何建议的 cleanText 不得新增、删减或改变原案事实认定（时间、金额、行为经过、证据认定）；发现事实矛盾时指出"不一致"本身，修改方向由法官决定
12. 【法条逐字·v1.2】建议中引用原文已出现的法条时必须逐字（含条、款、项、目）；不得虚构条文内容；本期不核验条文真实性，仅提示缺失/匹配/存疑
13. 【主文诉请对应·v1.2】对照诉讼请求与判项，提示漏判、超判、表述错位；不代拟判项
14. 【错题集比对·v1.2】errorCases 非空时逐条比对文书是否存在同类问题；命中时输出 checkItem=scene_risk 的风险提示建议，solution 写明"建议人工复核"，cleanText 与原文一致（不代改），并引用对应错题集条目 id

【分析过程要求】
1. 输出 4-6 个分析步骤，每步含 title 和 content
2. 步骤标题应根据用户指令动态变化：
   - 指令涉及"改写/重写" → ["梳理历史任务","明确用户需求","定位与检索","起草与完善"]
   - 指令涉及"格式/排版" → ["读取文书结构","识别格式异常","生成格式修正建议","校对排版"]
   - 指令涉及"补充/增加" → ["梳理现有内容","明确补充方向","检索依据","生成补充建议"]
   - 其他通用 → ["梳理任务","明确需求","定位与检索","生成建议"]
3. 每步 content 不超过 50 字

【输出格式】
按 SSE 事件流分片输出：
- 先输出 4-6 个 analysis_step 事件
- 再输出 analysis_done 事件
- 然后输出 1-5 个 review_card 事件
- 最后输出 review_done 事件

【单条修改建议 JSON Schema】
{
  "id": "r1",
  "title": "修改点标题（不超过 20 字）",
  "risk": "风险概述（红色文字，说明现状问题）",
  "solution": "修改方案（蓝色文字，说明如何修改）",
  "originalAnchor": "原文中真实存在的连续片段（≥10 字）",
  "revisedText": "修订版，含 <del>删除</del> 和 <ins>新增</ins> 标签",
  "cleanText": "清洁版，无标签，可直接替换原文"
}
```

**User Prompt 模板**：

```
【精修指令】
{instruction}

【评查检查项】（仅文书评查触发时提供，此时【精修指令】为空）
{checkItems 对应的检查项名称与检查内容列表}

【案件上下文】
案由：{caseContext.cause}
案号：{caseContext.caseNumber}
当事人：原告 {caseContext.partyA} / 被告 {caseContext.partyB}
案件阶段：{caseContext.caseStage}

【本案要件答案】
{JSON.stringify(elementAnswers)}

【分步生成每步结果】
{JSON.stringify(stepsSnapshot)}

【原始生成指令】
{originalPrompt}

【文书全文】
{documentContent}

请按精修指令（或评查检查项）对文书进行结构化审查，按 SSE 事件流格式输出分析过程和修改建议。
```

### 8.3 Few-shot 示例（结构化审查）

```
【示例 1：指令"补充法条引用"】

analysis_step 1:
title: "梳理现有内容"
content: "已读取文书全文，定位到"本院认为"段落缺少法律依据引用。"

analysis_step 2:
title: "明确补充方向"
content: "用户希望补充法条引用，需匹配《民法典》相关条款。"

analysis_step 3:
title: "检索依据"
content: "已检索到《民法典》第六百七十九条（自然人借款合同）适用于本案。"

analysis_step 4:
title: "生成补充建议"
content: "生成 1 处修改建议，在"本院认为"段落补充法条引用。"

review_card 1:
{
  "id": "r1",
  "title": "本院认为部分缺少法律依据",
  "risk": "原文"本院认为"段落仅陈述事实，未引用具体法条，说理不充分，可能影响文书说服力。",
  "solution": "补充《中华人民共和国民法典》第六百七十九条引用，增强说理逻辑。",
  "originalAnchor": "本院认为，原告与被告之间存在借贷关系。",
  "revisedText": "本院认为，<del>原告与被告之间存在借贷关系</del>。<ins>根据《中华人民共和国民法典》第六百七十九条，自然人之间的借款合同自贷款人提供借款时成立。本案中，原告已通过银行转账向被告支付借款，双方借贷关系依法成立</ins>。",
  "cleanText": "本院认为，根据《中华人民共和国民法典》第六百七十九条，自然人之间的借款合同自贷款人提供借款时成立。本案中，原告已通过银行转账向被告支付借款，双方借贷关系依法成立。"
}
```

---

## 9. 输出 JSON Schema

### 9.1 单点改写输出

```json
{
  "type": "object",
  "properties": {
    "text": {
      "type": "string",
      "description": "改写后的文本，可直接替换原文"
    },
    "reason": {
      "type": "string",
      "description": "【预留·待定】一句话改写理由（≤50字）。产品决策待定，当前版本后端不返回、前端不展示；若后续启用，前端结果态折叠展示"
    }
  },
  "required": ["text"]
}
```

### 9.2 结构化审查输出（单条修改建议）

```json
{
  "type": "object",
  "properties": {
    "id": {
      "type": "string",
      "description": "修改点 ID，msgId 内唯一，如 r1、r2"
    },
    "title": {
      "type": "string",
      "description": "修改点标题，不超过 20 字",
      "maxLength": 20
    },
    "risk": {
      "type": "string",
      "description": "风险概述，说明现状问题"
    },
    "solution": {
      "type": "string",
      "description": "修改方案，说明如何修改"
    },
    "originalAnchor": {
      "type": "string",
      "description": "原文中真实存在的连续片段，≥10 字，用于前端 findText 定位",
      "minLength": 10
    },
    "revisedText": {
      "type": "string",
      "description": "修订版，含 <del>删除</del> 和 <ins>新增</ins> 标签"
    },
    "cleanText": {
      "type": "string",
      "description": "清洁版，无标签，可直接替换原文"
    },
    "checkItem": {
      "type": "string",
      "enum": ["typo", "wording", "facts", "logic", "law_ref", "structure", "claim_match", "placeholder", "brevity", "scene_risk"],
      "description": "【v1.1 新增】建议所属检查项 ID，仅文书评查触发时必填；指令审查时可空。前端用于在卡片上展示检查项标签"
    },
    "errorCaseId": {
      "type": "string",
      "description": "【v1.2 新增】checkItem=scene_risk 时必填，命中的错题集条目 id；前端用于展示来源"
    }
  },
  "required": ["id", "title", "risk", "solution", "originalAnchor", "revisedText", "cleanText"]
}
```

> **scene_risk / facts / claim_match 类建议的特例**（v1.2）：这三类以"提示复核"为主，`cleanText` 与原文一致、`revisedText` 无 del/ins 变更；前端识别到 cleanText 与原文相同时将【插入】按钮置灰，卡片显示"仅提示"角标。

### 9.3 错误返回

```json
{
  "type": "object",
  "properties": {
    "code": {
      "type": "string",
      "enum": ["CONTEXT_TOO_LONG", "INSTRUCTION_INVALID", "MODEL_ERROR", "ANCHOR_NOT_FOUND", "REJECT"]
    },
    "message": {
      "type": "string",
      "description": "用户可读的错误提示"
    }
  },
  "required": ["code", "message"]
}
```

错误码含义：
- `CONTEXT_TOO_LONG`：上下文超模型限制，需前端截断后重试
- `INSTRUCTION_INVALID`：指令为空或无法理解
- `MODEL_ERROR`：模型调用失败
- `ANCHOR_NOT_FOUND`：修改建议的 originalAnchor 在文书中找不到（前端兜底为光标处插入）
- `REJECT`：指令超出精修范围（如"重新写一份判决书"）

---

## 10. 状态机

### 10.1 单点改写状态机

```
[空闲] ──选中文本──> [工具条显示] ──点击系统改写──> [输入态]
                                                      │
                                                      ├──输入指令──> [生成中] ──成功──> [结果态]
                                                      │              │
                                                      │              └──失败──> [输入态]（保留指令）
                                                      │
                                                      └──点关闭/ESC──> [空闲]

[结果态] ──重写──> [生成中] ──成功──> [结果态]
[结果态] ──替换原文/插入──> [空闲]
[结果态] ──点关闭/ESC──> [空闲]
```

### 10.2 结构化审查状态机

```
[空闲] ──输入指令──> [分析中] ──analysis_step──> [分析中]（逐步追加）
                       │
                       ├──analysis_done──> [审查输出中] ──review_card──> [审查输出中]（逐步追加）
                       │                      │
                       │                      └──review_done──> [空闲]（启用发送按钮）
                       │
                       └──error──> [空闲]（显示错误，启用发送按钮）

[审查输出中] / [结果态] ──滚动页面──> 隐藏卡片（不中断 Agent）
```

---

## 11. 模型选型与参数

### 11.1 模型选型

沿用原型配置（`case-data.js:14-25 AI_MODELS`）：

| 模型 | ID | 上下文上限 | 适用场景 |
|------|-----|-----------|---------|
| 千问 3.6 | `qwen3.6` | 128K | 默认模型，单点改写、结构化审查均可 |
| DeepSeek v4 | `deepseek-v4` | 256K | 文书超长时（>100K token）切换 |

模型 ID 来自文书版本快照 `cfg.modelId`，精修时沿用生成该文书时的模型，不切换。

### 11.2 模型参数

沿用管理后台模型配置（`pages/admin/model-management.html`）：

| 参数 | 默认值 | 单点改写 | 结构化审查 |
|------|--------|---------|-----------|
| `temperature` | 0.7 | 0.7（首次）/ 0.8（重写时） | 0.5（追求稳定输出） |
| `maxTokens` | 4096 / 8192 | 2048（改写结果短） | 8192（含分析过程 + 多条建议） |
| `stream` | true | true（轻量流式） | true（必须流式） |
| `top_p` | 系统默认 | 不暴露 | 不暴露 |

---

## 12. 异常处理与熔断

### 12.1 异常场景

| 场景 | 处理 |
|------|------|
| 上下文超模型限制 | 后端返回 `CONTEXT_TOO_LONG`，前端按 P4 优先级截断材料后重试 |
| 模型调用超时（>60s） | 后端返回 `error` 事件，前端提示"精修超时，请重试" |
| 模型返回非法 JSON | 后端解析失败时返回 `error` 事件，前端提示"精修失败，请重试" |
| `originalAnchor` 在文书中找不到 | 前端兜底为光标处插入，提示"原文位置已变化，已插入到光标处" |
| 用户指令超出精修范围 | Agent 返回 `REJECT`，前端提示"该操作超出精修范围，请前往文书生成页重新生成" |
| SSE 连接中断 | 前端检测到断开后提示"连接中断，请重试"，启用发送按钮 |

### 12.2 熔断原则

遵循项目【异常熔断】铁律：
- Agent 调用失败**不自动重试**，直接返回错误并提示用户
- 连续 3 次失败时，前端禁用发送按钮 30s，提示"系统繁忙，请稍后重试"

### 12.3 本期明确不做的防护（v1.1 决策，含风险记录）

| 事项 | 决策 | 风险记录 |
|------|------|---------|
| 后置实体校验（金额/日期/人名/法条号 diff 比对） | **二期再做** | 本期依赖 Prompt 约束（8.1 原则 4/5），存在模型误改关键实体的低概率风险；上线前需用黄金测试集 T13 验证 |
| 长文书（全文 >128K）分段审查 | **暂不考虑** | 超长文书会触发 `CONTEXT_TOO_LONG`，用户需自行圈选局部审查；原型阶段文书量级暂可接受 |
| anchor 失效兜底增强（改为"仅提示不落盘"） | **暂不考虑**，保留"插入光标处"现行行为 | 存在插错位置隐患，已在文案上提示用户（"原文位置已变化，已插入到光标处"），二期再优化 |
| 建议"继续扫描"入口（突破 5 条上限） | **暂不考虑** | 评查建议以高风险优先排序（5.4），5 条外的问题本期不触达 |
| 信息缺失时 clarify 反问（替代 `[待补充]` 占位） | **暂不考虑**，保留占位符行为 | 占位符可被 `placeholder` 检查项在评查中兜底检出，风险可控 |

---

## 13. 前端接入改造清单

> 本节函数引用已对**新版** `document-polish.js`（1665 行）复核确认存在：`mockReviewMessage`、`streamAnalysisSteps`、`streamReviewCards`、`mockRewrite`、`generateAiRewriteResult`、`reviewMessages`、`applyReview`/`applyAllReviews`/`undoReview`/`undoAllReviews`/`ignoreReview`/`locateReview`，DocEditor 实例化（第 133 行）。

### 13.1 需替换的函数

| 文件 | 函数 | 改造为 |
|------|------|--------|
| `js/document-polish.js` | `mockReviewMessage(instruction)` | `callReviewAgent(contextJson)` 返回 EventSource |
| `js/document-polish.js` | `streamAnalysisSteps(msgId, analysis, cb)` | 监听 `analysis_step` / `analysis_done` 事件 |
| `js/document-polish.js` | `streamReviewCards(msgId, reviews)` | 监听 `review_card` / `review_done` 事件 |
| `js/document-polish.js` | `mockRewrite(text, instruction)` | `callRewriteAgent(contextJson)` 返回 EventSource |
| `js/document-polish.js` | `generateAiRewriteResult(text, instruction)` | 调用 `callRewriteAgent`，监听 `rewrite_done` |

### 13.2 需新增的函数

```js
// 组装上下文 JSON
function buildPolishContext(mode, instruction, selectedText, checkItems) {
    const cfg = polishVersion?.config || {};
    return {
        mode,
        caseId: polishCaseId,
        versionId: polishVersionId,
        instruction: instruction || '',
        checkItems: checkItems || [],          // v1.1：文书评查预置检查项
        selectedText: selectedText || '',
        documentContent: docEditor ? docEditor.getContent() : currentContent,
        caseContext: {
            caseName: polishCaseItem?.caseName,
            caseNumber: polishCaseItem?.caseNumber,
            cause: polishCaseItem?.cause,
            caseWord: polishCaseItem?.caseWord,
            caseStage: cfg.caseStage,
            partyA: polishCaseItem?.partyA,
            partyB: polishCaseItem?.partyB
        },
        elements: loadCaseElementsAll(),
        elementAnswers: loadElementAnswers(polishCaseId),
        elementFollowUps: loadElementFollowUps(polishCaseId),
        stepsSnapshot: cfg.stepsSnapshot,
        materialIds: cfg.materialIds,
        docType: cfg.docType,
        template: cfg.template,
        originalPrompt: cfg.prompt,
        modelId: cfg.modelId
    };
}

// 调用结构化审查 / 文书评查 Agent（SSE）
function callReviewAgent(contextJson) {
    return new EventSource('/api/polish/review', { method: 'POST', body: JSON.stringify(contextJson) });
}

// 调用单点改写 Agent（SSE）
function callRewriteAgent(contextJson) {
    return new EventSource('/api/polish/rewrite', { method: 'POST', body: JSON.stringify(contextJson) });
}
```

另需新增（v1.1 文书评查入口）：

| 类别 | 函数 / UI | 说明 |
|------|------|------|
| 评查入口 | 【文书评查】按钮 + 检查项勾选面板 | 新建 UI（对话区上方），确认后调 `callReviewAgent`（checkItems 非空、instruction 为空）；复用现有 review 卡片渲染，仅新增卡片上的检查项标签 |

### 13.3 需保留的现有逻辑

- `reviewMessages[msgId]` 状态管理（reviews / snapshotBeforeApply / appliedReviewIds）
- `applyReview` / `applyAllReviews` / `undoReview` / `undoAllReviews` / `ignoreReview` / `locateReview`
- `docEditor.findText` / `docEditor.replaceTextPreserveFormat` / `docEditor.insertTextAtCursor`
- 改写卡片的两态切换（输入态 / 结果态）
- 工具条显示/隐藏逻辑

### 13.4 需要后端配合的事项

- `/api/polish/review`、`/api/polish/rewrite`、`/api/polish/cancel` 三个接口（见 7.1）
- 后端按 `materialIds` + `stepsSnapshot[].materialIds` 合并去重拉取材料原文填充 `materials` 字段

---

## 14. 验收标准

| 编号 | 验收点 | 验证方法 |
|------|--------|---------|
| AC-1 | 单点改写：选中段落 → 输入指令 → 发送 → 1-3s 内返回改写结果 | 浏览器手动测试 |
| AC-2 | 单点改写：点【重写】沿用当前指令重新生成，结果有差异 | 浏览器手动测试 |
| AC-3 | 单点改写：点【替换原文】保留段落格式，高亮闪烁 0.8s | 浏览器手动测试 |
| AC-4 | 结构化审查：输入指令 → 流式展示分析过程（4-6 步，每步间隔 ~600ms） | 浏览器手动测试 |
| AC-5 | 结构化审查：分析完成后流式展示修改建议（1-5 条，每条间隔 ~300ms） | 浏览器手动测试 |
| AC-6 | 结构化审查：点【定位原文】高亮闪烁，找不到时按钮置灰 | 浏览器手动测试 |
| AC-7 | 结构化审查：点【插入】替换原文保留格式，卡片变绿显示"已应用" | 浏览器手动测试 |
| AC-8 | 结构化审查：【全部插入】依次应用所有未忽略建议，部分失败时提示汇总 | 浏览器手动测试 |
| AC-9 | 结构化审查：【全部撤销】恢复到该条消息操作前快照 | 浏览器手动测试 |
| AC-10 | 上下文组装：包含案件基础、要件清单、要件答案、stepsSnapshot、文书全文 | 抓包验证 |
| AC-11 | 上下文截断：材料 token 超模型上限 40% 时停止追加 | 抓包验证 |
| AC-12 | 异常熔断：模型超时返回 error 事件，前端提示并启用发送按钮 | 模拟超时 |
| AC-13 | 异常熔断：连续 3 次失败禁用发送按钮 30s | 模拟失败 |
| AC-14 | 拒绝策略：指令"重新写一份判决书"返回 REJECT，前端提示去文书生成页 | 手动测试 |
| AC-15 | 文书评查：点【文书评查】→ 默认全选检查项 → 流式输出分析过程与建议卡片，每条卡片带检查项标签 | 手动测试 |
| AC-16 | 文书评查禁区：评查结果中不出现格式类、语气类建议 | 手动测试 + 黄金测试集 |
| AC-17 | 文书类型适配：对裁判文书（judgment）与庭审提纲分别评查，评查重点随 docType 变化 | 黄金测试集 T05 + D3 |
| AC-18 | 无问题文书：评查返回 0 条建议，不凑数 | 黄金测试集 T09 |
| AC-19 | 黄金测试集回归：用例通过率 ≥ 90%，且安全用例必须通过 | 按《文书评查黄金测试集》第 5 节执行 |
| AC-20 | 三原则禁区：指令要求改动事实认定/判项实质内容时拒绝；任何建议的 cleanText 不改变事实、法条逐字保留 | 黄金测试集 T16/T17 + 手动测试 |
| AC-21 | 错题集注入：民间借贷案件评查时 errorCases 注入对应案由条目；命中场景错误输出 scene_risk 建议且【插入】置灰 | 黄金测试集 T19 + 抓包验证 |
| AC-22 | 诉请判项对应：claim_match 检出漏判/超判，只提示不代拟判项 | 黄金测试集 T18 |

---

## 15. 附录：与原型现有 mock 的映射关系

| 原型 mock（document-polish.js） | 真实 Agent 替换 |
|--------------------------------|----------------|
| `mockRewrite(text, instruction)` 返回 `{text, reason}` | `callRewriteAgent(context)` SSE 流；`reason` 字段当前不返回（v1.1 列为待定项，Schema 已预留，见 9.1 / 17.1） |
| `mockReviewMessage(instruction)` 返回 `{type, analysis, reviews}` | `callReviewAgent(context)` SSE 流，分片返回 analysis 和 reviews |
| `mockRewriteTemplate` / `mockFormatTemplate` / `mockSupplementTemplate` / `mockGenericTemplate` | 由 Agent 根据指令动态生成，不再走模板分发 |
| `streamAnalysisSteps` 用 setTimeout 800ms + 600ms | 监听 `analysis_step` 事件，由后端控制节奏 |
| `streamReviewCards` 用 setTimeout 300ms | 监听 `review_card` 事件，由后端控制节奏 |
| `generateAiRewriteResult` 用 setTimeout 700ms | 监听 `rewrite_done` 事件 |

---

## 16. 质量评估与黄金测试集（v1.1 新增，v1.2 升级北极星指标）

精修效果不能只看功能可用性，需建立质量评估机制：

### 16.1 北极星指标：AI 建议采纳率（v1.2）

法官频繁退回 AI 建议 = Agent 信任度崩塌。采纳率是本功能的**北极星指标**：

| 项 | 定义 |
|----|------|
| 口径 | 采纳率 = 应用数 ÷（应用 + 忽略 + 超时无操作）；撤销视为"应用后反悔"，单独统计为反悔率 |
| 维度 | 按消息 / 按用户 / 按检查项（checkItem）/ 按文书类型（docType）四维拆解 |
| 埋点 | 前端记录 `applyReview` / `ignoreReview` / `undoReview` / `applyAllReviews` 事件，连同 `msgId`、`checkItem`、`docType`、时间戳上报 |
| 告警线 | 周采纳率 < 50% 触发 Prompt / 检查项 / 错题集复盘；单检查项采纳率持续低于均值时考虑下线或改写该检查项 |
| 退回归因 | 法官点【忽略】时可选填原因（改得不对 / 不需要改 / 改得不好 / 其他），归因数据人工确认后沉淀为错题集"误报类"条目（5.6 闭环） |

### 16.2 其他质量机制

| 机制 | 内容 | 阶段 |
|------|------|------|
| 黄金测试集回归 | `docs/文书评查黄金测试集.md`：19 条用例（评查 12 条、改写 6 条、边界 1 条），含 8 处预埋缺陷的判决书样本 D1、无缺陷对照版 D2、庭审提纲样本 D3；Prompt/模型/检查项/错题集变更时执行，通过率 ≥ 90%，安全用例（T08/T13/T16）必过 | 本版启用 |
| 人工抽检 | 上线初期每周抽样 10 条精修结果人工评分（修改准确性 / 原意保持 / 可替换性） | 运营动作 |

---

## 17. 待定项与二期项汇总（v1.1 决策记录）

### 17.1 待定项（需产品后续决策）

| 项 | 现状 | 待决策内容 |
|----|------|-----------|
| 单点改写 `reason` 修改理由 | Schema 已预留可选字段（9.1），后端不返回、前端不展示 | 是否启用；启用后的展示形态（折叠面板 / hover） |
| 多轮会话记忆 `sessionHistory` | 上下文 JSON 预留扩展位，未实现 | 作用域（页面期间 / 跨会话）；已忽略建议是否回传 |
| 评查检查项清单 | v1.2 扩充为 10 项（5.4），已排除格式与语气 | **清单不锁定**（v1.2 决策）：随业务持续增补，错题集（5.6）反哺检查要点；各项具体措辞迭代优化 |
| 法条真实性核验 | v1.2 决策：本期不接法条检索库，`law_ref` 仅做缺失/匹配/存疑提示 | 二期是否接入法条库（fyopen-lawsearch / 北大法宝等）做条文内容核验 |

### 17.2 二期 / 暂缓项

| 项 | 决策 |
|----|------|
| 后置实体校验（金额/日期/人名/法条号 diff） | 二期 |
| 长文书（>128K）分段审查 | 暂缓，超长走 CONTEXT_TOO_LONG 提示 |
| 用户/机构自定义规则库 | 本版不涉及 |
| anchor 失效兜底增强（仅提示不落盘） | 暂缓，保留插入光标处 + 提示 |
| 建议"继续扫描"入口 | 暂缓 |
| clarify 反问机制（替代 [待补充]） | 暂缓 |
| 精修程度档位（light/medium/deep） | 废弃，不做 |

---

**文档结束**

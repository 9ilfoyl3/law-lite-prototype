# 文书精修 Agent 编写方案

> 版本：v1.0  ·  适用范围：文书精修页（`document-polish.html`）底层 Agent 实现
> 关联原型：`pages/document-polish.html`、`js/document-polish.js`
> 关联 PRD：`docs/V1.1版本PRD（人看）.md` 功能7「文书精修」
> 编写依据：原型现有数据结构、上下文来源、两类精修模式交互

---

## 0. 文档目的

本文档面向**后端 / 算法工程师**，定义文书精修场景下 Agent 的：
- 角色边界与能力清单
- 上下文组装规则（精修三卡片数据如何拼装为 Agent 输入）
- 两类精修模式的 Agent 编排逻辑
- 工具 / 函数调用清单
- SSE 事件流协议（替代现有 setTimeout mock）
- 状态机与异常熔断
- 模型选型与参数
- 具体Prompt 模板与输出 JSON Schema

**不包含**：法条链接识别（该能力在文书生成阶段完成，精修页仅做查看跳转）、文书生成 、要件总结。

---

## 1. Agent 角色定义

### 1.1 角色定位

| 维度 | 说明 |
|------|------|
| 角色 | 法律文书精修助手（Legal Document Polish Agent） |
| 输入 | 用户指令 + 文书全文 + 个案知识库 + 结构化数据（要件清单 + 分步生成快照） |
| 输出 | 结构化修改建议（含分析过程 + 修改点列表）或单点改写结果 |
| 边界 | **只改不创**——只对已生成文书做局部修改，不从头生成完整文书；不修改案件元数据；不调用外部法规检索（法条引用由文书生成阶段注入） |
| 拒绝策略 | 用户指令超出精修范围（如"重新写一份判决书"）时，返回 `reject` 事件并提示"该操作超出精修范围，请前往文书生成页重新生成" |

### 1.2 能力清单

Agent 支持两类精修模式，对应两个独立的子 Agent：

| 子 Agent | 触发入口 | 输入特征 | 输出形态 |
|---------|---------|---------|---------|
| **A. 单点改写 Agent**（`rewrite`） | 选中段落 → 点【系统改写】→ 输入指令 → 发送 | 局部原文片段（`selectedText`）+ 用户改写指令 | 单段改写结果文本 |
| **B. 结构化审查 Agent**（`review`） | 右侧对话框输入精修指令 → 发送 | 文书全文 + 用户精修指令 | 分析过程 + N 条结构化修改建议 |

两个子 Agent 共享上下文组装逻辑（见第 3 节），但 Prompt、输出 Schema、流式协议不同。

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
  "docType": "judgment",
  "template": "tpl_judgment_default",
  "originalPrompt": "支持原告全部诉请",
  "modelId": "qwen3.6"
}
```

**字段说明**：
- `mode`：必填，决定走哪个子 Agent
- `selectedText`：仅 `mode=rewrite` 时必填，`mode=review` 可空
- `documentContent`：`mode=review` 必带全文；`mode=rewrite` 推荐带全文（满足"关联全案上下文"约束），超时可降级为仅带选中段落所在章节
- `materials`：后端按 `cfg.materialIds` + `stepsSnapshot[].materialIds` 合并去重后拉取，前端只传 ID 列表，内容由后端填充

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
4. 保留原文中的法条引用（《xxx》第x条）不变，除非用户指令明确要求修改
5. 保留原文中的当事人称谓（原告/被告/上诉人/被上诉人）不变
6. 如指令涉及补充信息（如电话、地址），从 elementAnswers 中查找，找不到时用占位符 [待补充] 标记

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

【审查原则】
1. 修改建议必须基于用户指令方向，不要输出无关的修改点
2. 每条修改建议的 originalAnchor 必须是文书中真实存在的连续文本片段（≥10 字），用于前端定位
3. 每条修改建议必须同时提供修订版（revisedText，含 <del>/<ins> 标签）和清洁版（cleanText，无标签）
4. revisedText 中用 <del>红色删除</del> 标记删除内容，<ins>绿色高亮</ins> 标记新增内容
5. cleanText 是修订后的纯净文本，可直接替换原文
6. 修改建议数量 1-5 条，聚焦关键问题，不要追求面面俱到
7. 保留原文段落格式，仅修改文本内容

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

请按精修指令对文书进行结构化审查，按 SSE 事件流格式输出分析过程和修改建议。
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
    }
  },
  "required": ["id", "title", "risk", "solution", "originalAnchor", "revisedText", "cleanText"]
}
```

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

---

## 13. 前端接入改造清单

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
function buildPolishContext(mode, instruction, selectedText) {
    const cfg = polishVersion?.config || {};
    return {
        mode,
        caseId: polishCaseId,
        versionId: polishVersionId,
        instruction,
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

// 调用结构化审查 Agent（SSE）
function callReviewAgent(contextJson) {
    return new EventSource('/api/polish/review', { method: 'POST', body: JSON.stringify(contextJson) });
}

// 调用单点改写 Agent（SSE）
function callRewriteAgent(contextJson) {
    return new EventSource('/api/polish/rewrite', { method: 'POST', body: JSON.stringify(contextJson) });
}
```

### 13.3 需保留的现有逻辑

- `reviewMessages[msgId]` 状态管理（reviews / snapshotBeforeApply / appliedReviewIds）
- `applyReview` / `applyAllReviews` / `undoReview` / `undoAllReviews` / `ignoreReview` / `locateReview`
- `docEditor.findText` / `docEditor.replaceTextPreserveFormat` / `docEditor.insertTextAtCursor`
- 改写卡片的两态切换（输入态 / 结果态）
- 工具条显示/隐藏逻辑

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

---

## 15. 附录：与原型现有 mock 的映射关系

| 原型 mock（document-polish.js） | 真实 Agent 替换 |
|--------------------------------|----------------|
| `mockRewrite(text, instruction)` 返回 `{text, reason}` | `callRewriteAgent(context)` SSE 流，`reason` 字段废弃 |
| `mockReviewMessage(instruction)` 返回 `{type, analysis, reviews}` | `callReviewAgent(context)` SSE 流，分片返回 analysis 和 reviews |
| `mockRewriteTemplate` / `mockFormatTemplate` / `mockSupplementTemplate` / `mockGenericTemplate` | 由 Agent 根据指令动态生成，不再走模板分发 |
| `streamAnalysisSteps` 用 setTimeout 800ms + 600ms | 监听 `analysis_step` 事件，由后端控制节奏 |
| `streamReviewCards` 用 setTimeout 300ms | 监听 `review_card` 事件，由后端控制节奏 |
| `generateAiRewriteResult` 用 setTimeout 700ms | 监听 `rewrite_done` 事件 |

---

**文档结束**

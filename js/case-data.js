// ============ Shared Case Data ============
// v1.41 修复批量队列状态计数：updateBatchQueueTask 中 completed/failed 统计改为基于任务状态 'done' 与内部 failed 数量，避免状态不匹配
// v1.40 案件列表分页验证：新增 ensureExtraCases 函数，在 initCaseData 中幂等追加 28 个法院 mock 案件（case_extra_1~case_extra_28，覆盖民间借贷/交通事故/劳动争议/婚姻家事/房屋租赁/买卖合同/侵权责任/物业服务/信用卡纠纷/拆迁安置等案由），用于验证案件列表真实分页；不修改现有 case1~case10 数据
// v1.39 多承办人支持：① 案件对象新增 handlers 数组字段（字符串数组，存承办人姓名）；保留 handler 字段向后兼容（始终等于 handlers[0]）；② migrateDataIfNeeded 迁移旧数据 handler→handlers；③ 新增 getCaseHandlers/isCaseHandler 工具函数；④ initCaseData 幂等补全 handlers；用户侧「仅本人案件」筛选基于 isCaseHandler
// v1.38 修复文书版本迁移：旧文书若仅有 doc 级 content（无 versions 数组），迁移时自动封装为一个版本，避免 getAllDocumentVersions 返回空导致历史文书列表/重新配置回填失效
// v1.36 V1.1 数据结构升级：① 文件对象新增 parseStatus/errorType/parsedAt 字段（迁移时按 ocrStatus 推断 parseStatus，errorType 随机 mock）；② 案件 documents 数组新增 versionId/genMethod/source/createdBy/config 字段；DATA_VERSION 升至 1.17；新增 getParseStatus/getParseErrorLabel/getCaseParseStats/startMockParsing 工具函数；startMockParsing 上传后延时 2-3 秒随机转 success/error，通过 case-file-parse-updated 事件通知页面刷新
// v1.35 token 估算简化：AI_MODELS 新增千问3.6/DeepSeek v4 + deployed 字段；CONTEXT_SAFETY_RATIO 默认0.85且可配置；新增 estimateTextTokens 与 getDeployedModels
// v1.34 文书类型与要件新增启用/停用状态：mergeAdminDocTypes 跳过 enabled===false 的类型；filterElementsByCaseWord 过滤停用要件
// v1.33 文书模板移除 causes 字段：normalizeDocTemplates / mergeAdminDocTemplates / mergeMyDocTemplates 不再写入 causes；getFilteredDocTypeTemplates 不再按 cause 过滤
// v1.13 新增用户侧自定义支持：mergeMyDocTemplates 合并 myDocTemplates；getReqTemplates 追加 myPromptTemplates
// v1.12 文书模板数据结构升级（字符串→对象，关联文书类型）；新增 mergeAdminDocTemplates / getFilteredDocTypeTemplates / getTemplateName / getReqTemplates
// v1.11 将 getCurrentDocTypes / getDocTypeTemplates / formatNumber 等共享辅助函数下沉至本文件，供 cases / case-files / document-detail 共用

// ===== 模型上下文限制配置 =====
// v1.35: 新增千问3.6（128K）与 DeepSeek v4（256K），标记 deployed 字段；用户侧模型下拉仅展示 deployed=true
// 原 4 个通用模型保留作为历史兼容（deployed=false，不在用户侧展示）
const AI_MODELS = [
    { id: 'gpt4o-mini', name: '轻量模型', limit: 16000, deployed: false },
    { id: 'claude35-sonnet', name: '标准模型', limit: 32000, deployed: false },
    { id: 'gpt4o', name: '旗舰模型', limit: 128000, deployed: false },
    { id: 'claude3-opus', name: '长文本模型', limit: 200000, deployed: false },
    { id: 'qwen3.6', name: '千问 3.6', limit: 128000, deployed: true },
    { id: 'deepseek-v4', name: 'DeepSeek v4', limit: 256000, deployed: true }
];
const DEFAULT_MODEL_ID = 'qwen3.6';
const DEFAULT_SAFETY_RATIO = 0.85; // v1.35: 默认 85%（保留 15% 余量给系统提示、输出与指令）

// v1.35: 获取可配置的安全阈值（管理后台 model-management.html 配置，持久化 localStorage.aiTokenSafetyRatio）
function getSafetyRatio() {
    const stored = localStorage.getItem('aiTokenSafetyRatio');
    if (stored) {
        const r = parseFloat(stored);
        if (!isNaN(r) && r >= 0.8 && r <= 0.95) return r;
    }
    return DEFAULT_SAFETY_RATIO;
}

// v1.35: 按 workflow 的 modelId 获取模型；若无 modelId 回退到 DEFAULT_MODEL_ID
function getCurrentModelId() {
    return localStorage.getItem('ai_current_model') || DEFAULT_MODEL_ID;
}

// 获取当前登录用户名（用于案件创建人/承办人自动填充）
function getCurrentUserName() {
    return localStorage.getItem('currentUserName') || '当前用户';
}

// v1.39: 获取案件的承办人列表（优先 handlers 数组，回退兼容旧 handler 字段）
// 返回字符串数组；旧数据仅有 handler 时返回 [handler]，无承办人时返回 []
function getCaseHandlers(caseItem) {
    if (!caseItem) return [];
    if (Array.isArray(caseItem.handlers) && caseItem.handlers.length > 0) {
        return caseItem.handlers.filter(Boolean);
    }
    return caseItem.handler ? [caseItem.handler] : [];
}

// v1.39: 判断 userName 是否为该案件的承办人（用于用户侧「仅本人案件」筛选）
function isCaseHandler(caseItem, userName) {
    if (!caseItem || !userName) return false;
    return getCaseHandlers(caseItem).indexOf(userName) >= 0;
}

function getModelContextLimit(modelId) {
    const id = modelId || getCurrentModelId();
    const model = AI_MODELS.find(m => m.id === id);
    return model ? model.limit : AI_MODELS.find(m => m.id === DEFAULT_MODEL_ID).limit;
}

// v1.35: 安全上限 = 模型 limit × 可配置阈值
function getSafeContextLimit(modelId) {
    return Math.floor(getModelContextLimit(modelId) * getSafetyRatio());
}

// v1.35: 估算文本 token 数（用于模板正文与文书要求）
// 中文文本近似 1 字符 ≈ 1.5 tokens，英文 1 单词 ≈ 1.3 tokens；这里取简化值 1.5
function estimateTextTokens(text) {
    if (!text) return 0;
    return Math.ceil(String(text).length * 1.5);
}

// v1.35: 获取已部署模型列表（用户侧与 workflow 配置使用）
function getDeployedModels() {
    return AI_MODELS.filter(m => m.deployed);
}

// v1.35: 按 id 获取模型对象
function getModelById(id) {
    return AI_MODELS.find(m => m.id === id) || AI_MODELS.find(m => m.id === DEFAULT_MODEL_ID);
}

// v1.35: 获取业务系统对话模块默认模型（管理后台 model-management 配置）
function getChatModelByOrg(org) {
    try {
        const all = JSON.parse(localStorage.getItem('aiChatModelByOrg') || '{}');
        return all[org] || DEFAULT_MODEL_ID;
    } catch (e) {
        return DEFAULT_MODEL_ID;
    }
}

// v2.23 (任务 6.3/6.4): 获取批量文书队列允许个数（管理后台 settings 配置）
function getBatchQueueLimit() {
    try {
        const stored = localStorage.getItem('adminSystemConfig');
        if (stored) {
            const data = JSON.parse(stored);
            const limit = data.config && data.config.batchQueueLimit;
            if (limit && limit >= 1) return limit;
        }
    } catch (e) {}
    return 10; // 默认 10
}

// v2.23 (任务 6.3): 批量文书队列状态管理（localStorage 持久化）
function getBatchQueueState() {
    try {
        return JSON.parse(localStorage.getItem('batchQueueState') || '{"running":0,"completed":0,"failed":0,"tasks":[]}');
    } catch (e) {
        return { running: 0, completed: 0, failed: 0, tasks: [] };
    }
}

function saveBatchQueueState(state) {
    try {
        localStorage.setItem('batchQueueState', JSON.stringify(state));
    } catch (e) {
        console.error('[saveBatchQueueState] 失败:', e);
    }
}

// v1.41: 页面加载时清理异常挂起的批量任务（页面刷新/关闭会导致 running 任务无法自动完成，避免阻塞后续提交）
function cleanupBatchQueueState() {
    const state = getBatchQueueState();
    let changed = false;
    state.tasks = state.tasks.map(t => {
        if (t.status === 'running' || t.status === 'pending') {
            changed = true;
            const results = (t.results || []).map(r => ({
                ...r,
                status: r.status === 'done' ? 'done' : 'failed',
                failReason: r.status === 'done' ? (r.failReason || '') : (r.failReason || '任务中断，请重新提交')
            }));
            const completedCount = results.filter(r => r.status === 'done').length;
            const failedCount = results.filter(r => r.status === 'failed').length;
            return {
                ...t,
                status: 'done',
                results,
                completedCount,
                failedCount,
                finishedAt: t.finishedAt || new Date().toISOString()
            };
        }
        return t;
    });
    if (changed) {
        state.running = state.tasks.filter(t => t.status === 'running' || t.status === 'pending').length;
        state.completed = state.tasks.filter(t => t.status === 'done' && (t.failed || 0) === 0).length;
        state.failed = state.tasks.filter(t => t.status === 'done' && (t.failed || 0) > 0).length;
        saveBatchQueueState(state);
    }
}

function getBatchQueueRunningCount() {
    const state = getBatchQueueState();
    // 基于任务实际状态计算运行中数量，避免 state.running 脏数据导致队列误判
    return state.tasks.filter(t => t.status === 'running' || t.status === 'pending').length;
}

function addBatchQueueTask(task) {
    const state = getBatchQueueState();
    state.tasks.unshift(task);
    if (state.tasks.length > 50) state.tasks = state.tasks.slice(0, 50); // 最多保留 50 条记录
    state.running = (state.running || 0) + 1;
    saveBatchQueueState(state);
}

function updateBatchQueueTask(taskId, updates) {
    const state = getBatchQueueState();
    const task = state.tasks.find(t => t.id === taskId);
    if (task) {
        Object.assign(task, updates);
        // 重新计算计数（批量任务完成状态统一为 'done'，内部结果状态区分 success/failed）
        state.running = state.tasks.filter(t => t.status === 'running' || t.status === 'pending').length;
        state.completed = state.tasks.filter(t => t.status === 'done' && (t.failed || 0) === 0).length;
        state.failed = state.tasks.filter(t => t.status === 'done' && (t.failed || 0) > 0).length;
        saveBatchQueueState(state);
    }
}

// ===== 材料分类配置 =====
const MATERIAL_CATEGORIES = {
    '起诉/立案材料': ['起诉', '立案', '诉状', '诉讼请求'],
    '证据材料': ['证据', '证明', '材料', '照片'],
    '庭审材料': ['笔录', '庭审', '开庭'],
    '送达材料': ['送达', '传票', '通知'],
    '身份材料': ['身份证', '执照', '证件', '户籍', '护照'],
    '文书/判决书': ['判决', '裁定', '决定', '文书', '调解'],
    '其他材料': []
};

function getMaterialCategoryNames() {
    return Object.keys(MATERIAL_CATEGORIES);
}

// 估算单个文件的 token 数；已有 estimatedTokens 则直接使用，否则按文件名长度与大小做简单估算
function estimateFileTokens(file) {
    if (file && typeof file.estimatedTokens === 'number' && file.estimatedTokens > 0) {
        return file.estimatedTokens;
    }
    const namePart = file && file.name ? file.name.length : 0;
    // 按 1KB ≈ 250 tokens（中文文本近似）做兜底估算，避免随机 size 过大导致失真
    const sizePart = file && file.size ? Math.floor(file.size / 1024 * 0.25) : 0;
    return Math.max(300, Math.min(5000, namePart + sizePart));
}

// 数字千分位格式化
function formatNumber(num) {
    if (num === undefined || num === null) return '0';
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// 获取当前业务系统下的文书类型
function getCurrentDocTypes() {
    const current = getCurrentBusiness();
    return Object.assign({}, defaultDocTypesByOrg[currentBusiness] || {}, current.docTypes || {});
}

// v1.21: 获取合并管理后台自定义后的文书类型映射（供 admin/my-* 页面统一读取）
// 返回 {key: {name, icon, isBuiltin, templates?}}
function getAdminDocTypes(org) {
    const defaults = defaultDocTypesByOrg[org] || {};
    let customs = {};
    try {
        const all = JSON.parse(localStorage.getItem('adminDocTypes')) || {};
        customs = all[org] || {};
    } catch (e) {
        console.error('[case-data] getAdminDocTypes 读取 adminDocTypes 失败:', e);
    }
    const result = {};
    // 内置类型
    Object.entries(defaults).forEach(([key, cfg]) => {
        result[key] = {
            name: cfg.name || key,
            icon: cfg.icon || 'fa-folder',
            isBuiltin: true,
            templates: cfg.templates || []
        };
    });
    // 自定义覆盖（整体覆盖同名内置 key）
    Object.entries(customs).forEach(([key, cfg]) => {
        if (cfg && typeof cfg === 'object') {
            result[key] = {
                name: cfg.name || key,
                icon: cfg.icon || 'fa-folder',
                isBuiltin: false
            };
        }
    });
    return result;
}

// 根据文书类型获取可用模板（反查：遍历所有模板，取 docType 匹配的）
// v1.21: 不再依赖 type.templates 数组，改为反查模板自身 docType 字段
function getDocTypeTemplates(docTypeKey) {
    const types = getCurrentDocTypes();
    if (!types[docTypeKey]) return {};
    const allTemplates = getCurrentTemplates();
    const filtered = {};
    Object.entries(allTemplates).forEach(([key, tpl]) => {
        if (tpl && tpl.docType === docTypeKey) {
            filtered[key] = tpl;
        }
    });
    return filtered;
}

// ============ v1.22: workflow 配置（挂在文书类型下）============
// v1.28: workflow 扩展为节点流程，新增 type 字段：'step'=分步型 | 'material'=材料型
// v1.32: workflow id 改为下拉框（数据来自 agentflow 平台 mock）；新增 causes 字段；
//        移除 steps 字段（节点序列由 agentflow 平台内部决定）
// 数据持久化：localStorage.adminWorkflows（按业务系统分组）
// 结构：{ [org]: { [docTypeKey]: [{id, name, type, caseWords, causes, isBuiltin}] } }

// v1.32: agentflow 平台 workflow 列表 mock（正式接入时替换为接口调用）
// 模拟 agentflow 平台已编排的 workflow，管理后台从中下拉选择
const agentflowWorkflowList = [
    { id: 'wf-judgment-1st', name: '一审民事判决', description: '一审普通程序民事判决书生成流程' },
    { id: 'wf-judgment-2nd', name: '二审民事判决', description: '二审民事判决书生成流程' },
    { id: 'wf-judgment-simple', name: '简易程序判决', description: '简易程序民事判决书生成流程' },
    { id: 'wf-judgment-ruling', name: '民事裁定', description: '民事裁定书生成流程' },
    { id: 'wf-judgment-mediation', name: '民事调解', description: '民事调解书生成流程' },
    { id: 'wf-trial-outline', name: '庭审提纲', description: '庭审提纲生成流程' },
    { id: 'wf-court-investigation', name: '法庭调查提纲', description: '法庭调查提纲生成流程' },
    { id: 'wf-execution-notice', name: '执行通知书', description: '执行通知书生成流程' },
    { id: 'wf-property-report', name: '财产报告令', description: '财产报告令生成流程' },
    { id: 'wf-service-notice', name: '送达回证', description: '送达回证生成流程' },
    { id: 'wf-prosecution-indictment', name: '起诉书', description: '起诉书生成流程' },
    { id: 'wf-prosecution-decision', name: '不起诉决定', description: '不起诉决定书生成流程' },
    { id: 'wf-reconsideration-decision', name: '行政复议决定', description: '行政复议决定书生成流程' },
    { id: 'wf-material-summary', name: '材料总结', description: '材料总结生成流程' },
    { id: 'wf-judgment-direct', name: '裁判文书-直接生成', description: '裁判文书直接生成流程（无人工交互节点）' },
    { id: 'wf-trial-direct', name: '庭审提纲-直接生成', description: '庭审提纲直接生成流程' },
    { id: 'wf-execution-direct', name: '执行文书-直接生成', description: '执行文书直接生成流程' },
    { id: 'wf-prosecution-direct', name: '检察文书-直接生成', description: '检察文书直接生成流程' },
    { id: 'wf-reconsideration-direct', name: '行政复议-直接生成', description: '行政复议文书直接生成流程' },
    { id: 'wf-material-summary-direct', name: '材料总结-直接生成', description: '材料总结直接生成流程' }
];

// 获取当前业务系统下某文书类型的 workflow 列表（合并内置 + 自定义）
// typeFilter: 'step' | 'material' | undefined（不过滤）
// 返回数组：[{id, name, type, caseWords, causes, isBuiltin}]
// v1.37 (V1.1.10): 内置默认仅 1 个"一步生成型" workflow（全兜底），不生成内置分步型
//                  （分步型由前端 stepConfigsByOrg 硬编码提供，仅裁判文书有）
function getWorkflowsForDocType(org, docTypeKey, typeFilter) {
    // 1. 取内置 workflow（仅一步生成型，全兜底）
    // v1.35: 内置 workflow 默认使用 DEFAULT_MODEL_ID（千问3.6）
    const builtins = [];
    builtins.push({
        id: 'wf-' + docTypeKey + '-material-default',
        name: '默认',
        type: 'material',
        caseWords: [],
        causes: [],
        modelId: DEFAULT_MODEL_ID,
        isBuiltin: true
    });
    // 2. 取自定义 workflow（localStorage.adminWorkflows）
    let customs = [];
    try {
        const all = JSON.parse(localStorage.getItem('adminWorkflows')) || {};
        const orgData = all[org] || {};
        customs = orgData[docTypeKey] || [];
    } catch (e) {
        console.error('[case-data] getWorkflowsForDocType 读取 adminWorkflows 失败:', e);
    }
    // 3. 合并：自定义存在时整体覆盖内置
    let result;
    if (customs.length > 0) {
        // v1.32: 兼容旧数据——无 type 字段按 'step' 处理；补全 causes 字段；steps 字段保留但不再使用
        result = customs.map(wf => {
            const type = wf.type || 'step';
            return {
                ...wf,
                type: type,
                causes: Array.isArray(wf.causes) ? wf.causes : []
            };
        });
    } else {
        result = builtins;
    }
    // v1.28: 按类型过滤
    if (typeFilter) {
        return result.filter(wf => (wf.type || 'step') === typeFilter);
    }
    return result;
}

// v1.32: 通用 workflow 匹配函数（按案字+案由双维度，5 级优先级）
// 匹配规则优先级：
//   1. 案字 + 案由 双精确匹配
//   2. 案字精确 + 案由兜底（causes=[]）
//   3. 案字兜底（caseWords=[]）+ 案由精确
//   4. 案字兜底 + 案由兜底（全兜底）
//   5. 第一个同类型 workflow
function matchWorkflowByCaseWordAndCause(workflows, caseWord, cause) {
    if (!workflows || workflows.length === 0) return null;
    const hasCaseWord = !!caseWord;
    const hasCause = !!cause;
    // 1. 案字 + 案由 双精确
    if (hasCaseWord && hasCause) {
        const matched = workflows.find(wf =>
            Array.isArray(wf.caseWords) && wf.caseWords.indexOf(caseWord) >= 0
            && Array.isArray(wf.causes) && wf.causes.indexOf(cause) >= 0
        );
        if (matched) return matched;
    }
    // 2. 案字精确 + 案由兜底
    if (hasCaseWord) {
        const matched = workflows.find(wf =>
            Array.isArray(wf.caseWords) && wf.caseWords.indexOf(caseWord) >= 0
            && (!Array.isArray(wf.causes) || wf.causes.length === 0)
        );
        if (matched) return matched;
    }
    // 3. 案字兜底 + 案由精确
    if (hasCause) {
        const matched = workflows.find(wf =>
            (!Array.isArray(wf.caseWords) || wf.caseWords.length === 0)
            && Array.isArray(wf.causes) && wf.causes.indexOf(cause) >= 0
        );
        if (matched) return matched;
    }
    // 4. 全兜底
    const fallback = workflows.find(wf =>
        (!Array.isArray(wf.caseWords) || wf.caseWords.length === 0)
        && (!Array.isArray(wf.causes) || wf.causes.length === 0)
    );
    if (fallback) return fallback;
    // 5. 第一个
    return workflows[0];
}

// 根据案字+案由匹配【分步生成型】workflow，返回其 steps 数组
// v1.32: 匹配规则升级为案字+案由双维度；steps 字段保留兼容（旧数据），新数据无 steps 时回退到 stepConfigsByOrg
// v1.36: stepConfigsByOrg 支持按案字分组（对象结构），由 resolveStepsByCaseWord 解析
//   - entry 为数组时直接返回（兼容旧结构）
//   - entry 为对象时按 caseWord 精确匹配，未命中取 default，再未命中取第一个非空数组
function resolveStepsByCaseWord(entry, caseWord) {
    if (Array.isArray(entry)) return entry;
    if (!entry || typeof entry !== 'object') return [];
    if (caseWord && Array.isArray(entry[caseWord]) && entry[caseWord].length > 0) {
        return entry[caseWord];
    }
    if (Array.isArray(entry.default) && entry.default.length > 0) return entry.default;
    const firstKey = Object.keys(entry).find(k => Array.isArray(entry[k]) && entry[k].length > 0);
    return firstKey ? entry[firstKey] : [];
}

function getStepsConfigForDocType(docTypeKey, caseWord, cause) {
    const org = (typeof currentBusiness !== 'undefined') ? currentBusiness : 'court';
    const workflows = getWorkflowsForDocType(org, docTypeKey, 'step');
    if (workflows.length === 0) {
        // 回退到内置 stepConfigsByOrg（按案字解析）
        const fallback = (typeof stepConfigsByOrg !== 'undefined'
            && stepConfigsByOrg[org]
            && stepConfigsByOrg[org][docTypeKey]) || [];
        return resolveStepsByCaseWord(fallback, caseWord);
    }
    const matched = matchWorkflowByCaseWordAndCause(workflows, caseWord, cause);
    if (matched && Array.isArray(matched.steps) && matched.steps.length > 0) {
        return matched.steps;
    }
    // v1.32: workflow 无 steps 字段时回退到内置 stepConfigsByOrg（节点序列由 agentflow 平台提供，前端 mock 仍用内置）
    const fallback = (typeof stepConfigsByOrg !== 'undefined'
        && stepConfigsByOrg[org]
        && stepConfigsByOrg[org][docTypeKey]) || [];
    return resolveStepsByCaseWord(fallback, caseWord);
}

// 统计某文书类型下的 workflow 数量（供管理后台表格显示）
function countWorkflowsForDocType(org, docTypeKey) {
    return getWorkflowsForDocType(org, docTypeKey).length;
}

// v1.22/v1.32: 根据案字+案由匹配【分步生成型】workflow 对象，用于用户侧"步骤方案"下拉默认选中
function getWorkflowByCaseWord(org, docTypeKey, caseWord, cause) {
    const workflows = getWorkflowsForDocType(org, docTypeKey, 'step');
    if (workflows.length === 0) return null;
    return matchWorkflowByCaseWordAndCause(workflows, caseWord, cause);
}

// v1.28/v1.32: 根据案字+案由匹配【直接生成型】workflow 对象，用于用户侧材料生成 tab 流程选择
// 用户侧不暴露此匹配，仅用于内部流程选择
function getMaterialWorkflowByCaseWord(org, docTypeKey, caseWord, cause) {
    const workflows = getWorkflowsForDocType(org, docTypeKey, 'material');
    if (workflows.length === 0) return null;
    return matchWorkflowByCaseWordAndCause(workflows, caseWord, cause);
}

// v1.35: 获取匹配 workflow 的使用模型 id（供用户侧 case-files.js token 估算使用）
// 按生成方式 + 案字 + 案由匹配 workflow，返回其 modelId；无匹配时回退 DEFAULT_MODEL_ID
function getWorkflowModelId(org, docTypeKey, caseWord, cause, genMethod) {
    const typeFilter = genMethod === 'material' ? 'material' : 'step';
    const workflows = getWorkflowsForDocType(org, docTypeKey, typeFilter);
    if (workflows.length === 0) return DEFAULT_MODEL_ID;
    const matched = matchWorkflowByCaseWordAndCause(workflows, caseWord, cause);
    return (matched && matched.modelId) ? matched.modelId : DEFAULT_MODEL_ID;
}

// v1.17: docTemplates 数据结构升级——把字符串值统一转为对象 {name, docType, content}
// v1.24: 反查表改用 defaultDocTypesByOrg（保留原始 templates 数组），避免 system.docTypes
//        被 mergeAdminDocTypes 覆盖后丢失 templates 导致内置模板 docType 补全失败
// v1.33: 移除 causes 字段——模板不再单独维护案由关联，作为所属文书类型的下属
//        localStorage 旧数据中的 causes 字段保留不删，运行时不再读取或写入
function normalizeDocTemplates(org, system) {
    if (!system.docTemplates) return;
    // 用 defaultDocTypesByOrg 构建 docType key → 模板 key 的反查表
    const templateToDocType = {};
    Object.entries(defaultDocTypesByOrg[org] || {}).forEach(([typeKey, typeCfg]) => {
        (typeCfg.templates || []).forEach(tplKey => {
            templateToDocType[tplKey] = typeKey;
        });
    });
    Object.entries(system.docTemplates).forEach(([key, val]) => {
        if (typeof val === 'string') {
            system.docTemplates[key] = {
                name: val,
                docType: templateToDocType[key] || '',
                content: ''
            };
        } else if (val && typeof val === 'object') {
            // 兼容对象结构，补全缺失字段
            if (val.name === undefined) val.name = key;
            if (!val.docType) val.docType = templateToDocType[key] || '';
            if (val.content === undefined) val.content = '';
            // v1.33: 不再写入 causes 字段；旧数据中的 causes 字段保留不删
        }
    });
}

// 合并管理后台自定义模板（localStorage.adminDocTemplates）
// v1.23: 支持 enabled 状态控制；内置模板停用记录于 __builtinDisabled__ 数组
function mergeAdminDocTemplates(org, system) {
    try {
        const adminData = JSON.parse(localStorage.getItem('adminDocTemplates')) || {};
        const custom = adminData[org] || {};

        // 处理内置模板停用：从 system.docTemplates 中删除被停用的内置 key
        const builtinDisabled = Array.isArray(custom.__builtinDisabled__) ? custom.__builtinDisabled__ : [];
        builtinDisabled.forEach(key => {
            if (system.docTemplates[key]) {
                delete system.docTemplates[key];
            }
        });

        // 合并自定义模板（跳过 __builtinDisabled__ 元数据 key 和已停用的项）
        Object.entries(custom).forEach(([key, val]) => {
            if (key === '__builtinDisabled__') return;
            if (val && typeof val === 'object' && val.enabled !== false) {
                system.docTemplates[key] = {
                    name: val.name || key,
                    docType: val.docType || '',
                    content: val.content || ''
                };
            }
        });
    } catch (e) {
        console.error('[case-data] mergeAdminDocTemplates 失败:', e);
    }
}

// v1.13: 合并用户侧自定义模板（localStorage.myDocTemplates）
// key 加 my- 前缀避免与 admin/内置冲突；标记 source='mine' 供 UI 加「我的」标识
// v1.23: 过滤掉 enabled === false 的已停用项
// v1.33: 不再写入 causes 字段；旧数据中的 causes 字段保留不删
function mergeMyDocTemplates(org, system) {
    try {
        const myData = JSON.parse(localStorage.getItem('myDocTemplates')) || {};
        const my = myData[org] || {};
        Object.entries(my).forEach(([key, val]) => {
            if (val && typeof val === 'object' && val.enabled !== false) {
                system.docTemplates['my-' + key] = {
                    name: val.name || key,
                    docType: val.docType || '',
                    content: val.content || '',
                    source: 'mine'
                };
            }
        });
    } catch (e) {
        console.error('[case-data] mergeMyDocTemplates 失败:', e);
    }
}

// v1.60 (V1.1.2): 读取管理后台配置的 workflow 文书格式约束（格式骨架）
// 数据来源：localStorage.adminWorkflowFormats = { [org]: { [workflowId]: { content, fileName, updatedAt } } }
// 返回 { content, fileName, updatedAt } 或 null（未配置/空内容时）
// 用户侧 case-files.js 文书生成第二步「套格式骨架」时调用
function getAdminWorkflowFormat(org, workflowId) {
    if (!org || !workflowId) return null;
    try {
        const allData = JSON.parse(localStorage.getItem('adminWorkflowFormats')) || {};
        const orgData = allData[org] || {};
        const f = orgData[workflowId];
        if (!f || typeof f !== 'object') return null;
        if (!(f.content || '').trim()) return null;
        return {
            content: f.content,
            fileName: f.fileName || '',
            updatedAt: f.updatedAt || ''
        };
    } catch (e) {
        console.error('[case-data] getAdminWorkflowFormat 失败:', e);
        return null;
    }
}
// 暴露为全局，供 case-files.js 直接调用
window.getAdminWorkflowFormat = getAdminWorkflowFormat;

// v1.21: 合并管理后台自定义文书类型（localStorage.adminDocTypes）
// 覆盖语义：adminDocTypes[org][key] 整体覆盖 defaultDocTypesByOrg[org][key]
// v1.9: 不再复制 icon 字段
// v1.34: 启用/停用状态——enabled === false 的类型在用户侧不展示（从 system.docTypes 中删除以覆盖内置默认）
function mergeAdminDocTypes(org, system) {
    try {
        const all = JSON.parse(localStorage.getItem('adminDocTypes')) || {};
        const customs = all[org] || {};
        Object.entries(customs).forEach(([key, cfg]) => {
            if (cfg && typeof cfg === 'object') {
                if (cfg.enabled === false) {
                    // 停用：从 system.docTypes 中删除（覆盖内置默认，用户侧不可见）
                    delete system.docTypes[key];
                } else {
                    // 启用或默认：覆盖同名内置 key（保留原 key，name 用自定义值）
                    system.docTypes[key] = {
                        name: cfg.name || key
                        // 注意：不保留 templates 数组，模板归属由模板自身 docType 决定
                    };
                }
            }
        });
    } catch (e) {
        console.error('[case-data] mergeAdminDocTypes 失败:', e);
    }
}

// 根据文书类型获取可用模板
// v1.33: 移除按 cause 过滤的逻辑——模板作为所属文书类型的下属，案由匹配通过文书类型→workflow 链路间接实现
// 保留 cause 参数签名以减少调用方变更，运行时忽略该参数
function getFilteredDocTypeTemplates(docTypeKey, cause) {
    return getDocTypeTemplates(docTypeKey);
}

// 获取模板显示名（兼容字符串和对象结构）
function getTemplateName(tpl) {
    if (!tpl) return '';
    if (typeof tpl === 'string') return tpl;
    return tpl.name || '';
}

// v1.13: 获取「文书要求」文书要求模板
// 优先级：管理后台 adminPromptTemplates（为空回退默认） + 用户侧 myPromptTemplates（追加，标记 source='mine'）
// v1.23: 过滤掉 enabled === false 的项；内置文书要求停用记录于 __builtinDisabled__ 字典
function getReqTemplates(org, docTypeKey) {
    // 基础数据：admin 或默认
    let base = [];
    let useDefault = false;
    try {
        const adminData = JSON.parse(localStorage.getItem('adminPromptTemplates')) || {};
        const orgData = adminData[org];
        if (orgData && Array.isArray(orgData[docTypeKey]) && orgData[docTypeKey].length > 0) {
            // admin 数据存在：过滤掉 enabled === false 的项
            base = orgData[docTypeKey].filter(p => !p || p.enabled !== false);
        } else {
            useDefault = true;
        }
    } catch (e) {
        console.error('[case-data] getReqTemplates 读取 adminPromptTemplates 失败:', e);
        useDefault = true;
    }
    if (useDefault) {
        const defaults = (defaultRequirementTemplates[org] && defaultRequirementTemplates[org][docTypeKey]) || [];
        base = defaults.slice();
        // 内置文书要求停用：读取 __builtinDisabled__ 字典，过滤对应 index
        try {
            const adminData = JSON.parse(localStorage.getItem('adminPromptTemplates')) || {};
            const orgData = adminData[org] || {};
            const disabledMap = (orgData.__builtinDisabled__ && typeof orgData.__builtinDisabled__ === 'object') ? orgData.__builtinDisabled__ : {};
            const disabledArr = disabledMap[docTypeKey] || [];
            if (disabledArr.length > 0) {
                base = base.filter((_, i) => !disabledArr.includes(i));
            }
        } catch (e) {
            console.error('[case-data] getReqTemplates 读取 __builtinDisabled__ 失败:', e);
        }
    }
    // 追加用户侧自定义（过滤掉 enabled === false）
    try {
        const myData = JSON.parse(localStorage.getItem('myPromptTemplates')) || {};
        const myOrg = myData[org] || {};
        const my = myOrg[docTypeKey] || [];
        if (my.length > 0) {
            const myMarked = my
                .filter(p => !p || p.enabled !== false)
                .map(p => ({ name: p.name || '', text: p.text || '', source: 'mine' }));
            return [...base, ...myMarked];
        }
    } catch (e) {
        console.error('[case-data] getReqTemplates 读取 myPromptTemplates 失败:', e);
    }
    return base;
}

// ===== 按业务系统拆分的案由树数据 =====
const causeTreeDataByOrg = {
    court: [
        {
            name: '民事案由',
            expanded: true,
            children: [
                {
                    name: '人格权纠纷',
                    children: ['生命权、身体权、健康权纠纷', '姓名权纠纷', '肖像权纠纷', '名誉权纠纷', '隐私权纠纷']
                },
                {
                    name: '婚姻家庭纠纷',
                    children: ['离婚纠纷', '抚养纠纷', '赡养纠纷', '法定继承纠纷', '遗嘱继承纠纷']
                },
                {
                    name: '合同纠纷',
                    children: ['买卖合同纠纷', '民间借贷纠纷', '房屋租赁合同纠纷', '建设工程施工合同纠纷', '股权转让纠纷']
                },
                {
                    name: '劳动争议',
                    children: ['劳动争议', '劳动合同纠纷', '工伤赔偿纠纷', '劳动报酬纠纷']
                },
                {
                    name: '侵权责任纠纷',
                    children: ['机动车交通事故责任纠纷', '医疗损害责任纠纷', '产品责任纠纷']
                }
            ]
        },
        {
            name: '刑事案由',
            children: [
                {
                    name: '侵犯公民人身权利、民主权利罪',
                    children: ['故意伤害罪', '故意杀人罪', '非法拘禁罪', '强奸罪']
                },
                {
                    name: '侵犯财产罪',
                    children: ['盗窃罪', '诈骗罪', '职务侵占罪', '敲诈勒索罪']
                },
                {
                    name: '危害公共安全罪',
                    children: ['交通肇事罪', '危险驾驶罪', '以危险方法危害公共安全罪']
                },
                {
                    name: '妨害社会管理秩序罪',
                    children: ['寻衅滋事罪', '妨害公务罪', '开设赌场罪', '聚众斗殴罪']
                },
                {
                    name: '贪污贿赂罪',
                    children: ['受贿罪', '行贿罪', '贪污罪', '挪用公款罪']
                }
            ]
        },
        {
            name: '行政案由',
            children: ['行政处罚', '行政许可', '行政强制', '行政征收', '政府信息公开']
        },
        {
            name: '国家赔偿案由',
            children: ['行政赔偿', '司法赔偿']
        },
        {
            name: '执行案由',
            children: ['执行异议', '执行异议之诉', '财产保全', '强制执行']
        }
    ],
    procuratorate: [
        {
            name: '审查逮捕',
            expanded: true,
            children: ['批准逮捕', '不批准逮捕', '复议复核']
        },
        {
            name: '审查起诉',
            expanded: true,
            children: [
                {
                    name: '侵犯公民人身权利、民主权利罪',
                    children: ['故意伤害罪', '故意杀人罪', '非法拘禁罪', '强奸罪']
                },
                {
                    name: '侵犯财产罪',
                    children: ['盗窃罪', '诈骗罪', '职务侵占罪', '敲诈勒索罪']
                },
                {
                    name: '危害公共安全罪',
                    children: ['交通肇事罪', '危险驾驶罪', '以危险方法危害公共安全罪']
                },
                {
                    name: '妨害社会管理秩序罪',
                    children: ['寻衅滋事罪', '妨害公务罪', '开设赌场罪', '聚众斗殴罪']
                },
                {
                    name: '贪污贿赂罪',
                    children: ['受贿罪', '行贿罪', '贪污罪', '挪用公款罪']
                },
                {
                    name: '渎职罪',
                    children: ['滥用职权罪', '玩忽职守罪', '徇私枉法罪']
                }
            ]
        },
        {
            name: '不起诉',
            expanded: true,
            children: ['法定不起诉', '酌定不起诉', '证据不足不起诉']
        },
        {
            name: '刑事抗诉',
            expanded: true,
            children: ['二审抗诉', '审判监督程序抗诉']
        },
        {
            name: '刑事赔偿',
            expanded: true,
            children: ['错误逮捕赔偿', '错误起诉赔偿']
        }
    ],
    justice: [
        {
            name: '行政处罚复议',
            expanded: true,
            children: [
                {
                    name: '治安行政处罚',
                    children: ['治安拘留处罚', '治安罚款处罚', '治安警告处罚']
                },
                {
                    name: '市场监管处罚',
                    children: ['工商行政处罚', '食品药品处罚', '价格违法处罚']
                },
                {
                    name: '交通违法处罚',
                    children: ['交通罚款处罚', '吊销驾照处罚', '车辆扣留处罚']
                },
                {
                    name: '环保处罚',
                    children: ['环境污染处罚', '违规排放处罚']
                }
            ]
        },
        {
            name: '行政许可复议',
            expanded: true,
            children: [
                {
                    name: '不予许可',
                    children: ['不予行政许可', '逾期未作许可决定']
                },
                {
                    name: '变更撤销许可',
                    children: ['变更行政许可', '撤销行政许可', '注销行政许可']
                }
            ]
        },
        {
            name: '行政强制复议',
            expanded: true,
            children: ['行政查封扣押', '行政强制拆除', '行政冻结']
        },
        {
            name: '信息公开复议',
            expanded: true,
            children: ['不予公开政府信息', '逾期未答复信息公开申请']
        }
    ]
};

const causeTypeMapByOrg = {
    court: {
        '买卖合同纠纷': 'contract', '民间借贷纠纷': 'contract', '房屋租赁合同纠纷': 'contract',
        '建设工程施工合同纠纷': 'contract', '股权转让纠纷': 'contract',
        '劳动争议': 'labor', '劳动合同纠纷': 'labor', '工伤赔偿纠纷': 'labor', '劳动报酬纠纷': 'labor',
        '机动车交通事故责任纠纷': 'tort', '医疗损害责任纠纷': 'tort', '产品责任纠纷': 'tort',
        '生命权、身体权、健康权纠纷': 'tort', '姓名权纠纷': 'tort', '肖像权纠纷': 'tort',
        '名誉权纠纷': 'tort', '隐私权纠纷': 'tort',
        '离婚纠纷': 'family', '抚养纠纷': 'family', '赡养纠纷': 'family',
        '法定继承纠纷': 'family', '遗嘱继承纠纷': 'family',
        '故意伤害罪': 'criminal', '故意杀人罪': 'criminal', '非法拘禁罪': 'criminal', '强奸罪': 'criminal',
        '盗窃罪': 'criminal', '诈骗罪': 'criminal', '职务侵占罪': 'criminal', '敲诈勒索罪': 'criminal',
        '交通肇事罪': 'criminal', '危险驾驶罪': 'criminal', '以危险方法危害公共安全罪': 'criminal',
        '寻衅滋事罪': 'criminal', '妨害公务罪': 'criminal', '开设赌场罪': 'criminal', '聚众斗殴罪': 'criminal',
        '受贿罪': 'criminal', '行贿罪': 'criminal', '贪污罪': 'criminal', '挪用公款罪': 'criminal'
    },
    procuratorate: {
        '故意伤害罪': 'criminal', '故意杀人罪': 'criminal', '非法拘禁罪': 'criminal', '强奸罪': 'criminal',
        '盗窃罪': 'criminal', '诈骗罪': 'criminal', '职务侵占罪': 'criminal', '敲诈勒索罪': 'criminal',
        '交通肇事罪': 'criminal', '危险驾驶罪': 'criminal', '以危险方法危害公共安全罪': 'criminal',
        '寻衅滋事罪': 'criminal', '妨害公务罪': 'criminal', '开设赌场罪': 'criminal', '聚众斗殴罪': 'criminal',
        '受贿罪': 'criminal', '行贿罪': 'criminal', '贪污罪': 'criminal', '挪用公款罪': 'criminal',
        '滥用职权罪': 'dereliction', '玩忽职守罪': 'dereliction', '徇私枉法罪': 'dereliction',
        '批准逮捕': 'arrest', '不批准逮捕': 'arrest', '复议复核': 'arrest',
        '法定不起诉': 'nonProsecution', '酌定不起诉': 'nonProsecution', '证据不足不起诉': 'nonProsecution',
        '二审抗诉': 'appeal', '审判监督程序抗诉': 'appeal',
        '错误逮捕赔偿': 'compensation', '错误起诉赔偿': 'compensation'
    },
    justice: {
        '治安拘留处罚': 'adminPenalty', '治安罚款处罚': 'adminPenalty', '治安警告处罚': 'adminPenalty',
        '工商行政处罚': 'adminPenalty', '食品药品处罚': 'adminPenalty', '价格违法处罚': 'adminPenalty',
        '交通罚款处罚': 'adminPenalty', '吊销驾照处罚': 'adminPenalty', '车辆扣留处罚': 'adminPenalty',
        '环境污染处罚': 'adminPenalty', '违规排放处罚': 'adminPenalty',
        '不予行政许可': 'adminPermit', '逾期未作许可决定': 'adminPermit',
        '变更行政许可': 'adminPermit', '撤销行政许可': 'adminPermit', '注销行政许可': 'adminPermit',
        '行政查封扣押': 'adminCoercion', '行政强制拆除': 'adminCoercion', '行政冻结': 'adminCoercion',
        '不予公开政府信息': 'infoDisclosure', '逾期未答复信息公开申请': 'infoDisclosure'
    }
};

function getCauseType(causeName, business) {
    const org = business || (typeof currentBusiness !== 'undefined' ? currentBusiness : 'court');
    const map = causeTypeMapByOrg[org] || causeTypeMapByOrg.court;
    return map[causeName] || 'contract';
}

// ===== 按业务系统拆分的案字配置 =====
const caseWordListByOrg = {
    court: ['民初', '民终', '民再', '刑初', '刑终', '刑再', '行初', '行终', '执', '赔', '监'],
    procuratorate: ['检诉', '检刑诉', '检刑抗', '检不诉', '检复议', '检赔', '检捕', '检不立'],
    justice: ['行复', '行复决', '行复终']
};

// v1.41 优化2: 案由大类→案字白名单映射（用于 my-elements / admin-element-presets 案字栏过滤）
// 案由大类取自 causeTreeDataByOrg 的顶层节点 name；未配置的案由大类默认适配全部案字
const caseWordWhitelistByCauseCategory = {
    court: {
        '民事案由': ['民初', '民终', '民再'],
        '刑事案由': ['刑初', '刑终', '刑再'],
        '行政案由': ['行初', '行终'],
        '国家赔偿案由': ['赔', '监'],
        '执行案由': ['执']
    },
    procuratorate: {
        // 检察院案由大类：审查逮捕/审查起诉/不起诉/刑事抗诉/刑事赔偿 均属刑事范畴，适配全部检察案字
        '审查逮捕': ['检捕', '检不立'],
        '审查起诉': ['检诉', '检刑诉', '检不诉', '检复议'],
        '不起诉': ['检不诉', '检复议'],
        '刑事抗诉': ['检刑抗'],
        '刑事赔偿': ['检赔']
    },
    justice: {
        // 司法局只有行政复议一类，适配全部司法案字
        '行政复议': ['行复', '行复决', '行复终']
    }
};

// v1.41 优化2: 查询某案由所属大类（在 causeTreeDataByOrg 中反查顶层节点名）
// 支持一级案由大类、二级案由分组、三级案由叶子节点命中；找不到返回空字符串
function getCauseCategory(org, cause) {
    const tree = causeTreeDataByOrg[org] || [];
    for (const l1 of tree) {
        if (!l1 || typeof l1.name !== 'string') continue;
        // 当前选择的就是一级案由大类（如"民事案由"）
        if (l1.name === cause) return l1.name;
        if (!Array.isArray(l1.children)) continue;
        for (const l2 of l1.children) {
            if (typeof l2 === 'string') {
                if (l2 === cause) return l1.name;
            } else if (l2 && typeof l2 === 'object') {
                // 当前选择的就是二级案由分组（如"人格权纠纷"）
                if (l2.name === cause) return l1.name;
                // 三级案由叶子节点
                if (Array.isArray(l2.children) && l2.children.indexOf(cause) >= 0) return l1.name;
            }
        }
    }
    return '';
}

// v1.41 优化2: 查询某案由允许适配的案字白名单
// 返回数组；案由未找到大类或大类未配置白名单时返回该业务系统全部案字（兜底）
function getAllowedCaseWordsForCause(org, cause) {
    const category = getCauseCategory(org, cause);
    if (!category) {
        // 案由不在树中（如自定义案由），兜底返回全部案字
        return (caseWordListByOrg[org] || []).slice();
    }
    const whitelist = (caseWordWhitelistByCauseCategory[org] || {})[category];
    if (!whitelist || whitelist.length === 0) {
        // 大类未配置白名单，兜底返回全部案字
        return (caseWordListByOrg[org] || []).slice();
    }
    return whitelist.slice();
}

// ===== 数据版本与迁移 =====
const DATA_VERSION = '1.19'; // v1.42: case7 新增 demoOverflow 标记，ensureConstructionCaseDemoFiles 强制刷新 36 个演示材料

// 保留默认的 docTypes 与 docTemplates 配置，用于 localStorage 加载后补全
// v1.9: 移除文书类型 icon 字段
const defaultDocTypesByOrg = {
    court: {
        judgment: { name: '裁判文书', templates: ['judgment-civil-1st', 'judgment-civil-simple', 'ruling-civil', 'mediation-civil'] },
        trial: { name: '庭审提纲', templates: ['trial-outline', 'court-investigation-outline'] },
        execution: { name: '执行文书', templates: ['execution-notice', 'property-report', 'service-notice'] },
        materialSummary: { name: '材料总结', templates: [] }
    },
    procuratorate: {
        prosecution: { name: '检察文书', templates: ['prosecution-indictment', 'prosecution-notice', 'prosecution-recommendation', 'prosecution-transfer', 'prosecution-detention'] },
        nonProsecution: { name: '不起诉文书', templates: ['prosecution-decision'] },
        court: { name: '出庭文书', templates: ['prosecution-arraignment'] },
        materialSummary: { name: '材料总结', templates: [] }
    },
    justice: {
        reconsideration: { name: '行政复议决定书', templates: ['reconsideration-decision', 'reconsideration-maintain', 'reconsideration-revoke', 'reconsideration-change', 'reconsideration-confirm'] },
        notice: { name: '行政复议通知书', templates: ['reconsideration-accept-notice', 'reconsideration-reply-notice', 'reconsideration-hearing-notice'] },
        materialSummary: { name: '材料总结', templates: [] }
    }
};

const defaultDocTemplatesByOrg = {
    court: {
        'judgment-civil-1st': '民事判决书（一审普通程序）',
        'judgment-civil-simple': '民事判决书（简易程序）',
        'ruling-civil': '民事裁定书',
        'mediation-civil': '民事调解书',
        'trial-outline': '庭审提纲',
        'court-investigation-outline': '法庭调查提纲',
        'execution-notice': '执行通知书',
        'property-report': '财产报告令',
        'service-notice': '送达回证'
    },
    procuratorate: {
        'prosecution-indictment': '起诉书',
        'prosecution-notice': '审查起诉告知书',
        'prosecution-decision': '不起诉决定书',
        'prosecution-recommendation': '量刑建议书',
        'prosecution-arraignment': '开庭通知书',
        'prosecution-transfer': '移送审查起诉意见书',
        'prosecution-detention': '批准逮捕决定书'
    },
    justice: {
        'reconsideration-decision': '行政复议决定书（通用）',
        'reconsideration-maintain': '行政复议决定书（维持）',
        'reconsideration-revoke': '行政复议决定书（撤销）',
        'reconsideration-change': '行政复议决定书（变更）',
        'reconsideration-confirm': '行政复议决定书（确认违法）',
        'reconsideration-accept-notice': '行政复议受理通知书',
        'reconsideration-reply-notice': '行政复议答复通知书',
        'reconsideration-hearing-notice': '行政复议听证通知书'
    }
};

// 要素生成预设要件，按案由分组
const elementPresetsByCause = {
    '民间借贷纠纷': [
        { name: '借款合意', desc: '借贷双方是否存在借款协议或借条', question: '借款协议/借条签订时间、地点、金额分别是？' },
        { name: '款项交付', desc: '出借人实际支付借款的凭证（转账记录、收条等）', question: '实际出借金额及支付方式（转账/现金）？' },
        { name: '还款情况', desc: '借款人是否已部分还款及还款金额', question: '借款人已还款金额及时间？' },
        { name: '利息约定', desc: '双方对利息的约定内容及合法性', question: '双方约定的利率标准是多少？' },
        { name: '诉讼时效', desc: '起诉是否在诉讼时效期间内', question: '最后一次催款时间？' }
    ],
    '买卖合同纠纷': [
        { name: '合同成立', desc: '买卖合同的签订情况及内容', question: '合同签订时间、地点及签约主体？' },
        { name: '合同效力', desc: '合同是否存在无效、可撤销情形', question: '合同是否存在欺诈、胁迫或显失公平情形？' },
        { name: '履行情况', desc: '双方的履行行为及违约表现', question: '买方是否已支付货款？支付比例？' },
        { name: '违约责任', desc: '违约方应承担的责任及计算依据', question: '合同约定的违约金标准或损失计算方式？' },
        { name: '损失数额', desc: '因违约造成的实际损失及证据', question: '因违约造成的直接损失有哪些？' }
    ],
    '离婚纠纷': [
        { name: '婚姻关系', desc: '婚姻登记情况及婚姻存续状态', question: '结婚登记时间及登记机关？' },
        { name: '感情破裂', desc: '夫妻感情确已破裂的事实和证据', question: '导致感情破裂的主要原因？' },
        { name: '子女抚养', desc: '子女情况及抚养权归属建议', question: '子女姓名、出生日期及目前随谁生活？' },
        { name: '财产分割', desc: '夫妻共同财产的范围及分割方案', question: '主要共同财产有哪些（房产、车辆、存款等）？' },
        { name: '债务分担', desc: '夫妻共同债务的认定及分担', question: '是否存在夫妻共同债务？金额及债权人？' }
    ],
    '劳动争议': [
        { name: '劳动关系', desc: '劳动关系的成立及存续情况', question: '入职时间、岗位及劳动合同签订情况？' },
        { name: '工资标准', desc: '工资约定及实际发放情况', question: '月工资标准及构成？' },
        { name: '拖欠事实', desc: '拖欠工资/经济补偿的事实和数额', question: '拖欠工资/经济补偿的具体金额？' },
        { name: '仲裁时效', desc: '劳动仲裁是否在时效期间内', question: '争议发生时间？' },
        { name: '主体责任', desc: '用人单位的主体责任认定', question: '用人单位全称及用工主体是否适格？' }
    ],
    '机动车交通事故责任纠纷': [
        { name: '事故责任', desc: '交警部门的事故责任认定', question: '事故发生时间、地点及经过？' },
        { name: '损害后果', desc: '人身伤害和财产损失的具体情况', question: '受害人伤情及治疗情况？' },
        { name: '因果关系', desc: '事故与损害之间的因果关系', question: '损害后果与交通事故是否存在直接因果关系？' },
        { name: '赔偿项目', desc: '医疗费、误工费、护理费等赔偿项目', question: '已产生的医疗费、误工费、护理费金额？' },
        { name: '保险责任', desc: '交强险和商业险的赔付责任', question: '肇事车辆投保的交强险及商业险情况？' }
    ],
    '故意伤害罪': [
        { name: '犯罪主体', desc: '犯罪嫌疑人基本情况及刑事责任能力', question: '犯罪嫌疑人年龄、职业及与被害人关系？' },
        { name: '犯罪客体', desc: '侵害他人身体健康权', question: '被害人的身体权/健康权受侵害情况？' },
        { name: '客观方面', desc: '非法损害他人身体的行为及手段', question: '伤害行为发生的时间、地点及经过？' },
        { name: '主观方面', desc: '伤害他人的主观故意', question: '犯罪嫌疑人是否具有伤害故意？' },
        { name: '损害后果', desc: '伤情鉴定意见（轻伤/重伤）', question: '伤情鉴定意见及等级？' }
    ],
    '盗窃罪': [
        { name: '犯罪主体', desc: '犯罪嫌疑人基本情况', question: '犯罪嫌疑人年龄、职业及前科情况？' },
        { name: '客观方面', desc: '秘密窃取他人财物的行为', question: '盗窃时间、地点及具体行为？' },
        { name: '主观方面', desc: '以非法占有为目的的盗窃故意', question: '犯罪嫌疑人是否具有非法占有目的？' },
        { name: '数额标准', desc: '盗窃数额及是否达到立案标准', question: '被盗财物价值及认定依据？' },
        { name: '既遂未遂', desc: '盗窃行为的既遂或未遂认定', question: '财物是否已被犯罪嫌疑人实际控制？' }
    ],
    '诈骗罪': [
        { name: '犯罪主体', desc: '犯罪嫌疑人基本情况', question: '犯罪嫌疑人年龄、职业及与被害人关系？' },
        { name: '客观方面', desc: '虚构事实、隐瞒真相的欺骗行为', question: '实施了哪些虚构事实或隐瞒真相行为？' },
        { name: '主观方面', desc: '以非法占有为目的的诈骗故意', question: '犯罪嫌疑人是否具有非法占有目的？' },
        { name: '数额标准', desc: '诈骗数额及量刑档次', question: '被害人实际被骗金额？' },
        { name: '被害人', desc: '被害人因被骗而处分财产的情况', question: '被害人如何交付财物（转账/现金/其他）？' }
    ],
    '受贿罪': [
        { name: '犯罪主体', desc: '国家工作人员身份认定', question: '犯罪嫌疑人具体职务及任职时间？' },
        { name: '职务便利', desc: '利用职务上的便利条件', question: '利用职务便利的具体表现？' },
        { name: '收受财物', desc: '收受他人财物的具体行为', question: '收受财物的时间、地点、方式？' },
        { name: '为他人谋利', desc: '为他人谋取利益的事实', question: '为他人谋取了何种利益？' },
        { name: '数额标准', desc: '受贿数额及量刑档次', question: '受贿总额及单笔最大金额？' }
    ],
    '交通肇事罪': [
        { name: '犯罪主体', desc: '犯罪嫌疑人基本情况及驾驶资格', question: '犯罪嫌疑人年龄、驾驶资格及车辆所有人？' },
        { name: '事故责任', desc: '交通事故责任认定', question: '事故发生时间、地点及经过？' },
        { name: '危害后果', desc: '人员伤亡及财产损失情况', question: '伤亡人数及伤情？' },
        { name: '主观过错', desc: '违反交通法规的主观过失', question: '犯罪嫌疑人违反了哪项交通法规？' },
        { name: '赔偿情况', desc: '事故后的赔偿及谅解情况', question: '是否已赔偿被害人损失？' }
    ],
    '危险驾驶罪': [
        { name: '犯罪主体', desc: '犯罪嫌疑人基本情况及驾驶资格', question: '犯罪嫌疑人年龄、驾驶资格？' },
        { name: '客观行为', desc: '醉酒驾驶/追逐竞驶等危险行为', question: '危险驾驶类型（醉酒/追逐竞驶/严重超载）？' },
        { name: '酒精含量', desc: '血液酒精含量检测报告', question: '血液酒精含量数值及检测时间？' },
        { name: '道路认定', desc: '驾驶行为发生的道路性质', question: '驾驶地点是否属于道路交通安全法规定的道路？' },
        { name: '从重情节', desc: '是否有从重处罚的情节', question: '是否造成交通事故或人员伤亡？' }
    ],
    '寻衅滋事罪': [
        { name: '犯罪主体', desc: '犯罪嫌疑人基本情况', question: '犯罪嫌疑人年龄、职业及前科情况？' },
        { name: '客观行为', desc: '寻衅滋事的具体行为表现', question: '具体实施了何种寻衅滋事行为？' },
        { name: '主观方面', desc: '寻求刺激、发泄情绪的主观故意', question: '实施行为的主观动机？' },
        { name: '危害后果', desc: '对社会公共秩序的破坏程度', question: '行为造成公共场所秩序混乱的程度？' },
        { name: '情节严重', desc: '是否达到情节恶劣或严重的标准', question: '是否属于多次寻衅滋事或持凶器？' }
    ],
    '治安拘留处罚': [
        { name: '行政行为合法性', desc: '处罚决定主体是否适格、权限是否合法', question: '作出处罚决定的机关及权限？' },
        { name: '事实认定', desc: '违法事实的认定是否清楚、证据是否充分', question: '认定的违法事实有哪些？' },
        { name: '法律适用', desc: '适用法律条款是否正确', question: '处罚所依据的法律条款？' },
        { name: '程序正当', desc: '行政处罚程序是否符合法律规定', question: '是否履行告知、听证等程序？' },
        { name: '处罚适当', desc: '处罚幅度是否合理适当', question: '拘留期限及幅度？' }
    ],
    '行政处罚': [
        { name: '行政行为合法性', desc: '处罚决定主体是否适格', question: '处罚机关是否具有法定处罚权？' },
        { name: '事实认定', desc: '违法事实认定及证据', question: '认定的违法事实是什么？' },
        { name: '法律适用', desc: '适用法律是否正确', question: '适用的法律、法规及具体条款？' },
        { name: '程序正当', desc: '处罚程序是否合法', question: '是否履行告知、陈述申辩等程序？' },
        { name: '处罚适当', desc: '处罚幅度是否适当', question: '处罚种类及幅度？' }
    ],
    '行政许可': [
        { name: '许可主体', desc: '作出许可决定的机关是否适格', question: '许可机关是否具有法定许可权？' },
        { name: '申请条件', desc: '申请人是否符合法定条件', question: '申请人提交的材料是否齐全？' },
        { name: '审查程序', desc: '许可审查程序是否合法', question: '审查期限及程序是否符合规定？' },
        { name: '法律适用', desc: '适用法律是否正确', question: '许可所依据的法律、法规？' },
        { name: '决定合理性', desc: '许可或不予许可的决定是否合理', question: '许可决定内容及理由？' }
    ]
};

// 获取案由对应的预设要件，无精确匹配时返回通用要件
// org 参数（可选）：业务系统 key（court/procuratorate/justice），传入时优先读取
//                  localStorage.adminElementPresets[org][cause] 的管理后台自定义覆盖
// 从案件 caseNumber 解析案字（如 "(2024)粤01民初123号" → "民初"）
// 匹配规则：在 caseWordListByOrg[org] 中查找哪个案字出现在 caseNumber 中
function parseCaseWord(caseNumber, org) {
    if (!caseNumber || !org) return '';
    const words = caseWordListByOrg[org] || [];
    for (const w of words) {
        if (caseNumber.indexOf(w) >= 0) return w;
    }
    return '';
}

// 遍历案由树，返回某案由的所有祖先案由名（从直接父级到根）
// 如 '民间借贷纠纷' → ['合同纠纷', '民事案由']
function getAncestorCauses(org, cause) {
    if (!cause || !org) return [];
    const tree = causeTreeDataByOrg[org] || [];
    const ancestors = [];
    function search(nodes, path) {
        for (const node of nodes) {
            const nodeName = typeof node === 'string' ? node : node.name;
            if (nodeName === cause) {
                ancestors.push(...path);
                return true;
            }
            if (typeof node !== 'string' && Array.isArray(node.children)) {
                const children = node.children.map(c => typeof c === 'string' ? c : c.name);
                if (search(node.children, [...path, node.name])) return true;
            }
        }
        return false;
    }
    search(tree, []);
    return ancestors;
}

// 按案字过滤要件：返回 caseWords 包含 caseWord 或为空（通用）的要件
// v1.34: 同时过滤 enabled === false 的停用要件（用户侧不展示）
function filterElementsByCaseWord(elements, caseWord) {
    if (!Array.isArray(elements)) return [];
    // 先过滤停用项（enabled !== false 才保留；内置要件无 enabled 字段，视为启用）
    const active = elements.filter(p => p.enabled !== false);
    if (!caseWord) return active; // 无案字时返回全部启用项
    return active.filter(p => {
        const cw = p.caseWords;
        return !Array.isArray(cw) || cw.length === 0 || cw.indexOf(caseWord) >= 0;
    });
}

// v1.25: 要件按案字分组 + 继承查找
// cause: 案由名；org: 业务系统；caseWord: 案字（可选）
// 查找顺序：当前案由admin覆盖 → 祖先案由admin覆盖 → 内置 → 通用要件
// 每层都按案字过滤
function getElementPresets(cause, org, caseWord) {
    // 1. 当前案由的 admin 覆盖
    if (cause && org) {
        try {
            const adminData = JSON.parse(localStorage.getItem('adminElementPresets') || '{}');
            const orgData = adminData[org] || {};
            if (orgData[cause]) {
                return filterElementsByCaseWord(orgData[cause], caseWord);
            }
            // 2. 继承：向上查找祖先案由的配置
            const ancestors = getAncestorCauses(org, cause);
            for (const anc of ancestors) {
                if (orgData[anc]) {
                    return filterElementsByCaseWord(orgData[anc], caseWord);
                }
            }
        } catch (e) { /* ignore */ }
    }
    // 3. 内置要件（同样按案字过滤；内置要件无 caseWords 字段，视为通用）
    if (cause && elementPresetsByCause[cause]) {
        return filterElementsByCaseWord(elementPresetsByCause[cause], caseWord);
    }
    // 4. 通用要件
    return [
        { name: '主体资格', desc: '相关主体的资格及身份认定', question: '各方主体名称、身份及主体资格情况？' },
        { name: '事实认定', desc: '案件事实的认定及证据', question: '需要认定的核心事实有哪些？' },
        { name: '法律适用', desc: '适用的法律法规', question: '本案应适用的法律、法规及具体条款？' },
        { name: '程序合法', desc: '相关程序是否符合法律规定', question: '已履行的程序有哪些？' },
        { name: '处理结果', desc: '处理决定的内容及依据', question: '拟作出的处理结果？' }
    ];
}

const MY_ELEMENTS_STORAGE_KEY = 'myElementPresetsByCause';

function getMyElementPresets(cause) {
    const data = JSON.parse(localStorage.getItem(MY_ELEMENTS_STORAGE_KEY) || '{}');
    return cause ? (data[cause] || []) : data;
}

function setMyElementPresets(cause, elements) {
    const data = JSON.parse(localStorage.getItem(MY_ELEMENTS_STORAGE_KEY) || '{}');
    if (cause) {
        data[cause] = elements || [];
    }
    localStorage.setItem(MY_ELEMENTS_STORAGE_KEY, JSON.stringify(data));
}

function getAllElementPresets(cause, org, caseWord) {
    const standard = getElementPresets(cause, org, caseWord).map(p => ({ ...p, source: 'standard' }));
    const mine = filterElementsByCaseWord(getMyElementPresets(cause), caseWord).map(p => ({ ...p, source: 'mine' }));
    return { standard, mine };
}

// 文书要求内置模板，按业务系统 × 文书类型分组
const defaultRequirementTemplates = {
    court: {
        judgment: [
            { name: '支持原告全部诉请', text: '裁判方向：支持原告全部诉讼请求\n• 事实清楚，证据充分\n• 原告诉请于法有据，予以全部支持' },
            { name: '部分支持诉请', text: '裁判方向：部分支持原告诉讼请求\n• 核心事实成立，部分诉请予以支持\n• 超出法律范围的部分予以驳回' },
            { name: '驳回诉请', text: '裁判方向：驳回原告全部诉讼请求\n• 证据不足，事实不予认定\n• 诉请缺乏法律依据，予以驳回' },
            { name: '其他自定义', text: '' }
        ],
        trial: [
            { name: '争议焦点明确', text: '庭审重点：\n• 争议焦点明确，围绕核心事实展开\n• 重点调查证据的真实性与关联性\n• 引导当事人围绕焦点举证质证' },
            { name: '事实争议较大', text: '庭审重点：\n• 双方对事实存在较大争议\n• 重点调查关键证据的证明力\n• 充分听取双方意见，查明案件事实' }
        ],
        execution: [
            { name: '常规执行', text: '执行要点：\n• 被执行人财产状况需核实\n• 依法采取执行措施\n• 保障申请执行人合法权益' }
        ]
    },
    procuratorate: {
        prosecution: [
            { name: '提起公诉', text: '审查结论：提起公诉\n• 犯罪事实清楚，证据确实充分\n• 依法应当追究刑事责任\n• 建议适用普通程序审理' },
            { name: '简易程序建议', text: '审查结论：提起公诉，建议简易程序\n• 案件事实清楚，证据充分\n• 被告人认罪认罚\n• 建议适用简易程序，依法从轻处罚' }
        ],
        nonProsecution: [
            { name: '法定不起诉', text: '审查结论：法定不起诉\n• 符合法定不起诉情形\n• 依法作出不起诉决定' },
            { name: '酌定不起诉', text: '审查结论：酌定不起诉\n• 犯罪情节轻微，不需要判处刑罚\n• 依法作出不起诉决定' }
        ],
        court: [
            { name: '出庭支持公诉', text: '出庭要点：\n• 依法出庭支持公诉\n• 重点围绕犯罪事实与证据发表意见\n• 针对辩护意见准备答辩' }
        ]
    },
    justice: {
        reconsideration: [
            { name: '维持行政行为', text: '复议结论：维持行政行为\n• 行政行为认定事实清楚\n• 适用法律正确，程序合法\n• 依法维持原行政行为' },
            { name: '撤销行政行为', text: '复议结论：撤销行政行为\n• 行政行为主要事实不清\n• 适用法律错误或程序违法\n• 依法撤销原行政行为' },
            { name: '变更行政行为', text: '复议结论：变更行政行为\n• 行政行为明显不当\n• 依法变更原行政行为的内容' },
            { name: '确认违法', text: '复议结论：确认行政行为违法\n• 行政行为违法但不具有可撤销内容\n• 依法确认原行政行为违法' }
        ],
        notice: [
            { name: '受理通知', text: '通知要点：\n• 申请人复议申请符合法定条件\n• 依法予以受理\n• 告知被申请人答辩权利与期限' }
        ]
    }
};

function isDefaultCase(caseId) {
    return /^(case\d+|p\d+|j\d+)$/.test(caseId);
}

function generateCaseFiles(c, org) {
    const fileTypes = ['pdf', 'doc', 'docx'];
    const fileNamesByOrg = {
        court: ['起诉状', '答辩状', '证据清单', '授权委托书', '身份证明', '合同文本', '转账记录', '聊天记录', '鉴定意见', '庭审笔录', '判决书', '裁定书', '调解书', '送达回证', '阅卷笔录'],
        procuratorate: ['起诉意见书', '侦查终结报告', '讯问笔录', '询问笔录', '鉴定意见', '勘验笔录', '搜查笔录', '扣押清单', '犯罪嫌疑人供述', '被害人陈述', '批准逮捕决定书', '不批准逮捕决定书'],
        justice: ['行政复议申请书', '行政行为决定书', '身份证明', '授权委托书', '证据材料', '被申请人答复书', '调查笔录', '听证笔录', '法律法规依据']
    };

    const fileNames = fileNamesByOrg[org] || fileNamesByOrg.court;
    const count = Math.max(c.fileCount || 0, Math.floor(Math.random() * 4) + 2);
    c.files = [];
    for (let i = 0; i < count; i++) {
        const ext = fileTypes[Math.floor(Math.random() * fileTypes.length)];
        const name = `${fileNames[Math.floor(Math.random() * fileNames.length)]}_${i + 1}.${ext}`;
        const size = Math.floor(Math.random() * 5000 + 100) * 1024;
        const statusRoll = Math.random();
        const ocrStatus = statusRoll > 0.85 ? 'error' : (statusRoll > 0.75 ? 'pending' : 'done');
        // v1.36: 新增 parseStatus 字段（uploading/parsing/success/error），与 ocrStatus 映射保持兼容
        // ocrStatus: done→success, pending→parsing, error→error
        const parseStatus = ocrStatus === 'done' ? 'success' : (ocrStatus === 'pending' ? 'parsing' : 'error');
        // v1.36: 解析异常类型（format_unsupported/file_corrupted/ocr_failed/empty_content/other）
        const errorTypes = ['format_unsupported', 'file_corrupted', 'ocr_failed', 'empty_content', 'other'];
        const errorType = parseStatus === 'error' ? errorTypes[Math.floor(Math.random() * errorTypes.length)] : null;
        // 示例材料给一个较合理的预估 token 数（500~3000），避免按随机 size 估算失真
        const estimatedTokens = Math.floor(Math.random() * 2500 + 500);
        c.files.push({
            id: `${c.id}_file_${i + 1}`,
            name,
            size,
            estimatedTokens,
            updatedAt: c.updatedAt,
            ocrStatus,
            parseStatus,
            errorType,
            parsedAt: parseStatus === 'success' ? c.updatedAt : null
        });
    }
}

// 为演示「分步生成」效果，给建设工程施工合同纠纷案（case7）生成大量材料并超过默认模型上下文限制
// 演示标记 demoOverflow: true 表示该案件勾选全部材料时 workflow 判断不能一步生成（36×6000=216,000 > 80,000 阈值）
function ensureConstructionCaseDemoFiles(c) {
    if (c.id !== 'case7') return;
    c.demoOverflow = true;
    const names = [
        '建设工程施工合同', '补充协议（一）', '补充协议（二）', '工程签证单_001', '工程签证单_002',
        '工程签证单_003', '竣工验收报告', '工程款支付凭证_001', '工程款支付凭证_002', '工程款支付凭证_003',
        '工程结算书', '工程变更单_001', '工程变更单_002', '施工图纸_建筑', '施工图纸_结构',
        '施工图纸_水电', '工程量清单', '招投标文件', '开标记录', '中标通知书',
        '开工报告', '停工通知', '复工报告', '工程质量验收记录', '工程监理日志_001',
        '工程监理日志_002', '工程监理日志_003', '工程款催款函', '律师函', '司法鉴定意见书',
        '勘验笔录', '当事人身份证明', '授权委托书', '证据清单', '质证意见', '法庭审理笔录'
    ];
    c.files = names.map((name, i) => ({
        id: `${c.id}_file_${i + 1}`,
        name: `${name}.pdf`,
        size: Math.floor(Math.random() * 4000 + 2000) * 1024,
        estimatedTokens: 6000,
        updatedAt: c.updatedAt,
        ocrStatus: 'done',
        parseStatus: 'success',
        errorType: null,
        parsedAt: c.updatedAt
    }));
    c.fileCount = c.files.length;
}

function fixEstimatedTokens() {
    Object.values(businessSystems).forEach(system => {
        if (!system || !Array.isArray(system.cases)) return;
        system.cases.forEach(c => {
            if (!Array.isArray(c.files)) return;
            c.files.forEach(f => {
                if (f && typeof f.estimatedTokens !== 'number') {
                    f.estimatedTokens = estimateFileTokens(f);
                }
            });
        });
    });
}

function migrateDataIfNeeded() {
    const savedVersion = businessSystems._dataVersion;
    if (savedVersion !== DATA_VERSION) {
        // 版本升级时，补全 docTypes 与 docTemplates，重置演示案件的 filesInitialized
        // 保存一份默认初始配置用于强制覆盖
        const defaultJustice = {
            name: '司法局',
            label: '行政复议业务',
            partiesLabels: ['申请人', '被申请人'],
            docTypes: defaultDocTypesByOrg.justice,
            docTemplates: defaultDocTemplatesByOrg.justice,
            statusConfig: { pending: '待审理', ongoing: '审理中', closed: '已审结' },
            statsConfig: {
                total: { label: '全部案件', icon: 'fa-folder-open', color: 'blue' },
                pending: { label: '待审理', icon: 'fa-clock', color: 'orange' },
                ongoing: { label: '审理中', icon: 'fa-users', color: 'purple' },
                closed: { label: '已审结', icon: 'fa-check-circle', color: 'green' }
            },
            cases: [
                { id: 'j1', caseName: '张某不服治安拘留处罚行政复议案', caseNumber: '穗行复〔2024〕0123号', cause: '治安拘留处罚', type: 'adminPenalty', partyA: '张某', partyB: '某公安分局', handler: '李复议员', status: 'ongoing', date: '2024-12-15', fileCount: 3, updatedAt: '2024-12-15' },
                { id: 'j2', caseName: '某公司不服工商行政处罚行政复议案', caseNumber: '穗行复〔2024〕0124号', cause: '工商行政处罚', type: 'adminPenalty', partyA: '某公司', partyB: '某市场监管局', handler: '王复议员', status: 'pending', date: '2024-12-18', fileCount: 5, updatedAt: '2024-12-18' },
                { id: 'j3', caseName: '李某不服交通罚款处罚行政复议案', caseNumber: '穗行复〔2024〕0125号', cause: '交通罚款处罚', type: 'adminPenalty', partyA: '李某', partyB: '某交警支队', handler: '张复议员', status: 'ongoing', date: '2024-12-10', fileCount: 2, updatedAt: '2024-12-10' },
                { id: 'j4', caseName: '赵某不服不予行政许可行政复议案', caseNumber: '穗行复〔2024〕0112号', cause: '不予行政许可', type: 'adminPermit', partyA: '赵某', partyB: '某住建局', handler: '刘复议员', status: 'closed', date: '2024-11-20', fileCount: 4, updatedAt: '2024-11-20' },
                { id: 'j5', caseName: '陈某不服行政查封扣押行政复议案', caseNumber: '穗行复〔2024〕0113号', cause: '行政查封扣押', type: 'adminCoercion', partyA: '陈某', partyB: '某综合执法局', handler: '陈复议员', status: 'ongoing', date: '2024-12-08', fileCount: 3, updatedAt: '2024-12-08' },
                { id: 'j6', caseName: '王某不服环境污染处罚行政复议案', caseNumber: '穗行复〔2024〕0108号', cause: '环境污染处罚', type: 'adminPenalty', partyA: '王某', partyB: '某生态环境局', handler: '杨复议员', status: 'pending', date: '2024-12-20', fileCount: 6, updatedAt: '2024-12-20' },
                { id: 'j7', caseName: '某企业不服撤销行政许可行政复议案', caseNumber: '穗行复〔2023〕0876号', cause: '撤销行政许可', type: 'adminPermit', partyA: '某企业', partyB: '某行政审批局', handler: '黄复议员', status: 'closed', date: '2023-10-15', fileCount: 8, updatedAt: '2023-10-15' },
                { id: 'j8', caseName: '刘某不服不予公开政府信息行政复议案', caseNumber: '穗行复〔2024〕0987号', cause: '不予公开政府信息', type: 'infoDisclosure', partyA: '刘某', partyB: '某区政府', handler: '林复议员', status: 'ongoing', date: '2024-11-28', fileCount: 2, updatedAt: '2024-11-28' },
                { id: 'j9', caseName: '周某不服食品药品处罚行政复议案', caseNumber: '穗行复〔2024〕0876号', cause: '食品药品处罚', type: 'adminPenalty', partyA: '周某', partyB: '某市场监管局', handler: '周复议员', status: 'pending', date: '2024-11-15', fileCount: 4, updatedAt: '2024-11-15' },
                { id: 'j10', caseName: '孙某不服行政强制拆除行政复议案', caseNumber: '穗行复〔2024〕0765号', cause: '行政强制拆除', type: 'adminCoercion', partyA: '孙某', partyB: '某城管局', handler: '吴复议员', status: 'pending', date: '2024-12-05', fileCount: 3, updatedAt: '2024-12-05' }
            ],
            causeOptions: [
                { cause: '治安拘留处罚', type: 'adminPenalty' },
                { cause: '工商行政处罚', type: 'adminPenalty' },
                { cause: '交通罚款处罚', type: 'adminPenalty' },
                { cause: '食品药品处罚', type: 'adminPenalty' },
                { cause: '环境污染处罚', type: 'adminPenalty' },
                { cause: '不予行政许可', type: 'adminPermit' },
                { cause: '撤销行政许可', type: 'adminPermit' },
                { cause: '行政查封扣押', type: 'adminCoercion' },
                { cause: '行政强制拆除', type: 'adminCoercion' },
                { cause: '不予公开政府信息', type: 'infoDisclosure' }
            ],
            docTitlePrefix: '广州市司法局'
        };

        Object.entries(businessSystems).forEach(([org, system]) => {
            if (org === '_dataVersion' || !system || !Array.isArray(system.cases)) return;
            // 补全文书类型与模板配置：合并默认配置中新增的类型/模板，不覆盖用户已有配置
            system.docTypes = Object.assign({}, defaultDocTypesByOrg[org] || {}, system.docTypes || {});
            system.docTemplates = Object.assign({}, defaultDocTemplatesByOrg[org] || {}, system.docTemplates || {});
            // v1.17: docTemplates 数据结构升级——字符串值统一转为对象 {name, docType, content}
            // v1.33: causes 字段不再写入，旧数据保留不删
            normalizeDocTemplates(org, system);
            // 合并管理后台自定义模板（localStorage.adminDocTemplates）
            mergeAdminDocTemplates(org, system);
            // v1.21: 合并管理后台自定义文书类型（localStorage.adminDocTypes）
            mergeAdminDocTypes(org, system);
            // v1.13: 合并用户侧自定义模板（localStorage.myDocTemplates）
            mergeMyDocTemplates(org, system);
            // v1.13: 司法局业务从调解改为行政复议，强制完整覆盖
            if (org === 'justice') {
                Object.assign(system, defaultJustice);
            }
            system.cases.forEach(c => {
                if (isDefaultCase(c.id)) {
                    c.filesInitialized = false;
                }
                // v1.16: 补全 createdBy 字段，旧数据默认取 handler
                if (!c.createdBy) {
                    c.createdBy = c.handler || '系统';
                }
                // v1.39: 多承办人迁移——有 handler 但无 handlers 时，由 handler 派生 handlers 数组
                if (!Array.isArray(c.handlers)) {
                    c.handlers = c.handler ? [c.handler] : [];
                } else if (c.handlers.length > 0 && !c.handler) {
                    // handlers 存在但 handler 缺失：补全 handler 为第一个
                    c.handler = c.handlers[0];
                }
            });
        });
        businessSystems._dataVersion = DATA_VERSION;
    }
    // 始终补全旧数据的 estimatedTokens，避免版本未升级时字段缺失
    fixEstimatedTokens();
}

// ===== 业务系统配置 =====
let businessSystems = {
    court: {
        name: '法院',
        label: '审判业务',
        partiesLabels: ['原告', '被告'],
        docTypes: {
            judgment: { name: '裁判文书', templates: ['judgment-civil-1st', 'judgment-civil-simple', 'ruling-civil', 'mediation-civil'] },
            trial: { name: '庭审提纲', templates: ['trial-outline', 'court-investigation-outline'] },
            execution: { name: '执行文书', templates: ['execution-notice', 'property-report', 'service-notice'] },
            materialSummary: { name: '材料总结', templates: [] }
        },
        docTemplates: {
            'judgment-civil-1st': '民事判决书（一审普通程序）',
            'judgment-civil-simple': '民事判决书（简易程序）',
            'ruling-civil': '民事裁定书',
            'mediation-civil': '民事调解书',
            'trial-outline': '庭审提纲',
            'court-investigation-outline': '法庭调查提纲',
            'execution-notice': '执行通知书',
            'property-report': '财产报告令',
            'service-notice': '送达回证'
        },
        statusConfig: {
            pending: '待开庭',
            ongoing: '审理中',
            closed: '已结案'
        },
        statsConfig: {
            total: { label: '全部案件', icon: 'fa-folder-open', color: 'blue' },
            pending: { label: '待开庭', icon: 'fa-clock', color: 'orange' },
            ongoing: { label: '审理中', icon: 'fa-gavel', color: 'purple' },
            closed: { label: '已结案', icon: 'fa-check-circle', color: 'green' }
        },
        cases: [
            { id: 'case1', caseName: '张三诉李四民间借贷纠纷案', caseNumber: '(2024)粤01民初12345号', cause: '民间借贷纠纷', type: 'contract', partyA: '张三', partyB: '李四', handler: '张法官', status: 'ongoing', date: '2024-12-15', fileCount: 3, updatedAt: '2024-12-15' },
            { id: 'case2', caseName: '广州某公司诉深圳某公司买卖合同纠纷案', caseNumber: '(2024)粤01民初12346号', cause: '买卖合同纠纷', type: 'contract', partyA: '广州某公司', partyB: '深圳某公司', handler: '李法官', status: 'pending', date: '2024-12-18', fileCount: 0, updatedAt: '2024-12-18' },
            { id: 'case3', caseName: '王五诉赵六房屋租赁合同纠纷案', caseNumber: '(2024)粤01民初12347号', cause: '房屋租赁合同纠纷', type: 'contract', partyA: '王五', partyB: '赵六', handler: '王法官', status: 'ongoing', date: '2024-12-10', fileCount: 5, updatedAt: '2024-12-10' },
            { id: 'case4', caseName: '陈某与某科技有限公司劳动争议案', caseNumber: '(2024)粤01民初11234号', cause: '劳动争议', type: 'labor', partyA: '陈某', partyB: '某科技有限公司', handler: '刘法官', status: 'closed', date: '2024-11-20', fileCount: 2, updatedAt: '2024-11-20' },
            { id: 'case5', caseName: '刘某诉保险公司机动车交通事故责任纠纷案', caseNumber: '(2024)粤01民初11235号', cause: '机动车交通事故责任纠纷', type: 'tort', partyA: '刘某', partyB: '保险公司', handler: '陈法官', status: 'ongoing', date: '2024-12-08', fileCount: 4, updatedAt: '2024-12-08' },
            { id: 'case6', caseName: '某银行诉周某民间借贷纠纷案', caseNumber: '(2024)粤01民初10086号', cause: '民间借贷纠纷', type: 'contract', partyA: '某银行', partyB: '周某', handler: '杨法官', status: 'pending', date: '2024-12-20', fileCount: 1, updatedAt: '2024-12-20' },
            { id: 'case7', caseName: '某建筑公司诉某房地产公司建设工程施工合同纠纷案', caseNumber: '(2023)粤01民终8765号', cause: '建设工程施工合同纠纷', type: 'contract', partyA: '某建筑公司', partyB: '某房地产公司', handler: '黄法官', status: 'closed', date: '2023-10-15', fileCount: 6, updatedAt: '2023-10-15', demoOverflow: true },
            { id: 'case8', caseName: '吴某诉郑某股权转让纠纷案', caseNumber: '(2024)粤01民初9876号', cause: '股权转让纠纷', type: 'contract', partyA: '吴某', partyB: '郑某', handler: '林法官', status: 'ongoing', date: '2024-11-28', fileCount: 3, updatedAt: '2024-11-28' },
            { id: 'case9', caseName: '林某与黄某离婚纠纷案', caseNumber: '(2024)粤01民初8765号', cause: '离婚纠纷', type: 'family', partyA: '林某', partyB: '黄某', handler: '周法官', status: 'ongoing', date: '2024-11-15', fileCount: 2, updatedAt: '2024-11-15' },
            { id: 'case10', caseName: '马某诉某媒体公司名誉权纠纷案', caseNumber: '(2024)粤01民初7654号', cause: '名誉权纠纷', type: 'tort', partyA: '马某', partyB: '某媒体公司', handler: '吴法官', status: 'pending', date: '2024-12-05', fileCount: 0, updatedAt: '2024-12-05' }
        ],
        causeOptions: [
            { cause: '民间借贷纠纷', type: 'contract' },
            { cause: '买卖合同纠纷', type: 'contract' },
            { cause: '房屋租赁合同纠纷', type: 'contract' },
            { cause: '建设工程施工合同纠纷', type: 'contract' },
            { cause: '股权转让纠纷', type: 'contract' },
            { cause: '劳动争议', type: 'labor' },
            { cause: '机动车交通事故责任纠纷', type: 'tort' },
            { cause: '名誉权纠纷', type: 'tort' },
            { cause: '离婚纠纷', type: 'family' },
            { cause: '继承纠纷', type: 'family' }
        ],
        docTitlePrefix: '广东省广州市中级人民法院'
    },
    procuratorate: {
        name: '检察院',
        label: '公诉业务',
        partiesLabels: ['犯罪嫌疑人', '被害人'],
        docTypes: {
            prosecution: { name: '检察文书', templates: ['prosecution-indictment', 'prosecution-notice', 'prosecution-recommendation', 'prosecution-transfer', 'prosecution-detention'] },
            nonProsecution: { name: '不起诉文书', templates: ['prosecution-decision'] },
            court: { name: '出庭文书', templates: ['prosecution-arraignment'] },
            materialSummary: { name: '材料总结', templates: [] }
        },
        docTemplates: {
            'prosecution-indictment': '起诉书',
            'prosecution-notice': '审查起诉告知书',
            'prosecution-decision': '不起诉决定书',
            'prosecution-recommendation': '量刑建议书',
            'prosecution-arraignment': '开庭通知书',
            'prosecution-transfer': '移送审查起诉意见书',
            'prosecution-detention': '批准逮捕决定书'
        },
        statusConfig: {
            pending: '审查起诉',
            ongoing: '已起诉',
            closed: '不起诉'
        },
        statsConfig: {
            total: { label: '全部案件', icon: 'fa-folder-open', color: 'blue' },
            pending: { label: '审查起诉', icon: 'fa-clock', color: 'orange' },
            ongoing: { label: '已起诉', icon: 'fa-gavel', color: 'purple' },
            closed: { label: '不起诉', icon: 'fa-check-circle', color: 'green' }
        },
        cases: [
            { id: 'p1', caseName: '陈某故意伤害案', caseNumber: '穗检诉刑诉〔2024〕1234号', cause: '故意伤害罪', type: 'criminal', partyA: '陈某', partyB: '李某', handler: '张检察官', status: 'ongoing', date: '2024-12-15', fileCount: 4, updatedAt: '2024-12-15' },
            { id: 'p2', caseName: '王某盗窃案', caseNumber: '穗检诉刑诉〔2024〕1235号', cause: '盗窃罪', type: 'criminal', partyA: '王某', partyB: '某商场', handler: '李检察官', status: 'pending', date: '2024-12-18', fileCount: 1, updatedAt: '2024-12-18' },
            { id: 'p3', caseName: '赵某诈骗案', caseNumber: '穗检诉刑诉〔2024〕1236号', cause: '诈骗罪', type: 'criminal', partyA: '赵某', partyB: '张某等', handler: '王检察官', status: 'ongoing', date: '2024-12-10', fileCount: 6, updatedAt: '2024-12-10' },
            { id: 'p4', caseName: '刘某交通肇事案', caseNumber: '穗检诉刑诉〔2024〕1123号', cause: '交通肇事罪', type: 'criminal', partyA: '刘某', partyB: '被害人亲属', handler: '刘检察官', status: 'closed', date: '2024-11-20', fileCount: 3, updatedAt: '2024-11-20' },
            { id: 'p5', caseName: '周某寻衅滋事案', caseNumber: '穗检诉刑诉〔2024〕1124号', cause: '寻衅滋事罪', type: 'criminal', partyA: '周某', partyB: '多人', handler: '陈检察官', status: 'ongoing', date: '2024-12-08', fileCount: 2, updatedAt: '2024-12-08' },
            { id: 'p6', caseName: '吴某非法拘禁案', caseNumber: '穗检诉刑诉〔2024〕1008号', cause: '非法拘禁罪', type: 'criminal', partyA: '吴某', partyB: '被害人', handler: '杨检察官', status: 'pending', date: '2024-12-20', fileCount: 0, updatedAt: '2024-12-20' },
            { id: 'p7', caseName: '黄某受贿案', caseNumber: '穗检诉刑诉〔2023〕8765号', cause: '受贿罪', type: 'criminal', partyA: '黄某', partyB: '国家', handler: '黄检察官', status: 'closed', date: '2023-10-15', fileCount: 5, updatedAt: '2023-10-15' },
            { id: 'p8', caseName: '郑某职务侵占案', caseNumber: '穗检诉刑诉〔2024〕9876号', cause: '职务侵占罪', type: 'criminal', partyA: '郑某', partyB: '某公司', handler: '林检察官', status: 'ongoing', date: '2024-11-28', fileCount: 4, updatedAt: '2024-11-28' },
            { id: 'p9', caseName: '周某妨害公务案', caseNumber: '穗检诉刑诉〔2024〕8765号', cause: '妨害公务罪', type: 'criminal', partyA: '周某', partyB: '执法人员', handler: '周检察官', status: 'ongoing', date: '2024-11-15', fileCount: 2, updatedAt: '2024-11-15' },
            { id: 'p10', caseName: '马某开设赌场案', caseNumber: '穗检诉刑诉〔2024〕7654号', cause: '开设赌场罪', type: 'criminal', partyA: '马某', partyB: '参赌人员', handler: '吴检察官', status: 'pending', date: '2024-12-05', fileCount: 1, updatedAt: '2024-12-05' }
        ],
        causeOptions: [
            { cause: '故意伤害罪', type: 'criminal' },
            { cause: '盗窃罪', type: 'criminal' },
            { cause: '诈骗罪', type: 'criminal' },
            { cause: '交通肇事罪', type: 'criminal' },
            { cause: '寻衅滋事罪', type: 'criminal' },
            { cause: '非法拘禁罪', type: 'criminal' },
            { cause: '受贿罪', type: 'criminal' },
            { cause: '职务侵占罪', type: 'criminal' },
            { cause: '妨害公务罪', type: 'criminal' },
            { cause: '开设赌场罪', type: 'criminal' }
        ],
        docTitlePrefix: '广州市人民检察院'
    },
    justice: {
        name: '司法局',
        label: '行政复议业务',
        partiesLabels: ['申请人', '被申请人'],
        docTypes: {
            reconsideration: { name: '行政复议决定书', templates: ['reconsideration-decision', 'reconsideration-maintain', 'reconsideration-revoke', 'reconsideration-change', 'reconsideration-confirm'] },
            notice: { name: '行政复议通知书', templates: ['reconsideration-accept-notice', 'reconsideration-reply-notice', 'reconsideration-hearing-notice'] },
            materialSummary: { name: '材料总结', templates: [] }
        },
        docTemplates: {
            'reconsideration-decision': '行政复议决定书（通用）',
            'reconsideration-maintain': '行政复议决定书（维持）',
            'reconsideration-revoke': '行政复议决定书（撤销）',
            'reconsideration-change': '行政复议决定书（变更）',
            'reconsideration-confirm': '行政复议决定书（确认违法）',
            'reconsideration-accept-notice': '行政复议受理通知书',
            'reconsideration-reply-notice': '行政复议答复通知书',
            'reconsideration-hearing-notice': '行政复议听证通知书'
        },
        statusConfig: {
            pending: '待审理',
            ongoing: '审理中',
            closed: '已审结'
        },
        statsConfig: {
            total: { label: '全部案件', icon: 'fa-folder-open', color: 'blue' },
            pending: { label: '待审理', icon: 'fa-clock', color: 'orange' },
            ongoing: { label: '审理中', icon: 'fa-users', color: 'purple' },
            closed: { label: '已审结', icon: 'fa-check-circle', color: 'green' }
        },
        cases: [
            { id: 'j1', caseName: '张某不服治安拘留处罚行政复议案', caseNumber: '穗行复〔2024〕0123号', cause: '治安拘留处罚', type: 'adminPenalty', partyA: '张某', partyB: '某公安分局', handler: '李复议员', status: 'ongoing', date: '2024-12-15', fileCount: 3, updatedAt: '2024-12-15' },
            { id: 'j2', caseName: '某公司不服工商行政处罚行政复议案', caseNumber: '穗行复〔2024〕0124号', cause: '工商行政处罚', type: 'adminPenalty', partyA: '某公司', partyB: '某市场监管局', handler: '王复议员', status: 'pending', date: '2024-12-18', fileCount: 5, updatedAt: '2024-12-18' },
            { id: 'j3', caseName: '李某不服交通罚款处罚行政复议案', caseNumber: '穗行复〔2024〕0125号', cause: '交通罚款处罚', type: 'adminPenalty', partyA: '李某', partyB: '某交警支队', handler: '张复议员', status: 'ongoing', date: '2024-12-10', fileCount: 2, updatedAt: '2024-12-10' },
            { id: 'j4', caseName: '赵某不服不予行政许可行政复议案', caseNumber: '穗行复〔2024〕0112号', cause: '不予行政许可', type: 'adminPermit', partyA: '赵某', partyB: '某住建局', handler: '刘复议员', status: 'closed', date: '2024-11-20', fileCount: 4, updatedAt: '2024-11-20' },
            { id: 'j5', caseName: '陈某不服行政查封扣押行政复议案', caseNumber: '穗行复〔2024〕0113号', cause: '行政查封扣押', type: 'adminCoercion', partyA: '陈某', partyB: '某综合执法局', handler: '陈复议员', status: 'ongoing', date: '2024-12-08', fileCount: 3, updatedAt: '2024-12-08' },
            { id: 'j6', caseName: '王某不服环境污染处罚行政复议案', caseNumber: '穗行复〔2024〕0108号', cause: '环境污染处罚', type: 'adminPenalty', partyA: '王某', partyB: '某生态环境局', handler: '杨复议员', status: 'pending', date: '2024-12-20', fileCount: 6, updatedAt: '2024-12-20' },
            { id: 'j7', caseName: '某企业不服撤销行政许可行政复议案', caseNumber: '穗行复〔2023〕0876号', cause: '撤销行政许可', type: 'adminPermit', partyA: '某企业', partyB: '某行政审批局', handler: '黄复议员', status: 'closed', date: '2023-10-15', fileCount: 8, updatedAt: '2023-10-15' },
            { id: 'j8', caseName: '刘某不服不予公开政府信息行政复议案', caseNumber: '穗行复〔2024〕0987号', cause: '不予公开政府信息', type: 'infoDisclosure', partyA: '刘某', partyB: '某区政府', handler: '林复议员', status: 'ongoing', date: '2024-11-28', fileCount: 2, updatedAt: '2024-11-28' },
            { id: 'j9', caseName: '周某不服食品药品处罚行政复议案', caseNumber: '穗行复〔2024〕0876号', cause: '食品药品处罚', type: 'adminPenalty', partyA: '周某', partyB: '某市场监管局', handler: '周复议员', status: 'pending', date: '2024-11-15', fileCount: 4, updatedAt: '2024-11-15' },
            { id: 'j10', caseName: '孙某不服行政强制拆除行政复议案', caseNumber: '穗行复〔2024〕0765号', cause: '行政强制拆除', type: 'adminCoercion', partyA: '孙某', partyB: '某城管局', handler: '吴复议员', status: 'pending', date: '2024-12-05', fileCount: 3, updatedAt: '2024-12-05' }
        ],
        causeOptions: [
            { cause: '治安拘留处罚', type: 'adminPenalty' },
            { cause: '工商行政处罚', type: 'adminPenalty' },
            { cause: '交通罚款处罚', type: 'adminPenalty' },
            { cause: '食品药品处罚', type: 'adminPenalty' },
            { cause: '环境污染处罚', type: 'adminPenalty' },
            { cause: '不予行政许可', type: 'adminPermit' },
            { cause: '撤销行政许可', type: 'adminPermit' },
            { cause: '行政查封扣押', type: 'adminCoercion' },
            { cause: '行政强制拆除', type: 'adminCoercion' },
            { cause: '不予公开政府信息', type: 'infoDisclosure' }
        ],
        docTitlePrefix: '广州市司法局'
    }
};

// 当前业务系统（全局共享，供案件列表与材料页使用）
let currentBusiness = 'court';
function getCurrentBusiness() { return businessSystems[currentBusiness]; }
function getCurrentCases() { return getCurrentBusiness().cases; }
function getCurrentTemplates() { return getCurrentBusiness().docTemplates; }

// v1.40: 幂等追加法院 mock 案件（case_extra_1~case_extra_28），用于验证案件列表真实分页
// 仅追加，不修改现有 case1~case10；不设置 documents（保持简洁），filesInitialized 留空由 generateCaseFiles 生成 3-15 个材料
function ensureExtraCases() {
    const court = businessSystems.court;
    if (!court || !Array.isArray(court.cases)) return;
    // 幂等：已标记追加过则跳过，避免覆盖用户删除（含硬删除后重载不再重新追加）
    if (localStorage.getItem('extraCasesAdded_v1_40') === '1') return;
    // 兜底：旧数据已存在 case_extra_ 但未设标记，补标记并跳过
    if (court.cases.some(c => c.id && String(c.id).indexOf('case_extra_') === 0)) {
        localStorage.setItem('extraCasesAdded_v1_40', '1');
        return;
    }
    const extra = [
        { id: 'case_extra_1', caseName: '张三诉李四民间借贷纠纷案', caseNumber: '(2025)粤01民初2001号', cause: '民间借贷纠纷', type: 'contract', partyA: '张三', partyB: '李四', handler: '张法官', status: 'ongoing', date: '2026-07-28', updatedAt: '2026-07-28', caseWord: '民初', fileCount: 3 },
        { id: 'case_extra_2', caseName: '王五诉赵六机动车交通事故责任纠纷案', caseNumber: '(2025)粤01民初2002号', cause: '机动车交通事故责任纠纷', type: 'tort', partyA: '王五', partyB: '赵六', handler: '李法官', status: 'ongoing', date: '2026-07-25', updatedAt: '2026-07-25', caseWord: '民初', fileCount: 5 },
        { id: 'case_extra_3', caseName: '陈七与某科技有限公司劳动争议案', caseNumber: '(2025)粤01民初2003号', cause: '劳动争议', type: 'labor', partyA: '陈七', partyB: '某科技有限公司', handler: '王法官', status: 'pending', date: '2026-07-22', updatedAt: '2026-07-22', caseWord: '民初', fileCount: 8 },
        { id: 'case_extra_4', caseName: '周八诉吴九离婚纠纷案', caseNumber: '(2025)粤01民初2004号', cause: '离婚纠纷', type: 'family', partyA: '周八', partyB: '吴九', handler: '刘法官', status: 'ongoing', date: '2026-07-18', updatedAt: '2026-07-18', caseWord: '民初', fileCount: 4 },
        { id: 'case_extra_5', caseName: '郑十诉孙十一房屋租赁合同纠纷案', caseNumber: '(2025)粤01民初2005号', cause: '房屋租赁合同纠纷', type: 'contract', partyA: '郑十', partyB: '孙十一', handler: '陈法官', status: 'pending', date: '2026-07-15', updatedAt: '2026-07-15', caseWord: '民初', fileCount: 6 },
        { id: 'case_extra_6', caseName: '钱十二诉冯十三买卖合同纠纷案', caseNumber: '(2025)粤01民初2006号', cause: '买卖合同纠纷', type: 'contract', partyA: '钱十二', partyB: '冯十三', handler: '杨法官', status: 'ongoing', date: '2026-07-12', updatedAt: '2026-07-12', caseWord: '民初', fileCount: 10 },
        { id: 'case_extra_7', caseName: '褚十四诉卫十五侵权责任纠纷案', caseNumber: '(2025)粤01民初2007号', cause: '侵权责任纠纷', type: 'tort', partyA: '褚十四', partyB: '卫十五', handler: '黄法官', status: 'closed', date: '2026-07-08', updatedAt: '2026-07-08', caseWord: '民初', fileCount: 7 },
        { id: 'case_extra_8', caseName: '蒋十六诉某物业公司物业服务合同纠纷案', caseNumber: '(2025)粤01民初2008号', cause: '物业服务合同纠纷', type: 'contract', partyA: '蒋十六', partyB: '某物业公司', handler: '林法官', status: 'ongoing', date: '2026-07-05', updatedAt: '2026-07-05', caseWord: '民初', fileCount: 12 },
        { id: 'case_extra_9', caseName: '沈十七诉某银行信用卡纠纷案', caseNumber: '(2025)粤01民初2009号', cause: '信用卡纠纷', type: 'contract', partyA: '沈十七', partyB: '某银行', handler: '周法官', status: 'pending', date: '2026-07-02', updatedAt: '2026-07-02', caseWord: '民初', fileCount: 5 },
        { id: 'case_extra_10', caseName: '韩十八诉某区政府拆迁安置补偿纠纷案', caseNumber: '(2025)粤01民初2010号', cause: '拆迁安置补偿纠纷', type: 'civil', partyA: '韩十八', partyB: '某区政府', handler: '吴法官', status: 'ongoing', date: '2026-06-28', updatedAt: '2026-06-28', caseWord: '民初', fileCount: 9 },
        { id: 'case_extra_11', caseName: '杨十九诉朱二十民间借贷纠纷案', caseNumber: '(2025)粤01民终2011号', cause: '民间借贷纠纷', type: 'contract', partyA: '杨十九', partyB: '朱二十', handler: '张法官', status: 'ongoing', date: '2026-06-25', updatedAt: '2026-06-25', caseWord: '民终', fileCount: 6 },
        { id: 'case_extra_12', caseName: '秦廿诉某运输公司机动车交通事故责任纠纷案', caseNumber: '(2025)粤01民终2012号', cause: '机动车交通事故责任纠纷', type: 'tort', partyA: '秦廿', partyB: '某运输公司', handler: '李法官', status: 'closed', date: '2026-06-22', updatedAt: '2026-06-22', caseWord: '民终', fileCount: 14 },
        { id: 'case_extra_13', caseName: '尤廿一与某制造公司劳动争议案', caseNumber: '(2025)粤01民终2013号', cause: '劳动争议', type: 'labor', partyA: '尤廿一', partyB: '某制造公司', handler: '王法官', status: 'ongoing', date: '2026-06-18', updatedAt: '2026-06-18', caseWord: '民终', fileCount: 4 },
        { id: 'case_extra_14', caseName: '张三诉李四继承纠纷案', caseNumber: '(2025)粤01民初2014号', cause: '继承纠纷', type: 'family', partyA: '张三', partyB: '李四', handler: '刘法官', status: 'pending', date: '2026-06-15', updatedAt: '2026-06-15', caseWord: '民初', fileCount: 8 },
        { id: 'case_extra_15', caseName: '王五诉赵六房屋租赁合同纠纷案', caseNumber: '(2025)粤01民终2015号', cause: '房屋租赁合同纠纷', type: 'contract', partyA: '王五', partyB: '赵六', handler: '陈法官', status: 'closed', date: '2026-06-12', updatedAt: '2026-06-12', caseWord: '民终', fileCount: 11 },
        { id: 'case_extra_16', caseName: '某商贸公司诉某物流公司买卖合同纠纷案', caseNumber: '(2025)粤01民初2016号', cause: '买卖合同纠纷', type: 'contract', partyA: '某商贸公司', partyB: '某物流公司', handler: '杨法官', status: 'ongoing', date: '2026-06-08', updatedAt: '2026-06-08', caseWord: '民初', fileCount: 7 },
        { id: 'case_extra_17', caseName: '陈七诉周八名誉权纠纷案', caseNumber: '(2025)粤01民初2017号', cause: '名誉权纠纷', type: 'tort', partyA: '陈七', partyB: '周八', handler: '黄法官', status: 'pending', date: '2026-06-05', updatedAt: '2026-06-05', caseWord: '民初', fileCount: 5 },
        { id: 'case_extra_18', caseName: '吴九诉某开发商商品房买卖合同纠纷案', caseNumber: '(2025)粤01民初2018号', cause: '商品房买卖合同纠纷', type: 'contract', partyA: '吴九', partyB: '某开发商', handler: '林法官', status: 'ongoing', date: '2026-06-02', updatedAt: '2026-06-02', caseWord: '民初', fileCount: 13 },
        { id: 'case_extra_19', caseName: '郑十诉某保险股份有限公司财产保险合同纠纷案', caseNumber: '(2025)粤01民初2019号', cause: '财产保险合同纠纷', type: 'contract', partyA: '郑十', partyB: '某保险股份有限公司', handler: '周法官', status: 'closed', date: '2026-05-28', updatedAt: '2026-05-28', caseWord: '民初', fileCount: 6 },
        { id: 'case_extra_20', caseName: '孙十一诉钱十二借款合同纠纷案', caseNumber: '(2025)粤01民初2020号', cause: '借款合同纠纷', type: 'contract', partyA: '孙十一', partyB: '钱十二', handler: '吴法官', status: 'ongoing', date: '2026-05-25', updatedAt: '2026-05-25', caseWord: '民初', fileCount: 9 },
        { id: 'case_extra_21', caseName: '冯十三诉某餐饮公司提供劳务者受害责任纠纷案', caseNumber: '(2025)粤01民初2021号', cause: '提供劳务者受害责任纠纷', type: 'tort', partyA: '冯十三', partyB: '某餐饮公司', handler: '张法官', status: 'pending', date: '2026-05-22', updatedAt: '2026-05-22', caseWord: '民初', fileCount: 4 },
        { id: 'case_extra_22', caseName: '褚十四诉卫十五相邻关系纠纷案', caseNumber: '(2025)粤01民初2022号', cause: '相邻关系纠纷', type: 'civil', partyA: '褚十四', partyB: '卫十五', handler: '李法官', status: 'ongoing', date: '2026-05-18', updatedAt: '2026-05-18', caseWord: '民初', fileCount: 7 },
        { id: 'case_extra_23', caseName: '蒋十六诉某医院医疗损害责任纠纷案', caseNumber: '(2025)粤01民初2023号', cause: '医疗损害责任纠纷', type: 'tort', partyA: '蒋十六', partyB: '某医院', handler: '陈法官', status: 'ongoing', date: '2026-05-15', updatedAt: '2026-05-15', caseWord: '民初', fileCount: 10 },
        { id: 'case_extra_24', caseName: '沈十七诉韩十八赡养费纠纷案', caseNumber: '(2025)粤01民初2024号', cause: '赡养费纠纷', type: 'family', partyA: '沈十七', partyB: '韩十八', handler: '黄法官', status: 'closed', date: '2026-05-12', updatedAt: '2026-05-12', caseWord: '民初', fileCount: 3 },
        { id: 'case_extra_25', caseName: '杨十九诉某装修公司装饰装修合同纠纷案', caseNumber: '(2025)粤01民初2025号', cause: '装饰装修合同纠纷', type: 'contract', partyA: '杨十九', partyB: '某装修公司', handler: '林法官', status: 'ongoing', date: '2026-05-08', updatedAt: '2026-05-08', caseWord: '民初', fileCount: 8 },
        { id: 'case_extra_26', caseName: '朱二十诉秦廿房屋买卖合同纠纷案', caseNumber: '(2025)粤01民终2026号', cause: '房屋买卖合同纠纷', type: 'contract', partyA: '朱二十', partyB: '秦廿', handler: '周法官', status: 'pending', date: '2026-05-05', updatedAt: '2026-05-05', caseWord: '民终', fileCount: 12 },
        { id: 'case_extra_27', caseName: '尤廿一诉某电商公司网络购物合同纠纷案', caseNumber: '(2025)粤01民初2027号', cause: '网络购物合同纠纷', type: 'contract', partyA: '尤廿一', partyB: '某电商公司', handler: '吴法官', status: 'ongoing', date: '2026-05-02', updatedAt: '2026-05-02', caseWord: '民初', fileCount: 6 },
        { id: 'case_extra_28', caseName: '张三诉某人力资源公司劳务合同纠纷案', caseNumber: '(2025)粤01民初2028号', cause: '劳务合同纠纷', type: 'labor', partyA: '张三', partyB: '某人力资源公司', handler: '张法官', status: 'pending', date: '2026-05-01', updatedAt: '2026-05-01', caseWord: '民初', fileCount: 15 }
    ];
    // 补全 handlers 数组与 documents 空数组（不生成文书，保持简洁）
    extra.forEach(c => {
        c.handlers = [c.handler];
        c.documents = [];
        // filesInitialized 留空，由 initCaseData 的 generateCaseFiles 生成 3-15 个材料
    });
    court.cases.push(...extra);
    localStorage.setItem('extraCasesAdded_v1_40', '1');
}

// 初始化案件文件与文书数据
function initCaseData() {
    Object.entries(businessSystems).forEach(([org, system]) => {
        if (org === '_dataVersion' || !system || !Array.isArray(system.cases)) return;
        // v1.24: 合并默认 docTypes/docTemplates 并 normalize，每次加载都执行（幂等）
        // 修复：旧数据可能存储字符串形式模板，需转为对象并补全 docType 字段
        system.docTypes = Object.assign({}, defaultDocTypesByOrg[org] || {}, system.docTypes || {});
        system.docTemplates = Object.assign({}, defaultDocTemplatesByOrg[org] || {}, system.docTemplates || {});
        normalizeDocTemplates(org, system);
        mergeAdminDocTemplates(org, system);
        mergeAdminDocTypes(org, system);
        mergeMyDocTemplates(org, system);
        const caseWords = caseWordListByOrg[org];
        system.cases.forEach(c => {
            // v1.39: 幂等补全 handlers 数组（多承办人），每次加载都执行
            // 覆盖首次加载的默认数据（无 handlers）与版本未升级场景
            if (!Array.isArray(c.handlers)) {
                c.handlers = c.handler ? [c.handler] : [];
            } else if (c.handlers.length > 0 && !c.handler) {
                c.handler = c.handlers[0];
            }
            if (!c.caseWord && caseWords && caseWords.length) {
                c.caseWord = caseWords[Math.floor(Math.random() * caseWords.length)];
            }
            if (!c.documents) {
                c.documents = [];
                const docCount = Math.floor(Math.random() * 3);
                const docNames = ['起诉书', '答辩状', '代理词', '质证意见', '法律意见书', '调解方案'];
                for (let i = 0; i < docCount; i++) {
                    const title = `${c.caseName}_${docNames[Math.floor(Math.random() * docNames.length)]}`;
                    c.documents.push({
                        id: `${c.id}_doc_${i + 1}`,
                        title,
                        docType: 'judgment',
                        createdAt: c.updatedAt,
                        // v1.36: 版本数据结构升级，新增 genMethod/source/操作人/配置快照字段
                        versions: [{
                            versionId: `v1_${Date.now()}_${i}`,
                            type: 'original',           // original=首次生成 / polish=精修 / regenerate=重新生成
                            genMethod: 'material',       // material=一步生成 / step=分步生成
                            source: 'ai',                // ai=AI生成 / manual=手动导入
                            content: `<div style="font-family:'SimSun',serif;line-height:2;text-align:justify;"><h2 style="text-align:center;font-size:20pt;font-weight:bold;margin-bottom:24px;">${title}</h2><p style="text-indent:2em;margin-bottom:10px;">本文书为系统示例初稿内容，用于演示文书管理、精修与版本对比功能。</p><p style="text-indent:2em;margin-bottom:10px;">案件名称：${c.caseName}。</p><p style="text-indent:2em;margin-bottom:10px;">案由：${c.cause || '-'}。</p><p style="text-align:right;margin-bottom:20px;">生成时间：${c.updatedAt}</p></div>`,
                            createdAt: c.updatedAt,
                            createdBy: c.handler || getCurrentUserName(),
                            // 配置快照（用于重新配置回填）
                            config: {
                                docType: 'judgment',
                                template: '',
                                prompt: '',
                                modelId: DEFAULT_MODEL_ID,
                                materialIds: []
                            }
                        }]
                    });
                }
            }
            // v1.36/v1.37/v1.38: 旧数据迁移——给已存在的 documents.versions 补全新字段（幂等）
            // v1.37: 增强迁移——把旧 doc 上的 template/requirement/model/genMethod/selectedMaterialIds 迁移到 version.config
            // v1.38: 修复——旧文书若仅有 doc 级 content（无 versions），转为一个版本，避免 getAllDocumentVersions 返回空
            if (Array.isArray(c.documents)) {
                c.documents.forEach(doc => {
                    if (!doc) return;
                    if (!doc.docType) doc.docType = 'judgment';
                    if (!Array.isArray(doc.versions)) doc.versions = [];
                    // v1.38: 旧结构兼容——versions 为空但 doc 上有 content 时，将 doc 级字段封装为一个版本
                    if (doc.versions.length === 0 && doc.content) {
                        doc.versions.push({
                            versionId: `v1_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                            type: 'original',
                            genMethod: doc.genMethod || 'material',
                            source: 'ai',
                            content: doc.content,
                            createdAt: doc.createdAt || new Date().toISOString(),
                            createdBy: c.handler || getCurrentUserName(),
                            config: {
                                docType: doc.docType || 'judgment',
                                template: doc.template || '',
                                prompt: doc.requirement || '',
                                modelId: doc.model || DEFAULT_MODEL_ID,
                                materialIds: doc.selectedMaterialIds || [],
                                materialTokens: 0,
                                stepsSnapshot: null
                            }
                        });
                    }
                    doc.versions.forEach((v, idx) => {
                        if (!v.versionId) v.versionId = `v${idx + 1}_${Date.now()}_${idx}`;
                        if (!v.genMethod) v.genMethod = doc.genMethod || (v.type === 'polish' ? 'material' : 'material');
                        if (!v.source) v.source = 'ai';
                        if (!v.createdBy) v.createdBy = c.handler || getCurrentUserName();
                        if (!v.config || !v.config.docType) {
                            v.config = {
                                docType: doc.docType || 'judgment',
                                template: doc.template || v.config?.template || '',
                                prompt: doc.requirement || v.config?.prompt || '',
                                modelId: doc.model || v.config?.modelId || DEFAULT_MODEL_ID,
                                materialIds: doc.selectedMaterialIds || v.config?.materialIds || [],
                                materialTokens: v.config?.materialTokens || 0,
                                stepsSnapshot: v.config?.stepsSnapshot || null
                            };
                        }
                    });
                });
            }
            // 仅对未初始化过的案件生成示例材料，避免覆盖用户手动删除后的空状态
            if (!c.filesInitialized) {
                generateCaseFiles(c, org);
                c.filesInitialized = true;
            }
            // 为 case7 补充大量演示材料，用于展示分步生成效果
            ensureConstructionCaseDemoFiles(c);
            // v1.36: 旧数据迁移——给已存在的 files 补 parseStatus/errorType/parsedAt 字段（幂等）
            if (Array.isArray(c.files)) {
                c.files.forEach(f => {
                    if (!f) return;
                    if (!f.parseStatus) {
                        // ocrStatus → parseStatus 映射
                        f.parseStatus = f.ocrStatus === 'done' ? 'success'
                            : (f.ocrStatus === 'pending' ? 'parsing'
                            : (f.ocrStatus === 'error' ? 'error' : 'success'));
                    }
                    if (!f.errorType) {
                        f.errorType = f.parseStatus === 'error' ? 'other' : null;
                    }
                    if (!f.parsedAt && f.parseStatus === 'success') {
                        f.parsedAt = f.updatedAt || c.updatedAt;
                    }
                });
            }
            // 同步 fileCount 与 files 长度
            c.fileCount = (c.files || []).length;
        });
    });
    // v1.9: 清理历史数据中残留的 icon 字段（文书类型与 workflow 步骤）
    cleanupIconFields();
}

// v1.9: 清理 localStorage 中残留的 icon 字段（幂等，每次加载执行）
function cleanupIconFields() {
    // 1. 清理 businessSystems 内存对象中 docTypes 残留的 icon
    try {
        Object.entries(businessSystems).forEach(([org, system]) => {
            if (org === '_dataVersion' || !system || !system.docTypes) return;
            Object.values(system.docTypes).forEach(t => {
                if (t && typeof t === 'object' && 'icon' in t) delete t.icon;
            });
        });
    } catch (e) { console.error('[case-data] cleanupIconFields(businessSystems) 失败:', e); }

    // 2. 清理 localStorage.adminDocTypes 中残留的 icon
    try {
        const all = JSON.parse(localStorage.getItem('adminDocTypes')) || {};
        let changed = false;
        Object.values(all).forEach(types => {
            if (!types || typeof types !== 'object') return;
            Object.values(types).forEach(t => {
                if (t && typeof t === 'object' && 'icon' in t) { delete t.icon; changed = true; }
            });
        });
        if (changed) localStorage.setItem('adminDocTypes', JSON.stringify(all));
    } catch (e) { console.error('[case-data] cleanupIconFields(adminDocTypes) 失败:', e); }

    // 3. 清理 localStorage.adminWorkflows 中 steps 残留的 icon
    try {
        const all = JSON.parse(localStorage.getItem('adminWorkflows')) || {};
        let changed = false;
        Object.values(all).forEach(docTypes => {
            if (!docTypes || typeof docTypes !== 'object') return;
            Object.values(docTypes).forEach(wfs => {
                if (!Array.isArray(wfs)) return;
                wfs.forEach(wf => {
                    if (wf && Array.isArray(wf.steps)) {
                        wf.steps.forEach(s => {
                            if (s && typeof s === 'object' && 'icon' in s) { delete s.icon; changed = true; }
                        });
                    }
                });
            });
        });
        if (changed) localStorage.setItem('adminWorkflows', JSON.stringify(all));
    } catch (e) { console.error('[case-data] cleanupIconFields(adminWorkflows) 失败:', e); }
}

const CASE_DATA_KEY = 'caseAssistant_businessSystems';
const HISTORY_TASKS_KEY = 'caseAssistant_historyTasks';

// v1.36: 解析状态工具函数（兼容老数据）
// 返回 'uploading' | 'parsing' | 'success' | 'error'
function getParseStatus(file) {
    if (!file) return 'success';
    if (file.parseStatus) return file.parseStatus;
    // 老数据无 parseStatus 时按 ocrStatus 推断
    if (file.ocrStatus === 'done') return 'success';
    if (file.ocrStatus === 'pending') return 'parsing';
    if (file.ocrStatus === 'error') return 'error';
    return 'success';
}

// v1.36: 解析异常类型文案映射
const PARSE_ERROR_TYPE_LABELS = {
    format_unsupported: '格式不支持',
    file_corrupted: '文件损坏',
    ocr_failed: 'OCR 解析失败',
    empty_content: '内容为空',
    other: '解析异常'
};
function getParseErrorLabel(errorType) {
    return PARSE_ERROR_TYPE_LABELS[errorType] || '解析异常';
}

// v1.36: 统计案件文件的解析状态
// 返回 { total, success, parsing, error, errorFiles }
function getCaseParseStats(caseItem) {
    const files = (caseItem && caseItem.files) || [];
    const stats = { total: files.length, success: 0, parsing: 0, error: 0, errorFiles: [] };
    files.forEach(f => {
        const s = getParseStatus(f);
        if (s === 'success') stats.success++;
        else if (s === 'parsing') stats.parsing++;
        else if (s === 'error') {
            stats.error++;
            stats.errorFiles.push(f);
        }
    });
    return stats;
}

// v1.36: 启动 mock 解析流程（上传后调用）
// 文件设为 parsing 状态，延时 2-3 秒后随机转为 success 或 error
function startMockParsing(caseId, fileId) {
    const result = findCaseById(caseId);
    if (!result) return;
    const f = (result.caseItem.files || []).find(x => x.id === fileId);
    if (!f) return;
    f.parseStatus = 'parsing';
    f.ocrStatus = 'pending';
    saveBusinessSystems();

    const delay = 2000 + Math.random() * 1000; // 2-3 秒
    setTimeout(() => {
        const refreshed = findCaseById(caseId);
        if (!refreshed) return;
        const file = (refreshed.caseItem.files || []).find(x => x.id === fileId);
        if (!file) return;
        // 85% 概率成功，15% 失败
        const isSuccess = Math.random() > 0.15;
        if (isSuccess) {
            file.parseStatus = 'success';
            file.ocrStatus = 'done';
            file.parsedAt = new Date().toISOString().split('T')[0];
            file.errorType = null;
        } else {
            file.parseStatus = 'error';
            file.ocrStatus = 'error';
            const errorTypes = ['format_unsupported', 'file_corrupted', 'ocr_failed', 'empty_content', 'other'];
            file.errorType = errorTypes[Math.floor(Math.random() * errorTypes.length)];
        }
        saveBusinessSystems();
        // 通知页面刷新（如果有监听）
        window.dispatchEvent(new CustomEvent('case-file-parse-updated', {
            detail: { caseId, fileId, parseStatus: file.parseStatus }
        }));
    }, delay);
}

// v2.23 (任务 8.9): 数据持久化失败处理
// localStorage 写入增加 try-catch 保护，失败时展示提示并提供重试
let _saveRetryQueue = [];

function saveBusinessSystems() {
    try {
        localStorage.setItem(CASE_DATA_KEY, JSON.stringify(businessSystems));
    } catch (e) {
        console.error('[saveBusinessSystems] 持久化失败:', e);
        handlePersistFailure('saveBusinessSystems');
    }
}

// 持久化失败统一处理
function handlePersistFailure(fnName) {
    // 避免重复弹框
    if (document.getElementById('persistFailModal')) return;
    const modal = document.createElement('div');
    modal.id = 'persistFailModal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-container" style="max-width:420px;">
            <div class="modal-header">
                <h3><i class="fas fa-exclamation-triangle" style="color:#dc2626;"></i> 数据保存失败</h3>
                <button class="modal-close" onclick="this.closest('.modal-overlay').remove()"><i class="fas fa-times"></i></button>
            </div>
            <div class="modal-body">
                <p>数据保存失败，可能是浏览器存储空间已满。</p>
                <p style="font-size:13px;color:#6b7280;margin-top:8px;">数据仍保留在当前页面内存中，刷新页面将丢失。建议点击"重试"重新保存。</p>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="dismissPersistFail()">稍后处理</button>
                <button class="btn btn-primary" onclick="retryPersist()"><i class="fas fa-redo"></i> 重试</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function retryPersist() {
    const modal = document.getElementById('persistFailModal');
    if (modal) modal.remove();
    try {
        localStorage.setItem(CASE_DATA_KEY, JSON.stringify(businessSystems));
        showNotification('数据保存成功', 'success');
    } catch (e) {
        console.error('[retryPersist] 仍失败:', e);
        showNotification('重试失败，请清理浏览器存储空间后重试', 'error');
        handlePersistFailure('retryPersist');
    }
}

function dismissPersistFail() {
    const modal = document.getElementById('persistFailModal');
    if (modal) modal.remove();
    showNotification('数据仅保留在内存中，刷新后将丢失', 'warning');
}

function loadHistoryTasks() {
    const saved = localStorage.getItem(HISTORY_TASKS_KEY);
    if (saved) {
        try {
            return JSON.parse(saved);
        } catch (e) {
            console.error('加载历史任务失败', e);
        }
    }
    return [];
}

function saveHistoryTasks(tasks) {
    localStorage.setItem(HISTORY_TASKS_KEY, JSON.stringify(tasks));
}

function addHistoryTask(task) {
    const tasks = loadHistoryTasks();
    tasks.unshift({
        id: `task_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        createdAt: new Date().toISOString(),
        status: 'completed',
        ...task
    });
    // 最多保留 200 条
    if (tasks.length > 200) tasks.length = 200;
    saveHistoryTasks(tasks);
    return tasks[0];
}

function getHistoryTasks() {
    return loadHistoryTasks();
}

function loadBusinessSystems() {
    const saved = localStorage.getItem(CASE_DATA_KEY);
    if (saved) {
        try {
            businessSystems = JSON.parse(saved);
            return true;
        } catch (e) {
            console.error('加载案件数据失败', e);
        }
    }
    return false;
}

function findCaseById(caseId) {
    for (const org of Object.keys(businessSystems)) {
        if (org === '_dataVersion') continue;
        const system = businessSystems[org];
        if (!system || !Array.isArray(system.cases)) continue;
        const caseItem = system.cases.find(c => c.id === caseId);
        if (caseItem) return { org, caseItem };
    }
    return null;
}

function getOrgByCaseId(caseId) {
    const result = findCaseById(caseId);
    return result ? result.org : null;
}

// ===== v1.37: 文书版本管理工具函数（任务 4.2） =====
// 数据结构：caseItem.documents = [{ id, title, docType, versions: [version, ...] }]
// version = { versionId, type, genMethod, source, content, createdAt, createdBy, config }

/**
 * 获取案件的指定文书类型下的最新版本
 * @param {string} caseId
 * @param {string} docType
 * @returns {object|null} version 对象或 null
 */
function getLatestVersion(caseId, docType) {
    const result = findCaseById(caseId);
    if (!result) return null;
    const doc = (result.caseItem.documents || []).find(d => d.docType === docType);
    if (!doc || !Array.isArray(doc.versions) || doc.versions.length === 0) return null;
    return doc.versions[0]; // versions 按时间倒序，第一条为最新
}

/**
 * 获取案件下所有文书版本（扁平化，用于历史文书列表展示）
 * 每条返回 { ...version, docId, docType, title, versionIndex }
 * @param {string} caseId
 * @returns {Array} 按生成时间倒序
 */
function getAllDocumentVersions(caseId) {
    const result = findCaseById(caseId);
    if (!result || !result.caseItem) return [];
    const docs = result.caseItem.documents || [];
    const list = [];
    docs.forEach(doc => {
        if (!doc || !Array.isArray(doc.versions)) return;
        doc.versions.forEach((v, idx) => {
            list.push({
                ...v,
                docId: doc.id,
                docType: doc.docType,
                title: doc.title,
                versionIndex: idx + 1,
                versionTotal: doc.versions.length
            });
        });
    });
    // 按生成时间倒序
    list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return list;
}

/**
 * 追加文书新版本（按 docType 合并，不覆盖已有版本）
 * @param {string} caseId
 * @param {object} versionData - { type, genMethod, source, content, createdBy, config }
 * @returns {object} 保存后的 version 对象（含 versionId/createdAt）
 */
function addDocumentVersion(caseId, versionData) {
    const result = findCaseById(caseId);
    if (!result) {
        console.warn('[addDocumentVersion] case not found:', caseId);
        return null;
    }
    const caseItem = result.caseItem;
    if (!Array.isArray(caseItem.documents)) caseItem.documents = [];

    const config = versionData.config || {};
    const docType = config.docType || 'judgment';
    const docTypes = getCurrentDocTypes ? getCurrentDocTypes() : {};
    const docTypeName = docTypes[docType]?.name || '法律文书';
    // config.template 是 templateId（字符串 key），需先查模板对象再取 name
    const templates = (typeof getDocTypeTemplates === 'function') ? getDocTypeTemplates(docType) : {};
    const tplObj = templates[config.template];
    const templateName = getTemplateName ? getTemplateName(tplObj) : '';
    const title = templateName ? `${docTypeName} · ${templateName}` : docTypeName;

    // 按现有 id 查找（兼容旧数据：id 形如 doc_<docType>_<caseId> 或 doc_<timestamp>）
    // 统一按 docType 查找合并
    let doc = caseItem.documents.find(d => d.docType === docType);
    if (!doc) {
        doc = {
            id: `doc_${docType}_${caseId}`,
            title,
            docType,
            versions: []
        };
        caseItem.documents.push(doc);
    } else if (!doc.title || doc.title === title) {
        doc.title = title; // 同步最新标题
    }

    const version = {
        versionId: `v${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: versionData.type || 'original',          // original/polish/regenerate
        genMethod: versionData.genMethod || 'material', // material/step
        source: versionData.source || 'ai',
        content: versionData.content || '',
        createdAt: new Date().toISOString(),
        createdBy: versionData.createdBy || getCurrentUserName(),
        config: {
            docType,
            template: config.template || '',
            prompt: config.prompt || '',
            modelId: config.modelId || '',
            materialIds: Array.isArray(config.materialIds) ? [...config.materialIds] : [],
            materialTokens: config.materialTokens || 0,
            stepsSnapshot: Array.isArray(config.stepsSnapshot) ? config.stepsSnapshot : null
        }
    };
    // 新版本插入头部（倒序）
    doc.versions.unshift(version);
    caseItem.updatedAt = new Date().toISOString().split('T')[0];
    saveBusinessSystems();
    return version;
}

/**
 * 删除指定版本的文书（任务 4.3 用）
 * @param {string} caseId
 * @param {string} versionId
 * @returns {boolean} 是否删除成功
 */
function deleteDocumentVersion(caseId, versionId) {
    const result = findCaseById(caseId);
    if (!result) return false;
    const caseItem = result.caseItem;
    if (!Array.isArray(caseItem.documents)) return false;
    for (let i = caseItem.documents.length - 1; i >= 0; i--) {
        const doc = caseItem.documents[i];
        if (!Array.isArray(doc.versions)) continue;
        const before = doc.versions.length;
        doc.versions = doc.versions.filter(v => v.versionId !== versionId);
        if (doc.versions.length < before) {
            // 若版本清空，移除整个 document
            if (doc.versions.length === 0) {
                caseItem.documents.splice(i, 1);
            }
            caseItem.updatedAt = new Date().toISOString().split('T')[0];
            saveBusinessSystems();
            return true;
        }
    }
    return false;
}

// 初始化数据：先填充默认值，再尝试从 localStorage 加载
// 加载后执行 migrateDataIfNeeded 与 initCaseData，确保版本升级后默认案件材料可自动补齐
initCaseData();
if (loadBusinessSystems()) {
    migrateDataIfNeeded();
    initCaseData();
} else {
    businessSystems._dataVersion = DATA_VERSION;
}
// v1.40: 在加载/迁移完成后追加法院 mock 案件（用于验证分页），再跑一次 initCaseData 为新案件生成材料
// 必须在 loadBusinessSystems 之后调用：否则会在默认数据上先设置标记，导致老用户加载旧数据后跳过追加
ensureExtraCases();
initCaseData();
saveBusinessSystems();

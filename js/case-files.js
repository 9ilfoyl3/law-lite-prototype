// ============ Case Files Page JavaScript ============
// v2.30 文书生成结果接入可复用文档编辑器：1)流式输出速度加快；2)流式输出期间禁用【文书精修】【重新配置】按钮，完成后启用；3)流式输出完成后右栏自动渲染 DocEditor，用户可直接编辑文书；4)保存/下载/精修均读取编辑器最新内容
// v2.29 本案要件内联编辑与生成联动优化：1)内联编辑区移除"修改答案"文字标签与 placeholder，仅保留文本框与保存/取消按钮；2)新增 hasExistingElementAnswers/collectExistingElementAnswers 辅助函数；3)generateByMaterial（一步生成）、compileSteps（分步生成编译）新增"已 AI 总结则默认引入"逻辑——caseElementsAnswers 存在任意要件答案时不再弹框，直接引入已生成要件答案并直接生成，友好提示告知；未做过 AI 总结时维持原弹框询问逻辑；4)compileSteps 要件范围同步用 mergeCaseElements 合并个案要件（与 generateByMaterial 一致）
// v2.28 本案要件答案操作升级（对齐分步生成步骤操作模式）：1)原"修改"按钮更名为"编辑"；2)新增"重新生成"按钮（regenerateElementAnswer，覆盖原答案）；3)新增"追问"按钮（followUpElement/submitElementFollowUp，多轮对话式追问，历史持久化到 caseElementsFollowUps/localStorage.caseElementsFollowUps_${caseId}）；4)移除答案区"AI 生成答案"文字标签，仅展示答案正文；5)三个操作按钮仅在已生成答案后出现
// v2.27 本案要件交互重构：1)删除要件项"问答/已答·查看"按钮；2)AI总结改为批量总结全部要件（无需勾选，自动全选并生成答案）；3)已答状态直接在要件项下方展示答案内容（绿色卡片 + AI生成答案标签 + 修改按钮）；4)新增 editElementAnswerInline/saveElementAnswerInline 内联编辑功能（替代原 openElementQaModal 弹窗）；5)清理 .case-elements-item-qa-btn CSS，新增 .case-elements-item-answer/.inline-edit-textarea 样式
// v2.26 本案要件抽屉优化：1)抽屉宽度 380px → 50vw（min-width 380px 兜底）；2)删除底部"关闭"按钮（头部 × 与遮罩点击仍可关闭）；3)新增"一键生成"按钮（紫色品牌色区分，原名"AI总结"V1.1.9 改名去技术术语），对已勾选要件批量生成答案，用户可在问答弹窗中修改（复用 generateMockElementAnswer，与生成文书弹框引入要件逻辑一致）
// v2.25 分步生成 tab 隐藏顶部"核心材料"提示条（分步每步独立选材料，与材料树全局勾选无关）
// v2.24 分步生成交互优化：1)一步生成"生成文书"按钮移到配置卡片外部（.step-start-actions）；2)选择材料后不再自动生成，由用户手动点击"生成本步"；3)waiting 状态步骤始终展示"直接输入"+"生成本步"按钮（去 stepGenerationStarted 限制）；4)新增 directInputStep/saveDirectInput 直接输入功能（手动输入内容保存为 done）；5)done 状态新增"追问"按钮（followUpStep/submitFollowUp），支持多轮对话式追问，历史持久化到 stepData.followUps；6)startStepGeneration 不再强制校验材料和自动生成第一步
// v2.23 UI 优化：一步生成配置区改为卡片样式（与分步生成一致，满宽）；移除一步生成"当前模型"展示及 step-view-header 标题；steps-list/steps-bottom-actions/step-start-actions 去 max-width 改 width:100%，与配置区同宽；refreshModelFromWorkflow 不再调用（HTML 已删除 modelSelect 元素，函数保留为 no-op 防报错）
// v2.22 材料解析状态展示（PRD 10章）：renderMaterialTree 仅展示 parseStatus==='success' 的文件；存在解析中/异常文件时顶部显示解析进度概览"共N个，已解析M个，异常K个"；监听 case-file-parse-updated 事件自动刷新材料树
// v2.21 V1.1 分步生成步骤序列硬编码：stepConfigsByOrg.court.judgment 改为 6 步固定清单（案件信息/原告诉请/被告答辩/争议焦点/事实认定/裁判结果），新增 inputs 依赖定义（source=material/prev_step/case_context，步骤4 争议焦点依赖前3步为选填）；同步将 step.title 字段引用改为 step.name；新增 updateStepsTabVisibility 仅裁判文书类型展示分步生成 Tab；renderStepGenConfig 文书类型下拉仅展示在 stepConfigsByOrg 中有配置的类型；新增 buildStepDependencyHintHtml 在步骤 body 顶部展示依赖状态提示条（无依赖/必填未完成红色阻止/可选未完成黄色警告/全部已完成蓝色信息）；必填依赖未完成时生成本步按钮置灰并在 generateSingleStepManually 入口加双保险校验
// v2.20 模型改为只读展示：模型由 workflow 的 modelId 决定（agentflow 平台镜像），新增 refreshModelFromWorkflow 在文书类型/生成方式/初始化/重新配置等时机刷新；onModelChange 置为 no-op；applyListGenParams/applyRegenerateConfig/reconfigWithLatestSnapshot 不再从 URL 或历史文书恢复模型
// v2.19 案件详情页分步生成与重新配置交互调整：① 去除【生成剩余步骤】按钮，新增每步【生成本步】按钮；② 新增 reconfigWithLatestSnapshot，重新配置默认回填最近一次历史文书快照（模型/类型/模板/文书要求/已选材料/生成方式）；③ regenerateStep 加 PRD 注释，登记递归重置之前步骤的逻辑（暂不实现）
// v2.18 workflow 匹配维度升级为案字+案由：getWorkflowByCaseWord/getMaterialWorkflowByCaseWord/getStepsConfigForDocType 调用补 cause 参数
// v2.17 workflow 区分分步型/材料型：分步生成 tab 仅匹配 step 型，材料生成 tab 新增 refreshMaterialWorkflow 匹配 material 型（用户侧不感知）
// v2.16 移除「我的模板」「我的文书要求」入口（迁移至案件列表页 cases.js）；清理 applyReadOnlyMode 中对应隐藏逻辑
// v2.14 文书要求标签优先读管理后台 adminPromptTemplates；模板渲染兼容对象结构
// v2.13 支持管理后台只读模式（?readonly=1）：隐藏编辑/删除/生成按钮
// v2.12 材料生成【生成文书】按钮在未选材料或未选文书类型时置灰禁用

// ===== 全局变量 =====
let caseId = '';
let isReadOnly = false; // 只读模式（管理后台查看案件）
let caseItem = null;
let org = 'court';
let currentGenMethod = 'material';          // 当前生成方式
let selectedMaterialIds = new Set();       // 左栏选中的材料
let stepData = {};                          // 分步生成的数据 { stepId: { items, materials } }
let stepStates = [];                        // 每步状态: waiting/current/done
let stepsConfig = [];                       // 步骤配置
let expandedStepIndex = 0;                  // 当前展开的分步面板索引
let isGenerating = false;                   // 是否正在生成中
// v1.46 链 D: 移除 stepGenerationStarted 状态——分步生成视图直接展示步骤序列，无「开始生成」按钮
let resultContent = '';                     // 右栏结果内容HTML
let resultEditContent = '';                 // 右栏编辑模式内容
let lastSavedVersionId = '';                // 最近保存的文书版本ID（用于精修跳转）
let resultDocEditor = null;                 // 右栏文档编辑器实例
let pendingUploadFiles = [];
let pendingElementAll = { standard: [], mine: [], case: [] }; // 待确认的案由要件
let pendingElementSelections = new Set();
let pendingElementConfirmCallback = null;   // 要素确认回调
let currentEditingStepId = null;            // 当前正在编辑材料的步骤ID
let stepDocType = '';                       // 分步生成视图中的文书类型
let stepTemplate = '';                      // 分步生成视图中的文书模板
let stepRequirement = '';                   // 分步生成视图中的文书要求

// ===== 每步材料选择建议（写死） =====
const stepMaterialHints = {
    plaintiff: '建议选择起诉状、原告证据清单、原告身份证明、授权委托书等',
    defendant: '建议选择答辩状、被告证据清单、被告身份证明、质证意见等',
    dispute: '建议选择起诉状、答辩状、证据清单、争议焦点整理材料等',
    facts: '建议选择证据材料、庭审笔录、调查取证材料、鉴定意见等',
    verdict: '建议选择证据材料、庭审笔录、法律意见书、调解记录等',
    // 民终（二审）专属步骤
    originalReview: '建议选择原审判决书、原审起诉状、原审证据材料、原审庭审笔录等',
    appellant: '建议选择上诉状、上诉人证据清单、上诉理由书、新证据材料等',
    appellee: '建议选择答辩状、被上诉人证据清单、质证意见、被上诉人代理词等',
    trialFocus: '建议选择起诉状、答辩状、证据清单、争议焦点整理等',
    questions: '建议选择庭审笔录、证据材料、争议焦点整理等',
    notes: '建议选择庭审安排、当事人信息、程序性文书等',
    execItems: '建议选择执行申请书、生效裁判文书、执行依据等',
    assets: '建议选择财产查控材料、被执行人财产申报表等',
    measures: '建议选择执行裁定书、查封扣押材料、执行笔录等',
    execResult: '建议选择执行款物收据、结案报告、终结执行裁定书等',
    crimeFacts: '建议选择起诉意见书、犯罪嫌疑人供述、被害人陈述、证人证言等',
    evidence: '建议选择证据材料、鉴定意见、勘验笔录、搜查笔录等',
    lawApply: '建议选择起诉意见书、法律条文、类案检索报告等',
    conclusion: '建议选择全案材料、审查报告、量刑建议书等',
    applicant: '建议选择行政复议申请书、申请人身份证明、原行政行为材料等',
    respondent: '建议选择答复书、被申请人身份证明、原行政行为依据材料等',
    decision: '建议选择行政复议申请书、答复书、证据材料、法律依据等'
};

// ===== 分步生成步骤序列（V1.1 硬编码） =====
// v2.21 按会议调整：步骤序列硬编码前端，不依赖 agentflow SSE 动态返回
// 数据结构: {id, name, apiId, inputs: [{field, required, source}], manualOnly?}
//   - source: 'material'=该步已选材料 / 'prev_step'=前序步骤输出 / 'case_context'=案件上下文
//   - manualOnly: true 表示仅支持直接输入（合规要求，不调用 AI 生成）
//   - V1.1 分步生成仅裁判文书（judgment），其他文书类型不展示分步生成 Tab
//   - judgment 按案件阶段分组：first=一审（5 步），second=二审（6 步）
//     由 case-data.js 的 resolveStepsByCaseStage(entry, caseStage) 解析
//     v1.45 链 C: 由"按案字判断"改为"按案件阶段判断"，案件阶段来源：有案字时按案字→阶段映射，无案字时用户在生成配置区选择
const stepConfigsByOrg = {
    court: {
        // 裁判文书分步生成（按案件阶段区分一审/二审）
        judgment: {
            // 一审（民初/刑初/行初）：5 步
            'first': [
                {
                    id: 'plaintiff', name: '原告诉请', apiId: 'wf-step-plaintiff',
                    inputs: [
                        { field: 'materials', required: true, source: 'material' },
                        { field: 'caseContext', required: true, source: 'case_context' }
                    ]
                },
                {
                    id: 'defendant', name: '被告答辩', apiId: 'wf-step-defendant',
                    inputs: [
                        { field: 'materials', required: true, source: 'material' },
                        { field: 'caseContext', required: true, source: 'case_context' }
                    ]
                },
                {
                    id: 'dispute', name: '争议焦点', apiId: 'wf-step-dispute',
                    inputs: [
                        { field: 'materials', required: true, source: 'material' },
                        // 可选依赖前 2 步返回内容（步骤1+2），为空时允许执行
                        { field: 'prevStep_plaintiff', required: false, source: 'prev_step', fromStep: 'plaintiff' },
                        { field: 'prevStep_defendant', required: false, source: 'prev_step', fromStep: 'defendant' }
                    ]
                },
                {
                    id: 'facts', name: '事实认定', apiId: 'wf-step-facts',
                    inputs: [
                        { field: 'materials', required: true, source: 'material' },
                        // 必填依赖步骤3 返回内容
                        { field: 'prevStep_dispute', required: true, source: 'prev_step', fromStep: 'dispute' }
                    ]
                },
                {
                    id: 'verdict', name: '裁判结果', apiId: 'wf-step-verdict',
                    // 合规要求：裁判方向属法官主观意识，仅支持直接输入，不调用 AI 生成
                    manualOnly: true,
                    inputs: []
                }
            ],
            // 二审（民终/刑终/行终）：6 步
            'second': [
                {
                    id: 'originalReview', name: '原审查明认定', apiId: 'wf-step-original-review',
                    inputs: [
                        { field: 'materials', required: true, source: 'material' },
                        { field: 'caseContext', required: true, source: 'case_context' }
                    ]
                },
                {
                    id: 'appellant', name: '上诉人诉讼', apiId: 'wf-step-appellant',
                    inputs: [
                        { field: 'materials', required: true, source: 'material' },
                        { field: 'caseContext', required: true, source: 'case_context' }
                    ]
                },
                {
                    id: 'appellee', name: '被上诉人抗辩', apiId: 'wf-step-appellee',
                    inputs: [
                        { field: 'materials', required: true, source: 'material' },
                        { field: 'caseContext', required: true, source: 'case_context' }
                    ]
                },
                {
                    id: 'dispute', name: '争议焦点', apiId: 'wf-step-dispute',
                    inputs: [
                        { field: 'materials', required: true, source: 'material' },
                        // 可选依赖前 3 步返回内容（步骤1+2+3），为空时允许执行
                        { field: 'prevStep_originalReview', required: false, source: 'prev_step', fromStep: 'originalReview' },
                        { field: 'prevStep_appellant', required: false, source: 'prev_step', fromStep: 'appellant' },
                        { field: 'prevStep_appellee', required: false, source: 'prev_step', fromStep: 'appellee' }
                    ]
                },
                {
                    id: 'facts', name: '事实认定', apiId: 'wf-step-facts',
                    // 二审事实认定：既支持材料生成，也支持直接输入
                    allowDirectInput: true,
                    inputs: [
                        { field: 'materials', required: true, source: 'material' },
                        // 必填依赖步骤4 返回内容
                        { field: 'prevStep_dispute', required: true, source: 'prev_step', fromStep: 'dispute' }
                    ]
                },
                {
                    id: 'verdict', name: '裁判结果', apiId: 'wf-step-verdict',
                    // 合规要求：裁判方向属法官主观意识，仅支持直接输入，不调用 AI 生成
                    manualOnly: true,
                    inputs: []
                }
            ]
        }
        // 其他文书类型（trial/execution 等）V1.1 不配置分步序列（不展示分步生成 Tab）
    }
    // 检察院/司法局 V1.1 分步生成暂不配置（后续场景扩展时复制模块改代码）
};

// ===== 工具函数 =====
function getUrlParam(name) {
    const params = new URLSearchParams(window.location.search);
    return params.get(name) || '';
}

/**
 * 应用只读模式（管理后台查看案件）
 * - 给 body 加 readonly-mode class，由 CSS 控制批量隐藏
 * - 在头部插入「只读模式」徽章
 * - 禁用上传/删除/重命名/生成等操作入口
 */
function applyReadOnlyMode() {
    document.body.classList.add('readonly-mode');

    // 头部插入只读徽章
    const headerRight = document.querySelector('.detail-header-right');
    if (headerRight) {
        const badge = document.createElement('span');
        badge.className = 'readonly-badge';
        badge.innerHTML = '<i class="fas fa-lock"></i> 只读模式';
        badge.style.cssText = 'display:inline-flex;align-items:center;gap:4px;padding:4px 10px;background:#fef3c7;color:#92400e;border-radius:12px;font-size:12px;font-weight:500;margin-right:8px;';
        headerRight.insertBefore(badge, headerRight.firstChild);
    }

    // 隐藏材料树工具栏的「全选」「删除」按钮
    const selectAllBtn = document.getElementById('selectAllBtn');
    if (selectAllBtn) selectAllBtn.style.display = 'none';
    const batchDeleteBtn = document.getElementById('batchDeleteBtn');
    if (batchDeleteBtn) batchDeleteBtn.style.display = 'none';

    // 隐藏生成视图的「生成文书」「确认并编译文书」按钮
    const matGenerateBtn = document.getElementById('matGenerateBtn');
    if (matGenerateBtn) matGenerateBtn.style.display = 'none';
    // v1.46 链 D: startStepsBtn 已移除
    const compileStepsBtn = document.getElementById('compileStepsBtn');
    if (compileStepsBtn) compileStepsBtn.style.display = 'none';

    // 禁用模型选择器、文书类型/模板下拉、文书要求 textarea
    const modelSelect = document.getElementById('modelSelect');
    if (modelSelect) modelSelect.disabled = true;
    const docTypeSelect = document.getElementById('docTypeSelect');
    if (docTypeSelect) docTypeSelect.disabled = true;
    const docTemplateSelect = document.getElementById('docTemplateSelect');
    if (docTemplateSelect) docTemplateSelect.disabled = true;
    const requirementInput = document.getElementById('requirementInput');
    if (requirementInput) requirementInput.disabled = true;

    // 隐藏结果区「文书精修」「重新配置」「保存」按钮（保留「下载」）
    const resultRefineBtn = document.getElementById('resultRefineBtn');
    if (resultRefineBtn) resultRefineBtn.style.display = 'none';
    const resultReconfigBtn = document.getElementById('resultReconfigBtn');
    if (resultReconfigBtn) resultReconfigBtn.style.display = 'none';
    const saveBtn = document.getElementById('saveResultBtn');
    if (saveBtn) saveBtn.style.display = 'none';

    console.log('[case-files] 已进入只读模式（管理后台查看）');
}

// 只读模式下拦截操作入口
function guardReadOnly(action) {
    if (isReadOnly) {
        showNotification('只读模式下不支持此操作', 'warning');
        return true; // 已拦截
    }
    return false;
}

function goBack() {
    window.location.href = 'cases.html';
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ===== 页面初始化 =====
document.addEventListener('DOMContentLoaded', function() {
    initPage();
});

function initPage() {
    caseId = getUrlParam('caseId');
    if (!caseId) {
        showNotification('未指定案件 ID', 'error');
        return;
    }

    // 只读模式判断（管理后台查看案件）
    isReadOnly = getUrlParam('readonly') === '1';

    currentBusiness = localStorage.getItem('currentBusiness') || 'court';
    const result = findCaseById(caseId);
    if (!result) {
        showNotification('案件不存在', 'error');
        return;
    }
    org = result.org;
    caseItem = result.caseItem;
    currentBusiness = org;

    // 渲染头部信息
    document.getElementById('caseName').textContent = caseItem.caseName || caseItem.caseNumber || '案件材料';
    document.getElementById('caseNumber').textContent = caseItem.caseNumber || '-';

    // 应用只读模式
    if (isReadOnly) applyReadOnlyMode();

    // v2.21: 控制分步生成 Tab 可见性（仅当前业务系统在 stepConfigsByOrg 中有配置时才显示）
    updateStepsTabVisibility();

    // 初始化生成方式
    initMaterialGen();
    initStepsGen();

    // 渲染材料树
    renderMaterialTree();

    // v1.36: 监听文件解析状态更新事件，自动刷新材料树（mock 解析完成后触发）
    window.addEventListener('case-file-parse-updated', function(e) {
        if (e.detail && e.detail.caseId === caseId) {
            renderMaterialTree();
            updateAllSelectedCounts();
        }
    });

    // 初始化列宽拖拽调节
    initColResizer();

    // 初始化已选材料提示
    updateAllSelectedCounts();

    // 若从「重新生成」跳转回来，恢复历史文书配置
    applyRegenerateConfig();

    // v1.37: 历史文书按钮置灰逻辑（任务 4.3）
    updateHistoryDocsBtnState();

    // v2.24 (任务 8.6 / 9.4): 加载本案要件缓存与持久化数据，刷新入口按钮数字
    loadCaseElementsAll();
    refreshCaseElementsEntryCount();

    // 监听 ESC 关闭弹窗
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            if (document.getElementById('uploadModal').classList.contains('show')) {
                closeUploadModal();
            }
            if (document.getElementById('preElementConfirmModal').classList.contains('show')) {
                closePreElementConfirmModal();
            }
            if (document.getElementById('elementConfirmModal').classList.contains('show')) {
                closeElementConfirmModal();
            }
            if (document.getElementById('materialSelectorDialog').classList.contains('show')) {
                closeMaterialSelector();
            }
            // v2.24: 抽屉与问答弹窗的 ESC 关闭
            if (document.getElementById('elementQaModal').classList.contains('show')) {
                closeElementQaModal();
            } else if (caseElementsDrawerOpen) {
                closeElementsDrawer();
            }
        }
    });

    // 点击其他区域关闭材料行「更多」菜单
    document.addEventListener('click', function(e) {
        if (!e.target.closest('.material-more-wrap')) {
            document.querySelectorAll('.material-more-menu.show').forEach(m => m.classList.remove('show'));
        }
    });

    // 上传区域拖拽支持
    const uploadZone = document.getElementById('uploadZone');
    if (uploadZone) {
        uploadZone.addEventListener('dragover', function(e) {
            e.preventDefault();
            this.classList.add('dragover');
        });
        uploadZone.addEventListener('dragleave', function(e) {
            e.preventDefault();
            this.classList.remove('dragover');
        });
        uploadZone.addEventListener('drop', function(e) {
            e.preventDefault();
            this.classList.remove('dragover');
            if (e.dataTransfer && e.dataTransfer.files.length) {
                pendingUploadFiles = [...e.dataTransfer.files];
                renderUploadList();
            }
        });
    }

    // 处理从案件列表页点击「生成文书」进入的自动触发生成流程
    // v2.23 (任务 9.1): 优先读 sessionStorage，兼容旧 URL 参数
    let listGenConfig = null;
    try {
        const cfgStr = sessionStorage.getItem('listGenConfig');
        if (cfgStr) {
            listGenConfig = JSON.parse(cfgStr);
            // 校验 caseId 匹配
            if (listGenConfig.caseId !== caseItem.id) listGenConfig = null;
        }
    } catch (e) { listGenConfig = null; }

    const urlSource = getUrlParam('source');
    const autoGen = getUrlParam('autoGen');
    const autoIntroduceElements = getUrlParam('autoIntroduceElements');

    if (listGenConfig && listGenConfig.autoGen) {
        // sessionStorage 方式（v2.23）
        applyListGenConfig(listGenConfig);
        // 默认使用全部材料
        selectedMaterialIds = new Set((caseItem.files || []).map(f => f.id));
        renderMaterialTree();
        updateAllSelectedCounts();
        // 预填完成后清除 sessionStorage（避免重复预填）
        sessionStorage.removeItem('listGenConfig');
        // 延迟触发以确保 DOM 就绪
        setTimeout(() => {
            if (listGenConfig.autoIntroduceElements) {
                autoGenerateWithAllElements();
            } else {
                generateByMaterial();
            }
        }, 100);
    } else if (urlSource === 'list' && autoGen === '1') {
        // 兼容旧 URL 参数方式
        applyListGenParams();
        selectedMaterialIds = new Set((caseItem.files || []).map(f => f.id));
        renderMaterialTree();
        updateAllSelectedCounts();
        setTimeout(() => {
            if (autoIntroduceElements === '1') {
                autoGenerateWithAllElements();
            } else {
                generateByMaterial();
            }
        }, 100);
    }
}

// v2.23 (任务 9.1): 应用 sessionStorage 中的生成配置
function applyListGenConfig(cfg) {
    const docTypeSelect = document.getElementById('matDocType');
    if (docTypeSelect && cfg.docType) {
        const docTypes = getCurrentDocTypes();
        if (docTypes[cfg.docType]) {
            docTypeSelect.value = cfg.docType;
            onMatDocTypeChange(false);
        }
    }
    const templateSelect = document.getElementById('matTemplate');
    const effectiveDocType = docTypeSelect ? docTypeSelect.value : cfg.docType;
    if (templateSelect && cfg.template) {
        const templates = getDocTypeTemplates(effectiveDocType);
        if (templates[cfg.template]) {
            templateSelect.value = cfg.template;
        }
    }
    const requirementTextarea = document.getElementById('matRequirement');
    if (requirementTextarea && cfg.requirement) {
        requirementTextarea.value = cfg.requirement;
    }
    // v1.45 链 C: 若列表页已传 caseStage，则设置到生成配置区（详情页能自动判定时忽略列表页值，由详情页自动判定）
    if (cfg.caseStage) {
        const matCaseStageSel = document.getElementById('matCaseStage');
        if (matCaseStageSel) matCaseStageSel.value = cfg.caseStage;
        const stepCaseStageSel = document.getElementById('stepCaseStage');
        if (stepCaseStageSel) stepCaseStageSel.value = cfg.caseStage;
    }
    syncStepConfigFromMaterial();
    // 自动定位到一步生成 Tab（默认已在一步生成，确保激活）
    document.querySelectorAll('.gen-tab').forEach(t => t.classList.toggle('active', t.dataset.method === 'material'));
    document.getElementById('panel-main').classList.add('active');
    document.getElementById('panel-steps').classList.remove('active');
    currentGenMethod = 'material';
}

// 应用从案件列表页传入的生成参数
function applyListGenParams() {
    // v2.20: 模型由 workflow 决定，不再从 URL 读取 model 参数
    const docType = getUrlParam('docType');
    const template = getUrlParam('template');
    const requirement = getUrlParam('requirement');

    const docTypeSelect = document.getElementById('matDocType');
    if (docTypeSelect && docType) {
        const docTypes = getCurrentDocTypes();
        if (docTypes[docType]) {
            docTypeSelect.value = docType;
            onMatDocTypeChange(false);
        }
    }

    const templateSelect = document.getElementById('matTemplate');
    const effectiveDocType = docTypeSelect ? docTypeSelect.value : docType;
    if (templateSelect && template) {
        const templates = getDocTypeTemplates(effectiveDocType);
        if (templates[template]) {
            templateSelect.value = template;
        }
    }

    const requirementTextarea = document.getElementById('matRequirement');
    if (requirementTextarea && requirement) {
        requirementTextarea.value = requirement;
    }

    syncStepConfigFromMaterial();
}

// ===== 左栏 - 材料树 =====
function renderMaterialTree() {
    const tree = document.getElementById('materialTree');
    const files = caseItem.files || [];
    const totalCountEl = document.getElementById('totalMaterialCount');
    if (totalCountEl) totalCountEl.textContent = files.length;

    const searchInput = document.getElementById('materialSearchInput');
    const keyword = searchInput ? searchInput.value.toLowerCase().trim() : '';

    // v1.36: 材料树仅展示 parseStatus === 'success' 的文件
    const successFiles = files.filter(f => getParseStatus(f) === 'success');
    const stats = getCaseParseStats(caseItem);

    if (!files.length) {
        tree.innerHTML = '<div class="material-empty"><i class="fas fa-folder-open"></i><div>暂无材料</div></div>';
        updateMaterialCount();
        return;
    }

    // v1.36: 存在未解析完成或异常文件时，顶部显示解析进度概览
    let overviewHtml = '';
    if (stats.parsing > 0 || stats.error > 0) {
        const parts = [`共 ${stats.total} 个`];
        if (stats.success > 0) parts.push(`已解析 ${stats.success} 个`);
        if (stats.parsing > 0) parts.push(`<span class="parse-overview-parsing"><i class="fas fa-spinner fa-spin"></i> 解析中 ${stats.parsing} 个</span>`);
        if (stats.error > 0) parts.push(`<span class="parse-overview-error"><i class="fas fa-exclamation-triangle"></i> 异常 ${stats.error} 个</span>`);
        overviewHtml = `<div class="material-parse-overview">${parts.join('，')}</div>`;
    }

    if (!successFiles.length) {
        tree.innerHTML = overviewHtml + '<div class="material-empty"><i class="fas fa-clock"></i><div>材料解析中，请稍候...</div></div>';
        updateMaterialCount();
        return;
    }

    // 按类别分组：根据文件名关键词简单分类
    const categories = classifyMaterials(successFiles);

    tree.innerHTML = overviewHtml + Object.entries(categories).map(([categoryName, categoryFiles]) => {
        const visibleFiles = keyword ? categoryFiles.filter(f => f.name.toLowerCase().includes(keyword)) : categoryFiles;
        if (keyword && !visibleFiles.length) return '';

        const expanded = !keyword; // 搜索时展开所有，否则默认展开
        return `
            <div class="material-category ${expanded ? 'expanded' : ''}" data-category="${categoryName}">
                <div class="material-category-header" onclick="toggleCategory(this)">
                    <div class="material-category-header-left">
                        <i class="fas fa-chevron-right"></i>
                        <span>${categoryName}</span>
                    </div>
                    <div class="material-category-header-right">
                        ${isReadOnly ? '' : `<button class="material-category-upload" onclick="event.stopPropagation();openUploadModal('${categoryName}')" title="上传至该分类"><i class="fas fa-upload"></i> 上传</button>`}
                        <span class="material-category-count">${visibleFiles.length}</span>
                    </div>
                </div>
                <div class="material-category-children">
                    ${visibleFiles.map(f => renderMaterialItem(f)).join('')}
                </div>
            </div>
        `;
    }).join('');

    updateMaterialCount();
}

function renderMaterialItem(f) {
    const isSelected = selectedMaterialIds.has(f.id);
    const icon = getFileIcon(f.name);
    const shortName = f.name.length > 8 ? f.name.substring(0, 7) + '…' : f.name;
    const categoryTag = f.category ? ` [${f.category}]` : '';
    // 只读模式下隐藏「更多」菜单（编辑名称/设置分类/删除），仅保留预览/下载
    const moreMenuHtml = isReadOnly ? '' : `
                <div class="material-more-wrap">
                    <button class="material-item-action" onclick="event.stopPropagation();toggleMaterialMoreMenu(this)" title="更多"><i class="fas fa-ellipsis-v"></i></button>
                    <div class="material-more-menu">
                        <div class="material-more-menu-item" onclick="event.stopPropagation();startRename('${f.id}')"><i class="fas fa-edit"></i> 编辑名称</div>
                        <div class="material-more-menu-item" onclick="event.stopPropagation();startChangeCategory('${f.id}')"><i class="fas fa-folder"></i> 设置分类</div>
                        <div class="material-more-menu-item danger" onclick="event.stopPropagation();confirmDeleteFile('${f.id}')"><i class="fas fa-trash-alt"></i> 删除</div>
                    </div>
                </div>`;
    // 只读模式下材料名点击不触发重命名
    const nameClick = isReadOnly ? '' : `onclick="event.stopPropagation(); startRename('${f.id}')"`;
    // 只读模式下隐藏复选框（不允许勾选）
    const checkboxHtml = isReadOnly ? '' : `<input type="checkbox" ${isSelected ? 'checked' : ''} onclick="event.stopPropagation(); toggleMaterial('${f.id}', event)">`;
    return `
        <div class="material-item ${isSelected ? 'selected' : ''}" data-id="${f.id}" ${isReadOnly ? '' : `onclick="toggleMaterial('${f.id}', event)"`}>
            ${checkboxHtml}
            <i class="fas ${icon} material-item-icon"></i>
            <span class="material-item-name" title="${f.name}${categoryTag}" ${nameClick}>${shortName}</span>
            <div class="material-item-actions">
                <button class="material-item-action" onclick="event.stopPropagation();previewFile('${f.id}')" title="预览"><i class="fas fa-eye"></i></button>
                <button class="material-item-action" onclick="event.stopPropagation();downloadFile('${f.id}')" title="下载"><i class="fas fa-download"></i></button>
                <button class="material-item-action" style="display:none;" title="设置分类" aria-hidden="true"></button>
                ${moreMenuHtml}
            </div>
        </div>
    `;
}

function toggleMaterialMoreMenu(btn) {
    const menu = btn.nextElementSibling;
    if (!menu) return;
    const isOpen = menu.classList.contains('show');
    document.querySelectorAll('.material-more-menu.show').forEach(m => m.classList.remove('show'));
    if (!isOpen) menu.classList.add('show');
}

function classifyMaterials(files) {
    const categories = {};

    files.forEach(f => {
        const name = f.name || '';
        let category = f.category || '';

        // 未指定分类时按文件名关键词自动分类
        if (!category) {
            for (const [cat, keys] of Object.entries(MATERIAL_CATEGORIES)) {
                if (cat === '其他材料') continue;
                if (keys.some(k => name.includes(k))) {
                    category = cat;
                    break;
                }
            }
        }
        if (!category) category = '其他材料';

        if (!categories[category]) categories[category] = [];
        categories[category].push(f);
    });

    // 移除空分类
    Object.keys(categories).forEach(k => {
        if (!categories[k].length) delete categories[k];
    });

    return categories;
}

function toggleCategory(header) {
    const category = header.closest('.material-category');
    category.classList.toggle('expanded');
}

function previewFile(fileId) {
    const f = caseItem.files.find(x => x.id === fileId);
    if (!f) return;
    showNotification(`预览文件：${f.name}`, 'success');
}

function downloadFile(fileId) {
    const f = caseItem.files.find(x => x.id === fileId);
    if (!f) return;
    // 模拟下载
    const blob = new Blob(['这是 ' + f.name + ' 的内容占位'], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = f.name;
    a.click();
    URL.revokeObjectURL(url);
}

function toggleMaterial(fileId, event) {
    if (selectedMaterialIds.has(fileId)) {
        selectedMaterialIds.delete(fileId);
    } else {
        selectedMaterialIds.add(fileId);
    }
    renderMaterialTree();
    updateAllSelectedCounts();
    // 若分步面板已渲染，同步刷新关联材料
    if (currentGenMethod === 'steps') {
        syncStepMaterialsWithSelection();
        renderSteps();
    }
}

function toggleSelectAllMaterials() {
    const files = caseItem.files || [];
    if (selectedMaterialIds.size === files.length) {
        selectedMaterialIds.clear();
    } else {
        files.forEach(f => selectedMaterialIds.add(f.id));
    }
    renderMaterialTree();
    updateAllSelectedCounts();
    if (currentGenMethod === 'steps') {
        syncStepMaterialsWithSelection();
        renderSteps();
    }
}

function syncStepMaterialsWithSelection() {
    Object.values(stepData).forEach(data => {
        if (data && data.materials) {
            data.materials = new Set([...data.materials].filter(id => selectedMaterialIds.has(id)));
        }
    });
}

function updateMaterialCount() {
    const selectedEl = document.getElementById('selectedMaterialCount');
    const totalEl = document.getElementById('totalMaterialCount');
    const selectAllBtn = document.getElementById('selectAllBtn');
    if (selectedEl) selectedEl.textContent = selectedMaterialIds.size;
    if (totalEl) totalEl.textContent = (caseItem.files || []).length;
    if (selectAllBtn) {
        const allSelected = selectedMaterialIds.size > 0 && selectedMaterialIds.size === (caseItem.files || []).length;
        selectAllBtn.textContent = allSelected ? '取消选择' : '全选';
    }
    const batchBtn = document.getElementById('batchDeleteBtn');
    if (batchBtn) {
        batchBtn.classList.toggle('show', selectedMaterialIds.size > 0);
    }
}

function updateAllSelectedCounts() {
    const count = selectedMaterialIds.size;
    renderCoreMaterialsAlert();
    checkMaterialLimit();
    updateMatGenerateButtonState();

    const coreAlert = document.getElementById('coreMaterialsAlert');
    const matInfo = document.querySelector('.mat-gen-info');
    if (coreAlert) coreAlert.style.display = count === 0 ? 'flex' : 'none';
    if (matInfo) matInfo.style.display = count > 0 ? 'flex' : 'none';
}

// 根据已选材料与文书类型更新【生成文书】按钮可用性
function updateMatGenerateButtonState() {
    const btn = document.getElementById('matGenerateBtn');
    if (!btn) return;

    const controls = document.getElementById('matGenControls');
    // 超限时由 checkMaterialLimit 统一置灰整个表单，此处不再覆盖
    if (controls && controls.classList.contains('disabled')) return;

    const docType = document.getElementById('matDocType')?.value || '';
    // v2.22: 可用材料=已选且 parseStatus==='success'；全部异常时置灰
    const availableCount = getSelectedFiles().length;
    const stats = getCaseParseStats(caseItem);
    if (stats.total > 0 && stats.success === 0) {
        // 全部文件异常，按钮置灰
        btn.disabled = true;
        btn.title = '无可用材料，请先上传并解析文件';
        return;
    }
    // v1.45 链 C: 案件阶段未选时置灰（仅裁判文书类型校验，有选项且未选时）
    if (docType === 'judgment') {
        const org = (typeof currentBusiness !== 'undefined') ? currentBusiness : 'court';
        const stageOptions = (typeof getCaseStageOptions === 'function') ? getCaseStageOptions(org) : [];
        const currentStage = getCurrentCaseStage();
        if (stageOptions.length > 0 && !currentStage) {
            btn.disabled = true;
            btn.title = '请先选择案件阶段';
            return;
        }
    }
    const canGenerate = availableCount > 0 && docType !== '';
    btn.disabled = !canGenerate;
    btn.title = canGenerate ? '' : (availableCount === 0 ? '请先在左侧勾选材料' : '请选择文书类型');
}

function renderCoreMaterialsAlert() {
    const count = selectedMaterialIds.size;
    const countEl = document.getElementById('coreMaterialsCount');
    const textEl = document.getElementById('coreMaterialsText');
    const alertEl = document.getElementById('coreMaterialsAlert');
    if (!countEl || !textEl || !alertEl) return;

    countEl.textContent = count;
    if (count === 0) {
        alertEl.classList.add('empty');
        textEl.textContent = '未选择核心材料，请在左侧勾选生成文书所需的材料';
    } else {
        alertEl.classList.remove('empty');
        const names = (caseItem.files || [])
            .filter(f => selectedMaterialIds.has(f.id))
            .slice(0, 3)
            .map(f => f.name.length > 8 ? f.name.substring(0, 7) + '…' : f.name)
            .join('、');
        const suffix = count > 3 ? `等 ${count} 件` : `共 ${count} 件`;
        textEl.textContent = names ? `${names} ${suffix}` : `已选 ${count} 件核心材料`;
    }
}

function scrollToMaterialTree() {
    const col = document.getElementById('materialCol');
    if (col.classList.contains('collapsed')) {
        col.classList.remove('collapsed');
    }
    const searchInput = document.getElementById('materialSearchInput');
    if (searchInput) {
        searchInput.focus();
        // 滚动到材料树顶部
        col.scrollIntoView({ behavior: 'smooth' });
    }
}

// ===== 上下文占用计算 =====
// v2.22: getSelectedFiles 仅返回 parseStatus==='success' 的已选文件（部分异常不阻塞生成）
function getSelectedFiles() {
    const files = caseItem.files || [];
    return files.filter(f => selectedMaterialIds.has(f.id) && getParseStatus(f) === 'success');
}

function getSelectedEstimatedTokens() {
    // v2.23 (任务 8.2): Token 估算逻辑已移除，保留函数避免报错，始终返回 0
    return 0;
}

function canUseMaterialGeneration() {
    // v2.23 (任务 8.2): 不再做前端 Token 超限前置判断，直接交给 workflow 处理
    return true;
}

function getCurrentModel() {
    return AI_MODELS.find(m => m.id === getCurrentModelId()) || AI_MODELS.find(m => m.id === DEFAULT_MODEL_ID);
}

// v2.20: 模型由 workflow 的 modelId 决定（agentflow 平台镜像），用户侧不可修改
// 在文书类型/生成方式/初始化/重新配置等时机调用，刷新模型下拉为只读展示
function refreshModelFromWorkflow() {
    const modelSelect = document.getElementById('modelSelect');
    if (!modelSelect) return;
    const docTypeKey = (currentGenMethod === 'steps')
        ? (document.getElementById('stepDocType') ? document.getElementById('stepDocType').value : '')
        : (document.getElementById('matDocType') ? document.getElementById('matDocType').value : '');
    if (!docTypeKey || typeof getWorkflowModelId !== 'function') {
        // 兜底：使用默认模型
        const m = getModelById(DEFAULT_MODEL_ID);
        modelSelect.innerHTML = `<option value="${m.id}" selected>${m.name}（${formatNumber(m.limit)}）</option>`;
        modelSelect.disabled = true;
        modelSelect.title = '系统由流程配置决定，不可手动修改';
        localStorage.setItem('ai_current_model', m.id);
        updateContextUsageHint();
        checkMaterialLimit();
        return;
    }
    const caseWord = extractCaseWordFromCaseNumber();
    const cause = extractCauseFromCase();
    const modelId = getWorkflowModelId(org, docTypeKey, caseWord, cause, currentGenMethod);
    const model = getModelById(modelId);
    modelSelect.innerHTML = `<option value="${model.id}" selected>${model.name}（${formatNumber(model.limit)}）</option>`;
    modelSelect.disabled = true;
    modelSelect.title = '模型由 workflow 配置决定，不可手动修改';
    // 同步到 localStorage，供 case-data.js 的 getCurrentModelId() 读取
    localStorage.setItem('ai_current_model', model.id);
    updateContextUsageHint();
    checkMaterialLimit();
}

// v2.20: onModelChange 已废弃，模型改为只读，保留为 no-op 防止报错
function onModelChange() {
    // no-op: 模型由 workflow 决定，用户不可修改
}

function updateContextUsageHint() {
    const hint = document.getElementById('contextUsageHint');
    if (!hint) return;
    if (selectedMaterialIds.size === 0) {
        hint.textContent = '请选择材料';
        hint.className = 'context-usage-hint';
        return;
    }
    // v2.23 (任务 8.2): 不再展示 Token 估算，仅显示已选数量
    hint.innerHTML = `已选 ${selectedMaterialIds.size} 件材料`;
    hint.className = 'context-usage-hint';
}

// ===== 智能推荐卡片 / 视图切换 =====
function checkMaterialLimit() {
    // v2.23 (任务 8.2): 移除前端 Token 超限前置判断，不再置灰表单
    // 保留函数避免调用报错，仅更新数量提示
    const recommendCard = document.getElementById('stepRecommendCard');
    if (recommendCard) recommendCard.style.display = 'none';
    updateContextUsageHint();
}

function switchToStepView(options = {}) {
    // v2.23 (任务 9.3): Tab 切换前检查已选材料，弹确认框
    if (!options.skipConfirm && !options.auto && selectedMaterialIds.size > 0) {
        if (!confirm('切换至分步生成将清空当前已选材料，是否继续？')) return;
        // v2.24 (任务 9.3): 确认后实际清空一步生成已选材料
        selectedMaterialIds.clear();
        renderMaterialTree();
        updateAllSelectedCounts();
    }
    syncStepConfigFromMaterial();
    refreshStepsConfig();
    // 进入分步视图时，每步材料默认清空，由用户逐一手动选择
    stepsConfig.forEach(s => {
        stepData[s.id] = { items: [], materials: new Set() };
    });
    document.getElementById('panel-main').classList.remove('active');
    document.getElementById('panel-steps').classList.add('active');
    currentGenMethod = 'steps';

    // 更新顶部 Tab 激活状态
    document.querySelectorAll('.gen-tab').forEach(t => t.classList.toggle('active', t.dataset.method === 'steps'));

    // v2.24 (任务 8.2): 移除前端 Token 限制展示，不再展示安全上限数字
    const hintLimit = document.getElementById('stepHintLimit');
    if (hintLimit) hintLimit.textContent = '--';

    const autoAlert = document.getElementById('autoSwitchAlert');
    if (autoAlert) {
        autoAlert.querySelector('span').textContent = '已选材料预估超出系统单次处理上限，已切换为分步生成，请为每一步手动选择所需材料。';
        autoAlert.classList.toggle('show', !!options.auto);
    }

    renderStepGenConfig();
    resetStepFlowUI();
    renderSteps();

    // v2.25: 分步生成 tab 隐藏顶部"核心材料"提示条（分步生成每步独立选材料，与材料树全局勾选无关）
    const coreAlert = document.getElementById('coreMaterialsAlert');
    if (coreAlert) coreAlert.style.display = 'none';
    // v1.45 链 C: 进入分步视图时刷新案件阶段行显隐 + 「开始生成」按钮状态
    updateCaseStageRowVisibility();
    updateStartStepsButtonState();
}

// 获取某步骤实际生效的关联材料（与核心材料表的交集，过滤已删除文件）
function getEffectiveStepMaterials(stepId) {
    const stepMats = stepData[stepId]?.materials || new Set();
    const fileIds = new Set((caseItem.files || []).map(f => f.id));
    return new Set([...stepMats].filter(id => fileIds.has(id)));
}

// 构建已完成步骤的已选材料摘要 HTML（大量材料场景下仅展示数量与前 3 个名称）
function buildStepSelectedMaterialsSummary(effectiveMats) {
    const ids = [...effectiveMats];
    if (!ids.length) return '';
    const names = ids.slice(0, 3).map(id => {
        const f = caseItem.files.find(x => x.id === id);
        const name = f ? f.name : id;
        return name.length > 16 ? name.substring(0, 15) + '…' : name;
    }).join('、');
    const suffix = ids.length > 3 ? `等共 ${ids.length} 件` : `共 ${ids.length} 件`;
    return `<div class="step-selected-mats"><i class="fas fa-paperclip"></i> 本步已选材料：${names}（${suffix}）</div>`;
}

function backToMainView() {
    // v2.23 (任务 9.3): Tab 切换前检查分步视图已选材料，弹确认框
    if (typeof stepsConfig !== 'undefined' && typeof stepData !== 'undefined') {
        const hasStepMaterials = stepsConfig.some(s => {
            const d = stepData[s.id];
            return d && d.materials && d.materials.size > 0;
        });
        if (hasStepMaterials) {
            if (!confirm('切换至一步生成将清空各步骤已选材料，是否继续？')) return;
            // v2.24 (任务 9.3): 确认后实际清空分步生成各步骤已选材料
            stepsConfig.forEach(s => {
                stepData[s.id] = { items: [], materials: new Set() };
            });
        }
    }
    syncMaterialConfigFromStep();
    document.getElementById('panel-steps').classList.remove('active');
    document.getElementById('panel-main').classList.add('active');
    currentGenMethod = 'material';

    // 更新顶部 Tab 激活状态
    document.querySelectorAll('.gen-tab').forEach(t => t.classList.toggle('active', t.dataset.method === 'material'));

    const autoAlert = document.getElementById('autoSwitchAlert');
    if (autoAlert) autoAlert.classList.remove('show');
    // v1.28: 切换回材料生成 tab 时，刷新材料型 workflow 匹配（用户侧不感知）
    refreshMaterialWorkflow();

    // v2.25: 恢复显示顶部"核心材料"提示条
    const coreAlert = document.getElementById('coreMaterialsAlert');
    if (coreAlert) coreAlert.style.display = '';
    // v1.45 链 C: 返回一步生成视图时更新【生成文书】按钮状态
    updateMatGenerateButtonState();
}

function toggleMaterialCol() {
    document.getElementById('materialCol').classList.toggle('collapsed');
}

// 切换详情页布局状态：'generating' 为配置态，'generated' 为生成完成态
function setLayoutState(state) {
    const body = document.getElementById('detailBody');
    if (!body) return;
    body.classList.remove('generated');
    if (state === 'generated') {
        body.classList.add('generated');
    }
}

// v2.19/v1.37: 重新配置——默认回填最近一次历史文书的快照数据
// v1.37: 改用 getAllDocumentVersions 取最新版本，从 version.config 回填（任务 4.4）
// 回填内容：文书类型 / 模板 / 文书要求 / 已选材料集合 / 生成方式
// 模型由 workflow 决定（v2.20 不恢复），回填 docType 后由 refreshModelFromWorkflow 自动刷新
function reconfigWithLatestSnapshot() {
    if (guardReadOnly('reconfigWithLatestSnapshot')) return;

    // 先切回配置态
    setLayoutState('generating');

    // v1.37: 取最近一次历史文书版本（扁平化，按时间倒序）
    const versions = getAllDocumentVersions(caseItem.id);
    if (versions.length === 0) {
        // 无历史文书：保持默认配置态（空表单 + 全部材料未勾选）
        showNotification('已切换到配置态', 'info');
        return;
    }
    const latest = versions[0]; // 最新版本
    const cfg = latest.config || {};

    // v2.20: 模型由 workflow 决定，不再从历史文书恢复（恢复 docType 后由 refreshModelFromWorkflow 自动刷新）

    // 2. 文书类型 / 模板 / 文书要求（材料生成视图）
    if (cfg.docType) {
        const matDocTypeEl = document.getElementById('matDocType');
        if (matDocTypeEl) {
            const docTypes = getCurrentDocTypes();
            matDocTypeEl.innerHTML = Object.entries(docTypes).map(([key, docCfg]) =>
                `<option value="${key}" ${key === cfg.docType ? 'selected' : ''}>${docCfg.name}</option>`
            ).join('');
        }
        onMatDocTypeChange(false);
        const matTemplateEl = document.getElementById('matTemplate');
        if (matTemplateEl && cfg.template) matTemplateEl.value = cfg.template;
        renderMatReqTemplates(cfg.docType);
    }
    if (cfg.prompt !== undefined) {
        const matRequirementEl = document.getElementById('matRequirement');
        if (matRequirementEl) matRequirementEl.value = cfg.prompt;
    }

    // 同步到分步生成视图配置
    syncStepConfigFromMaterial();

    // 3. 已选材料集合（v1.37: 从 version.config.materialIds 回填）
    selectedMaterialIds.clear();
    if (Array.isArray(cfg.materialIds) && cfg.materialIds.length) {
        cfg.materialIds.forEach(id => selectedMaterialIds.add(id));
    }
    renderMaterialTree();
    updateAllSelectedCounts();

    // 4. 生成方式：若原为分步生成，切换到分步生成视图
    if (latest.genMethod === 'step') {
        switchToStepView({ auto: false });
        // v1.46 链 D: 移除 stepGenerationStarted，分步生成视图自动展示步骤
        stepStates = stepsConfig.map(() => 'waiting');
        stepData = {};
        resetStepFlowUI();
    } else {
        // 材料生成视图：确保回到材料生成 tab
        backToMainView && backToMainView();
    }

    showNotification('已加载最近一次历史文书的生成配置，可调整后再生成', 'success');
}

// 初始化左栏材料树宽度拖拽调节
function initColResizer() {
    const resizer = document.getElementById('materialResizer');
    const body = document.getElementById('detailBody');
    if (!resizer || !body) return;

    let isDragging = false;
    let startX = 0;
    let startWidth = 0;

    resizer.addEventListener('mousedown', function(e) {
        isDragging = true;
        startX = e.clientX;
        const bodyRect = body.getBoundingClientRect();
        const materialCol = document.getElementById('materialCol');
        if (materialCol && materialCol.classList.contains('collapsed')) {
            materialCol.classList.remove('collapsed');
        }
        const currentPercent = parseFloat(getComputedStyle(body).getPropertyValue('--material-width')) || 25;
        startWidth = bodyRect.width * currentPercent / 100;
        body.classList.add('resizing');
        resizer.classList.add('resizing');
        document.body.style.userSelect = 'none';
        e.preventDefault();
    });

    document.addEventListener('mousemove', function(e) {
        if (!isDragging) return;
        const delta = e.clientX - startX;
        const bodyRect = body.getBoundingClientRect();
        let newWidth = startWidth + delta;
        const minWidth = 180;
        const maxWidth = bodyRect.width * 0.5;
        newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
        const percent = (newWidth / bodyRect.width * 100).toFixed(2);
        body.style.setProperty('--material-width', percent + '%');
    });

    document.addEventListener('mouseup', function() {
        if (!isDragging) return;
        isDragging = false;
        body.classList.remove('resizing');
        resizer.classList.remove('resizing');
        document.body.style.userSelect = '';
    });
}

function getFileIcon(name) {
    if (!name) return 'fa-file';
    const ext = name.split('.').pop().toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'bmp'].includes(ext)) return 'fa-file-image';
    if (['pdf'].includes(ext)) return 'fa-file-pdf';
    if (['doc', 'docx'].includes(ext)) return 'fa-file-word';
    if (['xls', 'xlsx'].includes(ext)) return 'fa-file-excel';
    if (['mp4', 'avi', 'mov'].includes(ext)) return 'fa-file-video';
    if (['mp3', 'wav'].includes(ext)) return 'fa-file-audio';
    if (['zip', 'rar', '7z'].includes(ext)) return 'fa-file-archive';
    if (['txt'].includes(ext)) return 'fa-file-alt';
    return 'fa-file';
}

function formatFileSize(bytes) {
    if (typeof bytes === 'string') return bytes;
    if (!bytes || isNaN(bytes)) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

// ===== 中栏 - Tab 切换 =====
// v2.21: 控制分步生成 Tab 可见性
// 仅当前业务系统在 stepConfigsByOrg 中有配置时才显示分步生成 Tab
// V1.1 仅法院裁判文书（judgment）支持分步生成，其他类型/业务系统隐藏 Tab
function updateStepsTabVisibility() {
    const orgKey = (typeof currentBusiness !== 'undefined') ? currentBusiness : 'court';
    const stepConfigOrg = (typeof stepConfigsByOrg !== 'undefined' && stepConfigsByOrg[orgKey]) || {};
    // 兼容两种结构：数组（旧）或对象（按案字分组，v1.36）
    const hasStepConfig = Object.keys(stepConfigOrg).some(key => {
        const entry = stepConfigOrg[key];
        if (Array.isArray(entry)) return entry.length > 0;
        if (entry && typeof entry === 'object') {
            return Object.keys(entry).some(k => Array.isArray(entry[k]) && entry[k].length > 0);
        }
        return false;
    });
    const stepsTab = document.querySelector('.gen-tab[data-method="steps"]');
    if (stepsTab) {
        stepsTab.style.display = hasStepConfig ? '' : 'none';
    }
    // 若当前正在分步生成视图但已无配置，切回一步生成
    if (!hasStepConfig && currentGenMethod === 'steps') {
        currentGenMethod = 'material';
    }
}

function switchGenMethod(method) {
    if (method === currentGenMethod) return;
    if (method === 'steps') {
        switchToStepView({ auto: false });
    } else {
        backToMainView();
    }
}

// ===== 方法1 - 材料生成 =====
function initMaterialGen() {
    // v1.45 链 C: 先初始化案件阶段选择项
    initCaseStageSelect();
    const docTypes = getCurrentDocTypes();
    const docTypeSelect = document.getElementById('matDocType');
    docTypeSelect.innerHTML = Object.entries(docTypes).map(([key, cfg]) =>
        `<option value="${key}">${cfg.name}</option>`
    ).join('');

    // 默认选第一个
    const firstKey = Object.keys(docTypes)[0];
    if (firstKey) {
        docTypeSelect.value = firstKey;
        onMatDocTypeChange(false);
    } else {
        renderMatReqTemplates('');
    }
    syncStepConfigFromMaterial();
}

// v1.45 链 C: 初始化案件阶段选择项
// 仅裁判文书(judgment)类型才显示案件阶段行；有案字能自动判定时隐藏整行，无法判定时才显示让用户选
function initCaseStageSelect() {
    const org = (typeof currentBusiness !== 'undefined') ? currentBusiness : 'court';
    const options = (typeof getCaseStageOptions === 'function') ? getCaseStageOptions(org) : [];
    // 一步生成视图与分步生成视图共用同一逻辑
    ['matCaseStage', 'stepCaseStage'].forEach(selectId => {
        const sel = document.getElementById(selectId);
        if (!sel) return;
        // 构建选项
        let html = '<option value="">请选择案件阶段</option>';
        options.forEach(o => {
            html += `<option value="${o.value}">${o.label}</option>`;
        });
        sel.innerHTML = html;
        sel.value = '';
        sel.disabled = false;
    });
    // 初始按当前文书类型刷新显隐
    updateCaseStageRowVisibility();
}

// v1.45 链 C: 更新案件阶段行的显隐与值
// 规则：仅裁判文书(judgment)类型显示；能按案字自动判定时隐藏整行（值已设置）；无法判定时显示让用户选
function updateCaseStageRowVisibility() {
    const org = (typeof currentBusiness !== 'undefined') ? currentBusiness : 'court';
    const options = (typeof getCaseStageOptions === 'function') ? getCaseStageOptions(org) : [];
    const caseWord = extractCaseWordFromCaseNumber();
    const autoStage = caseWord && typeof getCaseStageByCaseWord === 'function'
        ? getCaseStageByCaseWord(caseWord) : '';

    // 一步生成视图与分步生成视图共用同一逻辑
    [
        { rowId: 'matCaseStageRow', selectId: 'matCaseStage', hintId: 'matCaseStageHint' },
        { rowId: 'stepCaseStageRow', selectId: 'stepCaseStage', hintId: 'stepCaseStageHint' }
    ].forEach(({ rowId, selectId, hintId }) => {
        const row = document.getElementById(rowId);
        const sel = document.getElementById(selectId);
        const hintEl = document.getElementById(hintId);
        if (!row || !sel) return;

        // 当前文书类型（一步生成用 matDocType，分步生成用 stepDocType）
        const isStepsView = selectId === 'stepCaseStage';
        const docTypeKey = isStepsView
            ? (typeof stepDocType !== 'undefined' ? stepDocType : '')
            : (document.getElementById('matDocType') ? document.getElementById('matDocType').value : '');
        const isJudgment = docTypeKey === 'judgment';

        if (!isJudgment) {
            // 非裁判文书：隐藏整行，清空值
            row.style.display = 'none';
            sel.value = '';
            if (hintEl) hintEl.style.display = 'none';
            return;
        }

        // 裁判文书类型
        if (autoStage) {
            // 能自动判定：隐藏整行，值已设置
            row.style.display = 'none';
            sel.value = autoStage;
            if (hintEl) hintEl.style.display = 'none';
        } else if (options.length === 0) {
            // 检察院/司法局取值待定，无选项可显示：隐藏整行（不阻塞生成）
            row.style.display = 'none';
            sel.value = '';
            if (hintEl) hintEl.style.display = 'none';
        } else {
            // 无法自动判定且有选项：显示让用户选
            row.style.display = '';
            sel.value = '';
            if (hintEl) {
                hintEl.textContent = caseWord
                    ? `案字「${caseWord}」无法判定阶段，请选择`
                    : '本案无案字，请选择';
                hintEl.style.display = 'inline-block';
            }
        }
    });
}

// v1.45 链 C: 案件阶段选择变更
function onCaseStageChange() {
    // 切换案件阶段后需重新解析分步步骤序列
    refreshStepsConfig();
    renderSteps();
    updateMatGenerateButtonState();
    updateStartStepsButtonState();
}

// v1.46 链 D: 「开始生成」按钮已移除，此函数保留为空操作避免调用点报错
function updateStartStepsButtonState() {
    // 无操作——分步生成视图直接展示步骤序列，案件阶段校验由各步骤的「生成本步」按钮承担
}

// v1.24: 构建模板下拉 HTML，按来源分组（标准 / 我的）
// templates: 对象 {key: {name, source, ...}}；selectedKey: 当前选中 key
function buildTemplateSelectHtml(templates, selectedKey) {
    const stdOpts = [], myOpts = [];
    const keys = Object.keys(templates);
    keys.forEach(key => {
        const val = templates[key];
        const name = getTemplateName(val);
        const sel = key === selectedKey ? 'selected' : '';
        const opt = `<option value="${key}" ${sel}>${name}</option>`;
        if (val && val.source === 'mine') myOpts.push(opt); else stdOpts.push(opt);
    });
    if (stdOpts.length && myOpts.length) {
        return `<optgroup label="标准模板">${stdOpts.join('')}</optgroup><optgroup label="我的模板">${myOpts.join('')}</optgroup>`;
    } else if (stdOpts.length) {
        return stdOpts.join('');
    } else if (myOpts.length) {
        return `<optgroup label="我的模板">${myOpts.join('')}</optgroup>`;
    }
    return `<option value="">暂无可用模板</option>`;
}

function onMatDocTypeChange(shouldSync = true) {
    const docTypeKey = document.getElementById('matDocType').value;
    const templates = getDocTypeTemplates(docTypeKey);
    const templateSelect = document.getElementById('matTemplate');
    const templateKeys = Object.keys(templates);
    templateSelect.innerHTML = buildTemplateSelectHtml(templates, null);
    if (templateKeys.length) {
        templateSelect.value = templateKeys[0];
    }
    renderMatReqTemplates(docTypeKey);
    refreshStepsConfig();
    // v1.28: 材料生成 tab 切换文书类型时，同步匹配材料型 workflow（用户侧不感知）
    refreshMaterialWorkflow();
    // v1.45 链 C: 切换文书类型后刷新案件阶段行显隐
    updateCaseStageRowVisibility();
    updateMatGenerateButtonState();
    if (shouldSync) syncStepConfigFromMaterial();
}

function renderMatReqTemplates(docTypeKey) {
    const container = document.getElementById('matReqTemplates');
    // v2.15: 合并 admin + my 数据（getReqTemplates 内部处理）；source='mine' 加 .mine 样式
    const templates = getReqTemplates(org, docTypeKey);
    if (!templates.length) {
        container.innerHTML = '';
        container.style.display = 'none';
        return;
    }
    container.style.display = 'flex';
    // v1.24: 先标准后我的，两类同时存在时中间插分隔线
    const std = templates.filter(t => t.source !== 'mine');
    const mine = templates.filter(t => t.source === 'mine');
    const renderTag = t => {
        const cls = t.source === 'mine' ? 'req-template-tag mine' : 'req-template-tag';
        return `<button type="button" class="${cls}" onclick="applyMatReqTemplate(this)" data-text="${(t.text || '').replace(/"/g, '&quot;')}">${t.name}</button>`;
    };
    let html = '';
    if (std.length) html += std.map(renderTag).join('');
    if (mine.length) {
        if (std.length) html += '<span class="req-template-divider"></span>';
        html += mine.map(renderTag).join('');
    }
    container.innerHTML = html;
}

function applyMatReqTemplate(btn) {
    document.getElementById('matRequirement').value = btn.dataset.text.replace(/\\n/g, '\n');
    document.querySelectorAll('#matReqTemplates .req-template-tag').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    syncStepConfigFromMaterial();
}

function syncStepConfigFromMaterial() {
    const matDocTypeEl = document.getElementById('matDocType');
    const matTemplateEl = document.getElementById('matTemplate');
    const matRequirementEl = document.getElementById('matRequirement');
    stepDocType = matDocTypeEl ? matDocTypeEl.value : stepDocType;
    stepTemplate = matTemplateEl ? matTemplateEl.value : stepTemplate;
    stepRequirement = matRequirementEl ? matRequirementEl.value : stepRequirement;
}

function syncMaterialConfigFromStep() {
    const matDocTypeEl = document.getElementById('matDocType');
    const matTemplateEl = document.getElementById('matTemplate');
    const matRequirementEl = document.getElementById('matRequirement');
    if (!matDocTypeEl) return;

    // 重建文书类型下拉（确保包含当前 stepDocType）
    const docTypes = getCurrentDocTypes();
    matDocTypeEl.innerHTML = Object.entries(docTypes).map(([key, cfg]) =>
        `<option value="${key}" ${key === stepDocType ? 'selected' : ''}>${cfg.name}</option>`
    ).join('');

    // 重建模板下拉并保留分步视图选中的模板
    const templates = getDocTypeTemplates(stepDocType);
    const templateKeys = Object.keys(templates);
    if (matTemplateEl) {
        matTemplateEl.innerHTML = buildTemplateSelectHtml(templates, stepTemplate);
        if (templates[stepTemplate]) {
            matTemplateEl.value = stepTemplate;
        } else if (templateKeys.length) {
            matTemplateEl.value = templateKeys[0];
        }
    }

    if (matRequirementEl) matRequirementEl.value = stepRequirement || '';
    renderMatReqTemplates(stepDocType);
}

function renderStepGenConfig() {
    const docTypeSelect = document.getElementById('stepDocType');
    const templateSelect = document.getElementById('stepTemplate');
    if (!docTypeSelect || !templateSelect) return;

    const org = (typeof currentBusiness !== 'undefined') ? currentBusiness : 'court';
    const docTypes = getCurrentDocTypes();
    // v2.21: 分步生成 tab 文书类型下拉仅展示在 stepConfigsByOrg 中有配置的类型（V1.1 仅裁判文书 judgment）
    // v1.36: 兼容 stepConfigsByOrg 为对象（按案字分组）的结构
    const stepConfigOrg = (typeof stepConfigsByOrg !== 'undefined' && stepConfigsByOrg[org]) || {};
    const filteredEntries = Object.entries(docTypes).filter(([key]) => {
        const entry = stepConfigOrg[key];
        if (Array.isArray(entry)) return entry.length > 0;
        if (entry && typeof entry === 'object') {
            return Object.keys(entry).some(k => Array.isArray(entry[k]) && entry[k].length > 0);
        }
        return false;
    });
    const filteredKeys = filteredEntries.map(([key]) => key);

    // 当前 stepDocType 不在过滤后列表中时，重置为第一个可用类型
    if (filteredKeys.length === 0) {
        docTypeSelect.innerHTML = '<option value="">暂无可用类型</option>';
        templateSelect.innerHTML = '';
        return;
    }
    if (filteredKeys.indexOf(stepDocType) < 0) {
        stepDocType = filteredKeys[0];
    }
    const currentDocType = stepDocType || filteredKeys[0];
    if (!stepDocType) stepDocType = currentDocType;

    docTypeSelect.innerHTML = filteredEntries.map(([key, cfg]) =>
        `<option value="${key}" ${key === currentDocType ? 'selected' : ''}>${cfg.name}</option>`
    ).join('');

    const templates = getDocTypeTemplates(currentDocType);
    const templateKeys = Object.keys(templates);
    templateSelect.innerHTML = buildTemplateSelectHtml(templates, stepTemplate);
    if (templateKeys.length && !templates[stepTemplate]) {
        stepTemplate = templateKeys[0];
        templateSelect.value = stepTemplate;
    }
}

function onStepDocTypeChange(docTypeKey) {
    stepDocType = docTypeKey;
    currentStepPlanId = '';  // 重置步骤方案，让 refreshStepsConfig 重新按案字匹配默认值
    const templates = getDocTypeTemplates(docTypeKey);
    const templateSelect = document.getElementById('stepTemplate');
    const templateKeys = Object.keys(templates);
    templateSelect.innerHTML = buildTemplateSelectHtml(templates, null);
    stepTemplate = templateKeys[0] || '';
    if (stepTemplate) templateSelect.value = stepTemplate;
    refreshStepsConfig();
    // v1.45 链 C: 切换文书类型后刷新案件阶段行显隐 + 「开始生成」按钮状态
    updateCaseStageRowVisibility();
    updateStartStepsButtonState();
    renderSteps();
}

function onStepTemplateChange(templateKey) {
    stepTemplate = templateKey;
}

function generateByMaterial() {
    if (guardReadOnly('generateByMaterial')) return;
    // v1.45 链 C: 校验案件阶段已选（仅裁判文书类型校验，防止 UI 禁用被绕过）
    const _matDocType0 = document.getElementById('matDocType')?.value || '';
    if (_matDocType0 === 'judgment') {
        const _org0 = (typeof currentBusiness !== 'undefined') ? currentBusiness : 'court';
        const _stageOptions = (typeof getCaseStageOptions === 'function') ? getCaseStageOptions(_org0) : [];
        const _currentStage = getCurrentCaseStage();
        if (_stageOptions.length > 0 && !_currentStage) {
            showNotification('请先选择案件阶段', 'warning');
            return;
        }
    }
    // v2.22: 全部文件异常时阻止生成
    const stats = getCaseParseStats(caseItem);
    if (stats.total > 0 && stats.success === 0) {
        showNotification('无可用材料，请先上传并解析文件', 'warning');
        return;
    }
    if (selectedMaterialIds.size === 0) {
        showNotification('请先在左侧选择材料', 'warning');
        return;
    }
    // v2.22: 已选材料中无 success 文件时提示（部分异常情况）
    if (getSelectedFiles().length === 0) {
        showNotification('已选材料均解析异常，请重新选择或等待解析完成', 'warning');
        return;
    }
    // v2.23 (任务 8.2): 移除前端 Token 超限前置判断，直接调用 workflow

    const _org = localStorage.getItem('currentBusiness') || 'court';
    const _cw = parseCaseWord(caseItem.caseNumber, _org);
    const allPresets = mergeCaseElements(getAllElementPresets(caseItem.cause, _org, _cw), caseItem.id);
    // v1.27: 要件仅在「裁判文书」(judgment) 时才询问引入
    const _matDocType = document.getElementById('matDocType')?.value || '';
    const _hasElements = (allPresets.standard && allPresets.standard.length > 0) || (allPresets.mine && allPresets.mine.length > 0) || (allPresets.case && allPresets.case.length > 0);
    if (_matDocType === 'judgment' && _hasElements) {
        // v1.48: 有答案→大文本框确认；无答案→恢复原有两个弹框（确认引入→选择要件→答案确认）
        if (hasAnyElementAnswer(allPresets)) {
            showElementContextModal(allPresets, (elementAnswers) => {
                doGenerateByMaterial(elementAnswers);
            });
        } else {
            showPreElementConfirmModal(allPresets,
                () => { doGenerateByMaterial(null); },
                (answers) => { doGenerateByMaterial(answers); }
            );
        }
    } else {
        doGenerateByMaterial(null);
    }
}

function autoGenerateWithAllElements() {
    // v2.22: 全部文件异常时阻止生成
    const stats = getCaseParseStats(caseItem);
    if (stats.total > 0 && stats.success === 0) {
        showNotification('无可用材料，请先上传并解析文件', 'warning');
        return;
    }
    if (selectedMaterialIds.size === 0) {
        showNotification('请先在左侧选择材料', 'warning');
        return;
    }
    if (getSelectedFiles().length === 0) {
        showNotification('已选材料均解析异常，请重新选择或等待解析完成', 'warning');
        return;
    }
    // v2.23 (任务 8.2): 移除前端 Token 超限前置判断，直接调用 workflow

    const _org2 = localStorage.getItem('currentBusiness') || 'court';
    const _cw2 = parseCaseWord(caseItem.caseNumber, _org2);
    const allPresets = mergeCaseElements(getAllElementPresets(caseItem.cause, _org2, _cw2), caseItem.id);
    const hasPresets = (allPresets.standard && allPresets.standard.length > 0) || (allPresets.mine && allPresets.mine.length > 0) || (allPresets.case && allPresets.case.length > 0);
    // v1.27: 要件仅在「裁判文书」(judgment) 时才自动引入
    const _autoDocType = document.getElementById('matDocType')?.value || getUrlParam('docType') || '';

    if (_autoDocType === 'judgment' && hasPresets) {
        // v1.48: 列表页直接引入所有可用要件，不弹框确认
        const all = [
            ...((allPresets.standard || []).map(p => ({ ...p, source: 'standard' }))),
            ...((allPresets.mine || []).map(p => ({ ...p, source: 'mine' }))),
            ...((allPresets.case || []).map(p => ({ ...p, source: 'case' })))
        ];
        const elementAnswers = all.map(p => ({
            name: p.name,
            desc: p.desc,
            question: p.question,
            answer: (caseElementsAnswers[p.name] || '').trim() || generateMockElementAnswer(p, caseItem)
        }));
        doGenerateByMaterial(elementAnswers);
    } else {
        doGenerateByMaterial(null);
    }
}

// v2.23 (任务 8.2): 估算已选材料总字数（仅用于超限提示参考，不再做前置拦截）
// v2.25 修复：改用 estimatedTokens 估算（1 token≈1 中文字），避免按文件 size 字节误算导致动辄百万字误触发超限
function getSelectedMaterialCharCount() {
    const files = getSelectedFiles();
    let total = 0;
    files.forEach(f => {
        if (f && typeof f.estimatedTokens === 'number' && f.estimatedTokens > 0) {
            total += f.estimatedTokens;
        } else if (typeof estimateFileTokens === 'function') {
            total += estimateFileTokens(f);
        } else {
            total += 500; // 无 estimatedTokens 时兜底
        }
    });
    return total;
}

// v2.23 (任务 8.6/9.6): workflow 超限异常决策辅助弹框
function showWorkflowOverflowModal(docType) {
    const charCount = getSelectedMaterialCharCount();
    const charWan = (charCount / 10000).toFixed(1);
    const suggestWan = 8; // 硬编码建议上限
    const isJudgment = docType === 'judgment';

    // 移除已有弹框
    const old = document.getElementById('workflowOverflowOverlay');
    if (old) old.remove();
    const oldDialog = document.getElementById('workflowOverflowModal');
    if (oldDialog) oldDialog.remove();

    const overlay = document.createElement('div');
    overlay.id = 'workflowOverflowOverlay';
    overlay.className = 'modal-overlay show';
    overlay.onclick = function() { closeWorkflowOverflowModal(); };

    const dialog = document.createElement('div');
    dialog.id = 'workflowOverflowModal';
    dialog.className = 'modal-dialog show';
    dialog.style.width = '460px';
    dialog.onclick = function(e) { e.stopPropagation(); };
    dialog.innerHTML = `
        <div class="modal-header">
            <h3><i class="fas fa-exclamation-triangle" style="color:#d97706;"></i> 材料量过大</h3>
            <button class="modal-close" onclick="closeWorkflowOverflowModal()"><i class="fas fa-times"></i></button>
        </div>
        <div class="modal-body">
            <p style="margin:0 0 14px 0;line-height:1.6;color:var(--text-primary);">当前已选材料约 <strong style="color:#d97706;">${charWan}</strong> 万字，建议控制在 <strong>${suggestWan}</strong> 万字以内以保证生成质量。</p>
            <div style="background:var(--bg-secondary);padding:14px 16px;border-radius:8px;font-size:13px;color:var(--text-secondary);line-height:1.8;">
                <div style="margin-bottom:4px;font-weight:600;color:var(--text-primary);">建议操作：</div>
                <div>1. 点击"按材料类型筛选"精简材料</div>
                <div>2. 减少非必要材料的选择</div>
                ${isJudgment ? '<div>3. 切换至分步生成，逐步处理</div>' : ''}
            </div>
        </div>
        <div class="modal-footer">
            <button class="modal-btn-secondary" onclick="closeWorkflowOverflowModal()">取消</button>
            <button class="modal-btn-secondary" onclick="filterMaterialByCategory()"><i class="fas fa-filter" style="margin-right:4px;"></i>按材料类型筛选</button>
            ${isJudgment ? '<button class="modal-btn-primary" onclick="closeOverflowAndSwitchStep()"><i class="fas fa-list-ol" style="margin-right:4px;"></i>切换至分步生成</button>' : ''}
        </div>
    `;

    document.body.appendChild(overlay);
    document.body.appendChild(dialog);
}

function closeWorkflowOverflowModal() {
    const overlay = document.getElementById('workflowOverflowOverlay');
    const dialog = document.getElementById('workflowOverflowModal');
    if (overlay) overlay.remove();
    if (dialog) dialog.remove();
}

// 按材料类型筛选（打开材料分类筛选）
function filterMaterialByCategory() {
    const modal = document.getElementById('workflowOverflowModal');
    if (modal) modal.remove();
    // 滚动到材料树顶部并高亮分类
    const tree = document.getElementById('materialTree');
    if (tree) {
        tree.scrollIntoView({ behavior: 'smooth', block: 'start' });
        const categories = tree.querySelectorAll('.material-category-header');
        categories.forEach(c => c.style.boxShadow = '0 0 0 2px #2563eb');
        setTimeout(() => categories.forEach(c => c.style.boxShadow = ''), 2000);
    }
    showNotification('请按材料类型勾选所需材料，取消非必要材料', 'info');
}

function closeOverflowAndSwitchStep() {
    const modal = document.getElementById('workflowOverflowModal');
    if (modal) modal.remove();
    switchToStepView({ auto: false });
    showNotification('已切换至分步生成', 'success');
}

function doGenerateByMaterial(elementAnswers) {
    const docType = document.getElementById('matDocType').value;
    if (!docType) {
        showNotification('请选择文书类型', 'warning');
        return;
    }

    // v2.23 (任务 8.2/9.6): mock workflow 超限异常（材料字数 > 8万 时触发）
    const charCount = getSelectedMaterialCharCount();
    if (charCount > 80000) {
        showWorkflowOverflowModal(docType);
        return;
    }

    // v2.23 (任务 8.8/9.5): 流式输出展示
    const template = document.getElementById('matTemplate').value;
    const docTypeName = getCurrentDocTypes()[docType]?.name || '';
    const templateObj = getCurrentTemplates()[template] || {};
    const templateName = templateObj.name || '';
    // V1.1.2: 取模板 content（内容参考文本）作为第一步生成的结构指引
    const templateContent = templateObj.content || '';
    // V1.1.2: 匹配当前文书类型+案字+案由对应的【一步生成型】workflow，取 workflowId 用于第二步套格式骨架
    const caseWord = extractCaseWordFromCaseNumber();
    const cause = extractCauseFromCase();
    let workflowId = '';
    try {
        const matchedWf = (typeof getMaterialWorkflowByCaseWord === 'function')
            ? getMaterialWorkflowByCaseWord(org, docType, caseWord, cause)
            : null;
        workflowId = (matchedWf && matchedWf.id) ? matchedWf.id : '';
    } catch (e) { /* ignore */ }
    const fullContent = generateMockDocument(caseItem, org, docTypeName, templateName, elementAnswers, templateContent, workflowId);

    startStreamingOutput(fullContent, templateName);
}

// 生成 Mock 文书内容
// V1.1.2: 两步生成流程——第一步按模板 content 内容指引生成；第二步按匹配 workflow 的格式骨架套版填充占位符
function generateMockDocument(caseData, orgType, docTypeName, templateName, elementAnswers, templateContent, workflowId) {
    const cause = caseData.cause || '纠纷';
    const caseName = caseData.caseName || caseData.caseNumber || '';
    const caseNumber = caseData.caseNumber || '';
    const partyA = caseData.partyA || '原告';
    const partyB = caseData.partyB || '被告';
    const courtName = caseData.courtName || 'XX人民法院';
    const title = templateName || docTypeName || '法律文书';

    let elementHint = '';
    if (elementAnswers && elementAnswers.length > 0) {
        const names = elementAnswers.map(p => p.name).join('、');
        elementHint = `<div style="margin-bottom:12px;padding:8px 12px;background:#eff6ff;border-radius:6px;font-size:12px;color:#1e40af;"><i class="fas fa-puzzle-piece"></i> 已引入案由要件辅助生成：${names}</div>`;
    }

    // ===== 特殊类型分支：材料总结（保持原有逻辑，不参与两步生成）=====
    if (docTypeName === '材料总结') {
        return `<div class="result-doc">
            <h2>${title}</h2>
            <div class="result-doc-meta">案件：${caseName} | 生成时间：${new Date().toLocaleString('zh-CN')}</div>
            <p>案由：${cause}</p>
            <p>当事人：${partyA} 与 ${partyB}</p>
            ${elementHint}
            <h3>一、材料清单</h3>
            <p>根据已选材料，整理形成如下材料清单，包含案件基本信息、证据材料、程序性文书等。</p>
            <h3>二、核心事实摘要</h3>
            <p>${partyA}与${partyB}因${cause}产生争议。结合现有材料，核心事实可归纳如下……</p>
            <h3>三、证据与争议点</h3>
            <p>对现有证据进行梳理，提炼与${cause}相关的主要证据及双方争议焦点。</p>
            <h3>四、待补充或关注事项</h3>
            <p>基于当前材料，建议进一步核实关键事实、补充缺失证据，并关注法律适用问题。</p>
            <p style="text-align:right;margin-top:32px;">${getSignerLabel(orgType)}</p>
            <p style="text-align:right;">${new Date().toLocaleDateString('zh-CN')}</p>
        </div>`;
    }

    // ===== 第一步·按模板 content 内容指引生成 =====
    // 支持两种模板格式：
    //   A. 完整文书结构（含 [占位符]，如裁判文书模板）→ 替换 [占位符] 后直接作为完整文书输出
    //   B. 板块列表（"1. 板块名：描述"格式）→ 按板块生成正文，可继续第二步套格式骨架
    //   C. 空模板 → 回退默认 4 段结构，可继续第二步套格式骨架
    const sections = parseTemplateSections(templateContent);
    let bodyHtml = '';
    let isFullDocTemplate = false;  // 标记是否为完整文书结构模板（A 类）

    if (sections.length > 0) {
        // B 类：板块列表格式
        const cnNums = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
        sections.forEach((sec, idx) => {
            const num = cnNums[idx] || (idx + 1);
            bodyHtml += `<h3>${num}、${escapeHtmlForStreaming(sec.title)}</h3>`;
            bodyHtml += `<p>${generateSectionContent(sec.title, sec.desc, caseData, orgType)}</p>`;
        });
    } else if (templateContent && templateContent.trim()) {
        // A 类：完整文书结构模板（含 [占位符]）——替换 [占位符] 后直接输出，跳过第二步套格式骨架
        isFullDocTemplate = true;
        bodyHtml = applyTemplateContent(templateContent, {
            cause, caseName, caseNumber, partyA, partyB, courtName, orgType
        });
    } else {
        // C 类：空模板回退默认 4 段结构
        bodyHtml = `<h3>一、案件基本情况</h3>
            <p>经审理查明，${partyA}与${partyB}因${cause}产生纠纷。根据已选材料分析，案件基本事实如下...</p>
            <h3>二、证据分析</h3>
            <p>根据当事人提交的证据材料，本院对证据的真实性、合法性、关联性进行了审查...</p>
            <h3>三、本院认为</h3>
            <p>本院认为，本案的争议焦点在于${cause}的相关事实认定和法律适用...</p>
            <h3>四、判决/决定结果</h3>
            <p>综上，依照相关法律规定，本院作出如下判决/决定...</p>`;
    }

    // A 类完整文书模板：第一步已生成完整文书，直接返回（不再套格式骨架，避免框架重复）
    if (isFullDocTemplate) {
        return `<div class="result-doc">
            <div class="result-doc-meta" style="margin-bottom:8px;">案件：${caseName} | 生成时间：${new Date().toLocaleString('zh-CN')}</div>
            ${elementHint}
            ${bodyHtml}
        </div>`;
    }

    // ===== 第二步·按匹配 workflow 的格式骨架套版填充占位符 =====
    let formatSkeleton = null;
    try {
        if (workflowId && typeof getAdminWorkflowFormat === 'function') {
            formatSkeleton = getAdminWorkflowFormat(orgType, workflowId);
        }
    } catch (e) { /* ignore */ }

    if (formatSkeleton && formatSkeleton.content) {
        return applyFormatSkeleton(formatSkeleton.content, {
            title, caseName, caseNumber, cause, partyA, partyB, courtName,
            bodyHtml, elementHint, orgType
        });
    }

    // 未配置格式骨架时直接输出第一步内容
    return `<div class="result-doc">
        <h2>${title}</h2>
        <div class="result-doc-meta">案件：${caseName} | 生成时间：${new Date().toLocaleString('zh-CN')}</div>
        <p>案由：${cause}</p>
        <p>当事人：${partyA} 与 ${partyB}</p>
        ${elementHint}
        ${bodyHtml}
        <p style="text-align:right;margin-top:32px;">${getSignerLabel(orgType)}</p>
        <p style="text-align:right;">${new Date().toLocaleDateString('zh-CN')}</p>
    </div>`;
}

// V1.1.2: 替换模板 content 中的 [占位符] 为 mock 数据（A 类完整文书模板专用）
// [占位符] 为描述性占位符（给 AI 看的格式要求），mock 阶段按关键词匹配替换为真实/mock 数据
function applyTemplateContent(templateContent, ctx) {
    const cause = ctx.cause || '纠纷';
    const partyA = ctx.partyA || '原告';
    const partyB = ctx.partyB || '被告';
    const courtName = ctx.courtName || 'XX人民法院';
    const caseNumber = ctx.caseNumber || '';
    const signer = getSignerLabel(ctx.orgType);
    const now = new Date();
    const year = now.getFullYear();
    const p = n => (n < 10 ? '0' + n : '' + n);
    const dateStr = `${year}年${p(now.getMonth() + 1)}月${p(now.getDate())}日`;
    const cnDateStr = `${year}年${p(now.getMonth() + 1)}月${p(now.getDate())}日`;

    // 从案号提取案字代字与案号（如（2025）苏0105民初123号 → 苏0105 / 民初 / 123）
    let caseWord = 'XX', caseSeq = 'XXX';
    const cnMatch = caseNumber.match(/[（(](\d{4})[)）](\S+?)(民初|民终|刑初|刑终|行初|行终|执|赔|监)(\d+)号/);
    if (cnMatch) {
        caseWord = cnMatch[2];
        caseSeq = cnMatch[4];
    }

    // 通用 mock 数据
    const mockAddr = 'XX市XX区XX路XX号';
    const mockId = 'XXXXXXXXXXXXXXXXXX';
    const mockBirth = 'XXXX年XX月XX日';
    const mockNation = '汉族';
    const mockGender = '男';
    const mockAgent = '张XX';
    const mockLawFirm = 'XX律师事务所律师';
    const mockCompanyPos = '该公司总经理';
    const mockLegalRep = '李XX';
    const mockClerk = '王XX';
    const mockAssistant = '赵XX';
    const mockProcedure = '简易程序';
    const mockCourtSession = '如期到庭参加诉讼';

    // 按 [占位符] 内容关键词匹配替换；未匹配的 [占位符] 替换为 "……"
    let out = templateContent;
    // 先替换包含具体格式的复合占位符（优先级高，避免被通用规则误替换）
    const complexRules = [
        [/\[法院名称[：:][^\]]*\]/g, courtName],
        [/\[原告名称\]/g, partyA],
        [/\[原告姓名\]/g, partyA],
        [/\[被告名称\]/g, partyB],
        [/\[被告姓名\]/g, partyB],
        [/\[原告住所地\]/g, mockAddr],
        [/\[原告现住址\]/g, mockAddr],
        [/\[被告住所地\]/g, mockAddr],
        [/\[被告现住址\]/g, mockAddr],
        [/\[法定代表人姓名\]/g, mockLegalRep],
        [/\[该公司职位[^\]]*\]/g, mockCompanyPos],
        [/\[原告性别\]/g, mockGender],
        [/\[被告性别\]/g, mockGender],
        [/\[XXXX年XX月XX日出生\]/g, mockBirth],
        [/\[原告民族\]/g, mockNation],
        [/\[被告民族\]/g, mockNation],
        [/\[原告公民身份号码\]/g, mockId],
        [/\[被告公民身份号码\]/g, mockId],
        [/\[原告委托诉讼代理人姓名\]/g, mockAgent],
        [/\[被告委托诉讼代理人姓名\]/g, mockAgent],
        [/\[XX律所律师[^\]]*\]/g, mockLawFirm],
        [/\[年份\]/g, String(year)],
        [/\[案字代字\]/g, caseWord],
        [/\[案号\]/g, caseSeq],
        [/\[案由\]/g, cause],
        [/\[立案日期XXXX年XX月XX日\]/g, dateStr],
        [/\[开庭日期XXXX年XX月XX日\]/g, dateStr],
        [/\[适用程序\]/g, mockProcedure],
        [/\[审判员XXX\]/g, signer],
        [/\[审判员姓名\]/g, signer],
        [/\[原告方到庭情况\]/g, `${partyA}${mockCourtSession}`],
        [/\[被告方到庭情况\]/g, `${partyB}${mockCourtSession}`],
        [/\[原告诉讼请求[^\]]*\]/g, '1、……；2、……；3、……（结合材料按原文输出）'],
        [/\[按照原文内容输出事实与理由[^\]]*\]/g, '（结合材料按原文输出事实与理由，不总结、不遗漏）……'],
        [/\[被告答辩内容[^\]]*\]/g, '（引用原文内容输出被告答辩）……'],
        [/\[经审理查明的案件事实[^\]]*\]/g, `经审理查明：${partyA}与${partyB}因${cause}产生纠纷……（结合材料认定案件事实）`],
        [/\[从法院角度[^\]]*\]/g, `本院认为，本案的争议焦点在于${cause}的相关事实认定和法律适用……（结合要件与证据逐一分析、采纳或不采纳）`],
        [/\[结合本案事实及法律法规[^\]]*\]/g, '结合本案事实及法律法规进行综合论述……'],
        [/\[相关法律法规及条款\]/g, '相关法律法规及条款'],
        [/\[判决主文第一项\]/g, '……'],
        [/\[判决主文第二项\]/g, '……'],
        [/\[XXX\]/g, 'XXX'],
        [/\[负担方\]/g, partyB],
        [/\[上级法院名称\]/g, 'XX市中级人民法院'],
        [/\[二○XX年XX月XX日\]/g, cnDateStr],
        [/\[法官助理姓名\]/g, mockAssistant],
        [/\[书记员姓名\]/g, mockClerk],
        // 程序段（含嵌套占位符的整段）
        [/\[原告XXXXXX[^\]]*\]/g, `${partyA}诉${partyB}${cause}一案，本院于${dateStr}立案后，依法适用${mockProcedure}由${signer}公开开庭进行了审理。${partyA}与${partyB}均${mockCourtSession}，本案现已审理终结。`]
    ];
    complexRules.forEach(([reg, val]) => { out = out.replace(reg, val); });
    // 剩余未匹配的 [占位符] 替换为 "……"
    out = out.replace(/\[[^\]]*\]/g, '……');

    // 纯文本转 HTML：按空行分段为 <p>，保留换行
    const paragraphs = out.split(/\n\s*\n/);
    const html = paragraphs.map(para => {
        const trimmed = para.trim();
        if (!trimmed) return '';
        return '<p style="line-height:1.9;margin:0 0 12px 0;">' + escapeHtmlForStreaming(trimmed).replace(/\n/g, '<br>') + '</p>';
    }).join('');
    return html;
}

// V1.1.2: 解析模板 content 中的板块列表
// 支持格式："1. 板块名：描述" 或 "1. 板块名" （冒号后为描述）
function parseTemplateSections(templateContent) {
    if (!templateContent || !templateContent.trim()) return [];
    const sections = [];
    const lines = templateContent.split(/\r?\n/);
    const reg = /^\s*\d+[\.、\)]\s*(.+?)$/;
    for (const line of lines) {
        const m = line.match(reg);
        if (m) {
            const rest = m[1].trim();
            const parts = rest.split(/[：:]/);
            const title = (parts[0] || '').trim();
            const desc = parts.slice(1).join('：').trim();
            if (title) sections.push({ title, desc });
        }
    }
    return sections;
}

// V1.1.2: 根据板块名生成 mock 内容（按关键词匹配）
function generateSectionContent(title, desc, caseData, orgType) {
    const cause = caseData.cause || '纠纷';
    const partyA = caseData.partyA || '原告';
    const partyB = caseData.partyB || '被告';
    const t = (title || '');
    if (t.indexOf('诉请') >= 0 || t.indexOf('诉讼请求') >= 0 || t.indexOf('原告诉') >= 0) {
        return `${partyA}提出诉讼请求：...（结合材料归纳原告的诉讼请求及事实理由）`;
    }
    if (t.indexOf('答辩') >= 0 || t.indexOf('抗辩') >= 0 || t.indexOf('被告诉') >= 0 || t.indexOf('上诉人') >= 0) {
        return `${partyB}答辩：...（结合材料归纳被告的答辩意见及抗辩理由）`;
    }
    if (t.indexOf('争议焦点') >= 0 || t.indexOf('争议') >= 0) {
        return `本案争议焦点为：...（结合双方主张提炼核心争议）`;
    }
    if (t.indexOf('事实') >= 0 && t.indexOf('认定') >= 0) {
        return `经审理查明：${partyA}与${partyB}因${cause}产生纠纷...（结合材料认定案件事实）`;
    }
    if (t.indexOf('事实') >= 0) {
        return `经审理查明：${partyA}与${partyB}因${cause}产生纠纷...（结合材料归纳案件事实）`;
    }
    if (t.indexOf('理由') >= 0 || t.indexOf('认为') >= 0) {
        return `本院认为，本案的争议焦点在于${cause}的相关事实认定和法律适用...（结合要件与证据进行说理）`;
    }
    if (t.indexOf('裁判结果') >= 0 || t.indexOf('判决') >= 0 || t.indexOf('主文') >= 0) {
        return `综上，依照相关法律规定，判决如下：...（裁判主文）`;
    }
    if (desc) {
        return `${desc}（结合材料生成具体内容）`;
    }
    return `（结合材料生成${title}相关内容）`;
}

// V1.1.2: 按格式骨架套版填充占位符
// 支持占位符：{{courtName}} {{caseNumber}} {{caseName}} {{cause}} {{partyA}} {{partyB}}
//             {{title}} {{body}} {{signer}} {{date}} {{elementHint}}
function applyFormatSkeleton(skeleton, ctx) {
    let out = skeleton;
    const dateStr = new Date().toLocaleDateString('zh-CN');
    const replacements = {
        '{{courtName}}': ctx.courtName || '',
        '{{caseNumber}}': ctx.caseNumber || '',
        '{{caseName}}': ctx.caseName || '',
        '{{cause}}': ctx.cause || '',
        '{{partyA}}': ctx.partyA || '',
        '{{partyB}}': ctx.partyB || '',
        '{{title}}': ctx.title || '',
        '{{body}}': ctx.bodyHtml || '',
        '{{signer}}': getSignerLabel(ctx.orgType),
        '{{date}}': dateStr,
        '{{elementHint}}': ctx.elementHint || ''
    };
    Object.entries(replacements).forEach(([k, v]) => {
        out = out.split(k).join(v);
    });
    return `<div class="result-doc">${out}</div>`;
}

function getSignerLabel(orgType) {
    if (orgType === 'procuratorate') return '检察员';
    if (orgType === 'justice') return '复议机关';
    return '审判员';
}

// ===== 方法2 - 分步生成 =====
function initStepsGen() {
    refreshStepsConfig();
    renderStepGenConfig();
    resetStepFlowUI();
    renderSteps();
    // v1.45 链 C: 分步生成视图初始化后刷新案件阶段行显隐 + 「开始生成」按钮状态
    updateCaseStageRowVisibility();
    updateStartStepsButtonState();
}

// 重置分步生成流程 UI（切换 tab/文书类型时调用）
function resetStepFlowUI() {
    // v1.46 链 D: 移除 stepGenerationStarted 与 startStepsBtn 控制
    // 分步生成视图直接展示 stepFlowArea，仅重置底部 nextArea
    const nextArea = document.getElementById('stepNextActionArea');
    if (nextArea) nextArea.style.display = 'none';
}

function refreshStepsConfig() {
    const docTypeKey = currentGenMethod === 'steps'
        ? stepDocType
        : (document.getElementById('matDocType') ? document.getElementById('matDocType').value : '');
    const caseWord = extractCaseWordFromCaseNumber();
    const cause = extractCauseFromCase();
    // v1.45 链 C: 获取当前案件阶段，按案件阶段解析步骤序列
    const caseStage = getCurrentCaseStage();
    // v1.22: 渲染步骤方案下拉（多 workflow 时显示），并按选中 workflow 取步骤
    // v1.28: 仅匹配分步型 workflow（材料型由材料生成 tab 单独处理）
    // v1.32: 匹配维度升级为案字+案由
    renderStepPlanSelect(docTypeKey, caseWord, cause);
    // v1.46 链 D: 判决书类型案件阶段未明确时（无案字且用户未选）不展示步骤序列
    // 等用户选了案件阶段后才展示对应的 5步/6步序列
    // v1.46: 再审暂不支持分步生成，同样置空步骤序列
    if (docTypeKey === 'judgment' && (!caseStage || caseStage === 'retrial')) {
        stepsConfig = [];
        stepStates = [];
        stepData = {};
        return;
    }
    stepsConfig = getStepsConfigForDocTypeWithFallback(docTypeKey, caseWord, cause, currentStepPlanId, caseStage);
    stepStates = stepsConfig.map(() => 'waiting');
    stepData = {};
}

// v1.22: 渲染步骤方案下拉（仅多 workflow 时显示）
// v1.28: 仅匹配分步型 workflow（type='step'）
// v1.32: 匹配维度升级为案字+案由
function renderStepPlanSelect(docTypeKey, caseWord, cause) {
    const planItem = document.getElementById('stepPlanItem');
    const planSelect = document.getElementById('stepPlan');
    if (!planItem || !planSelect) return;
    const org = (typeof currentBusiness !== 'undefined') ? currentBusiness : 'court';
    // v1.28: 仅取分步型 workflow
    const workflows = (typeof getWorkflowsForDocType === 'function')
        ? getWorkflowsForDocType(org, docTypeKey, 'step') : [];
    if (workflows.length <= 1) {
        planItem.style.display = 'none';
        currentStepPlanId = workflows[0] ? workflows[0].id : '';
        return;
    }
    // 多 workflow：显示下拉，默认选中案字+案由匹配项
    planItem.style.display = '';
    const defaultWf = (typeof getWorkflowByCaseWord === 'function')
        ? getWorkflowByCaseWord(org, docTypeKey, caseWord, cause) : workflows[0];
    const defaultId = defaultWf ? defaultWf.id : workflows[0].id;
    if (!currentStepPlanId || !workflows.find(w => w.id === currentStepPlanId)) {
        currentStepPlanId = defaultId;
    }
    planSelect.innerHTML = workflows.map(wf =>
        `<option value="${wf.id}" ${wf.id === currentStepPlanId ? 'selected' : ''}>${wf.name}步骤</option>`
    ).join('');
}

// v1.22: 切换步骤方案
function onStepPlanChange(wfId) {
    currentStepPlanId = wfId;
    const caseWord = extractCaseWordFromCaseNumber();
    const cause = extractCauseFromCase();
    // v1.45 链 C: 获取当前案件阶段
    const caseStage = getCurrentCaseStage();
    stepsConfig = getStepsConfigForDocTypeWithFallback(stepDocType, caseWord, cause, currentStepPlanId, caseStage);
    stepStates = stepsConfig.map(() => 'waiting');
    stepData = {};
    expandedStepIndex = -1;
    renderSteps();
}

// v1.28: 材料生成 tab 切换/初始化时，按案字匹配材料型 workflow（用户侧不感知，仅用于内部流程选择）
// v1.32: 匹配维度升级为案字+案由
// 不返回任何 UI 反馈，仅记录到 currentMaterialWorkflowId（如需后续日志/调试使用）
let currentMaterialWorkflowId = '';
function refreshMaterialWorkflow() {
    const docTypeKey = (document.getElementById('matDocType') ? document.getElementById('matDocType').value : '')
        || (document.getElementById('stepDocType') ? document.getElementById('stepDocType').value : '');
    const caseWord = extractCaseWordFromCaseNumber();
    const cause = extractCauseFromCase();
    if (!docTypeKey) {
        currentMaterialWorkflowId = '';
        return;
    }
    const org = (typeof currentBusiness !== 'undefined') ? currentBusiness : 'court';
    if (typeof getMaterialWorkflowByCaseWord !== 'function') {
        currentMaterialWorkflowId = '';
        return;
    }
    const wf = getMaterialWorkflowByCaseWord(org, docTypeKey, caseWord, cause);
    currentMaterialWorkflowId = wf ? wf.id : '';
    // 调试用：console.log('[case-files] 材料生成匹配 workflow:', currentMaterialWorkflowId);
}

// v1.22: 从当前案件案号提取案字（如 民初/民终/刑初...）
function extractCaseWordFromCaseNumber() {
    try {
        const cn = (typeof currentCaseNumber !== 'undefined' && currentCaseNumber)
            || (typeof currentCase !== 'undefined' && currentCase && currentCase.caseNumber)
            || (typeof caseItem !== 'undefined' && caseItem && caseItem.caseNumber)
            || '';
        if (!cn) return '';
        const org = (typeof currentBusiness !== 'undefined') ? currentBusiness : 'court';
        const wordList = (typeof caseWordListByOrg !== 'undefined' && caseWordListByOrg[org]) || [];
        for (const w of wordList) {
            if (cn.indexOf(w) >= 0) return w;
        }
    } catch (e) { /* ignore */ }
    return '';
}

// v1.45 链 C: 获取当前案件阶段
// 优先级：1. 生成配置区的案件阶段选择项值（用户手选，无案字时必选）
//        2. 按案字映射自动判定（有案字时）
// 返回: 'first' / 'second' / 'retrial' / '' (空表示未确定，无案字且用户未选)
function getCurrentCaseStage() {
    // 1. 优先从生成配置区选择项获取
    const stageSelect = currentGenMethod === 'steps'
        ? document.getElementById('stepCaseStage')
        : document.getElementById('matCaseStage');
    if (stageSelect) {
        const selected = stageSelect.value;
        if (selected) return selected;
    }
    // 2. 按案字映射
    const caseWord = extractCaseWordFromCaseNumber();
    if (caseWord && typeof getCaseStageByCaseWord === 'function') {
        return getCaseStageByCaseWord(caseWord);
    }
    return '';
}

// v1.32: 从当前案件提取案由（用于 workflow 双维度匹配）
function extractCauseFromCase() {
    try {
        if (typeof caseItem !== 'undefined' && caseItem && caseItem.cause) {
            return caseItem.cause;
        }
        if (typeof currentCase !== 'undefined' && currentCase && currentCase.cause) {
            return currentCase.cause;
        }
    } catch (e) { /* ignore */ }
    return '';
}

// v1.22: 优先走 case-data.js 的 getStepsConfigForDocType（按案字匹配 workflow）
// v1.28: 仅匹配分步型 workflow（type='step'）
// v1.32: 匹配维度升级为案字+案由
// v1.45 链 C: 增加 caseStage 参数，优先按案件阶段解析步骤序列
// 保留原有 fallback 逻辑：未匹配到 workflow 时回退到内置 stepConfigsByOrg
function getStepsConfigForDocTypeWithFallback(docTypeKey, caseWord, cause, stepPlanId, caseStage) {
    // 1. 优先用 case-data.js 的全局函数（读 localStorage.adminWorkflows）
    if (typeof getWorkflowsForDocType === 'function' && docTypeKey) {
        const org = (typeof currentBusiness !== 'undefined') ? currentBusiness : 'court';
        // v1.28: 仅取分步型 workflow
        const workflows = getWorkflowsForDocType(org, docTypeKey, 'step');
        if (workflows.length > 0) {
            // 优先用用户选中的 workflow
            if (stepPlanId) {
                const selected = workflows.find(w => w.id === stepPlanId);
                if (selected && Array.isArray(selected.steps) && selected.steps.length > 0) {
                    return selected.steps;
                }
            }
            // 否则按案字+案由+案件阶段匹配
            if (typeof getStepsConfigForDocType === 'function') {
                const steps = getStepsConfigForDocType(docTypeKey, caseWord, cause, caseStage);
                if (steps && steps.length > 0) return steps;
            }
        }
    }
    // 2. fallback：内置 stepConfigsByOrg + fallbackMap（v1.45 起按案件阶段解析）
    const orgConfigs = (typeof stepConfigsByOrg !== 'undefined')
        ? (stepConfigsByOrg[org] || stepConfigsByOrg.court)
        : {};
    // v1.45 链 C: 优先用 resolveStepsByCaseStage（按案件阶段），无 caseStage 时回退 resolveStepsByCaseWord
    const resolveFn = (entry) => {
        if (caseStage && typeof resolveStepsByCaseStage === 'function') {
            return resolveStepsByCaseStage(entry, caseStage);
        }
        if (typeof resolveStepsByCaseWord === 'function') {
            return resolveStepsByCaseWord(entry, caseWord);
        }
        return entry;
    };
    if (docTypeKey && orgConfigs[docTypeKey]) {
        return resolveFn(orgConfigs[docTypeKey]);
    }

    const fallbackMap = {
        reconsideration: 'review',
        notice: 'review',
        court: 'prosecution'
    };
    const key = fallbackMap[docTypeKey];
    if (key && orgConfigs[key]) {
        return resolveFn(orgConfigs[key]);
    }

    const firstDocType = Object.keys(getCurrentDocTypes())[0];
    if (firstDocType && orgConfigs[firstDocType]) {
        return resolveFn(orgConfigs[firstDocType]);
    }

    const firstEntry = Object.values(orgConfigs)[0] || [];
    return resolveFn(firstEntry);
}

// v2.21: 构建步骤依赖提示 HTML
// 规则：
//   - 无 prev_step 依赖：显示蓝色信息条"本步无前置依赖"
//   - 必填依赖未完成：显示红色阻止条"需先完成：XX（未完成）"，调用方应据此禁用生成本步按钮
//   - 可选依赖未完成：显示黄色警告条"建议先完成：XX（未完成）；可空值执行"
//   - 所有依赖已完成：显示蓝色信息条"前置依赖已完成：XX（已完成）"
function buildStepDependencyHintHtml(stepIdx) {
    const step = stepsConfig[stepIdx];
    if (!step || !Array.isArray(step.inputs)) return '';

    const prevDeps = step.inputs.filter(inp => inp.source === 'prev_step' && inp.fromStep);
    if (prevDeps.length === 0) {
        return `<div class="step-dependency-hint info"><i class="fas fa-info-circle"></i><span>本步无前置依赖</span></div>`;
    }

    // 解析依赖项的完成状态
    const depStatuses = prevDeps.map(dep => {
        const fromIdx = stepsConfig.findIndex(s => s.id === dep.fromStep);
        const fromName = fromIdx >= 0 ? stepsConfig[fromIdx].name : dep.fromStep;
        const done = fromIdx >= 0 && stepStates[fromIdx] === 'done';
        return { ...dep, fromName, fromIdx, done };
    });

    const allDone = depStatuses.every(d => d.done);
    const hasRequired = depStatuses.some(d => d.required);
    const requiredUndone = depStatuses.filter(d => d.required && !d.done);
    const optionalUndone = depStatuses.filter(d => !d.required && !d.done);

    if (allDone) {
        const doneNames = depStatuses.map(d => d.fromName).join('、');
        return `<div class="step-dependency-hint info"><i class="fas fa-check-circle"></i><span>前置依赖已完成：${doneNames}</span></div>`;
    }

    // 必填依赖未完成 → 阻止
    if (requiredUndone.length > 0) {
        const items = depStatuses.map(d => {
            const icon = d.done ? 'fa-check-circle' : 'fa-times-circle';
            const status = d.done ? '已完成' : '未完成';
            const reqTag = d.required ? '必填' : '选填';
            return `<span class="dep-item"><i class="fas ${icon}"></i>${d.fromName}<span class="dep-status">（${reqTag}·${status}）</span></span>`;
        }).join('');
        const undoneNames = requiredUndone.map(d => d.fromName).join('、');
        return `<div class="step-dependency-hint blocked"><i class="fas fa-ban"></i><span>需先完成：${undoneNames}（未完成）<br>${items}</span></div>`;
    }

    // 仅可选依赖未完成 → 警告
    if (optionalUndone.length > 0) {
        const items = depStatuses.map(d => {
            const icon = d.done ? 'fa-check-circle' : 'fa-exclamation-circle';
            const status = d.done ? '已完成' : '未完成';
            const reqTag = d.required ? '必填' : '选填';
            return `<span class="dep-item"><i class="fas ${icon}"></i>${d.fromName}<span class="dep-status">（${reqTag}·${status}）</span></span>`;
        }).join('');
        const undoneNames = optionalUndone.map(d => d.fromName).join('、');
        return `<div class="step-dependency-hint warning"><i class="fas fa-exclamation-triangle"></i><span>建议先完成：${undoneNames}（未完成）；当前配置为选填，可空值执行<br>${items}</span></div>`;
    }

    return '';
}

function renderSteps() {
    const list = document.getElementById('stepsList');
    // v1.46 链 D: step-view-hint 显隐控制
    const viewHint = document.getElementById('stepViewHint');
    if (!stepsConfig.length) {
        // v1.46 链 D: 案件阶段未明确时给出友好提示，并隐藏 step-view-hint
        const docTypeKey = (typeof stepDocType !== 'undefined') ? stepDocType : '';
        const isJudgment = docTypeKey === 'judgment';
        const stage = (typeof getCurrentCaseStage === 'function') ? getCurrentCaseStage() : '';
        const org = (typeof currentBusiness !== 'undefined') ? currentBusiness : 'court';
        const stageOptions = (typeof getCaseStageOptions === 'function') ? getCaseStageOptions(org) : [];
        let hint = '暂无步骤配置';
        let hideHint = false;
        if (isJudgment && stage === 'retrial') {
            // v1.46: 再审暂不支持分步生成
            hint = '再审案件暂不支持分步生成，请使用一步生成';
            hideHint = true;
        } else if (isJudgment && stageOptions.length > 0 && !stage) {
            hint = '请先选择案件阶段，系统将按案件阶段展示对应步骤序列（一审 5 步 / 二审 6 步）';
            hideHint = true;
        }
        list.innerHTML = `<div style="color:var(--text-muted);padding:20px;text-align:center;">${hint}</div>`;
        if (viewHint) viewHint.style.display = hideHint ? 'none' : '';
        return;
    }
    if (viewHint) viewHint.style.display = '';

    // 确保每一步都有 material Set；未初始化时默认为空，由用户手动选择
    stepsConfig.forEach(s => {
        if (!stepData[s.id]) {
            stepData[s.id] = { items: [], materials: new Set() };
        }
    });

    list.innerHTML = stepsConfig.map((s, i) => {
        const state = stepStates[i];
        const data = stepData[s.id];
        let contentHtml = '';

        if (state === 'current' && isGenerating) {
            contentHtml = '<div class="step-skeleton"><div class="step-skeleton-line" style="width:90%"></div><div class="step-skeleton-line" style="width:70%"></div><div class="step-skeleton-line" style="width:80%"></div></div>';
        } else if (state === 'done' && data) {
            // v1.48 链 G: 上方大文本框展示最新正式答案（可编辑），下方折叠展示优化问答历史
            const latestAnswer = (data.items || []).join('\n');
            contentHtml = `<textarea class="step-edit-textarea step-content-answer" id="stepAnswer_${i}" placeholder="正式答案...">${escapeHtmlForStreaming(latestAnswer)}</textarea>`;

            // 优化问答历史折叠展示（除最后一轮外），每条带回填+删除按钮
            if (data.followUps && data.followUps.length > 1) {
                const historyItems = data.followUps.slice(0, -1).map((f, idx) => `
                    <div class="step-followup-item">
                        <div class="step-followup-q"><i class="fas fa-question-circle"></i> 第 ${idx + 1} 轮：${escapeHtmlForStreaming(f.q)}</div>
                        <div class="step-followup-a"><i class="fas fa-comment-dots"></i> ${escapeHtmlForStreaming(f.a)}</div>
                        <div class="step-followup-actions">
                            <button class="step-action-btn" onclick="backfillStepOptimization(${i}, ${idx})"><i class="fas fa-undo"></i> 回填</button>
                            <button class="step-action-btn danger" onclick="deleteStepOptimization(${i}, ${idx})"><i class="fas fa-trash-alt"></i> 删除</button>
                        </div>
                    </div>
                `).join('');
                contentHtml += `
                    <details class="step-optimization-history">
                        <summary>优化历史（${data.followUps.length - 1} 轮）</summary>
                        ${historyItems}
                    </details>
                `;
            }
        }

        const materialsHtml = renderStepMaterials(s.id);
        const effectiveMats = getEffectiveStepMaterials(s.id);
        const matCount = effectiveMats.size;

        // 已完成步骤展示已选材料摘要
        const selectedMatsSummaryHtml = (state === 'done' && data)
            ? buildStepSelectedMaterialsSummary(effectiveMats)
            : '';

        // 当前生成中的步骤默认展开；其他按用户选择展开
        let isExpanded = (i === expandedStepIndex);
        if (state === 'current') {
            isExpanded = true;
            expandedStepIndex = i;
        }

        // 步骤输入模式（合规要求）：
        //   - manualOnly: 仅直接输入（裁判结果），不展示材料区/生成本步/直接输入按钮
        //     waiting 状态直接展示输入框+友好提示，用户打字即交互，无需点击按钮
        //   - allowDirectInput: 既支持材料生成也支持直接输入（二审事实认定）
        //   - 默认: 仅材料生成，不展示直接输入按钮
        const isManualOnly = !!s.manualOnly;
        const showDirectInput = !isManualOnly && !!s.allowDirectInput;
        const showGenerate = !isManualOnly;
        const showMaterials = !isManualOnly;

        const matCountHtml = showMaterials ? `<span class="step-acc-mat-count">已选 ${matCount} 件</span>` : '';
        const materialsAreaHtml = showMaterials ? materialsHtml : '';
        const matsSummaryHtml = showMaterials ? selectedMatsSummaryHtml : '';
        // manualOnly 步骤无前置依赖，跳过依赖提示条
        const depHintHtml = isManualOnly ? '' : buildStepDependencyHintHtml(i);

        // manualOnly 步骤（裁判结果）waiting 状态直接展示输入框，无需点击「直接输入」按钮
        let manualInputHtml = '';
        if (isManualOnly && state === 'waiting' && !isGenerating) {
            manualInputHtml = `
                <div class="step-manual-hint"><i class="fas fa-info-circle"></i><span>本步为法官主观判断内容，合规要求不由 AI 生成，请直接在下方输入框填写裁判结果</span></div>
                <textarea class="step-edit-textarea" id="stepDirectInput_${i}" placeholder="请直接输入裁判结果，支持多段（每行一段）..."></textarea>
                <div class="step-actions">
                    <button class="step-action-btn save" onclick="saveDirectInput(${i})"><i class="fas fa-save"></i> 保存</button>
                </div>
            `;
        }

        return `
            <div class="step-accordion ${state === 'current' ? 'current' : ''} ${state === 'done' ? 'done' : ''} ${isExpanded ? 'expanded' : ''}" id="step_${i}">
                <div class="step-acc-header" onclick="toggleStep(${i})">
                    <div class="step-acc-title">
                        <div class="step-acc-num ${state}">${state === 'done' ? '<i class="fas fa-check"></i>' : (i + 1)}</div>
                        <span>${s.name}</span>
                        ${matCountHtml}
                    </div>
                    <div style="display:flex;align-items:center;gap:12px;">
                        <span class="step-acc-status ${state}">${state === 'current' ? '生成中' : (state === 'done' ? '已完成' : '等待中')}</span>
                        <i class="fas fa-chevron-down step-acc-toggle"></i>
                    </div>
                </div>
                <div class="step-acc-body">
                    ${depHintHtml}
                    ${materialsAreaHtml}
                    ${matsSummaryHtml}
                    <div class="step-content-area" id="stepContent_${i}">${contentHtml}</div>
                    ${manualInputHtml}
                    ${state === 'done' ? `
                        <div class="step-actions">
                            <button class="step-action-btn" onclick="editStep(${i})"><i class="fas fa-edit"></i> 编辑</button>
                            ${showGenerate ? `
                                <button class="step-action-btn" onclick="regenerateStep(${i})"><i class="fas fa-redo"></i> 重新生成</button>
                                <button class="step-action-btn" onclick="contentOptimizeStep(${i})" ${((stepData[s.id].followUps || []).length >= 3) ? 'disabled title="已达到最大优化轮次（3 轮）"' : ''}><i class="fas fa-magic-wand-sparkles"></i> 内容优化${((stepData[s.id].followUps || []).length > 0) ? `（${(stepData[s.id].followUps || []).length}/3）` : ''}</button>
                            ` : ''}
                        </div>
                    ` : (state === 'waiting' && !isGenerating ? `
                        <div class="step-actions">
                            ${showDirectInput ? `<button class="step-action-btn" onclick="directInputStep(${i})"><i class="fas fa-keyboard"></i> 直接输入</button>` : ''}
                            ${showGenerate ? (() => {
                                // v2.21: 必填依赖未完成时置灰生成本步按钮
                                const step = stepsConfig[i];
                                const prevDeps = (step.inputs || []).filter(inp => inp.source === 'prev_step' && inp.fromStep);
                                const requiredUndone = prevDeps.some(dep => {
                                    const fromIdx = stepsConfig.findIndex(s => s.id === dep.fromStep);
                                    return dep.required && (fromIdx < 0 || stepStates[fromIdx] !== 'done');
                                });
                                if (requiredUndone) {
                                    return `<button class="step-action-btn primary" disabled title="需先完成必填前置步骤"><i class="fas fa-play"></i> 生成本步</button>`;
                                }
                                return `<button class="step-action-btn primary" onclick="generateSingleStepManually(${i})"><i class="fas fa-play"></i> 生成本步</button>`;
                            })() : ''}
                        </div>
                    ` : '')}
                </div>
            </div>
        `;
    }).join('');

    updateStepGenerationButtons();
}

// v2.19: 用户手动触发某一步的生成（替代原【生成剩余步骤】按钮）
async function generateSingleStepManually(index) {
    if (guardReadOnly('generateSingleStepManually')) return;
    if (isGenerating) return;
    if (index < 0 || index >= stepsConfig.length) return;
    if (stepStates[index] === 'done') return;

    const step = stepsConfig[index];
    // 合规例外：manualOnly 步骤（裁判结果）不允许 AI 生成，UI 已隐藏按钮，此处防御性拦截
    if (step.manualOnly) {
        showNotification('该步骤仅支持直接输入，不支持系统生成', 'warning');
        return;
    }

    // v2.21: 校验必填前置依赖是否已完成
    const requiredUndoneDeps = (step.inputs || [])
        .filter(inp => inp.source === 'prev_step' && inp.fromStep && inp.required)
        .filter(dep => {
            const fromIdx = stepsConfig.findIndex(s => s.id === dep.fromStep);
            return fromIdx < 0 || stepStates[fromIdx] !== 'done';
        });
    if (requiredUndoneDeps.length > 0) {
        const fromNames = requiredUndoneDeps.map(d => {
            const fromIdx = stepsConfig.findIndex(s => s.id === d.fromStep);
            return fromIdx >= 0 ? stepsConfig[fromIdx].name : d.fromStep;
        }).join('、');
        showNotification(`「${step.name}」需先完成：${fromNames}`, 'warning');
        return;
    }

    // 校验该步是否已选择材料
    const stepId = step.id;
    const stepTitle = step.name;  // v2.21: 字段从 title 改为 name
    const mats = getEffectiveStepMaterials(stepId);
    if (mats.size === 0) {
        showNotification(`请为「${stepTitle}」至少选择 1 件材料`, 'warning');
        const el = document.getElementById(`step_${index}`);
        if (el) el.classList.add('expanded');
        expandedStepIndex = index;
        renderSteps();
        return;
    }
    // v2.23 (任务 8.2): 移除分步生成的 Token 超限前置判断

    expandedStepIndex = index;
    await generateSingleStep(index, { silent: true });
    const el = document.getElementById(`step_${index}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// 渲染步骤的关联材料区域（紧凑标签 + 弹窗选择）
function renderStepMaterials(stepId) {
    const hintText = stepMaterialHints[stepId] || '';
    const hintHtml = hintText ? `<div class="step-material-hint"><i class="fas fa-lightbulb"></i> ${hintText}</div>` : '';

    const allFiles = caseItem.files || [];
    if (!allFiles.length) {
        return `
            <div class="step-materials">
                <div class="step-materials-header">
                    <div class="step-materials-title">关联材料</div>
                </div>
                <div class="no-selected-materials">暂无案件材料</div>
            </div>
        `;
    }

    const stepMats = getEffectiveStepMaterials(stepId);
    const selectedMats = allFiles.filter(f => stepMats.has(f.id));

    const tagsHtml = selectedMats.length
        ? selectedMats.map(f => `
            <div class="selected-tag" title="${f.name}">
                <span>${f.name}</span>
                <button class="selected-tag-remove" onclick="removeStepMaterial('${stepId}', '${f.id}')" title="移除">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `).join('')
        : `<div class="no-selected-materials">未选择材料</div>${hintHtml}`;

    return `
        <div class="step-materials">
            <div class="step-materials-header">
                <div class="step-materials-title">关联材料（已选 ${selectedMats.length} 件）</div>
                <button class="step-materials-btn" onclick="openMaterialSelector('${stepId}')">
                    <i class="fas fa-edit"></i> 选择材料
                </button>
            </div>
            <div class="selected-tags">
                ${tagsHtml}
            </div>
        </div>
    `;
}

// 移除步骤中的某件材料
function removeStepMaterial(stepId, fileId) {
    if (!stepData[stepId] || !stepData[stepId].materials) return;
    stepData[stepId].materials.delete(fileId);
    renderSteps();
}

// 打开材料选择器弹窗
function openMaterialSelector(stepId) {
    currentEditingStepId = stepId;
    const allFiles = caseItem.files || [];

    // 重置搜索，保证每次打开都是清爽状态
    document.getElementById('materialSelectorSearch').value = '';

    renderMaterialSelectorList(allFiles);
    updateMaterialSelectorCount();

    document.getElementById('materialSelectorOverlay').classList.add('show');
    document.getElementById('materialSelectorDialog').classList.add('show');
}

// 渲染材料选择器列表
function renderMaterialSelectorList(files) {
    const listEl = document.getElementById('materialSelectorList');
    if (!files.length) {
        listEl.innerHTML = '<div class="material-selector-empty"><i class="fas fa-inbox"></i><div>暂无案件材料</div></div>';
        return;
    }

    const stepMats = currentEditingStepId && stepData[currentEditingStepId]
        ? stepData[currentEditingStepId].materials || new Set()
        : new Set();

    listEl.innerHTML = files.map(f => `
        <div class="material-selector-item" data-id="${f.id}" data-name="${f.name.toLowerCase()}">
            <input type="checkbox" id="mat_sel_${f.id}" ${stepMats.has(f.id) ? 'checked' : ''} onchange="updateMaterialSelectorCount()">
            <label for="mat_sel_${f.id}" title="${f.name}">${f.name}</label>
        </div>
    `).join('');
}

// 根据文件名判断分类
function classifyMaterialName(name) {
    for (const [cat, keys] of Object.entries(MATERIAL_CATEGORIES)) {
        if (cat === '其他材料') continue;
        if (keys.some(k => name.includes(k))) return cat;
    }
    return '其他材料';
}

// 关闭材料选择器弹窗
function closeMaterialSelector() {
    document.getElementById('materialSelectorOverlay').classList.remove('show');
    document.getElementById('materialSelectorDialog').classList.remove('show');
    currentEditingStepId = null;
}

// 确认材料选择
async function confirmMaterialSelection() {
    if (!currentEditingStepId) return;

    const stepMats = new Set();
    document.querySelectorAll('#materialSelectorList input:checked').forEach(input => {
        const fileId = input.closest('.material-selector-item').dataset.id;
        stepMats.add(fileId);
    });

    if (!stepData[currentEditingStepId]) {
        stepData[currentEditingStepId] = { items: [], materials: new Set() };
    }
    stepData[currentEditingStepId].materials = stepMats;

    // 先保存步骤索引，再关闭弹窗（关闭会清空 currentEditingStepId）
    const stepIndex = stepsConfig.findIndex(s => s.id === currentEditingStepId);

    closeMaterialSelector();
    renderSteps();

    // v2.24: 不再选完材料后自动生成，由用户点击"生成本步"按钮手动触发
}

// 过滤材料选择器列表
function filterMaterialSelector() {
    const searchText = document.getElementById('materialSelectorSearch').value.toLowerCase().trim();

    document.querySelectorAll('.material-selector-item').forEach(item => {
        const name = item.dataset.name;
        const matchesSearch = !searchText || name.includes(searchText);
        item.style.display = matchesSearch ? 'flex' : 'none';
    });

    updateMaterialSelectorCount();
}

// 全选 / 取消全选（仅影响当前过滤后的可见项）
function selectAllMaterialSelector(select) {
    document.querySelectorAll('.material-selector-item').forEach(item => {
        if (item.style.display === 'none') return;
        const input = item.querySelector('input');
        if (input) input.checked = select;
    });
    updateMaterialSelectorCount();
}

// 更新材料选择器计数与 Token 校验
function updateMaterialSelectorCount() {
    const total = document.querySelectorAll('.material-selector-item').length;
    const visibleTotal = document.querySelectorAll('.material-selector-item:not([style*="display: none"])').length;
    const checkedInputs = document.querySelectorAll('#materialSelectorList input:checked');
    const selected = checkedInputs.length;
    const countEl = document.getElementById('materialSelectorCount');
    if (countEl) {
        countEl.innerHTML = `已选 <strong>${selected}</strong> / 共 ${total} 件` +
            (visibleTotal < total ? `（当前可见 ${visibleTotal} 件）` : '');
    }
    // v2.24 (任务 8.2): 移除前端 Token 超限前置判断，确认按钮始终可用
    const confirmBtn = document.getElementById('materialSelectorConfirmBtn');
    if (confirmBtn) confirmBtn.disabled = false;
}

function toggleStep(index) {
    if (isGenerating) return;
    expandedStepIndex = index;
    document.querySelectorAll('.step-accordion').forEach((el, i) => {
        el.classList.toggle('expanded', i === index);
    });
}

async function generateSingleStep(stepIndex, options = {}) {
    if (isGenerating) return false;

    const step = stepsConfig[stepIndex];
    if (!step) return false;

    // v1.46: manualOnly 步骤（裁判结果）不允许 AI 生成，应走直接输入
    if (step.manualOnly) {
        if (!options.silent) showNotification('裁判结果需由法官手动输入，不支持系统生成', 'warning');
        return false;
    }

    const stepId = step.id;
    const stepTitle = step.name;  // v2.21: 字段从 title 改为 name
    const mats = getEffectiveStepMaterials(stepId);
    if (mats.size === 0) {
        if (!options.silent) showNotification(`请为「${stepTitle}」至少选择 1 件材料`, 'warning');
        return false;
    }
    // v2.24 (任务 8.2): 移除前端 Token 超限前置判断，超限由 workflow 返回异常处理

    isGenerating = true;
    updateStepGenerationButtons();

    try {
        stepStates[stepIndex] = 'current';
        renderSteps();
        const el = document.getElementById(`step_${stepIndex}`);
        if (el) el.classList.add('expanded');

        await sleep(2000);

        const selectedMats = caseItem.files.filter(f => mats.has(f.id));
        stepData[stepId].items = generateStepContent(stepId, caseItem, org, selectedMats);
        stepStates[stepIndex] = 'done';
        renderSteps();
        const elDone = document.getElementById(`step_${stepIndex}`);
        if (elDone) elDone.classList.add('expanded');

        return true;
    } catch (err) {
        console.error('[generateSingleStep] 生成失败:', err);
        if (!options.silent) showNotification('生成失败，请重试', 'error');
        stepStates[stepIndex] = 'waiting';
        renderSteps();
        return false;
    } finally {
        isGenerating = false;
        renderSteps();  // 修复：isGenerating 重置后需重新渲染，确保 manualOnly 步骤输入框恢复
        updateStepGenerationButtons();
    }
}

function updateStepGenerationButtons() {
    // v1.46 链 D: 移除 startStepsBtn 处理（按钮已删除），仅保留底部 nextArea 控制
    const compileBtn = document.getElementById('compileStepsBtn');
    const nextArea = document.getElementById('stepNextActionArea');
    const nextBtn = document.getElementById('stepNextBtn');

    // 兼容旧版 DOM（compileStepsBtn 已废弃，保留兜底）
    if (compileBtn) {
        const allDone = stepsConfig.every((s, i) => stepStates[i] === 'done');
        compileBtn.style.display = allDone ? 'inline-flex' : 'none';
    }

    if (!nextArea || !nextBtn) return;

    // 生成中不显示底部按钮
    if (isGenerating) {
        nextArea.style.display = 'none';
        return;
    }

    const allDone = stepsConfig.every((s, i) => stepStates[i] === 'done');

    // v2.19: 去除【生成剩余步骤】按钮——每步生成完成后由用户手动展开下一步并点击该步的【生成本步】按钮触发；
    // 仅当全部步骤完成时显示【生成文书】
    if (allDone) {
        nextArea.style.display = 'flex';
        nextBtn.innerHTML = '<i class="fas fa-file-alt"></i> 生成文书';
    } else {
        nextArea.style.display = 'none';
    }
}

// v1.46 链 D: startStepGeneration 已废弃——「开始生成」按钮已移除，分步生成视图进入即展示步骤序列
// 保留空函数避免外部调用报错
async function startStepGeneration() {
    // 无操作
}

// 校验所有未生成步骤的材料
function validateStepMaterials() {
    // v2.24 (任务 8.2): 移除前端 Token 超限前置判断，超限由 workflow 返回异常处理
    for (let i = 0; i < stepsConfig.length; i++) {
        if (stepStates[i] === 'done') continue;

        const stepId = stepsConfig[i].id;
        const stepTitle = stepsConfig[i].name;  // v2.21: 字段从 title 改为 name
        const mats = getEffectiveStepMaterials(stepId);
        if (mats.size === 0) {
            showNotification(`请为「${stepTitle}」至少选择 1 件材料`, 'warning');
            // v1.46 链 D: stepFlowArea 默认展示，直接展开对应步骤
            const flowArea = document.getElementById('stepFlowArea');
            if (flowArea && flowArea.style.display !== 'none') {
                const el = document.getElementById(`step_${i}`);
                if (el) el.classList.add('expanded');
            }
            updateStepGenerationButtons();
            return false;
        }
    }
    return true;
}

// 继续生成下一个未完成的步骤；全部完成后按钮显示为【生成文书】
async function continueStepGeneration() {
    if (guardReadOnly('continueStepGeneration')) return;
    if (isGenerating) return;

    const nextIndex = stepsConfig.findIndex((s, i) => stepStates[i] !== 'done');
    if (nextIndex === -1) {
        // 全部已完成，点击即编译文书
        compileSteps();
        return;
    }

    const ok = await generateSingleStep(nextIndex, { silent: true });
    if (!ok) return;

    // 生成完成后滚动到当前步骤
    const el = document.getElementById(`step_${nextIndex}`);
    if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    updateStepGenerationButtons();
}

// 步骤内容生成器
function generateStepContent(stepId, caseData, orgType, selectedMaterials) {
    const cause = caseData.cause || '';
    const partyA = caseData.partyA || '原告';
    const partyB = caseData.partyB || '被告';

    const generators = {
        plaintiff: () => {
            if (cause.includes('借贷')) return [
                '请求判令被告偿还借款本金及逾期利息',
                '请求判令被告承担本案全部诉讼费用',
                '请求查封被告名下相应价值财产'
            ];
            return [
                `请求判令${partyB}承担相应法律责任`,
                '请求判令被告承担本案诉讼费用',
                '请求依法保护原告合法权益'
            ];
        },
        defendant: () => [
            '被告对部分事实不予认可，请求法院依法审查',
            '被告主张已部分履行义务，请求扣减相应金额',
            '被告因经济困难，请求分期履行或酌情减免'
        ],
        dispute: () => [
            '核心事实的认定及证据充分性',
            '法律关系的性质及法律适用问题',
            '责任承担方式及数额计算的合理性'
        ],
        facts: () => [
            '经审理查明，当事人之间存在明确的法律关系',
            '根据当事人提交的证据材料，主要事实可予认定',
            '部分争议事实因证据不足暂不予确认',
            '本院对全案证据进行了综合审查判断'
        ],
        verdict: () => [
            '根据已查明的事实和证据，依法作出判决',
            '支持原告合理部分的诉讼请求',
            '驳回原告缺乏依据的诉讼请求',
            '案件受理费由双方按比例负担'
        ],
        // 民终（二审）专属步骤
        originalReview: () => [
            `原审诉请：${partyA} 诉 ${partyB} ${cause || '纠纷'}一案，原审原告提出相应诉讼请求`,
            `原审查明事实：原审法院经审理认定了双方当事人的基本法律关系及主要事实`,
            `原审法院认为：原审法院根据查明的事实和证据，对案件性质及责任承担作出认定，并据此作出原审判决`
        ],
        appellant: () => [
            '上诉人诉请内容：上诉人不服原审判决，请求二审法院依法改判或发回重审',
            '上诉人诉请分析：上诉人认为原审在事实认定、法律适用或程序上存在错误',
            '上诉人证据分析：上诉人提交了新证据或对原审证据提出新的质证意见'
        ],
        appellee: () => [
            '被上诉人抗辩内容：被上诉人认为原审判决认定事实清楚、适用法律正确，请求驳回上诉',
            '被上诉人诉请分析：被上诉人对上诉人主张的事实及理由逐项予以反驳',
            '被上诉人证据分析：被上诉人坚持原审证据的证明力，并对上诉人新证据的关联性提出异议'
        ],
        // 检察院
        crimeFacts: () => [
            '经审查查明，犯罪嫌疑人实施了被指控的犯罪行为',
            '犯罪事实有物证、书证、证人证言等证据予以证实',
            '犯罪嫌疑人对主要犯罪事实供认不讳',
            '犯罪行为已达到追诉标准'
        ],
        evidence: () => [
            '物证、书证：能够证明案件事实的客观性证据',
            '证人证言：与案件事实具有关联性，来源合法',
            '犯罪嫌疑人供述：与客观证据相互印证',
            '鉴定意见：由具有资质的鉴定机构作出，程序合法'
        ],
        lawApply: () => [
            '犯罪嫌疑人的行为已构成相应罪名',
            '量刑情节：自首、坦白、退赃退赔等情节需综合考虑',
            '法定刑幅度及量刑建议的计算依据'
        ],
        conclusion: () => [
            '犯罪事实清楚，证据确实充分，依法应当追究刑事责任',
            '建议提起公诉/作出不起诉决定',
            '量刑建议：建议判处相应刑罚'
        ],
        // 司法局
        applicant: () => [
            '请求撤销/变更被申请人作出的行政行为',
            '请求确认被申请人的行政行为违法',
            '请求责令被申请人采取补救措施'
        ],
        respondent: () => [
            '被申请人认为原行政行为事实清楚、证据确凿',
            '被申请人适用法律正确，程序合法',
            '请求维持原行政行为'
        ],
        decision: () => [
            '根据查明的事实和法律规定，作出行政复议决定',
            '决定维持/撤销/变更/确认违法原行政行为',
            '责令被申请人在指定期限内重新作出行政行为'
        ],
        // 庭审提纲
        trialFocus: () => [
            '庭审重点：争议事实的调查和证据的质证',
            '需要重点询问的事实问题',
            '需要审查的证据材料清单'
        ],
        questions: () => [
            '对原告的询问要点：诉请的事实基础和法律依据',
            '对被告的询问要点：抗辩理由及事实依据',
            '对证人的询问要点：证言的真实性和关联性'
        ],
        notes: () => [
            '注意庭审程序的完整性',
            '注意当事人诉讼权利的保障',
            '注意庭审记录的准确性和完整性'
        ],
        // 执行
        execItems: () => ['执行标的及执行依据', '被执行人财产线索'],
        assets: () => ['已查控财产情况', '未发现可供执行财产的说明'],
        measures: () => ['已采取的执行措施', '拟采取的执行措施'],
        execResult: () => ['执行到位情况', '终结本次执行程序的条件']
    };

    const gen = generators[stepId];
    return gen ? gen() : ['暂无内容'];
}

// v2.24: 直接输入 —— 用户不通过 AI 生成，手动输入步骤内容
// 仅 manualOnly（裁判结果）与 allowDirectInput（二审事实认定）步骤允许直接输入
// 仅材料生成的步骤（前四步）防御性拦截
function directInputStep(index) {
    if (guardReadOnly('directInputStep')) return;
    const step = stepsConfig[index];
    if (!step.manualOnly && !step.allowDirectInput) {
        showNotification('该步骤仅支持材料生成，不支持直接输入', 'warning');
        return;
    }
    const stepId = step.id;
    if (!stepData[stepId]) stepData[stepId] = { items: [], materials: new Set() };

    const contentEl = document.getElementById(`stepContent_${index}`);
    if (!contentEl) return;
    contentEl.classList.add('editing');
    // manualOnly 步骤（裁判结果）使用合规专属提示文案
    const placeholder = step.manualOnly
        ? '请直接输入裁判结果（裁判方向属法官主观意识，合规要求不由 AI 生成），支持多段（每行一段）...'
        : '请直接输入本步骤的内容，支持多段（每行一段）...';
    contentEl.innerHTML = `
        <textarea class="step-edit-textarea" id="stepDirectInput_${index}" placeholder="${placeholder}"></textarea>
        <div class="step-actions">
            <button class="step-action-btn save" onclick="saveDirectInput(${index})"><i class="fas fa-save"></i> 保存</button>
            <button class="step-action-btn" onclick="renderSteps(); document.getElementById('step_${index}').classList.add('expanded');">取消</button>
        </div>
    `;
    const ta = document.getElementById(`stepDirectInput_${index}`);
    if (ta) ta.focus();
}

// v2.24: 保存直接输入的内容，将步骤标记为 done
function saveDirectInput(index) {
    const stepId = stepsConfig[index].id;
    const textarea = document.getElementById(`stepDirectInput_${index}`);
    if (!textarea) return;
    const lines = textarea.value.split('\n').filter(l => l.trim());
    if (lines.length === 0) {
        showNotification('请输入内容后再保存', 'warning');
        return;
    }
    stepData[stepId].items = lines;
    stepData[stepId].genMethod = 'manual';  // 标记为手动输入
    stepStates[index] = 'done';
    renderSteps();
    const el = document.getElementById(`step_${index}`);
    if (el) el.classList.add('expanded');
    showNotification('已保存直接输入的内容', 'success');
    updateStepGenerationButtons();
}

// v2.24: 追问 —— 在已完成步骤下方 toggle 追问输入区，支持多轮对话
// v1.48 链 G: 内容优化（原追问改名+轮次限制+展示方式调整）
function contentOptimizeStep(index) {
    if (guardReadOnly('contentOptimizeStep')) return;

    // 轮次限制：最多 3 轮
    const stepId = stepsConfig[index].id;
    const followUpCount = (stepData[stepId].followUps || []).length;
    if (followUpCount >= 3) {
        showNotification('已达到最大优化轮次（3 轮）', 'warning');
        return;
    }

    const existing = document.getElementById(`stepFollowUpArea_${index}`);
    if (existing) {
        existing.remove();
        return;
    }
    const contentEl = document.getElementById(`stepContent_${index}`);
    if (!contentEl) return;
    contentEl.insertAdjacentHTML('beforeend', `
        <div class="step-followup-area" id="stepFollowUpArea_${index}">
            <div class="step-followup-input-row">
                <input type="text" id="stepFollowUpInput_${index}" placeholder="输入优化要求，按 Enter 发送..." class="step-followup-text">
                <button class="step-action-btn primary" onclick="submitContentOptimize(${index})"><i class="fas fa-paper-plane"></i> 发送</button>
            </div>
        </div>
    `);
    const input = document.getElementById(`stepFollowUpInput_${index}`);
    if (input) {
        input.focus();
        input.addEventListener('keydown', e => {
            if (e.key === 'Enter') { e.preventDefault(); submitContentOptimize(index); }
        });
    }
}

// v1.48 链 G: 提交内容优化，模拟 AI 回答并持久化到 stepData
function submitContentOptimize(index) {
    const stepId = stepsConfig[index].id;
    const input = document.getElementById(`stepFollowUpInput_${index}`);
    if (!input || !input.value.trim()) return;

    // 轮次限制校验
    const followUpCount = (stepData[stepId].followUps || []).length;
    if (followUpCount >= 3) {
        showNotification('已达到最大优化轮次（3 轮）', 'warning');
        return;
    }

    const q = input.value.trim();
    if (!stepData[stepId].followUps) stepData[stepId].followUps = [];

    // 先保存文本框中的当前正式答案
    const answerTa = document.getElementById(`stepAnswer_${index}`);
    if (answerTa) {
        stepData[stepId].items = answerTa.value.split('\n').filter(l => l.trim());
    }

    // 原型 mock：基于步骤类型返回模拟回答
    const stepName = stepsConfig[index].name || '';
    const mockAnswers = [
        `根据所选材料分析，「${stepName}」部分的关键事实已得到充分支撑，建议保留。`,
        `补充说明：该部分法律适用依据为相关法条的规定，可在文书中引用具体条款。`,
        `经进一步分析，建议在「${stepName}」中补充相关证据链的说明以增强论证力。`
    ];
    const a = mockAnswers[stepData[stepId].followUps.length % mockAnswers.length];

    stepData[stepId].followUps.push({ q, a });

    // 优化后更新正式答案（模拟：将优化回答追加到 items）
    stepData[stepId].items = [a];

    renderSteps();
    const el = document.getElementById(`step_${index}`);
    if (el) el.classList.add('expanded');

    // 若未达 3 轮上限，重新展开优化输入框
    if (stepData[stepId].followUps.length < 3) {
        setTimeout(() => contentOptimizeStep(index), 0);
    }
}

// v1.48 链 G: 回填优化历史答案到正式答案文本框
function backfillStepOptimization(stepIndex, followUpIdx) {
    const stepId = stepsConfig[stepIndex].id;
    const data = stepData[stepId];
    if (!data || !data.followUps || followUpIdx >= data.followUps.length) return;
    const answer = data.followUps[followUpIdx].a;
    stepData[stepId].items = [answer];
    renderSteps();
    const el = document.getElementById(`step_${stepIndex}`);
    if (el) el.classList.add('expanded');
    showNotification('已回填第 ' + (followUpIdx + 1) + ' 轮优化答案', 'success');
}

// v1.48 链 G: 删除优化历史记录
function deleteStepOptimization(stepIndex, followUpIdx) {
    const stepId = stepsConfig[stepIndex].id;
    const data = stepData[stepId];
    if (!data || !data.followUps || followUpIdx >= data.followUps.length) return;
    data.followUps.splice(followUpIdx, 1);
    renderSteps();
    const el = document.getElementById(`step_${stepIndex}`);
    if (el) el.classList.add('expanded');
    showNotification('已删除第 ' + (followUpIdx + 1) + ' 轮优化记录', 'info');
}

function editStep(index) {
    const stepId = stepsConfig[index].id;
    const data = stepData[stepId];
    if (!data) return;

    const contentEl = document.getElementById(`stepContent_${index}`);
    const text = (data.items || []).join('\n');
    contentEl.classList.add('editing');
    contentEl.innerHTML = `
        <textarea class="step-edit-textarea" id="stepEdit_${index}">${text}</textarea>
        <div class="step-actions">
            <button class="step-action-btn save" onclick="saveStep(${index})">保存</button>
            <button class="step-action-btn" onclick="renderSteps(); document.getElementById('step_${index}').classList.add('expanded');">取消</button>
        </div>
    `;
    const ta = document.getElementById(`stepEdit_${index}`);
    if (ta) ta.focus();
}

function saveStep(index) {
    const stepId = stepsConfig[index].id;
    const textarea = document.getElementById(`stepEdit_${index}`);
    if (!textarea) return;
    const lines = textarea.value.split('\n').filter(l => l.trim());
    stepData[stepId].items = lines;
    renderSteps();
    const el = document.getElementById(`step_${index}`);
    if (el) el.classList.add('expanded');
    showNotification('步骤内容已保存', 'success');
}

// v2.19: 分步生成「重新生成」（重新回答）
// PRD 逻辑（v1.33 / 用户侧PRD v1.3 登记，暂不实现）：
//   当用户在步骤 N（N ≥ 1）点击「重新生成」时，逻辑上应同时重置步骤 1 ~ N 的状态（全部回到 waiting）
//   与生成内容（清空 items / materials），即「该步及之前所有已完成步骤一并重新回答」。
//   设计意图：分步生成步骤之间存在上下文依赖（后一步基于前一步的结果），单独重置某一步会破坏上下文一致性。
// 当前原型实现：仅重置当前步（stepStates[index] = 'current'，重新生成该步内容）。
//   递归重置逻辑已在 PRD 中登记，后续迭代实现。实现时需：
//     1. for (let k = 0; k <= index; k++) { stepStates[k] = 'waiting'; stepData[stepsConfig[k].id] = { items: [], materials: new Set() }; }
//     2. 将 expandedStepIndex 重置为 0，引导用户从第一步重新生成
//     3. 调用 renderSteps() 与 updateStepGenerationButtons() 刷新 UI
function regenerateStep(index) {
    if (isGenerating) return;
    const stepId = stepsConfig[index].id;
    stepStates[index] = 'current';
    renderSteps();
    const el = document.getElementById(`step_${index}`);
    if (el) el.classList.add('expanded');

    setTimeout(() => {
        if (!stepData[stepId]) stepData[stepId] = { items: [], materials: new Set() };
        const selectedMatIds = getEffectiveStepMaterials(stepId);
        const selectedMats = caseItem.files.filter(f => selectedMatIds.has(f.id));
        stepData[stepId].items = generateStepContent(stepId, caseItem, org, selectedMats);
        stepStates[index] = 'done';
        renderSteps();
        const elDone = document.getElementById(`step_${index}`);
        if (elDone) elDone.classList.add('expanded');
    }, 1500);
}

function compileSteps() {
    if (guardReadOnly('compileSteps')) return;
    const _org3 = localStorage.getItem('currentBusiness') || 'court';
    const _cw3 = parseCaseWord(caseItem.caseNumber, _org3);
    const allPresets = mergeCaseElements(getAllElementPresets(caseItem.cause, _org3, _cw3), caseItem.id);
    // v1.27: 要件仅在「裁判文书」(judgment) 时才询问引入
    const _hasElements3 = (allPresets.standard && allPresets.standard.length > 0) || (allPresets.mine && allPresets.mine.length > 0) || (allPresets.case && allPresets.case.length > 0);
    if (stepDocType === 'judgment' && _hasElements3) {
        // v1.48: 有答案→大文本框确认；无答案→恢复原有两个弹框（确认引入→选择要件→答案确认）
        if (hasAnyElementAnswer(allPresets)) {
            showElementContextModal(allPresets, (elementAnswers) => {
                doCompileSteps(elementAnswers);
            });
        } else {
            showPreElementConfirmModal(allPresets,
                () => { doCompileSteps(null); },
                (answers) => { doCompileSteps(answers); }
            );
        }
    } else {
        doCompileSteps(null);
    }
}

function doCompileSteps(elementAnswers) {
    // 将所有步骤内容编译为完整文书
    const allItems = [];
    stepsConfig.forEach(s => {
        const data = stepData[s.id];
        if (data && data.items && data.items.length) {
            allItems.push(`<h3>${s.name}</h3>`);
            data.items.forEach((item, i) => {
                allItems.push(`<p>${i + 1}. ${item}</p>`);
            });
        }
    });

    let elementHint = '';
    if (elementAnswers && elementAnswers.length > 0) {
        const names = elementAnswers.map(p => p.name).join('、');
        elementHint = `<div style="margin-bottom:12px;padding:8px 12px;background:#eff6ff;border-radius:6px;font-size:12px;color:#1e40af;"><i class="fas fa-puzzle-piece"></i> 已引入案由要件辅助生成：${names}</div>`;
    }

    const templateName = getTemplateName(getCurrentTemplates()[stepTemplate]);
    const docTypeName = getCurrentDocTypes()[stepDocType]?.name || '法律文书';
    const title = templateName ? `${docTypeName}（${templateName}）` : docTypeName;
    const reqHint = stepRequirement ? `<div style="margin-bottom:12px;padding:8px 12px;background:#eff6ff;border-radius:6px;font-size:12px;color:#1e40af;"><i class="fas fa-info-circle"></i> 生成需求：${stepRequirement}</div>` : '';
    const content = `<div class="result-doc">
        <h2>${title}</h2>
        <div class="result-doc-meta">案件：${caseItem.caseName || caseItem.caseNumber} | 生成时间：${new Date().toLocaleString('zh-CN')}</div>
        ${reqHint}
        ${elementHint}
        ${allItems.join('')}
        <p style="text-align:right;margin-top:32px;">${getSignerLabel(org)}</p>
        <p style="text-align:right;">${new Date().toLocaleDateString('zh-CN')}</p>
    </div>`;

    // v2.24 (任务 8.8): 分步生成最终编译也接入流式输出
    startStreamingOutput(content, title);
}

// ===== v1.47: 案由要件上下文确认弹框（简化版大文本框）=====
let pendingElementContextCallback = null;
// v1.50: 标记大文本框弹框是否由「无答案→选完要件」路径触发（用于关闭时一并清理选择弹框 state）
let elementContextHasPrevious = false;

// v1.48: 判断当前案件可用要件中是否已有答案
function hasAnyElementAnswer(allPresets) {
    if (!allPresets) return false;
    const all = [
        ...(allPresets.standard || []),
        ...(allPresets.mine || []),
        ...(allPresets.case || [])
    ];
    return all.some(p => {
        const ans = (caseElementsAnswers[p.name] || '').trim();
        return ans.length > 0;
    });
}

// v1.48: 从已有答案构建 elementAnswers 数组（仅含有答案的要件）
function buildElementAnswersFromExisting(allPresets) {
    if (!allPresets) return null;
    const all = [
        ...((allPresets.standard || []).map(p => ({ ...p, source: 'standard' }))),
        ...((allPresets.mine || []).map(p => ({ ...p, source: 'mine' }))),
        ...((allPresets.case || []).map(p => ({ ...p, source: 'case' })))
    ];
    const result = all.filter(p => {
        const ans = (caseElementsAnswers[p.name] || '').trim();
        return ans.length > 0;
    }).map(p => ({
        name: p.name,
        desc: p.desc,
        question: p.question,
        answer: caseElementsAnswers[p.name]
    }));
    return result.length > 0 ? result : null;
}

function showElementContextModal(presets, callback, opts) {
    pendingElementContextCallback = callback;
    const hasPrevious = !!(opts && opts.hasPrevious);
    elementContextHasPrevious = hasPrevious;

    const all = [
        ...((presets && presets.standard) || []).map(p => ({ ...p, source: 'standard' })),
        ...((presets && presets.mine) || []).map(p => ({ ...p, source: 'mine' })),
        ...((presets && presets.case) || []).map(p => ({ ...p, source: 'case' }))
    ];

    if (all.length === 0) {
        if (typeof callback === 'function') callback(null);
        return;
    }

    // 构建上下文文本：已有答案优先用已有答案，否则用 mock 答案
    let contextText = '';
    all.forEach((p, i) => {
        const existingAns = (caseElementsAnswers[p.name] || '').trim();
        const answer = existingAns || generateMockElementAnswer(p, caseItem);
        contextText += `【${p.name}】\n问题：${p.question || ''}\n答案：${answer}`;
        if (i < all.length - 1) contextText += '\n\n';
    });

    const ta = document.getElementById('elementContextTextarea');
    if (ta) ta.value = contextText;

    // v1.50: 按入口切换按钮组——有答案直接弹框（简化版）维持三按钮；无答案路径第三步仅显示「上一步」+「确认生成」
    const cancelBtn = document.getElementById('elementContextCancelBtn');
    const skipBtn = document.getElementById('elementContextSkipBtn');
    const backBtn = document.getElementById('elementContextBackBtn');
    if (cancelBtn) cancelBtn.style.display = hasPrevious ? 'none' : '';
    if (skipBtn) skipBtn.style.display = hasPrevious ? 'none' : '';
    if (backBtn) backBtn.style.display = hasPrevious ? '' : 'none';

    document.getElementById('elementContextOverlay').classList.add('show');
    document.getElementById('elementContextModal').classList.add('show');
}

function closeElementContextModal() {
    document.getElementById('elementContextOverlay').classList.remove('show');
    document.getElementById('elementContextModal').classList.remove('show');
    pendingElementContextCallback = null;
    // v1.50: 若由「无答案→选完要件」路径触发，且未走「上一步」返回，则一并清理选择弹框 state 避免泄漏
    if (elementContextHasPrevious) {
        elementContextHasPrevious = false;
        pendingElementAll = { standard: [], mine: [], case: [] };
        pendingElementSelections = new Set();
        pendingElementConfirmCallback = null;
    }
}

function skipElementContext() {
    const cb = pendingElementContextCallback;
    closeElementContextModal();
    if (typeof cb === 'function') cb(null);
}

function confirmElementContextModal() {
    const text = (document.getElementById('elementContextTextarea')?.value || '').trim();
    // v1.50: 先捕获 callback 再关闭弹框（closeElementContextModal 会置空 pendingElementContextCallback）
    const cb = pendingElementContextCallback;
    if (!text) {
        // 用户清空了内容，等同于不引入要件
        closeElementContextModal();
        if (typeof cb === 'function') cb(null);
        return;
    }

    // 解析大文本框内容，按 【要件名】 分块提取问题与答案
    const elementAnswers = [];
    const blocks = text.split(/(?=【)/);
    blocks.forEach(block => {
        const nameMatch = block.match(/^【(.+?)】/);
        if (!nameMatch) return;
        const name = nameMatch[1].trim();
        const qMatch = block.match(/问题：([\s\S]*?)(?=\n答案：)/);
        const aMatch = block.match(/答案：([\s\S]*)/);
        elementAnswers.push({
            name: name,
            question: qMatch ? qMatch[1].trim() : '',
            answer: aMatch ? aMatch[1].trim() : ''
        });
    });

    closeElementContextModal();
    if (typeof cb === 'function') cb(elementAnswers);
}

// ===== 引入案由要件弹窗 =====
let pendingElementPresets = { standard: [], mine: [], case: [] };
let pendingElementDirectCallback = null;

function showPreElementConfirmModal(presets, onDirect, onIntroduce) {
    pendingElementPresets = presets || { standard: [], mine: [], case: [] };
    pendingElementDirectCallback = onDirect;
    pendingElementConfirmCallback = onIntroduce;

    const standardCount = (pendingElementPresets.standard || []).length;
    const mineCount = (pendingElementPresets.mine || []).length;
    const caseCount = (pendingElementPresets.case || []).length;
    const totalCount = standardCount + mineCount + caseCount;
    const countEl = document.getElementById('preElementConfirmCount');
    if (countEl) {
        // v2.27 (V1.1.8): 计数纳入个案要件；为 0 时省略"个案 0"段，文案更简洁
        const caseSeg = caseCount > 0 ? ` / 个案 ${caseCount}` : '';
        countEl.textContent = `共 ${totalCount} 个可用要件（标准 ${standardCount} / 我的 ${mineCount}${caseSeg}）`;
    }

    document.getElementById('preElementConfirmOverlay').classList.add('show');
    document.getElementById('preElementConfirmModal').classList.add('show');
}

function closePreElementConfirmModal() {
    document.getElementById('preElementConfirmOverlay').classList.remove('show');
    document.getElementById('preElementConfirmModal').classList.remove('show');
}

function chooseDirectGenerate() {
    closePreElementConfirmModal();
    if (pendingElementDirectCallback) pendingElementDirectCallback();
}

function chooseIntroduceElements() {
    closePreElementConfirmModal();
    showElementConfirmModal(pendingElementPresets, pendingElementConfirmCallback);
}

// v1.50: 选择要件弹框「上一步」——返回第一个弹框（确认是否引入），保留第一个弹框的 state
function backToPreElementConfirm() {
    // 仅隐藏选择弹框 UI + 清理本弹框本地 state，不动 pendingElementPresets/Direct/Confirm（第一个弹框共享）
    document.getElementById('elementConfirmOverlay').classList.remove('show');
    document.getElementById('elementConfirmModal').classList.remove('show');
    pendingElementAll = { standard: [], mine: [], case: [] };
    pendingElementSelections = new Set();
    // 重新显示第一个弹框（state 未清理，直接复用）
    document.getElementById('preElementConfirmOverlay').classList.add('show');
    document.getElementById('preElementConfirmModal').classList.add('show');
}

function showElementConfirmModal(presets, callback) {
    pendingElementAll = presets || { standard: [], mine: [], case: [] };
    pendingElementConfirmCallback = callback;
    pendingElementSelections = new Set();

    // 默认勾选所有可用要件
    (pendingElementAll.standard || []).forEach((_, idx) => {
        pendingElementSelections.add(getElementGlobalIndex('standard', idx));
    });
    (pendingElementAll.mine || []).forEach((_, idx) => {
        pendingElementSelections.add(getElementGlobalIndex('mine', idx));
    });
    (pendingElementAll.case || []).forEach((_, idx) => {
        pendingElementSelections.add(getElementGlobalIndex('case', idx));
    });

    renderElementConfirmSelectList();
    updateElementSelectedCount();
    showElementConfirmSelectStep();

    document.getElementById('elementConfirmOverlay').classList.add('show');
    document.getElementById('elementConfirmModal').classList.add('show');
}

function renderElementConfirmSelectList() {
    const container = document.getElementById('elementConfirmSelectList');
    const standard = pendingElementAll.standard || [];
    const mine = pendingElementAll.mine || [];
    const caseElements = pendingElementAll.case || [];

    let html = '';
    if (standard.length > 0) {
        html += renderElementCategory('标准要件', standard, 'standard');
    }
    if (mine.length > 0) {
        html += renderElementCategory('我的要件', mine, 'mine');
    }
    if (caseElements.length > 0) {
        html += renderElementCategory('个案要件', caseElements, 'case');
    }
    if (standard.length === 0 && mine.length === 0 && caseElements.length === 0) {
        html = `<div class="element-confirm-empty">暂无可用的案由要件</div>`;
    }
    container.innerHTML = html;
}

function renderElementCategory(title, items, source) {
    // v2.27 (V1.1.8): 三色标签 — 标准(蓝)/我的(绿)/个案(橙)，与本案要件抽屉一致
    const tagClass = source === 'mine' ? 'select-tag mine' : (source === 'case' ? 'select-tag case' : 'select-tag');
    const tagText = source === 'mine' ? '我的' : (source === 'case' ? '个案' : '标准');
    const listHtml = items.map((p, idx) => {
        const globalIdx = getElementGlobalIndex(source, idx);
        const checked = pendingElementSelections.has(globalIdx) ? 'checked' : '';
        return `
            <label class="element-confirm-select-item" onclick="toggleElementSelection('${source}', ${idx}, event)">
                <input type="checkbox" ${checked} onclick="toggleElementSelection('${source}', ${idx}, event)">
                <div class="select-info">
                    <div class="select-title">${p.name}</div>
                    <div class="select-question">${p.question || ''}</div>
                </div>
                <span class="${tagClass}">${tagText}</span>
            </label>
        `;
    }).join('');
    return `
        <div class="element-confirm-category">
            <div class="element-confirm-category-title">${title}</div>
            <div class="element-confirm-select-list">${listHtml}</div>
        </div>
    `;
}

function getElementGlobalIndex(source, idx) {
    return `${source}_${idx}`;
}

function toggleElementSelection(source, idx, event) {
    if (event) event.stopPropagation();
    const key = getElementGlobalIndex(source, idx);
    if (pendingElementSelections.has(key)) {
        pendingElementSelections.delete(key);
    } else {
        pendingElementSelections.add(key);
    }
    renderElementConfirmSelectList();
    updateElementSelectedCount();
}

function updateElementSelectedCount() {
    const el = document.getElementById('elementSelectedCount');
    if (el) el.textContent = `已选 ${pendingElementSelections.size} 项`;
}

function showElementConfirmSelectStep() {
    document.getElementById('elementConfirmStep1').classList.add('active');
    document.getElementById('elementConfirmStep2').classList.remove('active');
}

function showElementConfirmAnswerStep() {
    if (pendingElementSelections.size === 0) {
        showNotification('请先勾选要引入的要件', 'warning');
        return;
    }
    // v1.48: 选完要件后切换到大文本框确认弹框展示所有已选要件问题及参考答案
    // v1.50: 不调 closeElementConfirmModal（会清状态），仅隐藏 UI 以支持「上一步」返回并保留已勾选
    const selected = getSelectedElements();
    const callback = pendingElementConfirmCallback;
    document.getElementById('elementConfirmOverlay').classList.remove('show');
    document.getElementById('elementConfirmModal').classList.remove('show');
    // 构造只含已选要件的 presets，传入大文本框弹框
    const filteredPresets = {
        standard: selected.filter(p => p.source === 'standard'),
        mine: selected.filter(p => p.source === 'mine'),
        case: selected.filter(p => p.source === 'case')
    };
    showElementContextModal(filteredPresets, callback, { hasPrevious: true });
}

// v1.50: 大文本框弹框「上一步」——返回要件选择弹框（保留已勾选状态）
function backToElementConfirmSelect() {
    // 关闭大文本框弹框
    document.getElementById('elementContextOverlay').classList.remove('show');
    document.getElementById('elementContextModal').classList.remove('show');
    pendingElementContextCallback = null;
    // 重新渲染选择列表（state 未清理，已勾选状态保留）并显示
    renderElementConfirmSelectList();
    updateElementSelectedCount();
    showElementConfirmSelectStep();
    document.getElementById('elementConfirmOverlay').classList.add('show');
    document.getElementById('elementConfirmModal').classList.add('show');
}

function getSelectedElements() {
    const result = [];
    (pendingElementAll.standard || []).forEach((p, idx) => {
        if (pendingElementSelections.has(getElementGlobalIndex('standard', idx))) {
            result.push({ ...p, source: 'standard', idx });
        }
    });
    (pendingElementAll.mine || []).forEach((p, idx) => {
        if (pendingElementSelections.has(getElementGlobalIndex('mine', idx))) {
            result.push({ ...p, source: 'mine', idx });
        }
    });
    (pendingElementAll.case || []).forEach((p, idx) => {
        if (pendingElementSelections.has(getElementGlobalIndex('case', idx))) {
            result.push({ ...p, source: 'case', idx });
        }
    });
    return result;
}

function renderElementConfirmAnswers() {
    const list = document.getElementById('elementConfirmAnswerList');
    const selected = getSelectedElements();
    list.innerHTML = selected.map((p, i) => {
        const answer = generateMockElementAnswer(p, caseItem);
        return `
            <div class="element-confirm-answer-item" data-answer-idx="${i}">
                <div class="answer-title"><i class="fas fa-puzzle-piece"></i> ${p.name}</div>
                <div class="answer-question">${p.question || ''}</div>
                <textarea class="answer-textarea" placeholder="AI 预生成答案，可直接修改">${answer}</textarea>
            </div>
        `;
    }).join('');
}

function generateMockElementAnswer(preset, caseData) {
    const cause = caseData.cause || '本案';
    const partyA = caseData.partyA || '原告';
    const partyB = caseData.partyB || '被告';
    // 根据要件名称生成简易模拟答案
    const name = preset.name;
    if (name.includes('主体') || name.includes('资格')) return `${partyA}与${partyB}均具备本案适格主体资格。`;
    if (name.includes('事实')) return `经审查在案材料，${cause}相关基本事实已初步查清。`;
    if (name.includes('法律')) return `本案主要涉及${cause}相关法律规定。`;
    if (name.includes('程序')) return `案件受理及审理程序符合法律规定。`;
    if (name.includes('合同')) return `双方签订的合同文本内容明确，权利义务约定清晰。`;
    if (name.includes('履行')) return `现有证据显示合同履行存在一定争议。`;
    if (name.includes('责任')) return `需结合合同约定及实际履行情况认定责任。`;
    if (name.includes('损害')) return `损害后果及数额需结合证据进一步核实。`;
    if (name.includes('金额') || name.includes('数额')) return `相关金额以在案凭证记载为准。`;
    if (name.includes('还款')) return `借款人存在部分还款记录，具体金额需核对。`;
    if (name.includes('利息')) return `双方对利息有约定，利率水平需依法审查。`;
    if (name.includes('时效')) return `诉讼时效需结合催款记录判断。`;
    if (name.includes('证据')) return `现有证据基本能够支撑案件事实认定。`;
    if (name.includes('子女')) return `子女抚养问题需综合考虑子女权益及双方条件。`;
    if (name.includes('财产')) return `夫妻共同财产范围及分割方案需进一步查明。`;
    if (name.includes('债务')) return `共同债务认定需结合借款用途及双方确认情况。`;
    if (name.includes('伤情') || name.includes('后果')) return `损害后果以鉴定意见及医疗记录为准。`;
    if (name.includes('故意')) return `主观故意需结合行为人供述及客观行为综合判断。`;
    if (name.includes('数额') || name.includes('标准')) return `涉案金额已达到相关立案标准。`;
    return `关于“${name}”的问题，需结合案件具体材料进一步分析。`;
}

function closeElementConfirmModal() {
    document.getElementById('elementConfirmOverlay').classList.remove('show');
    document.getElementById('elementConfirmModal').classList.remove('show');
    pendingElementAll = { standard: [], mine: [], case: [] };
    pendingElementSelections = new Set();
    pendingElementConfirmCallback = null;
}

function collectElementAnswers() {
    const selected = getSelectedElements();
    const textareas = document.querySelectorAll('#elementConfirmAnswerList .answer-textarea');
    return selected.map((p, i) => {
        const ta = textareas[i];
        return {
            name: p.name,
            desc: p.desc,
            question: p.question,
            answer: ta ? ta.value.trim() : ''
        };
    });
}

function confirmElementContext(useElements) {
    const callback = pendingElementConfirmCallback;
    if (useElements) {
        const answers = collectElementAnswers();
        closeElementConfirmModal();
        if (typeof callback === 'function') {
            callback(answers);
        }
    } else {
        closeElementConfirmModal();
        if (typeof callback === 'function') {
            callback(null);
        }
    }
}

function openMyElements() {
    const cause = caseItem ? encodeURIComponent(caseItem.cause || '') : '';
    window.open(`my-elements.html${cause ? '?cause=' + cause : ''}`, '_blank');
}

function openMyElementsFromModal() {
    openMyElements();
}

// ===== 右栏 - 结果面板 =====
function showResultLoading() {
    document.getElementById('resultBody').innerHTML = `
        <div class="result-loading">
            <div class="spinner"></div>
            <div>AI正在生成文书...</div>
        </div>
    `;
}

// v2.30/v2.23 (任务 8.8/9.5): 流式输出展示 + 进度指示
// 不可取消，完成后自动渲染为文档编辑器
let streamingTimer = null;
let streamingStartTime = 0;

function startStreamingOutput(fullContent, title) {
    const body = document.getElementById('resultBody');

    // v2.31: 流式开始即切换到结果视图，让结果栏可见
    setLayoutState('generated');

    // 流式输出期间禁用【文书精修】【重新配置】按钮
    setResultActionButtonsDisabled(true);

    // 清理旧编辑器实例
    if (resultDocEditor) {
        resultDocEditor.destroy();
        resultDocEditor = null;
    }

    // v2.31: 构建流式输出区（顶部进度 + 思考过程 + 文书内容）
    body.innerHTML = `
        <div class="streaming-output-area">
            <div class="streaming-progress-bar">
                <div class="streaming-progress-info">
                    <span><i class="fas fa-circle-notch fa-spin"></i> 正在生成：${escapeHtmlForStreaming(title || '法律文书')}</span>
                    <span class="streaming-stats" id="streamingStats">思考中...</span>
                </div>
                <div class="streaming-progress-track"><div class="streaming-progress-fill" id="streamingProgressFill" style="width:0%"></div></div>
            </div>
            <div class="streaming-thinking" id="streamingThinking">
                <div class="streaming-thinking-title"><i class="fas fa-brain"></i> 思考过程</div>
                <div id="streamingThinkingList"></div>
            </div>
            <div class="streaming-content" id="streamingContent"></div>
        </div>
    `;

    // v2.31: 阶段一——逐条展示思考过程
    const thinkingSteps = buildThinkingSteps(title);
    const thinkingListEl = document.getElementById('streamingThinkingList');
    const contentEl = document.getElementById('streamingContent');
    const statsEl = document.getElementById('streamingStats');
    const fillEl = document.getElementById('streamingProgressFill');

    streamingStartTime = Date.now();
    let thinkIndex = 0;

    const renderNextThinking = () => {
        if (thinkIndex >= thinkingSteps.length) {
            // 思考过程完成，移除光标，进入阶段二
            const lastCursor = thinkingListEl.querySelector('.think-cursor');
            if (lastCursor) lastCursor.remove();
            statsEl.textContent = '正在生成文书正文...';
            startStreamingContent(fullContent, title, contentEl, statsEl, fillEl);
            return;
        }
        // 移除上一条光标
        const prevCursor = thinkingListEl.querySelector('.think-cursor');
        if (prevCursor) prevCursor.remove();

        const item = document.createElement('div');
        item.className = 'streaming-thinking-item';
        item.innerHTML = `${escapeHtmlForStreaming(thinkingSteps[thinkIndex])}<span class="think-cursor"></span>`;
        thinkingListEl.appendChild(item);
        thinkingListEl.scrollTop = thinkingListEl.scrollHeight;

        const progress = Math.round((thinkIndex + 1) / (thinkingSteps.length + 4) * 100);
        fillEl.style.width = progress + '%';
        statsEl.textContent = `思考中 · ${thinkIndex + 1}/${thinkingSteps.length}`;

        thinkIndex++;
        streamingTimer = setTimeout(renderNextThinking, 420 + Math.random() * 380);
    };
    renderNextThinking();
}

// 根据文书标题生成思考过程文案
function buildThinkingSteps(title) {
    const t = title || '法律文书';
    return [
        `正在阅读案件材料，梳理案情脉络与当事人信息...`,
        `分析原告诉求、被告抗辩及举证质证要点...`,
        `审查证据材料，判断真实性、合法性与关联性...`,
        `归纳本案争议焦点，匹配适用法律条文...`,
        `组织${t}的裁判理由与论据结构...`,
        `生成${t}正文内容并校对排版格式...`
    ];
}

// 阶段二：逐步渲染文书正文段落
function startStreamingContent(fullContent, title, contentEl, statsEl, fillEl) {
    const segments = splitContentToSegments(fullContent);
    let segIndex = 0;
    let outputChars = 0;
    const totalSteps = segments.length + 6; // 思考6步基准

    const renderNext = () => {
        if (segIndex >= segments.length) {
            // 输出完成，自动渲染为文档编辑器
            finishStreaming(fullContent, title);
            return;
        }
        const seg = segments[segIndex];
        contentEl.innerHTML += seg;
        outputChars += seg.replace(/<[^>]+>/g, '').length;
        contentEl.scrollTop = contentEl.scrollHeight;

        // 更新进度（思考过程占基准6步，正文段落实时叠加）
        const progress = Math.min(100, Math.round((segIndex + 1 + 6) / totalSteps * 100));
        fillEl.style.width = progress + '%';
        const elapsed = (Date.now() - streamingStartTime) / 1000;
        const speed = outputChars / (elapsed || 1);
        const remainSegs = segments.length - segIndex - 1;
        const remainChars = remainSegs * (outputChars / (segIndex + 1));
        const remainSec = speed > 0 ? Math.ceil(remainChars / speed) : 0;
        statsEl.textContent = `已输出 ${outputChars} 字 · 预计剩余 ${remainSec}s · 第 ${segIndex + 1}/${segments.length} 段`;

        segIndex++;
        // v2.31: 文书正文输出速度适中（每段 500-900ms），整体约3秒
        streamingTimer = setTimeout(renderNext, 500 + Math.random() * 400);
    };
    renderNext();
}

// 设置右栏顶部操作按钮禁用/启用状态
function setResultActionButtonsDisabled(disabled) {
    const refineBtn = document.getElementById('resultRefineBtn');
    const reconfigBtn = document.getElementById('resultReconfigBtn');
    if (refineBtn) {
        refineBtn.disabled = disabled;
        refineBtn.style.opacity = disabled ? '0.5' : '';
        refineBtn.style.cursor = disabled ? 'not-allowed' : '';
        refineBtn.title = disabled ? '生成中，请稍候' : '基于当前文书上下文进行多轮精修';
    }
    if (reconfigBtn) {
        reconfigBtn.disabled = disabled;
        reconfigBtn.style.opacity = disabled ? '0.5' : '';
        reconfigBtn.style.cursor = disabled ? 'not-allowed' : '';
        reconfigBtn.title = disabled ? '生成中，请稍候' : '重新配置生成参数（默认回填最近一次历史文书快照）';
    }
}

// 将文书内容按段落切分为多个片段
function splitContentToSegments(html) {
    // 按 </p> 或 </h2> 或 </h3> 或 <br> 切分
    const parts = html.split(/(?<=<\/(?:p|h2|h3)>)/);
    // 合并过短片段
    const segments = [];
    let buffer = '';
    parts.forEach(p => {
        buffer += p;
        if (buffer.replace(/<[^>]+>/g, '').length > 40) {
            segments.push(buffer);
            buffer = '';
        }
    });
    if (buffer) segments.push(buffer);
    return segments.length > 0 ? segments : [html];
}

function finishStreaming(fullContent, title) {
    if (streamingTimer) { clearTimeout(streamingTimer); streamingTimer = null; }
    showResult(fullContent, title);
    // v2.30: 流式输出完成后启用操作按钮
    setResultActionButtonsDisabled(false);
    // v2.24 (任务 8.8): 流式输出完成后统一提示
    showNotification('文书已生成完成', 'success');
}

function escapeHtmlForStreaming(text) {
    if (!text) return '';
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function showResult(html, title) {
    resultContent = html;
    resultEditContent = html.replace(/<[^>]+>/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

    const body = document.getElementById('resultBody');
    body.innerHTML = '';

    // v2.30: 渲染可复用文档编辑器
    if (typeof DocEditor !== 'undefined') {
        resultDocEditor = new DocEditor(body, {
            content: resultContent,
            placeholder: '暂无生成结果',
            showToolbar: true,
            onChange: (content) => {
                resultContent = content;
            }
        });
    } else {
        body.innerHTML = `<div class="fade-in">${resultContent}</div>`;
    }

    setLayoutState('generated');
    showNotification('文书生成完成', 'success');
}

function switchResultTab(tab) {
    // v2.30: 编辑器模式替代预览/源码 tab 切换，保留函数避免旧调用报错
    console.log('[case-files] switchResultTab 已废弃，当前使用文档编辑器');
}

function toggleResultCol() {
    document.getElementById('resultCol').classList.toggle('collapsed');
}

function saveResult() {
    if (guardReadOnly('saveResult')) return;
    // v2.30: 从文档编辑器获取最新内容
    if (resultDocEditor) {
        resultContent = resultDocEditor.getContent();
    }

    // 记录当前生成配置
    const isStep = currentGenMethod === 'steps';
    const docTypeEl = document.getElementById(isStep ? 'stepDocType' : 'matDocType');
    const templateEl = document.getElementById(isStep ? 'stepTemplate' : 'matTemplate');
    const requirementEl = document.getElementById(isStep ? 'stepRequirement' : 'matRequirement');
    const docType = docTypeEl ? docTypeEl.value : '';
    const template = templateEl ? templateEl.value : '';
    const requirement = requirementEl ? requirementEl.value : '';

    // v1.37: 构建分步生成的步骤快照（任务 4.2）
    let stepsSnapshot = null;
    if (isStep && typeof stepsConfig !== 'undefined' && typeof stepData !== 'undefined') {
        stepsSnapshot = stepsConfig.map(s => {
            const data = stepData[s.id] || { items: [], materials: new Set() };
            return {
                stepId: s.id,
                stepName: s.name,
                items: (data.items || []).slice(),
                materialIds: [...(data.materials || [])]
            };
        });
    }

    // v1.37: 调用统一版本管理工具，按 docType 合并追加新版本（任务 4.2）
    const savedVersion = addDocumentVersion(caseItem.id, {
        type: 'original',
        genMethod: currentGenMethod,
        source: 'ai',
        content: resultContent,
        createdBy: getCurrentUserName(),
        config: {
            docType,
            template,
            prompt: requirement,
            modelId: getCurrentModelId(),
            materialIds: [...selectedMaterialIds],
            materialTokens: (typeof getSelectedMaterialTokens === 'function') ? getSelectedMaterialTokens() : 0,
            stepsSnapshot,
            // v1.45 链 C: 案件阶段作为字段记录，用于传递给 workflow 走分支
            caseStage: getCurrentCaseStage()
        }
    });

    if (savedVersion) {
        lastSavedVersionId = savedVersion.versionId || '';
        showNotification('文书已保存到历史文书（新版本）', 'success');
        // v1.37: 刷新历史文书按钮状态（任务 4.3）
        updateHistoryDocsBtnState();
    } else {
        showNotification('保存失败，请重试', 'error');
    }
}

// v1.37/v1.38: 历史文书按钮置灰状态（任务 4.3）
function updateHistoryDocsBtnState() {
    const btn = document.getElementById('caseHistoryDocsBtn');
    if (!btn) return;
    const versions = getAllDocumentVersions(caseItem.id);
    if (versions.length === 0) {
        btn.disabled = true;
        btn.style.opacity = '0.5';
        btn.style.cursor = 'not-allowed';
        btn.title = '该案件暂无历史文书';
    } else {
        btn.disabled = false;
        btn.style.opacity = '';
        btn.style.cursor = '';
        btn.title = `查看历史文书（${versions.length} 份）`;
    }
}

function downloadResult() {
    // v2.30: 优先从文档编辑器获取纯文本内容
    const content = resultDocEditor ? resultDocEditor.getText() : resultContent.replace(/<[^>]+>/g, '');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${caseItem.caseName || '文书'}_${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    showNotification('文书已下载', 'success');
}

// ===== 文书精修：跳转多轮对话页面 =====
function refineResult() {
    if (guardReadOnly('refineResult')) return;
    // v2.30: 跳转前同步编辑器最新内容
    if (resultDocEditor) {
        resultContent = resultDocEditor.getContent();
    }
    if (!resultContent) {
        showNotification('请先生成文书', 'warning');
        return;
    }
    // v1.38: 精修跳转 document-polish.html（任务 5.2）
    // 已保存的文书优先用 versionId 跳转；未保存的通过 localStorage 传递内容
    if (lastSavedVersionId) {
        const url = `document-polish.html?caseId=${encodeURIComponent(caseItem.id)}&versionId=${encodeURIComponent(lastSavedVersionId)}`;
        const win = window.open(url, '_blank');
        if (!win) showNotification('浏览器弹窗被拦截，请允许弹窗后重试', 'error');
        return;
    }
    // 未保存：通过 localStorage 传递临时内容
    const matDocType = document.getElementById('matDocType');
    const matTemplate = document.getElementById('matTemplate');
    const matRequirement = document.getElementById('matRequirement');
    const docTypeName = matDocType ? (getCurrentDocTypes()[matDocType.value]?.name || '') : '';
    const templateName = matTemplate ? getTemplateName(getCurrentTemplates()[matTemplate.value]) : '';
    const title = docTypeName ? (templateName ? `${docTypeName} · ${templateName}` : docTypeName) : (templateName || '法律文书');
    const ctx = {
        caseId: caseItem.id,
        caseName: caseItem.caseName || caseItem.caseNumber || '',
        caseNumber: caseItem.caseNumber || '',
        docTitle: title,
        docContent: resultContent,
        source: 'case-files',
        materialIds: [...selectedMaterialIds],
        prompt: matRequirement ? matRequirement.value.trim() : ''
    };
    localStorage.setItem('refineContext', JSON.stringify(ctx));
    const win = window.open('document-polish.html', '_blank');
    if (!win) showNotification('浏览器弹窗被拦截，请允许弹窗后重试', 'error');
}

// ===== 历史文书面板 =====
function toggleHistoryTasks() {
    document.getElementById('historyTasksOverlay').classList.toggle('show');
    document.getElementById('historyTasksPanel').classList.toggle('show');
    if (document.getElementById('historyTasksPanel').classList.contains('show')) {
        renderHistoryTasks();
    }
}

function renderHistoryTasks() {
    const list = document.getElementById('historyTasksList');
    if (!list || !caseItem) return;
    // v1.38: 按版本展示历史文书（与案件列表页一致）
    const versions = getAllDocumentVersions(caseItem.id);
    if (versions.length === 0) {
        list.innerHTML = '<div class="history-task-empty"><i class="fas fa-folder-open"></i><div>暂无历史文书</div></div>';
        return;
    }
    const docTypes = getCurrentDocTypes();
    const genMethodLabel = (m) => m === 'step' ? '分步生成' : '一步生成';
    const typeLabel = (t) => t === 'polish' ? '精修' : (t === 'regenerate' ? '重新生成' : '首次生成');
    const formatTime = (iso) => {
        if (!iso) return '-';
        const d = new Date(iso);
        return isNaN(d.getTime()) ? iso : d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    };
    list.innerHTML = versions.map(v => {
        const docTypeName = docTypes[v.docType]?.name || '法律文书';
        const versionNo = `v${v.versionTotal - v.versionIndex + 1}`;
        return `
            <div class="history-task-item">
                <div class="history-task-item-title">
                    ${v.title || docTypeName}
                    <span class="version-badge">${versionNo}</span>
                    <span class="doc-gen-method-tag">${genMethodLabel(v.genMethod)}</span>
                    ${v.type !== 'original' ? `<span class="doc-type-tag">${typeLabel(v.type)}</span>` : ''}
                </div>
                <div class="history-task-item-meta">
                    <span>${docTypeName}</span>
                    <span>·</span>
                    <span>${formatTime(v.createdAt)}</span>
                    <span>·</span>
                    <span>${v.createdBy || '-'}</span>
                </div>
                <div class="history-task-item-actions">
                    <button class="history-task-item-btn" onclick="event.stopPropagation();viewHistoryDocVersion('${v.versionId}')"><i class="fas fa-eye"></i> 查看</button>
                    <button class="history-task-item-btn" onclick="event.stopPropagation();refineHistoryDocVersion('${v.versionId}')"><i class="fas fa-pen-nib"></i> 精修</button>
                    <button class="history-task-item-btn" onclick="event.stopPropagation();downloadHistoryDocVersion('${v.versionId}')"><i class="fas fa-download"></i> 下载</button>
                    <button class="history-task-item-btn danger" onclick="event.stopPropagation();deleteHistoryDocVersion('${v.versionId}')"><i class="fas fa-trash-alt"></i> 删除</button>
                </div>
            </div>
        `;
    }).join('');
}

// v1.38: 按 versionId 查找版本
function findHistoryDocVersion(versionId) {
    if (!caseItem || !Array.isArray(caseItem.documents)) return null;
    for (const doc of caseItem.documents) {
        if (!doc || !Array.isArray(doc.versions)) continue;
        const v = doc.versions.find(x => x.versionId === versionId);
        if (v) return { doc, version: v };
    }
    return null;
}

function getHistoryDoc(docId) {
    if (!caseItem || !caseItem.documents) return null;
    return caseItem.documents.find(x => x.id === docId) || null;
}

function applyRegenerateConfig() {
    const regenerateDocId = getUrlParam('regenerateDocId');
    if (!regenerateDocId) return;
    const d = getHistoryDoc(regenerateDocId);
    if (!d) {
        showNotification('要重新生成的文书不存在', 'warning');
        return;
    }

    // v2.20: 模型由 workflow 决定，不再从历史文书恢复（恢复 docType 后由 onMatDocTypeChange/refreshModelFromWorkflow 自动刷新）

    // 恢复材料生成视图配置
    if (d.docType) {
        stepDocType = d.docType;
        const matDocTypeEl = document.getElementById('matDocType');
        if (matDocTypeEl) {
            const docTypes = getCurrentDocTypes();
            matDocTypeEl.innerHTML = Object.entries(docTypes).map(([key, cfg]) =>
                `<option value="${key}" ${key === d.docType ? 'selected' : ''}>${cfg.name}</option>`
            ).join('');
        }
        onMatDocTypeChange(false);
        const matTemplateEl = document.getElementById('matTemplate');
        if (matTemplateEl && d.template) matTemplateEl.value = d.template;
        renderMatReqTemplates(d.docType);
    }
    if (d.requirement !== undefined) {
        const matRequirementEl = document.getElementById('matRequirement');
        if (matRequirementEl) matRequirementEl.value = d.requirement;
    }

    // 同步到分步生成视图配置
    syncStepConfigFromMaterial();

    // 恢复已选材料
    selectedMaterialIds.clear();
    if (d.selectedMaterialIds && d.selectedMaterialIds.length) {
        d.selectedMaterialIds.forEach(id => selectedMaterialIds.add(id));
    }
    renderMaterialTree();
    updateAllSelectedCounts();

    // 若原生成方式为分步生成，切换到分步生成视图
    if (d.genMethod === 'steps') {
        switchToStepView({ auto: false });
    }

    showNotification('已加载历史文书的生成配置，可调整后再生成', 'success');
}

function viewHistoryDoc(docId) {
    const d = getHistoryDoc(docId);
    if (!d) return;
    window.location.href = `document-detail.html?caseId=${caseId}&docId=${docId}`;
}

function refineHistoryDoc(docId) {
    const d = getHistoryDoc(docId);
    if (!d) return;
    const content = (d.versions && d.versions[0] && d.versions[0].content) || '';
    localStorage.setItem('refineContext', JSON.stringify({
        caseName: caseItem.caseName || caseItem.caseNumber || '',
        docTitle: d.title || '法律文书',
        docContent: content
    }));
    const win = window.open('chat.html?refine=1', '_blank');
    if (!win) {
        showNotification('弹出窗口被阻止，请允许弹出窗口后重试', 'warning');
    }
}

function regenerateHistoryDoc(docId) {
    const d = getHistoryDoc(docId);
    if (!d) return;
    window.location.href = `case-files.html?caseId=${caseId}&regenerateDocId=${docId}`;
}

function downloadHistoryDoc(docId) {
    const d = getHistoryDoc(docId);
    if (!d) return;
    const content = (d.versions && d.versions[0] && d.versions[0].content) || '';
    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>${d.title || '法律文书'}</title>
    <style>body{font-family:'Noto Serif SC','SimSun',serif;line-height:2;padding:40px;max-width:800px;margin:0 auto;}h2{text-align:center;font-size:22pt;}p{text-indent:2em;font-size:14pt;}</style>
</head>
<body>${content}</body>
</html>`;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${caseItem.caseName || d.title || '法律文书'}.html`;
    a.click();
    URL.revokeObjectURL(url);
}

function deleteHistoryDoc(docId) {
    const d = getHistoryDoc(docId);
    if (!d) return;
    if (!confirm(`确定要删除文书「${d.title || '未命名文书'}」吗？删除后不可恢复。`)) return;
    caseItem.documents = caseItem.documents.filter(x => x.id !== docId);
    caseItem.updatedAt = new Date().toISOString().split('T')[0];
    saveBusinessSystems();
    renderHistoryTasks();
    showNotification('文书已删除', 'success');
}

// v1.38: 按 versionId 操作历史文书版本
function viewHistoryDocVersion(versionId) {
    const res = findHistoryDocVersion(versionId);
    if (!res) { showNotification('版本不存在', 'error'); return; }
    const { doc, version } = res;
    const title = version.title || doc.title || caseItem.caseName || '法律文书';
    const content = version.content || '';
    const caseNo = caseItem.caseNumber || '';
    const causeName = caseItem.cause || '';
    const previewWin = window.open('', '_blank', 'width=900,height=800,menubar=no,toolbar=no');
    if (!previewWin) {
        showNotification('浏览器弹窗被拦截，请允许弹窗后重试', 'error');
        return;
    }
    previewWin.document.write('<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n    <meta charset="UTF-8">\n    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n    <title>' + title + ' - 文书预览</title>\n    <style>\n        body { font-family: "Noto Serif SC", "SimSun", serif; margin: 0; padding: 40px; background: #f5f5f5; }\n        .preview-container { max-width: 800px; margin: 0 auto; background: white; padding: 50px 60px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }\n        .preview-header { text-align: center; margin-bottom: 40px; padding-bottom: 20px; border-bottom: 2px solid #333; }\n        .preview-title { font-size: 22px; font-weight: 700; margin: 0 0 10px; color: #1a1a1a; }\n        .preview-meta { font-size: 14px; color: #666; }\n        .preview-content { font-size: 16px; line-height: 1.8; color: #333; }\n        .preview-content p { margin: 1em 0; text-indent: 2em; }\n        .preview-content h2 { font-size: 18px; font-weight: 600; margin: 2em 0 1em; color: #1a1a1a; }\n        .preview-content h3 { font-size: 16px; font-weight: 600; margin: 1.5em 0 0.8em; color: #1a1a1a; }\n        .preview-footer { margin-top: 60px; text-align: right; font-size: 14px; color: #666; }\n        @media print {\n            body { background: white; padding: 0; }\n            .preview-container { box-shadow: none; padding: 20px; }\n        }\n    </style>\n</head>\n<body>\n    <div class="preview-container">\n        <div class="preview-header">\n            <div class="preview-title">' + title + '</div>\n            <div class="preview-meta">' + caseNo + ' · ' + causeName + '</div>\n        </div>\n        <div class="preview-content">' + content + '</div>\n        <div class="preview-footer">文书生成时间：' + new Date().toLocaleString() + '</div>\n    </div>\n</body>\n</html>');
    previewWin.document.close();
}

function refineHistoryDocVersion(versionId) {
    const res = findHistoryDocVersion(versionId);
    if (!res) { showNotification('版本不存在', 'error'); return; }
    // v1.38: 跳转精修页面（任务 5.2）
    const url = `document-polish.html?caseId=${encodeURIComponent(caseItem.id)}&versionId=${encodeURIComponent(versionId)}`;
    const win = window.open(url, '_blank');
    if (!win) {
        showNotification('浏览器弹窗被拦截，请允许弹窗后重试', 'warning');
    }
}

function downloadHistoryDocVersion(versionId) {
    const res = findHistoryDocVersion(versionId);
    if (!res) { showNotification('版本不存在', 'error'); return; }
    const { doc, version } = res;
    const content = version.content || '';
    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>${doc.title || '法律文书'}</title>
    <style>body{font-family:'Noto Serif SC','SimSun',serif;line-height:2;padding:40px;max-width:800px;margin:0 auto;}h2{text-align:center;font-size:22pt;}p{text-indent:2em;font-size:14pt;}</style>
</head>
<body>${content}</body>
</html>`;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${caseItem.caseName || doc.title || '法律文书'}.html`;
    a.click();
    URL.revokeObjectURL(url);
    showNotification('文书已下载', 'success');
}

function deleteHistoryDocVersion(versionId) {
    const res = findHistoryDocVersion(versionId);
    if (!res) { showNotification('版本不存在', 'error'); return; }
    const { doc, version } = res;
    if (!confirm(`确定要删除版本「${doc.title || '未命名文书'}」吗？删除后不可恢复。`)) return;
    const ok = deleteDocumentVersion(caseItem.id, versionId);
    if (ok) {
        renderHistoryTasks();
        updateHistoryDocsBtnState();
        showNotification('版本已删除', 'success');
    } else {
        showNotification('删除失败', 'error');
    }
}

// ===== 文件上传 =====
function openUploadModal(preselectedCategory) {
    if (guardReadOnly('openUploadModal')) return;
    document.getElementById('uploadOverlay').classList.add('show');
    document.getElementById('uploadModal').classList.add('show');
    pendingUploadFiles = [];
    document.getElementById('uploadList').innerHTML = '';

    const select = document.getElementById('uploadCategorySelect');
    select.innerHTML = '<option value="">自动分类</option>' +
        getMaterialCategoryNames().map(cat => `<option value="${cat}">${cat}</option>`).join('');
    select.value = preselectedCategory || '';
}

function closeUploadModal() {
    document.getElementById('uploadOverlay').classList.remove('show');
    document.getElementById('uploadModal').classList.remove('show');
}

function handleFileSelect(event) {
    const files = event.target.files;
    pendingUploadFiles = [...files];
    renderUploadList();
}

function renderUploadList() {
    const list = document.getElementById('uploadList');
    list.innerHTML = pendingUploadFiles.map((f, i) => `
        <div class="upload-list-item">
            <span><i class="fas ${getFileIcon(f.name)}"></i> ${f.name}</span>
            <span style="color:var(--text-muted)">${(f.size / 1024).toFixed(1)} KB</span>
        </div>
    `).join('');
}

function confirmUpload() {
    if (!pendingUploadFiles.length) {
        showNotification('请先选择文件', 'warning');
        return;
    }
    if (!caseItem.files) caseItem.files = [];
    const targetCategory = document.getElementById('uploadCategorySelect').value;
    pendingUploadFiles.forEach(f => {
        const fileObj = {
            id: `file_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            name: f.name,
            size: `${(f.size / 1024).toFixed(1)} KB`,
            estimatedTokens: estimateFileTokens(f),
            uploadDate: new Date().toISOString().split('T')[0],
            ocrStatus: 'done'
        };
        if (targetCategory) fileObj.category = targetCategory;
        caseItem.files.push(fileObj);
    });
    caseItem.fileCount = caseItem.files.length;
    caseItem.updatedAt = new Date().toISOString().split('T')[0];
    saveBusinessSystems();
    renderMaterialTree();
    closeUploadModal();
    showNotification(`已上传 ${pendingUploadFiles.length} 个文件`, 'success');
}

// ===== 文件重命名 =====
function startRename(fileId) {
    if (guardReadOnly('startRename')) return;
    const file = (caseItem.files || []).find(f => f.id === fileId);
    if (!file) return;
    const item = document.querySelector(`.material-item[data-id="${fileId}"]`);
    const targetEl = item ? item.querySelector('.material-item-name') : null;
    if (!targetEl) return;

    const oldName = file.name;
    targetEl.outerHTML = `<input class="rename-input material-item-name" value="${oldName}" id="renameInput" onblur="submitRename('${fileId}')" onkeydown="if(event.key==='Enter')this.blur();if(event.key==='Escape')renderMaterialTree()">`;
    const input = document.getElementById('renameInput');
    if (input) {
        input.focus();
        const dotIndex = oldName.lastIndexOf('.');
        if (dotIndex > 0) {
            input.setSelectionRange(0, dotIndex);
        } else {
            input.select();
        }
    }
}

function submitRename(fileId) {
    const input = document.getElementById('renameInput');
    if (!input) return;
    const newName = input.value.trim();
    const file = (caseItem.files || []).find(f => f.id === fileId);
    if (file && newName && newName !== file.name) {
        file.name = newName;
        file.updatedAt = new Date().toISOString().split('T')[0];
        caseItem.updatedAt = new Date().toISOString().split('T')[0];
        saveBusinessSystems();
        showNotification('文件名已更新', 'success');
    }
    renderMaterialTree();
}

function startChangeCategory(fileId) {
    if (guardReadOnly('startChangeCategory')) return;
    const file = (caseItem.files || []).find(f => f.id === fileId);
    if (!file) return;
    const item = document.querySelector(`.material-item[data-id="${fileId}"]`);
    if (!item) return;
    const actionBtn = item.querySelector('.material-item-action[title="设置分类"]');
    if (!actionBtn) return;

    const categories = getMaterialCategoryNames();
    const options = categories.map(cat =>
        `<option value="${cat}" ${cat === file.category ? 'selected' : ''}>${cat}</option>`
    ).join('');

    actionBtn.outerHTML = `
        <select class="category-select" onchange="changeFileCategory('${fileId}', this.value);event.stopPropagation();" onclick="event.stopPropagation();" onblur="renderMaterialTree()">
            <option value="">自动分类</option>
            ${options}
        </select>
    `;
    const select = item.querySelector('.category-select');
    if (select) select.focus();
}

function changeFileCategory(fileId, newCategory) {
    const file = (caseItem.files || []).find(f => f.id === fileId);
    if (!file) return;
    if (newCategory === file.category) {
        renderMaterialTree();
        return;
    }
    if (newCategory) {
        file.category = newCategory;
    } else {
        delete file.category;
    }
    file.updatedAt = new Date().toISOString().split('T')[0];
    caseItem.updatedAt = new Date().toISOString().split('T')[0];
    saveBusinessSystems();
    showNotification('材料分类已更新', 'success');
    renderMaterialTree();
}

// ===== 删除功能 =====
function confirmDeleteFile(fileId) {
    if (guardReadOnly('confirmDeleteFile')) return;
    const file = (caseItem.files || []).find(f => f.id === fileId);
    if (!file) return;
    if (!confirm(`确定删除材料「${file.name}」？`)) return;
    deleteFile(fileId);
}

function deleteFile(fileId) {
    caseItem.files = (caseItem.files || []).filter(f => f.id !== fileId);
    caseItem.fileCount = caseItem.files.length;
    caseItem.updatedAt = new Date().toISOString().split('T')[0];
    saveBusinessSystems();
    selectedMaterialIds.delete(fileId);
    renderMaterialTree();
    showNotification('材料已删除', 'success');
}

function deleteSelectedMaterials() {
    if (guardReadOnly('deleteSelectedMaterials')) return;
    if (selectedMaterialIds.size === 0) return;
    if (!confirm(`确定删除已选的 ${selectedMaterialIds.size} 个材料？`)) return;

    const idsToDelete = Array.from(selectedMaterialIds);
    caseItem.files = (caseItem.files || []).filter(f => !idsToDelete.includes(f.id));
    caseItem.fileCount = caseItem.files.length;
    caseItem.updatedAt = new Date().toISOString().split('T')[0];
    saveBusinessSystems();
    selectedMaterialIds.clear();
    renderMaterialTree();
    showNotification(`已删除 ${idsToDelete.length} 个材料`, 'success');
}

// ===== v2.24 (任务 8.6 / 9.4): 本案要件抽屉 =====
// 抽屉状态与缓存
let caseElementsDrawerOpen = false;
let caseElementsCache = { standard: [], mine: [], case: [] }; // 当前案件三类要件缓存
let caseElementsAnswers = {};      // { [要件名]: 答案 }，与 localStorage.caseElements_${caseId} 同步
let caseElementsSelection = new Set(); // 选中的要件名集合
let caseElementsFollowUps = {};    // { [要件名]: [{q,a}] }，与 localStorage.caseElementsFollowUps_${caseId} 同步
let currentQaElement = null;       // 当前正在问答的要件对象

// ---- 个案要件存取（案件维度）----
function getCaseCustomElements(cid) {
    if (!cid) return [];
    try {
        const arr = JSON.parse(localStorage.getItem(`caseCustomElements_${cid}`) || '[]');
        return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
}
function setCaseCustomElements(cid, arr) {
    if (!cid) return;
    localStorage.setItem(`caseCustomElements_${cid}`, JSON.stringify(arr || []));
}

// v2.27 (V1.1.8): 将个案要件合并进 allPresets，供引入要件弹框统一消费
// 与 loadCaseElementsAll 保持一致的过滤（enabled !== false）与 source 标记
function mergeCaseElements(allPresets, cid) {
    const base = allPresets && typeof allPresets === 'object' ? allPresets : { standard: [], mine: [] };
    const caseCustom = getCaseCustomElements(cid)
        .filter(p => p && p.enabled !== false)
        .map(p => ({ ...p, source: 'case' }));
    return {
        standard: base.standard || [],
        mine: base.mine || [],
        case: caseCustom
    };
}

// ---- 要件答案存取（案件维度）----
function loadElementAnswers(cid) {
    if (!cid) return {};
    try {
        const obj = JSON.parse(localStorage.getItem(`caseElements_${cid}`) || '{}');
        return (obj && typeof obj === 'object') ? obj : {};
    } catch (e) { return {}; }
}
function saveElementAnswers(cid, obj) {
    if (!cid) return;
    localStorage.setItem(`caseElements_${cid}`, JSON.stringify(obj || {}));
}

// ---- 要件勾选状态存取（案件维度）----
function loadElementSelection(cid) {
    if (!cid) return new Set();
    try {
        const arr = JSON.parse(localStorage.getItem(`caseElementsSelection_${cid}`) || '[]');
        return new Set(Array.isArray(arr) ? arr : []);
    } catch (e) { return new Set(); }
}
function saveElementSelection(cid, set) {
    if (!cid) return;
    localStorage.setItem(`caseElementsSelection_${cid}`, JSON.stringify(Array.from(set || [])));
}

// ---- 要件追问历史存取（案件维度）----
function loadElementFollowUps(cid) {
    if (!cid) return {};
    try {
        const obj = JSON.parse(localStorage.getItem(`caseElementsFollowUps_${cid}`) || '{}');
        return (obj && typeof obj === 'object') ? obj : {};
    } catch (e) { return {}; }
}
function saveElementFollowUps(cid, obj) {
    if (!cid) return;
    localStorage.setItem(`caseElementsFollowUps_${cid}`, JSON.stringify(obj || {}));
}

// v2.28: 判断案件是否已做过 AI 总结（caseElementsAnswers 中存在任意要件答案）
function hasExistingElementAnswers() {
    if (!caseItem) return false;
    const all = [
        ...(caseElementsCache.standard || []),
        ...(caseElementsCache.mine || []),
        ...(caseElementsCache.case || [])
    ];
    return all.some(p => p && p.name && (caseElementsAnswers[p.name] || '').trim().length > 0);
}

// v2.28: 收集已生成的要件答案，供 generateByMaterial/compileSteps 直接引入
function collectExistingElementAnswers() {
    const result = [];
    const all = [
        ...(caseElementsCache.standard || []).map(p => ({ ...p, source: 'standard' })),
        ...(caseElementsCache.mine || []).map(p => ({ ...p, source: 'mine' })),
        ...(caseElementsCache.case || []).map(p => ({ ...p, source: 'case' }))
    ];
    all.forEach(p => {
        const ans = (caseElementsAnswers[p.name] || '').trim();
        if (ans) {
            result.push({ name: p.name, desc: p.desc, question: p.question, answer: ans });
        }
    });
    return result;
}

// 加载当前案件的全部要件（标准 + 我的 + 个案），同步刷新缓存与答案
function loadCaseElementsAll() {
    if (!caseItem) {
        caseElementsCache = { standard: [], mine: [], case: [] };
        caseElementsAnswers = {};
        caseElementsSelection = new Set();
        caseElementsFollowUps = {};
        return caseElementsCache;
    }
    const _org = localStorage.getItem('currentBusiness') || org || 'court';
    const _cw = parseCaseWord(caseItem.caseNumber, _org);
    const presets = getAllElementPresets(caseItem.cause, _org, _cw);
    const standard = (presets.standard || []).map(p => ({ ...p, source: 'standard' }));
    const mine = (presets.mine || []).map(p => ({ ...p, source: 'mine' }));
    const caseCustom = getCaseCustomElements(caseItem.id)
        .filter(p => p && p.enabled !== false)
        .map(p => ({ ...p, source: 'case' }));
    caseElementsCache = { standard, mine, case: caseCustom };
    caseElementsAnswers = loadElementAnswers(caseItem.id);
    caseElementsSelection = loadElementSelection(caseItem.id);
    caseElementsFollowUps = loadElementFollowUps(caseItem.id);
    return caseElementsCache;
}

// 更新材料树底部入口按钮的数字
function refreshCaseElementsEntryCount() {
    const data = caseElementsCache && (caseElementsCache.standard || caseElementsCache.mine || caseElementsCache.case)
        ? caseElementsCache
        : loadCaseElementsAll();
    const n = (data.standard?.length || 0) + (data.mine?.length || 0) + (data.case?.length || 0);
    const el = document.getElementById('caseElementsEntryCount');
    if (el) el.textContent = String(n);
}

// ---- 抽屉开关 ----
function toggleElementsDrawer() {
    if (caseElementsDrawerOpen) {
        closeElementsDrawer();
    } else {
        openElementsDrawer();
    }
}
function openElementsDrawer() {
    loadCaseElementsAll();
    renderElementsList();
    document.getElementById('caseElementsOverlay').classList.add('show');
    document.getElementById('caseElementsDrawer').classList.add('show');
    caseElementsDrawerOpen = true;
}
function closeElementsDrawer() {
    document.getElementById('caseElementsOverlay').classList.remove('show');
    document.getElementById('caseElementsDrawer').classList.remove('show');
    caseElementsDrawerOpen = false;
    toggleCaseElementAddForm(false);
}

// ---- 渲染要件列表 ----
function renderElementsList() {
    const body = document.getElementById('caseElementsBody');
    if (!body) return;
    const data = caseElementsCache || { standard: [], mine: [], case: [] };
    const standard = data.standard || [];
    const mine = data.mine || [];
    const caseC = data.case || [];

    // 统计条
    const statsEl = document.getElementById('caseElementsStats');
    if (statsEl) {
        statsEl.innerHTML = `
            <span class="stat-item"><span class="stat-dot standard"></span> 标准 <span class="stat-num">${standard.length}</span></span>
            <span class="stat-item"><span class="stat-dot mine"></span> 我的 <span class="stat-num">${mine.length}</span></span>
            <span class="stat-item"><span class="stat-dot case"></span> 个案 <span class="stat-num">${caseC.length}</span></span>
        `;
    }

    if (standard.length === 0 && mine.length === 0 && caseC.length === 0) {
        body.innerHTML = `
            <div class="case-elements-empty">
                <i class="fas fa-inbox"></i>
                <div>本案暂无可用要件</div>
                <div style="font-size:11px;margin-top:6px;">可在下方新增个案要件，或前往"管理我的要件"维护</div>
            </div>
        `;
        updateAiSummarizeBtnState(0);
        return;
    }

    let html = '';
    if (standard.length > 0) html += renderElementsGroup('标准要件', standard, 'standard');
    if (mine.length > 0) html += renderElementsGroup('我的要件', mine, 'mine');
    if (caseC.length > 0) html += renderElementsGroup('个案要件', caseC, 'case');
    body.innerHTML = html;
    updateAiSummarizeBtnState(standard.length + mine.length + caseC.length);
}

// v2.29: 一键生成按钮可用性控制——无可用要件时置灰并提示
function updateAiSummarizeBtnState(totalCount) {
    const btn = document.getElementById('aiSummarizeBtn');
    if (!btn) return;
    if (totalCount > 0) {
        btn.disabled = false;
        btn.classList.remove('disabled');
        btn.title = '';
    } else {
        btn.disabled = true;
        btn.classList.add('disabled');
        btn.title = '暂无要件可生成，请先新增或维护要件';
    }
}

function renderElementsGroup(title, items, source) {
    const listHtml = items.map((p, idx) => {
        const checked = caseElementsSelection.has(p.name) ? 'checked' : '';
        const answer = (caseElementsAnswers[p.name] || '').trim();
        const answered = answer.length > 0;
        const answeredDot = answered ? '<span class="answered-dot" title="已生成答案"></span>' : '';
        const delBtn = source === 'case'
            ? `<button type="button" class="case-elements-item-del-btn" onclick="deleteCaseElement('${escapeJsString(p.name)}')" title="删除该个案要件"><i class="fas fa-trash-alt"></i></button>`
            : '';
        // 已答状态直接在要件项下方展示答案内容；操作按钮参考分步生成（编辑/重新生成/内容优化）
        let answerHtml = '';
        if (answered) {
            const followUps = (caseElementsFollowUps[p.name] || []);
            const optimizeCount = followUps.length;
            const optimizeDisabled = optimizeCount >= 3 ? 'disabled title="已达到最大优化轮次（3 轮）"' : '';
            const optimizeLabel = optimizeCount > 0 ? `内容优化（${optimizeCount}/3）` : '内容优化';
            // v1.48 链 G: 优化历史折叠展示（除最后一轮外），每条带回填+删除按钮
            const followUpsHtml = followUps.length > 1
                ? `<details class="case-elements-optimization-history">
                    <summary>优化历史（${followUps.length - 1} 轮）</summary>
                    ${followUps.slice(0, -1).map((f, idx) => `
                        <div class="case-elements-followup-item">
                            <div class="case-elements-followup-q"><i class="fas fa-question-circle"></i> 第 ${idx + 1} 轮：${escapeHtmlForElements(f.q)}</div>
                            <div class="case-elements-followup-a"><i class="fas fa-comment-dots"></i> ${escapeHtmlForElements(f.a)}</div>
                            <div class="case-elements-followup-actions">
                                <button type="button" class="case-elements-item-edit-btn" onclick="backfillElementOptimization('${escapeJsString(p.name)}', ${idx})"><i class="fas fa-undo"></i> 回填</button>
                                <button type="button" class="case-elements-item-edit-btn" onclick="deleteElementOptimization('${escapeJsString(p.name)}', ${idx})"><i class="fas fa-trash-alt"></i> 删除</button>
                            </div>
                        </div>
                    `).join('')}
                </details>`
                : '';
            answerHtml = `<div class="case-elements-item-answer">
                   <div class="answer-text">${escapeHtmlForElements(answer)}</div>
                   <div class="case-elements-item-actions">
                       <button type="button" class="case-elements-item-edit-btn" onclick="editElementAnswerInline('${escapeJsString(p.name)}')"><i class="fas fa-edit"></i> 编辑</button>
                       <button type="button" class="case-elements-item-edit-btn" onclick="regenerateElementAnswer('${escapeJsString(p.name)}')"><i class="fas fa-redo"></i> 重新生成</button>
                       <button type="button" class="case-elements-item-edit-btn" onclick="contentOptimizeElement('${escapeJsString(p.name)}')" ${optimizeDisabled}><i class="fas fa-magic-wand-sparkles"></i> ${optimizeLabel}</button>
                   </div>
                   <div class="case-elements-followup-list">${followUpsHtml}</div>
               </div>`;
        }
        return `
            <div class="case-elements-item">
                <input type="checkbox" ${checked} onchange="toggleDrawerElementSelection('${escapeJsString(p.name)}', this.checked)">
                <div class="case-elements-item-body">
                    <div class="case-elements-item-title">
                        ${escapeHtmlForElements(p.name)} ${answeredDot}
                        <span class="source-tag ${source}">${sourceLabel(source)}</span>
                        ${delBtn}
                    </div>
                    <div class="case-elements-item-question">${escapeHtmlForElements(p.question || p.desc || '')}</div>
                    ${answerHtml}
                </div>
            </div>
        `;
    }).join('');
    return `
        <div class="case-elements-group">
            <div class="case-elements-group-title">${title} <span class="group-count">${items.length} 项</span></div>
            ${listHtml}
        </div>
    `;
}

// v2.27: 内联编辑要件答案（替代原 openElementQaModal 弹窗）
function editElementAnswerInline(name) {
    if (!caseItem) return;
    const current = caseElementsAnswers[name] || '';
    const itemEls = document.querySelectorAll('.case-elements-item');
    let targetEl = null;
    itemEls.forEach(el => {
        const titleEl = el.querySelector('.case-elements-item-title');
        if (titleEl && titleEl.textContent.includes(name)) {
            targetEl = el;
        }
    });
    if (!targetEl) return;
    const body = targetEl.querySelector('.case-elements-item-body');
    if (!body || body.querySelector('.inline-edit-area')) return;
    const existingAnswer = body.querySelector('.case-elements-item-answer');
    if (existingAnswer) existingAnswer.remove();
    const editHtml = `
        <div class="case-elements-item-answer inline-edit-area">
            <textarea class="inline-edit-textarea" placeholder="">${escapeHtmlForElements(current)}</textarea>
            <div class="inline-edit-actions">
                <button type="button" class="case-elements-item-edit-btn" onclick="saveElementAnswerInline('${escapeJsString(name)}')"><i class="fas fa-save"></i> 保存</button>
                <button type="button" class="case-elements-item-edit-btn" onclick="renderElementsList();"><i class="fas fa-times"></i> 取消</button>
            </div>
        </div>
    `;
    body.insertAdjacentHTML('beforeend', editHtml);
    const ta = body.querySelector('.inline-edit-textarea');
    if (ta) { ta.focus(); ta.style.height = ta.scrollHeight + 'px'; }
}

function saveElementAnswerInline(name) {
    if (!caseItem) return;
    const ta = document.querySelector('.inline-edit-area .inline-edit-textarea');
    if (!ta) return;
    const val = ta.value.trim();
    caseElementsAnswers[name] = val;
    saveElementAnswers(caseItem.id, caseElementsAnswers);
    if (val) {
        caseElementsSelection.add(name);
        saveElementSelection(caseItem.id, caseElementsSelection);
    }
    renderElementsList();
    showNotification('答案已保存', 'success');
}

// 重新生成要件答案：基于当前要件重新调用 AI 生成，覆盖原答案（追问历史保留）
function regenerateElementAnswer(name) {
    if (!caseItem) return;
    const all = [
        ...(caseElementsCache.standard || []).map(p => ({ ...p, source: 'standard' })),
        ...(caseElementsCache.mine || []).map(p => ({ ...p, source: 'mine' })),
        ...(caseElementsCache.case || []).map(p => ({ ...p, source: 'case' }))
    ];
    const preset = all.find(p => p.name === name);
    if (!preset) {
        showNotification('未找到该要件', 'warning');
        return;
    }
    const answer = generateMockElementAnswer(preset, caseItem);
    caseElementsAnswers[name] = answer;
    caseElementsSelection.add(name);
    saveElementAnswers(caseItem.id, caseElementsAnswers);
    saveElementSelection(caseItem.id, caseElementsSelection);
    renderElementsList();
    showNotification('答案已重新生成', 'success');
}

// v1.48 链 G: 内容优化（原追问改名+轮次限制+展示方式调整）
function contentOptimizeElement(name) {
    if (!caseItem) return;

    // 轮次限制：最多 3 轮
    const optimizeCount = (caseElementsFollowUps[name] || []).length;
    if (optimizeCount >= 3) {
        showNotification('已达到最大优化轮次（3 轮）', 'warning');
        return;
    }

    const areaId = `elementFollowUpArea_${name.replace(/\s/g, '_')}`;
    const existing = document.getElementById(areaId);
    if (existing) {
        existing.remove();
        return;
    }
    // 定位当前要件答案区
    const items = document.querySelectorAll('.case-elements-item');
    let targetAnswer = null;
    items.forEach(el => {
        const titleEl = el.querySelector('.case-elements-item-title');
        if (titleEl && titleEl.textContent.includes(name)) {
            targetAnswer = el.querySelector('.case-elements-item-answer');
        }
    });
    if (!targetAnswer) return;
    const followupList = targetAnswer.querySelector('.case-elements-followup-list');
    const wrap = document.createElement('div');
    wrap.className = 'case-elements-followup-area';
    wrap.id = areaId;
    wrap.innerHTML = `
        <div class="case-elements-followup-input-row">
            <input type="text" placeholder="输入优化要求，按 Enter 发送..." class="case-elements-followup-text">
            <button type="button" class="case-elements-item-edit-btn primary" onclick="submitElementOptimize('${escapeJsString(name)}')"><i class="fas fa-paper-plane"></i> 发送</button>
        </div>
    `;
    followupList.insertAdjacentElement('afterend', wrap);
    const input = wrap.querySelector('.case-elements-followup-text');
    if (input) {
        input.focus();
        input.addEventListener('keydown', e => {
            if (e.key === 'Enter') { e.preventDefault(); submitElementOptimize(name); }
        });
    }
}

// v1.48 链 G: 提交内容优化，模拟 AI 回答并持久化到 caseElementsFollowUps
function submitElementOptimize(name) {
    if (!caseItem) return;
    const areaId = `elementFollowUpArea_${name.replace(/\s/g, '_')}`;
    const area = document.getElementById(areaId);
    const input = area ? area.querySelector('.case-elements-followup-text') : null;
    if (!input || !input.value.trim()) return;

    // 轮次限制校验
    const optimizeCount = (caseElementsFollowUps[name] || []).length;
    if (optimizeCount >= 3) {
        showNotification('已达到最大优化轮次（3 轮）', 'warning');
        return;
    }

    const q = input.value.trim();
    if (!caseElementsFollowUps[name]) caseElementsFollowUps[name] = [];
    // 原型 mock：基于要件名返回模拟回答
    const mockAnswers = [
        `根据案件材料进一步分析，「${name}」的答案已得到补充印证。`,
        `补充说明：该要件涉及的法律依据可在文书中引用具体条款增强说服力。`,
        `经进一步检索，建议结合相关证据链对「${name}」的结论予以强化。`
    ];
    const a = mockAnswers[caseElementsFollowUps[name].length % mockAnswers.length];
    caseElementsFollowUps[name].push({ q, a });

    // 优化后更新正式答案（模拟：用优化回答覆盖原答案）
    caseElementsAnswers[name] = a;
    saveElementAnswers(caseItem.id, caseElementsAnswers);
    saveElementFollowUps(caseItem.id, caseElementsFollowUps);
    renderElementsList();

    // 若未达 3 轮上限，重新展开优化输入框
    if (caseElementsFollowUps[name].length < 3) {
        setTimeout(() => contentOptimizeElement(name), 0);
    }
}

// v1.48 链 G: 回填要件优化历史答案到正式答案文本框
function backfillElementOptimization(name, followUpIdx) {
    if (!caseItem) return;
    const followUps = caseElementsFollowUps[name] || [];
    if (followUpIdx >= followUps.length) return;
    const answer = followUps[followUpIdx].a;
    caseElementsAnswers[name] = answer;
    saveElementAnswers(caseItem.id, caseElementsAnswers);
    renderElementsList();
    showNotification('已回填第 ' + (followUpIdx + 1) + ' 轮优化答案', 'success');
}

// v1.48 链 G: 删除要件优化历史记录
function deleteElementOptimization(name, followUpIdx) {
    if (!caseItem) return;
    const followUps = caseElementsFollowUps[name] || [];
    if (followUpIdx >= followUps.length) return;
    followUps.splice(followUpIdx, 1);
    saveElementFollowUps(caseItem.id, caseElementsFollowUps);
    renderElementsList();
    showNotification('已删除第 ' + (followUpIdx + 1) + ' 轮优化记录', 'info');
}

function sourceLabel(source) {
    if (source === 'standard') return '标准';
    if (source === 'mine') return '我的';
    return '个案';
}

function toggleDrawerElementSelection(name, checked) {
    if (checked) caseElementsSelection.add(name);
    else caseElementsSelection.delete(name);
    if (caseItem) saveElementSelection(caseItem.id, caseElementsSelection);
}

// ---- 要件问答弹窗 ----
function openElementQaModal(source, idx) {
    const list = caseElementsCache[source] || [];
    const p = list[idx];
    if (!p) return;
    currentQaElement = { ...p, source, idx };
    document.getElementById('elementQaTitle').textContent = p.name;
    document.getElementById('elementQaSourceRow').innerHTML = `<span class="source-tag ${source}">${sourceLabel(source)}要件</span>`;
    document.getElementById('elementQaQuestion').textContent = p.question || p.desc || '（无问题描述）';
    document.getElementById('elementQaAnswer').value = caseElementsAnswers[p.name] || '';
    document.getElementById('elementQaOverlay').classList.add('show');
    document.getElementById('elementQaModal').classList.add('show');
    setTimeout(() => {
        const ta = document.getElementById('elementQaAnswer');
        if (ta) ta.focus();
    }, 100);
}

function closeElementQaModal() {
    document.getElementById('elementQaOverlay').classList.remove('show');
    document.getElementById('elementQaModal').classList.remove('show');
    currentQaElement = null;
}

function saveElementAnswerFromModal() {
    if (!currentQaElement || !caseItem) {
        closeElementQaModal();
        return;
    }
    const answer = document.getElementById('elementQaAnswer').value || '';
    caseElementsAnswers[currentQaElement.name] = answer;
    saveElementAnswers(caseItem.id, caseElementsAnswers);
    // 已填写答案的要件自动勾选
    if (answer.trim()) {
        caseElementsSelection.add(currentQaElement.name);
        saveElementSelection(caseItem.id, caseElementsSelection);
    }
    showNotification('要件答案已保存', 'success');
    closeElementQaModal();
    renderElementsList();
}

// ---- 新增个案要件 ----
function toggleCaseElementAddForm(show) {
    const form = document.getElementById('caseElementsAddForm');
    if (!form) return;
    if (show) {
        form.classList.add('show');
        document.getElementById('newCaseElementName').value = '';
        document.getElementById('newCaseElementDesc').value = '';
        document.getElementById('newCaseElementQuestion').value = '';
        setTimeout(() => {
            const i = document.getElementById('newCaseElementName');
            if (i) i.focus();
        }, 100);
    } else {
        form.classList.remove('show');
    }
}

function addCaseElementConfirm() {
    if (!caseItem) return;
    const name = (document.getElementById('newCaseElementName').value || '').trim();
    const desc = (document.getElementById('newCaseElementDesc').value || '').trim();
    const question = (document.getElementById('newCaseElementQuestion').value || '').trim();
    if (!name) { showNotification('请填写要件名称', 'warning'); return; }
    if (!question) { showNotification('请填写要件问题', 'warning'); return; }

    const arr = getCaseCustomElements(caseItem.id);
    // 重名检查
    if (arr.some(p => p.name === name)) {
        showNotification('已存在同名个案要件，请使用其他名称', 'warning');
        return;
    }
    arr.push({ name, desc, question, enabled: true, createdAt: Date.now() });
    setCaseCustomElements(caseItem.id, arr);
    toggleCaseElementAddForm(false);
    loadCaseElementsAll();
    renderElementsList();
    refreshCaseElementsEntryCount();
    showNotification('个案要件已添加', 'success');
}

function deleteCaseElement(name) {
    if (!caseItem) return;
    if (!confirm(`确定删除个案要件"${name}"吗？相关答案也会一并清除。`)) return;
    let arr = getCaseCustomElements(caseItem.id);
    arr = arr.filter(p => p.name !== name);
    setCaseCustomElements(caseItem.id, arr);
    // 同步清除答案与勾选
    delete caseElementsAnswers[name];
    saveElementAnswers(caseItem.id, caseElementsAnswers);
    caseElementsSelection.delete(name);
    saveElementSelection(caseItem.id, caseElementsSelection);
    delete caseElementsFollowUps[name];
    saveElementFollowUps(caseItem.id, caseElementsFollowUps);
    loadCaseElementsAll();
    renderElementsList();
    refreshCaseElementsEntryCount();
    showNotification('个案要件已删除', 'success');
}

// v2.27: 一键生成（原名"AI总结"，V1.1.9 改名去技术术语）—— 对全部要件批量生成答案，无需勾选，用户可直接在列表中修改
// 复用 generateMockElementAnswer（与"生成文书弹框中引入要件"保持一致逻辑）
function aiSummarizeElements() {
    if (!caseItem) {
        showNotification('请先选择案件', 'warning');
        return;
    }
    const all = [
        ...(caseElementsCache.standard || []).map(p => ({ ...p, source: 'standard' })),
        ...(caseElementsCache.mine || []).map(p => ({ ...p, source: 'mine' })),
        ...(caseElementsCache.case || []).map(p => ({ ...p, source: 'case' }))
    ];
    if (all.length === 0) {
        // v2.29: 无可用要件时按钮应已被置灰；此处为防御性兜底，避免绕过 UI 调用
        showNotification('暂无要件可生成，请先新增或维护要件', 'warning');
        return;
    }
    let count = 0;
    all.forEach(p => {
        const answer = generateMockElementAnswer(p, caseItem);
        caseElementsAnswers[p.name] = answer;
        caseElementsSelection.add(p.name);  // 自动勾选已生成答案的要件
        count++;
    });
    saveElementAnswers(caseItem.id, caseElementsAnswers);
    saveElementSelection(caseItem.id, caseElementsSelection);
    renderElementsList();
    showNotification(`已为 ${count} 项要件生成答案，可直接在列表中修改`, 'success');
}

// ---- 字符串转义辅助 ----
function escapeHtmlForElements(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
function escapeJsString(str) {
    if (str == null) return '';
    return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

// 收集当前抽屉中已勾选且已填写答案的要件，供 generateByMaterial 作为 elementAnswers 入参
function collectDrawerElementAnswers() {
    if (!caseItem) return [];
    loadCaseElementsAll();
    const result = [];
    const all = [
        ...(caseElementsCache.standard || []).map(p => ({ ...p, source: 'standard' })),
        ...(caseElementsCache.mine || []).map(p => ({ ...p, source: 'mine' })),
        ...(caseElementsCache.case || []).map(p => ({ ...p, source: 'case' }))
    ];
    all.forEach(p => {
        if (caseElementsSelection.has(p.name)) {
            const answer = (caseElementsAnswers[p.name] || '').trim();
            if (answer) {
                result.push({
                    name: p.name,
                    desc: p.desc || '',
                    question: p.question || '',
                    answer: answer,
                    source: p.source
                });
            }
        }
    });
    return result;
}

// ============ AI文书生成可视化页面逻辑 ============

// ===== 全局状态 =====
let caseId = '';
let docType = '';
let template = '';
let requirement = '';
let caseData = null;
let org = 'court';
let steps = [];
let currentStepIndex = 0;
let generatedDoc = null;
let stepGeneratedData = {}; // 缓存各步骤生成的内容数据，供最终文书拼接使用
let isGenerating = false;      // 是否正在自动生成中
let isComplete = false;        // 是否已完成全部步骤并点击"完成生成"
let isEditing = false;         // 当前步骤是否在编辑模式
let stepStates = [];           // 每步状态: 'waiting'/'current'/'done'
let editBackup = null;         // 编辑前的数据备份

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ===== 步骤配置（按业务系统 × 文书类型）=====
const stepConfigs = {
    court: {
        judgment: [
            { id: 'caseInfo', title: '案件信息', icon: 'fa-folder-open' },
            { id: 'plaintiff', title: '原告诉请', icon: 'fa-user-tie' },
            { id: 'defendant', title: '被告抗辩', icon: 'fa-shield-alt' },
            { id: 'dispute', title: '争议焦点', icon: 'fa-bullseye' },
            { id: 'facts', title: '事实认定', icon: 'fa-search' },
            { id: 'verdict', title: '裁判结果', icon: 'fa-gavel' }
        ],
        trial: [
            { id: 'caseInfo', title: '案件信息', icon: 'fa-folder-open' },
            { id: 'trialFocus', title: '庭审重点', icon: 'fa-bullseye' },
            { id: 'dispute', title: '争议焦点', icon: 'fa-crosshairs' },
            { id: 'questions', title: '询问提纲', icon: 'fa-question-circle' },
            { id: 'notes', title: '注意事项', icon: 'fa-exclamation-circle' }
        ],
        execution: [
            { id: 'caseInfo', title: '案件信息', icon: 'fa-folder-open' },
            { id: 'execItems', title: '执行事项', icon: 'fa-list' },
            { id: 'assets', title: '财产查控', icon: 'fa-search-dollar' },
            { id: 'measures', title: '执行措施', icon: 'fa-tools' },
            { id: 'execResult', title: '执行结果', icon: 'fa-check-circle' }
        ]
    },
    procuratorate: {
        indictment: [
            { id: 'caseInfo', title: '案件信息', icon: 'fa-folder-open' },
            { id: 'crimeFacts', title: '犯罪事实', icon: 'fa-search' },
            { id: 'evidence', title: '证据分析', icon: 'fa-file-alt' },
            { id: 'lawApply', title: '法律适用', icon: 'fa-balance-scale' },
            { id: 'conclusion', title: '审查结论', icon: 'fa-gavel' }
        ],
        prosecution: [
            { id: 'caseInfo', title: '案件信息', icon: 'fa-folder-open' },
            { id: 'crimeFacts', title: '犯罪事实', icon: 'fa-search' },
            { id: 'evidence', title: '证据分析', icon: 'fa-file-alt' },
            { id: 'lawApply', title: '法律适用', icon: 'fa-balance-scale' },
            { id: 'conclusion', title: '审查结论', icon: 'fa-gavel' }
        ],
        nonProsecution: [
            { id: 'caseInfo', title: '案件信息', icon: 'fa-folder-open' },
            { id: 'crimeFacts', title: '犯罪事实', icon: 'fa-search' },
            { id: 'evidence', title: '证据分析', icon: 'fa-file-alt' },
            { id: 'lawApply', title: '法律适用', icon: 'fa-balance-scale' },
            { id: 'conclusion', title: '不起诉决定', icon: 'fa-gavel' }
        ]
    },
    justice: {
        review: [
            { id: 'caseInfo', title: '案件信息', icon: 'fa-folder-open' },
            { id: 'applicant', title: '申请人请求', icon: 'fa-user' },
            { id: 'respondent', title: '被申请人答复', icon: 'fa-building' },
            { id: 'dispute', title: '争议焦点', icon: 'fa-bullseye' },
            { id: 'facts', title: '事实认定', icon: 'fa-search' },
            { id: 'decision', title: '复议决定', icon: 'fa-gavel' }
        ]
    }
};

// 每步耗时（毫秒），超出索引时默认 2500
const stepDurations = [1500, 2500, 2500, 2500, 2500, 2000];

// ===== 工具函数 =====
function getUrlParam(name) {
    const params = new URLSearchParams(window.location.search);
    return params.get(name) || '';
}

function getTemplateName() {
    const sys = businessSystems[org];
    if (!sys || !sys.docTemplates) return '法律文书';
    return sys.docTemplates[template] || '法律文书';
}

function getDocTypeName() {
    const sys = businessSystems[org];
    if (!sys || !sys.docTypes || !sys.docTypes[docType]) return '文书';
    return sys.docTypes[docType].name || '文书';
}

function getPartyLabels() {
    const sys = businessSystems[org];
    return (sys && sys.partiesLabels) || ['原告', '被告'];
}

// ===== 页面初始化 =====
function initPage() {
    caseId = getUrlParam('caseId');
    docType = getUrlParam('docType');
    template = getUrlParam('template');
    requirement = getUrlParam('requirement');
    currentBusiness = localStorage.getItem('currentBusiness') || 'court';

    if (!caseId) { showNotification('未指定案件 ID', 'error'); return; }
    const result = findCaseById(caseId);
    if (!result) { showNotification('案件不存在或已被删除', 'error'); return; }
    org = result.org;
    caseData = result.caseItem;
    currentBusiness = org;

    const orgConfigs = stepConfigs[org] || stepConfigs.court;
    steps = (docType && orgConfigs[docType]) ? orgConfigs[docType] : Object.values(orgConfigs)[0];
    stepStates = steps.map(() => 'waiting');
    stepStates[0] = 'current';

    renderTopBar();
    renderProgressBar();
    renderCurrentStep();

    isGenerating = true;
    runGeneration();
}

// ===== 顶部信息栏 =====
function renderTopBar() {
    document.getElementById('genCaseName').textContent =
        caseData.caseName || caseData.caseNumber || '案件';

    const tags = document.getElementById('genConfigTags');
    const tagsHtml = [
        `<span class="gen-config-tag">${getDocTypeName()}</span>`,
        `<span class="gen-config-tag">${getTemplateName()}</span>`
    ];
    if (requirement) {
        const shortReq = requirement.length > 12 ? requirement.slice(0, 12) + '…' : requirement;
        tagsHtml.push(`<span class="gen-config-tag" title="${requirement.replace(/"/g, '&quot;')}">${shortReq}</span>`);
    }
    tags.innerHTML = tagsHtml.join('');
}

// ===== 进度条（已完成且非生成中可点击跳转）=====
function renderProgressBar() {
    const bar = document.getElementById('genProgressBar');
    let html = '';
    steps.forEach((s, i) => {
        const state = stepStates[i];
        const clickable = !isGenerating && state === 'done';
        html += `<div class="gen-progress-step ${clickable ? 'clickable' : ''}" onclick="${clickable ? `switchToStep(${i})` : ''}">`;
        html += `<div class="gen-progress-dot ${state}" id="progDot_${i}">`;
        if (state === 'done') html += '<i class="fas fa-check"></i>';
        else html += (i + 1);
        html += '</div>';
        const labelClass = state === 'done' ? 'done' : (state === 'current' ? 'active' : '');
        html += `<div class="gen-progress-label ${labelClass}" id="progLabel_${i}">${s.title}</div>`;
        html += '</div>';
        if (i < steps.length - 1) {
            const lineDone = stepStates[i] === 'done';
            html += `<div class="gen-progress-line ${lineDone ? 'done' : ''}" id="progLine_${i}"></div>`;
        }
    });
    bar.innerHTML = html;
}

// ===== 当前步骤单步视图 =====
function renderCurrentStep() {
    const container = document.getElementById('genStepDetail');
    const s = steps[currentStepIndex];
    const state = stepStates[currentStepIndex];

    let contentHtml = '';
    let actionsHtml = '';

    if (state === 'current' && isGenerating) {
        // 生成中：显示骨架屏
        contentHtml = renderSkeleton();
    } else if (state === 'done') {
        // 已完成：显示内容
        const data = stepGeneratedData[s.id];
        if (data) contentHtml = renderStepHtml(data);
    }

    // 编辑按钮（已完成且不在生成中、未完成全部时显示）
    if (state === 'done' && !isGenerating && !isComplete) {
        actionsHtml = `<button class="gen-edit-btn" onclick="enterEditMode()"><i class="fas fa-edit"></i> 编辑</button>`;
    }

    const statusText = state === 'current' ? '生成中' : (state === 'done' ? '已完成' : '等待中');

    container.innerHTML = `
        <div class="gen-step-detail-header">
            <div class="gen-step-detail-title">
                <div class="gen-step-detail-icon ${state}"><i class="fas ${s.icon}"></i></div>
                <span>${s.title}</span>
            </div>
            <div class="gen-step-detail-actions">
                <span class="gen-step-status ${state}">${statusText}</span>
                ${actionsHtml}
            </div>
        </div>
        <div class="gen-step-detail-content fade-in" id="genStepContent">
            ${contentHtml}
        </div>
    `;

    updateNavButtons();
}

// ===== 骨架屏 =====
function renderSkeleton() {
    const widths = ['90%', '70%', '85%', '60%'];
    const lines = widths.map(w => `<div class="gen-skeleton-line" style="width:${w}"></div>`).join('');
    return `<div class="gen-skeleton">${lines}</div>`;
}

// ===== 导航按钮显隐 =====
function updateNavButtons() {
    const prevBtn = document.getElementById('genPrevBtn');
    const nextBtn = document.getElementById('genNextBtn');
    const finishBtn = document.getElementById('genFinishBtn');
    const navDiv = document.getElementById('genStepNav');
    const completeDiv = document.getElementById('genCompleteActions');

    if (isComplete) {
        // 完成：隐藏导航，显示完成操作
        navDiv.style.display = 'none';
        completeDiv.style.display = 'flex';
        return;
    }

    navDiv.style.display = 'flex';
    completeDiv.style.display = 'none';

    if (isGenerating) {
        // 生成中：隐藏所有导航
        prevBtn.style.display = 'none';
        nextBtn.style.display = 'none';
        finishBtn.style.display = 'none';
        return;
    }

    // 生成完成后
    prevBtn.style.display = 'inline-flex';
    prevBtn.disabled = currentStepIndex === 0;

    if (currentStepIndex === steps.length - 1) {
        // 最后一步：显示"完成生成"
        nextBtn.style.display = 'none';
        finishBtn.style.display = 'inline-flex';
    } else {
        nextBtn.style.display = 'inline-flex';
        finishBtn.style.display = 'none';
    }
}

// ===== 自动生成主流程 =====
async function runGeneration() {
    for (let i = 0; i < steps.length; i++) {
        currentStepIndex = i;
        stepStates[i] = 'current';
        renderProgressBar();
        renderCurrentStep();

        await sleep(stepDurations[i] || 2500);

        // 生成内容
        const data = buildStepData(steps[i].id, caseData, org, docType, requirement);
        stepGeneratedData[steps[i].id] = data;

        stepStates[i] = 'done';
        renderProgressBar();
        renderCurrentStep();

        await sleep(300);
    }
    // 全部生成完成
    isGenerating = false;
    currentStepIndex = 0;  // 回到第一步让用户查看
    renderProgressBar();
    renderCurrentStep();
    showNotification('全部步骤已生成完成，请检查并编辑', 'success');
}

// ===== 跳转到指定步骤（仅已完成且非生成/编辑中可跳）=====
function switchToStep(index) {
    if (isGenerating || isEditing) return;
    if (stepStates[index] !== 'done') return;
    currentStepIndex = index;
    renderProgressBar();
    renderCurrentStep();
}

function prevStep() {
    if (isGenerating || isEditing) return;
    if (currentStepIndex > 0) {
        currentStepIndex--;
        renderProgressBar();
        renderCurrentStep();
    }
}

function nextStep() {
    if (isGenerating || isEditing) return;
    if (currentStepIndex < steps.length - 1) {
        currentStepIndex++;
        renderProgressBar();
        renderCurrentStep();
    }
}

// ===== 编辑模式 =====
function enterEditMode() {
    if (isGenerating || isComplete) return;
    isEditing = true;
    const s = steps[currentStepIndex];
    const data = stepGeneratedData[s.id];
    if (!data) return;

    // 转为文本
    let text = '';
    if (data.type === 'rows') {
        text = data.rows.map(r => `${r.label}：${r.value}`).join('\n');
    } else {
        text = data.items.join('\n');
    }

    editBackup = JSON.parse(JSON.stringify(data));

    const contentEl = document.getElementById('genStepContent');
    contentEl.innerHTML = `
        <textarea class="gen-edit-textarea" id="genEditTextarea">${text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</textarea>
        <div class="gen-edit-actions">
            <button class="gen-edit-save" onclick="saveEdit()">保存</button>
            <button class="gen-edit-cancel" onclick="cancelEdit()">取消</button>
        </div>
    `;
    document.getElementById('genEditTextarea').focus();

    // 隐藏编辑按钮
    const editBtn = document.querySelector('.gen-edit-btn');
    if (editBtn) editBtn.style.display = 'none';
}

function saveEdit() {
    const textarea = document.getElementById('genEditTextarea');
    if (!textarea) return;
    const text = textarea.value.trim();
    if (!text) {
        showNotification('内容不能为空', 'warning');
        return;
    }

    const s = steps[currentStepIndex];
    const data = stepGeneratedData[s.id];
    const lines = text.split('\n').filter(l => l.trim());

    if (data.type === 'rows') {
        data.rows = lines.map(line => {
            const idx = line.indexOf('：');
            if (idx > 0) return { label: line.substring(0, idx), value: line.substring(idx + 1) };
            return { label: '', value: line };
        });
    } else {
        data.items = lines;
    }

    isEditing = false;
    editBackup = null;
    renderCurrentStep();
    showNotification('内容已保存', 'success');
}

function cancelEdit() {
    if (editBackup) {
        const s = steps[currentStepIndex];
        stepGeneratedData[s.id] = editBackup;
    }
    isEditing = false;
    editBackup = null;
    renderCurrentStep();
}

// ===== 完成生成 =====
function finishGeneration() {
    if (isGenerating) return;
    isComplete = true;
    saveGeneratedDoc();
    renderProgressBar();
    renderCurrentStep();
    updateNavButtons();
    showNotification('文书已生成完成', 'success');
}

// ===== 内容生成（结构化数据）=====
// 返回结构化数据：{ type: 'rows', rows: [{label,value}] } 或 { type: 'items', items: [string] }
function buildStepData(stepId, caseData, org, docType, requirement) {
    const cause = caseData.cause || '';
    const causeType = getCauseType(cause, org);
    const labels = getPartyLabels();

    switch (stepId) {
        case 'caseInfo':
            return {
                type: 'rows',
                rows: [
                    { label: '案件名称', value: caseData.caseName || '-' },
                    { label: '案号', value: caseData.caseNumber || '-' },
                    { label: '案由', value: cause || '-' },
                    { label: labels[0], value: caseData.partyA || '-' },
                    { label: labels[1], value: caseData.partyB || '-' },
                    { label: '承办人', value: caseData.handler || '-' },
                    { label: '立案日期', value: caseData.date || '-' }
                ]
            };
        case 'plaintiff':
            return { type: 'items', items: getPlaintiffItems(causeType, cause, caseData, labels) };
        case 'defendant':
            return { type: 'items', items: getDefendantItems(causeType, cause, caseData, labels) };
        case 'dispute':
            return { type: 'items', items: getDisputeItems(causeType, cause, caseData, org) };
        case 'facts':
            return { type: 'items', items: getFactsItems(causeType, cause, caseData, org) };
        case 'verdict':
            return { type: 'items', items: getVerdictItems(causeType, cause, caseData, labels) };
        case 'trialFocus':
            return { type: 'items', items: getTrialFocusItems(causeType, cause, caseData) };
        case 'questions':
            return { type: 'items', items: getQuestionsItems(causeType, cause, caseData, labels) };
        case 'notes':
            return { type: 'items', items: getNotesItems(causeType, cause, caseData) };
        case 'execItems':
            return { type: 'items', items: getExecItemsItems(caseData, labels) };
        case 'assets':
            return { type: 'items', items: getAssetsItems(caseData, labels) };
        case 'measures':
            return { type: 'items', items: getMeasuresItems(caseData, labels) };
        case 'execResult':
            return { type: 'items', items: getExecResultItems(caseData, labels) };
        case 'crimeFacts':
            return { type: 'items', items: getCrimeFactsItems(cause, caseData) };
        case 'evidence':
            return { type: 'items', items: getEvidenceItems(cause, caseData) };
        case 'lawApply':
            return { type: 'items', items: getLawApplyItems(causeType, cause, org) };
        case 'conclusion':
            return { type: 'items', items: getConclusionItems(cause, caseData, docType, requirement) };
        case 'applicant':
            return { type: 'items', items: getApplicantItems(cause, caseData) };
        case 'respondent':
            return { type: 'items', items: getRespondentItems(cause, caseData) };
        case 'decision':
            return { type: 'items', items: getDecisionItems(cause, caseData, requirement) };
        default:
            return { type: 'items', items: ['内容生成中...'] };
    }
}

function renderStepHtml(data) {
    if (data.type === 'rows') {
        return data.rows.map(r =>
            `<div class="info-row"><span class="info-label">${r.label}</span><span class="info-value">${r.value}</span></div>`
        ).join('');
    }
    // items
    return data.items.map((item, i) =>
        `<div class="content-item"><span class="content-item-num">${i + 1}.</span>${item}</div>`
    ).join('');
}

// ===== 各步骤内容生成器 =====

// --- 原告诉请 ---
function getPlaintiffItems(causeType, cause, c, labels) {
    const A = labels[0], B = labels[1];
    const map = {
        '民间借贷纠纷': [
            `请求判令${B}偿还借款本金人民币50万元；`,
            `请求判令${B}支付自2024年1月1日起至实际清偿之日止的逾期利息（按年利率6%计算）；`,
            `请求判令${B}承担本案全部诉讼费用。`
        ],
        '买卖合同纠纷': [
            `请求判令${B}支付拖欠货款人民币30万元；`,
            `请求判令${B}支付逾期付款违约金人民币5万元；`,
            `请求判令${B}承担本案全部诉讼费用。`
        ],
        '房屋租赁合同纠纷': [
            `请求判令解除双方签订的房屋租赁合同；`,
            `请求判令${B}支付拖欠租金人民币12万元；`,
            `请求判令${B}腾退房屋并恢复原状；`,
            `请求判令${B}承担本案诉讼费用。`
        ],
        '建设工程施工合同纠纷': [
            `请求判令${B}支付工程款人民币200万元；`,
            `请求判令${B}支付逾期付款利息；`,
            `请求确认${A}对涉案工程享有建设工程价款优先受偿权；`,
            `请求判令${B}承担本案诉讼费用。`
        ],
        '股权转让纠纷': [
            `请求判令${B}支付股权转让款人民币100万元；`,
            `请求判令${B}配合办理股权变更登记手续；`,
            `请求判令${B}承担本案诉讼费用。`
        ]
    };
    if (map[cause]) return map[cause];
    if (causeType === 'labor') {
        return [
            `请求判令${B}支付拖欠工资人民币8万元；`,
            `请求判令${B}支付经济补偿金人民币4万元；`,
            `请求判令${B}补缴社会保险费用；`,
            `请求判令${B}承担本案诉讼费用。`
        ];
    }
    if (causeType === 'tort') {
        if (cause.includes('交通事故')) {
            return [
                `请求判令${B}赔偿医疗费人民币15万元；`,
                `请求判令${B}赔偿误工费、护理费共计人民币5万元；`,
                `请求判令${B}赔偿车辆维修费人民币3万元；`,
                `请求判令${B}赔偿精神损害抚慰金人民币2万元；`,
                `请求判令${B}承担本案诉讼费用。`
            ];
        }
        return [
            `请求判令${B}停止侵害、消除影响；`,
            `请求判令${B}赔偿经济损失人民币10万元；`,
            `请求判令${B}赔偿精神损害抚慰金人民币1万元；`,
            `请求判令${B}承担本案诉讼费用。`
        ];
    }
    if (causeType === 'family') {
        if (cause.includes('离婚')) {
            return [
                `请求判令${A}与${B}离婚；`,
                `请求判令婚生子由${A}抚养，${B}每月支付抚养费3000元；`,
                `请求依法分割夫妻共同财产；`,
                `请求判令${B}承担本案诉讼费用。`
            ];
        }
        return [
            `请求依法确认相关权利义务关系；`,
            `请求依法分割共同财产；`,
            `请求判令${B}承担本案诉讼费用。`
        ];
    }
    // 通用合同
    return [
        `请求判令${B}履行合同约定的义务；`,
        `请求判令${B}支付违约金人民币5万元；`,
        `请求判令${B}承担本案全部诉讼费用。`
    ];
}

// --- 被告抗辩 ---
function getDefendantItems(causeType, cause, c, labels) {
    const A = labels[0], B = labels[1];
    const map = {
        '民间借贷纠纷': [
            `${B}认可借款事实，但主张已于2024年3月偿还本金10万元；`,
            `${B}认为${A}主张的利息计算标准过高，请求法院依法调整；`,
            `${B}因经济困难，请求分期偿还剩余借款。`
        ],
        '买卖合同纠纷': [
            `${B}对货款金额无异议，但主张存在质量问题应扣减货款5万元；`,
            `${B}主张${A}未按约交付全部货物，行使先履行抗辩权；`,
            `${B}认为违约金过高，请求法院予以调整。`
        ],
        '房屋租赁合同纠纷': [
            `${B}主张${A}未履行维修义务，导致房屋无法正常使用；`,
            `${B}认为租金标准过高，请求法院酌减；`,
            `${B}同意解除合同，但就腾退期限请求宽延。`
        ],
        '建设工程施工合同纠纷': [
            `${B}主张工程存在质量问题，不同意支付尾款；`,
            `${B}认为${A}主张的工程款含未竣工验收部分；`,
            `${B}对优先受偿权提出异议。`
        ],
        '股权转让纠纷': [
            `${B}主张股权转让协议存在重大误解，请求撤销；`,
            `${B}认为${A}未如实披露公司债务情况；`,
            `${B}请求驳回${A}的诉讼请求。`
        ]
    };
    if (map[cause]) return map[cause];
    if (causeType === 'labor') {
        return [
            `${B}主张不存在拖欠工资事实，已足额支付；`,
            `${B}认为${A}系主动离职，不同意支付经济补偿金；`,
            `${B}主张社会保险问题不属于劳动争议受案范围。`
        ];
    }
    if (causeType === 'tort') {
        if (cause.includes('交通事故')) {
            return [
                `${B}对事故责任认定有异议，主张${A}亦有过错；`,
                `${B}认为部分医疗费用与事故无因果关系；`,
                `${B}主张精神损害抚慰金过高，请求调整。`
            ];
        }
        return [
            `${B}主张其行为不构成侵权；`,
            `${B}认为${A}主张的损失金额缺乏依据；`,
            `${B}主张${A}自身存在过错，应减轻赔偿责任。`
        ];
    }
    if (causeType === 'family') {
        if (cause.includes('离婚')) {
            return [
                `${B}同意离婚，但主张婚生子应由其抚养；`,
                `${B}认为${A}主张的夫妻共同财产范围有误；`,
                `${B}请求依法分割共同债务。`
            ];
        }
        return [
            `${B}对相关事实有异议，请求法院依法认定；`,
            `${B}主张${A}诉求缺乏法律依据。`
        ];
    }
    return [
        `${B}对部分事实不予认可；`,
        `${B}主张${A}诉求超过诉讼时效；`,
        `${B}请求法院驳回${A}的诉讼请求。`
    ];
}

// --- 争议焦点 ---
function getDisputeItems(causeType, cause, c, org) {
    const map = {
        '民间借贷纠纷': [
            `借款本金的实际数额及已还款金额的认定；`,
            `逾期利息的计算标准是否符合法律规定；`,
            `被告是否应当承担全部诉讼费用。`
        ],
        '买卖合同纠纷': [
            `货款金额的确认及质量异议是否成立；`,
            `违约金标准的合理性审查；`,
            `先履行抗辩权是否成立。`
        ],
        '房屋租赁合同纠纷': [
            `租赁合同解除的条件是否成就；`,
            `出租人维修义务的履行情况；`,
            `租金标准的合理性。`
        ]
    };
    if (map[cause]) return map[cause];
    if (causeType === 'labor') {
        return [
            `是否存在拖欠工资的事实；`,
            `经济补偿金的计算依据及标准；`,
            `社会保险争议是否属于本案受理范围。`
        ];
    }
    if (causeType === 'tort') {
        return [
            `侵权责任的构成要件是否成立；`,
            `损失金额的认定及因果关系；`,
            `受害方是否存在过错及责任比例。`
        ];
    }
    if (causeType === 'family') {
        return [
            `是否准予离婚；`,
            `子女抚养权的归属及抚养费标准；`,
            `夫妻共同财产的范围及分割方式。`
        ];
    }
    if (org === 'justice') {
        return [
            `行政行为认定事实是否清楚、证据是否确凿；`,
            `行政行为适用法律是否正确、程序是否合法；`,
            `行政行为是否明显不当，应否予以撤销或变更。`
        ];
    }
    return [
        `合同效力及履行情况的认定；`,
        `违约责任的承担方式及范围；`,
        `诉讼请求的法律依据是否充分。`
    ];
}

// --- 事实认定 ---
function getFactsItems(causeType, cause, c, org) {
    const map = {
        '民间借贷纠纷': [
            `2023年6月15日，${c.partyA}通过银行转账向${c.partyB}出借人民币50万元，有银行流水及借条为证；`,
            `${c.partyB}于2024年3月10日向${c.partyA}还款10万元，双方均予以认可；`,
            `双方约定借款期限为一年，年利率为6%，有借条明确记载。`
        ],
        '买卖合同纠纷': [
            `双方于2024年5月签订买卖合同，约定${c.partyB}向${c.partyA}采购货物，总价30万元；`,
            `${c.partyA}已按约交付货物，有送货单及签收单为证；`,
            `${c.partyB}至今尚欠货款30万元未付，对欠款事实无异议。`
        ]
    };
    if (map[cause]) return map[cause];
    if (causeType === 'labor') {
        return [
            `${c.partyA}于2023年3月入职${c.partyB}，月工资8000元，有劳动合同为证；`,
            `${c.partyB}自2024年1月起未足额支付工资，累计拖欠8万元；`,
            `${c.partyA}于2024年6月离职，离职原因系${c.partyB}拖欠工资。`
        ];
    }
    if (causeType === 'tort') {
        if (cause.includes('交通事故')) {
            return [
                `2024年8月10日，${c.partyB}驾驶车辆与${c.partyA}发生碰撞，交警认定${c.partyB}负全责；`,
                `${c.partyA}因事故住院治疗20天，产生医疗费15万元；`,
                `经鉴定${c.partyA}构成十级伤残，有司法鉴定意见书为证。`
            ];
        }
        return [
            `${c.partyB}实施了侵权行为，有相关证据佐证；`,
            `${c.partyA}因此遭受损失，损失金额有票据等证据证实；`,
            `侵权行为与损害结果之间存在因果关系。`
        ];
    }
    if (causeType === 'family') {
        return [
            `${c.partyA}与${c.partyB}于2015年登记结婚，婚后育有一子；`,
            `双方因感情不和长期分居已满两年；`,
            `夫妻共同财产包括房产一套、存款若干。`
        ];
    }
    if (org === 'justice') {
        return [
            `${c.partyB}于2024年11月对${c.partyA}作出行政行为，有决定书为证；`,
            `${c.partyA}于法定期限内申请行政复议，符合受理条件；`,
            `经审查，行政行为认定事实的相关证据充分。`
        ];
    }
    return [
        `双方存在合同关系，有书面合同为证；`,
        `${c.partyA}已按约履行义务，${c.partyB}未完全履行；`,
        `违约事实有往来函件及交易记录佐证。`
    ];
}

// --- 裁判结果 ---
function getVerdictItems(causeType, cause, c, labels) {
    const A = labels[0], B = labels[1];
    const map = {
        '民间借贷纠纷': [
            `一、${B}于本判决生效之日起十日内偿还${A}借款本金人民币40万元；`,
            `二、${B}于本判决生效之日起十日内支付逾期利息（以40万元为基数，按年利率6%计算，自2024年1月1日起至实际清偿之日止）；`,
            `三、驳回${A}的其他诉讼请求。`
        ],
        '买卖合同纠纷': [
            `一、${B}于本判决生效之日起十日内支付${A}货款人民币30万元；`,
            `二、${B}于本判决生效之日起十日内支付违约金人民币3万元；`,
            `三、驳回${A}的其他诉讼请求。`
        ]
    };
    if (map[cause]) return map[cause];
    if (causeType === 'labor') {
        return [
            `一、${B}于本判决生效之日起十日内支付${A}工资人民币8万元；`,
            `二、${B}于本判决生效之日起十日内支付${A}经济补偿金人民币4万元；`,
            `三、驳回${A}的其他诉讼请求。`
        ];
    }
    if (causeType === 'tort') {
        return [
            `一、${B}于本判决生效之日起十日内赔偿${A}各项损失共计人民币20万元；`,
            `二、驳回${A}的其他诉讼请求。`
        ];
    }
    if (causeType === 'family') {
        return [
            `一、准予${A}与${B}离婚；`,
            `二、婚生子由${A}抚养，${B}每月支付抚养费3000元至其独立生活止；`,
            `三、夫妻共同财产依法分割（详见附表）。`
        ];
    }
    return [
        `一、${B}于本判决生效之日起十日内履行合同义务；`,
        `二、${B}于本判决生效之日起十日内支付违约金人民币5万元；`,
        `三、驳回${A}的其他诉讼请求。`
    ];
}

// --- 庭审重点 ---
function getTrialFocusItems(causeType, cause, c) {
    return [
        `查明${c.partyA}与${c.partyB}之间法律关系的性质及内容；`,
        `审查各方提交证据的真实性、合法性与关联性；`,
        `围绕争议焦点组织当事人举证质证，重点调查关键事实；`,
        `听取双方辩论意见，归纳争议并引导当事人充分陈述。`
    ];
}

// --- 询问提纲 ---
function getQuestionsItems(causeType, cause, c, labels) {
    const A = labels[0], B = labels[1];
    return [
        `询问${A}：诉请所依据的具体事实及时间节点？`,
        `询问${A}：提交的主要证据有哪些，证明目的分别是什么？`,
        `询问${B}：对${A}主张的事实有无异议？异议理由是什么？`,
        `询问${B}：是否提起反诉或主张抵销？`,
        `询问双方：是否同意调解？调解方案是什么？`
    ];
}

// --- 注意事项 ---
function getNotesItems(causeType, cause, c) {
    return [
        `注意核实当事人身份及诉讼主体资格；`,
        `重点审查证据原件，确认证据来源合法性；`,
        `涉及专业问题的，可依法启动鉴定或勘验程序；`,
        `注意诉讼时效、除斥期间等期间利益的审查；`,
        `庭审全程录音录像，确保程序合法合规。`
    ];
}

// --- 执行事项 ---
function getExecItemsItems(c, labels) {
    return [
        `执行依据：本案生效法律文书所确定的给付义务；`,
        `被执行人：${c.partyB}，应履行金额以判决书为准；`,
        `执行标的：金钱给付及迟延履行期间的债务利息；`,
        `申请执行人：${c.partyA}。`
    ];
}

// --- 财产查控 ---
function getAssetsItems(c, labels) {
    return [
        `通过网络查控系统查询${c.partyB}名下银行存款，已冻结可用余额人民币2万元；`,
        `查询${c.partyB}名下房产、车辆登记信息，查封房产一套；`,
        `查询${c.partyB}名下证券、股权及互联网银行账户，未发现大额财产；`,
        `已向${c.partyB}发出财产报告令，责令限期报告财产状况。`
    ];
}

// --- 执行措施 ---
function getMeasuresItems(c, labels) {
    return [
        `依法冻结${c.partyB}银行账户存款；`,
        `依法查封${c.partyB}名下房产一套，限制办理过户、抵押手续；`,
        `将${c.partyB}纳入失信被执行人名单，并发出限制消费令；`,
        `拟对查封房产启动评估、拍卖程序。`
    ];
}

// --- 执行结果 ---
function getExecResultItems(c, labels) {
    return [
        `已实际执行到位金额人民币15万元；`,
        `查封房产已进入评估程序，预计评估价值200万元；`,
        `${c.partyB}承诺分期履行剩余款项，已达成执行和解协议；`,
        `本案将继续执行，直至全部执行完毕。`
    ];
}

// --- 犯罪事实（检察院）---
function getCrimeFactsItems(cause, c) {
    const map = {
        '故意伤害罪': [
            `2024年X月X日，犯罪嫌疑人${c.partyA}在某地因琐事与被害人${c.partyB}发生纠纷；`,
            `犯罪嫌疑人${c.partyA}持械殴打被害人，致被害人轻伤二级；`,
            `案发后犯罪嫌疑人${c.partyA}主动投案，如实供述犯罪事实。`
        ],
        '盗窃罪': [
            `2024年X月X日，犯罪嫌疑人${c.partyA}潜入${c.partyB}实施盗窃；`,
            `盗窃财物价值人民币5万余元，有监控录像及销赃记录为证；`,
            `案发后犯罪嫌疑人${c.partyA}被公安机关抓获归案。`
        ],
        '诈骗罪': [
            `2024年X月至X月，犯罪嫌疑人${c.partyA}以虚构事实方式骗取被害人财物；`,
            `诈骗金额共计人民币20余万元，有转账记录及聊天记录为证；`,
            `案发后犯罪嫌疑人${c.partyA}被公安机关抓获，部分赃款已追回。`
        ],
        '交通肇事罪': [
            `2024年X月X日，犯罪嫌疑人${c.partyA}违反交通运输管理法规发生重大事故；`,
            `事故致一人死亡，负事故全部责任，有事故认定书为证；`,
            `案发后犯罪嫌疑人${c.partyA}报警并在现场等候处理。`
        ],
        '受贿罪': [
            `2018年至2023年期间，犯罪嫌疑人${c.partyA}利用职务便利多次收受他人财物；`,
            `受贿金额共计人民币100余万元，有银行流水及行贿人证言为证；`,
            `监察机关立案调查后，犯罪嫌疑人如实供述犯罪事实。`
        ],
        '寻衅滋事罪': [
            `2024年X月X日，犯罪嫌疑人${c.partyA}在公共场所随意殴打他人，情节恶劣；`,
            `造成被害人轻微伤，严重影响社会秩序；`,
            `案发后犯罪嫌疑人${c.partyA}被公安机关抓获。`
        ]
    };
    if (map[cause]) return map[cause];
    return [
        `犯罪嫌疑人${c.partyA}实施了涉嫌${cause}的行为；`,
        `该行为造成相应危害后果，事实清楚；`,
        `案发后经公安机关侦查终结，移送审查起诉。`
    ];
}

// --- 证据分析（检察院）---
function getEvidenceItems(cause, c) {
    return [
        `物证、书证：涉案相关物品及书面文件，来源合法、内容真实；`,
        `证人证言：多名目击证人证言相互印证，证明力较强；`,
        `被害人陈述：与犯罪嫌疑人供述在关键事实上基本一致；`,
        `鉴定意见：由有资质机构作出，鉴定程序合法，结论明确；`,
        `视听资料：现场监控录像完整记录案发经过，与言词证据吻合。`
    ];
}

// --- 法律适用 ---
function getLawApplyItems(causeType, cause, org) {
    if (org === 'procuratorate') {
        return [
            `《中华人民共和国刑法》相关条款——规定${cause}的构成要件及量刑幅度；`,
            `《中华人民共和国刑事诉讼法》——关于审查起诉程序的规定；`,
            `《最高人民法院、最高人民检察院相关司法解释》——关于数额标准及情节认定；`,
            `犯罪嫌疑人行为符合${cause}的构成要件，应当依法追究刑事责任。`
        ];
    }
    if (org === 'justice') {
        return [
            `《中华人民共和国行政复议法》——关于复议审查范围及决定方式的规定；`,
            `《中华人民共和国行政处罚法》——关于处罚程序及幅度合法性的规定；`,
            `相关行政管理法律法规——作为审查原行政行为法律适用是否正确的依据；`,
            `经审查，原行政行为适用法律正确（或存在适用法律错误情形）。`
        ];
    }
    // court
    const lawMap = {
        contract: [
            `《中华人民共和国民法典》合同编——关于合同效力、履行及违约责任的规定；`,
            `《最高人民法院关于审理民间借贷案件适用法律若干问题的规定》——利率标准；`,
            `《中华人民共和国民事诉讼法》——关于举证责任分配的规定。`
        ],
        labor: [
            `《中华人民共和国劳动法》《劳动合同法》——关于劳动报酬及经济补偿的规定；`,
            `《中华人民共和国劳动争议调解仲裁法》——关于仲裁前置程序的规定；`,
            `《最高人民法院关于审理劳动争议案件适用法律问题的解释》——相关裁判规则。`
        ],
        tort: [
            `《中华人民共和国民法典》侵权责任编——关于侵权责任构成及赔偿范围的规定；`,
            `《最高人民法院关于审理人身损害赔偿案件适用法律若干问题的解释》——赔偿标准；`,
            `《中华人民共和国道路交通安全法》——关于交通事故责任认定的规定。`
        ],
        family: [
            `《中华人民共和国民法典》婚姻家庭编——关于离婚、抚养及财产分割的规定；`,
            `《最高人民法院关于适用〈民法典〉婚姻家庭编的解释（一）》——相关裁判规则；`,
            `《中华人民共和国民事诉讼法》——关于家庭案件审理程序的规定。`
        ]
    };
    return lawMap[causeType] || lawMap.contract;
}

// --- 审查结论（检察院）---
function getConclusionItems(cause, c, docType, requirement) {
    if (docType === 'nonProsecution') {
        return [
            `经审查查明，犯罪嫌疑人${c.partyA}实施了${cause}行为，事实清楚，证据确实充分；`,
            `但犯罪情节轻微，社会危害性较小，符合酌定不起诉条件；`,
            `依据《中华人民共和国刑事诉讼法》相关规定，决定对犯罪嫌疑人${c.partyA}不起诉。`
        ];
    }
    return [
        `经审查查明，犯罪嫌疑人${c.partyA}涉嫌${cause}，犯罪事实清楚，证据确实充分；`,
        `其行为已触犯《中华人民共和国刑法》相关规定，应当依法追究刑事责任；`,
        `依据《中华人民共和国刑事诉讼法》相关规定，决定向人民法院提起公诉。`
    ];
}

// --- 申请人请求（司法局）---
function getApplicantItems(cause, c) {
    const map = {
        '治安拘留处罚': [
            `请求撤销${c.partyB}作出的治安拘留处罚决定；`,
            `请求确认${c.partyB}的处罚行为违法；`,
            `请求责令${c.partyB}重新作出处理。`
        ],
        '工商行政处罚': [
            `请求撤销${c.partyB}作出的工商行政处罚决定；`,
            `请求确认处罚决定认定事实不清、程序违法；`,
            `请求责令${c.partyB}重新作出处理。`
        ],
        '交通罚款处罚': [
            `请求撤销${c.partyB}作出的交通罚款处罚决定；`,
            `请求确认处罚行为缺乏事实依据；`,
            `请求退还已缴纳罚款。`
        ],
        '不予行政许可': [
            `请求撤销${c.partyB}作出的不予行政许可决定；`,
            `请求责令${c.partyB}依法作出准予行政许可的决定；`,
            `请求确认不予许可行为违法。`
        ],
        '行政查封扣押': [
            `请求撤销${c.partyB}作出的行政查封扣押决定；`,
            `请求返还被查封扣押财物；`,
            `请求确认查封扣押行为违法。`
        ]
    };
    if (map[cause]) return map[cause];
    return [
        `请求撤销${c.partyB}作出的行政行为；`,
        `请求确认该行政行为违法；`,
        `请求责令${c.partyB}重新作出处理。`
    ];
}

// --- 被申请人答复（司法局）---
function getRespondentItems(cause, c) {
    return [
        `${c.partyB}认定${c.partyA}违法行为事实清楚、证据确凿；`,
        `${c.partyB}适用法律正确，处罚（处理）幅度适当；`,
        `${c.partyB}作出的行政行为程序合法；`,
        `请求维持原行政行为。`
    ];
}

// --- 复议决定（司法局）---
function getDecisionItems(cause, c, requirement) {
    // 根据指令或默认作出维持决定
    if (requirement && (requirement.includes('撤销') || requirement.includes('违法'))) {
        return [
            `经审查，${c.partyB}作出的原行政行为主要事实不清、证据不足；`,
            `依据《中华人民共和国行政复议法》相关规定，决定撤销原行政行为；`,
            `责令${c.partyB}在法定期限内重新作出行政行为。`
        ];
    }
    return [
        `经审查，${c.partyB}作出的原行政行为认定事实清楚，证据确凿；`,
        `适用法律正确，程序合法，内容适当；`,
        `依据《中华人民共和国行政复议法》相关规定，决定维持原行政行为。`
    ];
}

// ===== 最终文书生成（用于预览与保存）=====
function generateFinalDocument() {
    const sys = businessSystems[org];
    const templateName = getTemplateName();
    const labels = getPartyLabels();
    const c = caseData;
    const h2 = `<h2 style="text-align:center;font-size:20pt;font-weight:bold;margin-bottom:24px;">${templateName}</h2>`;
    const caseNo = `<p style="text-align:center;margin-bottom:18px;">${c.caseNumber || ''}</p>`;
    const partyInfo = `
        <p style="text-indent:2em;margin-bottom:10px;"><strong>${labels[0]}：</strong>${c.partyA || ''}。</p>
        <p style="text-indent:2em;margin-bottom:10px;"><strong>${labels[1]}：</strong>${c.partyB || ''}。</p>`;
    const handlerName = (c.handler || '').replace(/法官|检察官|复议员|调解员/g, '');
    const today = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
    const footer = `
        <p style="text-align:right;margin-top:30px;margin-bottom:8px;">${getSignerLabel(org)}　${handlerName}</p>
        <p style="text-align:right;margin-bottom:20px;">${today}</p>`;

    // 从缓存中提取各步骤数据
    const itemsOf = (stepId) => {
        const d = stepGeneratedData[stepId];
        return (d && d.type === 'items') ? d.items : [];
    };
    const rowsOf = (stepId) => {
        const d = stepGeneratedData[stepId];
        return (d && d.type === 'rows') ? d.rows : [];
    };

    const sectionHtml = (title, items) => {
        if (!items || !items.length) return '';
        const paras = items.map(t => `<p style="text-indent:2em;margin-bottom:10px;">${t}</p>`).join('');
        return `<h3 style="font-size:13pt;margin:20px 0 12px;font-weight:bold;">${title}</h3>${paras}`;
    };

    let body = '';
    if (org === 'court') {
        const infoRows = rowsOf('caseInfo');
        const infoParas = infoRows.map(r => `<p style="text-indent:2em;margin-bottom:6px;">${r.label}：${r.value}</p>`).join('');
        body = `
            ${h2}${caseNo}${partyInfo}
            <h3 style="font-size:13pt;margin:20px 0 12px;font-weight:bold;">一、案件由来和审理经过</h3>
            <p style="text-indent:2em;margin-bottom:10px;">${labels[0]}${labels[1]}${c.cause || ''}一案，本院立案后依法公开开庭进行了审理。本案现已审理终结。</p>
            ${infoParas ? `<h3 style="font-size:13pt;margin:20px 0 12px;font-weight:bold;">二、案件基本信息</h3>${infoParas}` : ''}
            ${sectionHtml('三、原告的诉讼请求', itemsOf('plaintiff'))}
            ${sectionHtml('四、被告的答辩意见', itemsOf('defendant'))}
            ${sectionHtml('五、争议焦点', itemsOf('dispute'))}
            ${sectionHtml('六、本院查明的事实', itemsOf('facts'))}
            <h3 style="font-size:13pt;margin:20px 0 12px;font-weight:bold;">七、本院认为</h3>
            <p style="text-indent:2em;margin-bottom:10px;">根据相关法律规定，结合本院查明的事实，对当事人的诉辩意见综合评判如下：${labels[0]}的诉讼请求于法有据部分，本院予以支持；缺乏事实和法律依据部分，本院予以驳回。</p>
            ${sectionHtml('八、判决结果', itemsOf('verdict'))}
            <p style="text-indent:2em;margin-bottom:20px;">如不服本判决，可在判决书送达之日起十五日内提起上诉。</p>
            ${footer}`;
    } else if (org === 'procuratorate') {
        const isNonProsecution = docType === 'nonProsecution';
        body = `
            ${h2}${caseNo}${partyInfo}
            <h3 style="font-size:13pt;margin:20px 0 12px;font-weight:bold;">一、案件来源</h3>
            <p style="text-indent:2em;margin-bottom:10px;">本案由公安机关侦查终结，以犯罪嫌疑人${c.partyA}涉嫌${c.cause || ''}，于近日移送本院审查起诉。</p>
            ${sectionHtml('二、审查认定的犯罪事实', itemsOf('crimeFacts'))}
            ${sectionHtml('三、证据分析', itemsOf('evidence'))}
            ${sectionHtml('四、法律适用', itemsOf('lawApply'))}
            ${sectionHtml(isNonProsecution ? '五、不起诉决定' : '五、审查结论及处理决定', itemsOf('conclusion'))}
            <p style="text-indent:2em;margin-bottom:20px;">${isNonProsecution ? '如不服本决定，可以自收到本决定书副本之日起七日内向上一级人民检察院申诉。' : '本案将依法向有管辖权的人民法院提起公诉。'}</p>
            ${footer}`;
    } else {
        // justice 行政复议
        body = `
            ${h2}${caseNo}${partyInfo}
            <h3 style="font-size:13pt;margin:20px 0 12px;font-weight:bold;">一、案件由来</h3>
            <p style="text-indent:2em;margin-bottom:10px;">申请人${c.partyA}不服被申请人${c.partyB}作出的${c.cause || ''}行政行为，于法定期限内向本机关申请行政复议。本机关依法予以受理，现已审理终结。</p>
            ${sectionHtml('二、申请人请求', itemsOf('applicant'))}
            ${sectionHtml('三、被申请人答复', itemsOf('respondent'))}
            ${sectionHtml('四、争议焦点', itemsOf('dispute'))}
            ${sectionHtml('五、经审理查明的事实', itemsOf('facts'))}
            ${sectionHtml('六、复议决定', itemsOf('decision'))}
            <p style="text-indent:2em;margin-bottom:20px;">如不服本复议决定，可以自收到本决定书之日起十五日内向人民法院提起行政诉讼。</p>
            ${footer}`;
    }

    return `<div style="font-family:'SimSun',serif;line-height:2;text-align:justify;">${body}</div>`;
}

function getSignerLabel(org) {
    if (org === 'court') return '审\u3000判\u3000长';
    if (org === 'procuratorate') return '检\u3000察\u3000官';
    if (org === 'justice') return '复\u3000议\u3000员';
    return '承办人';
}

// ===== 文书保存（从 stepGeneratedData 经 generateFinalDocument 生成最终文书）=====
function saveGeneratedDoc() {
    if (!caseData) return;
    const cases = getCurrentCases();
    const caseItem = cases.find(c => c.id === caseId);
    if (!caseItem) return;
    if (!caseItem.documents) caseItem.documents = [];

    const doc = {
        id: `doc_${Date.now()}`,
        title: getCurrentBusiness().docTitlePrefix + ' ' + getTemplateName(),
        docType: docType,
        template: template,
        wordCount: Math.round(2000 + Math.random() * 1500),
        createdAt: new Date().toISOString(),
        versions: [{
            type: 'original',
            content: generateFinalDocument(),
            createdAt: new Date().toISOString()
        }]
    };
    caseItem.documents.push(doc);
    caseItem.updatedAt = new Date().toISOString().split('T')[0];
    saveBusinessSystems();
    generatedDoc = doc;

    // 记录历史任务（复用 cases.js 模式）
    if (typeof addHistoryTask === 'function') {
        addHistoryTask({
            type: 'generate',
            caseId: caseItem.id,
            caseName: caseItem.caseName || caseItem.caseNumber,
            docId: doc.id,
            docTitle: doc.title
        });
    }
}

// ===== 预览 =====
function previewGeneratedDoc() {
    if (!generatedDoc) {
        showNotification('文书尚未生成完成', 'warning');
        return;
    }
    openDocumentPreviewWindow(generatedDoc, caseId);
}

function getDocumentContent(doc) {
    if (!doc) return '';
    if (doc.versions && doc.versions.length) {
        return doc.versions[doc.versions.length - 1].content || '';
    }
    return doc.content || '';
}

function openDocumentPreviewWindow(doc, caseId) {
    const content = getDocumentContent(doc);
    const previewWin = window.open('', '_blank', 'width=900,height=800,menubar=no,toolbar=no');
    if (!previewWin) {
        showNotification('浏览器弹窗被拦截，请允许弹窗后重试', 'error');
        return;
    }
    const caseInfo = caseId ? findCaseById(caseId) : null;
    const caseItem = caseInfo ? caseInfo.caseItem : null;
    const caseNo = caseItem ? caseItem.caseNumber : '';
    const causeName = caseItem ? caseItem.cause : '';
    previewWin.document.write('<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n    <meta charset="UTF-8">\n    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n    <title>' + doc.title + ' - 文书预览</title>\n    <style>\n        body { font-family: "Noto Serif SC", "SimSun", serif; margin: 0; padding: 40px; background: #f5f5f5; }\n        .preview-container { max-width: 800px; margin: 0 auto; background: white; padding: 50px 60px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }\n        .preview-header { text-align: center; margin-bottom: 40px; padding-bottom: 20px; border-bottom: 2px solid #333; }\n        .preview-title { font-size: 22px; font-weight: 700; margin: 0 0 10px; color: #1a1a1a; }\n        .preview-meta { font-size: 14px; color: #666; }\n        .preview-content { font-size: 16px; line-height: 1.8; color: #333; }\n        .preview-content p { margin: 1em 0; text-indent: 2em; }\n        .preview-content h2 { font-size: 18px; font-weight: 600; margin: 2em 0 1em; color: #1a1a1a; }\n        .preview-content h3 { font-size: 16px; font-weight: 600; margin: 1.5em 0 0.8em; color: #1a1a1a; }\n        .preview-content strong { font-weight: 600; }\n        .preview-footer { margin-top: 60px; text-align: right; font-size: 14px; color: #666; }\n        @media print {\n            body { background: white; padding: 0; }\n            .preview-container { box-shadow: none; padding: 20px; }\n        }\n    </style>\n</head>\n<body>\n    <div class="preview-container">\n        <div class="preview-header">\n            <div class="preview-title">' + doc.title + '</div>\n            <div class="preview-meta">' + caseNo + ' · ' + causeName + '</div>\n        </div>\n        <div class="preview-content">' + content + '</div>\n        <div class="preview-footer">文书生成时间：' + new Date().toLocaleString() + '</div>\n    </div>\n</body>\n</html>');
    previewWin.document.close();
}

// ===== 下载 =====
function downloadGeneratedDoc() {
    if (!generatedDoc) {
        showNotification('文书尚未生成完成', 'warning');
        return;
    }
    showNotification('下载功能：实际系统会触发 Word/PDF 下载（原型演示）', 'success');
}

// ===== 文书精修 =====
function refineGeneratedDoc() {
    window.location.href = 'cases.html';
}

// ===== 返回 =====
function goBack() {
    window.location.href = 'cases.html';
}

// ===== 历史文书面板 =====
function toggleHistory() {
    const overlay = document.getElementById('genHistoryOverlay');
    const panel = document.getElementById('genHistoryPanel');
    const isShow = panel.classList.contains('show');
    if (isShow) {
        overlay.classList.remove('show');
        panel.classList.remove('show');
    } else {
        renderHistoryList();
        overlay.classList.add('show');
        panel.classList.add('show');
    }
}

function renderHistoryList() {
    const list = document.getElementById('genHistoryList');
    if (!caseData) {
        list.innerHTML = '<div class="gen-history-empty"><i class="fas fa-folder-open"></i><div>暂无历史文书</div></div>';
        return;
    }
    const docs = caseData.documents || [];
    if (!docs.length) {
        list.innerHTML = '<div class="gen-history-empty"><i class="fas fa-folder-open"></i><div>暂无历史文书</div></div>';
        return;
    }
    list.innerHTML = docs.map(d => {
        const created = (d.createdAt || '').split('T')[0];
        const words = d.wordCount ? `${d.wordCount}字` : '';
        return `
            <div class="gen-history-item">
                <div class="gen-history-item-title">${d.title || '未命名文书'}</div>
                <div class="gen-history-item-meta">
                    <span>${created}</span>
                    ${words ? `<span>·</span><span>${words}</span>` : ''}
                </div>
                <div class="gen-history-item-actions">
                    <button class="gen-history-item-btn" onclick="event.stopPropagation();previewHistoryDoc('${d.id}')"><i class="fas fa-eye"></i> 预览</button>
                </div>
            </div>
        `;
    }).join('');
}

function previewHistoryDoc(docId) {
    if (!caseData || !caseData.documents) return;
    const d = caseData.documents.find(x => x.id === docId);
    if (!d) return;
    openDocumentPreviewWindow(d, caseId);
}

// ===== 启动 =====
initPage();

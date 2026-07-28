// ============ Cases Page JavaScript ============
// v1.23 色系统一：批量栏/批量生成全屏面板/队列当前项改为蓝色系，仅保留行内「生成文书」按钮橙色单点强调（cases.html 内联样式与 CSS 改动，本文件无逻辑变更）
// v1.22 列配置面板改为锚定按钮下方的下拉面板（去 fixed）；案件名称追加常驻外链图标 + hover 下划线，增强可点击性
// v1.21 新增「我的模板」「我的提示词」入口（openMyTemplates/openMyPrompts），从 case-files.html 迁移至案件列表页头部
// v1.20 提示词标签优先读管理后台 adminPromptTemplates；文书模板渲染兼容对象结构；修复 applyReqTemplate 同步状态 bug
// v1.19 批量生成超限案件改为自动跳过并记录失败原因，不再弹窗选择；完成页失败项增加「去处理」跳转入口
// v1.18 补充上传支持一次选择多个文件；列表页生成文书弹框按模型上下文分支；批量生成自动判断
// 数据与配置统一来自 ../js/case-data.js

// ===== 状态 =====
let selectedCaseIds = new Set();
let quickState = { caseId: '', model: '', docType: '', template: '', requirement: '', document: null, materialsCount: 3 };
let batchState = { docType: '', template: '', results: [], totalElapsed: 0, timerInterval: null, completedCount: 0, failedCount: 0, ocrStrategy: 'skip' };
let refineState = { caseId: '', docId: '', messages: [], originalContent: '', revisedContent: '', activeTab: 'original' };
let documentsCaseId = '';

// 文书类型与模板辅助函数（getCurrentDocTypes / getDocTypeTemplates 已迁移至 case-data.js）
function getFirstDocType() {
    const types = getCurrentDocTypes();
    return Object.keys(types)[0] || '';
}

function getFirstTemplate(docTypeKey) {
    const templates = getDocTypeTemplates(docTypeKey);
    return Object.keys(templates)[0] || '';
}

// 渲染提示词内置模板标签（快速生成 / 批量生成共用）
function renderReqTemplates(containerId, docTypeKey, textareaId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const org = localStorage.getItem('currentBusiness') || 'court';
    // v1.20: 合并 admin + my 数据（getReqTemplates 内部处理）；source='mine' 加 .mine 样式
    const templates = getReqTemplates(org, docTypeKey);
    if (templates.length === 0) {
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
        return `<button type="button" class="${cls}" onclick="applyReqTemplate('${textareaId}', this)" data-text="${(t.text || '').replace(/"/g, '&quot;')}">${t.name}</button>`;
    };
    let html = '';
    if (std.length) html += std.map(renderTag).join('');
    if (mine.length) {
        if (std.length) html += '<span class="req-template-divider"></span>';
        html += mine.map(renderTag).join('');
    }
    container.innerHTML = html;
}

function applyReqTemplate(textareaId, btn) {
    const textarea = document.getElementById(textareaId);
    if (!textarea) return;
    const text = btn.getAttribute('data-text').replace(/\\n/g, '\n');
    textarea.value = text;
    // 同步状态（v1.18: 修复快速生成 textarea ID 误判为 'quickRequirement' 的 bug，实际 ID 为 'genRequirement'）
    if (textareaId === 'genRequirement') {
        quickState.requirement = text;
    } else if (textareaId === 'batchRequirement') {
        batchState.requirement = text;
    }
    // 高亮选中标签
    const container = btn.parentElement;
    container.querySelectorAll('.req-template-tag').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}

// 列配置
let visibleColumns = new Set();
function loadColumnConfig() {
    const saved = localStorage.getItem('caseListColumns');
    if (saved) {
        visibleColumns = new Set(JSON.parse(saved));
    }
}
function saveColumnConfig() {
    localStorage.setItem('caseListColumns', JSON.stringify([...visibleColumns]));
}

// ===== 业务系统切换 =====
function switchBusinessSystem(type) {
    if (type === currentBusiness) return;
    currentBusiness = type;
    localStorage.setItem('currentBusiness', type);
    selectedCaseIds.clear();
    
    document.querySelectorAll('.business-switch-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.type === type);
    });
    
    const current = getCurrentBusiness();
    document.getElementById('pageTitle').textContent = `${current.name}${current.label}`;
    
    // 更新案由类型、案字、承办人筛选选项
    updateCauseFilter();
    updateCaseWordFilter();
    updateHandlerFilter();

    renderCaseHeader();
    renderCaseList();
    
    if (document.getElementById('genModal').classList.contains('show')) {
        closeGenModal();
    }
    if (document.getElementById('batchFullscreen').classList.contains('show')) {
        closeBatchFullscreen();
    }
}

// 按业务系统更新案由类型筛选下拉选项
const causeFilterOptionsByOrg = {
    court: [
        { value: 'contract', label: '合同纠纷' },
        { value: 'tort', label: '侵权责任' },
        { value: 'family', label: '婚姻家庭' },
        { value: 'labor', label: '劳动争议' },
        { value: 'criminal', label: '刑事犯罪' },
        { value: 'civil', label: '民事纠纷' }
    ],
    procuratorate: [
        { value: 'criminal', label: '刑事犯罪' },
        { value: 'dereliction', label: '渎职犯罪' },
        { value: 'arrest', label: '审查逮捕' },
        { value: 'nonProsecution', label: '不起诉' },
        { value: 'appeal', label: '刑事抗诉' },
        { value: 'compensation', label: '刑事赔偿' }
    ],
    justice: [
        { value: 'adminPenalty', label: '行政处罚复议' },
        { value: 'adminPermit', label: '行政许可复议' },
        { value: 'adminCoercion', label: '行政强制复议' },
        { value: 'infoDisclosure', label: '信息公开复议' }
    ]
};

function updateCauseFilter() {
    const select = document.getElementById('causeFilter');
    if (!select) return;
    const options = causeFilterOptionsByOrg[currentBusiness] || causeFilterOptionsByOrg.court;
    select.value = '';
    select.innerHTML = '<option value="">全部</option>' + options.map(o =>
        `<option value="${o.value}">${o.label}</option>`
    ).join('');
}

function updateCaseWordFilter() {
    const select = document.getElementById('caseWordFilter');
    if (!select) return;
    const words = caseWordListByOrg[currentBusiness] || [];
    select.value = '';
    select.innerHTML = '<option value="">全部</option>' + words.map(w =>
        `<option value="${w}">${w}</option>`
    ).join('');
}

function updateHandlerFilter() {
    const select = document.getElementById('handlerFilter');
    if (!select) return;
    const currentValue = select.value;
    const handlers = [...new Set(getCurrentCases().map(c => c.handler).filter(Boolean))].sort();
    select.innerHTML = '<option value="">全部</option>' + handlers.map(h =>
        `<option value="${h}">${h}</option>`
    ).join('');
    if (handlers.includes(currentValue)) select.value = currentValue;
}

function updatePartiesHeader() {
    const headerEl = document.getElementById('partiesHeader');
    if (headerEl) {
        const labels = getCurrentBusiness().partiesLabels;
        headerEl.textContent = `${labels[0]}/${labels[1]}`;
    }
}

// ===== 统计卡片渲染 =====
function renderStatsCards() {
    const current = getCurrentBusiness();
    const config = current.statsConfig;
    const cases = getCurrentCases();
    
    const counts = {
        total: cases.length,
        pending: cases.filter(c => c.status === 'pending').length,
        ongoing: cases.filter(c => c.status === 'ongoing').length,
        closed: cases.filter(c => c.status === 'closed').length
    };
    
    const statsGrid = document.getElementById('statsGrid');
    if (statsGrid) {
        statsGrid.innerHTML = Object.entries(config).map(([key, cfg]) => `
            <div class="stat-card">
                <div class="stat-header">
                    <div class="stat-icon ${cfg.color}">
                        <i class="fas ${cfg.icon}"></i>
                    </div>
                    <div>
                        <div class="stat-title">${cfg.label}</div>
                        <div class="stat-value">${counts[key]}</div>
                    </div>
                </div>
            </div>
        `).join('');
    }
}

// ===== 案件列表渲染 =====
function renderCaseList(cases = getCurrentCases()) {
    const listBody = document.getElementById('caseListBody');
    const current = getCurrentBusiness();

    // 用户侧过滤掉软删除案件（管理后台可见，用户侧不可见）
    cases = cases.filter(c => !c.isDeleted);
    // 按更新时间倒序排列
    cases = [...cases].sort((a, b) => new Date(b.updatedAt || b.date) - new Date(a.updatedAt || a.date));
    
    if (cases.length === 0) {
        listBody.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon"><i class="fas fa-folder-open"></i></div>
                <div class="empty-title">暂无案件</div>
                <div class="empty-desc">点击上方"新建案件"按钮创建您的第一个案件</div>
            </div>
        `;
        return;
    }
    
    const labels = current.partiesLabels;
    
    const buildColumn = (key, c) => {
        switch(key) {
            case 'caseNumber':
                return `<div class="case-col">${c.caseNumber || '-'}</div>`;
            case 'cause':
                return `<div class="case-col">${c.cause || '-'}</div>`;
            case 'parties':
                return `<div class="case-col">${c.partyA || '-'} ${currentBusiness === 'court' ? '诉' : '与'} ${c.partyB || '-'}</div>`;
            case 'handler':
                return `<div class="case-col">${c.handler || '-'}</div>`;
            case 'uploadDate':
                return `<div class="case-col">${c.date || '-'}</div>`;
            case 'caseWord':
                return `<div class="case-col"><span class="case-word-tag">${c.caseWord || '-'}</span></div>`;
            default:
                return '';
        }
    };
    
    const getOcrErrorCount = (c) => c.files ? c.files.filter(f => f.ocrStatus !== 'done').length : 0;
    const hasOcrError = (c) => getOcrErrorCount(c) > 0;
    
    listBody.innerHTML = cases.map(c => {
        const extraCols = [...visibleColumns].map(col => buildColumn(col, c)).join('');
        return `
        <div class="case-item" data-case-id="${c.id}">
            <div class="case-checkbox-col">
                <input type="checkbox" class="case-checkbox" value="${c.id}" onchange="toggleCaseSelect('${c.id}', this)">
            </div>
            <div class="case-name" onclick="openCaseFiles('${c.id}')" title="点击新标签页打开案件文件">
                <span class="case-name-text">${c.caseName || c.caseNumber}</span>
                <i class="fas fa-external-link-alt case-name-icon"></i>
            </div>
            <div class="case-col" style="text-align:center;">${c.updatedAt || c.date || '-'}</div>
            <div class="case-col case-files-col ${hasOcrError(c) ? 'ocr-error' : ''}" onclick="openOcrPanel('${c.id}')" title="${hasOcrError(c) ? `存在${getOcrErrorCount(c)}个材料解析异常，点击查看` : '点击查看文件解析状态'}">
                <span class="case-file-count">
                    <i class="fas fa-file"></i> ${hasOcrError(c) ? `${(c.fileCount || 0) - getOcrErrorCount(c)}/${c.fileCount || 0}` : (c.fileCount || 0)}
                    ${hasOcrError(c) ? `<span class="ocr-error-badge">解析异常</span>` : ''}
                </span>
            </div>
            ${extraCols}
            <div class="case-actions">
                <button class="case-action-btn" title="文件上传" onclick="openSupplementUpload('${c.id}')">
                    <i class="fas fa-upload"></i> 文件上传
                </button>
                <button class="case-action-btn quick-gen-btn" title="生成文书" onclick="openGenModal('${c.id}')">
                    <i class="fas fa-bolt"></i> 生成文书
                </button>
                <div class="case-action-more-wrap">
                    <button class="case-action-btn more-btn" title="更多操作" onclick="toggleActionMenu(this)">
                        <i class="fas fa-ellipsis-v"></i>
                    </button>
                    <div class="case-action-menu">
                        <div class="case-action-menu-item" onclick="openCaseDocuments('${c.id}')">
                            <i class="fas fa-file-alt"></i> 历史文书
                        </div>
                        <div class="case-action-menu-item" onclick="editCase('${c.id}')">
                            <i class="fas fa-edit"></i> 编辑
                        </div>
                        <div class="case-action-menu-item danger" onclick="confirmDeleteCase('${c.id}')">
                            <i class="fas fa-trash-alt"></i> 删除
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `}).join('');
    
    updateGridColumns();
}

function updateGridColumns() {
    const header = document.getElementById('caseListHeader');
    const items = document.querySelectorAll('.case-item');
    const baseCols = ['40px', 'minmax(0, 3fr)', 'minmax(0, 1fr)', '100px'];
    const extraCols = [...visibleColumns].map(() => 'minmax(0, 1fr)');
    const actionsCol = ['180px'];
    const cols = [...baseCols, ...extraCols, ...actionsCol].join(' ');
    
    if (header) header.style.gridTemplateColumns = cols;
    items.forEach(item => item.style.gridTemplateColumns = cols);
}

function renderCaseHeader() {
    const header = document.getElementById('caseListHeader');
    if (!header) return;
    
    const colLabels = {
        caseNumber: '案号',
        cause: '案由',
        parties: '当事人',
        handler: '承办人',
        uploadDate: '上传日期',
        caseWord: '案字'
    };
    
    const current = getCurrentBusiness();
    const dynamicLabels = {
        ...colLabels,
        parties: `${current.partiesLabels[0]}/${current.partiesLabels[1]}`
    };
    
    const extraHeaderCols = [...visibleColumns].map(col => `<div class="case-col">${dynamicLabels[col]}</div>`).join('');
    
    header.innerHTML = `
        <div class="case-checkbox-col"><input type="checkbox" class="case-checkbox" id="selectAllCheckbox" onchange="toggleSelectAll(this)" title="全选"></div>
        <div class="col-name">案件名称</div>
        <div class="col-updated" style="text-align:center;">更新时间</div>
        <div class="col-files" style="text-align:center;">文件数量</div>
        ${extraHeaderCols}
        <div class="col-actions-header">操作</div>
    `;
    
    updateGridColumns();
}

function toggleColConfig() {
    const panel = document.getElementById('colConfigPanel');
    const btn = document.querySelector('.col-config-toolbar-btn');
    panel.classList.toggle('show');
    if (btn) btn.classList.toggle('active', panel.classList.contains('show'));

    document.querySelectorAll('.col-config-item input[type="checkbox"]').forEach(cb => {
        cb.checked = visibleColumns.has(cb.dataset.column);
    });
}

function toggleColumn(col) {
    if (visibleColumns.has(col)) {
        visibleColumns.delete(col);
    } else {
        visibleColumns.add(col);
    }
    saveColumnConfig();
    renderCaseHeader();
    renderCaseList();
}

// ===== 筛选 =====
// ===== 操作栏「更多」下拉菜单 =====
function toggleActionMenu(btn) {
    const menu = btn.nextElementSibling;
    const isOpen = menu.classList.contains('show');
    // 先关闭所有已打开的菜单
    document.querySelectorAll('.case-action-menu.show').forEach(m => m.classList.remove('show'));
    if (!isOpen) menu.classList.add('show');
}
// 点击其他区域关闭菜单
document.addEventListener('click', function(e) {
    if (!e.target.closest('.case-action-more-wrap')) {
        document.querySelectorAll('.case-action-menu.show').forEach(m => m.classList.remove('show'));
    }
});

function filterCases() {
    const searchQuery = document.getElementById('caseSearchInput').value.toLowerCase().trim();
    const causeFilter = document.getElementById('causeFilter').value;
    const caseWordFilter = document.getElementById('caseWordFilter').value;
    const handlerFilter = document.getElementById('handlerFilter').value;
    const dateStart = document.getElementById('uploadDateStart').value;
    const dateEnd = document.getElementById('uploadDateEnd').value;

    let filtered = getCurrentCases();

    if (searchQuery) {
        filtered = filtered.filter(c => {
            const basicMatch =
                (c.caseName || '').toLowerCase().includes(searchQuery) ||
                (c.caseNumber || '').toLowerCase().includes(searchQuery) ||
                (c.cause || '').toLowerCase().includes(searchQuery) ||
                (c.partyA || '').toLowerCase().includes(searchQuery) ||
                (c.partyB || '').toLowerCase().includes(searchQuery);
            const fileMatch = (c.files || []).some(f => (f.name || '').toLowerCase().includes(searchQuery));
            const docMatch = (c.documents || []).some(d => (d.title || '').toLowerCase().includes(searchQuery));
            return basicMatch || fileMatch || docMatch;
        });
    }

    if (causeFilter) {
        filtered = filtered.filter(c => c.type === causeFilter);
    }

    if (caseWordFilter) {
        filtered = filtered.filter(c => c.caseWord === caseWordFilter);
    }

    if (handlerFilter) {
        filtered = filtered.filter(c => c.handler === handlerFilter);
    }

    if (dateStart || dateEnd) {
        filtered = filtered.filter(c => {
            const d = c.date || c.updatedAt;
            if (!d) return false;
            return (!dateStart || d >= dateStart) && (!dateEnd || d <= dateEnd);
        });
    }

    renderCaseList(filtered);
    syncCheckboxState();
}

function onDateRangeQuickChange(value) {
    const startInput = document.getElementById('uploadDateStart');
    const endInput = document.getElementById('uploadDateEnd');
    const group = document.querySelector('.date-filter-group');
    if (value === 'custom') {
        if (group) group.classList.add('has-custom');
        return;
    }
    if (group) group.classList.remove('has-custom');
    const today = new Date();
    const endStr = today.toISOString().split('T')[0];
    if (value === '7' || value === '30') {
        const start = new Date();
        start.setDate(today.getDate() - parseInt(value, 10));
        const startStr = start.toISOString().split('T')[0];
        startInput.value = startStr;
        endInput.value = endStr;
    } else {
        startInput.value = '';
        endInput.value = '';
    }
    filterCases();
}

function toggleAdvancedFilters() {
    const panel = document.getElementById('filterAdvancedPanel');
    const btn = document.getElementById('filterAdvancedToggle');
    if (!panel || !btn) return;
    const isOpen = panel.classList.toggle('show');
    btn.classList.toggle('active', isOpen);
    btn.innerHTML = isOpen
        ? '<i class="fas fa-angle-up"></i> 收起筛选'
        : '<i class="fas fa-sliders-h"></i> 高级筛选';
}

function resetAdvancedFilters() {
    document.getElementById('caseWordFilter').value = '';
    document.getElementById('handlerFilter').value = '';
    document.getElementById('dateRangeQuick').value = '';
    onDateRangeQuickChange('');
    filterCases();
}

function viewCase(caseId) {
    openCaseDocuments(caseId);
}

function editCase(caseId) {
    openEditCase(caseId);
}

// ===== 复选框 / 批量选择 =====
function toggleSelectAll(checkbox) {
    const visibleCheckboxes = document.querySelectorAll('#caseListBody .case-checkbox');
    if (checkbox.checked) {
        visibleCheckboxes.forEach(cb => {
            cb.checked = true;
            selectedCaseIds.add(cb.value);
        });
    } else {
        visibleCheckboxes.forEach(cb => {
            cb.checked = false;
            selectedCaseIds.delete(cb.value);
        });
    }
    updateSelectionUI();
}

function toggleCaseSelect(caseId, checkbox) {
    if (checkbox.checked) {
        selectedCaseIds.add(caseId);
    } else {
        selectedCaseIds.delete(caseId);
    }
    updateSelectionUI();
}

function syncCheckboxState() {
    document.querySelectorAll('#caseListBody .case-checkbox').forEach(cb => {
        cb.checked = selectedCaseIds.has(cb.value);
    });
    updateSelectionUI();
}

function updateSelectionUI() {
    const count = selectedCaseIds.size;
    const bar = document.getElementById('batchActionBar');
    const countEl = document.getElementById('selectedCount');
    const deleteBtnText = document.getElementById('batchDeleteBtnText');
    const selectAllCb = document.getElementById('selectAllCheckbox');

    if (countEl) countEl.textContent = count;

    if (count > 0) {
        bar.classList.add('show');
        if (deleteBtnText) deleteBtnText.textContent = count === 1 ? '删除' : '批量删除';
    } else {
        bar.classList.remove('show');
    }

    const visibleCheckboxes = document.querySelectorAll('#caseListBody .case-checkbox');
    if (selectAllCb) {
        selectAllCb.checked = visibleCheckboxes.length > 0 && count === visibleCheckboxes.length;
    }
}

function clearSelection() {
    selectedCaseIds.clear();
    document.querySelectorAll('#caseListBody .case-checkbox').forEach(cb => cb.checked = false);
    const selectAllCb = document.getElementById('selectAllCheckbox');
    if (selectAllCb) selectAllCb.checked = false;
    updateSelectionUI();
}

// ===== 删除案件弹窗 =====
let caseDeleteTargetIds = [];
let pendingDeleteScope = 'all';

function getCaseDeleteTitle() {
    return caseDeleteTargetIds.length > 1
        ? `确认删除 ${caseDeleteTargetIds.length} 个案件？`
        : '确认删除该案件？';
}

function openCaseDeleteModal(ids) {
    caseDeleteTargetIds = Array.isArray(ids) ? ids : [ids];
    document.getElementById('caseDeleteTitle').textContent = getCaseDeleteTitle();
    document.getElementById('caseDeleteScopeModal').classList.add('show');
    const radio = document.querySelector('input[name="caseDeleteScope"][value="all"]');
    if (radio) radio.checked = true;
}

function closeCaseDeleteModal() {
    document.getElementById('caseDeleteScopeModal').classList.remove('show');
    caseDeleteTargetIds = [];
}

function confirmDeleteCase(caseId) {
    openCaseDeleteModal(caseId);
}

function confirmBatchDeleteCases() {
    if (selectedCaseIds.size === 0) {
        showNotification('请先勾选要删除的案件', 'warning');
        return;
    }
    openCaseDeleteModal(Array.from(selectedCaseIds));
}

function executeCaseDelete() {
    const scopeEl = document.querySelector('input[name="caseDeleteScope"]:checked');
    const scope = scopeEl ? scopeEl.value : 'all';
    pendingDeleteScope = scope;

    if (!caseDeleteTargetIds.length) {
        closeCaseDeleteModal();
        return;
    }

    const cases = getCurrentCases();
    const idsSet = new Set(caseDeleteTargetIds);
    const targetCases = cases.filter(c => idsSet.has(c.id));
    const totalMaterials = targetCases.reduce((sum, c) => sum + (c.files ? c.files.length : 0), 0);

    const scopeTextMap = {
        'all': '删除案件及全部材料（不可恢复）',
        'materialsOnly': '仅清空原始材料，保留案件记录及已生成文书',
        'caseOnly': '仅删除案件记录，保留原始材料及已生成文书'
    };
    const scopeText = scopeTextMap[scope] || scopeTextMap['all'];

    const names = targetCases.map(c => `「${c.caseName || c.caseNumber || '未命名案件'}」`).join('、');
    const text = caseDeleteTargetIds.length > 1
        ? `即将对 <strong>${caseDeleteTargetIds.length} 个案件</strong> 执行「${scopeText}」：${names}，共涉及 <strong>${totalMaterials} 个材料</strong>。删除后不可恢复，是否确认？`
        : `即将对案件 ${names} 执行「${scopeText}」，涉及 <strong>${totalMaterials} 个材料</strong>。删除后不可恢复，是否确认？`;

    document.getElementById('caseDeleteConfirmText').innerHTML = text;
    document.getElementById('caseDeleteScopeModal').classList.remove('show');
    document.getElementById('caseDeleteConfirmModal').classList.add('show');
}

function closeCaseDeleteConfirmModal() {
    document.getElementById('caseDeleteConfirmModal').classList.remove('show');
    caseDeleteTargetIds = [];
    pendingDeleteScope = 'all';
}

function doExecuteCaseDelete() {
    const scope = pendingDeleteScope || 'all';
    if (!caseDeleteTargetIds.length) {
        closeCaseDeleteConfirmModal();
        return;
    }

    const cases = getCurrentCases();
    const now = new Date().toISOString().split('T')[0];
    const idsSet = new Set(caseDeleteTargetIds);

    if (scope === 'materialsOnly') {
        cases.forEach(c => {
            if (idsSet.has(c.id)) {
                c.files = [];
                c.fileCount = 0;
                c.updatedAt = now;
            }
        });
        showNotification('已清空选中案件的原始材料，已生成文书已保留', 'success');
    } else if (scope === 'caseOnly') {
        // 软删除：仅标记 isDeleted，不从数组移除，保留 files/documents 全部字段
        // 用户侧 renderCaseList 过滤 isDeleted=true；管理后台可见且可恢复
        cases.forEach(c => {
            if (idsSet.has(c.id)) {
                c.isDeleted = true;
                c.deletedAt = now;
            }
        });
        selectedCaseIds = new Set(Array.from(selectedCaseIds).filter(id => !idsSet.has(id)));
        showNotification(`已软删除 ${caseDeleteTargetIds.length} 个案件记录，原始材料及文书已保留，管理员可在后台恢复`, 'success');
    } else {
        const remaining = cases.filter(c => !idsSet.has(c.id));
        getCurrentBusiness().cases = remaining;
        selectedCaseIds = new Set(Array.from(selectedCaseIds).filter(id => !idsSet.has(id)));
        showNotification(`已删除 ${caseDeleteTargetIds.length} 个案件`, 'success');
    }

    closeCaseDeleteConfirmModal();
    saveBusinessSystems();
    renderCaseList();
    syncCheckboxState();
}

// ===== 生成文书弹框 =====
function openGenModal(caseId) {
    const c = getCurrentCases().find(x => x.id === caseId);
    if (!c) return;
    const firstDocType = getFirstDocType();
    quickState.caseId = caseId;
    quickState.model = getCurrentModelId();
    quickState.docType = firstDocType;
    quickState.template = getFirstTemplate(firstDocType);
    quickState.requirement = '';
    quickState.document = null;
    quickState.materialsCount = (c.files || []).length;

    document.getElementById('genModalOverlay').classList.add('show');
    document.getElementById('genModal').classList.add('show');
    renderGenModalBody();
}

function closeGenModal() {
    document.getElementById('genModalOverlay').classList.remove('show');
    document.getElementById('genModal').classList.remove('show');
}

function onGenDocTypeChange(docType) {
    quickState.docType = docType;
    quickState.template = getFirstTemplate(docType);
    quickState.requirement = '';
    renderGenModalBody();
}

function onGenModelChange(modelId) {
    quickState.model = modelId;
    renderGenModalBody();
}

function getAllMaterialsTokens(caseItem) {
    return (caseItem.files || []).reduce((sum, f) => sum + estimateFileTokens(f), 0);
}

function updateGenContextHint() {
    const c = getCurrentCases().find(x => x.id === quickState.caseId);
    const hint = document.getElementById('genContextHint');
    if (!hint || !c) return;
    const totalTokens = getAllMaterialsTokens(c);
    const safeLimit = getSafeContextLimit(quickState.model);
    const model = AI_MODELS.find(m => m.id === quickState.model) || AI_MODELS.find(m => m.id === DEFAULT_MODEL_ID);
    const exceeded = totalTokens > safeLimit;
    hint.className = 'gen-context-hint ' + (exceeded ? 'warn' : 'ok');
    hint.innerHTML = exceeded
        ? `当前案件全部材料预估约 <strong>${formatNumber(totalTokens)}</strong> tokens，超过 <strong>${model.name}</strong> 的安全上限 <strong>${formatNumber(safeLimit)}</strong> tokens，请进入案件详情页选择核心材料生成文书；如勾选的核心材料仍超限，再使用分步生成。`
        : `当前案件全部材料预估约 <strong>${formatNumber(totalTokens)}</strong> tokens，未超过 <strong>${model.name}</strong> 的安全上限 <strong>${formatNumber(safeLimit)}</strong> tokens，将默认使用全部材料生成。`;
}

function renderGenModalBody() {
    const c = getCurrentCases().find(x => x.id === quickState.caseId);
    const body = document.getElementById('genModalBody');
    const modelOptions = AI_MODELS.map(m => `<option value="${m.id}" ${m.id === quickState.model ? 'selected' : ''}>${m.name}（${formatNumber(m.limit)}）</option>`).join('');

    const totalTokens = c ? getAllMaterialsTokens(c) : 0;
    const safeLimit = getSafeContextLimit(quickState.model);
    const exceeded = totalTokens > safeLimit;

    let configHtml = '';
    let elementHintHtml = '';
    try {
        configHtml = exceeded ? '' : buildGenConfigHtml();
    } catch (e) { configHtml = ''; }
    try {
        elementHintHtml = (typeof buildGenElementHintHtml === 'function') ? buildGenElementHintHtml(c) : '';
    } catch (e) { elementHintHtml = ''; }

    body.innerHTML = `
        <div class="gen-form-group">
            <label class="gen-form-label">当前模型 <i class="fas fa-info-circle model-info-icon" title="该配置功能为管理后台功能，用户不可见，方便演示展示"></i></label>
            <select class="gen-form-select" id="genModelSelect" onchange="onGenModelChange(this.value)">
                ${modelOptions}
            </select>
        </div>

        <div class="gen-context-hint ok" id="genContextHint"></div>

        ${elementHintHtml}

        ${configHtml}
    `;

    updateGenModalFooter(exceeded);
    updateGenContextHint();

    if (!exceeded) {
        try { renderReqTemplates('genReqTemplates', quickState.docType, 'genRequirement'); } catch (e) {}
    }
}

function buildGenElementHintHtml(caseItem) {
    try {
        if (!caseItem) return '';
        if (typeof getAllElementPresets !== 'function') return '';
        // v1.27: 要件仅在「裁判文书」(judgment) 时才询问引入，其他文书类型不显示要件提示
        if (quickState.docType !== 'judgment') return '';
        const _org = localStorage.getItem('currentBusiness') || 'court';
        const _cw = parseCaseWord(caseItem.caseNumber, _org);
        const allPresets = getAllElementPresets(caseItem.cause, _org, _cw);
        const standardCount = (allPresets.standard || []).length;
        const mineCount = (allPresets.mine || []).length;
        const totalCount = standardCount + mineCount;
        if (totalCount === 0) return '';
        return `
            <div class="gen-element-hint">
                <i class="fas fa-puzzle-piece"></i>
                <span>检测到该案由存在 <strong>${totalCount}</strong> 个可用要件（标准 ${standardCount} / 我的 ${mineCount}），开始生成后将自动引入全部要件辅助生成。</span>
            </div>
        `;
    } catch (e) {
        return '';
    }
}

function buildGenConfigHtml() {
    const docTypes = getCurrentDocTypes();
    // v1.22: 模板不再按 cause 过滤，直接按所属文书类型展示
    const templates = getFilteredDocTypeTemplates(quickState.docType);
    const docTypeOptions = Object.entries(docTypes)
        .map(([k, v]) => `<option value="${k}" ${k === quickState.docType ? 'selected' : ''}>${v.name}</option>`)
        .join('');
    // v1.24: 模板按来源分组（标准 / 我的）
    const stdOpts = [], myOpts = [];
    Object.entries(templates).forEach(([k, v]) => {
        const name = getTemplateName(v);
        const opt = `<option value="${k}" ${k === quickState.template ? 'selected' : ''}>${name}</option>`;
        if (v && v.source === 'mine') myOpts.push(opt); else stdOpts.push(opt);
    });
    let templateSelectHtml;
    if (stdOpts.length && myOpts.length) {
        templateSelectHtml = `<optgroup label="标准模板">${stdOpts.join('')}</optgroup><optgroup label="我的模板">${myOpts.join('')}</optgroup>`;
    } else if (stdOpts.length) {
        templateSelectHtml = stdOpts.join('');
    } else if (myOpts.length) {
        templateSelectHtml = `<optgroup label="我的模板">${myOpts.join('')}</optgroup>`;
    } else {
        templateSelectHtml = `<option value="">暂无可用模板</option>`;
    }

    return `
        <div class="gen-form-group">
            <label class="gen-form-label">文书类型</label>
            <select class="gen-form-select" id="genDocType" onchange="onGenDocTypeChange(this.value)">
                ${docTypeOptions}
            </select>
        </div>

        <div class="gen-form-group">
            <label class="gen-form-label">文书模板</label>
            <select class="gen-form-select" id="genTemplate" onchange="quickState.template=this.value">
                ${templateSelectHtml}
            </select>
        </div>

        <div class="gen-form-group">
            <label class="gen-form-label">提示词</label>
            <div id="genReqTemplates" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;"></div>
            <textarea class="gen-form-textarea" id="genRequirement"
                      placeholder="可选：描述特殊要求或关注点，帮助 AI 更好理解需求"
                      onchange="quickState.requirement=this.value"></textarea>
        </div>
    `;
}

function updateGenModalFooter(exceeded) {
    const btn = document.getElementById('genModalStartBtn');
    if (!btn) return;
    if (exceeded) {
        btn.innerHTML = '<i class="fas fa-arrow-right"></i> 前往案件详情页配置';
        btn.setAttribute('onclick', 'goToCaseFilesForGen()');
    } else {
        btn.innerHTML = '<i class="fas fa-magic"></i> 开始生成';
        btn.setAttribute('onclick', 'startQuickGen()');
    }
}

function startQuickGen() {
    if (!quickState.docType) {
        showNotification('请选择文书类型', 'warning');
        return;
    }
    const c = getCurrentCases().find(x => x.id === quickState.caseId);
    if (!c) return;
    const totalTokens = getAllMaterialsTokens(c);
    const safeLimit = getSafeContextLimit(quickState.model);
    if (totalTokens > safeLimit) {
        goToCaseFilesForGen();
        return;
    }

    // 未超限时跳转案件详情页，默认使用全部材料并自动触发生成，与详情页配置生成文书的体验统一
    closeGenModal();
    const params = new URLSearchParams({
        caseId: quickState.caseId,
        model: quickState.model,
        docType: quickState.docType,
        template: quickState.template,
        requirement: quickState.requirement || '',
        source: 'list',
        autoGen: '1'
    });
    // v1.27: 仅「裁判文书」(judgment) 才自动引入要件，其他文书类型不触发要件流程
    if (quickState.docType === 'judgment') {
        params.set('autoIntroduceElements', '1');
    }
    window.location.href = `case-files.html?${params.toString()}`;
}

function goToCaseFilesForGen() {
    closeGenModal();
    window.location.href = `case-files.html?caseId=${encodeURIComponent(quickState.caseId)}`;
}

function generateQuickDoc() {
    const c = getCurrentCases().find(x => x.id === quickState.caseId);
    const current = getCurrentBusiness();
    const templates = getCurrentTemplates();
    const typeName = getCurrentDocTypes()[quickState.docType]?.name || '法律文书';
    const templateName = getTemplateName(templates[quickState.template]) || typeName;
    const labels = current.partiesLabels;
    
    let content = '';
    if (currentBusiness === 'court') {
        content = '<div style="font-family:\'SimSun\',serif;line-height:2;text-align:justify;">\n<h2 style="text-align:center;font-size:20pt;font-weight:bold;margin-bottom:24px;">' + templateName + '</h2>\n<p style="text-align:center;margin-bottom:18px;">' + c.caseNumber + '</p>\n<p style="text-indent:2em;margin-bottom:10px;"><strong>' + labels[0] + '：</strong>' + c.partyA + '。</p>\n<p style="text-indent:2em;margin-bottom:10px;"><strong>' + labels[1] + '：</strong>' + c.partyB + '。</p>\n<h3 style="font-size:13pt;margin:20px 0 12px;font-weight:bold;">一、案件由来和审理经过</h3>\n<p style="text-indent:2em;margin-bottom:10px;">' + labels[0] + '诉' + labels[1] + c.cause + '一案，本院立案后依法公开开庭进行了审理。本案现已审理终结。</p>\n<h3 style="font-size:13pt;margin:20px 0 12px;font-weight:bold;">二、' + labels[0] + '诉称</h3>\n<p style="text-indent:2em;margin-bottom:10px;">' + labels[0] + '向本院提出诉讼请求，要求' + labels[1] + '承担相应责任。事实和理由：' + (quickState.requirement || '详见起诉状及相关证据材料。') + '</p>\n<h3 style="font-size:13pt;margin:20px 0 12px;font-weight:bold;">三、本院查明的事实</h3>\n<p style="text-indent:2em;margin-bottom:10px;">本院经审理认定事实如下：根据当事人陈述及经审查确认的证据，本院查明案件事实清楚，证据确实充分。</p>\n<h3 style="font-size:13pt;margin:20px 0 12px;font-weight:bold;">四、本院认为</h3>\n<p style="text-indent:2em;margin-bottom:10px;">根据相关法律规定，结合本案查明的事实，本院认为' + labels[0] + '诉请于法有据，应予支持。</p>\n<h3 style="font-size:13pt;margin:20px 0 12px;font-weight:bold;">五、判决结果</h3>\n<p style="text-indent:2em;margin-bottom:10px;">依照相关法律规定，判决如下：</p>\n<p style="text-indent:2em;margin-bottom:10px;">一、' + labels[1] + '于本判决生效之日起十日内履行相应义务；</p>\n<p style="text-indent:2em;margin-bottom:10px;">二、驳回' + labels[0] + '的其他诉讼请求。</p>\n<p style="text-indent:2em;margin-bottom:20px;">如不服本判决，可在判决书送达之日起十五日内提起上诉。</p>\n<p style="text-align:right;margin-bottom:8px;">审　判　长　' + c.handler.replace('法官', '') + '</p>\n<p style="text-align:right;margin-bottom:20px;">二〇二六年七月二日</p>\n</div>';
    } else if (currentBusiness === 'procuratorate') {
        content = '<div style="font-family:\'SimSun\',serif;line-height:2;text-align:justify;">\n<h2 style="text-align:center;font-size:20pt;font-weight:bold;margin-bottom:24px;">' + templateName + '</h2>\n<p style="text-align:center;margin-bottom:18px;">' + c.caseNumber + '</p>\n<p style="text-indent:2em;margin-bottom:10px;"><strong>' + labels[0] + '：</strong>' + c.partyA + '。</p>\n<p style="text-indent:2em;margin-bottom:10px;"><strong>' + labels[1] + '：</strong>' + c.partyB + '。</p>\n<h3 style="font-size:13pt;margin:20px 0 12px;font-weight:bold;">一、案件来源</h3>\n<p style="text-indent:2em;margin-bottom:10px;">本案由公安机关侦查终结，以' + labels[0] + '涉嫌' + c.cause + '，于近日移送本院审查起诉。</p>\n<h3 style="font-size:13pt;margin:20px 0 12px;font-weight:bold;">二、审查认定的事实</h3>\n<p style="text-indent:2em;margin-bottom:10px;">经依法审查查明：' + labels[0] + '实施了' + c.cause + '行为，事实清楚，证据确实充分。' + (quickState.requirement || '具体事实详见侦查卷宗。') + '</p>\n<h3 style="font-size:13pt;margin:20px 0 12px;font-weight:bold;">三、处理意见</h3>\n<p style="text-indent:2em;margin-bottom:10px;">本院认为，' + labels[0] + '的行为已触犯《中华人民共和国刑法》相关规定，犯罪事实清楚，证据确实充分，应当以' + c.cause + '追究其刑事责任。</p>\n<h3 style="font-size:13pt;margin:20px 0 12px;font-weight:bold;">四、决定事项</h3>\n<p style="text-indent:2em;margin-bottom:10px;">根据审查情况，本院决定依法提起公诉。</p>\n<p style="text-align:right;margin-bottom:8px;">' + c.handler + '</p>\n<p style="text-align:right;margin-bottom:20px;">二〇二六年七月二日</p>\n</div>';
    } else {
        content = '<div style="font-family:\'SimSun\',serif;line-height:2;text-align:justify;">\n<h2 style="text-align:center;font-size:20pt;font-weight:bold;margin-bottom:24px;">' + templateName + '</h2>\n<p style="text-align:center;margin-bottom:18px;">' + c.caseNumber + '</p>\n<p style="text-indent:2em;margin-bottom:10px;"><strong>' + labels[0] + '：</strong>' + c.partyA + '。</p>\n<p style="text-indent:2em;margin-bottom:10px;"><strong>' + labels[1] + '：</strong>' + c.partyB + '。</p>\n<h3 style="font-size:13pt;margin:20px 0 12px;font-weight:bold;">一、调解请求</h3>\n<p style="text-indent:2em;margin-bottom:10px;">' + labels[0] + '因' + c.cause + '与' + labels[1] + '发生争议，向本调解委员会申请调解。</p>\n<h3 style="font-size:13pt;margin:20px 0 12px;font-weight:bold;">二、争议事实</h3>\n<p style="text-indent:2em;margin-bottom:10px;">经调解委员会调查核实，双方当事人就' + c.cause + '事项存在争议。' + (quickState.requirement || '具体事实详见调解申请书及相关材料。') + '</p>\n<h3 style="font-size:13pt;margin:20px 0 12px;font-weight:bold;">三、调解结果</h3>\n<p style="text-indent:2em;margin-bottom:10px;">经双方当事人自愿协商，达成如下协议：双方同意通过友好协商方式解决争议，' + labels[1] + '同意向' + labels[0] + '作出相应补偿。</p>\n<h3 style="font-size:13pt;margin:20px 0 12px;font-weight:bold;">四、协议履行</h3>\n<p style="text-indent:2em;margin-bottom:10px;">本协议自双方签字之日起生效，双方应按照协议内容履行各自义务。</p>\n<p style="text-align:right;margin-bottom:8px;">调　解　员　' + c.handler.replace('调解员', '') + '</p>\n<p style="text-align:right;margin-bottom:20px;">二〇二六年七月二日</p>\n</div>';
    }
    
    quickState.document = {
        id: `doc_${Date.now()}`,
        title: current.docTitlePrefix + ' ' + templateName,
        docType: quickState.docType,
        template: quickState.template,
        wordCount: Math.round(1500 + Math.random() * 1000),
        createdAt: new Date().toISOString().split('T')[0],
        versions: [{
            type: 'original',
            content: content,
            createdAt: new Date().toISOString().split('T')[0]
        }]
    };
}

function getDocumentContent(doc, type) {
    if (!doc) return '';
    if (doc.versions && doc.versions.length) {
        const version = doc.versions.find(v => v.type === type) || doc.versions[doc.versions.length - 1];
        return version.content || '';
    }
    return doc.content || '';
}

function openDocumentPreviewWindow(doc, caseId, versionType) {
    const content = getDocumentContent(doc, versionType);
    const previewWin = window.open('', '_blank', 'width=900,height=800,menubar=no,toolbar=no');
    if (!previewWin) {
        showNotification('浏览器弹窗被拦截，请允许弹窗后重试', 'error');
        return;
    }
    const caseInfo = caseId ? findCaseById(caseId)?.caseItem : null;
    const caseNo = caseInfo ? caseInfo.caseNumber : '';
    const causeName = caseInfo ? caseInfo.cause : '';
    previewWin.document.write('<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n    <meta charset="UTF-8">\n    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n    <title>' + doc.title + ' - 文书预览</title>\n    <style>\n        body { font-family: "Noto Serif SC", "SimSun", serif; margin: 0; padding: 40px; background: #f5f5f5; }\n        .preview-container { max-width: 800px; margin: 0 auto; background: white; padding: 50px 60px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }\n        .preview-header { text-align: center; margin-bottom: 40px; padding-bottom: 20px; border-bottom: 2px solid #333; }\n        .preview-title { font-size: 22px; font-weight: 700; margin: 0 0 10px; color: #1a1a1a; }\n        .preview-meta { font-size: 14px; color: #666; }\n        .preview-content { font-size: 16px; line-height: 1.8; color: #333; }\n        .preview-content p { margin: 1em 0; text-indent: 2em; }\n        .preview-content h2 { font-size: 18px; font-weight: 600; margin: 2em 0 1em; color: #1a1a1a; }\n        .preview-content h3 { font-size: 16px; font-weight: 600; margin: 1.5em 0 0.8em; color: #1a1a1a; }\n        .preview-content strong { font-weight: 600; }\n        .preview-content .align-center { text-align: center; }\n        .preview-footer { margin-top: 60px; text-align: right; font-size: 14px; color: #666; }\n        @media print {\n            body { background: white; padding: 0; }\n            .preview-container { box-shadow: none; padding: 20px; }\n        }\n    </style>\n</head>\n<body>\n    <div class="preview-container">\n        <div class="preview-header">\n            <div class="preview-title">' + doc.title + '</div>\n            <div class="preview-meta">' + caseNo + ' · ' + causeName + '</div>\n        </div>\n        <div class="preview-content">' + content + '</div>\n        <div class="preview-footer">文书生成时间：' + new Date().toLocaleString() + '</div>\n    </div>\n</body>\n</html>');
    previewWin.document.close();
}

function saveQuickDocument() {
    if (!quickState.document || !quickState.caseId) return null;
    const cases = getCurrentCases();
    const caseItem = cases.find(c => c.id === quickState.caseId);
    if (!caseItem) return null;
    if (!caseItem.documents) caseItem.documents = [];
    caseItem.documents.push({ ...quickState.document });
    caseItem.updatedAt = new Date().toISOString().split('T')[0];
    saveBusinessSystems();
    addHistoryTask({
        type: 'generate',
        caseId: caseItem.id,
        caseName: caseItem.caseName || caseItem.caseNumber,
        docId: quickState.document.id,
        docTitle: quickState.document.title
    });
    return quickState.document;
}

// ===== 批量生成（全屏面板） =====
function openBatchFullscreen() {
    if (selectedCaseIds.size === 0) {
        showNotification('请先勾选要批量处理的案件', 'warning');
        return;
    }
    document.getElementById('batchFullscreen').classList.add('show');
    const firstDocType = getFirstDocType();
    batchState.docType = firstDocType;
    batchState.template = getFirstTemplate(firstDocType);
    batchState.results = [];
    batchState.totalElapsed = 0;
    batchState.completedCount = 0;
    batchState.failedCount = 0;
    renderBatchConfig();
}

function closeBatchFullscreen() {
    if (batchState.timerInterval) {
        if (!confirm('批量任务正在执行，离开将停止。确定返回吗？')) return;
        stopBatchTimer();
    }
    document.getElementById('batchFullscreen').classList.remove('show');
}

function renderBatchConfig() {
    const selectedCases = getCurrentCases().filter(c => selectedCaseIds.has(c.id));
    const current = getCurrentBusiness();
    const docTypes = getCurrentDocTypes();
    const templates = getDocTypeTemplates(batchState.docType);
    const container = document.getElementById('batchFsContainer');
    const docTypeOptions = Object.entries(docTypes)
        .map(([k, v]) => '<option value="' + k + '" ' + (k === batchState.docType ? 'selected' : '') + '>' + v.name + '</option>')
        .join('');
    // v1.24: 模板按来源分组（标准 / 我的）
    const stdOpts = [], myOpts = [];
    Object.entries(templates).forEach(([k, v]) => {
        const name = getTemplateName(v);
        const opt = '<option value="' + k + '" ' + (k === batchState.template ? 'selected' : '') + '>' + name + '</option>';
        if (v && v.source === 'mine') myOpts.push(opt); else stdOpts.push(opt);
    });
    let batchTemplateSelectHtml;
    if (stdOpts.length && myOpts.length) {
        batchTemplateSelectHtml = '<optgroup label="标准模板">' + stdOpts.join('') + '</optgroup><optgroup label="我的模板">' + myOpts.join('') + '</optgroup>';
    } else if (stdOpts.length) {
        batchTemplateSelectHtml = stdOpts.join('');
    } else if (myOpts.length) {
        batchTemplateSelectHtml = '<optgroup label="我的模板">' + myOpts.join('') + '</optgroup>';
    } else {
        batchTemplateSelectHtml = '<option value="">暂无可用模板</option>';
    }
    const labels = current.partiesLabels;

    // 解析预检：扫描选中案件的 解析异常
    const ocrWarningCases = selectedCases.filter(c => c.files && c.files.some(f => f.ocrStatus === 'error'));
    const hasOcrWarning = ocrWarningCases.length > 0;
    const ocrWarningHtml = hasOcrWarning ? `
        <div class="batch-ocr-warning" style="margin:0 0 16px;padding:14px 16px;background:#fefce8;border:1px solid #fde68a;border-radius:10px;">
            <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:10px;">
                <i class="fas fa-exclamation-triangle" style="color:#d97706;margin-top:2px;"></i>
                <div style="flex:1;">
                    <div style="font-size:13px;font-weight:600;color:#92400e;margin-bottom:4px;">${ocrWarningCases.length} 个案件存在 解析失败的材料</div>
                    <div style="font-size:12px;color:#a16207;line-height:1.5;">${ocrWarningCases.map(c => c.caseName || c.caseNumber).join('、')}</div>
                </div>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
                <button class="batch-ocr-btn ${batchState.ocrStrategy === 'skip' ? 'active' : ''}" onclick="setOcrStrategy('skip')" style="padding:6px 14px;border-radius:6px;font-size:12px;font-weight:500;cursor:pointer;border:1px solid ${batchState.ocrStrategy === 'skip' ? '#d97706' : '#e2e8f0'};background:${batchState.ocrStrategy === 'skip' ? '#fef3c7' : '#fff'};color:${batchState.ocrStrategy === 'skip' ? '#92400e' : '#64748b'};">
                    <i class="fas fa-forward"></i> 跳过异常案件
                </button>
                <button class="batch-ocr-btn ${batchState.ocrStrategy === 'partial' ? 'active' : ''}" onclick="setOcrStrategy('partial')" style="padding:6px 14px;border-radius:6px;font-size:12px;font-weight:500;cursor:pointer;border:1px solid ${batchState.ocrStrategy === 'partial' ? '#d97706' : '#e2e8f0'};background:${batchState.ocrStrategy === 'partial' ? '#fef3c7' : '#fff'};color:${batchState.ocrStrategy === 'partial' ? '#92400e' : '#64748b'};">
                    <i class="fas fa-file-alt"></i> 仅用已识别材料生成
                </button>
            </div>
        </div>
    ` : '';
    
    container.innerHTML = `
        <div class="batch-fs-section">
            <div class="batch-fs-section-title"><i class="fas fa-tasks"></i> 已选案件清单（${selectedCases.length}）</div>
            <div class="batch-selected-list" id="batchSelectedList">
                ${selectedCases.map(c => {
                    const hasOcrError = c.files && c.files.some(f => f.ocrStatus === 'error');
                    return `
                    <div class="batch-selected-item" data-case-id="${c.id}">
                        <div class="info">
                            <div class="case-no">${c.caseName || c.caseNumber}${hasOcrError ? ' <span style="display:inline-block;padding:1px 6px;background:#fef3c7;color:#92400e;border-radius:4px;font-size:11px;font-weight:500;margin-left:6px;">解析异常</span>' : ''}</div>
                            <div class="case-meta">${c.caseNumber} · ${c.cause}</div>
                        </div>
                        <button class="batch-remove-btn" onclick="removeBatchCase('${c.id}')" title="移除">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    `;
                }).join('')}
            </div>
        </div>

        ${ocrWarningHtml}

        <div class="batch-fs-section">
            <div class="batch-fs-section-title"><i class="fas fa-cog"></i> 批量生成配置</div>
            <div class="batch-fs-config">
                <div>
                    <label class="drawer-form-label">文书类型</label>
                    <select class="drawer-form-select" onchange="onBatchDocTypeChange(this.value)">
                        ${docTypeOptions}
                    </select>
                </div>
                <div>
                    <label class="drawer-form-label">文书模板</label>
                    <select class="drawer-form-select" id="batchTemplate" onchange="batchState.template=this.value">
                        ${batchTemplateSelectHtml}
                    </select>
                </div>
                <div class="batch-mode-info">
                    <i class="fas fa-info-circle"></i>
                    <span>系统将根据单个案件全部材料的预估 Token 数自动选择生成方式：未超过当前模型上下文限制时使用材料生成；超过限制时将自动跳过该案并记录失败原因，您可在批量任务结束后进入案件详情页单独处理。</span>
                </div>
                <div class="full">
                    <label class="drawer-form-label">提示词</label>
                    <div id="batchReqTemplates" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;"></div>
                    <textarea class="drawer-form-textarea" id="batchRequirement"
                              placeholder="可选：描述特殊要求或关注点，帮助 AI 更好理解需求"
                              onchange="batchState.requirement=this.value"></textarea>
                </div>
            </div>
        </div>

        <button class="batch-fs-start-btn" id="batchStartBtn" onclick="startBatchExec()" ${selectedCases.length === 0 ? 'disabled' : ''}>
            <i class="fas fa-rocket"></i> 开始批量生成（后台执行）
        </button>

        <div style="margin-top:16px;padding:14px;background:#fff7ed;border-radius:10px;font-size:12px;color:#9a3412;line-height:1.65;">
            <i class="fas fa-info-circle"></i> 批量任务将串行执行，您可以等待完成或返回案件列表处理其他事务。完成后可统一下载。
        </div>
    `;

    // 渲染提示词内置模板标签
    renderReqTemplates('batchReqTemplates', batchState.docType, 'batchRequirement');
}

function onBatchDocTypeChange(docType) {
    batchState.docType = docType;
    batchState.template = getFirstTemplate(docType);
    batchState.requirement = '';  // 切换文书类型时清空提示词
    renderBatchConfig();
}

function removeBatchCase(caseId) {
    selectedCaseIds.delete(caseId);
    const cb = document.querySelector('#caseListBody .case-checkbox[value="' + caseId + '"]');
    if (cb) cb.checked = false;
    updateSelectionUI();
    if (selectedCaseIds.size === 0) {
        document.getElementById('batchFsContainer').innerHTML = `
            <div class="batch-empty-tip">
                <i class="fas fa-inbox"></i>
                <div style="font-size:16px;font-weight:500;margin-bottom:6px;color:var(--text-secondary);">没有已选案件</div>
                <div style="font-size:13px;">请返回案件列表勾选案件后再进行批量生成</div>
            </div>
        `;
        const startBtn = document.getElementById('batchStartBtn');
        if (startBtn) startBtn.disabled = true;
    } else {
        renderBatchConfig();
    }
}

function startBatchExec() {
    if (!batchState.docType) {
        showNotification('请选择文书类型', 'warning');
        return;
    }
    if (selectedCaseIds.size === 0) return;
    const selectedArr = Array.from(selectedCaseIds);
    batchState.results = selectedArr.map(caseId => ({ caseId, status: 'pending', duration: 0, wordCount: 0 }));
    batchState.completedCount = 0;
    batchState.failedCount = 0;
    batchState.totalElapsed = 0;
    
    renderBatchRunning();
    startBatchTimer();
    runBatch();
}

function renderBatchRunning() {
    const container = document.getElementById('batchFsContainer');
    container.innerHTML = `
        <div class="batch-running-header">
            <div class="batch-running-left">
                <div class="batch-running-icon"><i class="fas fa-cogs"></i></div>
                <div class="batch-running-info">
                    <h3>批量生成进行中...</h3>
                    <p id="batchProgressText">正在处理 0/${batchState.results.length} 个案件</p>
                </div>
            </div>
            <div class="batch-running-right">
                <div class="batch-running-time" id="batchElapsedTime">00:00</div>
                <div class="batch-running-label">已用时</div>
            </div>
        </div>
        <div class="batch-queue" id="batchQueueList">
            ${batchState.results.map((r, i) => renderBatchItem(r, i)).join('')}
        </div>
    `;
}

function renderBatchItem(result, idx) {
    const statusMap = {
        done: { cls: 'done', icon: '✓', text: '已完成', actionCls: 'done' },
        failed: { cls: 'failed', icon: '!', text: '生成失败', actionCls: 'failed' },
        current: { cls: 'current', icon: '<i class="fas fa-spinner"></i>', text: '生成中...', actionCls: 'current' },
        pending: { cls: 'pending', icon: (idx + 1), text: '排队等待', actionCls: '' }
    };
    const s = statusMap[result.status] || statusMap.pending;
    const c = getCurrentCases().find(x => x.id === result.caseId);
    const reasonBtn = result.status === 'failed' && result.failReason
        ? ' <button class="batch-reason-btn" onclick="showBatchFailReason(' + idx + ')" title="查看原因"><i class="fas fa-eye"></i></button>'
        : '';
    return '<div class="batch-queue-item ' + s.cls + '">\n        <div class="batch-queue-icon">' + s.icon + '</div>\n        <div class="batch-queue-info">\n            <div class="batch-queue-name">' + (c ? (c.caseName || c.caseNumber) : '未知案件') + '</div>\n            <div class="batch-queue-detail">' + (c ? c.caseNumber + ' · ' + c.cause : '') + '</div>\n        </div>\n        <div class="batch-queue-right">\n            <span class="batch-queue-time">' + (result.duration || '-') + 's</span>\n            <span class="batch-queue-action ' + s.actionCls + '">' + s.text + '</span>' + reasonBtn + '\n        </div>\n    </div>';
}

function updateBatchRunningUI() {
    const listEl = document.getElementById('batchQueueList');
    if (listEl) listEl.innerHTML = batchState.results.map((r, i) => renderBatchItem(r, i)).join('');
    const progressEl = document.getElementById('batchProgressText');
    if (progressEl) progressEl.textContent = '正在处理 ' + (batchState.completedCount + batchState.failedCount) + '/' + batchState.results.length + ' 个案件';
}

function setOcrStrategy(strategy) {
    batchState.ocrStrategy = strategy;
    renderBatchConfig();
}

function getBatchFailReason(caseItem) {
    if (!caseItem.files || caseItem.files.length === 0) {
        return '案件无材料，无法生成文书';
    }
    const hasOcrError = caseItem.files.some(f => f.ocrStatus === 'error');
    if (hasOcrError) {
        if (batchState.ocrStrategy === 'skip') {
            return '跳过：存在解析失败的材料';
        }
        // partial 模式：不阻断，仅用已识别材料生成
    }
    if (Math.random() < 0.1) {
        return '生成服务响应超时，请稍后重试';
    }
    return '';
}

async function runBatch() {
    const modelId = getCurrentModelId();
    const safeLimit = getSafeContextLimit(modelId);

    for (let i = 0; i < batchState.results.length; i++) {
        const r = batchState.results[i];
        // 跳过已完成的项（重试失败案件时不重复生成已成功的）
        if (r.status === 'done') continue;
        r.status = 'current';
        updateBatchRunningUI();

        const c = getCurrentCases().find(x => x.id === r.caseId);
        const failReason = c ? getBatchFailReason(c) : '案件不存在';

        if (failReason) {
            r.status = 'failed';
            r.failReason = failReason;
            r.duration = 0;
            r.wordCount = 0;
            batchState.failedCount++;
            updateBatchRunningUI();
            await new Promise(res => setTimeout(res, 200));
            continue;
        }

        const totalTokens = getAllMaterialsTokens(c);
        if (totalTokens > safeLimit) {
            // C 方案：超限自动跳过并记录失败原因，不再弹窗选择
            r.status = 'failed';
            r.failReason = `案件材料超过当前模型上下文限制（预估 ${formatNumber(totalTokens)} / 上限 ${formatNumber(safeLimit)} tokens），请进入案件详情页使用分步生成`;
            r.duration = 0;
            r.wordCount = 0;
            batchState.failedCount++;
            updateBatchRunningUI();
            await new Promise(res => setTimeout(res, 200));
            continue;
        }

        const mode = 'material';
        const baseTime = 800;
        const variance = Math.random() * 600;
        await new Promise(res => setTimeout(res, baseTime + variance));

        r.status = 'done';
        r.duration = Math.round((baseTime + variance) / 100 * 10) / 10;
        r.wordCount = Math.round(2000 + Math.random() * 3000);
        r.genMode = mode;
        batchState.completedCount++;

        updateBatchRunningUI();
        await new Promise(res => setTimeout(res, 200));
    }
    stopBatchTimer();
    renderBatchDone();
}

function retryBatchFailed() {
    const failedResults = batchState.results.filter(r => r.status === 'failed');
    if (failedResults.length === 0) {
        showNotification('没有失败的案件可重试', 'info');
        return;
    }
    // 重置失败项状态
    failedResults.forEach(r => {
        r.status = 'pending';
        r.failReason = '';
        r.wordCount = 0;
    });
    batchState.completedCount = batchState.results.filter(r => r.status === 'done').length;
    batchState.failedCount = 0;
    batchState.totalElapsed = 0;

    renderBatchRunning();
    startBatchTimer();
    runBatch();
}

function showBatchFailReason(idx) {
    const r = batchState.results[idx];
    if (!r || !r.failReason) return;
    const c = getCurrentCases().find(x => x.id === r.caseId);
    const name = c ? (c.caseName || c.caseNumber || '未知案件') : '未知案件';
    alert('「' + name + '」生成失败\n\n原因：' + r.failReason);
}

// 失败项「去处理」按钮：新标签页打开案件详情页
function goHandleCase(caseId) {
    if (!caseId) return;
    const url = 'case-files.html?caseId=' + encodeURIComponent(caseId);
    const win = window.open(url, '_blank');
    if (!win) {
        showNotification('浏览器拦截了新窗口，请允许弹出窗口后重试', 'info');
    }
}

function startBatchTimer() {
    stopBatchTimer();
    batchState.timerInterval = setInterval(() => {
        batchState.totalElapsed++;
        const el = document.getElementById('batchElapsedTime');
        if (el) el.textContent = formatBatchTime(batchState.totalElapsed);
    }, 1000);
}

function stopBatchTimer() {
    if (batchState.timerInterval) {
        clearInterval(batchState.timerInterval);
        batchState.timerInterval = null;
    }
}

function formatBatchTime(s) {
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    return m + ':' + sec;
}

function renderBatchDone() {
    const totalTime = formatBatchTime(batchState.totalElapsed);
    const totalWords = batchState.results.reduce((sum, r) => sum + r.wordCount, 0);
    const container = document.getElementById('batchFsContainer');

    // 记录批量生成历史任务
    const templates = getCurrentTemplates();
    const typeName = (getCurrentDocTypes()[batchState.docType] || {}).name || '';
    const templateName = getTemplateName(templates[batchState.template]);
    const baseTitle = templateName ? `${typeName} · ${templateName}` : typeName;
    addHistoryTask({
        type: 'batch',
        caseId: '',
        caseName: `批量生成 ${batchState.results.length} 个案件`,
        docId: '',
        docTitle: `${baseTitle} · 成功 ${batchState.completedCount} 个 · 共 ${totalWords.toLocaleString()} 字`
    });
    
    const resultsHtml = batchState.results.map((r, i) => {
        const c = getCurrentCases().find(x => x.id === r.caseId);
        const isFailed = r.status === 'failed';
        const reasonBtn = isFailed
            ? ' <button class="batch-reason-btn" onclick="showBatchFailReason(' + i + ')" title="查看原因"><i class="fas fa-eye"></i></button>'
            : '';
        // 失败项额外提供「去处理」按钮，跳转案件详情页单独处理
        const handleBtn = isFailed
            ? ' <button class="batch-handle-btn" onclick="goHandleCase(\'' + r.caseId + '\')" title="进入案件详情页处理"><i class="fas fa-arrow-right"></i> 去处理</button>'
            : '';
        const rightText = isFailed
            ? '<span style="color:#dc2626;">' + (r.failReason || '生成失败') + '</span>' + reasonBtn + handleBtn
            : '<span style="color:#059669;">' + r.wordCount.toLocaleString() + '字 · ' + r.duration + 's</span>';
        return '<div class="batch-result-item ' + (isFailed ? 'failed' : '') + '">\n            <span><strong>' + (i + 1) + '. ' + (c ? (c.caseName || c.caseNumber) : '未知案件') + '</strong> (' + (c ? c.caseNumber : '') + ')</span>\n            ' + rightText + '\n        </div>';
    }).join('');

    const retryBtn = batchState.failedCount > 0
        ? `<button class="batch-btn-action outline" onclick="retryBatchFailed()"><i class="fas fa-redo"></i> 重试失败的（${batchState.failedCount}）</button>`
        : '';

    container.innerHTML = `
        <div class="batch-done-section">
            <div class="batch-done-icon"><i class="fas fa-check-double"></i></div>
            <div class="batch-done-title">批量生成全部完成！</div>
            <div class="batch-done-desc">共处理 <strong>${batchState.results.length}</strong> 个案件，<strong>${batchState.completedCount}</strong> 个成功，<strong>${batchState.failedCount}</strong> 个失败。</div>

            <div class="batch-done-stats">
                <div class="batch-done-stat"><div class="val">${batchState.results.length}</div><div class="lbl">案件总数</div></div>
                <div class="batch-done-stat"><div class="val">${batchState.completedCount}</div><div class="lbl">成功数量</div></div>
                <div class="batch-done-stat"><div class="val">${totalWords.toLocaleString()}</div><div class="lbl">总字数</div></div>
                <div class="batch-done-stat"><div class="val">${totalTime}</div><div class="lbl">总耗时</div></div>
            </div>

            <div class="batch-done-actions">
                <button class="batch-btn-action download" onclick="downloadAllBatch()"><i class="fas fa-download"></i> 一键打包下载</button>
                ${retryBtn}
                <button class="batch-btn-action outline" onclick="newBatchTask()"><i class="fas fa-plus"></i> 新建批量任务</button>
                <button class="batch-btn-action outline" onclick="closeBatchFullscreen()"><i class="fas fa-arrow-left"></i> 返回案件列表</button>
            </div>

            <div class="batch-result-list">
                <h4><i class="fas fa-list-alt"></i> 生成结果明细</h4>
                ${resultsHtml}
            </div>
        </div>
    `;
}

function downloadAllBatch() {
    showNotification('批量下载：共 ' + batchState.completedCount + ' 个文书将打包为 ZIP（原型演示）', 'success');
}

function newBatchTask() {
    clearSelection();
    document.getElementById('batchFsContainer').innerHTML = `
        <div class="batch-empty-tip">
            <i class="fas fa-inbox"></i>
            <div style="font-size:16px;font-weight:500;margin-bottom:6px;color:var(--text-secondary);">请返回案件列表勾选案件</div>
            <div style="font-size:13px;">勾选案件后再次点击「批量生成」</div>
        </div>
    `;
    document.getElementById('batchFullscreen').classList.remove('show');
}

function showBatchHelp() {
    alert('批量生成模式使用指南\n====================\n• 同时处理多个案件的文书生成\n• AI 在后台逐个执行，可离开处理其他事务\n• 适合类型化案件批量处理 / 制式文书批量生产\n\n操作步骤：\n1. 在案件列表勾选要处理的案件\n2. 点击顶部「批量生成」按钮进入全屏面板\n3. 配置文书模板和生成模式\n4. 点击「开始批量生成」\n5. 等待完成，一键打包下载\n\n如需对单个案件快速生成，请点击列表行的 ⚡ 按钮。');
}

// ===== 新建案件弹窗 =====
let uploadedFiles = [];

function openCreateCaseDialog() {
    const current = getCurrentBusiness();
    const labels = current.partiesLabels;

    document.getElementById('createPartyALabel').textContent = labels[0];
    document.getElementById('createPartyBLabel').textContent = labels[1];

    document.getElementById('createCaseCauseHidden').value = '';
    document.getElementById('createCaseCauseText').textContent = '请选择案由（选填）';
    document.getElementById('createCaseCauseText').classList.add('placeholder');

    const caseWordSelect = document.getElementById('createCaseWord');
    const caseWords = caseWordListByOrg[currentBusiness] || [];
    caseWordSelect.innerHTML = '<option value="">请选择案字（选填）</option>' +
        caseWords.map(w => `<option value="${w}">${w}</option>`).join('');
    caseWordSelect.value = '';

    document.getElementById('createCaseName').value = '';
    document.getElementById('createCaseNumber').value = '';
    document.getElementById('createPartyA').value = '';
    document.getElementById('createPartyB').value = '';
    document.getElementById('createHandler').value = getCurrentUserName();
    document.getElementById('createCaseDate').value = new Date().toISOString().split('T')[0];

    uploadedFiles = [];
    document.getElementById('uploadFileList').innerHTML = '';
    document.getElementById('createCaseFile').value = '';

    // 默认收起选填结构化信息区域
    collapseOptionalFields();

    document.getElementById('createCaseOverlay').classList.add('show');
    document.getElementById('createCaseDialog').classList.add('show');
}

function closeCreateCaseDialog() {
    document.getElementById('createCaseOverlay').classList.remove('show');
    document.getElementById('createCaseDialog').classList.remove('show');
}

function toggleOptionalFields() {
    const toggle = document.getElementById('optionalFieldsToggle');
    const content = document.getElementById('optionalFieldsContent');
    if (!toggle || !content) return;

    const isExpanded = toggle.classList.contains('expanded');
    if (isExpanded) {
        toggle.classList.remove('expanded');
        content.classList.remove('expanded');
    } else {
        toggle.classList.add('expanded');
        content.classList.add('expanded');
    }
}

function collapseOptionalFields() {
    const toggle = document.getElementById('optionalFieldsToggle');
    const content = document.getElementById('optionalFieldsContent');
    if (toggle) toggle.classList.remove('expanded');
    if (content) content.classList.remove('expanded');
}

function handleFileUpload(input) {
    const files = Array.from(input.files);
    if (files.length === 0) return;

    const validExts = ['.zip', '.rar', '.pdf', '.doc', '.docx'];
    let addedCount = 0;

    files.forEach(file => {
        const ext = '.' + file.name.split('.').pop().toLowerCase();
        if (!validExts.includes(ext)) {
            showNotification(`${file.name} 格式不支持，请上传 .zip / .rar / .pdf / .doc / .docx 文件`, 'error');
            return;
        }
        if (file.size > 100 * 1024 * 1024) {
            showNotification(`${file.name} 超过 100MB 限制`, 'error');
            return;
        }
        uploadedFiles.push({ name: file.name, size: file.size });
        addedCount++;
    });

    if (addedCount > 0) {
        renderFileList();
        // 如果案件名称为空，自动取第一个文件的文件名（去掉扩展名）
        const nameInput = document.getElementById('createCaseName');
        if (!nameInput.value.trim() && uploadedFiles.length > 0) {
            const firstName = uploadedFiles[0].name;
            const dotIndex = firstName.lastIndexOf('.');
            nameInput.value = dotIndex > 0 ? firstName.substring(0, dotIndex) : firstName;
        }
    }
    input.value = '';
}

function renderFileList() {
    const listEl = document.getElementById('uploadFileList');
    listEl.innerHTML = uploadedFiles.map((f, i) => {
        const sizeStr = f.size < 1024 * 1024 ? (f.size / 1024).toFixed(1) + ' KB' : (f.size / 1024 / 1024).toFixed(1) + ' MB';
        return `
            <div class="upload-file-item">
                <i class="fas fa-file-archive"></i>
                <span class="upload-file-name">${f.name}</span>
                <span class="upload-file-size">${sizeStr}</span>
                <button class="upload-file-remove" onclick="removeUploadedFile(${i})"><i class="fas fa-times"></i></button>
            </div>
        `;
    }).join('');
}

function removeUploadedFile(index) {
    uploadedFiles.splice(index, 1);
    renderFileList();
}

function submitCreateCase() {
    const caseName = document.getElementById('createCaseName').value.trim();
    const caseNumber = document.getElementById('createCaseNumber').value.trim();
    const caseWord = document.getElementById('createCaseWord').value;
    const cause = document.getElementById('createCaseCauseHidden').value;
    const partyA = document.getElementById('createPartyA').value.trim();
    const partyB = document.getElementById('createPartyB').value.trim();
    const handler = document.getElementById('createHandler').value.trim();
    const date = document.getElementById('createCaseDate').value;
    const type = getCauseType(cause) || 'contract';
    
    if (!caseName) {
        showNotification('请填写案件名称', 'error');
        return;
    }
    
    const now = new Date().toISOString().split('T')[0];
    const currentUser = getCurrentUserName();
    const newCase = {
        id: 'newcase_' + Date.now(),
        caseName: caseName,
        caseNumber: caseNumber || '',
        caseWord: caseWord || '',
        cause: cause || '',
        type: type,
        partyA: partyA || '',
        partyB: partyB || '',
        handler: handler || currentUser,
        createdBy: currentUser,
        status: 'pending',
        date: date || now,
        fileCount: uploadedFiles.length,
        updatedAt: now,
        filesInitialized: true,
        files: uploadedFiles.map((f, i) => ({
            id: `newcase_${Date.now()}_file_${i + 1}`,
            name: f.name,
            size: f.size,
            estimatedTokens: estimateFileTokens(f),
            updatedAt: now,
            ocrStatus: 'done'
        })),
        documents: []
    };
    
    getCurrentBusiness().cases.unshift(newCase);
    saveBusinessSystems();
    renderCaseList();
    closeCreateCaseDialog();
    
    const fileMsg = uploadedFiles.length > 0 ? `，已上传 ${uploadedFiles.length} 个案件包` : '';
    showNotification(`案件 "${caseName}" 已创建成功${fileMsg}`, 'success');
}

// ===== 补充上传弹窗 =====
let supplementCaseId = '';
let supplementFiles = [];

function openSupplementUpload(caseId) {
    supplementCaseId = caseId;
    const cases = getCurrentCases();
    const caseItem = cases.find(c => c.id === caseId);

    if (caseItem) {
        document.getElementById('supplementCaseName').textContent = caseItem.caseName || caseItem.caseNumber;
        document.getElementById('supplementFileCount').textContent = caseItem.fileCount || 0;
    }

    supplementFiles = [];
    document.getElementById('supplementFileList').innerHTML = '';
    document.getElementById('supplementFile').value = '';

    // 恢复上次使用的目标分类
    const categorySelect = document.getElementById('supplementCategorySelect');
    if (categorySelect) {
        const lastCategory = localStorage.getItem('last_supplement_category') || '其他材料';
        categorySelect.value = [...categorySelect.options].some(o => o.value === lastCategory) ? lastCategory : '其他材料';
    }

    document.getElementById('supplementOverlay').classList.add('show');
    document.getElementById('supplementDialog').classList.add('show');
}

function closeSupplementUpload() {
    document.getElementById('supplementOverlay').classList.remove('show');
    document.getElementById('supplementDialog').classList.remove('show');
}

function handleSupplementUpload(input) {
    const files = input.files;
    if (!files || files.length === 0) return;

    const validExts = ['.pdf', '.doc', '.docx'];
    const categorySelect = document.getElementById('supplementCategorySelect');
    const category = categorySelect ? categorySelect.value : '其他材料';
    let addedCount = 0;
    let invalidCount = 0;
    let oversizedCount = 0;

    for (const file of files) {
        const ext = '.' + file.name.split('.').pop().toLowerCase();
        if (!validExts.includes(ext)) {
            invalidCount++;
            continue;
        }
        if (file.size > 100 * 1024 * 1024) {
            oversizedCount++;
            continue;
        }
        supplementFiles.push({ name: file.name, size: file.size, category });
        addedCount++;
    }

    if (invalidCount > 0) {
        showNotification(`有 ${invalidCount} 个文件格式不支持，补充上传仅支持 .pdf / .doc / .docx 文件`, 'warning');
    }
    if (oversizedCount > 0) {
        showNotification(`有 ${oversizedCount} 个文件超过 100MB 限制`, 'warning');
    }
    if (addedCount > 0) {
        renderSupplementFileList();
    }
    input.value = '';
}

function renderSupplementFileList() {
    const listEl = document.getElementById('supplementFileList');
    listEl.innerHTML = supplementFiles.map((f, i) => {
        const sizeStr = f.size < 1024 * 1024 ? (f.size / 1024).toFixed(1) + ' KB' : (f.size / 1024 / 1024).toFixed(1) + ' MB';
        return `
            <div class="upload-file-item">
                <i class="fas fa-file-archive"></i>
                <span class="upload-file-name">${f.name}</span>
                <span style="display:inline-flex;align-items:center;padding:2px 8px;border-radius:4px;background:#e0f2fe;color:#0369a1;font-size:11px;white-space:nowrap;margin-right:8px;">${f.category || '其他材料'}</span>
                <span class="upload-file-size">${sizeStr}</span>
                <button class="upload-file-remove" onclick="removeSupplementFile(${i})"><i class="fas fa-times"></i></button>
            </div>
        `;
    }).join('');
}

function removeSupplementFile(index) {
    supplementFiles.splice(index, 1);
    renderSupplementFileList();
}

function submitSupplementUpload() {
    if (supplementFiles.length === 0) {
        closeSupplementUpload();
        return;
    }

    const cases = getCurrentCases();
    const caseItem = cases.find(c => c.id === supplementCaseId);
    if (caseItem) {
        if (!caseItem.files) caseItem.files = [];

        supplementFiles.forEach(f => {
            const fileObj = {
                id: `${caseItem.id}_file_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                name: f.name,
                size: f.size,
                estimatedTokens: estimateFileTokens(f),
                category: f.category || '其他材料',
                updatedAt: new Date().toISOString().split('T')[0],
                ocrStatus: 'pending'
            };

            // 插入到同类材料的最后，保持分类聚集
            const targetCategory = fileObj.category;
            let insertIndex = caseItem.files.length;
            for (let i = caseItem.files.length - 1; i >= 0; i--) {
                if ((caseItem.files[i].category || '其他材料') === targetCategory) {
                    insertIndex = i + 1;
                    break;
                }
            }
            caseItem.files.splice(insertIndex, 0, fileObj);
        });

        caseItem.fileCount = caseItem.files.length;
        caseItem.updatedAt = new Date().toISOString().split('T')[0];

        // 记忆本次使用的分类
        const lastCategory = supplementFiles[supplementFiles.length - 1].category;
        if (lastCategory) {
            localStorage.setItem('last_supplement_category', lastCategory);
        }
    }

    saveBusinessSystems();
    renderCaseList();
    closeSupplementUpload();
    showNotification(`成功上传 ${supplementFiles.length} 个文件`, 'success');
}

// ===== 通用工具函数 =====
function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

function formatDate(dateStr) {
    return dateStr || '-';
}

// ===== 案件文件管理（新标签页） =====
function openCaseFiles(caseId) {
    const url = `case-files.html?caseId=${encodeURIComponent(caseId)}`;
    const win = window.open(url, '_blank');
    if (!win) {
        showNotification('浏览器弹窗被拦截，请允许弹窗后重试', 'error');
    }
}

// ===== 解析 / 文书 / 同步弹窗占位函数（避免未实现功能报运行时错误） =====
let ocrPanelCaseId = '';
let ocrCurrentTab = 'done';

function openOcrPanel(caseId) {
    const c = getCurrentCases().find(x => x.id === caseId);
    if (!c) return;
    ocrPanelCaseId = caseId;
    document.getElementById('ocrCaseName').textContent = c.caseName || c.caseNumber || '案件';
    renderOcrList('done');
    document.getElementById('ocrDialog').classList.add('show');
    document.getElementById('ocrOverlay').classList.add('show');
}

function closeOcrPanel() {
    document.getElementById('ocrDialog').classList.remove('show');
    document.getElementById('ocrOverlay').classList.remove('show');
    ocrPanelCaseId = '';
}

function renderOcrList(tab) {
    const c = getCurrentCases().find(x => x.id === ocrPanelCaseId);
    if (!c) return;
    const files = c.files || [];
    const doneFiles = files.filter(f => f.ocrStatus === 'done');
    const pendingFiles = files.filter(f => f.ocrStatus !== 'done');

    document.getElementById('ocrDoneCount').textContent = doneFiles.length;
    document.getElementById('ocrPendingCount').textContent = pendingFiles.length;

    const listEl = document.getElementById('ocrList');
    const displayFiles = tab === 'done' ? doneFiles : pendingFiles;

    if (displayFiles.length === 0) {
        listEl.innerHTML = `<div class="empty-state" style="padding:40px 20px;"><div class="empty-title">${tab === 'done' ? '暂无已完成解析的文件' : '暂无未完成解析的文件'}</div></div>`;
    } else {
        listEl.innerHTML = displayFiles.map(f => {
            const statusClass = f.ocrStatus === 'done' ? 'done' : (f.ocrStatus === 'error' ? 'error' : 'pending');
            const statusText = f.ocrStatus === 'done' ? '解析完成' : (f.ocrStatus === 'error' ? '解析失败' : '解析中');
            const statusIcon = f.ocrStatus === 'done' ? 'fa-check-circle' : (f.ocrStatus === 'error' ? 'fa-exclamation-circle' : 'fa-clock');
            return `
                <div class="ocr-item">
                    <div class="ocr-item-info">
                        <div class="ocr-item-name" onclick="startEditFileName('${f.id}', this)" title="点击编辑文件名">${f.name}</div>
                        <div class="ocr-item-meta">${formatFileSize(f.size)} · ${f.updatedAt || '-'}</div>
                    </div>
                    <div class="ocr-actions">
                        <span class="ocr-status ${statusClass}"><i class="fas ${statusIcon}"></i> ${statusText}</span>
                        ${f.ocrStatus !== 'done' ? `<button class="btn btn-secondary" onclick="retryOcr('${f.id}')">重新解析</button>` : ''}
                    </div>
                </div>
            `;
        }).join('');
    }

    const retryBtn = document.getElementById('ocrRetryAllBtn');
    if (retryBtn) retryBtn.style.display = (tab === 'pending' && pendingFiles.length > 0) ? 'inline-flex' : 'none';
    // 记录当前 tab
    ocrCurrentTab = tab;
}

function switchOcrTab(tab) {
    document.getElementById('ocrTabDone').classList.toggle('active', tab === 'done');
    document.getElementById('ocrTabPending').classList.toggle('active', tab === 'pending');
    renderOcrList(tab);
}

function startEditFileName(fileId, el) {
    const c = getCurrentCases().find(x => x.id === ocrPanelCaseId);
    if (!c || !c.files) return;
    const f = c.files.find(x => x.id === fileId);
    if (!f) return;
    const oldName = f.name;
    el.outerHTML = `<input class="ocr-edit-name" value="${oldName.replace(/"/g, '&quot;')}" 
        onblur="saveFileName('${fileId}', this)" onkeydown="if(event.key==='Enter')this.blur();if(event.key==='Escape'){this.value=this.defaultValue;this.blur();}" 
        style="font-size:14px;font-weight:500;color:var(--text-primary);border:1px solid var(--accent-primary);border-radius:4px;padding:2px 6px;outline:none;width:100%;background:var(--bg-primary);">`;
    const input = document.querySelector('.ocr-edit-name');
    if (input) {
        // 选中文件名（不含扩展名）
        const dotIdx = oldName.lastIndexOf('.');
        if (dotIdx > 0) input.setSelectionRange(0, dotIdx);
        else input.select();
        input.focus();
    }
}

function saveFileName(fileId, input) {
    const newName = input.value.trim();
    const c = getCurrentCases().find(x => x.id === ocrPanelCaseId);
    if (!c || !c.files) return;
    const f = c.files.find(x => x.id === fileId);
    if (!f) return;
    if (newName && newName !== f.name) {
        f.name = newName;
        showNotification('文件名已更新', 'success');
    }
    renderOcrList(ocrCurrentTab);
}

function retryAllOcr() {
    const c = getCurrentCases().find(x => x.id === ocrPanelCaseId);
    if (!c || !c.files) return;
    c.files.forEach(f => {
        if (f.ocrStatus !== 'done') f.ocrStatus = 'pending';
    });
    renderOcrList('pending');
    renderCaseList();
    showNotification('已重新提交解析任务', 'success');
}

function retryOcr(fileId) {
    const c = getCurrentCases().find(x => x.id === ocrPanelCaseId);
    if (!c || !c.files) return;
    const f = c.files.find(x => x.id === fileId);
    if (f) {
        f.ocrStatus = 'pending';
        renderOcrList('pending');
        renderCaseList();
        showNotification('已重新提交该文件解析任务', 'success');
    }
}

function formatFileSize(bytes) {
    if (!bytes) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function previewCaseFile(fileId) {
    showNotification('文件预览功能正在开发中', 'info');
}

function openCaseDocuments(caseId) {
    documentsCaseId = caseId;
    const c = getCurrentCases().find(x => x.id === caseId);
    if (!c) return;
    document.getElementById('documentsCaseName').textContent = c.caseName || c.caseNumber || '案件';
    document.getElementById('documentsCount').textContent = (c.documents || []).length;
    renderDocumentsList();
    document.getElementById('documentsDialog').classList.add('show');
    document.getElementById('documentsOverlay').classList.add('show');
}

function closeCaseDocuments() {
    document.getElementById('documentsDialog').classList.remove('show');
    document.getElementById('documentsOverlay').classList.remove('show');
    documentsCaseId = '';
}

function renderDocumentsList() {
    const c = getCurrentCases().find(x => x.id === documentsCaseId);
    const list = document.getElementById('documentsList');
    if (!c || !list) return;
    const docs = c.documents || [];
    if (docs.length === 0) {
        list.innerHTML = '<div class="empty-state" style="padding:40px 20px;"><div class="empty-title">暂无文书</div></div>';
        return;
    }
    list.innerHTML = docs.map(d => {
        const hasRevised = (d.versions || []).some(v => v.type === 'revised');
        return `
        <div class="document-item">
            <div class="document-item-info">
                <div class="document-item-name">${d.title} ${hasRevised ? '<span class="version-badge">有修订稿</span>' : ''}</div>
                <div class="document-item-meta">${d.createdAt || '-'} ${hasRevised ? '· 已精修' : ''}</div>
            </div>
            <div class="document-actions">
                <button class="btn btn-secondary" onclick="previewCaseDocument('${d.id}')">预览</button>
                <button class="btn btn-secondary" onclick="regenerateCaseDocument('${d.id}')">重新生成</button>
                <button class="btn btn-secondary" onclick="openRefineModal('${documentsCaseId}', '${d.id}')">文书精修</button>
                <button class="btn btn-secondary" onclick="downloadDocument('${d.id}')">下载</button>
                <button class="btn btn-danger" onclick="deleteDocument('${d.id}')">删除</button>
            </div>
        </div>
    `}).join('');
}

function openSyncDialog() {
    document.getElementById('syncDialog').classList.add('show');
    document.getElementById('syncOverlay').classList.add('show');
}

function closeSyncDialog() {
    document.getElementById('syncDialog').classList.remove('show');
    document.getElementById('syncOverlay').classList.remove('show');
}

function showSyncComingSoon() {
    showNotification('同步案件功能需与案件系统接口对接后方可开发，当前为预留入口', 'info', 5000);
}

function startSync() {
    const mode = document.querySelector('input[name="syncMode"]:checked')?.value || 'incremental';
    showNotification(`已开始${mode === 'incremental' ? '增量' : '全量'}同步（原型演示）`, 'success');
    closeSyncDialog();
}

function getCaseDocument(caseId, docId) {
    const result = findCaseById(caseId);
    if (!result) return null;
    const doc = (result.caseItem.documents || []).find(d => d.id === docId);
    return doc ? { org: result.org, caseItem: result.caseItem, doc } : null;
}

function previewCaseDocument(docId) {
    const res = getCaseDocument(documentsCaseId, docId);
    if (!res) return;
    openDocumentPreviewWindow(res.doc, documentsCaseId);
}

function regenerateCaseDocument(docId) {
    if (!confirm('确定重新生成该文书？将覆盖初稿，修订稿也会被清除。')) return;
    const res = getCaseDocument(documentsCaseId, docId);
    if (!res) return;
    const { caseItem, doc } = res;
    const current = getCurrentBusiness();
    const templateName = current.docTemplates[doc.template] || '法律文书';
    // 复用快速生成逻辑：临时设置 quickState，生成后覆盖原文书 versions
    quickState.caseId = documentsCaseId;
    quickState.template = doc.template;
    quickState.requirement = '';
    generateQuickDoc();
    if (quickState.document) {
        doc.title = quickState.document.title;
        doc.versions = quickState.document.versions;
        doc.wordCount = quickState.document.wordCount;
        doc.updatedAt = new Date().toISOString().split('T')[0];
        caseItem.updatedAt = doc.updatedAt;
        saveBusinessSystems();
        addHistoryTask({
            type: 'regenerate',
            caseId: caseItem.id,
            caseName: caseItem.caseName || caseItem.caseNumber,
            docId: doc.id,
            docTitle: doc.title
        });
        renderDocumentsList();
        document.getElementById('documentsCount').textContent = caseItem.documents.length;
        showNotification('文书已重新生成', 'success');
    }
}

function downloadDocument(docId) {
    const res = getCaseDocument(documentsCaseId, docId);
    if (!res) return;
    const { doc } = res;
    const content = getDocumentContent(doc);
    const blob = new Blob([doc.title + '\n\n' + stripHtml(content)], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = doc.title + '.doc';
    a.click();
    URL.revokeObjectURL(url);
}

function stripHtml(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
}

function deleteDocument(docId) {
    const cases = getCurrentCases();
    const caseItem = cases.find(c => c.id === documentsCaseId);
    if (!caseItem) return;
    
    if (!confirm('确定删除该文书？删除后不可恢复。')) return;
    caseItem.documents = caseItem.documents.filter(d => d.id !== docId);
    document.getElementById('documentsCount').textContent = caseItem.documents.length;
    renderDocumentsList();
    showNotification('文书已删除', 'success');
}

// ===== 编辑案件弹窗 =====
let editingCaseId = '';

function openEditCase(caseId) {
    editingCaseId = caseId;
    const cases = getCurrentCases();
    const caseItem = cases.find(c => c.id === caseId);
    if (!caseItem) return;
    
    const current = getCurrentBusiness();
    const labels = current.partiesLabels;
    document.getElementById('editPartyALabel').textContent = labels[0];
    document.getElementById('editPartyBLabel').textContent = labels[1];
    
    const causeText = document.getElementById('editCaseCauseText');
    const causeHidden = document.getElementById('editCaseCauseHidden');
    if (caseItem.cause) {
        causeHidden.value = caseItem.cause;
        causeText.textContent = caseItem.cause;
        causeText.classList.remove('placeholder');
    } else {
        causeHidden.value = '';
        causeText.textContent = '请选择案由';
        causeText.classList.add('placeholder');
    }
    
    document.getElementById('editCaseName').value = caseItem.caseName || '';
    document.getElementById('editCaseNumber').value = caseItem.caseNumber || '';
    
    const editCaseWordSelect = document.getElementById('editCaseWord');
    const editCaseWords = caseWordListByOrg[currentBusiness] || [];
    editCaseWordSelect.innerHTML = '<option value="">请选择案字</option>' +
        editCaseWords.map(w => `<option value="${w}">${w}</option>`).join('');
    editCaseWordSelect.value = caseItem.caseWord || '';
    
    document.getElementById('editPartyA').value = caseItem.partyA || '';
    document.getElementById('editPartyB').value = caseItem.partyB || '';
    document.getElementById('editHandler').value = caseItem.handler || '';
    document.getElementById('editCaseDate').value = caseItem.date || '';
    
    document.getElementById('editOverlay').classList.add('show');
    document.getElementById('editDialog').classList.add('show');
}

function closeEditCase() {
    document.getElementById('editOverlay').classList.remove('show');
    document.getElementById('editDialog').classList.remove('show');
    editingCaseId = '';
}

function submitEditCase() {
    const caseName = document.getElementById('editCaseName').value.trim();
    if (!caseName) {
        showNotification('请填写案件名称', 'error');
        return;
    }
    
    const cases = getCurrentCases();
    const caseItem = cases.find(c => c.id === editingCaseId);
    if (!caseItem) return;
    
    const cause = document.getElementById('editCaseCauseHidden').value;
    const type = getCauseType(cause) || caseItem.type;
    
    caseItem.caseName = caseName;
    caseItem.caseNumber = document.getElementById('editCaseNumber').value.trim();
    caseItem.caseWord = document.getElementById('editCaseWord').value || '';
    caseItem.cause = cause;
    caseItem.type = type;
    caseItem.partyA = document.getElementById('editPartyA').value.trim();
    caseItem.partyB = document.getElementById('editPartyB').value.trim();
    caseItem.handler = document.getElementById('editHandler').value.trim();
    caseItem.date = document.getElementById('editCaseDate').value || caseItem.date;
    caseItem.updatedAt = new Date().toISOString().split('T')[0];

    saveBusinessSystems();
    renderCaseList();
    closeEditCase();
    showNotification('案件信息已更新', 'success');
}

// ===== 案由树形选择器 =====
let causeSelectorTarget = null; // 'create' | 'edit'
let selectedCauseValue = '';

function openCauseSelector(target) {
    causeSelectorTarget = target;
    const currentValue = target === 'create'
        ? (document.getElementById('createCaseCauseHidden')?.value || '')
        : (document.getElementById('editCaseCauseHidden')?.value || '');
    selectedCauseValue = currentValue;
    
    document.getElementById('causeSearchInput').value = '';
    renderCauseTree();
    document.getElementById('causeSelectorModal').classList.add('show');
}

function closeCauseSelector(event) {
    if (event && event.target !== document.getElementById('causeSelectorModal')) return;
    document.getElementById('causeSelectorModal').classList.remove('show');
    causeSelectorTarget = null;
}

function getCurrentCauseTree() {
    return causeTreeDataByOrg[currentBusiness] || causeTreeDataByOrg.court;
}

function renderCauseTree() {
    const container = document.getElementById('causeTreeContainer');
    const tree = getCurrentCauseTree();
    container.innerHTML = tree.map((l1, i1) => {
        const l1Escaped = l1.name.replace(/'/g, "\\'");
        return `
        <div class="cause-level-1 ${l1.expanded ? 'expanded' : ''}" data-level="1" data-index="${i1}">
            <div class="cause-level-1-item">
                <div class="cause-level-1-header" data-cause="${l1.name}" data-level="1" data-index="${i1}">
                    <i class="fas fa-chevron-right cause-expand-icon" onclick="event.stopPropagation(); toggleCauseLevel1(${i1})"></i>
                    <span class="cause-level-1-name" onclick="event.stopPropagation(); selectCause('${l1Escaped}')">${l1.name}</span>
                </div>
            </div>
            <div class="cause-level-2-container">
                ${l1.children.map((l2, i2) => {
                    if (typeof l2 === 'string') {
                        return renderCauseItem(l2, `l1-${i1}`);
                    }
                    const l2Escaped = l2.name.replace(/'/g, "\\'");
                    return `
                    <div class="cause-level-2 ${l2.expanded ? 'expanded' : ''}" data-level="2" data-index="${i1}-${i2}">
                        <div class="cause-level-2-header" data-cause="${l2.name}" data-level="2" data-index="${i1}-${i2}">
                            <i class="fas fa-chevron-right cause-expand-icon" onclick="event.stopPropagation(); toggleCauseLevel2(${i1}, ${i2})"></i>
                            <span class="cause-level-2-name" onclick="event.stopPropagation(); selectCause('${l2Escaped}')">${l2.name}</span>
                        </div>
                        <div class="cause-level-3-container">
                            ${(l2.children || []).map(c => renderCauseItem(c, `l2-${i1}-${i2}`)).join('')}
                        </div>
                    </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
    }).join('');
    
    updateCauseSelection();
}

function renderCauseItem(causeName, groupKey) {
    return `
        <div class="cause-item ${selectedCauseValue === causeName ? 'selected' : ''}" data-cause="${causeName}" data-group="${groupKey}" onclick="selectCause('${causeName.replace(/'/g, "\\'")}')">
            <span class="cause-name">${causeName}</span>
            <i class="fas fa-check-circle cause-check"></i>
        </div>
    `;
}

function toggleCauseLevel1(index) {
    const tree = getCurrentCauseTree();
    tree[index].expanded = !tree[index].expanded;
    renderCauseTree();
}

function toggleCauseLevel2(i1, i2) {
    const tree = getCurrentCauseTree();
    const l2 = tree[i1].children[i2];
    if (typeof l2 !== 'string') {
        l2.expanded = !l2.expanded;
    }
    renderCauseTree();
}

function selectCause(causeName) {
    selectedCauseValue = causeName;
    
    if (causeSelectorTarget === 'create') {
        document.getElementById('createCaseCauseHidden').value = causeName;
        document.getElementById('createCaseCauseText').textContent = causeName;
        document.getElementById('createCaseCauseText').classList.remove('placeholder');
    } else if (causeSelectorTarget === 'edit') {
        document.getElementById('editCaseCauseHidden').value = causeName;
        document.getElementById('editCaseCauseText').textContent = causeName;
        document.getElementById('editCaseCauseText').classList.remove('placeholder');
    }
    
    updateCauseSelection();
    closeCauseSelector();
}

function updateCauseSelection() {
    document.querySelectorAll('#causeTreeContainer .cause-item').forEach(item => {
        item.classList.toggle('selected', item.dataset.cause === selectedCauseValue);
    });
    document.querySelectorAll('#causeTreeContainer .cause-level-1-header, #causeTreeContainer .cause-level-2-header').forEach(header => {
        const isSelected = header.dataset.cause === selectedCauseValue;
        header.classList.toggle('selected', isSelected);
        const nameEl = header.querySelector('.cause-level-1-name, .cause-level-2-name');
        if (nameEl) nameEl.classList.toggle('selected', isSelected);
    });
}

function filterCauseTree() {
    const keyword = document.getElementById('causeSearchInput').value.trim().toLowerCase();
    document.querySelectorAll('#causeTreeContainer .cause-item').forEach(item => {
        const name = item.querySelector('.cause-name').textContent.toLowerCase();
        const match = name.includes(keyword);
        item.style.display = match ? 'flex' : 'none';
        if (match && keyword) {
            let parent = item.closest('.cause-level-2');
            if (parent) parent.classList.add('expanded');
            parent = item.closest('.cause-level-1');
            if (parent) parent.classList.add('expanded');
        }
    });
}

// ===== 文书精修 =====
function openRefineModal(caseId, docId) {
    const res = getCaseDocument(caseId, docId);
    if (!res) return;
    refineState.caseId = caseId;
    refineState.docId = docId;
    refineState.messages = [];
    refineState.activeTab = 'original';
    refineState.originalContent = getDocumentContent(res.doc, 'original');
    refineState.revisedContent = getDocumentContent(res.doc, 'revised') || '';

    document.getElementById('refineDocTitle').textContent = res.doc.title;
    document.getElementById('refineCaseName').textContent = res.caseItem.caseName || res.caseItem.caseNumber || '-';
    document.getElementById('refineInput').value = '';
    document.getElementById('refineDialog').classList.add('show');
    document.getElementById('refineOverlay').classList.add('show');
    renderRefineChat();
    renderRefinePreview();
}

function closeRefineModal() {
    document.getElementById('refineDialog').classList.remove('show');
    document.getElementById('refineOverlay').classList.remove('show');
    refineState = { caseId: '', docId: '', messages: [], originalContent: '', revisedContent: '', activeTab: 'original' };
}

function renderRefineChat() {
    const container = document.getElementById('refineChatMessages');
    if (!container) return;
    if (refineState.messages.length === 0) {
        container.innerHTML = `
            <div class="refine-welcome">
                <div class="refine-welcome-icon"><i class="fas fa-magic"></i></div>
                <div class="refine-welcome-title">文书精修助手</div>
                <div class="refine-welcome-desc">请描述您希望如何调整这份文书，例如：<br>“补充违约金计算依据”“简化事实认定部分”“加强法律依据论述”</div>
            </div>
        `;
        return;
    }
    container.innerHTML = refineState.messages.map(m => `
        <div class="refine-message ${m.role}">
            <div class="refine-message-avatar"><i class="fas fa-${m.role === 'user' ? 'user' : 'robot'}"></i></div>
            <div class="refine-message-content">${escapeHtml(m.content)}</div>
        </div>
    `).join('');
    container.scrollTop = container.scrollHeight;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function sendRefineMessage() {
    const input = document.getElementById('refineInput');
    const text = input.value.trim();
    if (!text) return;
    refineState.messages.push({ role: 'user', content: text });
    input.value = '';
    renderRefineChat();

    // 模拟 AI 思考与回复
    setTimeout(() => {
        const reply = generateRefineReply(text);
        refineState.messages.push({ role: 'assistant', content: reply });
        renderRefineChat();
    }, 600);
}

function generateRefineReply(userText) {
    const replies = [
        '已收到您的修改意见。我会结合案件材料和现行法律规定，对文书进行针对性调整。',
        '了解，我会重点优化这部分内容，确保表述更加准确、完整。',
        '好的，我将根据您的要求补充相关依据，并调整文书结构。'
    ];
    return replies[Math.floor(Math.random() * replies.length)];
}

function generateRevisedDocument() {
    if (refineState.messages.length === 0) {
        showNotification('请先输入修改意见', 'warning');
        return;
    }
    const res = getCaseDocument(refineState.caseId, refineState.docId);
    if (!res) return;

    // 模拟 AI 基于多轮对话生成修订稿：在原内容末尾追加修订说明
    const original = refineState.originalContent;
    const userNotes = refineState.messages.filter(m => m.role === 'user').map(m => m.content).join('；');
    const revisionSection = `
        <div style="margin-top:24px;padding-top:16px;border-top:2px dashed #2563eb;">
            <h3 style="color:#2563eb;font-size:14pt;margin-bottom:12px;">【AI 修订说明】</h3>
            <p style="text-indent:2em;margin-bottom:10px;">根据您的修改意见（${escapeHtml(userNotes)}），已对文书进行如下调整：</p>
            <p style="text-indent:2em;margin-bottom:10px;">1. 补充了相关法律依据与事实细节；</p>
            <p style="text-indent:2em;margin-bottom:10px;">2. 优化了文书结构与语言表达；</p>
            <p style="text-indent:2em;margin-bottom:10px;">3. 强化了裁判/处理理由的逻辑性与说服力。</p>
            <p style="text-align:right;color:#666;">修订时间：${new Date().toLocaleString()}</p>
        </div>
    `;
    const lastCloseIndex = original.lastIndexOf('</div>');
    if (lastCloseIndex === -1) {
        refineState.revisedContent = original + revisionSection;
    } else {
        refineState.revisedContent = original.slice(0, lastCloseIndex) + revisionSection + original.slice(lastCloseIndex);
    }
    refineState.activeTab = 'revised';
    renderRefinePreview();
    showNotification('修订稿已生成', 'success');
}

function saveRefinedVersion() {
    const res = getCaseDocument(refineState.caseId, refineState.docId);
    if (!res) return;
    if (!refineState.revisedContent) {
        showNotification('请先生成修订稿', 'warning');
        return;
    }
    const { caseItem, doc } = res;
    if (!doc.versions) doc.versions = [];
    // 移除旧的 revised 版本，保留 original
    doc.versions = doc.versions.filter(v => v.type !== 'revised');
    doc.versions.push({
        type: 'revised',
        content: refineState.revisedContent,
        createdAt: new Date().toISOString().split('T')[0],
        messages: JSON.parse(JSON.stringify(refineState.messages))
    });
    doc.updatedAt = new Date().toISOString().split('T')[0];
    caseItem.updatedAt = doc.updatedAt;
    saveBusinessSystems();
    addHistoryTask({
        type: 'refine',
        caseId: caseItem.id,
        caseName: caseItem.caseName || caseItem.caseNumber,
        docId: doc.id,
        docTitle: doc.title
    });
    if (documentsCaseId === refineState.caseId) {
        renderDocumentsList();
        document.getElementById('documentsCount').textContent = caseItem.documents.length;
    }
    showNotification('修订稿已保存', 'success');
    closeRefineModal();
}

function switchRefineTab(type) {
    refineState.activeTab = type;
    document.querySelectorAll('.refine-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === type));
    renderRefinePreview();
}

function renderRefinePreview() {
    const preview = document.getElementById('refinePreviewContent');
    if (!preview) return;
    const content = refineState.activeTab === 'original' ? refineState.originalContent : (refineState.revisedContent || '<div style="padding:40px;text-align:center;color:#999;">点击「生成修订稿」查看 AI 调整后的版本</div>');
    preview.innerHTML = content;
}

// ===== 全部文书面板 =====
let docsPanelSearch = '';

// v1.21: 打开「我的模板」「我的提示词」页面，URL 携带当前业务系统参数
function openMyTemplates() {
    const orgParam = encodeURIComponent(localStorage.getItem('currentBusiness') || 'court');
    window.open('my-templates.html?org=' + orgParam, '_blank');
}
function openMyPrompts() {
    const orgParam = encodeURIComponent(localStorage.getItem('currentBusiness') || 'court');
    window.open('my-prompts.html?org=' + orgParam, '_blank');
}
// 打开「我的要件」页面（无当前案由上下文，由用户在页面左侧案由列表自行选择）
function openMyElements() {
    window.open('my-elements.html', '_blank');
}

function openAllDocsPanel() {
    const panel = document.getElementById('docsFsPanel');
    const overlay = document.getElementById('docsFsOverlay');
    panel.classList.add('show');
    overlay.classList.add('show');
    docsPanelSearch = '';
    const searchInput = document.getElementById('docsFsSearchInput');
    if (searchInput) searchInput.value = '';
    renderAllDocs();
}

function closeAllDocsPanel() {
    document.getElementById('docsFsPanel').classList.remove('show');
    document.getElementById('docsFsOverlay').classList.remove('show');
}

function searchAllDocs() {
    docsPanelSearch = (document.getElementById('docsFsSearchInput') || {}).value || '';
    renderAllDocs();
}

function renderAllDocs() {
    const list = document.getElementById('docsFsList');
    if (!list) return;

    // 仅汇总当前业务系统下所有案件的文书
    const current = getCurrentBusiness();
    const allDocs = [];
    (current.cases || []).forEach(c => {
        (c.documents || []).forEach(doc => {
            allDocs.push({ ...doc, _caseName: c.caseName || c.caseNumber, _caseId: c.id });
        });
    });

    // 按生成时间倒序
    allDocs.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    // 搜索
    let filtered = allDocs;
    if (docsPanelSearch) {
        const q = docsPanelSearch.toLowerCase();
        filtered = filtered.filter(d =>
            (d.title || '').toLowerCase().includes(q) ||
            (d._caseName || '').toLowerCase().includes(q)
        );
    }

    if (filtered.length === 0) {
        list.innerHTML = '<div class="docs-fs-empty"><i class="fas fa-file-alt"></i><div>暂无文书</div><div style="font-size:13px;margin-top:4px;">生成文书后将在此处展示</div></div>';
        return;
    }

    list.innerHTML = filtered.map(doc => {
        const version = (doc.versions && doc.versions.length) ? doc.versions[doc.versions.length - 1] : null;
        const wordCount = version ? version.wordCount : '';
        const duration = version ? version.duration : '';
        return `
        <div class="docs-fs-item">
            <div class="docs-fs-item-icon"><i class="fas fa-file-alt"></i></div>
            <div class="docs-fs-item-content">
                <div class="docs-fs-item-title">${doc.title || '未命名文书'}</div>
                <div class="docs-fs-item-meta">
                    <span class="docs-fs-item-case">${doc._caseName}</span>
                </div>
                <div class="docs-fs-item-info">
                    <span>${formatDateTime(doc.createdAt)}</span>
                    ${wordCount ? `<span>${wordCount.toLocaleString()}字</span>` : ''}
                    ${duration ? `<span>${duration}s</span>` : ''}
                    ${doc.versions && doc.versions.length > 1 ? `<span>${doc.versions.length}个版本</span>` : ''}
                </div>
            </div>
            <div class="docs-fs-item-actions">
                <button class="docs-fs-action-btn" onclick="viewDocFromPanel('${doc._caseId}','${doc.id}')"><i class="fas fa-eye"></i> 查看</button>
                <button class="docs-fs-action-btn" onclick="refineDocFromPanel('${doc._caseId}','${doc.id}')"><i class="fas fa-pen-nib"></i> 精修</button>
                <button class="docs-fs-action-btn" onclick="regenerateDocFromPanel('${doc._caseId}','${doc.id}')"><i class="fas fa-redo"></i> 重新生成</button>
                <button class="docs-fs-action-btn" onclick="downloadDocFromPanel('${doc._caseId}','${doc.id}')"><i class="fas fa-download"></i> 下载</button>
                <button class="docs-fs-action-btn danger" onclick="deleteDocFromPanel('${doc._caseId}','${doc.id}')"><i class="fas fa-trash-alt"></i> 删除</button>
            </div>
        </div>`;
    }).join('');
}

function getPanelDocument(caseId, docId) {
    const c = findCaseById(caseId);
    if (!c) return null;
    const doc = (c.documents || []).find(d => d.id === docId);
    if (!doc) return null;
    return { caseItem: c, doc };
}

function viewDocFromPanel(caseId, docId) {
    closeAllDocsPanel();
    window.location.href = `document-detail.html?caseId=${caseId}&docId=${docId}`;
}

function refineDocFromPanel(caseId, docId) {
    closeAllDocsPanel();
    const res = getPanelDocument(caseId, docId);
    if (!res) return;
    const { caseItem, doc } = res;
    const content = getDocumentContent(doc);
    localStorage.setItem('refineContext', JSON.stringify({
        caseName: caseItem.caseName || caseItem.caseNumber || '',
        docTitle: doc.title || '法律文书',
        docContent: content
    }));
    const win = window.open('chat.html?refine=1', '_blank');
    if (!win) {
        showNotification('弹出窗口被阻止，请允许弹出窗口后重试', 'warning');
    }
}

function regenerateDocFromPanel(caseId, docId) {
    closeAllDocsPanel();
    window.location.href = `case-files.html?caseId=${caseId}&regenerateDocId=${docId}`;
}

function downloadDocFromPanel(caseId, docId) {
    const res = getPanelDocument(caseId, docId);
    if (!res) return;
    const { caseItem, doc } = res;
    const content = getDocumentContent(doc);
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
}

function deleteDocFromPanel(caseId, docId) {
    const res = getPanelDocument(caseId, docId);
    if (!res) return;
    const { caseItem, doc } = res;
    if (!confirm(`确定要删除文书「${doc.title || '未命名文书'}」吗？删除后不可恢复。`)) return;
    caseItem.documents = caseItem.documents.filter(d => d.id !== docId);
    caseItem.updatedAt = new Date().toISOString().split('T')[0];
    saveBusinessSystems();
    renderAllDocs();
    showNotification('文书已删除', 'success');
}

function findCaseById(caseId) {
    for (const [org, system] of Object.entries(businessSystems)) {
        if (org === '_dataVersion' || !system || !Array.isArray(system.cases)) continue;
        const c = system.cases.find(x => x.id === caseId);
        if (c) return c;
    }
    return null;
}

function formatDateTime(iso) {
    if (!iso) return '-';
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ===== 初始化 =====
document.addEventListener('DOMContentLoaded', function() {
    loadColumnConfig();
    updateCauseFilter();
    updateCaseWordFilter();
    updateHandlerFilter();
    renderCaseHeader();
    renderCaseList();

    document.getElementById('caseSearchInput').addEventListener('input', filterCases);
    document.getElementById('causeFilter').addEventListener('change', filterCases);
    document.getElementById('caseWordFilter').addEventListener('change', filterCases);
    document.getElementById('handlerFilter').addEventListener('change', filterCases);
    document.getElementById('uploadDateStart').addEventListener('change', filterCases);
    document.getElementById('uploadDateEnd').addEventListener('change', filterCases);

    // 文书精修输入框支持 Ctrl+Enter 发送
    const refineInput = document.getElementById('refineInput');
    if (refineInput) {
        refineInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                sendRefineMessage();
            }
        });
    }

    document.addEventListener('click', function(e) {
        const panel = document.getElementById('colConfigPanel');
        const configBtn = document.querySelector('.col-config-toolbar-btn');
        if (panel && panel.classList.contains('show') && !panel.contains(e.target) && (!configBtn || !configBtn.contains(e.target))) {
            panel.classList.remove('show');
            if (configBtn) configBtn.classList.remove('active');
        }
    });
    
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            const genModal = document.getElementById('genModal');
            if (genModal && genModal.classList.contains('show')) {
                closeGenModal();
            }
            if (document.getElementById('createCaseDialog').classList.contains('show')) {
                closeCreateCaseDialog();
            }
            if (document.getElementById('syncDialog').classList.contains('show')) {
                closeSyncDialog();
            }
            if (document.getElementById('ocrDialog').classList.contains('show')) {
                closeOcrPanel();
            }
            if (document.getElementById('documentsDialog').classList.contains('show')) {
                closeCaseDocuments();
            }
            if (document.getElementById('editDialog').classList.contains('show')) {
                closeEditCase();
            }
            if (document.getElementById('causeSelectorModal').classList.contains('show')) {
                closeCauseSelector();
            }
            if (document.getElementById('refineDialog').classList.contains('show')) {
                closeRefineModal();
            }
            if (document.getElementById('docsFsPanel').classList.contains('show')) {
                closeAllDocsPanel();
            }
        }
    });
});

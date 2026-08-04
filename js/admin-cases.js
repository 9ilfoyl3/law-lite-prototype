/**
 * 管理后台 - 案件管理 v2.1
 * 依赖：case-data.js
 * 功能：案件列表（列配置）、材料树查看、文书列表查看、内容预览、结构化信息编辑、改承办人
 * v2.0 改造：移除业务切换/详情页跳转/生成文书/文件上传；新增列配置/材料树弹窗/文书列表弹窗/内容预览
 * v2.1 新增：改承办人功能（独立操作，部门树+用户列表+搜索+多选）
 */
(function() {
    'use strict';

    // ===== 全局状态 =====
    const currentBusiness = 'court'; // 固定法院业务系统
    let allCases = [];          // 合并后的所有案件（带 org 标签）
    let filteredCases = [];     // 筛选后的案件
    let users = [];             // 用户表（用于反查部门）
    let userDeptMap = {};       // handler -> dept 映射
    let selectedIds = new Set();// 已选案件 ID
    let currentPage = 1;
    let pageSize = 20;
    let visibleColumns = new Set(); // 可选列可见集合

    // 弹窗状态
    let materialTreeCaseId = '';
    let documentListCaseId = '';
    let editingCaseId = '';
    let selectedCauseValue = '';
    let confirmCallback = null;

    // 改承办人弹窗状态
    let handlerTargetCaseIds = []; // 改承办人的目标案件 ID 列表（单选或批量）
    let handlerSelectedNames = new Set(); // 已选的用户名集合
    let handlerCurrentDeptId = ''; // 当前选中的部门 ID
    let handlerSearchKeyword = ''; // 搜索关键词
    let departments = []; // 部门列表（从 localStorage 读取）

    // 可选列定义
    const OPTIONAL_COLUMNS = [
        { key: 'caseNumber', label: '案号' },
        { key: 'cause', label: '案由' },
        { key: 'parties', label: '当事人' },
        { key: 'handler', label: '承办人' },
        { key: 'dept', label: '部门' },
        { key: 'uploadDate', label: '上传日期' },
        { key: 'caseWord', label: '案字' }
    ];

    const COL_CONFIG_KEY = 'adminCaseListColumns';
    // 列顺序：复选框 | 案件名称 | [可选列...] | 文件数 | 文书数 | 更新时间 | 操作
    const BASE_COL_TEMPLATE_LEFT = '40px minmax(0,3fr)';
    const BASE_COL_TEMPLATE_RIGHT = '100px 100px minmax(0,1fr) 180px';

    // ===== 数据加载 =====
    function loadData() {
        try { users = JSON.parse(localStorage.getItem('adminUsers')) || []; } catch (e) { users = []; }
        try { departments = JSON.parse(localStorage.getItem('adminDepartments')) || []; } catch (e) { departments = []; }
        userDeptMap = {};
        users.forEach(u => { if (u.name) userDeptMap[u.name] = u.dept || '-'; });

        allCases = [];
        if (typeof businessSystems === 'undefined') {
            console.error('[admin-cases] businessSystems 未定义，请确认 case-data.js 已加载');
            return;
        }
        const system = businessSystems[currentBusiness];
        if (system && Array.isArray(system.cases)) {
            system.cases.forEach(c => { allCases.push({ ...c, _org: currentBusiness }); });
        }
    }

    // 计算部门（动态反查用户表）
    function getDeptOf(c) {
        if (!c.handler) return '-';
        return userDeptMap[c.handler] || '-';
    }

    // 计算文书数
    function getDocCount(c) {
        return Array.isArray(c.documents) ? c.documents.length : 0;
    }

    // 判断是否有解析异常
    function hasOcrError(c) {
        if (!Array.isArray(c.files)) return false;
        return c.files.some(f => f && f.ocrStatus === 'error');
    }

    // 解析异常材料数
    function getOcrErrorCount(c) {
        if (!Array.isArray(c.files)) return 0;
        return c.files.filter(f => f && f.ocrStatus === 'error').length;
    }

    // ===== 列配置 =====
    function loadColumnConfig() {
        try {
            const arr = JSON.parse(localStorage.getItem(COL_CONFIG_KEY));
            visibleColumns = new Set(Array.isArray(arr) ? arr : []);
        } catch (e) {
            visibleColumns = new Set();
        }
    }

    function saveColumnConfig() {
        try {
            localStorage.setItem(COL_CONFIG_KEY, JSON.stringify([...visibleColumns]));
        } catch (e) { /* ignore */ }
    }

    function renderColConfigPanel() {
        const panel = document.getElementById('colConfigPanel');
        if (!panel) return;
        panel.innerHTML = OPTIONAL_COLUMNS.map(col => `
            <label class="col-config-item">
                <input type="checkbox" value="${escapeHtml(col.key)}" ${visibleColumns.has(col.key) ? 'checked' : ''} onchange="window.AdminCases.toggleColumn('${col.key}')">
                <span>${escapeHtml(col.label)}</span>
            </label>
        `).join('');
    }

    function toggleColConfig() {
        const panel = document.getElementById('colConfigPanel');
        if (!panel) return;
        if (panel.classList.contains('show')) {
            panel.classList.remove('show');
        } else {
            renderColConfigPanel();
            panel.classList.add('show');
        }
    }

    function toggleColumn(col) {
        if (visibleColumns.has(col)) visibleColumns.delete(col);
        else visibleColumns.add(col);
        saveColumnConfig();
        renderColConfigPanel();
        renderTable();
        updateBatchBar();
    }

    function getColTemplate() {
        const extra = [...visibleColumns].map(() => 'minmax(0,1fr)').join(' ');
        return extra ? `${BASE_COL_TEMPLATE_LEFT} ${extra} ${BASE_COL_TEMPLATE_RIGHT}` : `${BASE_COL_TEMPLATE_LEFT} ${BASE_COL_TEMPLATE_RIGHT}`;
    }

    function buildColumn(key, c) {
        switch (key) {
            case 'caseNumber':
                return `<div title="${escapeHtml(c.caseNumber || '')}">${escapeHtml(c.caseNumber || '-')}</div>`;
            case 'cause':
                return `<div title="${escapeHtml(c.cause || '')}">${escapeHtml(c.cause || '-')}</div>`;
            case 'parties':
                return `<div>${escapeHtml(c.partyA || '-')} 诉 ${escapeHtml(c.partyB || '-')}</div>`;
            case 'handler':
                return `<div title="${escapeHtml(getCaseHandlers(c).join('、'))}">${escapeHtml(getCaseHandlers(c).join('、') || '-')}</div>`;
            case 'dept':
                return `<div>${escapeHtml(getDeptOf(c))}</div>`;
            case 'uploadDate':
                return `<div>${escapeHtml(c.date || '-')}</div>`;
            case 'caseWord':
                return `<div>${c.caseWord ? `<span class="case-word-tag">${escapeHtml(c.caseWord)}</span>` : '-'}</div>`;
            default:
                return '<div>-</div>';
        }
    }

    function renderGridHead(headEl) {
        if (!headEl) headEl = document.querySelector('#caseGrid .grid-head');
        if (!headEl) return;
        const leftHeads = `
            <div class="col-center"><input type="checkbox" id="selectAll" onchange="window.AdminCases.toggleSelectAll(this)"></div>
            <div>案件名称</div>`;
        const extraHeads = [...visibleColumns].map(key => {
            const col = OPTIONAL_COLUMNS.find(c => c.key === key);
            return `<div>${escapeHtml(col ? col.label : key)}</div>`;
        }).join('');
        const rightHeads = `
            <div class="col-center">文件数</div>
            <div class="col-center">文书数</div>
            <div class="col-center">更新时间</div>
            <div class="col-center">操作</div>`;
        headEl.innerHTML = leftHeads + extraHeads + rightHeads;
    }

    function updateGridColumns() {
        const tpl = getColTemplate();
        const grid = document.getElementById('caseGrid');
        if (grid) grid.style.setProperty('--case-grid-cols', tpl);
        const head = document.querySelector('#caseGrid .grid-head');
        if (head) {
            head.style.gridTemplateColumns = tpl;
            renderGridHead(head);
        }
        document.querySelectorAll('#gridBody .grid-row').forEach(r => {
            r.style.gridTemplateColumns = tpl;
        });
    }

    // ===== 筛选 =====
    function applyFilters() {
        const search = document.getElementById('caseSearch').value.toLowerCase().trim();
        const dept = document.getElementById('deptFilter').value;
        const handler = document.getElementById('handlerFilter').value;
        const year = document.getElementById('yearFilter').value;

        filteredCases = allCases.filter(c => {
            if (search) {
                const hay = `${c.caseName || ''} ${c.caseNumber || ''} ${c.partyA || ''} ${c.partyB || ''}`.toLowerCase();
                if (!hay.includes(search)) return false;
            }
            if (dept && getDeptOf(c) !== dept) return false;
            if (handler && getCaseHandlers(c).indexOf(handler) < 0) return false;
            if (year === 'custom') {
                const from = document.getElementById('dateFrom').value;
                const to = document.getElementById('dateTo').value;
                const upd = (c.updatedAt || '').slice(0, 10);
                if (from && upd < from) return false;
                if (to && upd > to) return false;
            } else if (year) {
                const upd = (c.updatedAt || '').slice(0, 4);
                if (upd !== year) return false;
            }
            return true;
        });

        filteredCases.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));

        currentPage = 1;
        render();
    }

    function rebuildDeptAndHandlerOptions() {
        const deptFilter = document.getElementById('deptFilter');
        const handlerFilter = document.getElementById('handlerFilter');

        const depts = new Set();
        users.forEach(u => { if (u.dept) depts.add(u.dept); });

        const handlers = new Set();
        allCases.forEach(c => {
            getCaseHandlers(c).forEach(h => { if (h) handlers.add(h); });
        });

        const curDept = deptFilter.value;
        deptFilter.innerHTML = '<option value="">全部部门</option>' +
            Array.from(depts).sort().map(d => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join('');
        deptFilter.value = curDept;

        const curHandler = handlerFilter.value;
        handlerFilter.innerHTML = '<option value="">全部承办人</option>' +
            Array.from(handlers).sort().map(h => `<option value="${escapeHtml(h)}">${escapeHtml(h)}</option>`).join('');
        handlerFilter.value = curHandler;
    }

    function resetFilters() {
        document.getElementById('caseSearch').value = '';
        document.getElementById('deptFilter').value = '';
        document.getElementById('handlerFilter').value = '';
        document.getElementById('yearFilter').value = '';
        document.getElementById('dateFrom').value = '';
        document.getElementById('dateTo').value = '';
        const customBar = document.getElementById('customDateBar');
        if (customBar) customBar.style.display = 'none';
        rebuildDeptAndHandlerOptions();
        applyFilters();
    }

    function onYearChange() {
        const year = document.getElementById('yearFilter').value;
        const customBar = document.getElementById('customDateBar');
        if (customBar) customBar.style.display = (year === 'custom') ? 'flex' : 'none';
        applyFilters();
    }

    // ===== 渲染 =====
    function render() {
        renderTable();
        renderPagination();
        updateBatchBar();
    }

    function renderTable() {
        const gridBody = document.getElementById('gridBody');
        if (!gridBody) return;

        const start = (currentPage - 1) * pageSize;
        const end = start + pageSize;
        const pageData = filteredCases.slice(start, end);

        if (pageData.length === 0) {
            gridBody.innerHTML = `
                <div style="padding: 60px 20px; text-align:center; color:#9ca3af;">
                    <i class="fas fa-folder-open" style="font-size:48px; margin-bottom:12px; color:#e5e7eb;"></i>
                    <p style="font-size:14px; margin:0;">暂无符合条件的案件</p>
                </div>`;
            updateGridColumns();
            return;
        }

        gridBody.innerHTML = pageData.map(c => {
            const isDeleted = !!c.isDeleted;
            const fileCount = c.fileCount || 0;
            const ocrError = hasOcrError(c);
            const ocrErrCount = getOcrErrorCount(c);
            const docCount = getDocCount(c);
            const checked = selectedIds.has(c.id) ? 'checked' : '';
            const rowCls = [ocrError ? 'has-ocr-error' : '', isDeleted ? 'is-deleted-row' : ''].join(' ').trim();
            const deletedBadge = isDeleted ? `<span class="deleted-badge" title="软删除于 ${escapeHtml(c.deletedAt || '-')}">已删除</span>` : '';

            const fileCountCell = ocrError
                ? `<span class="file-count-cell has-error" title="存在 ${ocrErrCount} 份解析异常材料" onclick="window.AdminCases.openMaterialTree('${c.id}')">${fileCount}</span>`
                : `<span class="file-count-link" onclick="window.AdminCases.openMaterialTree('${c.id}')">${fileCount}</span>`;

            const docCountCell = docCount > 0
                ? `<span class="doc-count-link" onclick="window.AdminCases.openDocumentList('${c.id}')">${docCount}</span>`
                : `<span class="doc-count-link disabled">${docCount}</span>`;

            const actionCell = isDeleted
                ? `<div class="action-cell">
                        <button class="action-btn view" onclick="window.AdminCases.viewCase('${c.id}')">查看</button>
                        <button class="action-btn restore" onclick="window.AdminCases.restoreCase('${c.id}')">恢复</button>
                   </div>`
                : `<div class="action-cell">
                        <button class="action-btn view" onclick="window.AdminCases.editCase('${c.id}')">编辑</button>
                        <button class="action-btn handler" onclick="window.AdminCases.openHandlerModal(['${c.id}'])">改承办人</button>
                        <button class="action-btn delete" onclick="window.AdminCases.deleteCase('${c.id}')">删除</button>
                   </div>`;

            const extraCols = [...visibleColumns].map(col => buildColumn(col, c)).join('');

            return `
                <div class="grid-row ${rowCls}" data-case-id="${escapeHtml(c.id)}">
                    <div class="col-center">
                        <input type="checkbox" class="row-check" data-case-id="${escapeHtml(c.id)}" ${checked} onchange="window.AdminCases.toggleRow('${c.id}', this.checked)">
                    </div>
                    <div>
                        <span class="case-name-text" title="${escapeHtml(c.caseName || '')}">${escapeHtml(c.caseName || '-')}</span>${deletedBadge}
                    </div>
                    ${extraCols}
                    <div class="col-center">${fileCountCell}</div>
                    <div class="col-center">${docCountCell}</div>
                    <div class="col-center">${escapeHtml(c.updatedAt || '-')}</div>
                    <div class="col-center">${actionCell}</div>
                </div>`;
        }).join('');

        updateGridColumns();
    }

    function renderPagination() {
        const total = filteredCases.length;
        const totalPages = Math.max(1, Math.ceil(total / pageSize));
        if (currentPage > totalPages) currentPage = totalPages;

        const start = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
        const end = Math.min(currentPage * pageSize, total);
        document.getElementById('paginationInfo').textContent = `共 ${total} 条，显示 ${start}-${end} 条`;

        const btns = document.getElementById('paginationBtns');
        let html = '';
        html += `<button class="page-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="window.AdminCases.goPage(${currentPage - 1})"><i class="fas fa-chevron-left"></i></button>`;
        let s = Math.max(1, currentPage - 3);
        let e = Math.min(totalPages, s + 6);
        s = Math.max(1, e - 6);
        if (s > 1) {
            html += `<button class="page-btn" onclick="window.AdminCases.goPage(1)">1</button>`;
            if (s > 2) html += `<span style="padding:0 4px;color:#9ca3af;">...</span>`;
        }
        for (let i = s; i <= e; i++) {
            html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="window.AdminCases.goPage(${i})">${i}</button>`;
        }
        if (e < totalPages) {
            if (e < totalPages - 1) html += `<span style="padding:0 4px;color:#9ca3af;">...</span>`;
            html += `<button class="page-btn" onclick="window.AdminCases.goPage(${totalPages})">${totalPages}</button>`;
        }
        html += `<button class="page-btn" ${currentPage === totalPages ? 'disabled' : ''} onclick="window.AdminCases.goPage(${currentPage + 1})"><i class="fas fa-chevron-right"></i></button>`;
        btns.innerHTML = html;
    }

    // ===== 批量操作栏 =====
    function updateBatchBar() {
        const bar = document.getElementById('batchBar');
        const info = document.getElementById('batchInfo');
        const selectAll = document.getElementById('selectAll');
        if (selectedIds.size > 0) {
            bar.classList.add('show');
            info.textContent = `已选 ${selectedIds.size} 件`;
        } else {
            bar.classList.remove('show');
        }
        const start = (currentPage - 1) * pageSize;
        const end = start + pageSize;
        const pageData = filteredCases.slice(start, end);
        const allChecked = pageData.length > 0 && pageData.every(c => selectedIds.has(c.id));
        if (selectAll) {
            selectAll.checked = allChecked;
            selectAll.indeterminate = !allChecked && pageData.some(c => selectedIds.has(c.id));
        }
    }

    function toggleRow(caseId, checked) {
        if (checked) selectedIds.add(caseId);
        else selectedIds.delete(caseId);
        updateBatchBar();
    }

    function toggleSelectAll(checkbox) {
        const start = (currentPage - 1) * pageSize;
        const end = start + pageSize;
        const pageData = filteredCases.slice(start, end);
        pageData.forEach(c => {
            if (checkbox.checked) selectedIds.add(c.id);
            else selectedIds.delete(c.id);
        });
        renderTable();
        updateBatchBar();
    }

    function clearSelection() {
        selectedIds.clear();
        render();
    }

    // ===== 分页 =====
    function goPage(page) {
        const totalPages = Math.max(1, Math.ceil(filteredCases.length / pageSize));
        if (page < 1 || page > totalPages) return;
        currentPage = page;
        renderTable();
        renderPagination();
        updateBatchBar();
    }

    function changePageSize(val) {
        pageSize = parseInt(val) || 20;
        currentPage = 1;
        render();
    }

    // ===== 材料树弹窗 =====
    function openMaterialTree(caseId) {
        materialTreeCaseId = caseId;
        const c = allCases.find(x => x.id === caseId);
        const nameEl = document.getElementById('materialTreeCaseName');
        if (nameEl) nameEl.textContent = (c && (c.caseName || c.caseNumber)) || '-';
        renderMaterialTreeBody();
        const modal = document.getElementById('materialTreeModal');
        if (modal) modal.classList.add('show');
    }

    function closeMaterialTree() {
        const modal = document.getElementById('materialTreeModal');
        if (modal) modal.classList.remove('show');
        materialTreeCaseId = '';
    }

    function renderMaterialTreeBody() {
        const body = document.getElementById('materialTreeBody');
        if (!body) return;
        const c = allCases.find(x => x.id === materialTreeCaseId);
        const files = (c && Array.isArray(c.files)) ? c.files : [];
        const successFiles = files.filter(f => f && (f.parseStatus === 'success' || f.ocrStatus === 'done'));

        if (successFiles.length === 0) {
            body.innerHTML = `<div class="modal-empty"><i class="fas fa-folder-open"></i><p>暂无材料</p></div>`;
            return;
        }

        const categories = classifyMaterials(successFiles);
        body.innerHTML = Object.keys(categories).map(cat => {
            const items = categories[cat];
            const itemHtml = items.map(f => {
                const fid = f.id || '';
                return `<div class="material-item">
                    <div class="material-name"><i class="fas fa-file-alt"></i><span title="${escapeHtml(f.name || '')}">${escapeHtml(f.name || '-')}</span></div>
                    <button class="preview-btn" onclick="window.AdminCases.previewMaterial('${fid}')">预览</button>
                </div>`;
            }).join('');
            return `<div class="material-group expanded">
                <div class="material-group-header" onclick="this.parentElement.classList.toggle('expanded')">
                    <i class="fas fa-chevron-right group-toggle"></i>
                    <span>${escapeHtml(cat)}</span>
                    <span class="group-count">${items.length}</span>
                </div>
                <div class="material-group-items">${itemHtml}</div>
            </div>`;
        }).join('');
    }

    // classifyMaterials 简化实现（不依赖 case-files.js）
    function classifyMaterials(files) {
        const categories = {};
        files.forEach(f => {
            const name = f.name || '';
            let category = f.category || '';
            if (!category) {
                for (const [cat, keys] of Object.entries(MATERIAL_CATEGORIES)) {
                    if (cat === '其他材料') continue;
                    if (keys.some(k => name.includes(k))) { category = cat; break; }
                }
            }
            if (!category) category = '其他材料';
            if (!categories[category]) categories[category] = [];
            categories[category].push(f);
        });
        Object.keys(categories).forEach(k => { if (!categories[k].length) delete categories[k]; });
        return categories;
    }

    // ===== 材料内容预览 =====
    function previewMaterial(fileId) {
        const c = allCases.find(x => x.id === materialTreeCaseId);
        const files = (c && Array.isArray(c.files)) ? c.files : [];
        const f = files.find(x => x.id === fileId);
        const fileName = (f && f.name) || '未知文件';

        const titleEl = document.getElementById('contentPreviewTitle');
        const bodyEl = document.getElementById('contentPreviewBody');
        if (titleEl) titleEl.textContent = fileName;
        if (bodyEl) bodyEl.textContent = `这是 ${fileName} 的内容预览。\n\n（原型阶段材料内容为占位文本，实际系统中将展示文件解析后的全文内容。）`;
        const modal = document.getElementById('contentPreviewModal');
        if (modal) modal.classList.add('show');
    }

    function closeContentPreview() {
        const modal = document.getElementById('contentPreviewModal');
        if (modal) modal.classList.remove('show');
    }

    // ===== 文书列表弹窗 =====
    function openDocumentList(caseId) {
        documentListCaseId = caseId;
        const c = allCases.find(x => x.id === caseId);
        const nameEl = document.getElementById('documentListCaseName');
        if (nameEl) nameEl.textContent = (c && (c.caseName || c.caseNumber)) || '-';
        const countEl = document.getElementById('documentListCount');
        if (countEl) countEl.textContent = `共 ${getDocCount(c || {})} 份文书`;
        renderDocumentListBody();
        const modal = document.getElementById('documentListModal');
        if (modal) modal.classList.add('show');
    }

    function closeDocumentList() {
        const modal = document.getElementById('documentListModal');
        if (modal) modal.classList.remove('show');
        documentListCaseId = '';
    }

    function renderDocumentListBody() {
        const body = document.getElementById('documentListBody');
        if (!body) return;
        let list = [];
        try {
            list = (typeof getAllDocumentVersions === 'function') ? getAllDocumentVersions(documentListCaseId) : [];
        } catch (e) { list = []; }

        if (!list || list.length === 0) {
            body.innerHTML = `<div class="modal-empty"><i class="fas fa-file-alt"></i><p>暂无文书</p></div>`;
            return;
        }

        body.innerHTML = list.map(v => {
            const versionNo = (v.versionTotal - v.versionIndex + 1);
            const genMethodLabel = v.genMethod === 'step' ? '分步生成' : '一步生成';
            const typeTag = v.type === 'polish'
                ? `<span class="doc-version-tag polish">精修</span>`
                : v.type === 'regenerate'
                    ? `<span class="doc-version-tag regenerate">重新生成</span>`
                    : '';
            const vid = v.versionId || '';
            return `<div class="doc-version-item">
                <div class="doc-version-info">
                    <div class="doc-version-title">${escapeHtml(v.title || '未命名文书')}</div>
                    <div class="doc-version-meta">
                        <span class="doc-version-badge">v${versionNo}</span>
                        <span>${genMethodLabel}</span>
                        ${typeTag}
                        <span>${escapeHtml(v.createdAt || '-')}</span>
                        <span>${escapeHtml(v.createdBy || '-')}</span>
                    </div>
                </div>
                <button class="doc-version-preview-btn" onclick="window.AdminCases.previewDocument('${vid}')">预览</button>
            </div>`;
        }).join('');
    }

    // ===== 文书内容预览 =====
    function previewDocument(versionId) {
        let res = null;
        if (typeof findDocumentVersion === 'function') {
            try { res = findDocumentVersion(documentListCaseId, versionId); } catch (e) { res = null; }
        }
        if (!res && typeof findCaseById === 'function') {
            // 兜底：case-data.js 未提供 findDocumentVersion 时本地查找
            const r = findCaseById(documentListCaseId);
            if (r && r.caseItem) {
                for (const doc of (r.caseItem.documents || [])) {
                    if (!doc || !Array.isArray(doc.versions)) continue;
                    const v = doc.versions.find(x => x.versionId === versionId);
                    if (v) { res = { caseItem: r.caseItem, doc, version: v }; break; }
                }
            }
        }
        if (!res) { showNotification('版本不存在', 'error'); return; }

        const { doc, version } = res;
        const title = (version && version.title) || (doc && doc.title) || '文书预览';
        const content = stripHtml((version && version.content) || '');

        const titleEl = document.getElementById('contentPreviewTitle');
        const bodyEl = document.getElementById('contentPreviewBody');
        if (titleEl) titleEl.textContent = title;
        if (bodyEl) bodyEl.textContent = content;
        const modal = document.getElementById('contentPreviewModal');
        if (modal) modal.classList.add('show');
    }

    // 通过 DOM 临时元素剥离 HTML 标签
    function stripHtml(html) {
        const tmp = document.createElement('div');
        tmp.innerHTML = html || '';
        return tmp.textContent || tmp.innerText || '';
    }

    // ===== 行内操作 =====
    function editCase(caseId) {
        openEditCase(caseId, false);
    }

    // 已删除案件只读查看：打开编辑弹窗，所有字段 disabled
    function viewCase(caseId) {
        openEditCase(caseId, true);
    }

    function deleteCase(caseId) {
        const c = allCases.find(x => x.id === caseId);
        if (!c) return;
        showConfirm(
            '删除确认',
            `确定删除案件「${c.caseName}」及其全部材料和文书吗？此操作不可恢复。`,
            () => {
                removeCaseFromBusinessSystems(caseId);
                selectedIds.delete(caseId);
                saveBusinessSystems();
                console.log(`[admin-cases] 删除案件: ${caseId} (${c.caseName})`);
                showNotification('案件已删除', 'success');
                loadData();
                applyFilters();
            }
        );
    }

    function restoreCase(caseId) {
        const c = allCases.find(x => x.id === caseId);
        if (!c) return;
        showConfirm(
            '恢复确认',
            `确定恢复案件「${c.caseName}」吗？恢复后该案件将重新对法官可见。`,
            () => {
                delete c.isDeleted;
                delete c.deletedAt;
                saveBusinessSystems();
                console.log(`[admin-cases] 恢复案件: ${caseId} (${c.caseName})`);
                showNotification('案件已恢复，法官侧可见', 'success');
                loadData();
                applyFilters();
            }
        );
    }

    // ===== 批量操作 =====
    function batchDelete() {
        if (selectedIds.size === 0) return;
        const count = selectedIds.size;
        showConfirm(
            '批量删除确认',
            `确定删除选中的 ${count} 件案件及其全部材料和文书吗？此操作不可恢复。`,
            () => {
                selectedIds.forEach(id => {
                    removeCaseFromBusinessSystems(id);
                    console.log(`[admin-cases] 批量删除: ${id}`);
                });
                saveBusinessSystems();
                showNotification(`已删除 ${count} 件案件`, 'success');
                selectedIds.clear();
                loadData();
                applyFilters();
            }
        );
    }

    // ===== 改承办人 =====
    function batchChangeHandler() {
        if (selectedIds.size === 0) return;
        openHandlerModal([...selectedIds]);
    }

    function openHandlerModal(caseIds) {
        handlerTargetCaseIds = caseIds || [];
        handlerSelectedNames = new Set();
        handlerCurrentDeptId = '';
        handlerSearchKeyword = '';

        // 回填已有承办人（单案件时）
        if (handlerTargetCaseIds.length === 1) {
            const c = allCases.find(x => x.id === handlerTargetCaseIds[0]);
            if (c) {
                getCaseHandlers(c).forEach(h => handlerSelectedNames.add(h));
            }
        }

        // 渲染弹窗标题
        const titleEl = document.getElementById('handlerModalTitle');
        if (titleEl) {
            const count = handlerTargetCaseIds.length;
            titleEl.innerHTML = `<i class="fas fa-user-edit" style="margin-right:8px;color:var(--accent-primary);"></i>${count > 1 ? '批量改承办人（' + count + ' 件案件）' : '改承办人'}`;
        }

        // 清空搜索框
        const searchInput = document.getElementById('handlerSearchInput');
        if (searchInput) searchInput.value = '';

        renderHandlerDeptTree();
        renderHandlerUserList();
        renderHandlerSelectedTags();

        document.getElementById('handlerModal').classList.add('show');
    }

    function closeHandlerModal() {
        document.getElementById('handlerModal').classList.remove('show');
    }

    function renderHandlerDeptTree() {
        const treeEl = document.getElementById('handlerDeptTree');
        if (!treeEl) return;

        // 获取有效用户涉及的部门 ID
        const activeUsers = users.filter(u => u.status !== 'inactive');
        const deptIdsWithUsers = new Set(activeUsers.map(u => u.deptId).filter(Boolean));

        // 过滤部门：有用户的部门 + 状态为 active
        const validDepts = departments.filter(d => d.status !== 'inactive' && deptIdsWithUsers.has(d.id));

        let html = `<div class="handler-dept-item ${!handlerCurrentDeptId ? 'active' : ''}" onclick="window.AdminCases.selectHandlerDept('')">
            <i class="fas fa-layer-group"></i><span>全部</span>
        </div>`;
        validDepts.forEach(d => {
            const count = activeUsers.filter(u => u.deptId === d.id).length;
            html += `<div class="handler-dept-item ${handlerCurrentDeptId === d.id ? 'active' : ''}" onclick="window.AdminCases.selectHandlerDept('${escapeHtml(d.id)}')">
                <i class="fas fa-folder"></i><span>${escapeHtml(d.name)}</span><span class="dept-count">${count}</span>
            </div>`;
        });
        treeEl.innerHTML = html;
    }

    function selectHandlerDept(deptId) {
        handlerCurrentDeptId = deptId;
        renderHandlerDeptTree();
        renderHandlerUserList();
    }

    function onHandlerSearch(val) {
        handlerSearchKeyword = (val || '').toLowerCase().trim();
        renderHandlerUserList();
    }

    function renderHandlerUserList() {
        const listEl = document.getElementById('handlerUserList');
        if (!listEl) return;

        let filtered = users.filter(u => u.status !== 'inactive');
        if (handlerCurrentDeptId) {
            filtered = filtered.filter(u => u.deptId === handlerCurrentDeptId);
        }
        if (handlerSearchKeyword) {
            filtered = filtered.filter(u => (u.name || '').toLowerCase().includes(handlerSearchKeyword));
        }

        if (filtered.length === 0) {
            listEl.innerHTML = '<div class="handler-user-empty">暂无符合条件的用户</div>';
            return;
        }

        listEl.innerHTML = filtered.map(u => {
            const checked = handlerSelectedNames.has(u.name);
            const deptName = u.dept || (departments.find(d => d.id === u.deptId) || {}).name || '-';
            return `<label class="handler-user-item">
                <input type="checkbox" ${checked ? 'checked' : ''} onchange="window.AdminCases.toggleHandlerUser('${escapeHtml(u.name)}', this.checked)">
                <span class="user-name">${escapeHtml(u.name)}</span>
                <span class="user-dept">${escapeHtml(deptName)}</span>
            </label>`;
        }).join('');
    }

    function toggleHandlerUser(name, checked) {
        if (checked) handlerSelectedNames.add(name);
        else handlerSelectedNames.delete(name);
        renderHandlerSelectedTags();
    }

    function removeHandlerUser(name) {
        handlerSelectedNames.delete(name);
        renderHandlerUserList();
        renderHandlerSelectedTags();
    }

    function renderHandlerSelectedTags() {
        const tagsEl = document.getElementById('handlerSelectedTags');
        if (!tagsEl) return;
        if (handlerSelectedNames.size === 0) {
            tagsEl.innerHTML = '<span style="font-size:12px;color:var(--text-muted);">未选择</span>';
            return;
        }
        tagsEl.innerHTML = [...handlerSelectedNames].map(name =>
            `<span class="handler-tag">${escapeHtml(name)}<i class="fas fa-times remove-tag" onclick="window.AdminCases.removeHandlerUser('${escapeHtml(name)}')"></i></span>`
        ).join('');
    }

    function submitHandlerChange() {
        if (handlerSelectedNames.size === 0) {
            showNotification('请至少选择一名承办人', 'error');
            return;
        }

        const system = (typeof businessSystems !== 'undefined' && businessSystems[currentBusiness]) || null;
        if (!system || !Array.isArray(system.cases)) { closeHandlerModal(); return; }

        const handlerArr = [...handlerSelectedNames];
        const primaryHandler = handlerArr[0];

        let updated = 0;
        handlerTargetCaseIds.forEach(caseId => {
            const c = system.cases.find(x => x.id === caseId);
            if (c) {
                c.handler = primaryHandler;
                c.handlers = handlerArr.slice();
                c.updatedAt = nowStr();
                updated++;
            }
        });

        saveBusinessSystems();
        console.log(`[admin-cases] 改承办人: ${updated} 件案件 → ${handlerArr.join('、')}`);
        showNotification(`已更新 ${updated} 件案件的承办人`, 'success');
        closeHandlerModal();
        loadData();
        applyFilters();
    }

    // ===== 编辑案件弹窗 =====
    function openEditCase(caseId, readonly) {
        const c = allCases.find(x => x.id === caseId);
        if (!c) return;
        editingCaseId = caseId;

        // 当事人标签联动
        const system = (typeof businessSystems !== 'undefined' && businessSystems[currentBusiness]) || null;
        const labels = (system && Array.isArray(system.partiesLabels) && system.partiesLabels.length >= 2)
            ? system.partiesLabels
            : ['原告', '被告'];
        document.getElementById('editPartyALabel').textContent = labels[0];
        document.getElementById('editPartyBLabel').textContent = labels[1];

        // 案字下拉联动
        const wordSelect = document.getElementById('editCaseWord');
        const words = (typeof caseWordListByOrg !== 'undefined' && caseWordListByOrg[currentBusiness]) || [];
        wordSelect.innerHTML = '<option value="">请选择案字</option>' +
            words.map(w => `<option value="${escapeHtml(w)}">${escapeHtml(w)}</option>`).join('');
        wordSelect.value = c.caseWord || '';

        // 案由回填
        const causeText = document.getElementById('editCaseCauseText');
        const causeHidden = document.getElementById('editCaseCauseHidden');
        if (c.cause) {
            causeHidden.value = c.cause;
            causeText.textContent = c.cause;
            causeText.classList.remove('placeholder');
        } else {
            causeHidden.value = '';
            causeText.textContent = '请选择案由';
            causeText.classList.add('placeholder');
        }
        selectedCauseValue = c.cause || '';

        // 其他字段回填
        document.getElementById('editCaseName').value = c.caseName || '';
        document.getElementById('editCaseNumber').value = c.caseNumber || '';
        document.getElementById('editPartyA').value = c.partyA || '';
        document.getElementById('editPartyB').value = c.partyB || '';
        document.getElementById('editHandler').value = getCaseHandlers(c).join('、');
        document.getElementById('editCaseDate').value = c.date || '';

        // readonly 模式处理
        const titleEl = document.querySelector('#editCaseModal h3');
        const saveBtn = document.getElementById('editCaseSaveBtn');
        const fields = document.querySelectorAll('#editCaseModal input, #editCaseModal select, #editCaseModal textarea');
        const causeTrigger = document.getElementById('editCaseCauseTrigger');
        if (readonly) {
            if (titleEl) titleEl.innerHTML = `<i class="fas fa-eye" style="margin-right:8px;color:var(--accent-primary);"></i>查看案件信息`;
            fields.forEach(f => { f.disabled = true; });
            if (causeTrigger) {
                causeTrigger.disabled = true;
                causeTrigger.style.pointerEvents = 'none';
                causeTrigger.style.opacity = '0.6';
            }
            if (saveBtn) saveBtn.style.display = 'none';
        } else {
            if (titleEl) titleEl.innerHTML = `<i class="fas fa-edit" style="margin-right:8px;color:var(--accent-primary);"></i>编辑案件信息`;
            fields.forEach(f => { f.disabled = false; });
            if (causeTrigger) {
                causeTrigger.disabled = false;
                causeTrigger.style.pointerEvents = '';
                causeTrigger.style.opacity = '';
            }
            if (saveBtn) saveBtn.style.display = '';
        }

        document.getElementById('editCaseModal').classList.add('show');
    }

    function closeEditCase() {
        document.getElementById('editCaseModal').classList.remove('show');
        editingCaseId = '';
    }

    function submitEditCase() {
        const caseName = document.getElementById('editCaseName').value.trim();
        if (!caseName) {
            showNotification('请填写案件名称', 'error');
            return;
        }

        // 直接在 businessSystems 中查找原始案件对象，确保修改能正确持久化
        const system = (typeof businessSystems !== 'undefined' && businessSystems[currentBusiness]) || null;
        const c = system && Array.isArray(system.cases)
            ? system.cases.find(x => x.id === editingCaseId)
            : null;
        if (!c) { closeEditCase(); return; }

        const cause = document.getElementById('editCaseCauseHidden').value;
        const type = cause ? (typeof getCauseType === 'function' ? getCauseType(cause, currentBusiness) : c.type) : c.type;

        c.caseName = caseName;
        c.caseNumber = document.getElementById('editCaseNumber').value.trim();
        c.caseWord = document.getElementById('editCaseWord').value || '';
        c.cause = cause;
        c.type = type;
        c.partyA = document.getElementById('editPartyA').value.trim();
        c.partyB = document.getElementById('editPartyB').value.trim();

        // 承办人支持多人——按顿号/逗号拆分，同步 handler 与 handlers
        const handlerText = document.getElementById('editHandler').value.trim();
        const handlerArr = handlerText ? handlerText.split(/[、,，]/).map(s => s.trim()).filter(Boolean) : [];
        if (handlerArr.length > 0) {
            c.handler = handlerArr[0];
            c.handlers = handlerArr.slice();
        }

        c.date = document.getElementById('editCaseDate').value || c.date;
        c.updatedAt = nowStr();

        saveBusinessSystems();
        console.log(`[admin-cases] 编辑案件: ${c.id} (${c.caseName})`);
        showNotification('案件信息已更新', 'success');
        closeEditCase();
        loadData();
        applyFilters();
    }

    // ===== 案由树形选择器 =====
    // 取当前业务系统的案由树（带深拷贝，避免污染全局常量）
    function getCurrentCauseTree() {
        const src = (typeof causeTreeDataByOrg !== 'undefined' && causeTreeDataByOrg[currentBusiness]) || [];
        return src.map(l1 => ({
            name: l1.name,
            expanded: !!l1.expanded,
            children: (l1.children || []).map(l2 => {
                if (typeof l2 === 'string') return l2;
                return {
                    name: l2.name,
                    expanded: !!l2.expanded,
                    children: (l2.children || []).slice()
                };
            })
        }));
    }

    function openCauseSelector() {
        const currentValue = document.getElementById('editCaseCauseHidden').value || '';
        selectedCauseValue = currentValue;
        const searchInput = document.getElementById('causeSearchInput');
        if (searchInput) searchInput.value = '';
        renderCauseTree();
        document.getElementById('causeSelectorModal').classList.add('show');
    }

    function closeCauseSelector() {
        document.getElementById('causeSelectorModal').classList.remove('show');
    }

    function renderCauseTree() {
        const container = document.getElementById('causeTreeContainer');
        if (!container) return;
        const tree = getCurrentCauseTree();
        container.innerHTML = tree.map((l1, i1) => {
            const l1Escaped = l1.name.replace(/'/g, "\\'");
            return `
            <div class="cause-level-1 ${l1.expanded ? 'expanded' : ''}" data-level="1" data-index="${i1}">
                <div class="cause-level-1-header" data-cause="${escapeHtml(l1.name)}" data-level="1" data-index="${i1}">
                    <i class="fas fa-chevron-right cause-expand-icon" onclick="event.stopPropagation(); window.AdminCases.toggleCauseLevel1(${i1})"></i>
                    <span class="cause-level-1-name" onclick="event.stopPropagation(); window.AdminCases.selectCause('${l1Escaped}')">${escapeHtml(l1.name)}</span>
                </div>
                <div class="cause-level-2-container">
                    ${l1.children.map((l2, i2) => {
                        if (typeof l2 === 'string') {
                            return renderCauseItem(l2, `l1-${i1}`);
                        }
                        const l2Escaped = l2.name.replace(/'/g, "\\'");
                        return `
                        <div class="cause-level-2 ${l2.expanded ? 'expanded' : ''}" data-level="2" data-index="${i1}-${i2}">
                            <div class="cause-level-2-header" data-cause="${escapeHtml(l2.name)}" data-level="2" data-index="${i1}-${i2}">
                                <i class="fas fa-chevron-right cause-expand-icon" onclick="event.stopPropagation(); window.AdminCases.toggleCauseLevel2(${i1}, ${i2})"></i>
                                <span class="cause-level-2-name" onclick="event.stopPropagation(); window.AdminCases.selectCause('${l2Escaped}')">${escapeHtml(l2.name)}</span>
                            </div>
                            <div class="cause-level-3-container">
                                ${(l2.children || []).map(c => renderCauseItem(c, `l2-${i1}-${i2}`)).join('')}
                            </div>
                        </div>`;
                    }).join('')}
                </div>
            </div>`;
        }).join('');
        updateCauseSelection();
    }

    function renderCauseItem(causeName, groupKey) {
        const escaped = causeName.replace(/'/g, "\\'");
        return `
            <div class="cause-item ${selectedCauseValue === causeName ? 'selected' : ''}" data-cause="${escapeHtml(causeName)}" data-group="${groupKey}" onclick="window.AdminCases.selectCause('${escaped}')">
                <span class="cause-name">${escapeHtml(causeName)}</span>
                <i class="fas fa-check-circle cause-check"></i>
            </div>`;
    }

    function toggleCauseLevel1(index) {
        const tree = getCurrentCauseTree();
        if (!tree[index]) return;
        tree[index].expanded = !tree[index].expanded;
        renderCauseTree();
    }

    function toggleCauseLevel2(i1, i2) {
        const tree = getCurrentCauseTree();
        const l2 = tree[i1] && tree[i1].children && tree[i1].children[i2];
        if (l2 && typeof l2 !== 'string') {
            l2.expanded = !l2.expanded;
            renderCauseTree();
        }
    }

    function selectCause(causeName) {
        selectedCauseValue = causeName;
        document.getElementById('editCaseCauseHidden').value = causeName;
        document.getElementById('editCaseCauseText').textContent = causeName;
        document.getElementById('editCaseCauseText').classList.remove('placeholder');
        updateCauseSelection();
        closeCauseSelector();
    }

    function updateCauseSelection() {
        document.querySelectorAll('#causeTreeContainer .cause-item').forEach(item => {
            item.classList.toggle('selected', item.dataset.cause === selectedCauseValue);
        });
        document.querySelectorAll('#causeTreeContainer .cause-level-1-header, #causeTreeContainer .cause-level-2-header').forEach(header => {
            header.classList.toggle('selected', header.dataset.cause === selectedCauseValue);
        });
    }

    function filterCauseTree() {
        const keyword = (document.getElementById('causeSearchInput').value || '').trim().toLowerCase();
        document.querySelectorAll('#causeTreeContainer .cause-item').forEach(item => {
            const name = (item.querySelector('.cause-name').textContent || '').toLowerCase();
            const match = !keyword || name.includes(keyword);
            item.style.display = match ? 'flex' : 'none';
            if (match && keyword) {
                let parent = item.closest('.cause-level-2');
                if (parent) parent.classList.add('expanded');
                parent = item.closest('.cause-level-1');
                if (parent) parent.classList.add('expanded');
            }
        });
    }

    // ===== 数据写入 =====
    function removeCaseFromBusinessSystems(caseId) {
        const system = businessSystems[currentBusiness];
        if (!system || !Array.isArray(system.cases)) return;
        const idx = system.cases.findIndex(c => c.id === caseId);
        if (idx >= 0) system.cases.splice(idx, 1);
    }

    function saveBusinessSystems() {
        try {
            localStorage.setItem(CASE_DATA_KEY, JSON.stringify(businessSystems));
        } catch (e) {
            console.error('[admin-cases] 保存失败:', e);
            showNotification('保存失败：' + e.message, 'error');
        }
    }

    // ===== 确认弹窗 =====
    function showConfirm(title, text, callback) {
        document.getElementById('confirmTitle').textContent = title;
        document.getElementById('confirmText').textContent = text;
        const btn = document.getElementById('confirmBtn');
        btn.className = 'btn btn-confirm';
        btn.textContent = '确认删除';
        confirmCallback = callback;
        document.getElementById('confirmModal').classList.add('show');
    }

    function closeConfirm() {
        document.getElementById('confirmModal').classList.remove('show');
        confirmCallback = null;
    }

    function execConfirm() {
        if (confirmCallback) confirmCallback();
        closeConfirm();
    }

    // ===== 通知 =====
    function showNotification(msg, type) {
        type = type || 'info';
        const colors = {
            success: '#10b981',
            error: '#ef4444',
            info: '#3b82f6'
        };
        const container = document.getElementById('notificationContainer');
        const div = document.createElement('div');
        div.style.cssText = `background:${colors[type] || colors.info};color:#fff;padding:10px 18px;border-radius:6px;margin-bottom:8px;font-size:14px;box-shadow:0 2px 8px rgba(0,0,0,0.15);opacity:0;transition:opacity 0.3s;`;
        div.textContent = msg;
        container.appendChild(div);
        requestAnimationFrame(() => div.style.opacity = '1');
        setTimeout(() => {
            div.style.opacity = '0';
            setTimeout(() => div.remove(), 300);
        }, 2500);
    }

    // ===== 工具 =====
    function escapeHtml(s) {
        if (s == null) return '';
        return String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    }

    function nowStr() {
        const d = new Date();
        const p = n => (n < 10 ? '0' + n : '' + n);
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    }

    // ===== 初始化 =====
    function init() {
        loadColumnConfig();
        loadData();
        rebuildDeptAndHandlerOptions();

        // 绑定事件
        document.getElementById('caseSearch').addEventListener('input', applyFilters);
        document.getElementById('deptFilter').addEventListener('change', applyFilters);
        document.getElementById('handlerFilter').addEventListener('change', applyFilters);
        document.getElementById('yearFilter').addEventListener('change', onYearChange);
        document.getElementById('dateFrom').addEventListener('change', applyFilters);
        document.getElementById('dateTo').addEventListener('change', applyFilters);
        document.getElementById('confirmBtn').addEventListener('click', execConfirm);

        // 点击外部关闭列配置面板
        document.addEventListener('click', function(e) {
            const panel = document.getElementById('colConfigPanel');
            const btn = document.querySelector('.col-config-toolbar-btn');
            if (panel && !panel.contains(e.target) && btn && !btn.contains(e.target)) {
                panel.classList.remove('show');
            }
        });

        applyFilters();
    }

    // 暴露到全局
    window.AdminCases = {
        toggleRow,
        toggleSelectAll,
        clearSelection,
        editCase,
        viewCase,
        openEditCase,
        closeEditCase,
        submitEditCase,
        openCauseSelector,
        closeCauseSelector,
        renderCauseTree,
        toggleCauseLevel1,
        toggleCauseLevel2,
        selectCause,
        filterCauseTree,
        deleteCase,
        restoreCase,
        batchDelete,
        goPage,
        changePageSize,
        resetFilters,
        toggleColConfig,
        toggleColumn,
        openMaterialTree,
        closeMaterialTree,
        openDocumentList,
        closeDocumentList,
        previewMaterial,
        previewDocument,
        closeContentPreview,
        closeConfirm,
        batchChangeHandler,
        openHandlerModal,
        closeHandlerModal,
        selectHandlerDept,
        onHandlerSearch,
        toggleHandlerUser,
        removeHandlerUser,
        submitHandlerChange
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

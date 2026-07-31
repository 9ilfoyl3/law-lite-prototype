/**
 * 管理后台 - 案件管理 MVP 逻辑
 * 依赖：case-data.js（businessSystems 全局变量、CASE_DATA_KEY）
 * 数据源：localStorage: caseAssistant_businessSystems + adminUsers
 */
(function() {
    'use strict';

    // ===== 全局状态 =====
    let allCases = [];          // 合并后的所有案件（带 org 标签）
    let filteredCases = [];     // 筛选后的案件
    let users = [];             // 用户表（用于反查部门）
    let userDeptMap = {};       // handler -> dept 映射
    let selectedIds = new Set();// 已选案件 ID
    let currentPage = 1;
    let pageSize = 20;
    let currentBusiness = 'court'; // 当前业务系统（默认法院，与用户侧一致）

    const ORG_LABELS = {
        court: '法院',
        procuratorate: '检察院',
        justice: '司法局'
    };

    // ===== 数据加载 =====
    function loadData() {
        // 加载用户表，构建 handler -> dept 映射
        try {
            users = JSON.parse(localStorage.getItem('adminUsers')) || [];
        } catch (e) {
            users = [];
        }
        userDeptMap = {};
        users.forEach(u => {
            if (u.name) userDeptMap[u.name] = u.dept || '-';
        });

        // 从 localStorage 读取当前业务系统（与用户侧 cases.js 共享）
        currentBusiness = localStorage.getItem('currentBusiness') || 'court';

        // 仅加载当前业务系统的案件
        allCases = [];
        if (typeof businessSystems === 'undefined') {
            console.error('[admin-cases] businessSystems 未定义，请确认 case-data.js 已加载');
            return;
        }
        const system = businessSystems[currentBusiness];
        if (system && Array.isArray(system.cases)) {
            system.cases.forEach(c => {
                allCases.push({ ...c, _org: currentBusiness });
            });
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

    // 判断是否有 解析异常
    function hasOcrError(c) {
        if (!Array.isArray(c.files)) return false;
        return c.files.some(f => f && f.ocrStatus === 'error');
    }

    // 解析异常材料数
    function getOcrErrorCount(c) {
        if (!Array.isArray(c.files)) return 0;
        return c.files.filter(f => f && f.ocrStatus === 'error').length;
    }

    // ===== 筛选 =====
    function applyFilters() {
        const search = document.getElementById('caseSearch').value.toLowerCase().trim();
        const dept = document.getElementById('deptFilter').value;
        const handler = document.getElementById('handlerFilter').value;
        const year = document.getElementById('yearFilter').value;

        filteredCases = allCases.filter(c => {
            // 关键词搜索：案件名称/案号/当事人
            if (search) {
                const hay = `${c.caseName || ''} ${c.caseNumber || ''} ${c.partyA || ''} ${c.partyB || ''}`.toLowerCase();
                if (!hay.includes(search)) return false;
            }
            // 部门
            if (dept && getDeptOf(c) !== dept) return false;
            // 承办人（v1.39: 多承办人——命中任一承办人即保留）
            if (handler && getCaseHandlers(c).indexOf(handler) < 0) return false;
            // 年份
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

        // 按更新时间倒序
        filteredCases.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));

        currentPage = 1;
        render();
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
                <div class="grid-row" style="display:block;">
                    <div class="empty-state" style="grid-column: 1 / -1;">
                        <i class="fas fa-folder-open"></i>
                        <p>暂无符合条件的案件</p>
                    </div>
                </div>`;
            // 修正：空状态直接覆盖
            gridBody.innerHTML = `
                <div style="padding: 60px 20px; text-align:center; color:#9ca3af;">
                    <i class="fas fa-folder-open" style="font-size:48px; margin-bottom:12px; color:#e5e7eb;"></i>
                    <p style="font-size:14px; margin:0;">暂无符合条件的案件</p>
                </div>`;
            return;
        }

        gridBody.innerHTML = pageData.map(c => {
            const dept = getDeptOf(c);
            const docCount = getDocCount(c);
            const ocrError = hasOcrError(c);
            const ocrErrCount = getOcrErrorCount(c);
            const isDeleted = !!c.isDeleted;
            const fileCountCell = ocrError
                ? `<span class="file-count-cell has-error" title="存在 ${ocrErrCount} 份 解析异常材料">${c.fileCount || 0}</span>`
                : `${c.fileCount || 0}`;
            const checked = selectedIds.has(c.id) ? 'checked' : '';
            const rowCls = [ocrError ? 'has-ocr-error' : '', isDeleted ? 'is-deleted-row' : ''].join(' ').trim();
            const deletedBadge = isDeleted ? `<span class="deleted-badge" title="软删除于 ${c.deletedAt || '-'}">已删除</span>` : '';

            // E3: 已删除行操作列显示「查看(只读) / 恢复」；未删除行显示「编辑 / 改承办人 / 删除」
            const actionCell = isDeleted
                ? `<div class="action-cell">
                        <button class="action-btn view" onclick="window.AdminCases.viewCase('${c.id}')">查看</button>
                        <button class="action-btn restore" onclick="window.AdminCases.restoreCase('${c.id}')">恢复</button>
                   </div>`
                : `<div class="action-cell">
                        <button class="action-btn view" onclick="window.AdminCases.editCase('${c.id}')">编辑</button>
                        <button class="action-btn handler" onclick="window.AdminCases.changeHandler('${c.id}')">改承办人</button>
                        <button class="action-btn delete" onclick="window.AdminCases.deleteCase('${c.id}')">删除</button>
                   </div>`;

            // E3: 未删除案件名称链接跳转可编辑模式（无 readonly），已删除案件保持只读
            const caseNameHref = isDeleted
                ? `../../pages/case-files.html?caseId=${encodeURIComponent(c.id)}&readonly=1`
                : `../../pages/case-files.html?caseId=${encodeURIComponent(c.id)}`;

            return `
                <div class="grid-row ${rowCls}" data-case-id="${c.id}">
                    <div class="col-center">
                        <input type="checkbox" class="row-check" data-case-id="${c.id}" ${checked} onchange="window.AdminCases.toggleRow('${c.id}', this.checked)">
                    </div>
                    <div>
                        <a class="case-name-link" href="${caseNameHref}" target="_blank" title="${escapeHtml(c.caseName || '')}">${escapeHtml(c.caseName || '-')}</a>${deletedBadge}
                    </div>
                    <div title="${escapeHtml(c.caseNumber || '')}">${escapeHtml(c.caseNumber || '-')}</div>
                    <div title="${escapeHtml(c.cause || '')}">${escapeHtml(c.cause || '-')}</div>
                    <div title="${escapeHtml(getCaseHandlers(c).join('、'))}">${escapeHtml(getCaseHandlers(c).join('、') || '-')}</div>
                    <div>${escapeHtml(dept)}</div>
                    <div class="col-center">${fileCountCell}</div>
                    <div class="col-center">${docCount}</div>
                    <div class="col-center">${escapeHtml(c.updatedAt || '-')}</div>
                    ${actionCell}
                </div>`;
        }).join('');
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
        // 上一页
        html += `<button class="page-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="window.AdminCases.goPage(${currentPage - 1})"><i class="fas fa-chevron-left"></i></button>`;
        // 页码（最多显示 7 个）
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
        // 下一页
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
        // 全选框状态：当前页全部选中则勾选
        const start = (currentPage - 1) * pageSize;
        const end = start + pageSize;
        const pageData = filteredCases.slice(start, end);
        const allChecked = pageData.length > 0 && pageData.every(c => selectedIds.has(c.id));
        selectAll.checked = allChecked;
        selectAll.indeterminate = !allChecked && pageData.some(c => selectedIds.has(c.id));
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

    // ===== 行内操作 =====
    // E3: 已删除案件只读查看
    function viewCase(caseId) {
        window.open(`../../pages/case-files.html?caseId=${encodeURIComponent(caseId)}&readonly=1`, '_blank');
    }

    // v1.43: 编辑案件改为弹框编辑结构化信息（与用户侧 cases.html 编辑按钮交互一致）
    function editCase(caseId) {
        openEditCase(caseId);
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

    // 恢复软删除案件：清除 isDeleted / deletedAt 字段，案件重新对用户侧可见
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

    // ===== 改承办人（v1.39: 多选）=====
    let handlerAction = null; // { type: 'single'|'batch', caseId? }

    function buildHandlerOptions() {
        // 从用户表取 active 用户名，去重排序
        const names = [...new Set(users.filter(u => u.status === 'active').map(u => u.name).filter(Boolean))].sort();
        return names;
    }

    // v1.39: 渲染承办人多选 checkbox 列表（替代原 select 单选）
    // selectedNames: 预选中的姓名数组
    function renderHandlerCheckboxes(selectedNames) {
        const container = document.getElementById('handlerNew');
        if (!container) return;
        const names = buildHandlerOptions();
        const selectedSet = new Set((selectedNames || []).filter(Boolean));
        if (names.length === 0) {
            container.innerHTML = '<div style="padding:12px; color:var(--text-muted); font-size:13px;">暂无活跃用户，请先在用户管理中创建</div>';
            return;
        }
        container.innerHTML = names.map(n => `
            <label style="display:flex; align-items:center; padding:7px 10px; cursor:pointer; border-radius:4px; transition:background 0.15s;"
                   onmouseover="this.style.background='var(--bg-secondary)'"
                   onmouseout="this.style.background='transparent'">
                <input type="checkbox" value="${escapeHtml(n)}" ${selectedSet.has(n) ? 'checked' : ''} style="margin-right:10px; cursor:pointer;">
                <span style="font-size:14px; color:var(--text-primary);">${escapeHtml(n)}</span>
            </label>
        `).join('');
    }

    // 收集弹窗中勾选的承办人姓名数组
    function getSelectedHandlerNames() {
        const checkboxes = document.querySelectorAll('#handlerNew input[type="checkbox"]:checked');
        return Array.from(checkboxes).map(cb => cb.value).filter(Boolean);
    }

    function changeHandler(caseId) {
        const c = allCases.find(x => x.id === caseId);
        if (!c) return;
        handlerAction = { type: 'single', caseId };
        document.getElementById('handlerModalTitle').textContent = '修改承办人（可多选）';
        document.getElementById('handlerCaseLabel').textContent = '案件';
        document.getElementById('handlerCaseName').textContent = c.caseName || c.caseNumber || '-';
        document.getElementById('handlerCurrent').textContent = getCaseHandlers(c).join('、') || '-';
        // 预选中当前承办人
        renderHandlerCheckboxes(getCaseHandlers(c));
        document.getElementById('handlerConfirmBtn').textContent = '确认修改';
        document.getElementById('handlerModal').classList.add('show');
    }

    function batchChangeHandler() {
        if (selectedIds.size === 0) return;
        handlerAction = { type: 'batch' };
        document.getElementById('handlerModalTitle').textContent = '修改承办人（可多选）';
        document.getElementById('handlerCaseLabel').textContent = '已选案件';
        document.getElementById('handlerCaseName').textContent = `共 ${selectedIds.size} 件`;
        document.getElementById('handlerCurrent').textContent = '（将统一替换为新承办人列表）';
        renderHandlerCheckboxes([]);
        document.getElementById('handlerConfirmBtn').textContent = '确认批量修改';
        document.getElementById('handlerModal').classList.add('show');
    }

    function closeHandlerModal() {
        document.getElementById('handlerModal').classList.remove('show');
        handlerAction = null;
    }

    function execChangeHandler() {
        if (!handlerAction) return;
        const newNames = getSelectedHandlerNames();
        if (newNames.length === 0) {
            showNotification('请至少选择一名承办人', 'info');
            return;
        }
        const newLabel = newNames.join('、');
        if (handlerAction.type === 'single') {
            const c = allCases.find(x => x.id === handlerAction.caseId);
            if (!c) { closeHandlerModal(); return; }
            const oldLabel = getCaseHandlers(c).join('、') || '-';
            // v1.39: 写入 handlers 数组，同步 handler 为第一个（向后兼容）
            c.handlers = newNames.slice();
            c.handler = newNames[0];
            c.updatedAt = nowStr();
            saveBusinessSystems();
            console.log(`[admin-cases] 改承办人: ${c.id} (${c.caseName}) ${oldLabel} → ${newLabel}`);
            showNotification(`已将「${c.caseName}」承办人改为 ${newLabel}`, 'success');
            // 单个直接执行（无需二次确认）
            loadData();
            applyFilters();
            closeHandlerModal();
        } else {
            // 批量
            showConfirm(
                '批量改承办人确认',
                `确定将选中的 ${selectedIds.size} 件案件的承办人改为 ${newLabel} 吗？`,
                () => {
                    let count = 0;
                    selectedIds.forEach(id => {
                        const c = allCases.find(x => x.id === id);
                        if (c) {
                            const oldLabel = getCaseHandlers(c).join('、') || '-';
                            c.handlers = newNames.slice();
                            c.handler = newNames[0];
                            c.updatedAt = nowStr();
                            console.log(`[admin-cases] 批量改承办人: ${c.id} (${c.caseName}) ${oldLabel} → ${newLabel}`);
                            count++;
                        }
                    });
                    saveBusinessSystems();
                    showNotification(`已将 ${count} 件案件承办人改为 ${newLabel}`, 'success');
                    selectedIds.clear();
                    loadData();
                    applyFilters();
                }
            );
            closeHandlerModal();
        }
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

    // ===== 编辑案件弹框（v1.43：与用户侧 cases.html 编辑按钮交互一致）=====
    let editingCaseId = '';
    // 案由树选择器状态（参考用户侧 cases.js 同名实现）
    let selectedCauseValue = '';

    // 取当前业务系统的案由树（带深拷贝，避免污染全局常量）
    function getCurrentCauseTree() {
        const src = (typeof causeTreeDataByOrg !== 'undefined' && causeTreeDataByOrg[currentBusiness]) || [];
        // 深拷贝并补全 expanded 字段
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

    function openEditCase(caseId) {
        const c = allCases.find(x => x.id === caseId);
        if (!c) return;
        editingCaseId = caseId;

        // 当事人标签随业务系统联动
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
        // （allCases 中的元素是 {...c} 浅拷贝，修改它不会同步到 businessSystems）
        const system = (typeof businessSystems !== 'undefined' && businessSystems[currentBusiness]) || null;
        const c = system && Array.isArray(system.cases)
            ? system.cases.find(x => x.id === editingCaseId)
            : null;
        if (!c) { closeEditCase(); return; }

        const cause = document.getElementById('editCaseCauseHidden').value;
        // type 通过 getCauseType 自动推导；若案由为空则保留原 type
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
        // 留空则保留原承办人，不清空

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
        const escaped = causeName.replace(/'/g, "\\'");
        return `
            <div class="cause-item ${selectedCauseValue === causeName ? 'selected' : ''}" data-cause="${escapeHtml(causeName)}" data-group="${groupKey}" onclick="window.AdminCases.selectCause('${escaped}')">
                <span class="cause-name">${escapeHtml(causeName)}</span>
                <i class="fas fa-check-circle cause-check"></i>
            </div>
        `;
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
            const isSelected = header.dataset.cause === selectedCauseValue;
            header.classList.toggle('selected', isSelected);
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

    // ===== 筛选栏联动 =====
    function rebuildDeptAndHandlerOptions() {
        const deptFilter = document.getElementById('deptFilter');
        const handlerFilter = document.getElementById('handlerFilter');

        // 收集部门（从用户表）
        const depts = new Set();
        users.forEach(u => {
            if (u.dept) depts.add(u.dept);
        });

        // 收集承办人（仅当前业务系统下；v1.39: 多承办人聚合）
        const handlers = new Set();
        allCases.forEach(c => {
            getCaseHandlers(c).forEach(h => { if (h) handlers.add(h); });
        });

        // 渲染部门下拉
        const curDept = deptFilter.value;
        deptFilter.innerHTML = '<option value="">全部部门</option>' +
            Array.from(depts).sort().map(d => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join('');
        deptFilter.value = curDept;

        // 渲染承办人下拉
        const curHandler = handlerFilter.value;
        handlerFilter.innerHTML = '<option value="">全部承办人</option>' +
            Array.from(handlers).sort().map(h => `<option value="${escapeHtml(h)}">${escapeHtml(h)}</option>`).join('');
        handlerFilter.value = curHandler;
    }

    // ===== 业务系统切换 =====
    function switchBusiness(type) {
        if (type === currentBusiness) return;
        currentBusiness = type;
        localStorage.setItem('currentBusiness', type);
        selectedIds.clear();

        // 更新按钮高亮
        document.querySelectorAll('.business-switch-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.type === type);
        });

        // 重新加载数据并刷新
        loadData();
        rebuildDeptAndHandlerOptions();
        applyFilters();
        console.log(`[admin-cases] 切换业务系统: ${type}`);
    }

    function resetFilters() {
        document.getElementById('caseSearch').value = '';
        document.getElementById('deptFilter').value = '';
        document.getElementById('handlerFilter').value = '';
        document.getElementById('yearFilter').value = '';
        document.getElementById('dateFrom').value = '';
        document.getElementById('dateTo').value = '';
        document.getElementById('customDateBar').style.display = 'none';
        rebuildDeptAndHandlerOptions();
        applyFilters();
    }

    function onYearChange() {
        const year = document.getElementById('yearFilter').value;
        document.getElementById('customDateBar').style.display = (year === 'custom') ? 'flex' : 'none';
        applyFilters();
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

    // ===== 确认弹窗 =====
    let confirmCallback = null;
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
        loadData();

        // 同步业务系统按钮高亮状态
        document.querySelectorAll('.business-switch-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.type === currentBusiness);
        });

        rebuildDeptAndHandlerOptions();

        // 绑定事件
        document.getElementById('caseSearch').addEventListener('input', applyFilters);
        document.getElementById('deptFilter').addEventListener('change', applyFilters);
        document.getElementById('handlerFilter').addEventListener('change', applyFilters);
        document.getElementById('yearFilter').addEventListener('change', onYearChange);
        document.getElementById('dateFrom').addEventListener('change', applyFilters);
        document.getElementById('dateTo').addEventListener('change', applyFilters);
        document.getElementById('confirmBtn').addEventListener('click', execConfirm);

        applyFilters();
    }

    // 暴露到全局
    window.AdminCases = {
        toggleRow,
        toggleSelectAll,
        clearSelection,
        viewCase,
        editCase,
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
        changeHandler,
        batchChangeHandler,
        closeHandlerModal,
        execChangeHandler,
        deleteCase,
        restoreCase,
        batchDelete,
        goPage,
        changePageSize,
        resetFilters,
        switchBusiness
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

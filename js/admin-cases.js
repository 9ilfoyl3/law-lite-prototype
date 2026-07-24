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
            // 承办人
            if (handler && c.handler !== handler) return false;
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
            const fileCountCell = ocrError
                ? `<span class="file-count-cell has-error" title="存在 ${ocrErrCount} 份 解析异常材料">${c.fileCount || 0}</span>`
                : `${c.fileCount || 0}`;
            const checked = selectedIds.has(c.id) ? 'checked' : '';

            return `
                <div class="grid-row ${ocrError ? 'has-ocr-error' : ''}" data-case-id="${c.id}">
                    <div class="col-center">
                        <input type="checkbox" class="row-check" data-case-id="${c.id}" ${checked} onchange="window.AdminCases.toggleRow('${c.id}', this.checked)">
                    </div>
                    <div>
                        <a class="case-name-link" href="../../pages/case-files.html?caseId=${encodeURIComponent(c.id)}&readonly=1" target="_blank" title="${escapeHtml(c.caseName || '')}">${escapeHtml(c.caseName || '-')}</a>
                    </div>
                    <div title="${escapeHtml(c.caseNumber || '')}">${escapeHtml(c.caseNumber || '-')}</div>
                    <div title="${escapeHtml(c.cause || '')}">${escapeHtml(c.cause || '-')}</div>
                    <div>${escapeHtml(c.handler || '-')}</div>
                    <div>${escapeHtml(dept)}</div>
                    <div class="col-center">${fileCountCell}</div>
                    <div class="col-center">${docCount}</div>
                    <div class="col-center">${escapeHtml(c.updatedAt || '-')}</div>
                    <div class="action-cell">
                        <button class="action-btn view" onclick="window.AdminCases.viewCase('${c.id}')">查看</button>
                        <button class="action-btn handler" onclick="window.AdminCases.changeHandler('${c.id}')">改承办人</button>
                        <button class="action-btn delete" onclick="window.AdminCases.deleteCase('${c.id}')">删除</button>
                    </div>
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
    function viewCase(caseId) {
        window.open(`../../pages/case-files.html?caseId=${encodeURIComponent(caseId)}&readonly=1`, '_blank');
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

    // ===== 改承办人 =====
    let handlerAction = null; // { type: 'single'|'batch', caseId? }

    function buildHandlerOptions() {
        // 从用户表取 active 用户名，去重排序
        const names = [...new Set(users.filter(u => u.status === 'active').map(u => u.name).filter(Boolean))].sort();
        return names;
    }

    function changeHandler(caseId) {
        const c = allCases.find(x => x.id === caseId);
        if (!c) return;
        handlerAction = { type: 'single', caseId };
        document.getElementById('handlerModalTitle').textContent = '改承办人';
        document.getElementById('handlerCaseLabel').textContent = '案件';
        document.getElementById('handlerCaseName').textContent = c.caseName || c.caseNumber || '-';
        document.getElementById('handlerCurrent').textContent = c.handler || '-';
        const sel = document.getElementById('handlerNew');
        sel.innerHTML = '<option value="">请选择...</option>' +
            buildHandlerOptions().map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
        document.getElementById('handlerConfirmBtn').textContent = '确认修改';
        document.getElementById('handlerModal').classList.add('show');
    }

    function batchChangeHandler() {
        if (selectedIds.size === 0) return;
        handlerAction = { type: 'batch' };
        document.getElementById('handlerModalTitle').textContent = '批量改承办人';
        document.getElementById('handlerCaseLabel').textContent = '已选案件';
        document.getElementById('handlerCaseName').textContent = `共 ${selectedIds.size} 件`;
        document.getElementById('handlerCurrent').textContent = '（将统一替换为新承办人）';
        const sel = document.getElementById('handlerNew');
        sel.innerHTML = '<option value="">请选择...</option>' +
            buildHandlerOptions().map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
        document.getElementById('handlerConfirmBtn').textContent = '确认批量修改';
        document.getElementById('handlerModal').classList.add('show');
    }

    function closeHandlerModal() {
        document.getElementById('handlerModal').classList.remove('show');
        handlerAction = null;
    }

    function execChangeHandler() {
        if (!handlerAction) return;
        const newName = document.getElementById('handlerNew').value;
        if (!newName) {
            showNotification('请选择新承办人', 'info');
            return;
        }
        if (handlerAction.type === 'single') {
            const c = allCases.find(x => x.id === handlerAction.caseId);
            if (!c) { closeHandlerModal(); return; }
            const oldName = c.handler || '-';
            c.handler = newName;
            c.updatedAt = nowStr();
            saveBusinessSystems();
            console.log(`[admin-cases] 改承办人: ${c.id} (${c.caseName}) ${oldName} → ${newName}`);
            showNotification(`已将「${c.caseName}」承办人改为 ${newName}`, 'success');
        } else {
            // 批量
            showConfirm(
                '批量改承办人确认',
                `确定将选中的 ${selectedIds.size} 件案件的承办人改为 ${newName} 吗？`,
                () => {
                    let count = 0;
                    selectedIds.forEach(id => {
                        const c = allCases.find(x => x.id === id);
                        if (c) {
                            const oldName = c.handler || '-';
                            c.handler = newName;
                            c.updatedAt = nowStr();
                            console.log(`[admin-cases] 批量改承办人: ${c.id} (${c.caseName}) ${oldName} → ${newName}`);
                            count++;
                        }
                    });
                    saveBusinessSystems();
                    showNotification(`已将 ${count} 件案件承办人改为 ${newName}`, 'success');
                    selectedIds.clear();
                    loadData();
                    applyFilters();
                }
            );
        }
        if (handlerAction.type === 'single') {
            // 单个直接执行（无需二次确认）
            loadData();
            applyFilters();
        }
        closeHandlerModal();
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

        // 收集承办人（仅当前业务系统下）
        const handlers = new Set();
        allCases.forEach(c => {
            if (c.handler) handlers.add(c.handler);
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
        changeHandler,
        batchChangeHandler,
        closeHandlerModal,
        execChangeHandler,
        deleteCase,
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

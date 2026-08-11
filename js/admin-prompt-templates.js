// ============ Admin Prompt Templates Management ============
// v1.0 指令管理：维护各文书类型的指令
// 数据持久化：localStorage.adminPromptTemplates（按业务系统×文书类型分组）
// 用户侧联动：case-data.js getReqTemplates 优先读此 key，为空回退到 defaultRequirementTemplates
// v1.2: 移除全局「恢复默认」按钮；新增单条历史版本记录（最多 10 条快照，支持一键恢复）

(function() {
    'use strict';

    // ===== 状态 =====
    let currentOrg = 'court';
    let currentDocTypeFilter = ''; // '' = 全部
    let editingDocType = null;    // 编辑模式下当前所属文书类型 key
    let editingIndex = -1;        // 编辑模式下数组下标
    let editingIsBuiltin = false; // 编辑的是内置指令
    let pendingConfirmAction = null;

    // ===== 存储 =====
    function getStorage() {
        try {
            return JSON.parse(localStorage.getItem('adminPromptTemplates')) || {};
        } catch (e) {
            return {};
        }
    }
    function saveStorage(data) {
        localStorage.setItem('adminPromptTemplates', JSON.stringify(data));
    }
    function getOrgData(org) {
        const all = getStorage();
        return all[org] || {};
    }
    function setOrgData(org, data) {
        const all = getStorage();
        all[org] = data;
        saveStorage(all);
    }

    // 获取当前业务系统的文书类型映射（v1.21: 统一走 getAdminDocTypes 合并源）
    function getDocTypes(org) {
        return getAdminDocTypes(org) || {};
    }

    // 获取当前业务系统下被停用的内置指令索引字典
    // 存于 adminPromptTemplates[org].__builtinDisabled__，结构：{ docTypeKey: [index1, index2] }
    function getBuiltinDisabledMap(org) {
        const orgData = getOrgData(org);
        return (orgData.__builtinDisabled__ && typeof orgData.__builtinDisabled__ === 'object') ? orgData.__builtinDisabled__ : {};
    }

    // 获取当前业务系统+文书类型下的指令列表（内置 + 自定义）
    // 返回统一结构：[{name, text, isBuiltin, index, enabled, history}]
    function getAllPrompts(org, docTypeKey) {
        const defaults = (defaultRequirementTemplates[org] && defaultRequirementTemplates[org][docTypeKey]) || [];
        const customs = (getOrgData(org)[docTypeKey]) || [];

        // 若该文书类型已有自定义数据，自定义完全覆盖内置
        if (customs.length > 0) {
            return customs.map((p, i) => ({
                name: p.name || '',
                text: p.text || '',
                isBuiltin: false,
                index: i,
                enabled: p.enabled !== false,
                history: Array.isArray(p.history) ? p.history : []
            }));
        }
        const disabledArr = getBuiltinDisabledMap(org)[docTypeKey] || [];
        return defaults.map((p, i) => ({
            name: p.name || '',
            text: p.text || '',
            isBuiltin: true,
            index: i,
            enabled: !disabledArr.includes(i),
            history: []  // 内置未编辑过时无历史
        }));
    }

    // ===== 通知 =====
    function showNotification(msg, type) {
        type = type || 'success';
        const icons = { success: 'fa-check-circle', error: 'fa-times-circle', warning: 'fa-exclamation-circle' };
        const div = document.createElement('div');
        div.className = 'notification ' + type;
        div.innerHTML = '<i class="fas ' + (icons[type] || icons.success) + '"></i><span>' + msg + '</span>';
        document.getElementById('notificationContainer').appendChild(div);
        setTimeout(() => div.remove(), 2600);
    }

    function escapeHtml(s) {
        if (s === undefined || s === null) return '';
        return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    }

    // ===== 业务系统切换 =====
    window.switchBusiness = function(type) {
        if (type === currentOrg) return;
        currentOrg = type;
        currentDocTypeFilter = '';
        document.querySelectorAll('.business-switch-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.type === type);
        });
        renderLeft();
        renderRight();
    };

    // ===== 渲染左侧 =====
    function renderLeft() {
        const docTypes = getDocTypes(currentOrg);
        let totalCount = 0;
        Object.keys(docTypes).forEach(key => {
            totalCount += getAllPrompts(currentOrg, key).length;
        });

        const leftEl = document.getElementById('ptLeft');
        let html = '<div class="pt-left-item' + (currentDocTypeFilter === '' ? ' active' : '') + '" onclick="selectDocType(\'\')">'
            + '<i class="fas fa-layer-group"></i><span>全部</span><span class="count">' + totalCount + '</span></div>';

        Object.entries(docTypes).forEach(([key, cfg]) => {
            const count = getAllPrompts(currentOrg, key).length;
            html += '<div class="pt-left-item' + (currentDocTypeFilter === key ? ' active' : '') + '" onclick="selectDocType(\'' + key + '\')">'
                + '<i class="fas ' + (cfg.icon || 'fa-folder') + '"></i>'
                + '<span>' + escapeHtml(cfg.name) + '</span>'
                + '<span class="count">' + count + '</span></div>';
        });
        leftEl.innerHTML = html;
    }
    window.selectDocType = function(key) {
        currentDocTypeFilter = key;
        renderLeft();
        renderRight();
    };

    // ===== 渲染右侧 =====
    function renderRight() {
        const docTypes = getDocTypes(currentOrg);
        const rightTitle = document.getElementById('rightTitle');
        if (currentDocTypeFilter) {
            rightTitle.textContent = (docTypes[currentDocTypeFilter] || {}).name || '指令列表';
        } else {
            rightTitle.textContent = '全部指令';
        }

        const list = document.getElementById('ptList');
        const empty = document.getElementById('emptyState');

        const docTypeKeys = currentDocTypeFilter ? [currentDocTypeFilter] : Object.keys(docTypes);
        const groups = docTypeKeys.map(key => ({
            docTypeKey: key,
            docTypeName: (docTypes[key] || {}).name || key,
            items: getAllPrompts(currentOrg, key)
        })).filter(g => g.items.length > 0);

        if (groups.length === 0 || groups.every(g => g.items.length === 0)) {
            list.innerHTML = '';
            empty.style.display = 'block';
            return;
        }
        empty.style.display = 'none';

        let html = '';
        groups.forEach(g => {
            // 全部视图下显示文书类型分组标题
            if (!currentDocTypeFilter) {
                html += '<div style="padding:10px 18px 4px; font-size:12px; font-weight:600; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.4px;">'
                    + escapeHtml(g.docTypeName) + '</div>';
            }
            g.items.forEach(item => {
                const text = item.text || '';
                const preview = text.length > 200 ? text.slice(0, 200) : text;
                const needCollapse = text.length > 80;
                const tagClass = item.isBuiltin ? 'builtin' : 'custom';
                const tagText = item.isBuiltin ? '内置' : '自定义';
                const isEnabled = item.enabled !== false;
                const statusBadge = isEnabled
                    ? '<span class="status-badge status-on">已启用</span>'
                    : '<span class="status-badge status-off">已停用</span>';
                const toggleBtn = isEnabled
                    ? '<button class="action-btn toggle-off" onclick="togglePromptEnabled(\'' + g.docTypeKey + '\',' + item.index + ')">停用</button>'
                    : '<button class="action-btn toggle-on" onclick="togglePromptEnabled(\'' + g.docTypeKey + '\',' + item.index + ')">启用</button>';
                // v1.2 历史按钮：history 长度为 0 时置灰
                const histCount = (item.history && item.history.length) || 0;
                const histBtn = histCount > 0
                    ? '<button class="action-btn history" title="历史版本（' + histCount + '）" onclick="openHistoryModal(\'' + g.docTypeKey + '\',' + item.index + ')">历史<span class="hist-count">' + histCount + '</span></button>'
                    : '<button class="action-btn history" disabled title="暂无历史版本">历史</button>';
                const actions = item.isBuiltin
                    ? '<button class="action-btn edit" onclick="editPrompt(\'' + g.docTypeKey + '\',' + item.index + ')">编辑</button>' + histBtn + toggleBtn
                    : '<button class="action-btn edit" onclick="editPrompt(\'' + g.docTypeKey + '\',' + item.index + ')">编辑</button>'
                      + histBtn
                      + toggleBtn
                      + '<button class="action-btn delete" onclick="deletePrompt(\'' + g.docTypeKey + '\',' + item.index + ')">删除</button>';
                html += '<div class="pt-item">'
                    + '<div class="pt-item-tag ' + tagClass + '">' + tagText + '</div>'
                    + '<div class="pt-item-body">'
                    + '<div class="pt-item-text' + (needCollapse ? ' collapsed' : '') + '">' + (escapeHtml(preview) || '<span style="color:var(--text-muted);font-style:italic;">（空指令）</span>') + '</div>'
                    + '<div class="pt-item-meta"><span>标签：' + escapeHtml(item.name) + '</span>' + statusBadge + '</div>'
                    + '</div>'
                    + '<div class="pt-item-actions">' + actions + '</div>'
                    + '</div>';
            });
        });
        list.innerHTML = html;
    }

    // ===== 新增/编辑弹窗 =====
    window.openAddModal = function() {
        editingDocType = null;
        editingIndex = -1;
        editingIsBuiltin = false;
        document.getElementById('modalTitle').textContent = '新增指令';
        document.getElementById('ptName').value = '';
        document.getElementById('ptText').value = '';
        fillDocTypeSelect(currentDocTypeFilter || '');
        document.getElementById('ptDocType').disabled = false;
        document.getElementById('ptModal').classList.add('show');
        setTimeout(() => document.getElementById('ptName').focus(), 50);
    };

    window.editPrompt = function(docTypeKey, index) {
        const items = getAllPrompts(currentOrg, docTypeKey);
        const item = items[index];
        if (!item) return;
        editingDocType = docTypeKey;
        editingIndex = index;
        editingIsBuiltin = !!item.isBuiltin;
        document.getElementById('modalTitle').textContent = editingIsBuiltin ? '编辑内置指令（另存为自定义）' : '编辑指令';
        document.getElementById('ptName').value = item.name;
        document.getElementById('ptText').value = item.text;
        fillDocTypeSelect(docTypeKey);
        // 编辑内置时禁用文书类型切换，避免逻辑歧义（内置只能在原类型上覆盖）
        document.getElementById('ptDocType').disabled = editingIsBuiltin;
        document.getElementById('ptModal').classList.add('show');
    };

    window.closeModal = function() {
        document.getElementById('ptModal').classList.remove('show');
        editingDocType = null;
        editingIndex = -1;
        editingIsBuiltin = false;
    };

    function fillDocTypeSelect(selected) {
        const docTypes = getDocTypes(currentOrg);
        const sel = document.getElementById('ptDocType');
        sel.innerHTML = '<option value="">请选择...</option>' + Object.entries(docTypes).map(([key, cfg]) =>
            '<option value="' + key + '"' + (key === selected ? ' selected' : '') + '>' + escapeHtml(cfg.name) + '</option>'
        ).join('');
    }

    window.savePrompt = function() {
        const docType = document.getElementById('ptDocType').value;
        const name = document.getElementById('ptName').value.trim();
        const text = document.getElementById('ptText').value;

        if (!docType) {
            showNotification('请选择所属文书类型', 'error');
            return;
        }
        if (!name) {
            showNotification('请填写标签名', 'error');
            document.getElementById('ptName').focus();
            return;
        }
        // text 允许为空（用于「其他自定义」这类清空需求的标签），但需提示
        if (!text && !confirm('指令正文为空，用户点击该标签会清空指令输入框。确认保存？')) {
            return;
        }

        const orgData = getOrgData(currentOrg);
        // 确保该文书类型有数组（编辑内置时也需创建自定义数组覆盖）
        if (!Array.isArray(orgData[docType])) {
            orgData[docType] = [];
        }

        // v1.2 历史版本管理工具
        const HISTORY_MAX = 10;
        function pushHistory(prevHistory, snapshot) {
            const arr = Array.isArray(prevHistory) ? prevHistory.slice() : [];
            arr.unshift(snapshot);  // 头部追加（最新在前）
            if (arr.length > HISTORY_MAX) arr.length = HISTORY_MAX;  // 截断
            return arr;
        }

        // 编辑内置指令：把内置数据全部拷贝为自定义，再修改对应项
        if (editingIsBuiltin && editingDocType === docType) {
            const defaults = (defaultRequirementTemplates[currentOrg] && defaultRequirementTemplates[currentOrg][docType]) || [];
            const disabledArr = getBuiltinDisabledMap(currentOrg)[docType] || [];
            // v1.2 拷贝内置数组，保留原停用状态与已有 history（首次编辑时 history 为空）
            orgData[docType] = defaults.map((p, i) => ({
                name: p.name,
                text: p.text,
                enabled: !disabledArr.includes(i),
                history: []
            }));
            // v1.2 被编辑的项：原内置内容入栈 history，再覆盖为新内容
            const origBuiltin = defaults[editingIndex] || { name: '', text: '' };
            const newHistory = pushHistory([], {
                savedAt: Date.now(),
                name: origBuiltin.name || '',
                text: origBuiltin.text || ''
            });
            orgData[docType][editingIndex] = {
                name: name,
                text: text,
                enabled: !disabledArr.includes(editingIndex),
                history: newHistory
            };
            // 清理 __builtinDisabled__ 中该 docTypeKey（已全部转为自定义）
            if (orgData.__builtinDisabled__ && orgData.__builtinDisabled__[docType]) {
                delete orgData.__builtinDisabled__[docType];
            }
        } else if (editingDocType !== null && !editingIsBuiltin && editingDocType === docType) {
            // 编辑自定义指令（同文书类型）：保留原 enabled；v1.2 编辑前内容入栈 history
            const origItem = orgData[docType][editingIndex];
            const origEnabled = (origItem && origItem.enabled !== false);
            const origHistory = (origItem && Array.isArray(origItem.history)) ? origItem.history : [];
            const newHistory = pushHistory(origHistory, {
                savedAt: Date.now(),
                name: (origItem && origItem.name) || '',
                text: (origItem && origItem.text) || ''
            });
            orgData[docType][editingIndex] = { name: name, text: text, enabled: origEnabled, history: newHistory };
        } else if (editingDocType !== null && !editingIsBuiltin && editingDocType !== docType) {
            // 编辑自定义指令但改了文书类型：先从原数组移除，再追加到新数组（保留 enabled）
            const oldArr = orgData[editingDocType] || [];
            const origItem = oldArr[editingIndex];
            const origEnabled = (origItem && origItem.enabled !== false);
            const origHistory = (origItem && Array.isArray(origItem.history)) ? origItem.history : [];
            // v1.2 跨文书类型编辑也入栈 history
            const newHistory = pushHistory(origHistory, {
                savedAt: Date.now(),
                name: (origItem && origItem.name) || '',
                text: (origItem && origItem.text) || ''
            });
            oldArr.splice(editingIndex, 1);
            orgData[editingDocType] = oldArr;
            orgData[docType].push({ name: name, text: text, enabled: origEnabled, history: newHistory });
        } else {
            // 新增（无 history）
            orgData[docType].push({ name: name, text: text, enabled: true, history: [] });
        }

        setOrgData(currentOrg, orgData);
        closeModal();
        renderLeft();
        renderRight();
        showNotification(editingDocType !== null ? '指令已更新' : '指令已新增', 'success');
    };

    // ===== 启用/停用切换 =====
    window.togglePromptEnabled = function(docTypeKey, index) {
        const items = getAllPrompts(currentOrg, docTypeKey);
        const item = items[index];
        if (!item) return;
        const newEnabled = item.enabled === false; // 反转
        if (item.isBuiltin) {
            // 内置指令：操作 __builtinDisabled__ 字典
            const orgData = getOrgData(currentOrg);
            if (!orgData.__builtinDisabled__ || typeof orgData.__builtinDisabled__ !== 'object') {
                orgData.__builtinDisabled__ = {};
            }
            if (!Array.isArray(orgData.__builtinDisabled__[docTypeKey])) {
                orgData.__builtinDisabled__[docTypeKey] = [];
            }
            const arr = orgData.__builtinDisabled__[docTypeKey];
            const i = arr.indexOf(index);
            if (newEnabled) {
                // 启用：从停用列表移除
                if (i >= 0) arr.splice(i, 1);
            } else {
                // 停用：加入列表
                if (i < 0) arr.push(index);
            }
            setOrgData(currentOrg, orgData);
        } else {
            // 自定义指令：直接修改 enabled 字段
            const orgData = getOrgData(currentOrg);
            if (Array.isArray(orgData[docTypeKey]) && orgData[docTypeKey][index]) {
                orgData[docTypeKey][index].enabled = newEnabled;
                setOrgData(currentOrg, orgData);
            }
        }
        renderRight();
        showNotification(newEnabled ? '指令已启用' : '指令已停用', 'success');
    };

    // ===== 删除 =====
    window.deletePrompt = function(docTypeKey, index) {
        const items = getAllPrompts(currentOrg, docTypeKey);
        const item = items[index];
        if (!item) return;
        if (item.isBuiltin) {
            showNotification('内置指令不可删除', 'warning');
            return;
        }
        showConfirm('删除指令', '确定删除标签「' + item.name + '」吗？此操作不可恢复。', () => {
            const orgData = getOrgData(currentOrg);
            if (Array.isArray(orgData[docTypeKey])) {
                orgData[docTypeKey].splice(index, 1);
                if (orgData[docTypeKey].length === 0) delete orgData[docTypeKey];
                setOrgData(currentOrg, orgData);
            }
            renderLeft();
            renderRight();
            showNotification('指令已删除', 'success');
        });
    };

    // ===== v1.2 历史版本管理 =====
    let historyContext = null;  // { docTypeKey, index }

    function formatTime(ts) {
        const d = new Date(ts);
        const pad = n => (n < 10 ? '0' + n : '' + n);
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
            + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
    }

    window.openHistoryModal = function(docTypeKey, index) {
        const items = getAllPrompts(currentOrg, docTypeKey);
        const item = items[index];
        if (!item) return;
        const history = Array.isArray(item.history) ? item.history : [];
        if (history.length === 0) {
            showNotification('该指令暂无历史版本', 'warning');
            return;
        }
        historyContext = { docTypeKey: docTypeKey, index: index };
        document.getElementById('historyModalTitle').textContent = '历史版本 · ' + item.name;
        const listEl = document.getElementById('historyList');
        listEl.innerHTML = history.map((h, i) => {
            const preview = (h.text || '').length > 80 ? (h.text || '').slice(0, 80) + '…' : (h.text || '');
            return '<div class="history-item">'
                + '<div class="history-item-head">'
                + '<span class="history-time">#' + (i + 1) + ' · ' + formatTime(h.savedAt) + '</span>'
                + '<button class="action-btn restore" onclick="restoreHistory(' + i + ')">恢复此版本</button>'
                + '</div>'
                + '<div class="history-name">标签：' + escapeHtml(h.name || '') + '</div>'
                + '<div class="history-text">' + (escapeHtml(preview) || '<span style="color:var(--text-muted);font-style:italic;">（空）</span>') + '</div>'
                + '</div>';
        }).join('');
        document.getElementById('historyModal').classList.add('show');
    };

    window.closeHistoryModal = function() {
        document.getElementById('historyModal').classList.remove('show');
        historyContext = null;
    };

    window.restoreHistory = function(histIdx) {
        if (!historyContext) return;
        const { docTypeKey, index } = historyContext;
        const orgData = getOrgData(currentOrg);
        if (!Array.isArray(orgData[docTypeKey])) {
            closeHistoryModal();
            return;
        }
        const cur = orgData[docTypeKey][index];
        if (!cur) {
            closeHistoryModal();
            return;
        }
        const history = Array.isArray(cur.history) ? cur.history : [];
        const target = history[histIdx];
        if (!target) {
            showNotification('历史版本不存在', 'error');
            return;
        }
        showConfirm('恢复历史版本', '确定将当前内容回滚至「' + formatTime(target.savedAt) + '」的版本吗？当前内容会自动入栈为新历史。', () => {
            // v1.2 当前内容入栈 history，再用历史版本覆盖当前
            const HISTORY_MAX = 10;
            const newHistory = history.slice();
            newHistory.unshift({
                savedAt: Date.now(),
                name: cur.name || '',
                text: cur.text || ''
            });
            if (newHistory.length > HISTORY_MAX) newHistory.length = HISTORY_MAX;
            // 同时移除被恢复的那个历史项（避免重复）
            // 注意：不删，保留更直观——下次想再回到当前内容可从最新一条恢复
            orgData[docTypeKey][index] = {
                name: target.name || '',
                text: target.text || '',
                enabled: cur.enabled !== false,
                history: newHistory
            };
            setOrgData(currentOrg, orgData);
            closeHistoryModal();
            renderLeft();
            renderRight();
            showNotification('已恢复至历史版本', 'success');
        });
    };

    // ===== 确认弹窗 =====
    function showConfirm(title, text, onConfirm) {
        document.getElementById('confirmTitle').textContent = title;
        document.getElementById('confirmText').textContent = text;
        pendingConfirmAction = onConfirm;
        const btn = document.getElementById('confirmBtn');
        btn.onclick = function() {
            closeConfirm();
            if (typeof pendingConfirmAction === 'function') pendingConfirmAction();
            pendingConfirmAction = null;
        };
        document.getElementById('confirmModal').classList.add('show');
    }
    window.closeConfirm = function() {
        document.getElementById('confirmModal').classList.remove('show');
        pendingConfirmAction = null;
    };

    // ===== ESC 关闭弹窗 =====
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            if (document.getElementById('ptModal').classList.contains('show')) closeModal();
            if (document.getElementById('confirmModal').classList.contains('show')) closeConfirm();
            if (document.getElementById('historyModal').classList.contains('show')) closeHistoryModal();
        }
    });
    document.getElementById('ptModal').addEventListener('click', function(e) {
        if (e.target === this) closeModal();
    });
    document.getElementById('confirmModal').addEventListener('click', function(e) {
        if (e.target === this) closeConfirm();
    });
    const historyModalEl = document.getElementById('historyModal');
    if (historyModalEl) {
        historyModalEl.addEventListener('click', function(e) {
            if (e.target === this) closeHistoryModal();
        });
    }

    // ===== 初始化 =====
    function init() {
        renderLeft();
        renderRight();
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.AdminPromptTemplates = { getAllPrompts, getOrgData, setOrgData };
})();

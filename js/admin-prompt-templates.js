// ============ Admin Prompt Templates Management ============
// v1.0 提示词管理：维护各文书类型的「生成需求说明」提示词
// 数据持久化：localStorage.adminPromptTemplates（按业务系统×文书类型分组）
// 用户侧联动：case-data.js getReqTemplates 优先读此 key，为空回退到 defaultRequirementTemplates

(function() {
    'use strict';

    // ===== 状态 =====
    let currentOrg = 'court';
    let currentDocTypeFilter = ''; // '' = 全部
    let editingDocType = null;    // 编辑模式下当前所属文书类型 key
    let editingIndex = -1;        // 编辑模式下数组下标
    let editingIsBuiltin = false; // 编辑的是内置提示词
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

    // 获取当前业务系统的文书类型映射
    function getDocTypes(org) {
        return defaultDocTypesByOrg[org] || {};
    }

    // 获取当前业务系统+文书类型下的提示词列表（内置 + 自定义）
    // 返回统一结构：[{name, text, isBuiltin, index}]
    function getAllPrompts(org, docTypeKey) {
        const defaults = (defaultRequirementTemplates[org] && defaultRequirementTemplates[org][docTypeKey]) || [];
        const customs = (getOrgData(org)[docTypeKey]) || [];

        // 若该文书类型已有自定义数据，自定义完全覆盖内置
        if (customs.length > 0) {
            return customs.map((p, i) => ({
                name: p.name || '',
                text: p.text || '',
                isBuiltin: false,
                index: i
            }));
        }
        return defaults.map((p, i) => ({
            name: p.name || '',
            text: p.text || '',
            isBuiltin: true,
            index: i
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
            rightTitle.textContent = (docTypes[currentDocTypeFilter] || {}).name || '提示词列表';
        } else {
            rightTitle.textContent = '全部提示词';
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
                const actions = item.isBuiltin
                    ? '<button class="action-btn edit" onclick="editPrompt(\'' + g.docTypeKey + '\',' + item.index + ')">编辑</button>'
                    : '<button class="action-btn edit" onclick="editPrompt(\'' + g.docTypeKey + '\',' + item.index + ')">编辑</button>'
                      + '<button class="action-btn delete" onclick="deletePrompt(\'' + g.docTypeKey + '\',' + item.index + ')">删除</button>';
                html += '<div class="pt-item">'
                    + '<div class="pt-item-tag ' + tagClass + '">' + tagText + '</div>'
                    + '<div class="pt-item-body">'
                    + '<div class="pt-item-text' + (needCollapse ? ' collapsed' : '') + '">' + (escapeHtml(preview) || '<span style="color:var(--text-muted);font-style:italic;">（空提示词）</span>') + '</div>'
                    + '<div class="pt-item-meta">标签：' + escapeHtml(item.name) + '</div>'
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
        document.getElementById('modalTitle').textContent = '新增提示词';
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
        document.getElementById('modalTitle').textContent = editingIsBuiltin ? '编辑内置提示词（另存为自定义）' : '编辑提示词';
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
        if (!text && !confirm('提示词正文为空，用户点击该标签会清空需求说明输入框。确认保存？')) {
            return;
        }

        const orgData = getOrgData(currentOrg);
        // 确保该文书类型有数组（编辑内置时也需创建自定义数组覆盖）
        if (!Array.isArray(orgData[docType])) {
            orgData[docType] = [];
        }

        // 编辑内置提示词：把内置数据全部拷贝为自定义，再修改对应项
        if (editingIsBuiltin && editingDocType === docType) {
            const defaults = (defaultRequirementTemplates[currentOrg] && defaultRequirementTemplates[currentOrg][docType]) || [];
            orgData[docType] = defaults.map(p => ({ name: p.name, text: p.text }));
            orgData[docType][editingIndex] = { name: name, text: text };
        } else if (editingDocType !== null && !editingIsBuiltin && editingDocType === docType) {
            // 编辑自定义提示词（同文书类型）
            orgData[docType][editingIndex] = { name: name, text: text };
        } else if (editingDocType !== null && !editingIsBuiltin && editingDocType !== docType) {
            // 编辑自定义提示词但改了文书类型：先从原数组移除，再追加到新数组
            const oldArr = orgData[editingDocType] || [];
            oldArr.splice(editingIndex, 1);
            orgData[editingDocType] = oldArr;
            orgData[docType].push({ name: name, text: text });
        } else {
            // 新增
            orgData[docType].push({ name: name, text: text });
        }

        setOrgData(currentOrg, orgData);
        closeModal();
        renderLeft();
        renderRight();
        showNotification(editingDocType !== null ? '提示词已更新' : '提示词已新增', 'success');
    };

    // ===== 删除 =====
    window.deletePrompt = function(docTypeKey, index) {
        const items = getAllPrompts(currentOrg, docTypeKey);
        const item = items[index];
        if (!item) return;
        if (item.isBuiltin) {
            showNotification('内置提示词不可删除', 'warning');
            return;
        }
        showConfirm('删除提示词', '确定删除标签「' + item.name + '」吗？此操作不可恢复。', () => {
            const orgData = getOrgData(currentOrg);
            if (Array.isArray(orgData[docTypeKey])) {
                orgData[docTypeKey].splice(index, 1);
                if (orgData[docTypeKey].length === 0) delete orgData[docTypeKey];
                setOrgData(currentOrg, orgData);
            }
            renderLeft();
            renderRight();
            showNotification('提示词已删除', 'success');
        });
    };

    // ===== 恢复默认 =====
    window.restoreDefault = function() {
        const orgName = { court: '法院', procuratorate: '检察院', justice: '司法局' }[currentOrg];
        showConfirm('恢复默认', '确定恢复「' + orgName + '」所有提示词为系统默认值吗？自定义内容将丢失。', () => {
            const all = getStorage();
            if (all[currentOrg]) {
                delete all[currentOrg];
                saveStorage(all);
            }
            renderLeft();
            renderRight();
            showNotification('已恢复为默认提示词', 'success');
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
        }
    });
    document.getElementById('ptModal').addEventListener('click', function(e) {
        if (e.target === this) closeModal();
    });
    document.getElementById('confirmModal').addEventListener('click', function(e) {
        if (e.target === this) closeConfirm();
    });

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

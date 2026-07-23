// ============ Admin Doc Templates Management ============
// v1.0 文书模板管理：维护各业务系统模板，关联文书类型与案由
// 数据持久化：localStorage.adminDocTemplates（按业务系统分组）
// 用户侧联动：case-data.js mergeAdminDocTemplates 在加载时合并到 system.docTemplates

(function() {
    'use strict';

    // ===== 状态 =====
    let currentOrg = 'court';
    let currentDocTypeFilter = ''; // '' = 全部
    let editingKey = null;        // 当前编辑的模板 key（编辑模式时非空）
    let editingIsBuiltin = false; // 编辑的是内置模板（编辑后转为自定义）
    let pendingConfirmAction = null;

    // ===== 工具函数 =====
    function getStorage() {
        try {
            return JSON.parse(localStorage.getItem('adminDocTemplates')) || {};
        } catch (e) {
            return {};
        }
    }
    function saveStorage(data) {
        localStorage.setItem('adminDocTemplates', JSON.stringify(data));
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

    // 获取当前业务系统的内置模板（来自 defaultDocTemplatesByOrg，字符串映射）
    function getBuiltinTemplates(org) {
        return defaultDocTemplatesByOrg[org] || {};
    }

    // 获取当前业务系统的全部模板（内置 + 自定义）
    // 返回统一对象结构：{key: {name, docType, causes, content, isBuiltin}}
    function getAllTemplates(org) {
        const docTypes = getDocTypes(org);
        const builtins = getBuiltinTemplates(org);
        const customs = getOrgData(org);

        // 反查表：模板 key → 文书类型 key
        const tplToDocType = {};
        Object.entries(docTypes).forEach(([typeKey, typeCfg]) => {
            (typeCfg.templates || []).forEach(tplKey => {
                tplToDocType[tplKey] = typeKey;
            });
        });

        const result = {};
        // 内置模板（字符串）
        Object.entries(builtins).forEach(([key, name]) => {
            result[key] = {
                name: name,
                docType: tplToDocType[key] || '',
                causes: [],
                content: '',
                isBuiltin: true
            };
        });
        // 自定义模板（对象，覆盖同名内置）
        Object.entries(customs).forEach(([key, val]) => {
            if (val && typeof val === 'object') {
                result[key] = {
                    name: val.name || key,
                    docType: val.docType || tplToDocType[key] || '',
                    causes: Array.isArray(val.causes) ? val.causes : [],
                    content: val.content || '',
                    isBuiltin: false
                };
            }
        });
        return result;
    }

    // 从 causeTreeDataByOrg 提取当前业务系统的所有案由名称，按分组返回
    function getCauseGroups(org) {
        const tree = causeTreeDataByOrg[org] || [];
        const groups = [];
        tree.forEach(level1 => {
            const items = [];
            if (Array.isArray(level1.children)) {
                level1.children.forEach(child => {
                    if (typeof child === 'string') {
                        items.push(child);
                    } else if (child && Array.isArray(child.children)) {
                        child.children.forEach(leaf => items.push(leaf));
                    }
                });
            }
            groups.push({ name: level1.name, items: items });
        });
        return groups;
    }

    // 生成唯一 key
    function genTemplateKey(name, docType) {
        const base = (docType || 'tpl') + '-' + Date.now().toString(36);
        return base;
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

    // ===== 渲染左侧文书类型列表 =====
    function renderLeft() {
        const docTypes = getDocTypes(currentOrg);
        const allTemplates = getAllTemplates(currentOrg);
        const totalCount = Object.keys(allTemplates).length;

        const leftEl = document.getElementById('tplLeft');
        let html = '<div class="tpl-left-item' + (currentDocTypeFilter === '' ? ' active' : '') + '" onclick="selectDocType(\'\')">'
            + '<i class="fas fa-layer-group"></i><span>全部</span><span class="count">' + totalCount + '</span></div>';

        Object.entries(docTypes).forEach(([key, cfg]) => {
            const count = Object.values(allTemplates).filter(t => t.docType === key).length;
            html += '<div class="tpl-left-item' + (currentDocTypeFilter === key ? ' active' : '') + '" onclick="selectDocType(\'' + key + '\')">'
                + '<i class="fas ' + (cfg.icon || 'fa-folder') + '"></i>'
                + '<span>' + cfg.name + '</span>'
                + '<span class="count">' + count + '</span></div>';
        });
        leftEl.innerHTML = html;
    }
    window.selectDocType = function(key) {
        currentDocTypeFilter = key;
        renderLeft();
        renderRight();
    };

    // ===== 渲染右侧表格 =====
    function renderRight() {
        const docTypes = getDocTypes(currentOrg);
        const allTemplates = getAllTemplates(currentOrg);
        const rightTitle = document.getElementById('rightTitle');
        if (currentDocTypeFilter) {
            rightTitle.textContent = (docTypes[currentDocTypeFilter] || {}).name || '模板列表';
        } else {
            rightTitle.textContent = '全部模板';
        }

        const list = Object.entries(allTemplates).filter(([key, t]) => {
            return !currentDocTypeFilter || t.docType === currentDocTypeFilter;
        });

        const tbody = document.getElementById('tplTbody');
        const empty = document.getElementById('emptyState');
        if (list.length === 0) {
            tbody.innerHTML = '';
            empty.style.display = 'block';
            return;
        }
        empty.style.display = 'none';

        tbody.innerHTML = list.map(([key, t]) => {
            const docTypeName = (docTypes[t.docType] || {}).name || '-';
            const causesCell = (t.causes && t.causes.length)
                ? '<div class="tpl-causes-cell">' + t.causes.map(c => '<span class="cause-chip">' + escapeHtml(c) + '</span>').join('') + '</div>'
                : '<span class="cause-chip universal">通用</span>';
            const badge = t.isBuiltin
                ? '<span class="tpl-badge builtin">内置</span>'
                : '<span class="tpl-badge custom">自定义</span>';
            const actions = t.isBuiltin
                ? '<button class="action-btn edit" onclick="editTemplate(\'' + key + '\')">编辑</button>'
                : '<button class="action-btn edit" onclick="editTemplate(\'' + key + '\')">编辑</button>'
                  + '<button class="action-btn delete" onclick="deleteTemplate(\'' + key + '\')">删除</button>';
            return '<tr>'
                + '<td class="tpl-name-cell">' + escapeHtml(t.name) + badge + '</td>'
                + '<td>' + escapeHtml(docTypeName) + '</td>'
                + '<td>' + causesCell + '</td>'
                + '<td class="tpl-action-cell">' + actions + '</td>'
                + '</tr>';
        }).join('');
    }

    function escapeHtml(s) {
        if (s === undefined || s === null) return '';
        return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    }

    // ===== 新增/编辑弹窗 =====
    window.openAddModal = function() {
        editingKey = null;
        editingIsBuiltin = false;
        document.getElementById('modalTitle').textContent = '新增模板';
        document.getElementById('tplName').value = '';
        document.getElementById('tplContent').value = '';
        fillDocTypeSelect('');
        renderCausePicker([]);
        document.getElementById('tplDocType').disabled = false;
        document.getElementById('tplModal').classList.add('show');
        setTimeout(() => document.getElementById('tplName').focus(), 50);
    };

    window.editTemplate = function(key) {
        const all = getAllTemplates(currentOrg);
        const t = all[key];
        if (!t) return;
        editingKey = key;
        editingIsBuiltin = !!t.isBuiltin;
        document.getElementById('modalTitle').textContent = editingIsBuiltin ? '编辑内置模板（另存为自定义）' : '编辑模板';
        document.getElementById('tplName').value = t.name;
        document.getElementById('tplContent').value = t.content || '';
        fillDocTypeSelect(t.docType);
        renderCausePicker(t.causes || []);
        // 编辑内置时禁用文书类型切换，避免逻辑歧义（内置只能在原类型上覆盖）
        document.getElementById('tplDocType').disabled = editingIsBuiltin;
        document.getElementById('tplModal').classList.add('show');
    };

    window.closeModal = function() {
        document.getElementById('tplModal').classList.remove('show');
        editingKey = null;
        editingIsBuiltin = false;
    };

    function fillDocTypeSelect(selected) {
        const docTypes = getDocTypes(currentOrg);
        const sel = document.getElementById('tplDocType');
        sel.innerHTML = '<option value="">请选择...</option>' + Object.entries(docTypes).map(([key, cfg]) =>
            '<option value="' + key + '"' + (key === selected ? ' selected' : '') + '>' + escapeHtml(cfg.name) + '</option>'
        ).join('');
    }

    function renderCausePicker(selectedCauses) {
        const groups = getCauseGroups(currentOrg);
        const selectedSet = new Set(selectedCauses || []);
        const picker = document.getElementById('causePicker');
        if (groups.length === 0) {
            picker.innerHTML = '<div style="font-size:12px;color:var(--text-muted);">该业务系统暂无案由数据</div>';
            return;
        }
        picker.innerHTML = groups.map(g => {
            const opts = g.items.map(name => {
                const checked = selectedSet.has(name);
                return '<label class="cause-picker-option' + (checked ? ' checked' : '') + '">'
                    + '<input type="checkbox" value="' + escapeHtml(name) + '"' + (checked ? ' checked' : '') + ' onchange="toggleCauseChip(this)">'
                    + '<span>' + escapeHtml(name) + '</span></label>';
            }).join('');
            return '<div class="cause-picker-group"><div class="cause-picker-group-title">' + escapeHtml(g.name) + '</div>' + opts + '</div>';
        }).join('');
    }

    window.toggleCauseChip = function(cb) {
        const label = cb.parentElement;
        label.classList.toggle('checked', cb.checked);
    };

    function getSelectedCauses() {
        const checks = document.querySelectorAll('#causePicker input[type="checkbox"]:checked');
        return Array.from(checks).map(c => c.value);
    }

    window.saveTemplate = function() {
        const name = document.getElementById('tplName').value.trim();
        const docType = document.getElementById('tplDocType').value;
        const causes = getSelectedCauses();
        const content = document.getElementById('tplContent').value;

        if (!name) {
            showNotification('请填写模板名', 'error');
            document.getElementById('tplName').focus();
            return;
        }
        if (!docType) {
            showNotification('请选择所属文书类型', 'error');
            return;
        }

        const orgData = getOrgData(currentOrg);

        // 决定 key
        let key;
        if (editingKey && !editingIsBuiltin) {
            // 编辑自定义模板：保留原 key
            key = editingKey;
        } else if (editingKey && editingIsBuiltin) {
            // 编辑内置模板：使用内置 key 作为自定义覆盖（用户侧 mergeAdminDocTemplates 会覆盖）
            key = editingKey;
        } else {
            // 新增：生成新 key（确保不与内置 key 冲突）
            key = genTemplateKey(name, docType);
            while (orgData[key]) key = genTemplateKey(name, docType) + Math.floor(Math.random() * 100);
        }

        orgData[key] = {
            name: name,
            docType: docType,
            causes: causes,
            content: content
        };
        setOrgData(currentOrg, orgData);

        closeModal();
        renderLeft();
        renderRight();
        showNotification(editingKey ? '模板已更新' : '模板已新增', 'success');
    };

    // ===== 删除 =====
    window.deleteTemplate = function(key) {
        const all = getAllTemplates(currentOrg);
        const t = all[key];
        if (!t) return;
        if (t.isBuiltin) {
            showNotification('内置模板不可删除', 'warning');
            return;
        }
        showConfirm('删除模板', '确定删除模板「' + t.name + '」吗？此操作不可恢复。', () => {
            const orgData = getOrgData(currentOrg);
            delete orgData[key];
            setOrgData(currentOrg, orgData);
            renderLeft();
            renderRight();
            showNotification('模板已删除', 'success');
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
            if (document.getElementById('tplModal').classList.contains('show')) closeModal();
            if (document.getElementById('confirmModal').classList.contains('show')) closeConfirm();
        }
    });

    // 点击遮罩关闭
    document.getElementById('tplModal').addEventListener('click', function(e) {
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

    // 暴露调试 API
    window.AdminDocTemplates = { getAllTemplates, getOrgData, setOrgData };
})();

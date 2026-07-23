// ============ My Templates (用户侧自定义文书模板) ============
// v1.0 个人文书模板维护，关联文书类型与案由
// 数据持久化：localStorage.myDocTemplates（按业务系统分组）
// 用户侧联动：case-data.js mergeMyDocTemplates 在加载时合并到 system.docTemplates（key 加 my- 前缀）

(function() {
    'use strict';

    // ===== 状态 =====
    let currentOrg = 'court';
    let currentDocTypeFilter = ''; // '' = 全部
    let editingKey = null;         // 当前编辑的 key（null=新增模式）

    // ===== 存储 =====
    function getStorage() {
        try {
            return JSON.parse(localStorage.getItem('myDocTemplates')) || {};
        } catch (e) {
            return {};
        }
    }
    function saveStorage(data) {
        localStorage.setItem('myDocTemplates', JSON.stringify(data));
    }
    function getOrgData(org) {
        return getStorage()[org] || {};
    }
    function setOrgData(org, data) {
        const all = getStorage();
        all[org] = data;
        saveStorage(all);
    }

    function getDocTypes(org) {
        return defaultDocTypesByOrg[org] || {};
    }

    // 从 causeTreeDataByOrg 提取案由分组
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

    function genKey() {
        return 't' + Date.now().toString(36) + Math.floor(Math.random() * 100);
    }

    function escapeHtml(s) {
        if (s === undefined || s === null) return '';
        return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    }

    // ===== 通知 =====
    function showToast(msg, type) {
        type = type || 'success';
        const toast = document.getElementById('toast');
        toast.textContent = msg;
        toast.className = 'toast ' + type + ' show';
        setTimeout(() => toast.classList.remove('show'), 2200);
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
        renderList();
    };

    // ===== 渲染左侧文书类型列表 =====
    function renderLeft() {
        const docTypes = getDocTypes(currentOrg);
        const orgData = getOrgData(currentOrg);
        const totalCount = Object.keys(orgData).length;

        const leftEl = document.getElementById('leftList');
        let html = '<div class="left-item' + (currentDocTypeFilter === '' ? ' active' : '') + '" onclick="selectDocType(\'\')">'
            + '<span>全部</span><span class="count">' + totalCount + '</span></div>';

        Object.entries(docTypes).forEach(([key, cfg]) => {
            const count = Object.entries(orgData).filter(([k, v]) => v.docType === key).length;
            html += '<div class="left-item' + (currentDocTypeFilter === key ? ' active' : '') + '" onclick="selectDocType(\'' + key + '\')">'
                + '<span>' + escapeHtml(cfg.name) + '</span>'
                + '<span class="count">' + count + '</span></div>';
        });
        leftEl.innerHTML = html;
    }
    window.selectDocType = function(key) {
        currentDocTypeFilter = key;
        renderLeft();
        renderList();
    };

    // ===== 渲染右侧列表 =====
    function renderList() {
        const docTypes = getDocTypes(currentOrg);
        const orgData = getOrgData(currentOrg);
        const contentTitle = document.getElementById('contentTitle');
        contentTitle.textContent = currentDocTypeFilter
            ? ((docTypes[currentDocTypeFilter] || {}).name || '模板列表')
            : '全部我的模板';

        const list = Object.entries(orgData).filter(([k, v]) => {
            return !currentDocTypeFilter || v.docType === currentDocTypeFilter;
        });

        const listEl = document.getElementById('itemList');
        const empty = document.getElementById('emptyState');
        if (list.length === 0) {
            listEl.innerHTML = '';
            empty.style.display = 'block';
            return;
        }
        empty.style.display = 'none';

        listEl.innerHTML = list.map(([key, t]) => {
            const docTypeName = (docTypes[t.docType] || {}).name || '-';
            const causes = Array.isArray(t.causes) ? t.causes : [];
            const causesCell = causes.length
                ? '<div class="item-causes">' + causes.map(c => '<span class="cause-chip">' + escapeHtml(c) + '</span>').join('') + '</div>'
                : '<div class="item-causes"><span class="cause-chip universal">通用</span></div>';
            // 如果是编辑中的项，渲染表单
            if (editingKey === key) {
                return renderEditForm(key, t);
            }
            return '<div class="item-card">'
                + '<div class="item-row">'
                + '<div>'
                + '<span class="item-name">' + escapeHtml(t.name || key) + '</span>'
                + '<span class="item-badge">我的</span>'
                + '<div class="item-meta">所属类型：' + escapeHtml(docTypeName) + '</div>'
                + causesCell
                + '</div>'
                + '<div class="item-actions">'
                + '<button class="action-btn edit" onclick="editItem(\'' + key + '\')">编辑</button>'
                + '<button class="action-btn delete" onclick="deleteItem(\'' + key + '\')">删除</button>'
                + '</div>'
                + '</div>'
                + '</div>';
        }).join('');
    }

    // ===== 新增/编辑表单 =====
    window.openAddForm = function() {
        // 在列表顶部插入新表单
        if (editingKey !== null) {
            showToast('请先保存或取消当前编辑', 'error');
            return;
        }
        editingKey = '__new__';
        renderList();
        // 滚动到顶部
        document.getElementById('itemList').scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    window.editItem = function(key) {
        if (editingKey !== null) {
            showToast('请先保存或取消当前编辑', 'error');
            return;
        }
        editingKey = key;
        renderList();
    };

    window.cancelEdit = function() {
        editingKey = null;
        renderList();
    };

    function renderEditForm(key, t) {
        const isNew = key === '__new__';
        const docTypes = getDocTypes(currentOrg);
        const docTypeOptions = Object.entries(docTypes).map(([k, cfg]) =>
            '<option value="' + k + '"' + (t && t.docType === k ? ' selected' : '') + '>' + escapeHtml(cfg.name) + '</option>'
        ).join('');
        const causes = (t && Array.isArray(t.causes)) ? t.causes : [];
        const content = (t && t.content) || '';
        const name = (t && t.name) || '';

        return '<div class="item-card editing">'
            + '<div class="form-group">'
            + '<label class="form-label">模板名 <span class="required">*</span></label>'
            + '<input type="text" class="form-input" id="formName" value="' + escapeHtml(name) + '" placeholder="如：我的民事判决书模板">'
            + '</div>'
            + '<div class="form-group">'
            + '<label class="form-label">所属文书类型 <span class="required">*</span></label>'
            + '<select class="form-select" id="formDocType">' + docTypeOptions + '</select>'
            + '</div>'
            + '<div class="form-group">'
            + '<label class="form-label">关联案由 <span class="form-hint" style="display:inline;">（不选=通用）</span></label>'
            + '<div class="cause-picker" id="formCauses">' + renderCausePicker(causes) + '</div>'
            + '</div>'
            + '<div class="form-group">'
            + '<label class="form-label">模板正文（可选）</label>'
            + '<textarea class="form-textarea" id="formContent" placeholder="预设的模板正文片段，留空则由 AI 自动生成">' + escapeHtml(content) + '</textarea>'
            + '</div>'
            + '<div class="form-actions">'
            + '<button class="btn btn-primary" onclick="saveItem(\'' + (isNew ? '' : key) + '\')">保存</button>'
            + '<button class="btn btn-secondary" onclick="cancelEdit()">取消</button>'
            + '</div>'
            + '</div>';
    }

    function renderCausePicker(selectedCauses) {
        const groups = getCauseGroups(currentOrg);
        const selectedSet = new Set(selectedCauses || []);
        if (groups.length === 0) {
            return '<div style="font-size:11px;color:var(--text-muted);">该业务系统暂无案由数据</div>';
        }
        return groups.map(g => {
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
        cb.parentElement.classList.toggle('checked', cb.checked);
    };

    function getSelectedCauses() {
        const checks = document.querySelectorAll('#formCauses input[type="checkbox"]:checked');
        return Array.from(checks).map(c => c.value);
    }

    window.saveItem = function(existingKey) {
        const name = document.getElementById('formName').value.trim();
        const docType = document.getElementById('formDocType').value;
        const causes = getSelectedCauses();
        const content = document.getElementById('formContent').value;

        if (!name) {
            showToast('请填写模板名', 'error');
            document.getElementById('formName').focus();
            return;
        }
        if (!docType) {
            showToast('请选择所属文书类型', 'error');
            return;
        }

        const orgData = getOrgData(currentOrg);
        let key = existingKey;
        if (!key) {
            // 新增：生成唯一 key
            key = genKey();
            while (orgData[key]) key = genKey();
        }
        orgData[key] = {
            name: name,
            docType: docType,
            causes: causes,
            content: content
        };
        setOrgData(currentOrg, orgData);

        editingKey = null;
        renderLeft();
        renderList();
        showToast(existingKey ? '模板已更新' : '模板已新增', 'success');
    };

    // ===== 删除 =====
    window.deleteItem = function(key) {
        const orgData = getOrgData(currentOrg);
        const t = orgData[key];
        if (!t) return;
        if (!confirm('确定删除模板「' + (t.name || key) + '」吗？此操作不可恢复。')) return;
        delete orgData[key];
        setOrgData(currentOrg, orgData);
        renderLeft();
        renderList();
        showToast('模板已删除', 'success');
    };

    // ===== 初始化 =====
    function init() {
        // 从 URL 读取 org 参数
        const params = new URLSearchParams(window.location.search);
        const orgParam = params.get('org');
        if (orgParam && ['court', 'procuratorate', 'justice'].includes(orgParam)) {
            currentOrg = orgParam;
            document.querySelectorAll('.business-switch-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.type === orgParam);
            });
        }
        renderLeft();
        renderList();
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

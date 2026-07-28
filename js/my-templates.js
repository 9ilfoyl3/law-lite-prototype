// ============ My Templates (用户侧自定义文书模板) ============
// v1.0 个人文书模板维护，关联文书类型
// v1.1 移除「关联案由」字段：模板作为所属文书类型的下属，案由匹配通过文书类型→workflow 链路间接实现
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
        return getAdminDocTypes(org) || {};
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

    // 渲染单个模板卡片（非编辑态）
    function renderCard(key, t, docTypes) {
        const docTypeName = (docTypes[t.docType] || {}).name || '-';
        const isEnabled = t.enabled !== false; // 缺省视为 true
        const statusBadge = isEnabled
            ? '<span class="item-badge status-on">已启用</span>'
            : '<span class="item-badge status-off">已停用</span>';
        const toggleBtn = isEnabled
            ? '<button class="action-btn toggle-off" onclick="toggleEnabled(\'' + key + '\')">停用</button>'
            : '<button class="action-btn toggle-on" onclick="toggleEnabled(\'' + key + '\')">启用</button>';
        return '<div class="item-card">'
            + '<div class="item-row">'
            + '<div>'
            + '<span class="item-name">' + escapeHtml(t.name || key) + '</span>'
            + '<span class="item-badge">我的</span>'
            + statusBadge
            + '<div class="item-meta">所属类型：' + escapeHtml(docTypeName) + '</div>'
            + '</div>'
            + '<div class="item-actions">'
            + '<button class="action-btn edit" onclick="editItem(\'' + key + '\')">编辑</button>'
            + toggleBtn
            + '<button class="action-btn delete" onclick="deleteItem(\'' + key + '\')">删除</button>'
            + '</div>'
            + '</div>'
            + '</div>';
    }

    // 切换启用/停用状态
    window.toggleEnabled = function(key) {
        const orgData = getOrgData(currentOrg);
        const t = orgData[key];
        if (!t) return;
        const isEnabled = t.enabled !== false;
        t.enabled = !isEnabled;
        setOrgData(currentOrg, orgData);
        renderList();
        showToast(isEnabled ? '已停用' : '已启用', 'success');
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

        // 新增模式下，即使列表为空也要在顶部渲染编辑表单
        if (editingKey === '__new__') {
            empty.style.display = 'none';
            const existingHtml = list.map(([key, t]) => renderCard(key, t, docTypes)).join('');
            listEl.innerHTML = renderEditForm('__new__', null) + existingHtml;
            return;
        }

        if (list.length === 0) {
            listEl.innerHTML = '';
            empty.style.display = 'block';
            return;
        }
        empty.style.display = 'none';

        listEl.innerHTML = list.map(([key, t]) => {
            // 如果是编辑中的项，渲染表单
            if (editingKey === key) {
                return renderEditForm(key, t);
            }
            return renderCard(key, t, docTypes);
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
            + '<label class="form-label">模板正文（可选）</label>'
            + '<textarea class="form-textarea" id="formContent" placeholder="预设的模板正文片段，留空则由 AI 自动生成">' + escapeHtml(content) + '</textarea>'
            + '</div>'
            + '<div class="form-actions">'
            + '<button class="btn btn-primary" onclick="saveItem(\'' + (isNew ? '' : key) + '\')">保存</button>'
            + '<button class="btn btn-secondary" onclick="cancelEdit()">取消</button>'
            + '</div>'
            + '</div>';
    }

    window.saveItem = function(existingKey) {
        const name = document.getElementById('formName').value.trim();
        const docType = document.getElementById('formDocType').value;
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
        // 编辑时保留原 enabled 字段；新增时默认启用
        const prevEnabled = existingKey && orgData[key] ? (orgData[key].enabled !== false) : true;
        orgData[key] = {
            name: name,
            docType: docType,
            content: content,
            enabled: prevEnabled
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

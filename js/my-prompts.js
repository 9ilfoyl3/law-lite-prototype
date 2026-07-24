// ============ My Prompts (用户侧自定义提示词) ============
// v1.0 个人提示词维护，按文书类型分组
// 数据持久化：localStorage.myPromptTemplates（按业务系统×文书类型分组）
// 用户侧联动：case-data.js getReqTemplates 在返回时追加 my 数据（标记 source='mine'）

(function() {
    'use strict';

    // ===== 状态 =====
    let currentOrg = 'court';
    let currentDocTypeFilter = ''; // '' = 全部
    // 编辑状态：{ docType, index }；index === -1 表示新增；null 表示未在编辑
    let editingState = null;

    // ===== 存储 =====
    function getStorage() {
        try {
            return JSON.parse(localStorage.getItem('myPromptTemplates')) || {};
        } catch (e) {
            return {};
        }
    }
    function saveStorage(data) {
        localStorage.setItem('myPromptTemplates', JSON.stringify(data));
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
        editingState = null;
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
        // 统计总数与每个文书类型下的数量
        let totalCount = 0;
        const countByDocType = {};
        Object.entries(orgData).forEach(([docType, arr]) => {
            const n = Array.isArray(arr) ? arr.length : 0;
            countByDocType[docType] = n;
            totalCount += n;
        });

        const leftEl = document.getElementById('leftList');
        let html = '<div class="left-item' + (currentDocTypeFilter === '' ? ' active' : '') + '" onclick="selectDocType(\'\')">'
            + '<span>全部</span><span class="count">' + totalCount + '</span></div>';

        Object.entries(docTypes).forEach(([key, cfg]) => {
            const count = countByDocType[key] || 0;
            html += '<div class="left-item' + (currentDocTypeFilter === key ? ' active' : '') + '" onclick="selectDocType(\'' + key + '\')">'
                + '<span>' + escapeHtml(cfg.name) + '</span>'
                + '<span class="count">' + count + '</span></div>';
        });
        leftEl.innerHTML = html;
    }
    window.selectDocType = function(key) {
        currentDocTypeFilter = key;
        editingState = null;
        renderLeft();
        renderList();
    };

    // 渲染单个提示词卡片（非编辑态）
    function renderCard(docType, index, item, docTypeName) {
        const name = (item && item.name) || '';
        const text = (item && item.text) || '';
        const previewText = text.length > 200 ? text.slice(0, 200) + '…' : text;
        const isEnabled = item && item.enabled !== false;
        const statusBadge = isEnabled
            ? '<span class="item-badge status-on">已启用</span>'
            : '<span class="item-badge status-off">已停用</span>';
        const toggleBtn = isEnabled
            ? '<button class="action-btn toggle-off" onclick="toggleEnabled(\'' + docType + '\',' + index + ')">停用</button>'
            : '<button class="action-btn toggle-on" onclick="toggleEnabled(\'' + docType + '\',' + index + ')">启用</button>';
        return '<div class="item-card">'
            + '<div class="item-row">'
            + '<div>'
            + '<span class="item-name">' + escapeHtml(name) + '</span>'
            + '<span class="item-badge">我的</span>'
            + statusBadge
            + '<div class="item-meta">所属类型：' + escapeHtml(docTypeName) + '</div>'
            + (previewText ? '<div class="item-text-preview">' + escapeHtml(previewText) + '</div>' : '')
            + '</div>'
            + '<div class="item-actions">'
            + '<button class="action-btn edit" onclick="editItem(\'' + docType + '\',' + index + ')">编辑</button>'
            + toggleBtn
            + '<button class="action-btn delete" onclick="deleteItem(\'' + docType + '\',' + index + ')">删除</button>'
            + '</div>'
            + '</div>'
            + '</div>';
    }

    // 切换启用/停用状态
    window.toggleEnabled = function(docType, index) {
        const orgData = getOrgData(currentOrg);
        if (!Array.isArray(orgData[docType])) return;
        const item = orgData[docType][index];
        if (!item) return;
        const isEnabled = item.enabled !== false;
        item.enabled = !isEnabled;
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
            ? ((docTypes[currentDocTypeFilter] || {}).name || '提示词列表')
            : '全部我的提示词';

        // 收集需要展示的项：[{ docType, index, item }]
        const items = [];
        if (currentDocTypeFilter) {
            const arr = Array.isArray(orgData[currentDocTypeFilter]) ? orgData[currentDocTypeFilter] : [];
            arr.forEach((item, idx) => items.push({ docType: currentDocTypeFilter, index: idx, item }));
        } else {
            Object.entries(orgData).forEach(([docType, arr]) => {
                if (!Array.isArray(arr)) return;
                arr.forEach((item, idx) => items.push({ docType, index: idx, item }));
            });
        }

        const listEl = document.getElementById('itemList');
        const empty = document.getElementById('emptyState');
        if (items.length === 0 && !editingState) {
            listEl.innerHTML = '';
            empty.style.display = 'block';
            return;
        }
        empty.style.display = 'none';

        // 新增表单置顶
        let html = '';
        if (editingState && editingState.index === -1) {
            html += renderEditForm({ docType: editingState.docType, item: null });
        }
        html += items.map(it => {
            // 若该项处于编辑状态，渲染表单
            if (editingState && editingState.docType === it.docType && editingState.index === it.index) {
                return renderEditForm(it);
            }
            const docTypeName = (docTypes[it.docType] || {}).name || it.docType;
            return renderCard(it.docType, it.index, it.item, docTypeName);
        }).join('');
        listEl.innerHTML = html;
    }

    // ===== 新增/编辑表单 =====
    window.openAddForm = function() {
        if (editingState) {
            showToast('请先保存或取消当前编辑', 'error');
            return;
        }
        // 新增时默认 docType：若当前筛选了某 docType，则用它；否则用第一个
        const docTypes = getDocTypes(currentOrg);
        const defaultDocType = currentDocTypeFilter || Object.keys(docTypes)[0] || '';
        editingState = { docType: defaultDocType, index: -1 };
        renderList();
        document.getElementById('itemList').scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    window.editItem = function(docType, index) {
        if (editingState) {
            showToast('请先保存或取消当前编辑', 'error');
            return;
        }
        editingState = { docType: docType, index: index };
        renderList();
    };

    window.cancelEdit = function() {
        editingState = null;
        renderList();
    };

    function renderEditForm(it) {
        const docTypes = getDocTypes(currentOrg);
        const docTypeOptions = Object.entries(docTypes).map(([k, cfg]) =>
            '<option value="' + k + '"' + (it && it.docType === k ? ' selected' : '') + '>' + escapeHtml(cfg.name) + '</option>'
        ).join('');
        const name = (it && it.item && it.item.name) || '';
        const text = (it && it.item && it.item.text) || '';
        const isNew = !it || !it.item;

        return '<div class="item-card editing">'
            + '<div class="form-group">'
            + '<label class="form-label">所属文书类型 <span class="required">*</span></label>'
            + '<select class="form-select" id="formDocType">' + docTypeOptions + '</select>'
            + '</div>'
            + '<div class="form-group">'
            + '<label class="form-label">标签名 <span class="required">*</span></label>'
            + '<input type="text" class="form-input" id="formName" value="' + escapeHtml(name) + '" placeholder="如：我的支持诉请">'
            + '</div>'
            + '<div class="form-group">'
            + '<label class="form-label">提示词正文 <span class="required">*</span></label>'
            + '<textarea class="form-textarea" id="formText" placeholder="点击标签后填入「提示词」文本框的内容，支持多行">' + escapeHtml(text) + '</textarea>'
            + '<div class="form-hint">点击标签后内容将覆盖「提示词」文本框</div>'
            + '</div>'
            + '<div class="form-actions">'
            + '<button class="btn btn-primary" onclick="saveItem()">保存</button>'
            + '<button class="btn btn-secondary" onclick="cancelEdit()">取消</button>'
            + '</div>'
            + '</div>';
    }

    window.saveItem = function() {
        if (!editingState) return;
        const newDocType = document.getElementById('formDocType').value;
        const newName = document.getElementById('formName').value.trim();
        const newText = document.getElementById('formText').value.trim();

        if (!newDocType) {
            showToast('请选择所属文书类型', 'error');
            return;
        }
        if (!newName) {
            showToast('请填写标签名', 'error');
            document.getElementById('formName').focus();
            return;
        }
        if (!newText) {
            showToast('请填写提示词正文', 'error');
            document.getElementById('formText').focus();
            return;
        }

        const orgData = getOrgData(currentOrg);
        const oldDocType = editingState.docType;
        const oldIndex = editingState.index;

        // 确保目标数组存在
        if (!Array.isArray(orgData[newDocType])) orgData[newDocType] = [];

        // 编辑时保留原 enabled 字段；新增时默认启用
        let prevEnabled = true;
        if (oldIndex !== -1 && Array.isArray(orgData[oldDocType]) && orgData[oldDocType][oldIndex]) {
            prevEnabled = orgData[oldDocType][oldIndex].enabled !== false;
        }

        if (oldIndex === -1) {
            // 新增
            orgData[newDocType].push({ name: newName, text: newText, enabled: true });
        } else {
            // 编辑：先从原数组移除
            if (Array.isArray(orgData[oldDocType])) {
                orgData[oldDocType].splice(oldIndex, 1);
                // 若原数组空了，保留空数组也无妨；不主动删除 key 以保持结构稳定
            }
            // 加入目标数组（若 docType 未变，等于在原位置之后追加；这里接受位置变化）
            orgData[newDocType].push({ name: newName, text: newText, enabled: prevEnabled });
        }

        setOrgData(currentOrg, orgData);

        editingState = null;
        // 若编辑时切换了文书类型且当前筛选的是原 docType，保持筛选不变即可（列表会反映变化）
        renderLeft();
        renderList();
        showToast(oldIndex === -1 ? '提示词已新增' : '提示词已更新', 'success');
    };

    // ===== 删除 =====
    window.deleteItem = function(docType, index) {
        const orgData = getOrgData(currentOrg);
        if (!Array.isArray(orgData[docType])) return;
        const item = orgData[docType][index];
        if (!item) return;
        if (!confirm('确定删除提示词「' + (item.name || '') + '」吗？此操作不可恢复。')) return;
        orgData[docType].splice(index, 1);
        setOrgData(currentOrg, orgData);
        editingState = null;
        renderLeft();
        renderList();
        showToast('提示词已删除', 'success');
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

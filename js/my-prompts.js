// ============ My Prompts (用户侧自定义指令) ============
// v1.0 个人指令维护，按文书类型分组
// v1.5 (V1.3 A9) 去掉文书类型绑定：新建/编辑表单不再选择「所属文书类型」，
//   新指令统一落入固定分组键 MY_BUCKET；旧数据仍留在原 docType 分组（零迁移，读取时统一展平）。
// 数据持久化：localStorage.myPromptTemplates（按业务系统分组）
// 用户侧联动：case-data.js getReqTemplates 在返回时追加 my 数据（标记 source='mine'）
// v1.2: 新增历史版本记录（与 admin-prompt-templates.js 同步，最多 10 条，支持一键恢复）

(function() {
    'use strict';

    // ===== 状态 =====
    let currentOrg = 'court';
    let currentDocTypeFilter = ''; // '' = 全部
    // 编辑状态：{ docType, index }；index === -1 表示新增；null 表示未在编辑
    // V1.3 A9: docType 仅作存储分组键（新内容统一用 MY_BUCKET），不再是用户可选项
    let editingState = null;
    const MY_BUCKET = '__mine__';   // V1.3 A9: 无类型绑定内容的固定分组键

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

    // V1.3.17 A23: getDocTypes() 已无调用方（左栏与内容区标题取消后不再需要文书类型映射），删除

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
        renderList();
    };

    // 渲染单个指令卡片（非编辑态）
    function renderCard(docType, index, item) {
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
        // v1.2 历史按钮
        const histCount = (item && Array.isArray(item.history) && item.history.length) || 0;
        const histBtn = histCount > 0
            ? '<button class="action-btn history" title="历史版本（' + histCount + '）" onclick="openHistoryModal(\'' + docType + '\',' + index + ')">历史<span class="hist-count">' + histCount + '</span></button>'
            : '<button class="action-btn history" disabled title="暂无历史版本">历史</button>';
        // V1.3.30: 恢复所属文书类型展示（通用 = 未绑定具体类型 / A9 旧数据 __mine__）
        const docTypeName = (docType === MY_BUCKET || !docType)
            ? '通用'
            : ((getAdminDocTypes(currentOrg)[docType] || {}).name || docType);
        return '<div class="item-card">'
            + '<div class="item-row">'
            + '<div>'
            + '<span class="item-name">' + escapeHtml(name) + '</span>'
            + '<span class="item-badge">我的</span>'
            + '<span class="item-badge doc-type-badge">' + escapeHtml(docTypeName) + '</span>'
            + statusBadge
            + (previewText ? '<div class="item-text-preview">' + escapeHtml(previewText) + '</div>' : '')
            + '</div>'
            + '<div class="item-actions">'
            + '<button class="action-btn edit" onclick="editItem(\'' + docType + '\',' + index + ')">编辑</button>'
            + histBtn
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

    // ===== 渲染列表 =====
    // V1.3.17 A23: 左栏已删除，内容区标题（原「全部我的指令」）一并取消——与页面大标题重复
    function renderList() {
        const orgData = getOrgData(currentOrg);

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
            return renderCard(it.docType, it.index, it.item);
        }).join('');
        listEl.innerHTML = html;
    }

    // ===== 新增/编辑表单 =====
    window.openAddForm = function() {
        if (editingState) {
            showToast('请先保存或取消当前编辑', 'error');
            return;
        }
        // V1.3.30: 恢复必选所属文书类型——新增默认通用（表单必选下拉确定）
        editingState = { docType: '', index: -1 };
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
        const name = (it && it.item && it.item.name) || '';
        const text = (it && it.item && it.item.text) || '';
        // V1.3.30: 恢复与文书类型绑定——新建/编辑必选所属文书类型（通用为可选值）
        const docTypes = getAdminDocTypes(currentOrg) || {};
        const curDocType = (it && it.docType && it.docType !== MY_BUCKET) ? it.docType : '';
        const docTypeOptions = '<option value=""' + (curDocType === '' ? ' selected' : '') + '>通用</option>'
            + Object.keys(docTypes).map(k =>
                '<option value="' + escapeHtml(k) + '"' + (k === curDocType ? ' selected' : '') + '>' + escapeHtml(docTypes[k].name || k) + '</option>'
            ).join('');

        return '<div class="item-card editing">'
            + '<div class="form-group">'
            + '<label class="form-label">标签名 <span class="required">*</span></label>'
            + '<input type="text" class="form-input" id="formName" value="' + escapeHtml(name) + '" placeholder="如：我的支持诉请">'
            + '</div>'
            // V1.3.30: 恢复所属文书类型必选下拉（通用为可选值，默认选中）
            + '<div class="form-group">'
            + '<label class="form-label">所属文书类型 <span class="required">*</span></label>'
            + '<select class="form-select" id="formDocType">' + docTypeOptions + '</select>'
            + '</div>'
            + '<div class="form-group">'
            + '<label class="form-label">指令正文 <span class="required">*</span></label>'
            + '<textarea class="form-textarea" id="formText" placeholder="点击标签后填入「指令」文本框的内容，支持多行">' + escapeHtml(text) + '</textarea>'
            + '<div class="form-hint">点击标签后内容将覆盖「指令」文本框</div>'
            + '</div>'
            + '<div class="form-actions">'
            + '<button class="btn btn-primary" onclick="saveItem()">保存</button>'
            + '<button class="btn btn-secondary" onclick="cancelEdit()">取消</button>'
            + '</div>'
            + '</div>';
    }

    window.saveItem = function() {
        if (!editingState) return;
        // V1.3.30: 恢复必选所属文书类型——新增/编辑均由表单必选下拉确定（默认通用）
        const docTypeSel = document.getElementById('formDocType');
        const newDocType = docTypeSel ? (docTypeSel.value || '') : '';
        const newName = document.getElementById('formName').value.trim();
        const newText = document.getElementById('formText').value.trim();

        if (!newName) {
            showToast('请填写标签名', 'error');
            document.getElementById('formName').focus();
            return;
        }
        if (!newText) {
            showToast('请填写指令正文', 'error');
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
        let prevHistory = [];
        let prevName = '';
        let prevText = '';
        if (oldIndex !== -1 && Array.isArray(orgData[oldDocType]) && orgData[oldDocType][oldIndex]) {
            const origItem = orgData[oldDocType][oldIndex];
            prevEnabled = origItem.enabled !== false;
            prevHistory = Array.isArray(origItem.history) ? origItem.history : [];
            prevName = origItem.name || '';
            prevText = origItem.text || '';
        }

        // v1.2 历史版本管理
        const HISTORY_MAX = 10;
        function pushHistory(prev, snapshot) {
            const arr = Array.isArray(prev) ? prev.slice() : [];
            arr.unshift(snapshot);
            if (arr.length > HISTORY_MAX) arr.length = HISTORY_MAX;
            return arr;
        }

        if (oldIndex === -1) {
            // 新增（无 history）
            orgData[newDocType].push({ name: newName, text: newText, enabled: true, history: [] });
        } else {
            // 编辑：先从原数组移除
            if (Array.isArray(orgData[oldDocType])) {
                orgData[oldDocType].splice(oldIndex, 1);
            }
            // v1.2 编辑前内容入栈 history
            const newHistory = pushHistory(prevHistory, {
                savedAt: Date.now(),
                name: prevName,
                text: prevText
            });
            orgData[newDocType].push({ name: newName, text: newText, enabled: prevEnabled, history: newHistory });
        }

        setOrgData(currentOrg, orgData);

        editingState = null;
        renderList();
        showToast(oldIndex === -1 ? '指令已新增' : '指令已更新', 'success');
    };

    // ===== v1.2 历史版本管理 =====
    let historyContext = null;

    function formatTime(ts) {
        const d = new Date(ts);
        const pad = n => (n < 10 ? '0' + n : '' + n);
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
            + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
    }

    window.openHistoryModal = function(docType, index) {
        const orgData = getOrgData(currentOrg);
        if (!Array.isArray(orgData[docType])) return;
        const item = orgData[docType][index];
        if (!item) return;
        const history = Array.isArray(item.history) ? item.history : [];
        if (history.length === 0) {
            showToast('该指令暂无历史版本', 'error');
            return;
        }
        historyContext = { docType: docType, index: index };
        const titleEl = document.getElementById('historyModalTitle');
        if (titleEl) titleEl.textContent = '历史版本 · ' + (item.name || '');
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
        const { docType, index } = historyContext;
        const orgData = getOrgData(currentOrg);
        if (!Array.isArray(orgData[docType])) {
            closeHistoryModal();
            return;
        }
        const cur = orgData[docType][index];
        if (!cur) {
            closeHistoryModal();
            return;
        }
        const history = Array.isArray(cur.history) ? cur.history : [];
        const target = history[histIdx];
        if (!target) {
            showToast('历史版本不存在', 'error');
            return;
        }
        if (!confirm('确定将当前内容回滚至「' + formatTime(target.savedAt) + '」的版本吗？当前内容会自动入栈为新历史。')) return;
        // v1.2 当前内容入栈 history，再用历史版本覆盖当前
        const HISTORY_MAX = 10;
        const newHistory = history.slice();
        newHistory.unshift({
            savedAt: Date.now(),
            name: cur.name || '',
            text: cur.text || ''
        });
        if (newHistory.length > HISTORY_MAX) newHistory.length = HISTORY_MAX;
        orgData[docType][index] = {
            name: target.name || '',
            text: target.text || '',
            enabled: cur.enabled !== false,
            history: newHistory
        };
        setOrgData(currentOrg, orgData);
        closeHistoryModal();
        renderList();
        showToast('已恢复至历史版本', 'success');
    };

    // ===== 删除 =====
    window.deleteItem = function(docType, index) {
        const orgData = getOrgData(currentOrg);
        if (!Array.isArray(orgData[docType])) return;
        const item = orgData[docType][index];
        if (!item) return;
        if (!confirm('确定删除指令「' + (item.name || '') + '」吗？此操作不可恢复。')) return;
        orgData[docType].splice(index, 1);
        setOrgData(currentOrg, orgData);
        editingState = null;
        renderList();
        showToast('指令已删除', 'success');
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
        renderList();
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

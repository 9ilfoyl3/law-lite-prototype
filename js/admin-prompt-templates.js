// ============ Admin Prompt Templates Management ============
// v1.0 指令管理：维护各文书类型的指令
// v1.3 V1.3 A5: 关联维度由「文书类型」改为「关联 workflow」（多选，空=通用指令）。
//     存储改为扁平数组 adminPromptTemplates[org].__items__ = [{id, name, text, workflowIds, enabled, history}]；
//     旧 docType 分组数据保留不删（case-data.js getReqTemplatesByWorkflow 合并读取，视为通用）；
//     内置指令仍存于 defaultRequirementTemplates（按文书类型分组），读取时按
//     BUILTIN_PROMPT_WORKFLOW_IDS_BY_DOCTYPE 推导默认关联；首次编辑/停用内置项时整体物化为 __items__。
//     依据 docs/V1.3版本PRD（人看）.md 5.4
// v1.2: 单条历史版本记录（最多 10 条快照，支持一键恢复）——机制保留
// v1.4 V1.3.29 A36: 关联维度由「关联 workflow」回到「文书类型 docType」（单选，空=通用指令）。
//     左栏改为「全部 / 通用指令 / 各文书类型」；列表列「关联流程」改为「文书类型」；
//     编辑弹窗的流程多选框改为类型单选下拉 ptDocTypeSelect。
//     零迁移：历史 __items__ 只有 workflowIds 没有 docType，由 case-data.js 的 resolvePromptDocType
//     统一解析（docType 字段 → 内置 id 前缀 → workflowIds 首个流程的 domain → 通用），管理端与用户侧共用。
//     workflowIds 字段继续保留在存储里，界面不再展示也不再读写。依据 5.2.18

(function() {
    'use strict';

    // ===== 状态 =====
    let currentOrg = 'court';
    let currentDocTypeFilter = '';   // V1.3.29 A36: '' = 全部；'general' = 通用；其余 = 文书类型 key
    let editingId = null;         // 编辑中的指令 id（内置为 docType#index 形态；新增为 null）
    let editingIsBuiltin = false;
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

    // v1.2 历史版本管理工具
    const HISTORY_MAX = 10;
    function pushHistory(prevHistory, snapshot) {
        const arr = Array.isArray(prevHistory) ? prevHistory.slice() : [];
        arr.unshift(snapshot);  // 头部追加（最新在前）
        if (arr.length > HISTORY_MAX) arr.length = HISTORY_MAX;  // 截断
        return arr;
    }

    // ===== 内置指令（虚拟项）=====
    // V1.3 A5: 内置指令按文书类型分组存储不变，读取时推导 id 与默认 workflowIds
    function getBuiltinDisabledMap(org) {
        const orgData = getOrgData(org);
        const d = orgData.__builtinDisabled__;
        return (d && typeof d === 'object' && !Array.isArray(d)) ? d : {};
    }

    function getBuiltinItems(org) {
        const groups = (typeof defaultRequirementTemplates !== 'undefined')
            ? (defaultRequirementTemplates[org] || {}) : {};
        const typeMap = (typeof BUILTIN_PROMPT_WORKFLOW_IDS_BY_DOCTYPE !== 'undefined')
            ? (BUILTIN_PROMPT_WORKFLOW_IDS_BY_DOCTYPE[org] || {}) : {};
        const disabledMap = getBuiltinDisabledMap(org);
        const out = [];
        Object.entries(groups).forEach(([docTypeKey, arr]) => {
            if (!Array.isArray(arr)) return;
            const disabledArr = Array.isArray(disabledMap[docTypeKey]) ? disabledMap[docTypeKey] : [];
            const workflowIds = Array.isArray(typeMap[docTypeKey]) ? typeMap[docTypeKey].slice() : [];
            arr.forEach((p, i) => {
                out.push({
                    id: docTypeKey + '#' + i,
                    name: p.name || '',
                    text: p.text || '',
                    workflowIds: workflowIds,
                    // V1.3.29 A36: 内置指令按文书类型分组存储，分组 key 本身就是类型 key
                    docType: docTypeKey,
                    enabled: disabledArr.indexOf(i) < 0,
                    history: [],
                    isBuiltin: true
                });
            });
        });
        return out;
    }

    // ===== 全部指令（内置虚拟 + 已物化自定义）=====
    // 物化标记：__materialized__ = true 表示内置已全部迁入 __items__；
    // 未物化时（管理员只是新增/删除自定义项）内置项仍以虚拟形式参与展示与用户侧读取，
    // 避免新增一条自定义指令就把全部内置指令"挤没"。
    function getAllItems(org) {
        const orgData = getOrgData(org);
        const hasItems = Array.isArray(orgData.__items__);
        const materialized = hasItems && orgData.__materialized__ === true;
        const out = [];
        if (hasItems) {
            orgData.__items__.forEach((p, i) => {
                out.push({
                    id: p.id || ('custom#' + i),
                    name: p.name || '',
                    text: p.text || '',
                    workflowIds: Array.isArray(p.workflowIds) ? p.workflowIds.slice() : [],
                    // V1.3.29 A36: 历史数据缺 docType 时按四级规则反推（见 case-data.js resolvePromptDocType）
                    docType: (typeof resolvePromptDocType === 'function') ? resolvePromptDocType(org, p) : '',
                    enabled: p.enabled !== false,
                    history: Array.isArray(p.history) ? p.history : [],
                    isBuiltin: false,
                    index: i
                });
            });
        }
        if (!materialized) {
            getBuiltinItems(org).forEach(p => out.push(p));
        }
        return out;
    }

    // 物化：把内置指令全部迁入 __items__（保留停用状态），返回 orgData（幂等）
    function materialize(org) {
        const orgData = getOrgData(org);
        if (orgData.__materialized__ === true && Array.isArray(orgData.__items__)) return orgData;
        const prevItems = Array.isArray(orgData.__items__) ? orgData.__items__ : [];
        const builtin = getBuiltinItems(org);
        // 内置排前、已有自定义排后，顺序稳定（与虚拟展示顺序一致）
        orgData.__items__ = builtin.map(p => ({
            id: p.id, name: p.name, text: p.text,
            workflowIds: p.workflowIds,
            // V1.3.29 A36: 物化时把内置项的文书类型一并落库（分组 key），历史回滚亦据此保持类型不变
            docType: p.docType || '',
            enabled: p.enabled, history: []
        })).concat(prevItems.filter(p => p && typeof p === 'object'));
        orgData.__materialized__ = true;
        // 清理旧停用字典（已随物化转为 enabled 字段）
        delete orgData.__builtinDisabled__;
        return orgData;
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

    // ===== 筛选口径（V1.3.29 A36: 回到文书类型，与示例管理页完全一致——含通用项）=====
    function matchesFilter(item) {
        if (currentDocTypeFilter === '') return true;
        const dt = item.docType || '';
        if (currentDocTypeFilter === 'general') return dt === '';
        return dt === '' || dt === currentDocTypeFilter;   // 通用指令在任何类型下都可见
    }
    function matchesFilterWith(item, dtKey) {
        const dt = item.docType || '';
        return dt === '' || dt === dtKey;
    }

    // 取文书类型显示名（未指定 = 通用）
    function docTypeName(org, key) {
        if (!key) return '通用';
        let docTypes = {};
        if (typeof getAdminDocTypes === 'function') docTypes = getAdminDocTypes(org) || {};
        return (docTypes[key] && docTypes[key].name) || key;
    }

    // ===== 渲染左侧（V1.3.29 A36: 全部 / 通用指令 / 各文书类型）=====
    function renderLeft() {
        const items = getAllItems(currentOrg);
        const generalCount = items.filter(p => (p.docType || '') === '').length;
        let docTypes = {};
        if (typeof getAdminDocTypes === 'function') docTypes = getAdminDocTypes(currentOrg) || {};

        const leftEl = document.getElementById('ptLeft');
        let html = '<div class="pt-left-item' + (currentDocTypeFilter === '' ? ' active' : '') + '" onclick="selectDocTypeFilter(\'\')">'
            + '<i class="fas fa-layer-group"></i><span>全部</span><span class="count">' + items.length + '</span></div>';
        html += '<div class="pt-left-item' + (currentDocTypeFilter === 'general' ? ' active' : '') + '" onclick="selectDocTypeFilter(\'general\')">'
            + '<i class="fas fa-globe"></i><span>通用指令</span><span class="count">' + generalCount + '</span></div>';

        Object.keys(docTypes).forEach(dtKey => {
            const count = items.filter(p => matchesFilterWith(p, dtKey)).length;
            html += '<div class="pt-left-item' + (currentDocTypeFilter === dtKey ? ' active' : '') + '" onclick="selectDocTypeFilter(\'' + escapeHtml(dtKey) + '\')">'
                + '<i class="fas fa-folder"></i>'
                + '<span>' + escapeHtml(docTypes[dtKey].name || dtKey) + '</span>'
                + '<span class="count">' + count + '</span></div>';
        });
        leftEl.innerHTML = html;
    }
    window.selectDocTypeFilter = function(key) {
        currentDocTypeFilter = key;
        renderLeft();
        renderRight();
    };
    // 兼容旧命名（避免其他页面残留调用报错）
    window.selectWf = window.selectDocTypeFilter;
    window.selectDocType = window.selectDocTypeFilter;

    // ===== 渲染右侧 =====
    function renderRight() {
        const rightTitle = document.getElementById('rightTitle');
        if (currentDocTypeFilter === 'general') {
            rightTitle.textContent = '通用指令';
        } else if (currentDocTypeFilter) {
            const dtCfg = (typeof getAdminDocTypes === 'function' ? getAdminDocTypes(currentOrg) : {})[currentDocTypeFilter];
            rightTitle.textContent = dtCfg ? dtCfg.name : '指令列表';
        } else {
            rightTitle.textContent = '全部指令';
        }

        const tbody = document.getElementById('ptTbody');
        const table = document.getElementById('ptTable');
        const empty = document.getElementById('emptyState');
        const legacyBox = document.getElementById('legacyBar');
        const items = getAllItems(currentOrg).filter(matchesFilter);

        // V1.3 A5: 旧版（按文书类型分组）数据提示条——用户侧按「通用指令」兜底读取，可一键清除
        let legacyBar = '';
        const legacyCount = (typeof countLegacyPromptGroups === 'function') ? countLegacyPromptGroups(currentOrg) : 0;
        if (legacyCount > 0) {
            legacyBar = '<div class="legacy-bar"><i class="fas fa-database"></i>'
                + '<span>检测到 <strong>' + legacyCount + '</strong> 条旧版（按文书类型分组）指令，用户侧将按「通用指令」继续生效。</span>'
                + '<button class="action-btn" onclick="clearLegacyPrompts()">清除旧数据</button>'
                + '<span class="legacy-hint">清除前请确认已在新版中重建所需指令</span></div>';
        }
        legacyBox.innerHTML = legacyBar;

        if (items.length === 0 && legacyCount === 0) {
            table.style.display = 'none';
            empty.style.display = 'block';
            return;
        }
        empty.style.display = 'none';
        table.style.display = '';

        // V1.3.24 A31: 卡片改表格，状态独立列、操作栏统一【编辑/启用·停用/删除】
        const rows = items.map(item => {
            const text = item.text || '';
            const preview = text.length > 200 ? text.slice(0, 200) + '…' : text;
            const previewCell = escapeHtml(preview) || '<span style="color:var(--text-muted);font-style:italic;">（空指令）</span>';
            const isEnabled = item.enabled !== false;
            const statusBadge = isEnabled
                ? '<span class="status-badge status-on">已启用</span>'
                : '<span class="status-badge status-off">已停用</span>';
            const toggleBtn = isEnabled
                ? '<button class="action-btn toggle-off" onclick="togglePromptEnabled(\'' + item.id + '\')">停用</button>'
                : '<button class="action-btn toggle-on" onclick="togglePromptEnabled(\'' + item.id + '\')">启用</button>';
            // v1.2 历史版本入口已迁至编辑弹窗（A31），列表不再渲染历史按钮
            // V1.3.29 A36: 列回归「文书类型」（未指定类型的指令显示为「通用」）
            const dtKey = item.docType || '';
            const dtText = dtKey
                ? escapeHtml(docTypeName(currentOrg, dtKey))
                : '<span class="pt-wf-general">通用</span>';
            const actions = item.isBuiltin
                ? '<button class="action-btn edit" onclick="editPrompt(\'' + item.id + '\')">编辑</button>' + toggleBtn
                : '<button class="action-btn edit" onclick="editPrompt(\'' + item.id + '\')">编辑</button>'
                  + toggleBtn
                  + '<button class="action-btn delete" onclick="deletePrompt(\'' + item.id + '\')">删除</button>';
            return '<tr>'
                + '<td class="tpl-name-cell">' + escapeHtml(item.name) + '</td>'
                + '<td class="pt-preview-cell">' + previewCell + '</td>'
                + '<td>' + dtText + '</td>'
                + '<td>' + statusBadge + '</td>'
                + '<td class="tpl-action-cell">' + actions + '</td>'
                + '</tr>';
        });
        tbody.innerHTML = rows.join('');
    }

    // ===== 新增/编辑弹窗 =====
    window.openAddModal = function() {
        editingId = null;
        editingIsBuiltin = false;
        document.getElementById('modalTitle').textContent = '新增指令';
        document.getElementById('ptName').value = '';
        document.getElementById('ptText').value = '';
        fillDocTypeSelect('');
        // V1.3.24 A31: 新增态无历史版本，隐藏弹窗内「历史版本」按钮
        const hb = document.getElementById('modalHistoryBtn');
        if (hb) hb.style.display = 'none';
        document.getElementById('ptModal').classList.add('show');
        setTimeout(() => document.getElementById('ptName').focus(), 50);
    };

    window.editPrompt = function(id) {
        const item = getAllItems(currentOrg).find(p => p.id === id);
        if (!item) return;
        editingId = id;
        editingIsBuiltin = !!item.isBuiltin;
        document.getElementById('modalTitle').textContent = editingIsBuiltin ? '编辑内置指令（另存为自定义）' : '编辑指令';
        document.getElementById('ptName').value = item.name;
        document.getElementById('ptText').value = item.text;
        fillDocTypeSelect(item.docType || '');
        // V1.3.24 A31: 编辑态显示「历史版本」入口（列表历史按钮已移除）
        const hb = document.getElementById('modalHistoryBtn');
        if (hb) hb.style.display = '';
        document.getElementById('ptModal').classList.add('show');
    };

    // V1.3.24 A31: 编辑弹窗内的「历史版本」入口（替代列表行历史按钮）
    window.openHistoryFromModal = function() {
        if (editingId) openHistoryModal(editingId);
    };

    window.closeModal = function() {
        document.getElementById('ptModal').classList.remove('show');
        editingId = null;
        editingIsBuiltin = false;
    };

    // V1.3.29 A36: 文书类型单选下拉（不选 = 通用指令）——与示例管理页 tplDocTypeSelect 同版式
    function fillDocTypeSelect(selected) {
        const sel = document.getElementById('ptDocTypeSelect');
        if (!sel) return;
        let docTypes = {};
        if (typeof getAdminDocTypes === 'function') docTypes = getAdminDocTypes(currentOrg) || {};
        let html = '<option value="">通用指令（不指定类型）</option>';
        Object.keys(docTypes).forEach(key => {
            html += '<option value="' + escapeHtml(key) + '">' + escapeHtml(docTypes[key].name || key) + '</option>';
        });
        sel.innerHTML = html;
        sel.value = selected || '';
    }

    function readDocType() {
        const sel = document.getElementById('ptDocTypeSelect');
        return sel ? (sel.value || '') : '';
    }

    window.savePrompt = function() {
        const name = document.getElementById('ptName').value.trim();
        const text = document.getElementById('ptText').value;
        const workflowIds = [];        // V1.3.29 A36: workflowIds 停止读写（字段保留，零迁移）
        const docType = readDocType();

        if (!name) {
            showNotification('请填写标签名', 'error');
            document.getElementById('ptName').focus();
            return;
        }
        // text 允许为空（用于「其他自定义」这类清空需求的标签），但需提示
        if (!text && !confirm('指令正文为空，用户点击该标签会清空指令输入框。确认保存？')) {
            return;
        }
        // V1.3.29 A36: 文书类型可为空（空 = 通用指令，各类型下均可见），不再强制必选

        // 编辑内置指令：先物化全部内置为 __items__
        if (editingIsBuiltin) {
            const orgData = materialize(currentOrg);
            const idx = orgData.__items__.findIndex(p => p.id === editingId);
            if (idx < 0) { showNotification('指令不存在', 'error'); return; }
            const cur = orgData.__items__[idx];
            const newHistory = pushHistory([], {
                savedAt: Date.now(),
                name: cur.name || '',
                text: cur.text || ''
            });
            orgData.__items__[idx] = {
                id: editingId,
                name: name,
                text: text,
                workflowIds: workflowIds,     // 字段保留不再读
                docType: docType,
                enabled: cur.enabled !== false,
                history: newHistory
            };
            setOrgData(currentOrg, orgData);
        } else if (editingId) {
            // 编辑自定义指令
            const orgData = getOrgData(currentOrg);
            if (!Array.isArray(orgData.__items__)) orgData.__items__ = [];
            const idx = orgData.__items__.findIndex(p => p.id === editingId);
            if (idx < 0) { showNotification('指令不存在', 'error'); return; }
            const cur = orgData.__items__[idx];
            const newHistory = pushHistory(cur.history, {
                savedAt: Date.now(),
                name: cur.name || '',
                text: cur.text || ''
            });
            orgData.__items__[idx] = {
                id: editingId,
                name: name,
                text: text,
                workflowIds: workflowIds,     // 字段保留不再读
                docType: docType,
                enabled: cur.enabled !== false,
                history: newHistory
            };
            setOrgData(currentOrg, orgData);
        } else {
            // 新增
            const orgData = getOrgData(currentOrg);
            if (!Array.isArray(orgData.__items__)) orgData.__items__ = [];
            orgData.__items__.push({
                id: 'custom-' + Date.now().toString(36) + Math.floor(Math.random() * 100),
                name: name,
                text: text,
                workflowIds: workflowIds,     // 字段保留不再读
                docType: docType,
                enabled: true,
                history: []
            });
            setOrgData(currentOrg, orgData);
        }

        closeModal();
        renderLeft();
        renderRight();
        showNotification(editingId ? '指令已更新' : '指令已新增', 'success');
    };

    // V1.3 A5: 清除旧版分组数据
    window.clearLegacyPrompts = function() {
        const n = (typeof countLegacyPromptGroups === 'function') ? countLegacyPromptGroups(currentOrg) : 0;
        showConfirm('清除旧版指令数据', '将删除 ' + n + ' 条旧版（按文书类型分组）指令数据，此操作不可恢复。确认清除？', () => {
            if (typeof clearLegacyPromptGroups === 'function') clearLegacyPromptGroups(currentOrg);
            renderLeft();
            renderRight();
            showNotification('旧版数据已清除', 'success');
        });
    };

    // ===== 启用/停用切换 =====
    window.togglePromptEnabled = function(id) {
        const items = getAllItems(currentOrg);
        const item = items.find(p => p.id === id);
        if (!item) return;
        const newEnabled = item.enabled === false; // 反转
        if (item.isBuiltin) {
            // 内置指令：物化后改 enabled（V1.3 A5 统一机制）
            const orgData = materialize(currentOrg);
            const idx = orgData.__items__.findIndex(p => p.id === id);
            if (idx >= 0) orgData.__items__[idx].enabled = newEnabled;
            setOrgData(currentOrg, orgData);
        } else {
            const orgData = getOrgData(currentOrg);
            if (Array.isArray(orgData.__items__)) {
                const idx = orgData.__items__.findIndex(p => p.id === id);
                if (idx >= 0) orgData.__items__[idx].enabled = newEnabled;
                setOrgData(currentOrg, orgData);
            }
        }
        renderLeft();
        renderRight();
        showNotification(newEnabled ? '指令已启用' : '指令已停用', 'success');
    };

    // ===== 删除 =====
    window.deletePrompt = function(id) {
        const item = getAllItems(currentOrg).find(p => p.id === id);
        if (!item) return;
        if (item.isBuiltin) {
            showNotification('内置指令不可删除', 'warning');
            return;
        }
        showConfirm('删除指令', '确定删除标签「' + item.name + '」吗？此操作不可恢复。', () => {
            const orgData = getOrgData(currentOrg);
            if (Array.isArray(orgData.__items__)) {
                const idx = orgData.__items__.findIndex(p => p.id === id);
                if (idx >= 0) orgData.__items__.splice(idx, 1);
                setOrgData(currentOrg, orgData);
            }
            renderLeft();
            renderRight();
            showNotification('指令已删除', 'success');
        });
    };

    // ===== v1.2 历史版本管理 =====
    let historyContext = null;  // 指令 id

    function formatTime(ts) {
        const d = new Date(ts);
        const pad = n => (n < 10 ? '0' + n : '' + n);
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
            + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
    }

    window.openHistoryModal = function(id) {
        const item = getAllItems(currentOrg).find(p => p.id === id);
        if (!item) return;
        const history = Array.isArray(item.history) ? item.history : [];
        if (history.length === 0) {
            showNotification('该指令暂无历史版本', 'warning');
            return;
        }
        historyContext = id;
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
        const id = historyContext;
        const orgData = getOrgData(currentOrg);
        if (!Array.isArray(orgData.__items__)) {
            closeHistoryModal();
            return;
        }
        const idx = orgData.__items__.findIndex(p => p.id === id);
        if (idx < 0) {
            closeHistoryModal();
            return;
        }
        const cur = orgData.__items__[idx];
        const history = Array.isArray(cur.history) ? cur.history : [];
        const target = history[histIdx];
        if (!target) {
            showNotification('历史版本不存在', 'error');
            return;
        }
        showConfirm('恢复历史版本', '确定将当前内容回滚至「' + formatTime(target.savedAt) + '」的版本吗？当前内容会自动入栈为新历史。', () => {
            const newHistory = history.slice();
            newHistory.unshift({
                savedAt: Date.now(),
                name: cur.name || '',
                text: cur.text || ''
            });
            if (newHistory.length > HISTORY_MAX) newHistory.length = HISTORY_MAX;
            orgData.__items__[idx] = {
                id: id,
                name: target.name || '',
                text: target.text || '',
                workflowIds: Array.isArray(cur.workflowIds) ? cur.workflowIds : [],
                // V1.3.29 A36: 回滚不改动文书类型（历史快照只记录 name/text）
                docType: typeof cur.docType === 'string' ? cur.docType : '',
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
            const action = pendingConfirmAction;   // V1.3 修复：先取回调再关弹窗（closeConfirm 会把 pendingConfirmAction 置空，原写法导致确认回调永不执行）
            closeConfirm();
            if (typeof action === 'function') action();
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

    window.AdminPromptTemplates = { getAllItems, getOrgData, setOrgData };
})();

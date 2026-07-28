// ============ Admin Doc Types Management ============
// v1.0 文书类型管理：维护各业务系统文书类型（模板/提示词的父级分类）
// v1.28/v1.29 workflow 新增 type 字段（'step'=展示型 | 'material'=不展示型），弹窗加类型 radio，子表格加类型列
// v1.29: 类型命名简化为展示型/不展示型（内部仍用 'step'/'material'）
// v1.32: workflow 配置调整——id 改为下拉框（数据来自 agentflow 平台 mock）；类型命名改为分步生成型/直接生成型；
//        新增「匹配案由」字段；移除步骤序列编辑器（节点序列由 agentflow 平台内部决定）
// v1.33: 类型命名调整——「直接生成型」改为「一步生成型」（内部仍用 'material'），与用户侧 tab 命名「一步生成」对齐
// v1.34: 启用/停用状态——表格新增「状态」列与「停用/启用」按钮；移除冗余「来源」列（保留类型名称列的内置/自定义徽章）
// 数据持久化：localStorage.adminDocTypes（按业务系统分组）
// 用户侧联动：case-data.js mergeAdminDocTypes 在加载时合并到 system.docTypes

(function() {
    'use strict';

    // v1.8: 移除文书类型与 workflow 步骤的 icon 字段（PRESET_ICONS、selectedIcon、renderIconPicker、selectIcon 一并移除）

    // ===== 状态 =====
    let currentOrg = 'court';
    let editingKey = null;        // 当前编辑的 key（null=新增模式）
    let editingIsBuiltin = false; // 编辑的是内置类型（编辑后转为自定义覆盖）
    let pendingConfirmAction = null;

    // ===== 存储 =====
    function getStorage() {
        try {
            return JSON.parse(localStorage.getItem('adminDocTypes')) || {};
        } catch (e) {
            return {};
        }
    }
    function saveStorage(data) {
        localStorage.setItem('adminDocTypes', JSON.stringify(data));
    }
    function getOrgData(org) {
        return getStorage()[org] || {};
    }
    function setOrgData(org, data) {
        const all = getStorage();
        all[org] = data;
        saveStorage(all);
    }

    // 通过 getAdminDocTypes（case-data.js）读取合并后的类型
    function getDocTypes(org) {
        return getAdminDocTypes(org) || {};
    }

    // 统计某类型下的模板数（内置 + admin + my）
    function countTemplates(org, typeKey) {
        let count = 0;
        // 内置 + admin 模板
        const adminTpls = JSON.parse(localStorage.getItem('adminDocTemplates') || '{}');
        const orgAdminTpls = adminTpls[org] || {};
        Object.values(orgAdminTpls).forEach(t => {
            if (t && t.docType === typeKey) count++;
        });
        // 内置模板（defaultDocTemplatesByOrg 是 key→字符串，无 docType 字段，需通过 defaultDocTypesByOrg 的 templates 数组反查）
        const defaultTypes = defaultDocTypesByOrg[org] || {};
        const defaultTypeCfg = defaultTypes[typeKey];
        if (defaultTypeCfg && Array.isArray(defaultTypeCfg.templates)) {
            count += defaultTypeCfg.templates.length;
        }
        // 用户侧模板
        const myTpls = JSON.parse(localStorage.getItem('myDocTemplates') || '{}');
        const orgMyTpls = myTpls[org] || {};
        Object.values(orgMyTpls).forEach(t => {
            if (t && t.docType === typeKey) count++;
        });
        return count;
    }

    // 统计某类型下的提示词数（内置 + admin + my）
    function countPrompts(org, typeKey) {
        let count = 0;
        // admin 提示词
        const adminPrompts = JSON.parse(localStorage.getItem('adminPromptTemplates') || '{}');
        const orgAdminPrompts = adminPrompts[org] || {};
        if (Array.isArray(orgAdminPrompts[typeKey])) {
            count += orgAdminPrompts[typeKey].length;
        } else {
            // 内置提示词
            const defaults = (defaultRequirementTemplates[org] && defaultRequirementTemplates[org][typeKey]) || [];
            count += defaults.length;
        }
        // 用户侧提示词
        const myPrompts = JSON.parse(localStorage.getItem('myPromptTemplates') || '{}');
        const orgMyPrompts = myPrompts[org] || {};
        if (Array.isArray(orgMyPrompts[typeKey])) {
            count += orgMyPrompts[typeKey].length;
        }
        return count;
    }

    // 生成唯一 key
    function genTypeKey(name) {
        const base = 'custom-' + Date.now().toString(36);
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
        setTimeout(() => div.remove(), 2800);
    }

    function escapeHtml(s) {
        if (s === undefined || s === null) return '';
        return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    }

    // ===== 业务系统切换 =====
    window.switchBusiness = function(type) {
        if (type === currentOrg) return;
        currentOrg = type;
        document.querySelectorAll('.business-switch-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.type === type);
        });
        renderTable();
    };

    // ===== 渲染表格 =====
    let expandedKeys = new Set(); // 当前展开的类型 key

    // v1.34: 读取类型的启用状态（默认启用；自定义覆盖中 enabled===false 视为停用）
    function getTypeEnabled(key) {
        const orgData = getOrgData(currentOrg);
        if (orgData[key]) {
            return orgData[key].enabled !== false;
        }
        return true;  // 内置类型无覆盖，默认启用
    }

    function renderTable() {
        const docTypes = getDocTypes(currentOrg);
        const rightTitle = document.getElementById('rightTitle');
        const orgNames = { court: '法院', procuratorate: '检察院', justice: '司法局' };
        rightTitle.textContent = (orgNames[currentOrg] || '') + '文书类型';

        const list = Object.entries(docTypes);
        const tbody = document.getElementById('tplTbody');
        const empty = document.getElementById('emptyState');
        if (list.length === 0) {
            tbody.innerHTML = '';
            empty.style.display = 'block';
            return;
        }
        empty.style.display = 'none';

        tbody.innerHTML = list.map(([key, t]) => {
            const tplCount = countTemplates(currentOrg, key);
            const promptCount = countPrompts(currentOrg, key);
            const wfCount = (typeof countWorkflowsForDocType === 'function')
                ? countWorkflowsForDocType(currentOrg, key) : 0;
            const badge = t.isBuiltin
                ? '<span class="tpl-badge builtin">内置</span>'
                : '<span class="tpl-badge custom">自定义</span>';
            // v1.34: 状态徽章与停用/启用按钮
            const isEnabled = getTypeEnabled(key);
            const statusBadge = isEnabled
                ? '<span class="status-badge enabled">已启用</span>'
                : '<span class="status-badge disabled">已停用</span>';
            const toggleBtn = isEnabled
                ? '<button class="action-btn disable" onclick="toggleTypeEnabled(\'' + key + '\')">停用</button>'
                : '<button class="action-btn enable" onclick="toggleTypeEnabled(\'' + key + '\')">启用</button>';
            const tplCountClass = tplCount > 0 ? 'count-cell has' : 'count-cell zero';
            const promptCountClass = promptCount > 0 ? 'count-cell has' : 'count-cell zero';
            const wfCountClass = wfCount > 0 ? 'wf-count-cell' : 'wf-count-cell zero';
            const actions = '<button class="action-btn edit" onclick="editType(\'' + key + '\')">编辑</button>'
                + toggleBtn
                + '<button class="action-btn delete" onclick="deleteType(\'' + key + '\')">删除</button>';
            const isExpanded = expandedKeys.has(key);
            const expandBtn = '<button class="expand-btn' + (isExpanded ? ' expanded' : '') + '" onclick="toggleWfExpand(\'' + key + '\')"><i class="fas fa-chevron-right"></i></button>';

            let html = '<tr>'
                + '<td>' + expandBtn + '</td>'
                + '<td class="tpl-name-cell">' + escapeHtml(t.name) + badge + '</td>'
                + '<td class="' + tplCountClass + '">' + tplCount + '</td>'
                + '<td class="' + promptCountClass + '">' + promptCount + '</td>'
                + '<td class="' + wfCountClass + '">' + wfCount + '</td>'
                + '<td>' + statusBadge + '</td>'
                + '<td class="tpl-action-cell">' + actions + '</td>'
                + '</tr>';

            // 展开行：workflow 子表格
            if (isExpanded) {
                html += renderWfSubRow(key, t);
            }
            return html;
        }).join('');
    }

    // ===== workflow 展开行 =====
    function renderWfSubRow(docTypeKey, typeCfg) {
        const workflows = (typeof getWorkflowsForDocType === 'function')
            ? getWorkflowsForDocType(currentOrg, docTypeKey) : [];
        const orgData = getWfOrgData(currentOrg);
        const isCustomized = orgData[docTypeKey] && Array.isArray(orgData[docTypeKey]) && orgData[docTypeKey].length > 0;

        // v1.32: 按类型分组统计，用于删除按钮禁用判断
        const stepWfs = workflows.filter(w => (w.type || 'step') === 'step');
        const materialWfs = workflows.filter(w => (w.type || 'step') === 'material');

        let rowsHtml = '';
        if (workflows.length === 0) {
            rowsHtml = '<tr><td colspan="6" class="step-empty">暂无 workflow，点击「新增 workflow」创建</td></tr>';
        } else {
            rowsHtml = workflows.map(wf => {
                const wfType = wf.type || 'step';
                const wfBadge = wf.isBuiltin
                    ? '<span class="wf-badge builtin">内置</span>'
                    : '<span class="wf-badge custom">自定义</span>';
                // v1.33: 类型徽章（命名改为分步生成型/一步生成型）
                const typeBadge = wfType === 'material'
                    ? '<span class="wf-type-badge material">一步生成型</span>'
                    : '<span class="wf-type-badge step">分步生成型</span>';
                const caseWordsHtml = (!wf.caseWords || wf.caseWords.length === 0)
                    ? '<span class="case-word-fallback">兜底</span>'
                    : wf.caseWords.map(w => '<span class="case-word-tag">' + escapeHtml(w) + '</span>').join('');
                // v1.32: 匹配案由列（新增）
                const causesHtml = (!wf.causes || wf.causes.length === 0)
                    ? '<span class="case-word-fallback">兜底</span>'
                    : wf.causes.map(c => '<span class="case-word-tag">' + escapeHtml(c) + '</span>').join('');
                // v1.32: 删除按钮禁用规则——同类型仅剩 1 个时禁用
                const sameTypeCount = wfType === 'material' ? materialWfs.length : stepWfs.length;
                const isOnlyOneOfSameType = sameTypeCount <= 1;
                const deleteTitle = isOnlyOneOfSameType
                    ? ('每个类型至少需保留 1 个' + (wfType === 'material' ? '一步生成型' : '分步生成型') + ' workflow')
                    : '';
                const deleteBtn = isOnlyOneOfSameType
                    ? '<button class="action-btn delete" disabled title="' + deleteTitle + '">删除</button>'
                    : '<button class="action-btn delete" onclick="deleteWorkflow(\'' + docTypeKey + '\',\'' + wf.id + '\')">删除</button>';
                const editBtn = '<button class="action-btn edit" onclick="editWorkflow(\'' + docTypeKey + '\',\'' + wf.id + '\')">编辑</button>';
                return '<tr>'
                    + '<td class="wf-name-cell">' + escapeHtml(wf.name) + wfBadge + '</td>'
                    + '<td>' + typeBadge + '</td>'
                    + '<td>' + caseWordsHtml + '</td>'
                    + '<td>' + causesHtml + '</td>'
                    + '<td>' + wfBadge + '</td>'
                    + '<td class="tpl-action-cell">' + editBtn + deleteBtn + '</td>'
                    + '</tr>';
            }).join('');
        }

        const title = escapeHtml(typeCfg.name) + ' 的 workflow';
        const hint = isCustomized ? '(已自定义，删除全部 workflow 恢复内置)' : '(使用内置默认)';
        return '<tr class="wf-sub-row"><td colspan="7"><div class="wf-sub-wrap">'
            + '<div class="wf-sub-header">'
            + '  <div class="wf-sub-title">' + title + '<span class="hint">' + hint + '</span></div>'
            + '  <button class="btn btn-primary" onclick="openAddWfModal(\'' + docTypeKey + '\')"><i class="fas fa-plus"></i> 新增 workflow</button>'
            + '</div>'
            + '<table class="wf-sub-table"><thead><tr>'
            + '<th>workflow 名称</th><th style="width:80px;">类型</th><th>匹配案字</th><th>匹配案由</th><th style="width:90px;">来源</th><th style="width:140px;">操作</th>'
            + '</tr></thead><tbody>' + rowsHtml + '</tbody></table>'
            + '</div></td></tr>';
    }

    window.toggleWfExpand = function(docTypeKey) {
        if (expandedKeys.has(docTypeKey)) {
            expandedKeys.delete(docTypeKey);
        } else {
            expandedKeys.add(docTypeKey);
        }
        renderTable();
    };

    // ===== workflow 存储 =====
    function getWfStorage() {
        try {
            return JSON.parse(localStorage.getItem('adminWorkflows')) || {};
        } catch (e) { return {}; }
    }
    function saveWfStorage(data) {
        localStorage.setItem('adminWorkflows', JSON.stringify(data));
    }
    function getWfOrgData(org) {
        return getWfStorage()[org] || {};
    }
    function setWfOrgData(org, data) {
        const all = getWfStorage();
        all[org] = data;
        saveWfStorage(all);
    }
    function genWfId(docTypeKey) {
        // v1.32: 保留函数以兼容外部调用，但 saveWorkflow 不再使用（id 改为从下拉框取）
        return 'wf-' + docTypeKey + '-' + Date.now().toString(36);
    }

    // ===== workflow 新增/编辑弹窗 =====
    let wfEditingDocType = null;    // 当前编辑 workflow 所属的 docTypeKey
    let wfEditingId = null;         // 当前编辑的 workflow id（null=新增）
    let wfSelectedCaseWords = new Set();
    let wfSelectedCauses = new Set();   // v1.32: 选中的匹配案由
    let wfEditingType = 'step';     // v1.32: 当前编辑的 workflow 类型（'step' | 'material'）
    let wfEditingBuiltin = false;   // 是否编辑内置 workflow（控制 id 下拉只读）

    // v1.32: 渲染 workflow id 下拉框（数据来自 agentflow 平台 mock 列表）
    function renderWfIdSelect(docTypeKey, selectedId, isBuiltin) {
        const select = document.getElementById('wfId');
        const list = (typeof agentflowWorkflowList !== 'undefined') ? agentflowWorkflowList : [];
        // 过滤掉当前 docType 下已被其他 workflow 占用的 id
        const existingWfs = getWorkflowsForDocType(currentOrg, docTypeKey);
        const usedIds = new Set(existingWfs.filter(w => w.id !== wfEditingId).map(w => w.id));
        let options = '<option value="">请从 agentflow 平台已编排的 workflow 中选择</option>';
        list.forEach(item => {
            const isUsed = usedIds.has(item.id);
            // 编辑内置时，原 id 即使不在列表也需展示
            const isCurrentBuiltin = isBuiltin && item.id === selectedId;
            if (isUsed && !isCurrentBuiltin) return;  // 已被占用且不是当前编辑项，跳过
            const isSelected = item.id === selectedId;
            const label = item.id + ' - ' + item.name + (item.description ? '（' + item.description + '）' : '');
            options += '<option value="' + escapeHtml(item.id) + '"' + (isSelected ? ' selected' : '') + '>' + escapeHtml(label) + '</option>';
        });
        // 编辑内置时，若原 id 不在 mock 列表中，补一个选项保证可显示
        if (isBuiltin && selectedId && !list.some(item => item.id === selectedId)) {
            options += '<option value="' + escapeHtml(selectedId) + '" selected>' + escapeHtml(selectedId) + '（内置，未在 agentflow 平台列表中）</option>';
        }
        select.innerHTML = options;
        select.disabled = isBuiltin;  // v1.32: 编辑内置时下拉只读
    }

    // v1.32: workflow id 下拉框选择变化时，自动带出 name
    window.onWfIdChange = function() {
        const select = document.getElementById('wfId');
        const id = select.value;
        const nameInput = document.getElementById('wfName');
        if (!id) {
            nameInput.value = '';
            return;
        }
        const list = (typeof agentflowWorkflowList !== 'undefined') ? agentflowWorkflowList : [];
        const matched = list.find(item => item.id === id);
        nameInput.value = matched ? matched.name : '';
    };

    window.openAddWfModal = function(docTypeKey) {
        wfEditingDocType = docTypeKey;
        wfEditingId = null;
        wfSelectedCaseWords = new Set();
        wfSelectedCauses = new Set();
        wfEditingType = 'step';  // v1.32: 默认分步生成型
        wfEditingBuiltin = false;
        document.getElementById('wfModalTitle').textContent = '新增 workflow';
        document.getElementById('wfName').value = '';
        // v1.32: 渲染 workflow id 下拉框（新增模式）
        renderWfIdSelect(docTypeKey, '', false);
        // v1.32: 重置类型 radio
        const stepRadio = document.getElementById('wfTypeStep');
        const materialRadio = document.getElementById('wfTypeMaterial');
        if (stepRadio) stepRadio.checked = true;
        if (materialRadio) materialRadio.checked = false;
        renderCaseWordsPicker(docTypeKey, wfSelectedCaseWords);
        renderCausesPicker(docTypeKey, wfSelectedCauses);
        document.getElementById('wfModal').classList.add('show');
        setTimeout(() => document.getElementById('wfId').focus(), 50);
    };

    window.editWorkflow = function(docTypeKey, wfId) {
        const workflows = getWorkflowsForDocType(currentOrg, docTypeKey);
        const wf = workflows.find(w => w.id === wfId);
        if (!wf) return;
        wfEditingDocType = docTypeKey;
        wfEditingId = wfId;
        wfEditingType = wf.type || 'step';
        wfSelectedCaseWords = new Set(wf.caseWords || []);
        wfSelectedCauses = new Set(wf.causes || []);  // v1.32: 回填匹配案由
        const isBuiltin = !!wf.isBuiltin;
        wfEditingBuiltin = isBuiltin;
        document.getElementById('wfModalTitle').textContent = isBuiltin ? '编辑内置 workflow（另存为自定义覆盖）' : '编辑 workflow';
        document.getElementById('wfName').value = wf.name || '';
        // v1.32: 渲染 workflow id 下拉框（编辑模式，内置只读）
        renderWfIdSelect(docTypeKey, wf.id || '', isBuiltin);
        // v1.32: 设置类型 radio
        const stepRadio = document.getElementById('wfTypeStep');
        const materialRadio = document.getElementById('wfTypeMaterial');
        if (stepRadio) stepRadio.checked = (wfEditingType === 'step');
        if (materialRadio) materialRadio.checked = (wfEditingType === 'material');
        renderCaseWordsPicker(docTypeKey, wfSelectedCaseWords);
        renderCausesPicker(docTypeKey, wfSelectedCauses);
        document.getElementById('wfModal').classList.add('show');
    };

    window.closeWfModal = function() {
        document.getElementById('wfModal').classList.remove('show');
        wfEditingDocType = null;
        wfEditingId = null;
        wfSelectedCaseWords = new Set();
        wfSelectedCauses = new Set();
        wfEditingType = 'step';
        wfEditingBuiltin = false;
        const wfIdSelect = document.getElementById('wfId');
        if (wfIdSelect) {
            wfIdSelect.innerHTML = '<option value="">请从 agentflow 平台已编排的 workflow 中选择</option>';
            wfIdSelect.disabled = false;
        }
    };

    // v1.32: 切换 workflow 类型 radio 时调用（仅记录状态，不再切换步骤编辑器显示）
    window.onWfTypeChange = function(type) {
        wfEditingType = type;
        // 切换类型后，案字/案由选择器需重新渲染（占用关系按类型过滤）
        renderCaseWordsPicker(wfEditingDocType, wfSelectedCaseWords);
        renderCausesPicker(wfEditingDocType, wfSelectedCauses);
    };

    function renderCaseWordsPicker(docTypeKey, selected) {
        const picker = document.getElementById('wfCaseWordsPicker');
        const wordList = (typeof caseWordListByOrg !== 'undefined' && caseWordListByOrg[currentOrg]) || [];
        if (wordList.length === 0) {
            picker.innerHTML = '<span style="font-size:12px;color:var(--text-muted);">当前业务系统未配置案字列表</span>';
            return;
        }
        // v1.32: 仅显示同类型 workflow 已占用的案字（不同类型间案字可重复）
        const usedWords = new Set();
        const existingWfs = getWorkflowsForDocType(currentOrg, docTypeKey);
        existingWfs.forEach(wf => {
            if (wf.id !== wfEditingId
                && (wf.type || 'step') === wfEditingType
                && Array.isArray(wf.caseWords)) {
                wf.caseWords.forEach(w => usedWords.add(w));
            }
        });
        picker.innerHTML = wordList.map(w => {
            const isSel = selected.has(w);
            const isUsed = usedWords.has(w);
            const cls = 'case-word-option' + (isSel ? ' selected' : '');
            const title = isUsed ? '已被同类型其他 workflow 匹配' : '';
            return '<label class="' + cls + '" title="' + title + '">'
                + '<input type="checkbox" value="' + escapeHtml(w) + '" ' + (isSel ? 'checked' : '') + ' onchange="toggleCaseWord(\'' + escapeHtml(w) + '\', this.checked)">'
                + '<span>' + escapeHtml(w) + (isUsed ? ' ⚠' : '') + '</span></label>';
        }).join('');
    }

    window.toggleCaseWord = function(word, checked) {
        if (checked) wfSelectedCaseWords.add(word);
        else wfSelectedCaseWords.delete(word);
    };

    // v1.32: 渲染匹配案由选择器（3 级案由树）
    function renderCausesPicker(docTypeKey, selected) {
        const picker = document.getElementById('wfCausesPicker');
        const tree = (typeof causeTreeDataByOrg !== 'undefined' && causeTreeDataByOrg[currentOrg]) || [];
        if (tree.length === 0) {
            picker.innerHTML = '<span style="font-size:12px;color:var(--text-muted);">当前业务系统未配置案由树</span>';
            return;
        }
        // 同类型 workflow 已占用的案由
        const usedCauses = new Set();
        const existingWfs = getWorkflowsForDocType(currentOrg, docTypeKey);
        existingWfs.forEach(wf => {
            if (wf.id !== wfEditingId
                && (wf.type || 'step') === wfEditingType
                && Array.isArray(wf.causes)) {
                wf.causes.forEach(c => usedCauses.add(c));
            }
        });
        picker.innerHTML = tree.map((root, rootIdx) => renderCauseTreeNode(root, 'root-' + rootIdx, selected, usedCauses)).join('');
    }

    // v1.32: 递归渲染案由树节点
    function renderCauseTreeNode(node, key, selected, usedCauses) {
        // node 可能是字符串（叶子）或对象 {name, children}
        if (typeof node === 'string') {
            const name = node;
            const isSel = selected.has(name);
            const isUsed = usedCauses.has(name);
            const cls = isSel ? ' selected' : '';
            const title = isUsed ? '已被同类型其他 workflow 匹配' : '';
            return '<div class="cause-tree-node">'
                + '<div class="cause-tree-node-row' + cls + '" title="' + title + '">'
                + '<span class="cause-tree-toggle"></span>'
                + '<input type="checkbox" class="cause-tree-checkbox" value="' + escapeHtml(name) + '" ' + (isSel ? 'checked' : '') + ' onchange="toggleCause(\'' + escapeHtml(name) + '\', this.checked)">'
                + '<span class="cause-tree-label">' + escapeHtml(name) + (isUsed ? ' ⚠' : '') + '</span>'
                + '</div></div>';
        }
        const name = node.name || '';
        const children = node.children || [];
        const hasChildren = children.length > 0;
        const toggleHtml = hasChildren ? '<span class="cause-tree-toggle" onclick="toggleCauseNode(\'' + key + '\')"><i class="fas fa-chevron-right"></i></span>' : '<span class="cause-tree-toggle"></span>';
        let html = '<div class="cause-tree-node">'
            + '<div class="cause-tree-node-row">'
            + toggleHtml
            + '<span class="cause-tree-label" style="font-weight:500;">' + escapeHtml(name) + '</span>'
            + '</div>';
        if (hasChildren) {
            html += '<div class="cause-tree-children" id="cause-children-' + key + '">';
            html += children.map((child, idx) => renderCauseTreeNode(child, key + '-' + idx, selected, usedCauses)).join('');
            html += '</div>';
        }
        html += '</div>';
        return html;
    }

    window.toggleCause = function(name, checked) {
        if (checked) wfSelectedCauses.add(name);
        else wfSelectedCauses.delete(name);
    };

    // v1.32: 展开/折叠案由树节点
    window.toggleCauseNode = function(key) {
        const el = document.getElementById('cause-children-' + key);
        if (!el) return;
        el.classList.toggle('expanded');
        const toggle = el.previousElementSibling.querySelector('.cause-tree-toggle i');
        if (toggle) {
            if (el.classList.contains('expanded')) {
                toggle.style.transform = 'rotate(90deg)';
            } else {
                toggle.style.transform = '';
            }
        }
    };

    window.saveWorkflow = function() {
        // v1.32: workflow id 从下拉框取，名称随 id 自动带出
        const wfIdSelect = document.getElementById('wfId');
        const finalWfId = wfIdSelect ? wfIdSelect.value.trim() : '';
        if (!finalWfId) {
            showNotification('请从 agentflow 平台 workflow 列表中选择 workflow id', 'error');
            if (wfIdSelect) wfIdSelect.focus();
            return;
        }
        const name = document.getElementById('wfName').value.trim();
        if (!name) {
            showNotification('workflow 名称缺失，请重新选择 workflow id', 'error');
            if (wfIdSelect) wfIdSelect.focus();
            return;
        }

        // v1.32: workflow id 同 docType 内唯一校验（排除自身）——下拉框已过滤，但保留兜底校验
        const existingWfsForIdCheck = getWorkflowsForDocType(currentOrg, wfEditingDocType);
        const idConflict = existingWfsForIdCheck.find(wf => wf.id === finalWfId && wf.id !== wfEditingId);
        if (idConflict) {
            showNotification('workflow id「' + finalWfId + '」已被「' + idConflict.name + '」占用，请更换', 'error');
            if (wfIdSelect) wfIdSelect.focus();
            return;
        }

        // v1.32: 案字冲突校验——仅与同类型 workflow 校验
        const existingWfs = getWorkflowsForDocType(currentOrg, wfEditingDocType);
        const newCaseWords = Array.from(wfSelectedCaseWords);
        const newCauses = Array.from(wfSelectedCauses);  // v1.32: 匹配案由
        for (const wf of existingWfs) {
            if (wf.id === wfEditingId) continue;
            if ((wf.type || 'step') !== wfEditingType) continue;  // 跨类型不冲突
            const conflictWord = (wf.caseWords || []).find(w => newCaseWords.indexOf(w) >= 0);
            if (conflictWord) {
                showNotification('案字「' + conflictWord + '」已被同类型 workflow「' + wf.name + '」匹配', 'error');
                return;
            }
            // v1.32: 案由冲突校验
            const conflictCause = (wf.causes || []).find(c => newCauses.indexOf(c) >= 0);
            if (conflictCause) {
                showNotification('案由「' + conflictCause + '」已被同类型 workflow「' + wf.name + '」匹配', 'error');
                return;
            }
        }

        // v1.32: 兜底 workflow 唯一性校验——同类型内 caseWords 与 causes 均为空最多 1 个
        if (newCaseWords.length === 0 && newCauses.length === 0) {
            const existingFallback = existingWfs.find(wf =>
                wf.id !== wfEditingId
                && (wf.type || 'step') === wfEditingType
                && (!Array.isArray(wf.caseWords) || wf.caseWords.length === 0)
                && (!Array.isArray(wf.causes) || wf.causes.length === 0)
            );
            if (existingFallback) {
                const typeLabel = wfEditingType === 'material' ? '一步生成型' : '分步生成型';
                showNotification('每个类型最多 1 个' + typeLabel + '全兜底 workflow，已有「' + existingFallback.name + '」', 'error');
                return;
            }
        }

        // 写入 localStorage.adminWorkflows
        const orgData = getWfOrgData(currentOrg);
        if (!orgData[wfEditingDocType] || !Array.isArray(orgData[wfEditingDocType])) {
            // 首次自定义：把当前内置 workflow 全部迁入自定义数组，再操作
            orgData[wfEditingDocType] = JSON.parse(JSON.stringify(existingWfs));
        }
        const arr = orgData[wfEditingDocType];

        // v1.32: 新 workflow 对象（不再写 steps 字段）
        const newWf = {
            id: finalWfId,
            name: name,
            type: wfEditingType,
            caseWords: newCaseWords,
            causes: newCauses,             // v1.32: 匹配案由
            isBuiltin: false
        };
        if (wfEditingId) {
            // 编辑：先按原 id 在数组中查找（可能是内置迁入的自定义记录，也可能是纯自定义）
            const idx = arr.findIndex(w => w.id === wfEditingId);
            if (idx >= 0) {
                arr[idx] = newWf;
            } else {
                // 编辑内置 workflow：作为自定义覆盖追加
                arr.push(newWf);
            }
        } else {
            // 新增
            arr.push(newWf);
        }
        setWfOrgData(currentOrg, orgData);

        closeWfModal();
        renderTable();
        showNotification(wfEditingId ? 'workflow 已更新' : 'workflow 已新增', 'success');
    };

    window.deleteWorkflow = function(docTypeKey, wfId) {
        const workflows = getWorkflowsForDocType(currentOrg, docTypeKey);
        const wf = workflows.find(w => w.id === wfId);
        if (!wf) return;
        const wfType = wf.type || 'step';
        // v1.32: 同类型至少保留 1 个
        const sameTypeWfs = workflows.filter(w => (w.type || 'step') === wfType);
        if (sameTypeWfs.length <= 1) {
            const typeLabel = wfType === 'material' ? '一步生成型' : '分步生成型';
            showNotification('每个类型至少需保留 1 个' + typeLabel + ' workflow', 'warning');
            return;
        }
        const isBuiltinWf = !!wf.isBuiltin;
        const isCustomized = getWfOrgData(currentOrg)[docTypeKey] && getWfOrgData(currentOrg)[docTypeKey].length > 0;
        const confirmText = (isBuiltinWf && isCustomized)
            ? '确定移除 workflow「' + wf.name + '」的自定义覆盖吗？移除后将恢复内置默认。'
            : '确定删除 workflow「' + wf.name + '」吗？此操作不可恢复。';
        showConfirm('删除 workflow', confirmText, () => {
            const orgData = getWfOrgData(currentOrg);
            if (orgData[docTypeKey] && Array.isArray(orgData[docTypeKey])) {
                orgData[docTypeKey] = orgData[docTypeKey].filter(w => w.id !== wfId);
                // 若自定义数组被清空，删除整个 key 以恢复内置
                if (orgData[docTypeKey].length === 0) {
                    delete orgData[docTypeKey];
                }
                setWfOrgData(currentOrg, orgData);
            }
            renderTable();
            showNotification(isBuiltinWf ? '已恢复内置默认' : 'workflow 已删除', 'success');
        });
    };

    // ===== 新增/编辑弹窗 =====
    window.openAddModal = function() {
        editingKey = null;
        editingIsBuiltin = false;
        document.getElementById('modalTitle').textContent = '新增类型';
        document.getElementById('tplName').value = '';
        document.getElementById('nameHint').textContent = '用于模板和提示词的分类，不可与现有类型重名';
        document.getElementById('nameHint').style.color = '';
        document.getElementById('tplModal').classList.add('show');
        setTimeout(() => document.getElementById('tplName').focus(), 50);
    };

    window.editType = function(key) {
        const docTypes = getDocTypes(currentOrg);
        const t = docTypes[key];
        if (!t) return;
        editingKey = key;
        editingIsBuiltin = !!t.isBuiltin;
        document.getElementById('modalTitle').textContent = editingIsBuiltin ? '编辑内置类型（另存为自定义覆盖）' : '编辑类型';
        document.getElementById('tplName').value = t.name;
        document.getElementById('nameHint').textContent = editingIsBuiltin
            ? '修改后将覆盖内置配置；删除自定义覆盖可恢复内置默认'
            : '用于模板和提示词的分类，不可与现有类型重名';
        document.getElementById('nameHint').style.color = '';
        document.getElementById('tplModal').classList.add('show');
    };

    window.closeModal = function() {
        document.getElementById('tplModal').classList.remove('show');
        editingKey = null;
        editingIsBuiltin = false;
    };

    window.saveType = function() {
        const name = document.getElementById('tplName').value.trim();
        if (!name) {
            showNotification('请填写类型名称', 'error');
            document.getElementById('tplName').focus();
            return;
        }

        const docTypes = getDocTypes(currentOrg);
        const orgData = getOrgData(currentOrg);

        // 名称唯一性校验（与其他类型重名，但编辑自己除外）
        const nameExists = Object.entries(docTypes).some(([k, t]) => t.name === name && k !== editingKey);
        if (nameExists) {
            showNotification('已存在同名类型：「' + name + '」', 'error');
            return;
        }

        // 决定 key
        let key;
        if (editingKey) {
            // 编辑内置或自定义：保留原 key，写入自定义覆盖
            key = editingKey;
        } else {
            // 新增：生成唯一 key
            key = genTypeKey(name);
            while (orgData[key]) key = genTypeKey(name) + Math.floor(Math.random() * 100);
        }

        // v1.34: 编辑时保留原 enabled 状态；新增默认启用
        const existing = orgData[key];
        const enabled = existing ? (existing.enabled !== false) : true;
        orgData[key] = {
            name: name,
            isBuiltin: false,
            enabled: enabled
        };
        setOrgData(currentOrg, orgData);

        closeModal();
        renderTable();
        showNotification(editingKey ? '类型已更新' : '类型已新增', 'success');
    };

    // v1.34: 启用/停用类型
    // - 自定义类型：直接修改 enabled 字段
    // - 内置类型首次停用：自动生成自定义覆盖对象 { name: 原名, isBuiltin: false, enabled: false }
    // - 重新启用：将 enabled 改回 true，保留自定义覆盖（不自动恢复内置，避免丢失其他编辑）
    window.toggleTypeEnabled = function(key) {
        const docTypes = getDocTypes(currentOrg);
        const t = docTypes[key];
        if (!t) return;
        const orgData = getOrgData(currentOrg);
        const isEnabled = getTypeEnabled(key);
        const isBuiltinKey = Object.prototype.hasOwnProperty.call(defaultDocTypesByOrg[currentOrg] || {}, key);
        const hasOverride = orgDataHasKey(currentOrg, key);

        if (isEnabled) {
            // 停用
            if (isBuiltinKey && !hasOverride) {
                // 内置类型首次停用：生成自定义覆盖对象
                orgData[key] = {
                    name: t.name,
                    isBuiltin: false,
                    enabled: false
                };
            } else {
                // 自定义类型或已有覆盖：直接修改 enabled
                orgData[key] = Object.assign({}, orgData[key], { enabled: false });
            }
            setOrgData(currentOrg, orgData);
            renderTable();
            showNotification('类型「' + t.name + '」已停用', 'success');
        } else {
            // 启用：保留自定义覆盖，仅将 enabled 改回 true
            if (orgData[key]) {
                orgData[key].enabled = true;
                setOrgData(currentOrg, orgData);
            }
            renderTable();
            showNotification('类型「' + t.name + '」已启用', 'success');
        }
    };

    // ===== 删除 =====
    window.deleteType = function(key) {
        const docTypes = getDocTypes(currentOrg);
        const t = docTypes[key];
        if (!t) return;

        // 删除前校验：是否被模板/提示词引用
        const tplCount = countTemplates(currentOrg, key);
        const promptCount = countPrompts(currentOrg, key);

        if (tplCount > 0 || promptCount > 0) {
            const reasons = [];
            if (tplCount > 0) reasons.push(tplCount + ' 个模板');
            if (promptCount > 0) reasons.push(promptCount + ' 条提示词');
            showNotification('该类型下仍存在 ' + reasons.join('、') + '，请先迁移或删除后再删除类型', 'warning');
            return;
        }

        // 判断是否为"内置类型被自定义覆盖"：key 存在于内置常量且 orgData 中有覆盖
        const isBuiltinKey = Object.prototype.hasOwnProperty.call(defaultDocTypesByOrg[currentOrg] || {}, key);
        const isCustomOverride = isBuiltinKey && orgDataHasKey(currentOrg, key);
        const confirmText = isCustomOverride
            ? '确定移除类型「' + t.name + '」的自定义覆盖吗？移除后将恢复内置默认配置。'
            : '确定删除类型「' + t.name + '」吗？此操作不可恢复。';

        showConfirm('删除类型', confirmText, () => {
            const orgData = getOrgData(currentOrg);
            delete orgData[key];
            setOrgData(currentOrg, orgData);
            // v1.22: 同步清理该类型下的 workflow 配置
            const wfOrgData = getWfOrgData(currentOrg);
            if (wfOrgData[key]) {
                delete wfOrgData[key];
                setWfOrgData(currentOrg, wfOrgData);
            }
            expandedKeys.delete(key);
            renderTable();
            showNotification(isCustomOverride ? '已恢复内置默认' : '类型已删除', 'success');
        });
    };

    // 判断 orgData 中是否存在某 key（用于区分"内置被覆盖"和"纯自定义"）
    function orgDataHasKey(org, key) {
        return Object.prototype.hasOwnProperty.call(getOrgData(org), key);
    }

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
            if (document.getElementById('wfModal').classList.contains('show')) closeWfModal();
        }
    });

    // 点击遮罩关闭
    document.getElementById('tplModal').addEventListener('click', function(e) {
        if (e.target === this) closeModal();
    });
    document.getElementById('confirmModal').addEventListener('click', function(e) {
        if (e.target === this) closeConfirm();
    });
    document.getElementById('wfModal').addEventListener('click', function(e) {
        if (e.target === this) closeWfModal();
    });

    // ===== 初始化 =====
    function init() {
        renderTable();
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // 暴露调试 API
    window.AdminDocTypes = { getDocTypes, getOrgData, setOrgData };
})();

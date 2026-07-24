// ============ Admin Doc Types Management ============
// v1.0 文书类型管理：维护各业务系统文书类型（模板/提示词的父级分类）
// 数据持久化：localStorage.adminDocTypes（按业务系统分组）
// 用户侧联动：case-data.js mergeAdminDocTypes 在加载时合并到 system.docTypes

(function() {
    'use strict';

    // ===== 预设图标库 =====
    const PRESET_ICONS = [
        { key: 'fa-gavel', name: '法槌' },
        { key: 'fa-list-alt', name: '清单' },
        { key: 'fa-hammer', name: '锤子' },
        { key: 'fa-folder-open', name: '文件夹' },
        { key: 'fa-file-alt', name: '文件' },
        { key: 'fa-ban', name: '禁止' },
        { key: 'fa-landmark', name: '法院' },
        { key: 'fa-balance-scale', name: '天平' },
        { key: 'fa-envelope', name: '信封' },
        { key: 'fa-envelope-open-text', name: '信函' },
        { key: 'fa-file-signature', name: '签署' },
        { key: 'fa-stamp', name: '印章' },
        { key: 'fa-book', name: '书籍' },
        { key: 'fa-scroll', name: '卷轴' },
        { key: 'fa-clipboard', name: '剪贴板' },
        { key: 'fa-folder-tree', name: '目录' },
        { key: 'fa-file-contract', name: '合同' },
        { key: 'fa-certificate', name: '证明' }
    ];

    // ===== 状态 =====
    let currentOrg = 'court';
    let editingKey = null;        // 当前编辑的 key（null=新增模式）
    let editingIsBuiltin = false; // 编辑的是内置类型（编辑后转为自定义覆盖）
    let selectedIcon = '';        // 当前选中的图标
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
            const iconClass = t.icon || 'fa-folder';
            const badge = t.isBuiltin
                ? '<span class="tpl-badge builtin">内置</span>'
                : '<span class="tpl-badge custom">自定义</span>';
            const tplCountClass = tplCount > 0 ? 'count-cell has' : 'count-cell zero';
            const promptCountClass = promptCount > 0 ? 'count-cell has' : 'count-cell zero';
            const wfCountClass = wfCount > 0 ? 'wf-count-cell' : 'wf-count-cell zero';
            const actions = '<button class="action-btn edit" onclick="editType(\'' + key + '\')">编辑</button>'
                + '<button class="action-btn delete" onclick="deleteType(\'' + key + '\')">删除</button>';
            const isExpanded = expandedKeys.has(key);
            const expandBtn = '<button class="expand-btn' + (isExpanded ? ' expanded' : '') + '" onclick="toggleWfExpand(\'' + key + '\')"><i class="fas fa-chevron-right"></i></button>';

            let html = '<tr>'
                + '<td>' + expandBtn + '</td>'
                + '<td class="tpl-name-cell"><i class="fas ' + escapeHtml(iconClass) + '"></i>' + escapeHtml(t.name) + badge + '</td>'
                + '<td><i class="fas ' + escapeHtml(iconClass) + '" style="font-size:16px;color:var(--text-secondary);"></i></td>'
                + '<td class="' + tplCountClass + '">' + tplCount + '</td>'
                + '<td class="' + promptCountClass + '">' + promptCount + '</td>'
                + '<td class="' + wfCountClass + '">' + wfCount + '</td>'
                + '<td>' + badge + '</td>'
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

        let rowsHtml = '';
        if (workflows.length === 0) {
            rowsHtml = '<tr><td colspan="5" class="step-empty">暂无 workflow，点击「新增 workflow」创建</td></tr>';
        } else {
            rowsHtml = workflows.map(wf => {
                const wfBadge = wf.isBuiltin
                    ? '<span class="wf-badge builtin">内置</span>'
                    : '<span class="wf-badge custom">自定义</span>';
                const caseWordsHtml = (!wf.caseWords || wf.caseWords.length === 0)
                    ? '<span class="case-word-fallback">兜底</span>'
                    : wf.caseWords.map(w => '<span class="case-word-tag">' + escapeHtml(w) + '</span>').join('');
                const stepCount = (wf.steps && wf.steps.length) || 0;
                const isOnlyOne = workflows.length === 1;
                const deleteBtn = isOnlyOne
                    ? '<button class="action-btn delete" disabled title="每个文书类型至少需保留 1 个 workflow">删除</button>'
                    : '<button class="action-btn delete" onclick="deleteWorkflow(\'' + docTypeKey + '\',\'' + wf.id + '\')">删除</button>';
                const editBtn = '<button class="action-btn edit" onclick="editWorkflow(\'' + docTypeKey + '\',\'' + wf.id + '\')">编辑</button>';
                return '<tr>'
                    + '<td class="wf-name-cell">' + escapeHtml(wf.name) + wfBadge + '</td>'
                    + '<td>' + caseWordsHtml + '</td>'
                    + '<td>' + stepCount + '</td>'
                    + '<td>' + wfBadge + '</td>'
                    + '<td class="tpl-action-cell">' + editBtn + deleteBtn + '</td>'
                    + '</tr>';
            }).join('');
        }

        const title = escapeHtml(typeCfg.name) + ' 的 workflow';
        const hint = isCustomized ? '(已自定义，删除全部 workflow 恢复内置)' : '(使用内置默认)';
        return '<tr class="wf-sub-row"><td colspan="8"><div class="wf-sub-wrap">'
            + '<div class="wf-sub-header">'
            + '  <div class="wf-sub-title">' + title + '<span class="hint">' + hint + '</span></div>'
            + '  <button class="btn btn-primary" onclick="openAddWfModal(\'' + docTypeKey + '\')"><i class="fas fa-plus"></i> 新增 workflow</button>'
            + '</div>'
            + '<table class="wf-sub-table"><thead><tr>'
            + '<th>workflow 名称</th><th>匹配案字</th><th style="width:70px;">步骤数</th><th style="width:90px;">来源</th><th style="width:140px;">操作</th>'
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
        return 'wf-' + docTypeKey + '-' + Date.now().toString(36);
    }

    // ===== workflow 新增/编辑弹窗 =====
    let wfEditingDocType = null;    // 当前编辑 workflow 所属的 docTypeKey
    let wfEditingId = null;         // 当前编辑的 workflow id（null=新增）
    let wfEditingSteps = [];        // 步骤编辑器当前步骤列表
    let wfSelectedCaseWords = new Set();

    window.openAddWfModal = function(docTypeKey) {
        wfEditingDocType = docTypeKey;
        wfEditingId = null;
        wfEditingSteps = [{ id: '', title: '', icon: 'fa-folder-open' }];
        wfSelectedCaseWords = new Set();
        document.getElementById('wfModalTitle').textContent = '新增 workflow';
        document.getElementById('wfName').value = '';
        renderCaseWordsPicker(docTypeKey, wfSelectedCaseWords);
        renderStepsEditor(wfEditingSteps);
        document.getElementById('wfModal').classList.add('show');
        setTimeout(() => document.getElementById('wfName').focus(), 50);
    };

    window.editWorkflow = function(docTypeKey, wfId) {
        const workflows = getWorkflowsForDocType(currentOrg, docTypeKey);
        const wf = workflows.find(w => w.id === wfId);
        if (!wf) return;
        wfEditingDocType = docTypeKey;
        wfEditingId = wfId;
        wfEditingSteps = JSON.parse(JSON.stringify(wf.steps || []));
        if (wfEditingSteps.length === 0) wfEditingSteps = [{ id: '', title: '', icon: 'fa-folder-open' }];
        wfSelectedCaseWords = new Set(wf.caseWords || []);
        const isBuiltin = !!wf.isBuiltin;
        document.getElementById('wfModalTitle').textContent = isBuiltin ? '编辑内置 workflow（另存为自定义覆盖）' : '编辑 workflow';
        document.getElementById('wfName').value = wf.name || '';
        renderCaseWordsPicker(docTypeKey, wfSelectedCaseWords);
        renderStepsEditor(wfEditingSteps);
        document.getElementById('wfModal').classList.add('show');
    };

    window.closeWfModal = function() {
        document.getElementById('wfModal').classList.remove('show');
        wfEditingDocType = null;
        wfEditingId = null;
        wfEditingSteps = [];
        wfSelectedCaseWords = new Set();
    };

    function renderCaseWordsPicker(docTypeKey, selected) {
        const picker = document.getElementById('wfCaseWordsPicker');
        const wordList = (typeof caseWordListByOrg !== 'undefined' && caseWordListByOrg[currentOrg]) || [];
        if (wordList.length === 0) {
            picker.innerHTML = '<span style="font-size:12px;color:var(--text-muted);">当前业务系统未配置案字列表</span>';
            return;
        }
        // 获取已被其他 workflow 占用的案字（用于提示，不强制禁用）
        const orgData = getWfOrgData(currentOrg);
        const usedWords = new Set();
        const existingWfs = getWorkflowsForDocType(currentOrg, docTypeKey);
        existingWfs.forEach(wf => {
            if (wf.id !== wfEditingId && Array.isArray(wf.caseWords)) {
                wf.caseWords.forEach(w => usedWords.add(w));
            }
        });
        picker.innerHTML = wordList.map(w => {
            const isSel = selected.has(w);
            const isUsed = usedWords.has(w);
            const cls = 'case-word-option' + (isSel ? ' selected' : '');
            const title = isUsed ? '已被其他 workflow 匹配' : '';
            return '<label class="' + cls + '" title="' + title + '">'
                + '<input type="checkbox" value="' + escapeHtml(w) + '" ' + (isSel ? 'checked' : '') + ' onchange="toggleCaseWord(\'' + escapeHtml(w) + '\', this.checked)">'
                + '<span>' + escapeHtml(w) + (isUsed ? ' ⚠' : '') + '</span></label>';
        }).join('');
    }

    window.toggleCaseWord = function(word, checked) {
        if (checked) wfSelectedCaseWords.add(word);
        else wfSelectedCaseWords.delete(word);
    };

    function renderStepsEditor(steps) {
        const editor = document.getElementById('wfStepsEditor');
        if (!steps || steps.length === 0) {
            editor.innerHTML = '<div class="step-empty">点击下方「添加步骤」创建第一个步骤</div>';
            return;
        }
        editor.innerHTML = steps.map((s, idx) => {
            const isFirst = idx === 0;
            const isLast = idx === steps.length - 1;
            const onlyOne = steps.length === 1;
            const iconOptions = PRESET_ICONS.map(ic =>
                '<option value="' + ic.key + '"' + (s.icon === ic.key ? ' selected' : '') + '>' + ic.name + '</option>'
            ).join('');
            return '<div class="step-editor-row">'
                + '<input type="text" placeholder="步骤 id" value="' + escapeHtml(s.id || '') + '" oninput="updateStep(' + idx + ', \'id\', this.value)">'
                + '<input type="text" placeholder="步骤标题" value="' + escapeHtml(s.title || '') + '" oninput="updateStep(' + idx + ', \'title\', this.value)">'
                + '<select onchange="updateStep(' + idx + ', \'icon\', this.value)">' + iconOptions + '</select>'
                + '<div class="step-editor-actions">'
                + '<button class="step-action-btn" onclick="moveStep(' + idx + ', -1)" ' + (isFirst ? 'disabled' : '') + ' title="上移"><i class="fas fa-arrow-up"></i></button>'
                + '<button class="step-action-btn" onclick="moveStep(' + idx + ', 1)" ' + (isLast ? 'disabled' : '') + ' title="下移"><i class="fas fa-arrow-down"></i></button>'
                + '<button class="step-action-btn delete" onclick="removeStep(' + idx + ')" ' + (onlyOne ? 'disabled' : '') + ' title="删除"><i class="fas fa-trash"></i></button>'
                + '</div></div>';
        }).join('');
    }

    window.updateStep = function(idx, field, value) {
        if (wfEditingSteps[idx]) wfEditingSteps[idx][field] = value;
    };
    window.moveStep = function(idx, dir) {
        const newIdx = idx + dir;
        if (newIdx < 0 || newIdx >= wfEditingSteps.length) return;
        const tmp = wfEditingSteps[idx];
        wfEditingSteps[idx] = wfEditingSteps[newIdx];
        wfEditingSteps[newIdx] = tmp;
        renderStepsEditor(wfEditingSteps);
    };
    window.removeStep = function(idx) {
        if (wfEditingSteps.length <= 1) return;
        wfEditingSteps.splice(idx, 1);
        renderStepsEditor(wfEditingSteps);
    };
    window.addWorkflowStep = function() {
        wfEditingSteps.push({ id: '', title: '', icon: 'fa-folder-open' });
        renderStepsEditor(wfEditingSteps);
    };

    window.saveWorkflow = function() {
        const name = document.getElementById('wfName').value.trim();
        if (!name) {
            showNotification('请填写 workflow 名称', 'error');
            document.getElementById('wfName').focus();
            return;
        }
        // 校验步骤
        const cleanSteps = wfEditingSteps.map(s => ({
            id: (s.id || '').trim(),
            title: (s.title || '').trim(),
            icon: s.icon || 'fa-folder-open'
        }));
        const emptyStep = cleanSteps.find(s => !s.id || !s.title);
        if (emptyStep) {
            showNotification('每个步骤需填写 id 和标题', 'error');
            return;
        }
        const idSet = new Set();
        for (const s of cleanSteps) {
            if (idSet.has(s.id)) {
                showNotification('步骤 id 重复：「' + s.id + '」', 'error');
                return;
            }
            idSet.add(s.id);
        }

        // 案字冲突校验
        const existingWfs = getWorkflowsForDocType(currentOrg, wfEditingDocType);
        const newCaseWords = Array.from(wfSelectedCaseWords);
        for (const wf of existingWfs) {
            if (wf.id === wfEditingId) continue;
            const conflict = (wf.caseWords || []).find(w => newCaseWords.indexOf(w) >= 0);
            if (conflict) {
                showNotification('案字「' + conflict + '」已被 workflow「' + wf.name + '」匹配', 'error');
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
        const newWf = {
            name: name,
            caseWords: newCaseWords,
            steps: cleanSteps,
            isBuiltin: false
        };
        if (wfEditingId) {
            const idx = arr.findIndex(w => w.id === wfEditingId);
            if (idx >= 0) {
                newWf.id = wfEditingId;
                arr[idx] = newWf;
            } else {
                // 编辑内置 workflow：保留原 id，作为自定义覆盖写入
                newWf.id = wfEditingId;
                arr.push(newWf);
            }
        } else {
            newWf.id = genWfId(wfEditingDocType);
            arr.push(newWf);
        }
        setWfOrgData(currentOrg, orgData);

        closeWfModal();
        renderTable();
        showNotification(wfEditingId ? 'workflow 已更新' : 'workflow 已新增', 'success');
    };

    window.deleteWorkflow = function(docTypeKey, wfId) {
        const workflows = getWorkflowsForDocType(currentOrg, docTypeKey);
        if (workflows.length <= 1) {
            showNotification('每个文书类型至少需保留 1 个 workflow', 'warning');
            return;
        }
        const wf = workflows.find(w => w.id === wfId);
        if (!wf) return;
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
        selectedIcon = '';
        document.getElementById('modalTitle').textContent = '新增类型';
        document.getElementById('tplName').value = '';
        document.getElementById('nameHint').textContent = '用于模板和提示词的分类，不可与现有类型重名';
        document.getElementById('nameHint').style.color = '';
        renderIconPicker('');
        document.getElementById('tplModal').classList.add('show');
        setTimeout(() => document.getElementById('tplName').focus(), 50);
    };

    window.editType = function(key) {
        const docTypes = getDocTypes(currentOrg);
        const t = docTypes[key];
        if (!t) return;
        editingKey = key;
        editingIsBuiltin = !!t.isBuiltin;
        selectedIcon = t.icon || '';
        document.getElementById('modalTitle').textContent = editingIsBuiltin ? '编辑内置类型（另存为自定义覆盖）' : '编辑类型';
        document.getElementById('tplName').value = t.name;
        document.getElementById('nameHint').textContent = editingIsBuiltin
            ? '修改后将覆盖内置配置；删除自定义覆盖可恢复内置默认'
            : '用于模板和提示词的分类，不可与现有类型重名';
        document.getElementById('nameHint').style.color = '';
        renderIconPicker(selectedIcon);
        document.getElementById('tplModal').classList.add('show');
    };

    window.closeModal = function() {
        document.getElementById('tplModal').classList.remove('show');
        editingKey = null;
        editingIsBuiltin = false;
        selectedIcon = '';
    };

    function renderIconPicker(selected) {
        const picker = document.getElementById('iconPicker');
        picker.innerHTML = PRESET_ICONS.map(ic => {
            const sel = ic.key === selected ? ' selected' : '';
            return '<div class="icon-option' + sel + '" data-icon="' + ic.key + '" onclick="selectIcon(\'' + ic.key + '\')">'
                + '<i class="fas ' + ic.key + '"></i><span>' + escapeHtml(ic.name) + '</span></div>';
        }).join('');
    }

    window.selectIcon = function(iconKey) {
        selectedIcon = iconKey;
        document.querySelectorAll('.icon-option').forEach(el => {
            el.classList.toggle('selected', el.dataset.icon === iconKey);
        });
    };

    window.saveType = function() {
        const name = document.getElementById('tplName').value.trim();
        if (!name) {
            showNotification('请填写类型名称', 'error');
            document.getElementById('tplName').focus();
            return;
        }
        if (!selectedIcon) {
            showNotification('请选择图标', 'error');
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

        orgData[key] = {
            name: name,
            icon: selectedIcon,
            isBuiltin: false
        };
        setOrgData(currentOrg, orgData);

        closeModal();
        renderTable();
        showNotification(editingKey ? '类型已更新' : '类型已新增', 'success');
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

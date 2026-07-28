// ============ Admin Element Presets Management ============
// 要件管理：维护各业务系统的标准要件（按案由分组）
// v1.2: 启用/停用状态——表格新增「状态」列与「停用/启用」按钮；内置要件首次停用自动生成自定义覆盖数组
// 数据持久化：localStorage.adminElementPresets（按业务系统 × 案由分组）
// 覆盖语义：adminElementPresets[org][cause] 一旦存在，整体覆盖 elementPresetsByCause[cause] 的内置要件
// 用户侧联动：case-data.js getElementPresets(cause, org) 优先读此 key，为空回退到 const 内置

(function() {
    'use strict';

    // ===== 状态 =====
    let currentOrg = 'court';
    let currentCause = '';          // '' = 未选案由
    let editingIndex = -1;          // 当前编辑的要件下标，-1 = 新增
    let editingIsBuiltin = false;   // 编辑的是内置要件（保存后整体覆盖到自定义）
    let pendingConfirmAction = null;

    // ===== 工具函数 =====
    const STORAGE_KEY = 'adminElementPresets';
    const CW_STORAGE_KEY = 'adminCauseCaseWords';

    function getStorage() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
        } catch (e) {
            return {};
        }
    }
    function saveStorage(data) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
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

    // ===== 案字适配存储（按业务系统 × 案由分组） =====
    function getCwStorage() {
        try {
            return JSON.parse(localStorage.getItem(CW_STORAGE_KEY)) || {};
        } catch (e) { return {}; }
    }
    function getCwOrgData(org) {
        return getCwStorage()[org] || {};
    }
    function getCauseCaseWords(org, cause) {
        if (!cause) return [];
        return getCwOrgData(org)[cause] || [];
    }
    function setCauseCaseWords(org, cause, words) {
        const all = getCwStorage();
        if (!all[org]) all[org] = {};
        if (!words || words.length === 0) {
            delete all[org][cause];
        } else {
            all[org][cause] = words;
        }
        localStorage.setItem(CW_STORAGE_KEY, JSON.stringify(all));
    }

    // 获取当前业务系统的全部案字列表
    function getCaseWordList(org) {
        return (typeof caseWordListByOrg !== 'undefined' && caseWordListByOrg[org]) || [];
    }

    // 当前业务系统的案由树（直接返回 causeTreeDataByOrg[org]，保留 3 级结构）
    function getCauseTree(org) {
        return causeTreeDataByOrg[org] || [];
    }

    // 统计某节点下所有叶子案由的数量
    function countLeaves(node) {
        if (!node) return 0;
        if (!node.children) return 0;
        let cnt = 0;
        node.children.forEach(child => {
            if (typeof child === 'string') cnt += 1;
            else if (child && Array.isArray(child.children)) cnt += child.children.length;
        });
        return cnt;
    }

    // 转义字符串中的单引号（用于 onclick 内联）
    function escQuote(s) {
        if (!s) return '';
        return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    }

    // ===== 置顶案由存储（按业务系统分组） =====
    const PINNED_KEY = 'adminPinnedCauses';
    let searchKeyword = '';

    function getPinned(org) {
        try {
            const all = JSON.parse(localStorage.getItem(PINNED_KEY) || '{}');
            return all[org] || [];
        } catch (e) { return []; }
    }
    function setPinned(org, list) {
        let all = {};
        try { all = JSON.parse(localStorage.getItem(PINNED_KEY) || '{}'); } catch (e) {}
        all[org] = list;
        localStorage.setItem(PINNED_KEY, JSON.stringify(all));
    }
    function isPinned(org, name) {
        return getPinned(org).indexOf(name) >= 0;
    }

    // 判断叶子案由是否匹配搜索关键词
    function matchSearch(name) {
        if (!searchKeyword) return true;
        return name.toLowerCase().indexOf(searchKeyword.toLowerCase()) >= 0;
    }

    // 获取某案由下的"生效"要件列表（自定义覆盖优先，否则内置）
    // 返回数组，每项追加 isBuiltin 标记用于 UI 显示；保留 caseWords 字段
    function getEffectiveElements(org, cause) {
        const orgData = getOrgData(org);
        if (orgData[cause]) {
            // 已有自定义覆盖
            return (orgData[cause] || []).map(p => ({ ...p, isBuiltin: false }));
        }
        // 回退到内置（内置要件无 caseWords 字段，视为通用）
        if (cause && elementPresetsByCause[cause]) {
            return elementPresetsByCause[cause].map(p => ({ ...p, isBuiltin: true, caseWords: p.caseWords || [] }));
        }
        // 通用要件（仅当 cause 不在内置表中时）
        return [
            { name: '主体资格', desc: '相关主体的资格及身份认定', question: '各方主体名称、身份及主体资格情况？' },
            { name: '事实认定', desc: '案件事实的认定及证据', question: '需要认定的核心事实有哪些？' },
            { name: '法律适用', desc: '适用的法律法规', question: '本案应适用的法律、法规及具体条款？' },
            { name: '程序合法', desc: '相关程序是否符合法律规定', question: '已履行的程序有哪些？' },
            { name: '处理结果', desc: '处理决定的内容及依据', question: '拟作出的处理结果？' }
        ].map(p => ({ ...p, isBuiltin: true }));
    }

    // 当前案由是否已有自定义覆盖
    function hasOverride(org, cause) {
        const orgData = getOrgData(org);
        return !!orgData[cause];
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
        currentCause = '';
        searchKeyword = '';
        const searchInput = document.getElementById('causeSearchInput');
        if (searchInput) searchInput.value = '';
        const clearBtn = document.getElementById('causeSearchClear');
        if (clearBtn) clearBtn.style.display = 'none';
        document.querySelectorAll('.business-switch-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.type === type);
        });
        renderLeft();
        renderRight();
    };

    // ===== 渲染左侧案由树（3 级结构，与新增案件案由选择器一致） =====
    function renderLeft() {
        const tree = getCauseTree(currentOrg);
        const orgData = getOrgData(currentOrg);
        const totalLeaves = tree.reduce((sum, l1) => sum + countLeaves(l1), 0);
        const pinned = getPinned(currentOrg);

        const leftEl = document.getElementById('tplLeft');
        let html = '<div class="cause-tree-root">'
            + '<div class="cause-tree-all' + (currentCause === '' ? ' active' : '') + '" onclick="selectCause(\'\')">'
            + '<i class="fas fa-layer-group"></i><span>全部</span>'
            + '<span class="count">' + totalLeaves + '</span></div>';

        // 置顶分组（仅在非搜索状态下显示）
        if (!searchKeyword && pinned.length > 0) {
            html += '<div class="pinned-section">'
                + '<div class="pinned-header"><i class="fas fa-thumbtack"></i><span>置顶</span></div>';
            pinned.forEach(name => {
                html += renderCauseLeaf(name, orgData, true);
            });
            html += '</div>';
        }

        // 树形结构
        let hasMatch = false;
        tree.forEach((l1, i1) => {
            // 搜索时判断该 l1 下是否有匹配的叶子
            let l1HasMatch = false;
            if (searchKeyword) {
                (l1.children || []).forEach(l2 => {
                    if (typeof l2 === 'string') {
                        if (matchSearch(l2)) l1HasMatch = true;
                    } else {
                        (l2.children || []).forEach(leaf => {
                            if (matchSearch(leaf)) l1HasMatch = true;
                        });
                    }
                });
            } else {
                l1HasMatch = true;
            }
            if (!l1HasMatch) return;

            const l1ForceExpanded = searchKeyword ? ' expanded' : (l1.expanded ? ' expanded' : '');
            const l1Selected = currentCause === l1.name ? ' selected' : '';
            const l1Count = countLeaves(l1);
            html += '<div class="cause-level-1' + l1ForceExpanded + '">'
                + '<div class="cause-level-1-header' + l1Selected + '">'
                + '<i class="fas fa-chevron-right cause-expand-icon" onclick="event.stopPropagation(); toggleCauseLevel1(' + i1 + ')"></i>'
                + '<span class="cause-level-1-name" onclick="event.stopPropagation(); selectCause(\'' + escQuote(l1.name) + '\')">' + escapeHtml(l1.name) + '</span>'
                + '<span class="count">' + l1Count + '</span>'
                + '</div>'
                + '<div class="cause-level-2-container">';

            (l1.children || []).forEach((l2, i2) => {
                if (typeof l2 === 'string') {
                    // l2 本身就是叶子案由
                    if (matchSearch(l2)) {
                        html += renderCauseLeaf(l2, orgData, false);
                        hasMatch = true;
                    }
                } else {
                    // l2 是中类，下挂叶子
                    let l2HasMatch = false;
                    if (searchKeyword) {
                        (l2.children || []).forEach(leaf => {
                            if (matchSearch(leaf)) l2HasMatch = true;
                        });
                    } else {
                        l2HasMatch = true;
                    }
                    if (!l2HasMatch) return;

                    const l2ForceExpanded = searchKeyword ? ' expanded' : (l2.expanded ? ' expanded' : '');
                    const l2Selected = currentCause === l2.name ? ' selected' : '';
                    const l2Count = (l2.children || []).length;
                    html += '<div class="cause-level-2' + l2ForceExpanded + '">'
                        + '<div class="cause-level-2-header' + l2Selected + '">'
                        + '<i class="fas fa-chevron-right cause-expand-icon" onclick="event.stopPropagation(); toggleCauseLevel2(' + i1 + ',' + i2 + ')"></i>'
                        + '<span class="cause-level-2-name" onclick="event.stopPropagation(); selectCause(\'' + escQuote(l2.name) + '\')">' + escapeHtml(l2.name) + '</span>'
                        + '<span class="count">' + l2Count + '</span>'
                        + '</div>'
                        + '<div class="cause-level-3-container">';
                    (l2.children || []).forEach(leaf => {
                        if (matchSearch(leaf)) {
                            html += renderCauseLeaf(leaf, orgData, false);
                            hasMatch = true;
                        }
                    });
                    html += '</div></div>';
                }
            });

            html += '</div></div>';
        });

        // 搜索无匹配提示
        if (searchKeyword && !hasMatch) {
            html += '<div class="no-match-tip"><i class="fas fa-search" style="margin-right:6px;opacity:0.4;"></i>无匹配案由</div>';
        }

        html += '</div>';
        leftEl.innerHTML = html;
    }

    // 渲染叶子案由项
    // name: 案由名, orgData: 当前业务系统覆盖数据, inPinnedSection: 是否在置顶分组中渲染
    function renderCauseLeaf(name, orgData, inPinnedSection) {
        const elements = getEffectiveElements(currentOrg, name);
        const overridden = !!orgData[name];
        const dot = overridden ? '<span class="override-dot" title="已自定义覆盖"></span>' : '<span class="override-dot" style="visibility:hidden;"></span>';
        const pinned = isPinned(currentOrg, name);
        const pinIcon = pinned ? 'fa-thumbtack' : 'fa-thumbtack';
        const pinClass = pinned ? 'pin-btn pinned' : 'pin-btn';
        const pinTitle = pinned ? '取消置顶' : '置顶';
        return '<div class="cause-leaf' + (currentCause === name ? ' active' : '') + '" onclick="selectCause(\'' + escQuote(name) + '\')">'
            + dot
            + '<span class="cause-leaf-name">' + escapeHtml(name) + '</span>'
            + '<span class="count">' + elements.length + '</span>'
            + '<i class="fas ' + pinIcon + ' ' + pinClass + '" title="' + pinTitle + '" onclick="event.stopPropagation(); togglePinCause(\'' + escQuote(name) + '\')"></i>'
            + '</div>';
    }

    window.toggleCauseLevel1 = function(i1) {
        const tree = getCauseTree(currentOrg);
        if (tree[i1]) {
            tree[i1].expanded = !tree[i1].expanded;
            renderLeft();
        }
    };
    window.toggleCauseLevel2 = function(i1, i2) {
        const tree = getCauseTree(currentOrg);
        const l2 = tree[i1] && tree[i1].children && tree[i1].children[i2];
        if (l2 && typeof l2 !== 'string') {
            l2.expanded = !l2.expanded;
            renderLeft();
        }
    };

    window.selectCause = function(name) {
        currentCause = name || '';
        renderLeft();
        renderRight();
    };

    // ===== 置顶/取消置顶 =====
    window.togglePinCause = function(name) {
        const list = getPinned(currentOrg);
        const idx = list.indexOf(name);
        if (idx >= 0) {
            list.splice(idx, 1);
            showNotification('已取消置顶「' + name + '」', 'success');
        } else {
            list.push(name);
            showNotification('已置顶「' + name + '」', 'success');
        }
        setPinned(currentOrg, list);
        renderLeft();
    };

    // ===== 搜索过滤 =====
    window.filterCauseTree = function() {
        const input = document.getElementById('causeSearchInput');
        const clearBtn = document.getElementById('causeSearchClear');
        searchKeyword = (input.value || '').trim();
        clearBtn.style.display = searchKeyword ? 'block' : 'none';
        renderLeft();
    };
    window.clearCauseSearch = function() {
        const input = document.getElementById('causeSearchInput');
        input.value = '';
        searchKeyword = '';
        document.getElementById('causeSearchClear').style.display = 'none';
        renderLeft();
        input.focus();
    };

    // ===== 渲染右侧表格 =====
    function renderRight() {
        const rightTitle = document.getElementById('rightTitle');
        const rightSub = document.getElementById('rightSub');
        const addBtn = document.getElementById('addBtn');
        const resetBtn = document.getElementById('resetCauseBtn');
        const tbody = document.getElementById('tplTbody');
        const empty = document.getElementById('emptyState');
        const emptyText = document.getElementById('emptyText');
        const emptyHint = document.getElementById('emptyHint');
        const cwBar = document.getElementById('caseWordBar');

        if (!currentCause) {
            rightTitle.firstChild.nodeValue = '全部要件';
            rightSub.textContent = '';
            addBtn.disabled = true;
            resetBtn.style.display = 'none';
            cwBar.style.display = 'none';
            tbody.innerHTML = '';
            empty.style.display = 'block';
            emptyText.textContent = '请先在左侧选择一个案由';
            emptyHint.textContent = '选择案由后可新增/编辑/删除该案由下的标准要件';
            return;
        }

        const elements = getEffectiveElements(currentOrg, currentCause);
        const overridden = hasOverride(currentOrg, currentCause);

        rightTitle.firstChild.nodeValue = currentCause;
        rightSub.textContent = '共 ' + elements.length + ' 项' + (overridden ? ' · 已自定义覆盖' : ' · 内置');
        addBtn.disabled = false;
        resetBtn.style.display = overridden ? 'inline-flex' : 'none';

        // 渲染案字适配栏
        renderCaseWordBar();

        if (elements.length === 0) {
            tbody.innerHTML = '';
            empty.style.display = 'block';
            emptyText.textContent = '该案由暂无要件';
            emptyHint.textContent = '点击「新增要件」为该案由添加标准要件';
            return;
        }
        empty.style.display = 'none';

        tbody.innerHTML = elements.map((p, idx) => {
            const badge = p.isBuiltin
                ? '<span class="tpl-badge builtin">内置</span>'
                : '<span class="tpl-badge custom">自定义</span>';
            // 适用案字标签
            const cw = Array.isArray(p.caseWords) ? p.caseWords : [];
            const cwCell = cw.length
                ? cw.map(w => '<span class="cw-tag">' + escapeHtml(w) + '</span>').join('')
                : '<span class="cw-tag universal">通用</span>';
            // v1.2: 启用/停用状态徽章与按钮
            const isEnabled = p.enabled !== false;
            const statusBadge = isEnabled
                ? '<span class="status-badge enabled">已启用</span>'
                : '<span class="status-badge disabled">已停用</span>';
            const toggleBtn = isEnabled
                ? '<button class="action-btn disable" onclick="toggleElementEnabled(' + idx + ')">停用</button>'
                : '<button class="action-btn enable" onclick="toggleElementEnabled(' + idx + ')">启用</button>';
            // 内置要件：可编辑（另存为自定义），不可删除
            // 自定义要件：可编辑、可删除
            const actions = '<button class="action-btn edit" onclick="editElement(' + idx + ')">编辑</button>'
                + toggleBtn
                + (p.isBuiltin
                    ? '<button class="action-btn delete" disabled title="内置要件不可直接删除，如需删除请使用「恢复内置」后重新维护">删除</button>'
                    : '<button class="action-btn delete" onclick="deleteElement(' + idx + ')">删除</button>');
            return '<tr>'
                + '<td class="tpl-name-cell">' + escapeHtml(p.name || '') + '</td>'
                + '<td class="tpl-desc-cell">' + escapeHtml(p.desc || '') + '</td>'
                + '<td class="tpl-question-cell">' + escapeHtml(p.question || '') + '</td>'
                + '<td>' + cwCell + '</td>'
                + '<td>' + badge + '</td>'
                + '<td>' + statusBadge + '</td>'
                + '<td class="tpl-action-cell">' + actions + '</td>'
                + '</tr>';
        }).join('');
    }

    // ===== 渲染案字适配栏 =====
    function renderCaseWordBar() {
        const cwBar = document.getElementById('caseWordBar');
        const cwChips = document.getElementById('caseWordChips');
        const wordList = getCaseWordList(currentOrg);
        if (!wordList.length) {
            cwBar.style.display = 'none';
            return;
        }
        cwBar.style.display = 'flex';
        const selected = getCauseCaseWords(currentOrg, currentCause);
        cwChips.innerHTML = wordList.map(w => {
            const checked = selected.indexOf(w) >= 0 ? ' checked' : '';
            return '<span class="cw-chip' + checked + '" onclick="toggleCauseCaseWord(\'' + escQuote(w) + '\')">'
                + '<i class="fas fa-check cw-check"></i>'
                + escapeHtml(w)
                + '</span>';
        }).join('');
    }

    window.toggleCauseCaseWord = function(word) {
        const list = getCauseCaseWords(currentOrg, currentCause);
        const idx = list.indexOf(word);
        if (idx >= 0) {
            list.splice(idx, 1);
        } else {
            list.push(word);
        }
        setCauseCaseWords(currentOrg, currentCause, list);
        renderCaseWordBar();
    };

    // ===== 新增/编辑弹窗 =====
    window.openAddModal = function() {
        if (!currentCause) {
            showNotification('请先在左侧选择一个案由', 'warning');
            return;
        }
        editingIndex = -1;
        editingIsBuiltin = false;
        document.getElementById('modalTitle').firstChild.nodeValue = '新增要件';
        document.getElementById('modalCauseBadge').textContent = '· ' + currentCause;
        document.getElementById('tplName').value = '';
        document.getElementById('tplDesc').value = '';
        document.getElementById('tplQuestion').value = '';
        renderModalCaseWords([]);
        document.getElementById('tplModal').classList.add('show');
        setTimeout(() => document.getElementById('tplName').focus(), 50);
    };

    window.editElement = function(idx) {
        const elements = getEffectiveElements(currentOrg, currentCause);
        const p = elements[idx];
        if (!p) return;
        editingIndex = idx;
        editingIsBuiltin = !!p.isBuiltin;
        document.getElementById('modalTitle').firstChild.nodeValue = editingIsBuiltin ? '编辑内置要件（另存为自定义）' : '编辑要件';
        document.getElementById('modalCauseBadge').textContent = '· ' + currentCause;
        document.getElementById('tplName').value = p.name || '';
        document.getElementById('tplDesc').value = p.desc || '';
        document.getElementById('tplQuestion').value = p.question || '';
        renderModalCaseWords(Array.isArray(p.caseWords) ? p.caseWords : []);
        document.getElementById('tplModal').classList.add('show');
        setTimeout(() => document.getElementById('tplName').focus(), 50);
    };

    // 渲染弹窗中的适用案字多选
    // 优先用该案由已勾选的适配案字；若该案由未勾选任何案字，则用业务系统全部案字
    function renderModalCaseWords(selected) {
        const container = document.getElementById('modalCaseWords');
        const causeWords = getCauseCaseWords(currentOrg, currentCause);
        const wordList = causeWords.length ? causeWords : getCaseWordList(currentOrg);
        if (!wordList.length) {
            container.innerHTML = '<span style="font-size:12px;color:var(--text-muted);">当前业务系统无案字配置</span>';
            return;
        }
        container.innerHTML = wordList.map(w => {
            const checked = selected.indexOf(w) >= 0 ? ' checked' : '';
            return '<span class="cw-chip' + checked + '" data-cw="' + escapeHtml(w) + '" onclick="toggleModalCaseWord(this)">'
                + '<i class="fas fa-check cw-check"></i>'
                + escapeHtml(w)
                + '</span>';
        }).join('');
    }

    window.toggleModalCaseWord = function(el) {
        el.classList.toggle('checked');
    };

    // 收集弹窗中已勾选的案字
    function collectModalCaseWords() {
        const chips = document.querySelectorAll('#modalCaseWords .cw-chip.checked');
        return Array.from(chips).map(c => c.getAttribute('data-cw') || '');
    }

    window.closeModal = function() {
        document.getElementById('tplModal').classList.remove('show');
        editingIndex = -1;
        editingIsBuiltin = false;
    };

    window.saveElement = function() {
        if (!currentCause) {
            showNotification('请先选择案由', 'error');
            return;
        }
        const name = document.getElementById('tplName').value.trim();
        const desc = document.getElementById('tplDesc').value.trim();
        const question = document.getElementById('tplQuestion').value.trim();

        if (!name) {
            showNotification('请填写要件名', 'error');
            document.getElementById('tplName').focus();
            return;
        }
        if (!question) {
            showNotification('请填写问题', 'error');
            document.getElementById('tplQuestion').focus();
            return;
        }

        const orgData = getOrgData(currentOrg);
        // 取生效列表作为基线（若已有覆盖则在覆盖基础上修改；否则基于内置另存为完整覆盖）
        // v1.2: 保留原 enabled 状态
        const baseline = getEffectiveElements(currentOrg, currentCause).map(p => ({
            name: p.name, desc: p.desc, question: p.question,
            caseWords: Array.isArray(p.caseWords) ? p.caseWords : [],
            enabled: p.enabled !== false
        }));

        const modalCw = collectModalCaseWords();

        if (editingIndex >= 0) {
            // 编辑：替换指定下标，保留原 enabled 状态
            baseline[editingIndex] = {
                name: name, desc: desc, question: question,
                caseWords: modalCw,
                enabled: baseline[editingIndex].enabled
            };
        } else {
            // 新增：追加，默认启用
            baseline.push({ name: name, desc: desc, question: question, caseWords: modalCw, enabled: true });
        }

        orgData[currentCause] = baseline;
        setOrgData(currentOrg, orgData);

        closeModal();
        renderLeft();
        renderRight();
        showNotification(editingIndex >= 0 ? '要件已更新（已另存为自定义覆盖）' : '要件已新增', 'success');
    };

    // v1.2: 启用/停用要件
    // - 自定义要件：直接修改 enabled 字段
    // - 内置要件首次停用：自动生成自定义覆盖数组（保留所有内置要件，仅修改目标项 enabled 为 false）
    // - 重新启用：将 enabled 改回 true，保留自定义覆盖（不自动恢复内置，避免丢失其他编辑）
    window.toggleElementEnabled = function(idx) {
        if (!currentCause) {
            showNotification('请先选择案由', 'error');
            return;
        }
        const elements = getEffectiveElements(currentOrg, currentCause);
        const p = elements[idx];
        if (!p) return;
        const isEnabled = p.enabled !== false;
        const orgData = getOrgData(currentOrg);
        const hasOverride = !!orgData[currentCause];

        if (!hasOverride) {
            // 内置要件首次停用：生成自定义覆盖数组（保留所有内置要件，仅修改目标项的 enabled）
            const baseline = elements.map(e => ({
                name: e.name, desc: e.desc, question: e.question,
                caseWords: Array.isArray(e.caseWords) ? e.caseWords : [],
                enabled: true
            }));
            baseline[idx].enabled = false;
            orgData[currentCause] = baseline;
            setOrgData(currentOrg, orgData);
        } else {
            // 已有自定义覆盖：直接修改 enabled
            const list = orgData[currentCause];
            if (list[idx]) {
                list[idx].enabled = !isEnabled;
                setOrgData(currentOrg, orgData);
            }
        }

        renderLeft();
        renderRight();
        showNotification(isEnabled ? '要件「' + (p.name || '') + '」已停用' : '要件「' + (p.name || '') + '」已启用', 'success');
    };

    // ===== 删除 =====
    window.deleteElement = function(idx) {
        const elements = getEffectiveElements(currentOrg, currentCause);
        const p = elements[idx];
        if (!p) return;
        if (p.isBuiltin) {
            showNotification('内置要件不可删除', 'warning');
            return;
        }
        showConfirm('删除要件', '确定删除要件「' + (p.name || '') + '」吗？此操作不可恢复。', () => {
            const orgData = getOrgData(currentOrg);
            const list = (orgData[currentCause] || []).slice();
            list.splice(idx, 1);
            orgData[currentCause] = list;
            setOrgData(currentOrg, orgData);
            renderLeft();
            renderRight();
            showNotification('要件已删除', 'success');
        });
    };

    // ===== 恢复内置（删除该案由的自定义覆盖） =====
    window.resetCurrentCause = function() {
        if (!currentCause) return;
        if (!hasOverride(currentOrg, currentCause)) {
            showNotification('该案由未自定义覆盖，无需恢复', 'warning');
            return;
        }
        showConfirm('恢复内置要件', '确定清除案由「' + currentCause + '」的自定义覆盖吗？恢复后将还原为系统内置要件。', () => {
            const orgData = getOrgData(currentOrg);
            delete orgData[currentCause];
            setOrgData(currentOrg, orgData);
            // 同时清理该案由的案字适配配置
            setCauseCaseWords(currentOrg, currentCause, []);
            renderLeft();
            renderRight();
            showNotification('已恢复为内置要件', 'success');
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
    window.AdminElementPresets = { getEffectiveElements, getOrgData, setOrgData, hasOverride };
})();

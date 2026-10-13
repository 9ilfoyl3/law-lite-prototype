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
    let caseWordFilter = '';        // V1.3.32 B1：案字筛选值（'' = 全部）
    let promoteIndex = -1;          // V1.3.32 B4：正在被提升为本案由要件的「继承行」下标

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

    // ===== V1.3.32 B4：继承开关存储（按业务系统 × 案由） =====
    // 与 adminElementPresets 覆盖数组解耦：开关不写进要件数据本体，避免污染覆盖 diff。
    // 存量无该 key 一律视为「关闭」——保证已配了子案由覆盖的案由升级后不会突然多出一堆祖先要件。
    const INHERIT_KEY = 'adminElementInherit';
    function getInheritData() {
        try { return JSON.parse(localStorage.getItem(INHERIT_KEY)) || {}; } catch (e) { return {}; }
    }
    function getCauseInherit(org, cause) {
        if (!cause) return false;
        return !!(getInheritData()[org] || {})[cause];
    }
    function setCauseInherit(org, cause, on) {
        const all = getInheritData();
        if (!all[org]) all[org] = {};
        if (on) { all[org][cause] = true; } else { delete all[org][cause]; }
        localStorage.setItem(INHERIT_KEY, JSON.stringify(all));
    }

    // ===== V1.3.32 B2：自定义分组存储（按业务系统，跨案由共享） =====
    const GROUP_KEY = 'adminElementGroups';
    function getGroupStorage() {
        try { return JSON.parse(localStorage.getItem(GROUP_KEY)) || {}; } catch (e) { return {}; }
    }
    function getCustomGroups(org) {
        return getGroupStorage()[org] || [];
    }
    function addCustomGroup(org, name) {
        if (!name) return false;
        const all = getGroupStorage();
        if (!all[org]) all[org] = [];
        if (all[org].indexOf(name) >= 0) return false;
        all[org].push(name);
        localStorage.setItem(GROUP_KEY, JSON.stringify(all));
        return true;
    }

    // 该案由是否存在祖先（顶级案由无祖先，不展示继承开关）
    function hasAncestors(org, cause) {
        if (!cause) return false;
        return (typeof getAncestorCauses === 'function') && getAncestorCauses(org, cause).length > 0;
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
    // 返回数组：**前半为「自身/覆盖线」要件，后半为继承开关打开时合并进来的祖先要件**（isInherited=true）
    // 每项追加 isBuiltin / isInherited / group 标记供 UI 使用；保留 caseWords 字段
    function normalizeRow(p) {
        return {
            ...p,
            group: (typeof getElementGroup === 'function') ? getElementGroup(p) : DEFAULT_FALLBACK_GROUP,
            caseWords: Array.isArray(p.caseWords) ? p.caseWords : []
        };
    }
    // 取某个祖先案由自身的要件（覆盖优先，否则内置）——不做递归，链式合并在 getEffectiveElements 中完成
    function getAncestorEffective(org, anc) {
        const orgData = getOrgData(org);
        if (orgData[anc]) return (orgData[anc] || []).map(p => ({ ...p, isBuiltin: false }));
        if (elementPresetsByCause[anc]) return elementPresetsByCause[anc].map(p => ({ ...p, isBuiltin: true, caseWords: p.caseWords || [] }));
        return [];
    }
    function getEffectiveElements(org, cause) {
        const orgData = getOrgData(org);
        let own;
        if (orgData[cause]) {
            // 已有自定义覆盖
            own = (orgData[cause] || []).map(p => ({ ...p, isBuiltin: false }));
        } else if (cause && elementPresetsByCause[cause]) {
            // 回退到内置（内置要件无 caseWords 字段，视为通用）
            own = elementPresetsByCause[cause].map(p => ({ ...p, isBuiltin: true, caseWords: p.caseWords || [] }));
        } else {
            // 通用要件（仅当 cause 不在内置表中时）
            own = [
                { name: '主体资格', desc: '相关主体的资格及身份认定', question: '各方主体名称、身份及主体资格情况？' },
                { name: '事实认定', desc: '案件事实的认定及证据', question: '需要认定的核心事实有哪些？' },
                { name: '法律适用', desc: '适用的法律法规', question: '本案应适用的法律、法规及具体条款？' },
                { name: '程序合法', desc: '相关程序是否符合法律规定', question: '已履行的程序有哪些？' },
                { name: '处理结果', desc: '处理决定的内容及依据', question: '拟作出的处理结果？' }
            ].map(p => ({ ...p, isBuiltin: true }));
        }
        own = own.map(p => ({ ...normalizeRow(p), isInherited: false }));
        const ownNames = own.map(p => p.name);
        let inherited = [];
        if (getCauseInherit(org, cause)) {
            // 合并全部祖先链：祖先顺序为 顶级 → … → 直接父级，后写入者覆盖先写入者 = 近者优先
            const ancestors = (typeof getAncestorCauses === 'function') ? getAncestorCauses(org, cause) : [];
            const map = new Map();
            ancestors.forEach(anc => {
                getAncestorEffective(org, anc).forEach(e => {
                    if (map.has(e.name)) map.delete(e.name);
                    map.set(e.name, e);
                });
            });
            // 自身已存在同名要件时不再重复展示继承版本（同名以子案由自身的版本为准）
            inherited = Array.from(map.values())
                .filter(e => ownNames.indexOf(e.name) < 0)
                .map(e => ({ ...normalizeRow(e), isInherited: true, isBuiltin: false }));
        }
        return own.concat(inherited);
    }

    // 自身线要件（继承来的不落盘到本案由）——保存 baseline 一律基于此
    function getOwnElements(org, cause) {
        return getEffectiveElements(org, cause).filter(p => !p.isInherited);
    }
    // 将自身线数组持久化为该案由的自定义覆盖
    function persistOwn(org, cause, ownList) {
        const orgData = getOrgData(org);
        orgData[cause] = ownList.map(p => ({
            name: p.name, desc: p.desc, question: p.question,
            caseWords: Array.isArray(p.caseWords) ? p.caseWords : [],
            enabled: p.enabled !== false,
            group: (typeof getElementGroup === 'function') ? getElementGroup(p) : DEFAULT_FALLBACK_GROUP
        }));
        setOrgData(org, orgData);
    }
    const DEFAULT_FALLBACK_GROUP = '事实认定';

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
        caseWordFilter = '';
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
        caseWordFilter = '';   // V1.3.32 B1: 切换案由重置筛选，避免带着上一个案由的案字看空表
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
            renderCaseWordFilter();
            renderInheritBar();
            tbody.innerHTML = '';
            empty.style.display = 'block';
            emptyText.textContent = '请先在左侧选择一个案由';
            emptyHint.textContent = '选择案由后可新增/编辑/删除该案由下的标准要件';
            return;
        }

        const elements = getEffectiveElements(currentOrg, currentCause);
        const overridden = hasOverride(currentOrg, currentCause);

        rightTitle.firstChild.nodeValue = currentCause;
        addBtn.disabled = false;
        resetBtn.style.display = overridden ? 'inline-flex' : 'none';

        // 渲染案字适配栏 / 继承开关栏 / 案字筛选
        renderCaseWordBar();
        renderInheritBar();
        renderCaseWordFilter();

        // V1.3.32 B1: 案字筛选——先由继承合并出整表，再统一过滤（祖先的通用要件同样参与）
        const view = caseWordFilter
            ? elements.filter(p => {
                const cw = Array.isArray(p.caseWords) ? p.caseWords : [];
                return cw.length === 0 || cw.indexOf(caseWordFilter) >= 0;
            })
            : elements;

        rightSub.textContent = '共 ' + elements.length + ' 项' + (overridden ? ' · 已自定义覆盖' : ' · 内置')
            + (caseWordFilter ? ' · ' + caseWordFilter + ' 下 ' + view.length + ' 项' : '');

        if (view.length === 0) {
            tbody.innerHTML = '';
            empty.style.display = 'block';
            if (elements.length === 0) {
                emptyText.textContent = '该案由暂无要件';
                emptyHint.textContent = '点击「新增要件」为该案由添加标准要件';
            } else {
                emptyText.textContent = '案字「' + caseWordFilter + '」下暂无要件';
                emptyHint.textContent = '切换其它案字，或新增适用该案字的要件';
            }
            return;
        }
        empty.style.display = 'none';
        tbody.innerHTML = renderGroupedRows(elements, view);
    }

    const GROUP_OTHER = '未分组';

    // V1.3.32 B1: 案字筛选下拉——取值走案由大类白名单（与「适配案字」栏同源），
    // 避免民事案由下冒出「刑初」「执」等无关案字，两处口径打架
    function renderCaseWordFilter() {
        const sel = document.getElementById('caseWordFilter');
        if (!sel) return;
        if (!currentCause) { sel.style.display = 'none'; return; }
        const allowed = (typeof getAllowedCaseWordsForCause === 'function')
            ? getAllowedCaseWordsForCause(currentOrg, currentCause)
            : getCaseWordList(currentOrg);
        if (!allowed.length) { sel.style.display = 'none'; return; }
        sel.style.display = 'inline-block';
        sel.innerHTML = '<option value="">全部案字</option>'
            + allowed.map(w => '<option value="' + escapeHtml(w) + '"' + (w === caseWordFilter ? ' selected' : '') + '>' + escapeHtml(w) + '</option>').join('');
    }
    window.onCaseWordFilterChange = function(value) {
        caseWordFilter = value || '';
        renderRight();
    };

    // V1.3.32 B4: 继承开关栏——仅祖先存在的案由显示（顶级案由无祖先）
    function renderInheritBar() {
        const bar = document.getElementById('inheritBar');
        if (!bar) return;
        if (!currentCause || !hasAncestors(currentOrg, currentCause)) { bar.style.display = 'none'; return; }
        bar.style.display = 'flex';
        const checkbox = document.getElementById('inheritToggle');
        if (checkbox) checkbox.checked = getCauseInherit(currentOrg, currentCause);
        const hint = document.getElementById('inheritHint');
        if (hint) {
            const ancestors = (typeof getAncestorCauses === 'function') ? getAncestorCauses(currentOrg, currentCause) : [];
            hint.textContent = '开启后合并上级案由（' + ancestors.join(' / ') + '）的要件，与本案由要件一并展示和下发';
        }
    }
    window.toggleInherit = function() {
        const checkbox = document.getElementById('inheritToggle');
        const on = !!(checkbox && checkbox.checked);
        setCauseInherit(currentOrg, currentCause, on);
        renderLeft();
        renderRight();
        showNotification(on ? '已开启继承，合并展示上级案由要件' : '已关闭继承', 'success');
    };

    // V1.3.32 B2: 分组顺序——预设组固定序 → 自定义组（新建先后）→ 未分组置底
    function getGroupOrder(list) {
        const seen = [];
        list.forEach(p => {
            const g = getElementGroup(p) || GROUP_OTHER;
            if (seen.indexOf(g) < 0) seen.push(g);
        });
        const presets = (typeof ELEMENT_GROUP_PRESETS !== 'undefined')
            ? ELEMENT_GROUP_PRESETS : ['主体信息', '程序性信息', '事实认定'];
        const customs = getCustomGroups(currentOrg).filter(g => seen.indexOf(g) >= 0);
        const rest = seen.filter(g => presets.indexOf(g) < 0 && g !== GROUP_OTHER && customs.indexOf(g) < 0);
        const tail = seen.indexOf(GROUP_OTHER) >= 0 ? [GROUP_OTHER] : [];
        return presets.concat(customs, rest, tail);
    }
    function renderGroupedRows(all, view) {
        let html = '';
        getGroupOrder(all).forEach(g => {
            const items = all.map((p, idx) => ({ p: p, idx: idx })).filter(x => (getElementGroup(x.p) || GROUP_OTHER) === g);
            if (!items.length) return;
            const visible = items.filter(x => view.indexOf(x.p) >= 0);
            html += '<tr class="group-row"><td colspan="7">'
                + '<span class="group-name">' + escapeHtml(g) + '</span>'
                + '<span class="group-count">' + visible.length + '/' + items.length + '</span>'
                + '</td></tr>';
            visible.forEach(x => { html += renderRow(x.p, x.idx); });
        });
        return html;
    }
    function groupOptionsHtml(sel) {
        const presets = (typeof ELEMENT_GROUP_PRESETS !== 'undefined')
            ? ELEMENT_GROUP_PRESETS : ['主体信息', '程序性信息', '事实认定'];
        const list = presets.concat(getCustomGroups(currentOrg), [GROUP_OTHER]);
        return list.map(g => '<option value="' + escapeHtml(g) + '"' + (g === sel ? ' selected' : '') + '>' + escapeHtml(g) + '</option>').join('')
            + '<option value="__new__">＋ 新建分组…</option>';
    }
    function renderRow(p, idx) {
        // V1.3.15 A21: 「来源」列已删除（同案由下取值必然相同，顶部副标题已显示整体来源）
        const cw = Array.isArray(p.caseWords) ? p.caseWords : [];
        const cwCell = cw.length
            ? cw.map(w => '<span class="cw-tag">' + escapeHtml(w) + '</span>').join('')
            : '<span class="cw-tag universal">通用</span>';
        // v1.2: 启用/停用状态徽章（V1.3.24 A31：status-on/off 与示例/指令统一；灰/绿配色）
        const isEnabled = p.enabled !== false;
        const statusBadge = isEnabled
            ? '<span class="status-badge status-on">已启用</span>'
            : '<span class="status-badge status-off">已停用</span>';
        const nameCell = escapeHtml(p.name || '')
            + (p.isInherited ? ' <span class="inherit-tag" title="继承自上级案由，编辑/删除只影响本案由">继承</span>' : '');
        // B2: 每行分组下拉——存量要件全无 group，逐条进弹窗改属太低效，必须支持行内直改
        const groupCell = '<select class="group-select" onchange="changeElementGroup(' + idx + ', this.value)">'
            + groupOptionsHtml(getElementGroup(p)) + '</select>';
        let actions;
        if (p.isInherited) {
            // 继承行：编辑=提升为本案由要件；删除=写同名停用屏蔽项；停用/排序交给上级案由
            actions = '<button class="action-btn edit" onclick="editElement(' + idx + ')" title="将提升为本案由要件">编辑</button>'
                + '<button class="action-btn" disabled title="继承项不支持停用，请到上级案由操作">停用</button>'
                + '<button class="action-btn delete" onclick="deleteElement(' + idx + ')" title="屏蔽该继承要件">删除</button>';
        } else {
            const toggleBtn = isEnabled
                ? '<button class="action-btn toggle-off" onclick="toggleElementEnabled(' + idx + ')">停用</button>'
                : '<button class="action-btn toggle-on" onclick="toggleElementEnabled(' + idx + ')">启用</button>';
            // V1.3.26 A33: 删除按钮每行常驻可用，与状态/来源解耦
            actions = '<button class="action-btn edit" onclick="editElement(' + idx + ')">编辑</button>'
                + toggleBtn
                + '<button class="action-btn delete" onclick="deleteElement(' + idx + ')">删除</button>';
        }
        // B3: 组内上移/下移（继承行禁用——其位置由上级案由决定，允许排序会与"提升为覆盖"语义冲突）
        const sortCell = p.isInherited
            ? '<span class="sort-cell"><button class="action-btn" disabled title="继承项不支持排序，请到上级案由调整">↑</button><button class="action-btn" disabled title="继承项不支持排序，请到上级案由调整">↓</button></span>'
            : '<span class="sort-cell"><button class="action-btn sort-btn" onclick="moveElement(' + idx + ', -1)" title="上移（仅组内）">↑</button><button class="action-btn sort-btn" onclick="moveElement(' + idx + ', 1)" title="下移（仅组内）">↓</button></span>';
        return '<tr>'
            + '<td class="tpl-name-cell">' + nameCell + '</td>'
            + '<td class="tpl-group-cell">' + groupCell + '</td>'
            + '<td class="tpl-desc-cell">' + escapeHtml(p.desc || '') + '</td>'
            + '<td class="tpl-question-cell">' + escapeHtml(p.question || '') + '</td>'
            + '<td>' + cwCell + '</td>'
            + '<td>' + statusBadge + '</td>'
            + '<td class="tpl-action-cell">' + actions + sortCell + '</td>'
            + '</tr>';
    }

    // B2: 直接改某行分组（不进弹窗）
    window.changeElementGroup = function(idx, value) {
        if (!currentCause) return;
        const own = getOwnElements(currentOrg, currentCause);
        if (!own[idx]) return;
        if (value === '__new__') {
            const name = (window.prompt('请输入新分组名称', '') || '').trim();
            if (!name) { renderRight(); return; }
            if (!addCustomGroup(currentOrg, name)) {
                showNotification('分组「' + name + '」已存在', 'warning');
                renderRight();
                return;
            }
            value = name;
        }
        const wasOverride = hasOverride(currentOrg, currentCause);
        const arr = own.slice();
        arr[idx] = { ...arr[idx], group: value };
        persistOwn(currentOrg, currentCause, arr);
        renderRight();
        showNotification('已调整分组为「' + value + '」' + (wasOverride ? '' : '（该案由已转为自定义覆盖）'), 'success');
    };

    // B3: 组内上移/下移，不跨组（跨组归属只能通过改 group 实现）
    window.moveElement = function(idx, dir) {
        if (!currentCause) return;
        const own = getOwnElements(currentOrg, currentCause);
        const row = own[idx];
        if (!row) return;
        const g = getElementGroup(row);
        const arr = own.slice();
        let target = -1;
        for (let j = idx + dir; j >= 0 && j < arr.length; j += dir) {
            if (getElementGroup(arr[j]) === g) { target = j; break; }
        }
        if (target < 0) {
            showNotification('已在「' + g + '」组的' + (dir < 0 ? '首' : '末') + '位', 'warning');
            return;
        }
        const tmp = arr[idx];
        arr[idx] = arr[target];
        arr[target] = tmp;
        const wasOverride = hasOverride(currentOrg, currentCause);
        persistOwn(currentOrg, currentCause, arr);
        renderLeft();
        renderRight();
        showNotification(wasOverride ? '已调整组内顺序' : '已调整组内顺序（该案由已转为自定义覆盖）', 'success');
    };

    // ===== 渲染案字适配栏 =====
    function renderCaseWordBar() {
        const cwBar = document.getElementById('caseWordBar');
        const cwChips = document.getElementById('caseWordChips');
        const allWords = getCaseWordList(currentOrg);
        // 优化2: 按案由大类白名单过滤
        const allowed = (typeof getAllowedCaseWordsForCause === 'function')
            ? getAllowedCaseWordsForCause(currentOrg, currentCause)
            : allWords.slice();
        if (!allWords.length) {
            cwBar.style.display = 'none';
            return;
        }
        cwBar.style.display = 'flex';
        const selected = getCauseCaseWords(currentOrg, currentCause);
        // 合并白名单 + 已选但不在白名单的（保留显示但禁用）
        const merged = allowed.slice();
        selected.forEach(w => { if (merged.indexOf(w) < 0) merged.push(w); });
        cwChips.innerHTML = merged.map(w => {
            const checked = selected.indexOf(w) >= 0 ? ' checked' : '';
            const disabled = allowed.indexOf(w) < 0 ? ' disabled' : '';
            const onclick = disabled ? '' : ' onclick="toggleCauseCaseWord(\'' + escQuote(w) + '\')"';
            return '<span class="cw-chip' + checked + disabled + '"' + onclick + ' title="' + (disabled ? '该案字不在当前案由允许范围' : '') + '">'
                + '<i class="fas fa-check cw-check"></i>'
                + escapeHtml(w)
                + '</span>';
        }).join('');
    }

    window.toggleCauseCaseWord = function(word) {
        // 优化2: 白名单守卫
        const allowed = (typeof getAllowedCaseWordsForCause === 'function')
            ? getAllowedCaseWordsForCause(currentOrg, currentCause)
            : getCaseWordList(currentOrg);
        if (allowed.indexOf(word) < 0) {
            showNotification('该案字不在当前案由允许范围', 'error');
            return;
        }
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
        renderModalGroup(DEFAULT_FALLBACK_GROUP);
        document.getElementById('tplModal').classList.add('show');
        setTimeout(() => document.getElementById('tplName').focus(), 50);
    };

    window.editElement = function(idx) {
        const elements = getEffectiveElements(currentOrg, currentCause);
        const p = elements[idx];
        if (!p) return;
        if (p.isInherited) {
            // B4: 编辑继承行 = 提升为本案由要件（editingIndex=-2 为提升模式哨兵），上级案由数据不动
            promoteIndex = idx;
            editingIndex = -2;
            editingIsBuiltin = false;
        } else {
            promoteIndex = -1;
            editingIndex = idx;
            editingIsBuiltin = !!p.isBuiltin;
        }
        document.getElementById('modalTitle').firstChild.nodeValue = p.isInherited
            ? '编辑继承要件（另存为本案由要件）'
            : (editingIsBuiltin ? '编辑内置要件（另存为自定义）' : '编辑要件');
        document.getElementById('modalCauseBadge').textContent = '· ' + currentCause;
        document.getElementById('tplName').value = p.name || '';
        document.getElementById('tplDesc').value = p.desc || '';
        document.getElementById('tplQuestion').value = p.question || '';
        renderModalCaseWords(Array.isArray(p.caseWords) ? p.caseWords : []);
        renderModalGroup(getElementGroup(p));
        document.getElementById('tplModal').classList.add('show');
        setTimeout(() => document.getElementById('tplName').focus(), 50);
    };

    // 渲染弹窗中的适用案字多选
    // 优先用该案由已勾选的适配案字；若该案由未勾选任何案字，则用业务系统全部案字
    function renderModalCaseWords(selected) {
        const container = document.getElementById('modalCaseWords');
        // 优化2: 弹窗内只展示白名单案字，已选但不在白名单的保留显示但禁用
        const allowed = (typeof getAllowedCaseWordsForCause === 'function')
            ? getAllowedCaseWordsForCause(currentOrg, currentCause)
            : getCaseWordList(currentOrg);
        const sel = selected || [];
        const merged = allowed.slice();
        sel.forEach(w => { if (merged.indexOf(w) < 0) merged.push(w); });
        if (!merged.length) {
            container.innerHTML = '<span style="font-size:12px;color:var(--text-muted);">当前业务系统无案字配置</span>';
            return;
        }
        container.innerHTML = merged.map(w => {
            const checked = sel.indexOf(w) >= 0 ? ' checked' : '';
            const disabled = allowed.indexOf(w) < 0 ? ' disabled' : '';
            return '<span class="cw-chip' + checked + disabled + '" data-cw="' + escapeHtml(w) + '" onclick="toggleModalCaseWord(this)" title="' + (disabled ? '该案字不在当前案由允许范围' : '') + '">'
                + '<i class="fas fa-check cw-check"></i>'
                + escapeHtml(w)
                + '</span>';
        }).join('');
    }

    window.toggleModalCaseWord = function(el) {
        // 优化2: 禁用态不响应点击
        if (el.classList.contains('disabled')) return;
        el.classList.toggle('checked');
    };

    // 收集弹窗中已勾选的案字
    function collectModalCaseWords() {
        const chips = document.querySelectorAll('#modalCaseWords .cw-chip.checked');
        return Array.from(chips).map(c => c.getAttribute('data-cw') || '');
    }

    // ===== V1.3.32 B2：弹窗内的分组下拉 =====
    function renderModalGroup(sel) {
        const el = document.getElementById('tplGroup');
        if (!el) return;
        el.innerHTML = groupOptionsHtml(sel || DEFAULT_FALLBACK_GROUP);
    }
    window.onModalGroupChange = function(value) {
        const el = document.getElementById('tplGroup');
        if (value === '__new__') {
            const name = (window.prompt('请输入新分组名称', '') || '').trim();
            if (!name) { if (el) el.value = DEFAULT_FALLBACK_GROUP; return; }
            if (!addCustomGroup(currentOrg, name)) {
                showNotification('分组「' + name + '」已存在', 'warning');
                if (el) el.value = DEFAULT_FALLBACK_GROUP;
                return;
            }
            renderModalGroup(name);
            return;
        }
    };
    function collectModalGroup() {
        const el = document.getElementById('tplGroup');
        return (el && el.value && el.value !== '__new__') ? el.value : DEFAULT_FALLBACK_GROUP;
    }

    window.closeModal = function() {
        document.getElementById('tplModal').classList.remove('show');
        editingIndex = -1;
        editingIsBuiltin = false;
        promoteIndex = -1;
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

        const modalCw = collectModalCaseWords();
        const group = collectModalGroup();
        // baseline 只取「自身线」——继承来的要件属于上级案由，不能落盘到本案由
        const own = getOwnElements(currentOrg, currentCause);
        const baseline = own.map(p => ({
            name: p.name, desc: p.desc, question: p.question,
            caseWords: Array.isArray(p.caseWords) ? p.caseWords : [],
            enabled: p.enabled !== false,
            group: getElementGroup(p)
        }));

        let msg;
        if (editingIndex === -2) {
            // 提升模式：原本是继承行 → 追加为本案由自身要件（同名即在继承视图中取代祖先版本）
            baseline.push({ name: name, desc: desc, question: question, caseWords: modalCw, enabled: true, group: group });
            msg = '继承要件已另存为本案由要件（上级案由不受影响）';
        } else if (editingIndex >= 0) {
            // 编辑：替换指定下标，保留原 enabled 状态
            baseline[editingIndex] = {
                ...baseline[editingIndex],
                name: name, desc: desc, question: question, caseWords: modalCw, group: group
            };
            msg = '要件已更新（已另存为自定义覆盖）';
        } else {
            // 新增：追加，默认启用
            baseline.push({ name: name, desc: desc, question: question, caseWords: modalCw, enabled: true, group: group });
            msg = '要件已新增';
        }

        persistOwn(currentOrg, currentCause, baseline);

        closeModal();
        renderLeft();
        renderRight();
        showNotification(msg, 'success');
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
        const own = getOwnElements(currentOrg, currentCause);
        const p = own[idx];
        if (!p) return;
        const isEnabled = p.enabled !== false;
        const orgData = getOrgData(currentOrg);
        const existing = !!orgData[currentCause];

        if (!existing) {
            // 内置要件首次停用：生成自定义覆盖数组（保留所有内置要件，仅修改目标项的 enabled）
            // V1.3.32：只取自身线，避免把继承来的祖先要件误落盘为本案由覆盖
            const baseline = own.map(e => ({
                name: e.name, desc: e.desc, question: e.question,
                caseWords: Array.isArray(e.caseWords) ? e.caseWords : [],
                enabled: true,
                group: getElementGroup(e)
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
    // V1.3.26 A33: 删除按钮与状态/来源解耦，每行常驻可用
    // - 自定义要件：直接从覆盖数组移除
    // - 内置要件：先自动生成该案由自定义覆盖（与「停用」同 baseline 机制），再移除该条；可经「恢复内置」整组还原
    window.deleteElement = function(idx) {
        if (!currentCause) {
            showNotification('请先选择案由', 'error');
            return;
        }
        const elements = getEffectiveElements(currentOrg, currentCause);
        const p = elements[idx];
        if (!p) return;
        // V1.3.32 B4: 删除继承行——不能走"提升后再删"（祖先仍在，刷新后会继承回来，表现为删除无效），
        // 改为写入同名 enabled:false 的屏蔽项，沿用既有停用机制，不新增概念
        if (p.isInherited) {
            showConfirm('屏蔽继承要件', '确定屏蔽继承要件「' + (p.name || '') + '」吗？本案由将不再继承该条，上级案由数据不受影响。', () => {
                const own = getOwnElements(currentOrg, currentCause);
                const baseline = own.map(e => ({
                    name: e.name, desc: e.desc, question: e.question,
                    caseWords: Array.isArray(e.caseWords) ? e.caseWords : [],
                    enabled: e.enabled !== false,
                    group: getElementGroup(e)
                }));
                baseline.push({ name: p.name, desc: p.desc, question: p.question, caseWords: [], enabled: false, group: getElementGroup(p) });
                persistOwn(currentOrg, currentCause, baseline);
                renderLeft();
                renderRight();
                showNotification('已屏蔽继承要件「' + (p.name || '') + '」（本案由转为已停用）', 'success');
            });
            return;
        }
        const wasBuiltin = !!p.isBuiltin;
        showConfirm('删除要件', '确定删除要件「' + (p.name || '') + '」吗？此操作不可恢复。', () => {
            const own = getOwnElements(currentOrg, currentCause);
            // V1.3.26 A33: 内置要件首次删除——整组转自定义覆盖（保留其余条目），再移除目标条
            const baseline = own.map(e => ({
                name: e.name, desc: e.desc, question: e.question,
                caseWords: Array.isArray(e.caseWords) ? e.caseWords : [],
                enabled: e.enabled !== false,
                group: getElementGroup(e)
            }));
            baseline.splice(idx, 1);   // 自身行在数组前段，list idx == own idx
            persistOwn(currentOrg, currentCause, baseline);
            renderLeft();
            renderRight();
            showNotification(wasBuiltin
                ? '要件已删除（该案由已转为自定义覆盖，可通过「恢复内置」还原）'
                : '要件已删除', 'success');
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
            // V1.3.32 B4: 一并清除继承开关，否则会出现"覆盖清了但开关还开着"的不一致状态
            setCauseInherit(currentOrg, currentCause, false);
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

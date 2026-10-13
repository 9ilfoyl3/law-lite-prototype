// ============ Admin Workflows Management (V1.3 待办 A2) ============
// v1.0 workflow 独立管理页：workflow 从「文书类型子配置」解绑，成为唯一关联节点
//      - 存储扁平化：localStorage.adminWorkflows[org] = [wf]（旧对象结构读取时展平，零迁移）
//      - 解除唯一性校验：案字冲突 / 案由冲突 / 全兜底唯一 / 删除保护 四项拦截全部移除
//      - 新增「流程说明」description 字段（可选，用户端卡片副标题）
// v1.2 (V1.3.27 A34): 加回「文书类型」大分组（记忆点：以上第 2、3 行已部分失效）
//      - 流程新增必填的 domain 字段（值 = 文书类型 key；空串 = 通用兜底）
//      - 唯一性**按作用域恢复并硬拦截**：作用域 = (文书类型 + 生成方式)，案字/案由各自唯一、全兜底最多 1 个；
//        通用**同样受限但可自建**（用户 2026-09-22 拍板：通用类型下 案由+案字 相同组合只能有一条）
//      - 原「文书类型管理」页（doc-types.html / admin-doc-types.js）已废弃删除，类型维护能力并入本页上方区块
//      - 存储**仍为扁平数组**，不恢复按类型分组；domain 字段名沿用（它已被分步步骤序列/要件引入/版本归档消费）
// v1.1 (V1.3.9 A15): 生成模式由「新增固定一步生成型」改为三选一（quick / material / step），
//      编辑时回填原值并保留。对应三个用户侧入口：列表页快速生成 / 详情页材料生成 / 详情页分步生成。
// 设计详见 docs/V1.3版本PRD（人看）.md 5.2.7
// 设计详见 docs/V1.3版本PRD（人看）.md 5.2
// 数据读写统一走 case-data.js 的 getAllWorkflows / saveAllWorkflows

(function() {
    'use strict';

    // ===== 状态 =====
    let currentOrg = 'court';
    let wfEditingId = null;          // null=新增模式
    let wfEditingType = 'material';  // A15: 生成模式三选一；新增默认材料生成型，编辑时回填原值
    let wfSelectedCaseWords = new Set();
    let wfSelectedCauses = new Set();
    let pendingConfirmAction = null;

    const ORG_NAMES = { court: '法院', procuratorate: '检察院', justice: '司法局' };
    // A15: 生成模式三选一。MODE_ORDER 决定下拉展示顺序（与用户侧入口顺序一致）
    const MODE_LABEL = { quick: '快速生成型', material: '材料生成型', step: '分步生成型' };
    const MODE_ORDER = ['quick', 'material', 'step'];
    const MODE_HINT = {
        // A27: 列表页「快速生成」入口已恢复，不再是「配置后无处展示」的警示态，去掉警告色
        quick: '对应案件列表页行内「快速生成」入口：选完流程直接生成，不进案件详情页',
        material: '对应案件详情页「材料生成」：勾选本案材料后一步生成文书',
        // A16: 环节编排归 AgentFlow 平台（用户拍板 2026-09-20，参考编排端截图），管理端不开放 domain/环节配置
        step: '对应案件详情页「分步生成」。环节序列在 AgentFlow 编排端维护（编辑环节），本页仅配置流程与案由案字匹配关系；用户侧步骤展示按内置配置按案件阶段解析'
    };

    // 切换生成模式：刷新说明文案，并按新模式重算案字/案由的 ⚠ 占用提示
    window.onWfModeChange = function() {
        const select = document.getElementById('wfModeSelect');
        if (!select) return;
        wfEditingType = select.value || 'material';
        const hint = document.getElementById('wfModeHint');
        if (hint) {
            hint.textContent = MODE_HINT[wfEditingType] || MODE_HINT.material;
        }
        renderCaseWordsPicker();
        renderCausesPicker();
    };

    // 回填生成模式下拉（新增默认材料生成型）
    function syncWfModeControl() {
        const select = document.getElementById('wfModeSelect');
        if (!select) return;
        select.value = MODE_ORDER.indexOf(wfEditingType) >= 0 ? wfEditingType : 'material';
        const hint = document.getElementById('wfModeHint');
        if (hint) {
            hint.textContent = MODE_HINT[wfEditingType] || MODE_HINT.material;
        }
    }

    // ===== 工具 =====
    function escapeHtml(s) {
        if (s === undefined || s === null) return '';
        return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    }

    function showNotification(msg, type) {
        type = type || 'success';
        const icons = { success: 'fa-check-circle', error: 'fa-times-circle', warning: 'fa-exclamation-circle' };
        const container = document.getElementById('notificationContainer');
        if (!container) return;
        const div = document.createElement('div');
        div.className = 'notification ' + type;
        div.innerHTML = '<i class="fas ' + (icons[type] || icons.success) + '"></i><span>' + msg + '</span>';
        container.appendChild(div);
        setTimeout(() => div.remove(), 3000);
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

    // ===== A18: 编排端环节 mock（只读展示用）=====
    // 说明：环节数据属 AgentFlow 编排端，原型无法真实同步，故内置 mock。
    //   二审 = 用户提供的编排端截图真实数据（7 环节）；一审 = 按二审结构推导的原型示例（标注 mock）；
    //   其余分步流程无数据 → 弹窗空态。
    // 刻意不写入 case-data.js：不影响用户侧加载链路，也不落 localStorage。
    const WF_STEPS_MOCK = {
        'wf-judgment-2nd': {
            isMock: false,
            steps: [
                { seq: 1, name: '原审查明认定', subWf: 'wf_SE3GixHj', in: 2, out: 3, deps: 0 },
                { seq: 2, name: '上诉人诉讼', subWf: 'wf_92Istspy', in: 0, out: 0, deps: 0 },
                { seq: 3, name: '被上诉人抗辩', subWf: 'wf_2eIiHrZ', in: 0, out: 0, deps: 0 },
                { seq: 4, name: '争议焦点', subWf: 'wf_eZI0VAD', in: 8, out: 2, deps: 2 },
                { seq: 5, name: '再审认定', subWf: 'wf_Fzryw66v', in: 0, out: 0, deps: 0 },
                { seq: 6, name: '裁判结果', subWf: '', in: 0, out: 0, deps: 0, manual: true },
                { seq: 7, name: '分步生成的裁判文书（二审）', subWf: 'wf_cltqNhHL', in: 17, out: 0, deps: 6, produceDoc: true }
            ]
        },
        'wf-judgment-1st': {
            isMock: true,
            steps: [
                { seq: 1, name: '案件信息', subWf: 'wf_1st_case_info', in: 1, out: 4, deps: 0 },
                { seq: 2, name: '原告诉请', subWf: 'wf_1st_claim', in: 2, out: 3, deps: 0 },
                { seq: 3, name: '被告答辩', subWf: 'wf_1st_defense', in: 2, out: 3, deps: 0 },
                { seq: 4, name: '争议焦点', subWf: 'wf_1st_focus', in: 8, out: 2, deps: 3 },
                { seq: 5, name: '事实认定', subWf: 'wf_1st_fact', in: 6, out: 4, deps: 0 },
                { seq: 6, name: '裁判结果', subWf: '', in: 0, out: 0, deps: 0, manual: true },
                { seq: 7, name: '民事判决书（一审）', subWf: 'wf_1st_doc', in: 17, out: 0, deps: 6, produceDoc: true }
            ]
        }
    };

    // A18: 打开「编辑环节」弹窗（只读展示编排端环节结构）
    window.openWfStepsModal = function(wfId) {
        const workflows = getAllWorkflows(currentOrg);
        const wf = workflows.find(w => w.id === wfId);
        if (!wf) return;

        const titleEl = document.getElementById('wfStepsTitle');
        const subEl = document.getElementById('wfStepsSub');
        const bodyEl = document.getElementById('wfStepsBody');
        if (titleEl) titleEl.textContent = '编辑环节 · ' + (wf.name || '');
        if (subEl) subEl.textContent = '流程编码 ' + (wf.id || '') + ' ｜ 环节编排在 AgentFlow 编排端维护，此处只读展示';

        const data = WF_STEPS_MOCK[wfId];
        if (!bodyEl) { /* fallthrough */ } else if (!data || !data.steps || data.steps.length === 0) {
            bodyEl.innerHTML = '<div class="wf-steps-empty">'
                + '<i class="fas fa-diagram-project"></i>'
                + '<p>该流程尚未在编排端配置环节</p>'
                + '<p class="muted">请到 AgentFlow 编排端（编辑环节）为该 workflow 添加环节后，此处将同步展示</p>'
                + '</div>';
        } else {
            const mockTip = data.isMock
                ? '<div class="wf-steps-mocktip">以下为原型示例数据（按编排端结构推导），非平台真实配置</div>' : '';
            bodyEl.innerHTML = mockTip + data.steps.map(st => {
                const subHtml = st.manual
                    ? '<span class="wf-step-manual">手动填写，无外部流程</span>'
                    : '<span class="wf-step-code">' + escapeHtml(st.subWf) + '</span>';
                const ioHtml = st.manual ? '' 
                    : '<span class="wf-step-io">入参 ' + st.in + ' ｜ 出参 ' + st.out + '</span>';
                const depHtml = st.deps > 0 ? '<span class="wf-step-dep">依赖 ' + st.deps + ' 个前置环节</span>' : '';
                const prodHtml = st.produceDoc ? '<span class="wf-step-produce">产出文书</span>' : '';
                return '<div class="wf-step-item">'
                    + '<div class="wf-step-seq">' + st.seq + '</div>'
                    + '<div class="wf-step-main">'
                    +   '<div class="wf-step-name">' + escapeHtml(st.name) + prodHtml + '</div>'
                    +   '<div class="wf-step-meta">' + subHtml + ioHtml + depHtml + '</div>'
                    + '</div>'
                    + '</div>';
            }).join('') + '<div class="wf-steps-footnote">编排端配置的每个环节，在实际系统中与用户侧分步生成的步骤一一对应'
                + '（法官逐步填写/确认，末位环节产出文书）；原型阶段此处仅作只读示意，未与用户侧分步 tab 联动</div>';
        }
        document.getElementById('wfStepsModal').classList.add('show');
    };

    window.closeWfStepsModal = function() {
        const el = document.getElementById('wfStepsModal');
        if (el) el.classList.remove('show');
    };

    // ===== A17: 列表筛选（生成模式 / 匹配案字 / 匹配案由，默认全展示）=====
    const FILTER_FALLBACK = '__fallback__';   // 「兜底（不限制）」选项的内部值
    const DT_NONE = '__none__';               // A34: 「通用（未指定类型）」筛选值的内部值
    let filterMode = '';
    let filterCaseWord = '';
    let filterCause = '';
    let filterName = '';   // A30: 按流程名称搜索（不区分大小写子串，与上方筛选与关系）
    let filterDocType = ''; // A34: 按文书类型筛选（点击上方类型行或本页下拉均可设置）

    function hasWfFilter() {
        return !!(filterDocType || filterMode || filterCaseWord || filterCause || filterName);
    }

    // 选项从当前流程数据动态去重提取（不展平案由树，避免上百节点撑爆下拉）
    function renderFilterOptions(all) {
        const wordSet = new Set();
        const causeSet = new Set();
        (all || []).forEach(wf => {
            (Array.isArray(wf.caseWords) ? wf.caseWords : []).forEach(w => wordSet.add(w));
            (Array.isArray(wf.causes) ? wf.causes : []).forEach(c => causeSet.add(c));
        });
        fillFilterSelect('wfFilterCaseWord', '匹配案字：全部', wordSet, filterCaseWord, v => { filterCaseWord = v; });
        fillFilterSelect('wfFilterCause', '匹配案由：全部', causeSet, filterCause, v => { filterCause = v; });
        fillDocTypeFilter();   // A34: 文书类型下拉
    }

    // A34: 文书类型筛选下拉——取自类型全集（含未被任何流程使用的类型），
    // 未指定类型的通用兜底流程单列为「通用」；内部值用 __none__，与真实 key 区分
    function fillDocTypeFilter() {
        const select = document.getElementById('wfFilterDocType');
        if (!select) return;
        let types = {};
        if (typeof getAdminDocTypes === 'function') types = getAdminDocTypes(currentOrg) || {};
        let html = '<option value="">文书类型：全部</option>'
            + '<option value="' + DT_NONE + '">通用（未指定类型）</option>';
        Object.keys(types).forEach(key => {
            html += '<option value="' + escapeHtml(key) + '">' + escapeHtml((types[key] || {}).name || key) + '</option>';
        });
        select.innerHTML = html;
        select.value = filterDocType || '';
    }

    function fillFilterSelect(id, allLabel, valueSet, current, setter) {
        const select = document.getElementById(id);
        if (!select) return;
        const values = Array.from(valueSet).sort();
        let html = '<option value="">' + allLabel + '</option>'
            + '<option value="' + FILTER_FALLBACK + '">兜底（不限制）</option>';
        values.forEach(v => {
            html += '<option value="' + escapeHtml(v) + '">' + escapeHtml(v) + '</option>';
        });
        select.innerHTML = html;
        // 当前选中项若在新列表中不存在（如切换业务系统），回落为「全部」
        const valid = (current === FILTER_FALLBACK) || values.indexOf(current) >= 0;
        select.value = valid ? current : '';
        setter(select.value);
    }

    function applyWfFilters(list) {
        const kw = filterName ? filterName.toLowerCase() : '';
        return (list || []).filter(wf => {
            // A34: 文书类型（__none__ 代表未指定类型的通用兜底流程）
            if (filterDocType) {
                const dt = wf.domain ? wf.domain : DT_NONE;
                if (dt !== filterDocType) return false;
            }
            if (kw && (wf.name || '').toLowerCase().indexOf(kw) < 0) return false;
            if (filterMode && (MODE_ORDER.indexOf(wf.type) >= 0 ? wf.type : 'step') !== filterMode) return false;
            if (filterCaseWord) {
                const cw = Array.isArray(wf.caseWords) ? wf.caseWords : [];
                if (filterCaseWord === FILTER_FALLBACK) { if (cw.length > 0) return false; }
                else if (cw.indexOf(filterCaseWord) < 0) return false;
            }
            if (filterCause) {
                const cs = Array.isArray(wf.causes) ? wf.causes : [];
                if (filterCause === FILTER_FALLBACK) { if (cs.length > 0) return false; }
                else if (cs.indexOf(filterCause) < 0) return false;
            }
            return true;
        });
    }

    window.onWfFilterChange = function() {
        const m = document.getElementById('wfFilterMode');
        const w = document.getElementById('wfFilterCaseWord');
        const c = document.getElementById('wfFilterCause');
        filterMode = m ? m.value : '';
        filterCaseWord = w ? w.value : '';
        filterCause = c ? c.value : '';
        const dt = document.getElementById('wfFilterDocType');
        filterDocType = dt ? dt.value : '';
        const s = document.getElementById('wfSearch');
        filterName = s ? s.value.trim() : '';
        renderTable();
    };

    // A30: 搜索框实时输入（oninput），即时按名称过滤，无需点确认
    window.onWfSearchInput = function() {
        const s = document.getElementById('wfSearch');
        filterName = s ? s.value.trim() : '';
        renderTable();
    };

    window.resetWfFilters = function() {
        filterMode = '';
        filterCaseWord = '';
        filterCause = '';
        filterName = '';
        filterDocType = '';   // A34: 一并清除文书类型筛选（含点击类型行的联动）
        const m = document.getElementById('wfFilterMode');
        const w = document.getElementById('wfFilterCaseWord');
        const c = document.getElementById('wfFilterCause');
        const s = document.getElementById('wfSearch');
        if (m) m.value = '';
        if (w) w.value = '';
        if (c) c.value = '';
        if (s) s.value = '';
        renderTable();
    };

    // ===== 渲染主表格 =====
    function renderTable() {
        const allWorkflows = getAllWorkflows(currentOrg);
        renderFilterOptions(allWorkflows);          // 先重建选项（切换业务系统时自动回落失效项）
        renderDocTypes();                            // A34: 同步上方类型区块的选中态与流程计数
        const workflows = applyWfFilters(allWorkflows);
        const rightTitle = document.getElementById('rightTitle');
        if (rightTitle) rightTitle.textContent = (ORG_NAMES[currentOrg] || '') + '文书流程';

        const tbody = document.getElementById('wfTbody');
        const empty = document.getElementById('emptyState');
        if (!tbody) return;

        if (workflows.length === 0) {
            tbody.innerHTML = '';
            if (empty) {
                empty.style.display = 'block';
                const text = document.getElementById('emptyText');
                const resetBtn = document.getElementById('emptyResetBtn');
                const filtered = hasWfFilter();
                if (text) text.textContent = filtered
                    ? '没有符合筛选条件的 workflow'
                    : '暂无 workflow，点击「新增 workflow」创建';
                if (resetBtn) resetBtn.style.display = filtered ? 'inline-block' : 'none';
            }
            return;
        }
        if (empty) empty.style.display = 'none';

        tbody.innerHTML = workflows.map(wf => {
            const type = MODE_ORDER.indexOf(wf.type) >= 0 ? wf.type : 'step';
            const modeBadge = '<span class="wf-type-badge ' + type + '">'
                + (MODE_LABEL[type] || MODE_LABEL.step) + '</span>';
            // 来源/适用范围徽标按用户 2026-09-20 拍板全部隐藏（无标签即内置；生成模式列已体现模式，通用兜底仅一步生成可见且不可删）
            const sourceBadge = '';
            const generalBadge = '';
            const caseWordsHtml = (!Array.isArray(wf.caseWords) || wf.caseWords.length === 0)
                ? '<span class="case-word-fallback">兜底</span>'
                : wf.caseWords.map(w => '<span class="case-word-tag">' + escapeHtml(w) + '</span>').join('');
            const causesHtml = (!Array.isArray(wf.causes) || wf.causes.length === 0)
                ? '<span class="case-word-fallback">兜底</span>'
                : wf.causes.map(c => '<span class="case-word-tag">' + escapeHtml(c) + '</span>').join('');
            // A17: 列表不再渲染「流程说明」小字（字段保留，用户端卡片副标题仍用；弹窗仍可填写）
            // A34: 文书类型列——流程归属的大分类；未指定 domain 的通用兜底流程显示为「通用」
            const domainKey = wf.domain || '';
            const domainText = domainKey ? escapeHtml(docTypeName(currentOrg, domainKey)) : '<span class="case-word-fallback">通用</span>';
            return '<tr>'
                + '<td class="wf-name-cell">' + escapeHtml(wf.name) + sourceBadge + generalBadge + '</td>'
                + '<td>' + domainText + '</td>'
                + '<td>' + modeBadge + '</td>'
                + '<td>' + caseWordsHtml + '</td>'
                + '<td>' + causesHtml + '</td>'
                + '<td class="tpl-action-cell">'
                // A18: 仅分步生成型有环节概念
                +   (type === 'step' ? '<button class="action-btn steps" onclick="openWfStepsModal(\'' + escapeHtml(wf.id) + '\')">编辑环节</button>' : '')
                +   '<button class="action-btn edit" onclick="editWorkflow(\'' + escapeHtml(wf.id) + '\')">编辑</button>'
                +   '<button class="action-btn delete" onclick="deleteWorkflow(\'' + escapeHtml(wf.id) + '\')">删除</button>'
                + '</td>'
                + '</tr>';
        }).join('');
    }

    // ===== V1.3.27 A34: 文书类型区块 =====
    // 旧「文书类型管理」页已废弃删除，维护能力并入本页。列表版式照旧：
    // 类型名称 / 流程数 / 示例数 / 指令数 / 状态 / 操作

    // 取类型显示名；通用兜底流程（domain 为空）统一叫「通用」
    function docTypeName(org, key) {
        if (!key) return '通用';
        let types = {};
        if (typeof getAdminDocTypes === 'function') types = getAdminDocTypes(org) || {};
        return (types[key] && types[key].name) || key;
    }

    function countTemplatesOfDocType(key) {
        try { return Object.keys(getDocTypeTemplates(key) || {}).length; } catch (e) { return 0; }
    }

    function countPromptsOfDocType(key) {
        let count = 0;
        try {
            const scan = obj => {
                Object.values(obj || {}).forEach(p => {
                    if (p && typeof p === 'object' && (p.docType || '') === key) count++;
                });
            };
            scan((JSON.parse(localStorage.getItem('adminPromptTemplates') || '{}') || {})[currentOrg]);
            scan((JSON.parse(localStorage.getItem('myPromptTemplates') || '{}') || {})[currentOrg]);
        } catch (e) { /* 指令尚未按类型挂钩时计 0 */ }
        return count;
    }

    function renderDocTypes() {
        const tbody = document.getElementById('dtTbody');
        if (!tbody) return;
        let types = {};
        if (typeof getAdminDocTypes === 'function') types = getAdminDocTypes(currentOrg) || {};
        const workflows = getAllWorkflows(currentOrg);
        const keys = Object.keys(types);
        if (keys.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:14px;">'
                + '暂无文书类型，点击「新增类型」创建</td></tr>';
            return;
        }
        tbody.innerHTML = keys.map(key => {
            const t = types[key] || {};
            const enabled = t.enabled !== false;
            const wfCount = workflows.filter(wf => (wf.domain || '') === key).length;
            const tplCount = countTemplatesOfDocType(key);
            const prmCount = countPromptsOfDocType(key);
            const statusBadge = enabled
                ? '<span class="status-badge status-on">已启用</span>'
                : '<span class="status-badge status-off">已停用</span>';
            const toggleBtn = enabled
                ? '<button class="action-btn toggle-off" onclick="event.stopPropagation();toggleDocTypeEnabled(\'' + escapeHtml(key) + '\')">停用</button>'
                : '<button class="action-btn toggle-on" onclick="event.stopPropagation();toggleDocTypeEnabled(\'' + escapeHtml(key) + '\')">启用</button>';
            const cnt = n => (n > 0 ? String(n) : '<span class="dt-count-zero">0</span>');
            const selected = (filterDocType === key) ? ' dt-row-selected' : '';
            return '<tr class="dt-row' + selected + '" onclick="selectDocType(\'' + escapeHtml(key) + '\')">'
                + '<td class="tpl-name-cell">' + escapeHtml(t.name || key) + '</td>'
                + '<td>' + cnt(wfCount) + '</td>'
                + '<td>' + cnt(tplCount) + '</td>'
                + '<td>' + cnt(prmCount) + '</td>'
                + '<td>' + statusBadge + '</td>'
                + '<td class="tpl-action-cell">'
                +   '<button class="action-btn edit" onclick="event.stopPropagation();editDocType(\'' + escapeHtml(key) + '\')">编辑</button>'
                +   toggleBtn
                +   '<button class="action-btn delete" onclick="event.stopPropagation();deleteDocType(\'' + escapeHtml(key) + '\')">删除</button>'
                + '</td>'
                + '</tr>';
        }).join('');
    }

    // 点击类型行 → 下方流程表按该类型筛选（再点一次取消筛选）
    window.selectDocType = function(key) {
        filterDocType = (filterDocType === key) ? '' : key;
        const select = document.getElementById('wfFilterDocType');
        if (select) select.value = filterDocType;
        renderDocTypes();
        renderTable();
    };

    let dtEditingKey = null;

    window.openAddDocTypeModal = function() {
        dtEditingKey = null;
        const t = document.getElementById('dtModalTitle');
        if (t) t.textContent = '新增类型';
        const i = document.getElementById('dtName');
        if (i) i.value = '';
        const hint = document.getElementById('dtNameHint');
        if (hint) hint.textContent = '作为文书流程、示例与指令的分类容器，不可与现有类型重名';
        const el = document.getElementById('dtModal');
        if (el) el.classList.add('show');
        setTimeout(() => { if (i) i.focus(); }, 50);
    };

    window.editDocType = function(key) {
        let types = {};
        if (typeof getAdminDocTypes === 'function') types = getAdminDocTypes(currentOrg) || {};
        if (!types[key]) return;
        dtEditingKey = key;
        const t = document.getElementById('dtModalTitle');
        if (t) t.textContent = types[key].isBuiltin ? '编辑类型（内置将转为自定义覆盖）' : '编辑类型';
        const i = document.getElementById('dtName');
        if (i) i.value = types[key].name || '';
        const hint = document.getElementById('dtNameHint');
        if (hint) hint.textContent = '改名不影响已关联的流程、示例与指令（它们按类型 key 关联）';
        const el = document.getElementById('dtModal');
        if (el) el.classList.add('show');
        setTimeout(() => { if (i) i.focus(); }, 50);
    };

    window.closeDocTypeModal = function() {
        const el = document.getElementById('dtModal');
        if (el) el.classList.remove('show');
    };

    window.saveDocType = function() {
        const input = document.getElementById('dtName');
        const name = input ? input.value.trim() : '';
        if (!name) {
            showNotification('请填写类型名称', 'error');
            if (input) input.focus();
            return;
        }
        let types = {};
        if (typeof getAdminDocTypes === 'function') types = getAdminDocTypes(currentOrg) || {};
        const dup = Object.keys(types).find(k => k !== dtEditingKey && (types[k].name || '') === name);
        if (dup) {
            showNotification('已存在同名类型「' + name + '」', 'error');
            if (input) input.focus();
            return;
        }
        const key = dtEditingKey || ((typeof genDocTypeKey === 'function') ? genDocTypeKey() : ('custom-' + Date.now().toString(36)));
        if (typeof saveAdminDocType === 'function') saveAdminDocType(currentOrg, key, { name: name });
        closeDocTypeModal();
        renderDocTypes();
        fillDocTypeFilter();
        refreshWfDocTypeSelect();
        showNotification(dtEditingKey ? '类型已更新' : '类型已新增', 'success');
    };

    window.toggleDocTypeEnabled = function(key) {
        let types = {};
        if (typeof getAdminDocTypes === 'function') types = getAdminDocTypes(currentOrg) || {};
        if (!types[key]) return;
        const next = types[key].enabled === false;
        if (typeof setAdminDocTypeEnabled === 'function') setAdminDocTypeEnabled(currentOrg, key, next);
        renderDocTypes();
        showNotification('已' + (next ? '启用' : '停用') + '类型「' + (types[key].name || key) + '」', 'success');
    };

    window.deleteDocType = function(key) {
        let types = {};
        if (typeof getAdminDocTypes === 'function') types = getAdminDocTypes(currentOrg) || {};
        if (!types[key]) return;
        const name = types[key].name || key;
        // 删除保护：仍被流程 / 示例 / 指令引用时不允许删
        const wfCount = getAllWorkflows(currentOrg).filter(wf => (wf.domain || '') === key).length;
        const tplCount = countTemplatesOfDocType(key);
        const prmCount = countPromptsOfDocType(key);
        if (wfCount > 0 || tplCount > 0 || prmCount > 0) {
            showNotification('「' + name + '」仍被 ' + wfCount + ' 个流程、' + tplCount + ' 个示例、' + prmCount
                + ' 条指令引用，请先解除关联', 'error');
            return;
        }
        showConfirm('删除类型', '确定删除文书类型「' + name + '」吗？此操作不可恢复。', () => {
            if (typeof removeAdminDocType === 'function') removeAdminDocType(currentOrg, key);
            if (filterDocType === key) filterDocType = '';
            renderDocTypes();
            fillDocTypeFilter();
            refreshWfDocTypeSelect();
            showNotification('类型已删除', 'success');
        });
    };

    // A34: 流程弹窗的「文书类型」下拉。DT_NONE 代表「通用（未指定类型）」
    function refreshWfDocTypeSelect(selected) {
        const select = document.getElementById('wfDocTypeSelect');
        if (!select) return;
        let types = {};
        if (typeof getAdminDocTypes === 'function') types = getAdminDocTypes(currentOrg) || {};
        let html = '<option value="">请选择文书类型</option>'
            + '<option value="' + DT_NONE + '">通用（未指定类型）</option>';
        Object.keys(types).forEach(key => {
            html += '<option value="' + escapeHtml(key) + '">' + escapeHtml((types[key] || {}).name || key) + '</option>';
        });
        select.innerHTML = html;
        select.value = selected || '';
    }

    // A34: 读取弹窗当前选定的文书类型 key（DT_NONE → 空串，表示通用）
    function getEditingDomain() {
        const select = document.getElementById('wfDocTypeSelect');
        if (!select || !select.value) return '';
        return select.value === DT_NONE ? '' : select.value;
    }

    // A34: 切换文书类型后重算案由 / 案字的 ⚠ 占用标记（唯一性作用域含类型，故需联动）
    window.onWfDocTypeChange = function() {
        renderCaseWordsPicker();
        renderCausesPicker();
    };

    // ===== workflow id 下拉（数据来源 agentflow 平台 mock）=====
    function renderWfIdSelect(selectedId, isBuiltin) {
        const select = document.getElementById('wfId');
        if (!select) return;
        const list = (typeof agentflowWorkflowList !== 'undefined') ? agentflowWorkflowList : [];
        const existing = getAllWorkflows(currentOrg);
        const usedIds = new Set(existing.filter(w => w.id !== wfEditingId).map(w => w.id));

        let options = '<option value="">请从 agentflow 平台已编排的 workflow 中选择</option>';
        list.forEach(item => {
            const isUsed = usedIds.has(item.id);
            const isCurrentBuiltin = isBuiltin && item.id === selectedId;
            if (isUsed && !isCurrentBuiltin) return;   // 已被占用且不是当前编辑项
            const label = item.id + ' - ' + item.name + (item.description ? '（' + item.description + '）' : '');
            options += '<option value="' + escapeHtml(item.id) + '"' + (item.id === selectedId ? ' selected' : '') + '>'
                + escapeHtml(label) + '</option>';
        });
        // 编辑内置时，若原 id 不在 mock 列表中，补一个选项保证可显示
        if (isBuiltin && selectedId && !list.some(item => item.id === selectedId)) {
            options += '<option value="' + escapeHtml(selectedId) + '" selected>'
                + escapeHtml(selectedId) + '（内置，未在 agentflow 平台列表中）</option>';
        }
        select.innerHTML = options;
        select.disabled = isBuiltin;   // 编辑内置时 id 只读（保证用户侧引用稳定）
    }

    window.onWfIdChange = function() {
        const select = document.getElementById('wfId');
        const nameInput = document.getElementById('wfName');
        if (!select || !nameInput) return;
        const id = select.value;
        if (!id) { nameInput.value = ''; return; }
        const list = (typeof agentflowWorkflowList !== 'undefined') ? agentflowWorkflowList : [];
        const matched = list.find(item => item.id === id);
        // 名称可编辑：用户端卡片标题直接用此值，需按业务语言改写
        if (matched && !nameInput.value) nameInput.value = matched.name;
    };

    // ===== 新增 / 编辑 弹窗 =====
    window.openAddWfModal = function() {
        wfEditingId = null;
        wfEditingType = 'material';   // A15: 新增默认材料生成型（可改，三选一）
        wfSelectedCaseWords = new Set();
        wfSelectedCauses = new Set();

        document.getElementById('wfModalTitle').textContent = '新增 workflow';
        document.getElementById('wfName').value = '';
        document.getElementById('wfDesc').value = '';
        syncWfModeControl();
        renderWfIdSelect('', false);
        refreshWfDocTypeSelect('');   // A34: 新增时必须显式选择文书类型
        renderCaseWordsPicker();
        renderCausesPicker();
        document.getElementById('wfModal').classList.add('show');
        setTimeout(() => document.getElementById('wfId').focus(), 50);
    };

    window.editWorkflow = function(wfId) {
        const workflows = getAllWorkflows(currentOrg);
        const wf = workflows.find(w => w.id === wfId);
        if (!wf) return;
        const isBuiltin = !!wf.isBuiltin;

        wfEditingId = wfId;
        wfEditingType = wf.type || 'step';    // A15: 回填原生成模式（内置分步型仍不被强制转为材料生成型）
        wfSelectedCaseWords = new Set(Array.isArray(wf.caseWords) ? wf.caseWords : []);
        wfSelectedCauses = new Set(Array.isArray(wf.causes) ? wf.causes : []);

        // 已选案字中不在「已选案由白名单」内的项清理掉（兼容旧数据不一致）
        if (wfSelectedCauses.size > 0) {
            const allowedSet = new Set(getAllowedCaseWordsBySelectedCauses());
            if (allowedSet.size > 0) {
                Array.from(wfSelectedCaseWords).forEach(w => {
                    if (!allowedSet.has(w)) wfSelectedCaseWords.delete(w);
                });
            }
        }

        document.getElementById('wfModalTitle').textContent = isBuiltin
            ? '编辑内置 workflow（另存为自定义覆盖）' : '编辑 workflow';
        document.getElementById('wfName').value = wf.name || '';
        document.getElementById('wfDesc').value = wf.description || '';
        refreshWfDocTypeSelect(wf.domain || '');   // A34: 回填原文书类型（空 = 通用）
        syncWfModeControl();
        renderWfIdSelect(wf.id || '', isBuiltin);
        renderCaseWordsPicker();
        renderCausesPicker();
        document.getElementById('wfModal').classList.add('show');
    };

    window.closeWfModal = function() {
        document.getElementById('wfModal').classList.remove('show');
        wfEditingId = null;
        wfEditingType = 'material';
        wfSelectedCaseWords = new Set();
        wfSelectedCauses = new Set();
    };

    // ===== 匹配案字选择器 =====
    // V1.3: 唯一性校验已解除——⚠ 标记仅作信息提示，选项仍可勾选
    function getAllowedCaseWordsBySelectedCauses() {
        const allWords = (typeof caseWordListByOrg !== 'undefined' && caseWordListByOrg[currentOrg]) || [];
        if (typeof getAllowedCaseWordsForCause !== 'function' || wfSelectedCauses.size === 0) {
            return allWords.slice();
        }
        const allowedSet = new Set();
        wfSelectedCauses.forEach(cause => {
            getAllowedCaseWordsForCause(currentOrg, cause).forEach(w => allowedSet.add(w));
        });
        return allowedSet.size > 0 ? Array.from(allowedSet) : allWords.slice();
    }

    function renderCaseWordsPicker() {
        const picker = document.getElementById('wfCaseWordsPicker');
        if (!picker) return;
        const wordList = (typeof caseWordListByOrg !== 'undefined' && caseWordListByOrg[currentOrg]) || [];
        if (wordList.length === 0) {
            picker.innerHTML = '<span class="picker-empty">当前业务系统未配置案字列表</span>';
            return;
        }
        // 同生成模式下其他 workflow 已占用的案字（仅提示，不禁用）
        // A34: 占用范围为（文书类型 + 生成方式），与保存时的唯一性作用域一致
        const editingDomain = getEditingDomain();
        const usedWords = new Set();
        getAllWorkflows(currentOrg).forEach(wf => {
            if (wf.id === wfEditingId) return;
            if ((wf.type || 'step') !== wfEditingType) return;
            if ((wf.domain || '') !== editingDomain) return;
            if (Array.isArray(wf.caseWords)) wf.caseWords.forEach(w => usedWords.add(w));
        });
        const allowedWords = getAllowedCaseWordsBySelectedCauses();
        const allowedSet = new Set(allowedWords);
        const hasCauseFilter = wfSelectedCauses.size > 0 && allowedWords.length < wordList.length;

        picker.innerHTML = wordList.map(w => {
            if (hasCauseFilter && !allowedSet.has(w)) return '';
            const isSel = wfSelectedCaseWords.has(w);
            const isUsed = usedWords.has(w);
            const title = isUsed ? '已有其他' + (MODE_LABEL[wfEditingType] || '') + '流程匹配此案字，保存后用户端将并列展示' : '';
            return '<label class="case-word-option' + (isSel ? ' selected' : '') + '" title="' + title + '">'
                + '<input type="checkbox" value="' + escapeHtml(w) + '"' + (isSel ? ' checked' : '')
                + ' onchange="toggleCaseWord(this.value, this.checked)">'
                + '<span>' + escapeHtml(w) + (isUsed ? ' ⚠' : '') + '</span></label>';
        }).join('');

        if (hasCauseFilter && allowedWords.length === 0) {
            picker.innerHTML = '<span class="picker-empty">已选案由未匹配到允许的案字白名单</span>';
        }
    }

    window.toggleCaseWord = function(word, checked) {
        if (checked) wfSelectedCaseWords.add(word);
        else wfSelectedCaseWords.delete(word);
    };

    // ===== 匹配案由选择器（案由树）=====
    function renderCausesPicker() {
        const picker = document.getElementById('wfCausesPicker');
        if (!picker) return;
        const tree = (typeof causeTreeDataByOrg !== 'undefined' && causeTreeDataByOrg[currentOrg]) || [];
        if (tree.length === 0) {
            picker.innerHTML = '<span class="picker-empty">当前业务系统未配置案由树</span>';
            return;
        }
        // A34: 同样按（文书类型 + 生成方式）判定占用
        const editingDomain = getEditingDomain();
        const usedCauses = new Set();
        getAllWorkflows(currentOrg).forEach(wf => {
            if (wf.id === wfEditingId) return;
            if ((wf.type || 'step') !== wfEditingType) return;
            if ((wf.domain || '') !== editingDomain) return;
            if (Array.isArray(wf.causes)) wf.causes.forEach(c => usedCauses.add(c));
        });
        picker.innerHTML = tree.map((root, idx) => renderCauseTreeNode(root, 'root-' + idx, usedCauses)).join('');
    }

    function renderCauseTreeNode(node, key, usedCauses) {
        if (typeof node === 'string') return renderCauseTreeLeaf(node, usedCauses);
        const name = node.name || '';
        const children = node.children || [];
        const hasChildren = children.length > 0;
        const isSel = wfSelectedCauses.has(name);
        const isUsed = usedCauses.has(name);
        const title = isUsed ? '已有其他' + (MODE_LABEL[wfEditingType] || '') + '流程匹配此案由，保存后用户端将并列展示' : '';
        const toggleHtml = hasChildren
            ? '<span class="cause-tree-toggle" onclick="toggleCauseNode(\'' + key + '\')"><i class="fas fa-chevron-right"></i></span>'
            : '<span class="cause-tree-toggle"></span>';
        let html = '<div class="cause-tree-node">'
            + '<div class="cause-tree-node-row' + (isSel ? ' selected' : '') + '" title="' + title + '">'
            + toggleHtml
            + '<input type="checkbox" class="cause-tree-checkbox" value="' + escapeHtml(name) + '"'
            + (isSel ? ' checked' : '') + ' onchange="toggleCause(this.value, this.checked)">'
            + '<span class="cause-tree-label" style="font-weight:500;">' + escapeHtml(name) + (isUsed ? ' ⚠' : '') + '</span>'
            + '</div>';
        if (hasChildren) {
            html += '<div class="cause-tree-children" id="cause-children-' + key + '">';
            html += children.map((child, idx) => renderCauseTreeNode(child, key + '-' + idx, usedCauses)).join('');
            html += '</div>';
        }
        html += '</div>';
        return html;
    }

    function renderCauseTreeLeaf(name, usedCauses) {
        const isSel = wfSelectedCauses.has(name);
        const isUsed = usedCauses.has(name);
        const title = isUsed ? '已有其他' + (MODE_LABEL[wfEditingType] || '') + '流程匹配此案由，保存后用户端将并列展示' : '';
        return '<div class="cause-tree-node">'
            + '<div class="cause-tree-node-row' + (isSel ? ' selected' : '') + '" title="' + title + '">'
            + '<span class="cause-tree-toggle"></span>'
            + '<input type="checkbox" class="cause-tree-checkbox" value="' + escapeHtml(name) + '"'
            + (isSel ? ' checked' : '') + ' onchange="toggleCause(this.value, this.checked)">'
            + '<span class="cause-tree-label">' + escapeHtml(name) + (isUsed ? ' ⚠' : '') + '</span>'
            + '</div></div>';
    }

    window.toggleCause = function(name, checked) {
        if (checked) wfSelectedCauses.add(name);
        else wfSelectedCauses.delete(name);
        // 案由变更后重算案字白名单，并清理不在新白名单内的已选案字
        const allowedSet = new Set(getAllowedCaseWordsBySelectedCauses());
        if (wfSelectedCauses.size > 0 && allowedSet.size > 0) {
            Array.from(wfSelectedCaseWords).forEach(w => {
                if (!allowedSet.has(w)) wfSelectedCaseWords.delete(w);
            });
        }
        renderCaseWordsPicker();
    };

    window.toggleCauseNode = function(key) {
        const el = document.getElementById('cause-children-' + key);
        if (!el) return;
        el.classList.toggle('expanded');
        const toggle = el.previousElementSibling && el.previousElementSibling.querySelector('.cause-tree-toggle i');
        if (toggle) toggle.style.transform = el.classList.contains('expanded') ? 'rotate(90deg)' : '';
    };

    // 判断两个 workflow 的「案字+案由+生成模式」组合是否相同（用于保存后的并列展示提示）
    function sameScope(a, b) {
        const norm = arr => (Array.isArray(arr) ? arr.slice().sort().join(',') : '');
        return (a.type || 'step') === (b.type || 'step')
            && norm(a.caseWords) === norm(b.caseWords)
            && norm(a.causes) === norm(b.causes);
    }

    // ===== 保存 =====
    window.saveWorkflow = function() {
        const wfIdSelect = document.getElementById('wfId');
        const finalWfId = wfIdSelect ? wfIdSelect.value.trim() : '';
        if (!finalWfId) {
            showNotification('请从 agentflow 平台 workflow 列表中选择 workflow id', 'error');
            if (wfIdSelect) wfIdSelect.focus();
            return;
        }
        const name = document.getElementById('wfName').value.trim();
        if (!name) {
            showNotification('请填写 workflow 名称', 'error');
            document.getElementById('wfName').focus();
            return;
        }
        const description = document.getElementById('wfDesc').value.trim();

        // A15: 以弹窗下拉的当前值为准（防止未触发 change 时取值滞后）
        const modeSelect = document.getElementById('wfModeSelect');
        if (modeSelect && modeSelect.value) wfEditingType = modeSelect.value;

        const list = getAllWorkflows(currentOrg);

        // 保留的唯一校验：id 在同一业务系统内不可重复
        const idConflict = list.find(wf => wf.id === finalWfId && wf.id !== wfEditingId);
        if (idConflict) {
            showNotification('workflow id「' + finalWfId + '」已被「' + idConflict.name + '」占用，请更换', 'error');
            if (wfIdSelect) wfIdSelect.focus();
            return;
        }

        // V1.3.27 A34: 文书类型必选（DT_NONE = 通用，落库为空 domain）
        const dtSelect = document.getElementById('wfDocTypeSelect');
        const dtValue = dtSelect ? dtSelect.value : '';
        if (!dtValue) {
            showNotification('请选择文书类型；通用兜底流程请选择「通用（未指定类型）」', 'error');
            if (dtSelect) dtSelect.focus();
            return;
        }
        const domainKey = (dtValue === DT_NONE) ? '' : dtValue;

        // A34: 唯一性校验——作用域 = (文书类型 + 生成方式)，沿用旧 admin-doc-types.js 口径并由 warning 升级为硬拦截。
        // 旧代码的判定是行级 `if ((wf.type||'step') !== wfEditingType) continue;` + 同 docType 分组取列表，
        // 此处改为先按作用域筛选出同组流程再逐条比对，语义等价。
        // 用户 2026-09-22 拍板：**通用（未指定类型）同样受限、可自建**——三项唯一性对通用一并生效，
        // 不再豁免。已知占用：内置「通用文书生成」(isGeneral，恒在不可删) 已占掉 通用+材料生成 的全兜底位。
        const newCaseWords = Array.from(wfSelectedCaseWords);
        const newCauses = Array.from(wfSelectedCauses);
        const typeLabel = docTypeName(currentOrg, domainKey);   // 空 key → 「通用」
        const scopeWfs = list.filter(wf =>
            wf.id !== wfEditingId
            && (wf.domain || '') === domainKey
            && (wf.type || 'step') === wfEditingType
        );
        const modeLabel = MODE_LABEL[wfEditingType] || '';
        // 1) 案字在作用域内唯一
        for (const wf of scopeWfs) {
            const hitWord = (wf.caseWords || []).find(w => newCaseWords.indexOf(w) >= 0);
            if (hitWord) {
                showNotification('案字「' + hitWord + '」在文书类型「' + typeLabel + '」下已被' + modeLabel + '流程「' + wf.name + '」占用', 'error');
                return;
            }
        }
        // 2) 案由在作用域内唯一
        for (const wf of scopeWfs) {
            const hitCause = (wf.causes || []).find(c => newCauses.indexOf(c) >= 0);
            if (hitCause) {
                showNotification('案由「' + hitCause + '」在文书类型「' + typeLabel + '」下已被' + modeLabel + '流程「' + wf.name + '」占用', 'error');
                return;
            }
        }
        // 3) 案字与案由均为空 = 全兜底，作用域内最多 1 个
        if (newCaseWords.length === 0 && newCauses.length === 0) {
            const fallback = scopeWfs.find(wf =>
                (!Array.isArray(wf.caseWords) || wf.caseWords.length === 0)
                && (!Array.isArray(wf.causes) || wf.causes.length === 0)
            );
            if (fallback) {
                showNotification('文书类型「' + typeLabel + '」下每种生成方式最多 1 个全兜底流程，已有「' + fallback.name + '」', 'error');
                return;
            }
        }

        const newWf = {
            id: finalWfId,
            name: name,
            // V1.3.27 A34: 文书类型。空串表示该流程为通用兜底（列表显示为「通用」）
            domain: domainKey,
            type: wfEditingType,
            caseWords: newCaseWords,
            causes: newCauses,
            description: description,
            isBuiltin: false
        };
        // V1.3 A6: 编辑通用兜底流程时保留其 isGeneral 标记（防编辑后标记丢失导致用户侧重复追加）
        const editingWf = wfEditingId ? list.find(w => w.id === wfEditingId) : null;
        if (editingWf && editingWf.isGeneral === true) newWf.isGeneral = true;

        const next = list.slice();
        if (wfEditingId) {
            const idx = next.findIndex(w => w.id === wfEditingId);
            if (idx >= 0) next[idx] = newWf; else next.push(newWf);
        } else {
            next.push(newWf);
        }
        saveAllWorkflows(currentOrg, next);
        closeWfModal();
        renderDocTypes();   // A34: 类型区块的流程计数随之刷新
        renderTable();

        // 轻提示：该「案字+案由+生成模式」组合下已有多个流程，用户端将并列展示
        const sameScopeCount = next.filter(w => sameScope(w, newWf)).length;
        if (sameScopeCount > 1) {
            showNotification('已保存。该案由案字下已有 ' + sameScopeCount + ' 个流程，用户端将并列展示', 'warning');
        } else {
            showNotification(wfEditingId ? 'workflow 已更新' : 'workflow 已新增', 'success');
        }
    };

    // ===== 删除 =====
    // V1.3: 解除「同生成模式仅剩 1 个不可删除」保护；删除到空即恢复内置
    // V1.3 A6: 通用兜底流程不可删除（getAllWorkflows 会自动补回，删除无意义且造成误解）
    window.deleteWorkflow = function(wfId) {
        const workflows = getAllWorkflows(currentOrg);
        const wf = workflows.find(w => w.id === wfId);
        if (!wf) return;
        if (wf.isGeneral === true) {
            showNotification('通用兜底流程不可删除（用户侧一步生成恒定展示）', 'warning');
            return;
        }
        const isBuiltinWf = !!wf.isBuiltin;
        // V1.3 A13: 只有真正从列表中消失的删除才需要清理关联引用。
        // 内置流程的「删除」语义是「移除自定义覆盖、恢复内置默认」，删除后该 id 仍在内置列表里，
        // 引用依然有效 —— 此时既不该提示「转为通用」，也不该清理（清理会误伤正常关联）。
        const willReallyDelete = !isBuiltinWf;
        const refs = willReallyDelete && (typeof countWorkflowRefs === 'function')
            ? countWorkflowRefs(currentOrg, wfId)
            : { templates: 0, prompts: 0 };
        const refText = (refs.templates || refs.prompts)
            ? '该流程被 ' + refs.templates + ' 个示例、' + refs.prompts + ' 个指令关联，删除后这些项将转为通用（对所有流程可见）。'
            : '';
        const confirmText = (isBuiltinWf
            ? '确定移除 workflow「' + wf.name + '」的自定义覆盖吗？移除后将恢复内置默认。'
            : '确定删除 workflow「' + wf.name + '」吗？此操作不可恢复。') + (refText ? ' ' + refText : '');

        showConfirm('删除 workflow', confirmText, () => {
            const next = workflows.filter(w => w.id !== wfId);
            saveAllWorkflows(currentOrg, next);   // 空数组 → getAllWorkflows 回落到内置
            // V1.3 A13: 剔除示例/指令中的失效引用（剔除后 workflowIds 为空即自动转为通用项）
            const purged = willReallyDelete && (typeof purgeWorkflowRefs === 'function')
                ? purgeWorkflowRefs(currentOrg, wfId)
                : { templates: 0, prompts: 0 };
            renderTable();
            let msg = isBuiltinWf ? '已恢复内置默认' : 'workflow 已删除';
            if (purged.templates || purged.prompts) {
                msg += '，' + purged.templates + ' 个示例、' + purged.prompts + ' 个指令已转为通用';
            }
            showNotification(msg, 'success');
        });
    };

    // ===== 确认弹窗 =====
    function showConfirm(title, text, onConfirm) {
        document.getElementById('confirmTitle').textContent = title;
        document.getElementById('confirmText').textContent = text;
        pendingConfirmAction = onConfirm;
        document.getElementById('confirmBtn').onclick = function() {
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

    // ===== 键盘 / 遮罩 =====
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            const wfModal = document.getElementById('wfModal');
            const confirmModal = document.getElementById('confirmModal');
            if (wfModal && wfModal.classList.contains('show')) closeWfModal();
            if (confirmModal && confirmModal.classList.contains('show')) closeConfirm();
        }
    });
    document.getElementById('wfModal').addEventListener('click', function(e) {
        if (e.target === this) closeWfModal();
    });
    document.getElementById('confirmModal').addEventListener('click', function(e) {
        if (e.target === this) closeConfirm();
    });

    // ===== 初始化 =====
    // A34: 先渲染上方文书类型区块，再渲染流程表（流程计数依赖类型，筛选下拉也需先就绪）
    function init() { renderDocTypes(); renderTable(); }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

// V1.3.36 数据统计分析功能——使用事件流模块（管理端与用户侧共用）
// 依据《数据统计分析功能PRD（V1.3.34）》§4（V1.3.36 起含对话模块 chatbot 指标）：
//  - adminUsageEvents 为统计唯一数据源，append-only：只写、不改、不删（删除业务实体不影响历史统计）
//  - 维度字段全部写时快照（法院名/用户名/案件名为字符串），实体删除或改名后历史事件原样保留
//  - 本模块不依赖 case-data.js；引用 case-data.js 的页面须保证本文件在其之前加载
(function () {
    'use strict';

    var EVENTS_KEY = 'adminUsageEvents';
    var SEED_FLAG_KEY = 'usageEventsSeeded_v1';
    var MAX_EVENTS = 10000; // 原型期容量保护：超过后停止写入并告警（正式版服务端落库，结构可直接平移）

    // 事件类型中文名（明细表/CSV 共用）
    var TYPE_LABELS = {
        case_create: '新建案件',
        doc_generate: '文书生成',
        chat_simple_qa: '简单问答',
        chatbot_use: 'chatbot 使用',
        chat_case_qa: '选中案件问答'
    };

    // 生成方式中文名（doc_generate 的 genMethod）
    var GEN_METHOD_LABELS = {
        material: '一步生成',
        steps: '分步生成',
        quick: '快速生成',
        batch: '批量生成'
    };

    // V1.3.36: 对话模块 chatbot 预设清单。
    // 不在文书流程管理（workflows.html）配置——真实环境由 AgentFlow 平台维护，
    // 原型内置仅用于统计页 chatbot 表展示、表一自定义列与种子数据。
    var CHATBOT_PRESETS = [
        { name: '执行裁定书', group: '办案任务' },
        { name: '文书AI评查', group: '办案任务' },
        { name: '裁判文书', group: '办案任务' },
        { name: '五步法二审文书', group: '办案任务' },
        { name: '公文写作流程', group: '通用任务' },
        { name: '案由生成', group: '通用任务' },
        { name: '庭审提纲', group: '通用任务' },
        { name: '类案检索', group: '通用任务' },
        { name: '法条适用', group: '通用任务' }
    ];

    // ===== 基础读写 =====

    function readUsageEvents() {
        try {
            var raw = localStorage.getItem(EVENTS_KEY);
            if (!raw) return [];
            var list = JSON.parse(raw);
            return Array.isArray(list) ? list : [];
        } catch (e) {
            console.error('[usage-events] 读取失败:', e);
            return [];
        }
    }

    function saveUsageEvents(list) {
        try {
            localStorage.setItem(EVENTS_KEY, JSON.stringify(list));
            return true;
        } catch (e) {
            console.error('[usage-events] 写入失败:', e);
            return false;
        }
    }

    function getUsageEventTypeLabel(type) {
        return TYPE_LABELS[type] || type || '';
    }

    function getGenMethodLabel(m) {
        return GEN_METHOD_LABELS[m] || m || '';
    }

    // ===== 采集入口（三处收口调用，见 PRD §4.2）=====
    // data: { type, caseId, caseName, docType, workflowId, workflowName, genMethod, taskName, question }
    // 用户侧无登录态：userId 置空、userName 取当前用户占位、courtId/deptId 置空（归「未归属」，仅超管可见）
    function recordUsageEvent(data) {
        try {
            if (!data || !data.type) return null;
            var list = readUsageEvents();
            if (list.length >= MAX_EVENTS) {
                console.warn('[usage-events] 事件数已达上限 ' + MAX_EVENTS + '，停止写入（原型期容量保护）');
                return null;
            }
            var evt = {
                id: 'evt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
                ts: Date.now(),
                type: data.type,
                source: 'real',
                userId: data.userId || '',
                userName: data.userName || (localStorage.getItem('currentUserName') || '当前用户'),
                courtId: data.courtId || '',
                courtName: data.courtName || '',
                deptId: data.deptId || '',
                deptName: data.deptName || '',
                caseId: data.caseId || '',
                caseName: data.caseName || '',
                docType: data.docType || '',
                workflowId: data.workflowId || '',
                workflowName: data.workflowName || '',
                genMethod: data.genMethod || '',
                taskName: data.taskName || '',
                question: data.question ? String(data.question).slice(0, 50) : '',
                result: 'success'
            };
            list.push(evt);
            saveUsageEvents(list);
            return evt;
        } catch (e) {
            // 采集失败绝不影响主链路（建案/保存/发送）
            console.error('[usage-events] 记录事件失败:', e);
            return null;
        }
    }

    // ===== 筛选与聚合（统计页用）=====

    // filters: { startTs, endTs, courtId, userId, userName, workflowName }
    // userId 用于真实账号（含已删除账号快照）；演示人名快照 userId 为空时按 userName 筛
    function filterUsageEvents(events, filters) {
        filters = filters || {};
        return (events || []).filter(function (e) {
            if (filters.startTs && e.ts < filters.startTs) return false;
            if (filters.endTs && e.ts > filters.endTs) return false;
            if (filters.courtId && (e.courtId || '') !== filters.courtId) return false;
            if (filters.userId && (e.userId || '') !== filters.userId) return false;
            if (filters.userName && (e.userName || '') !== filters.userName) return false;
            if (filters.workflowName && (e.workflowName || '') !== filters.workflowName) return false;
            return true;
        });
    }

    function _emptyCourtRow(courtId, courtName) {
        return {
            courtId: courtId, courtName: courtName,
            caseCreate: 0, docGenerate: 0, chatSimple: 0, chatCase: 0, total: 0
        };
    }

    // 表一·使用汇总（按组织机构）：行=法院（按合计降序），未归属（courtId 空）单列
    // chatbotCols: 表一自定义 chatbot 列名数组（V1.3.36；行上以 'cb:'+名 计次）
    function aggregateUsageByCourt(events, chatbotCols) {
        chatbotCols = Array.isArray(chatbotCols) ? chatbotCols : [];
        var map = {};
        (events || []).forEach(function (e) {
            var key = e.courtId || ('__none__' + (e.courtName || ''));
            if (!map[key]) {
                map[key] = _emptyCourtRow(e.courtId || '', e.courtName || '未归属');
                chatbotCols.forEach(function (name) { map[key]['cb:' + name] = 0; });
            }
            var row = map[key];
            if (e.type === 'case_create') row.caseCreate++;
            else if (e.type === 'doc_generate') row.docGenerate++;
            else if (e.type === 'chat_simple_qa') row.chatSimple++;
            else if (e.type === 'chat_case_qa') row.chatCase++;
            else if (e.type === 'chatbot_use' && chatbotCols.indexOf(e.taskName || '') >= 0) {
                row['cb:' + e.taskName]++;
            }
            row.total++;
        });
        var rows = Object.keys(map).map(function (k) { return map[k]; });
        rows.sort(function (a, b) { return b.total - a.total; });
        return rows;
    }

    // 表二·案件模块文书类型使用（V1.3.36 起替代 workflow 表）：仅 doc_generate，按 docType 分组降序
    // 名称映射由调用方经 getCurrentDocTypes() 完成（本模块不依赖 case-data.js）
    function aggregateUsageByDocType(events, docTotal) {
        var map = {};
        (events || []).forEach(function (e) {
            if (e.type !== 'doc_generate') return;
            var key = e.docType || '';
            if (!map[key]) map[key] = { docType: key, count: 0, lastTs: 0 };
            map[key].count++;
            if (e.ts > map[key].lastTs) map[key].lastTs = e.ts;
        });
        var rows = Object.keys(map).map(function (k) { return map[k]; });
        rows.sort(function (a, b) { return b.count - a.count; });
        var total = (typeof docTotal === 'number') ? docTotal : rows.reduce(function (s, r) { return s + r.count; }, 0);
        rows.forEach(function (r) {
            r.ratio = total > 0 ? (r.count / total * 100) : 0;
        });
        return rows;
    }

    // 表三·对话模块 chatbot 使用（V1.3.36）：仅 chatbot_use，预设全量展示（0 次也列），按次数降序
    function aggregateUsageByChatbot(events) {
        var map = {};
        (events || []).forEach(function (e) {
            if (e.type !== 'chatbot_use') return;
            var name = e.taskName || '';
            if (!map[name]) map[name] = { chatbot: name, count: 0, lastTs: 0 };
            map[name].count++;
            if (e.ts > map[name].lastTs) map[name].lastTs = e.ts;
        });
        var presetNames = CHATBOT_PRESETS.map(function (p) { return p.name; });
        var rows = CHATBOT_PRESETS.map(function (p) {
            var r = map[p.name] || { count: 0, lastTs: 0 };
            return { chatbot: p.name, group: p.group, count: r.count, lastTs: r.lastTs, ratio: 0 };
        });
        // 非预设名（异常/历史数据）补充展示，不丢弃
        Object.keys(map).forEach(function (name) {
            if (presetNames.indexOf(name) < 0) {
                rows.push({ chatbot: name, group: '其他', count: map[name].count, lastTs: map[name].lastTs, ratio: 0 });
            }
        });
        var total = rows.reduce(function (s, r) { return s + r.count; }, 0);
        rows.forEach(function (r) {
            r.ratio = total > 0 ? (r.count / total * 100) : 0;
        });
        rows.sort(function (a, b) { return b.count - a.count; });
        return rows;
    }

    // 汇总条：事件总数 / 活跃用户数 / 活跃法院数
    function summarizeUsage(events) {
        var users = {}, courts = {};
        (events || []).forEach(function (e) {
            var u = e.userId || e.userName;
            if (u) users[u] = 1;
            if (e.courtId) courts[e.courtId] = 1;
        });
        return {
            total: (events || []).length,
            activeUsers: Object.keys(users).length,
            activeCourts: Object.keys(courts).length
        };
    }

    // 明细行「详情」列文案（按类型）
    function getEventDetailText(e) {
        if (e.type === 'case_create') return '新建案件「' + (e.caseName || '') + '」';
        if (e.type === 'doc_generate') {
            var parts = [];
            if (e.caseName) parts.push(e.caseName);
            if (e.workflowName) parts.push(e.workflowName);
            if (e.genMethod) parts.push(getGenMethodLabel(e.genMethod));
            return parts.join(' · ');
        }
        if (e.type === 'chat_simple_qa') return e.question || '';
        if (e.type === 'chatbot_use') return e.taskName || '';
        if (e.type === 'chat_case_qa') {
            var p2 = [];
            if (e.caseName) p2.push(e.caseName);
            if (e.taskName) p2.push(e.taskName);
            return p2.join(' · ');
        }
        return '';
    }

    function _fmtTime(ts) {
        var d = new Date(ts);
        var p = function (n) { return (n < 10 ? '0' : '') + n; };
        return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
    }

    function _fmtDate(ts) {
        var d = new Date(ts);
        var p = function (n) { return (n < 10 ? '0' : '') + n; };
        return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
    }

    // ===== CSV 导出（UTF-8 BOM，Excel 不乱码）=====
    function usageEventsToCsv(events) {
        function esc(v) {
            var s = (v === null || v === undefined) ? '' : String(v);
            return '"' + s.replace(/"/g, '""') + '"';
        }
        var lines = ['时间,类型,用户,法院,部门,详情,来源'];
        (events || []).forEach(function (e) {
            lines.push([
                esc(_fmtTime(e.ts)),
                esc(getUsageEventTypeLabel(e.type)),
                esc(e.userName || ''),
                esc(e.courtName || '未归属'),
                esc(e.deptName || ''),
                esc(getEventDetailText(e)),
                esc(e.source === 'demo' ? '演示' : '实时')
            ].join(','));
        });
        return '\uFEFF' + lines.join('\r\n');
    }

    function downloadUsageCsv(events) {
        try {
            var csv = usageEventsToCsv(events);
            var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
            var now = new Date();
            var p = function (n) { return (n < 10 ? '0' : '') + n; };
            var fname = '数据统计_' + now.getFullYear() + p(now.getMonth() + 1) + p(now.getDate()) + '-' + p(now.getHours()) + p(now.getMinutes()) + '.csv';
            var a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = fname;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(a.href);
            return true;
        } catch (e) {
            console.error('[usage-events] 导出 CSV 失败:', e);
            return false;
        }
    }

    // ===== 演示种子数据（PRD §4.3）=====
    // 约 450 条、覆盖近 60 天：case_create 45 / doc_generate 180（一步100·分步45·快速25·批量10）
    // / chat_simple_qa 85 / chatbot_use 70（按 9 个预设分布，办案任务权重高）/ chat_case_qa 70；
    // 法院分布 中院40% 区基层35% 县基层15% 高院10%
    var DEMO_CASE_NAMES = [
        '张三诉李四民间借贷纠纷案', '广州某公司诉深圳某公司买卖合同纠纷案', '王五诉赵六房屋租赁合同纠纷案',
        '陈某与某科技有限公司劳动争议案', '刘某诉保险公司机动车交通事故责任纠纷案', '某银行诉周某民间借贷纠纷案',
        '某建筑公司诉某房地产公司建设工程施工合同纠纷案', '吴某诉郑某股权转让纠纷案', '林某与黄某离婚纠纷案',
        '马某诉某媒体公司名誉权纠纷案'
    ];
    var DEMO_QUESTIONS = [
        '简易程序的审理期限是多长？',
        '挪用公款罪的立案标准是什么？',
        '民事诉讼的举证期限是多久？',
        '起诉状应当记明哪些事项？',
        '执行异议应当在什么期限内提出？'
    ];
    // V1.3.36: chatbot 使用种子权重（办案任务权重高；名称取 CHATBOT_PRESETS）
    var DEMO_CHATBOT_WEIGHTS = {
        '执行裁定书': 18, '文书AI评查': 10, '裁判文书': 22, '五步法二审文书': 8,
        '公文写作流程': 6, '案由生成': 4, '庭审提纲': 4, '类案检索': 4, '法条适用': 4
    };
    // docType 兜底（流程 domain 为空时使用；取法院真实文书类型 key）
    var FALLBACK_DOC_TYPES = ['judgment', 'judgment', 'judgment', 'ruling', 'mediation', 'trial', 'execution', 'materialSummary'];
    // 法院管理员视图演示人名快照（非用户管理真实账号，userId 留空）
    var DEMO_PERSONAS = {
        court_m1: ['孙法官', '钱法官', '刘法官'],
        court_b2: ['郑法官', '冯法官'],
        court_h: ['陈法官', '褚法官']
    };
    // 吴某（已删除用户 person）：区基层·民事审判庭，4 类事件都有、集中前 40 天
    var DEMO_DELETED_USER = { userId: 'u9', userName: '吴某', courtId: 'court_b1', deptId: 'dept_003', deptName: '民事审判庭' };
    // 流程名兜底清单（getAllWorkflows 不可用时使用；优先取真实流程名）
    var FALLBACK_WORKFLOWS = [
        { id: 'wf-judgment-1st', name: '民事判决书（一审）', domain: 'judgment', w: 40 },
        { id: 'wf-judgment-2nd', name: '民事判决书（二审）', domain: 'judgment', w: 12 },
        { id: 'wf-judgment-direct', name: '民事判决书（直接生成）', domain: 'judgment', w: 14 },
        { id: 'wf-judgment-ruling', name: '民事裁定书', domain: 'ruling', w: 8 },
        { id: 'wf-judgment-mediation', name: '民事调解书', domain: 'mediation', w: 6 },
        { id: 'wf-trial-outline', name: '庭审提纲', domain: 'trial', w: 8 },
        { id: 'wf-judgment-quick', name: '民事判决书', domain: 'judgment', w: 8 },
        { id: 'wf-general-doc', name: '通用文书生成', domain: '', w: 4 }
    ];

    function _pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

    function _pickWeighted(items, weightFn) {
        var total = items.reduce(function (s, it) { return s + (weightFn(it) || 0); }, 0);
        var r = Math.random() * total;
        for (var i = 0; i < items.length; i++) {
            r -= (weightFn(items[i]) || 0);
            if (r <= 0) return items[i];
        }
        return items[items.length - 1];
    }

    // 法院分布权重（中院40% 区基层35% 县基层15% 高院10%）
    function _courtWeights(courts) {
        var byId = {};
        courts.forEach(function (c) { byId[c.id] = c; });
        var w = {
            court_m1: 40, court_b1: 35, court_b2: 15, court_h: 10
        };
        // 法院树被删改过时按存量均摊，保证种子仍可生成
        var known = courts.filter(function (c) { return w[c.id]; });
        var pool = known.length > 0 ? known : courts;
        var weights = {};
        pool.forEach(function (c) { weights[c.id] = w[c.id] || Math.floor(100 / pool.length); });
        return { pool: pool, weights: weights };
    }

    // 近 60 天日期采样：工作日约 70%、周末稀疏、按周缓升、最近 7 天加密
    function _sampleDayTs() {
        var now = new Date();
        var pool = [];
        for (var d = 59; d >= 0; d--) {
            var day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - d);
            var dow = day.getDay();
            var w = (dow === 0 || dow === 6) ? 0.3 : 1.0;
            if (d < 7) w *= 1.6;            // 最近 7 天加密
            else if (d < 30) w *= 1.0;
            else w *= 0.7;                  // 前段稀疏
            w *= 1 + 0.08 * (60 - d) / 60;  // 按月缓升
            var copies = Math.max(1, Math.round(w * 10));
            for (var k = 0; k < copies; k++) pool.push(d);
        }
        var dOff = _pick(pool);
        var day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dOff);
        day.setHours(8 + Math.floor(Math.random() * 11), Math.floor(Math.random() * 60), 0, 0);
        return day.getTime();
    }

    function _getWorkflowPool() {
        var list = [];
        if (typeof window.getAllWorkflows === 'function') {
            try {
                list = (window.getAllWorkflows('court') || []).filter(function (w) { return w && w.name; });
            } catch (e) { list = []; }
        }
        if (list.length === 0) {
            list = FALLBACK_WORKFLOWS.map(function (w) {
                return { id: w.id, name: w.name, domain: w.domain, _w: w.w };
            });
            return list;
        }
        // 真实流程统一权重（判决书类略高）
        list.forEach(function (w) {
            w._w = /判决书/.test(w.name) ? 10 : 5;
        });
        return list;
    }

    function seedDemoUsageEvents() {
        var courts = [];
        try {
            courts = JSON.parse(localStorage.getItem('adminCourtTree') || 'null') || [];
        } catch (e) { courts = []; }
        if (!Array.isArray(courts) || courts.length === 0) {
            courts = [
                { id: 'court_h', name: '某省高级人民法院', level: '高级', parentId: null },
                { id: 'court_m1', name: '某市中级人民法院', level: '中级', parentId: 'court_h' },
                { id: 'court_b1', name: '某区基层人民法院', level: '基层', parentId: 'court_m1' },
                { id: 'court_b2', name: '某县基层人民法院', level: '基层', parentId: 'court_m1' }
            ];
        }
        var cw = _courtWeights(courts);
        var courtById = {};
        courts.forEach(function (c) { courtById[c.id] = c; });

        // 区基层挂用户管理真实用户（u1~u5，部门取其真实 dept）；无真实用户时退回演示人名
        var realUsers = [];
        try {
            var adminUsers = JSON.parse(localStorage.getItem('adminUsers') || 'null') || [];
            if (Array.isArray(adminUsers)) {
                realUsers = adminUsers.filter(function (u) {
                    return u && u.id && u.courtId === 'court_b1' && u.role !== 'super_admin';
                });
            }
        } catch (e) { realUsers = []; }
        if (realUsers.length === 0) {
            realUsers = [
                { id: 'u1', name: '张三', dept: '刑事审判庭', deptId: 'dept_002' },
                { id: 'u2', name: '李四', dept: '民事审判庭', deptId: 'dept_003' },
                { id: 'u3', name: '王五', dept: '执行局', deptId: 'dept_005' }
            ];
        }

        var workflows = _getWorkflowPool();
        var events = [];

        function pickCourt() { return _pickWeighted(cw.pool, function (c) { return cw.weights[c.id]; }); }

        // 维度归属：法院 → 用户快照；吴某仅前 40 天出现（模拟已删除用户历史仍在）
        function pickActor(court, ts) {
            var dayIdx = Math.floor((Date.now() - ts) / 86400000);
            if (court.id === 'court_b1' && dayIdx < 40 && Math.random() < 0.3) {
                return {
                    userId: DEMO_DELETED_USER.userId, userName: DEMO_DELETED_USER.userName,
                    deptId: DEMO_DELETED_USER.deptId, deptName: DEMO_DELETED_USER.deptName
                };
            }
            if (court.id === 'court_b1') {
                var u = _pick(realUsers);
                return { userId: u.id, userName: u.name, deptId: u.deptId || '', deptName: u.dept || '' };
            }
            var personas = DEMO_PERSONAS[court.id] || ['演示用户'];
            return { userId: '', userName: _pick(personas), deptId: '', deptName: '' };
        }

        function base(type, court, ts) {
            var actor = pickActor(court, ts);
            return {
                id: 'evt_demo_' + (events.length + 1) + '_' + Math.random().toString(36).slice(2, 6),
                ts: ts,
                type: type,
                source: 'demo',
                userId: actor.userId,
                userName: actor.userName,
                courtId: court.id,
                courtName: court.name,
                deptId: actor.deptId,
                deptName: actor.deptName,
                caseId: '', caseName: '', docType: '',
                workflowId: '', workflowName: '', genMethod: '',
                taskName: '', question: '', result: 'success'
            };
        }

        function genCaseCreate(n) {
            for (var i = 0; i < n; i++) {
                var e = base('case_create', pickCourt(), _sampleDayTs());
                e.caseId = 'demo_case_' + (i + 1);
                e.caseName = _pick(DEMO_CASE_NAMES);
                events.push(e);
            }
        }

        function genDocGenerate(n) {
            // 一步 100 / 分步 45 / 快速 25 / 批量 10
            var plan = [['material', 100], ['steps', 45], ['quick', 25], ['batch', 10]];
            var queue = [];
            plan.forEach(function (p) { for (var i = 0; i < p[1]; i++) queue.push(p[0]); });
            for (var i = 0; i < n && i < queue.length; i++) {
                var e = base('doc_generate', pickCourt(), _sampleDayTs());
                var wf = _pickWeighted(workflows, function (w) { return w._w; });
                e.caseId = 'demo_case_' + (Math.floor(Math.random() * 10) + 1);
                e.caseName = _pick(DEMO_CASE_NAMES);
                // docType 取流程 domain；domain 为空（如通用兜底流程）时兜底真实文书类型
                e.docType = wf.domain || _pick(FALLBACK_DOC_TYPES);
                e.workflowId = wf.id || '';
                e.workflowName = wf.name || '';
                e.genMethod = queue[i];
                events.push(e);
            }
        }

        function genChatSimple(n) {
            for (var i = 0; i < n; i++) {
                var e = base('chat_simple_qa', pickCourt(), _sampleDayTs());
                e.question = DEMO_QUESTIONS[i % DEMO_QUESTIONS.length];
                events.push(e);
            }
        }

        // V1.3.36: chatbot 使用（按预设权重抽样；互斥分流后 chat_case_qa 不再带任务）
        function genChatbotUse(n) {
            for (var i = 0; i < n; i++) {
                var e = base('chatbot_use', pickCourt(), _sampleDayTs());
                e.taskName = _pickWeighted(CHATBOT_PRESETS, function (p) { return DEMO_CHATBOT_WEIGHTS[p.name] || 1; }).name;
                events.push(e);
            }
        }

        function genChatCase(n) {
            for (var i = 0; i < n; i++) {
                var e = base('chat_case_qa', pickCourt(), _sampleDayTs());
                e.caseName = _pick(DEMO_CASE_NAMES);
                events.push(e);
            }
        }

        genCaseCreate(45);
        genDocGenerate(180);
        genChatSimple(85);
        genChatbotUse(70);
        genChatCase(70);

        // 合并：演示事件统一排在实时事件之后，按时间倒序存储（读取端不依赖顺序）
        var list = readUsageEvents().concat(events);
        saveUsageEvents(list);
        try { localStorage.setItem(SEED_FLAG_KEY, '1'); } catch (e2) { /* ignore */ }
        return events.length;
    }

    // 重置演示数据：删除全部 source:'demo' 事件后按当前日期重新生成（实时事件保留）
    function resetDemoUsageEvents() {
        var list = readUsageEvents().filter(function (e) { return e.source !== 'demo'; });
        saveUsageEvents(list);
        try { localStorage.removeItem(SEED_FLAG_KEY); } catch (e) { /* ignore */ }
        return seedDemoUsageEvents();
    }

    // 首次进统计页且无 flag 时生成一次性演示数据
    function ensureDemoUsageSeeded() {
        try {
            if (localStorage.getItem(SEED_FLAG_KEY)) return 0;
        } catch (e) { /* ignore */ }
        return seedDemoUsageEvents();
    }

    // ===== 导出（浏览器全局 + CommonJS 双通道，便于 node vm 单测）=====
    var api = {
        EVENTS_KEY: EVENTS_KEY,
        SEED_FLAG_KEY: SEED_FLAG_KEY,
        MAX_EVENTS: MAX_EVENTS,
        TYPE_LABELS: TYPE_LABELS,
        GEN_METHOD_LABELS: GEN_METHOD_LABELS,
        CHATBOT_PRESETS: CHATBOT_PRESETS,
        readUsageEvents: readUsageEvents,
        saveUsageEvents: saveUsageEvents,
        recordUsageEvent: recordUsageEvent,
        getUsageEventTypeLabel: getUsageEventTypeLabel,
        getGenMethodLabel: getGenMethodLabel,
        filterUsageEvents: filterUsageEvents,
        aggregateUsageByCourt: aggregateUsageByCourt,
        aggregateUsageByDocType: aggregateUsageByDocType,
        aggregateUsageByChatbot: aggregateUsageByChatbot,
        summarizeUsage: summarizeUsage,
        getEventDetailText: getEventDetailText,
        usageEventsToCsv: usageEventsToCsv,
        downloadUsageCsv: downloadUsageCsv,
        seedDemoUsageEvents: seedDemoUsageEvents,
        resetDemoUsageEvents: resetDemoUsageEvents,
        ensureDemoUsageSeeded: ensureDemoUsageSeeded
    };

    if (typeof window !== 'undefined') {
        for (var k in api) window[k] = api[k];
    }
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})();

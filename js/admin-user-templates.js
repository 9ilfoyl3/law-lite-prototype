/**
 * 管理端 - 用户模板检索（清单第 27 项）
 *
 * 定位：数据统计 + 只读查看，不做任何写操作。
 *  - 按法官（姓名 / 工号）检索其自建的模板、指令、要件
 *  - 顶部统计 + 按案由分布（识别"官方无模板但法官已自建"的收编缺口）
 *  - 详情走右侧抽屉，只读；收编动作由管理员复制内容后到官方库新建
 *
 * 数据来源：js/mock-user-templates.js（原型阶段 mock，真实环境改为后端接口）
 */
(function () {
    'use strict';

    var M = window.MockUserTemplates;

    // 当前状态
    var currentJudges = [];   // 命中的法官列表
    var currentJudgeId = '';  // 当前选中的法官
    var currentTab = 'template'; // template | prompt | element

    function esc(s) {
        return String(s === undefined || s === null ? '' : s)
            .replace(/[<>&"']/g, function (c) {
                return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c];
            });
    }

    function $(id) { return document.getElementById(id); }

    function wordCount(text) {
        var n = (text || '').replace(/\s/g, '').length;
        return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n);
    }

    // ===== 初始化 =====
    function init() {
        if (!M) {
            var box = $('resultBox');
            if (box) box.innerHTML = '<div class="empty-state"><i class="fas fa-triangle-exclamation"></i>' +
                '<div class="es-title">mock 数据未加载</div>' +
                '<div class="es-sub">请确认 js/mock-user-templates.js 已引入</div></div>';
            return;
        }
        renderDeptOptions();
        renderStats();
        renderCauseDistribution();
        renderEmptyResult('输入法官姓名或工号开始检索');
    }

    function renderDeptOptions() {
        var sel = $('deptFilter');
        if (!sel) return;
        M.getDepartments().forEach(function (d) {
            var opt = document.createElement('option');
            opt.value = d;
            opt.textContent = d;
            sel.appendChild(opt);
        });
    }

    // ===== 顶部统计卡 =====
    function renderStats() {
        var ov = M.getOverview();
        var cards = [
            { label: '建了模板的法官', value: ov.judgesWithTemplate, sub: '共 ' + ov.judgeCount + ' 名法官', accent: true },
            { label: '文书模板总数', value: ov.templateCount, sub: '法官自建' },
            { label: '指令总数', value: ov.promptCount, sub: '法官自建' },
            { label: '要件总数', value: ov.elementCount, sub: '法官自建' }
        ];
        $('statGrid').innerHTML = cards.map(function (c) {
            return '<div class="stat-card">' +
                '<div class="stat-label">' + esc(c.label) + '</div>' +
                '<div class="stat-value' + (c.accent ? ' accent' : '') + '">' + c.value + '</div>' +
                '<div class="stat-sub">' + esc(c.sub) + '</div>' +
                '</div>';
        }).join('');
    }

    // ===== 分布统计 =====
    // 维度对齐真实数据模型：模板 / 指令挂在【文书类型】下（本身不绑案由），要件按【案由】索引
    var currentDistTab = 'docType'; // docType | cause

    function renderCauseDistribution() { renderDistribution(); }

    function switchDistTab(tab) {
        currentDistTab = tab;
        currentDistPage = 1;
        var b1 = $('distTabDocType'), b2 = $('distTabCause');
        if (b1) b1.classList.toggle('active', tab === 'docType');
        if (b2) b2.classList.toggle('active', tab === 'cause');
        renderDistribution();
    }

    function renderDistribution() {
        if (currentDistTab === 'docType') renderDocTypeDist();
        else renderElementCauseDist();
    }

    // 涉及法官：只显示数量，点击弹层查看名单（法官多时标签列会撑爆）
    function judgeCountCell(names) {
        if (!names || !names.length) return '<span class="judge-count-zero">—</span>';
        var joined = names.map(function (n) { return esc(n); }).join('|');
        return '<span class="judge-count-link" onclick="AdminUserTemplates.openJudgeList(\'' + joined + '\')" title="点击查看法官名单">' +
            '<i class="fas fa-users"></i> ' + names.length + ' 名</span>';
    }

    // ===== 分页 =====
    var DIST_PAGE_SIZE = 10;
    var currentDistPage = 1;

    function distSlice(list) {
        var maxPage = Math.max(1, Math.ceil(list.length / DIST_PAGE_SIZE));
        if (currentDistPage > maxPage) currentDistPage = maxPage;
        if (currentDistPage < 1) currentDistPage = 1;
        var start = (currentDistPage - 1) * DIST_PAGE_SIZE;
        return { rows: list.slice(start, start + DIST_PAGE_SIZE), page: currentDistPage, maxPage: maxPage };
    }

    function distPager(total, page, maxPage) {
        if (total <= DIST_PAGE_SIZE) {
            return '<div class="pager"><span class="pager-info">共 ' + total + ' 条</span></div>';
        }
        return '<div class="pager">' +
            '<span class="pager-info">共 ' + total + ' 条 · 第 ' + page + ' / ' + maxPage + ' 页</span>' +
            '<button class="pager-btn" onclick="AdminUserTemplates.distPage(' + (page - 1) + ')"' +
            (page <= 1 ? ' disabled' : '') + '>上一页</button>' +
            '<button class="pager-btn" onclick="AdminUserTemplates.distPage(' + (page + 1) + ')"' +
            (page >= maxPage ? ' disabled' : '') + '>下一页</button>' +
            '</div>';
    }

    function distPage(p) {
        currentDistPage = p;
        renderDistribution();
    }

    // ===== 涉及法官名单弹层 =====
    function openJudgeList(namesStr) {
        var names = (namesStr || '').split('|').filter(Boolean);
        $('jlmTitle').textContent = '涉及法官（' + names.length + ' 名）';
        $('jlmBody').innerHTML = names.map(function (n) {
            var j = M.judges.filter(function (x) { return x.name === n; })[0] || {};
            return '<div class="jlm-item" onclick="AdminUserTemplates.pickJudge(\'' + esc(n) + '\')">' +
                '<span class="jlm-name">' + esc(n) + '</span>' +
                '<span class="jlm-dept">' + esc(j.dept || '') + ' · ' + esc(j.id || '') + '</span>' +
                '</div>';
        }).join('');
        $('judgeListModal').classList.add('show');
        $('judgeListOverlay').classList.add('show');
    }

    function closeJudgeList() {
        $('judgeListModal').classList.remove('show');
        $('judgeListOverlay').classList.remove('show');
    }

    function pickJudge(name) {
        closeJudgeList();
        quickSearch(name);
    }

    // 模板 / 指令 按文书类型分布
    function renderDocTypeDist() {
        var list = M.getDocTypeDistribution();
        var gapCount = list.filter(function (r) { return r.isGap; }).length;

        var html = '<div style="font-size:12px;color:var(--text-secondary);margin-bottom:10px;">' +
            '模板与指令挂在<b>文书类型</b>下，案由由文书类型承载。共 ' + list.length +
            ' 个文书类型，其中 <b style="color:#92400e;">' + gapCount + '</b> 个官方尚无标准模板但法官已自建（高亮行）</div>';

        html += '<table class="dist-table"><thead><tr>' +
            '<th>文书类型</th>' +
            '<th>匹配案由</th>' +
            '<th class="num-cell">官方模板</th>' +
            '<th class="num-cell">法官模板</th>' +
            '<th class="num-cell">法官指令</th>' +
            '<th>涉及法官</th>' +
            '<th style="width:150px;">状态</th>' +
            '</tr></thead><tbody>';

        var sl = distSlice(list);
        sl.rows.forEach(function (r) {
            var causes = r.causes.length
                ? r.causes.map(function (c) { return '<span class="judge-tag">' + esc(c) + '</span>'; }).join('')
                : '<span style="color:var(--text-muted);">—</span>';

            html += '<tr class="' + (r.isGap ? 'gap-row' : '') + '">' +
                '<td class="cause-name">' + esc(r.docType) + '</td>' +
                '<td><div class="judge-tags">' + causes + '</div></td>' +
                '<td class="num-cell' + (r.isGeneral ? '' : (r.officialCount === 0 ? ' num-zero' : '')) + '">' +
                    (r.isGeneral ? '—' : r.officialCount) + '</td>' +
                '<td class="num-cell' + (r.templateCount === 0 ? ' num-zero' : '') + '">' + r.templateCount + '</td>' +
                '<td class="num-cell' + (r.promptCount === 0 ? ' num-zero' : '') + '">' + r.promptCount + '</td>' +
                '<td>' + judgeCountCell(r.judgeNames) + '</td>' +
                '<td>' + (r.isGeneral
                    ? '<span class="ok-badge">通用指令</span>'
                    : (r.isGap
                        ? '<span class="gap-badge">无官方模板 · 可收编</span>'
                        : '<span class="ok-badge">已有官方模板</span>')) + '</td>' +
                '</tr>';
        });

        html += '</tbody></table>' + distPager(list.length, sl.page, sl.maxPage);
        $('causeDistBox').innerHTML = html;
    }

    // 要件 按案由分布
    function renderElementCauseDist() {
        var list = M.getElementCauseDistribution();
        var gapCount = list.filter(function (r) { return r.isGap; }).length;

        var html = '<div style="font-size:12px;color:var(--text-secondary);margin-bottom:10px;">' +
            '要件按<b>案由</b>组织。共 ' + list.length +
            ' 个案由，其中 <b style="color:#92400e;">' + gapCount + '</b> 个官方尚无标准要件但法官已自建（高亮行）</div>';

        html += '<table class="dist-table"><thead><tr>' +
            '<th>案由</th>' +
            '<th class="num-cell">官方要件</th>' +
            '<th class="num-cell">法官要件</th>' +
            '<th>涉及法官</th>' +
            '<th style="width:150px;">状态</th>' +
            '</tr></thead><tbody>';

        var sl2 = distSlice(list);
        sl2.rows.forEach(function (r) {
            html += '<tr class="' + (r.isGap ? 'gap-row' : '') + '">' +
                '<td class="cause-name">' + esc(r.cause) + '</td>' +
                '<td class="num-cell' + (r.officialCount === 0 ? ' num-zero' : '') + '">' + r.officialCount + '</td>' +
                '<td class="num-cell' + (r.elementCount === 0 ? ' num-zero' : '') + '">' + r.elementCount + '</td>' +
                '<td>' + judgeCountCell(r.judgeNames) + '</td>' +
                '<td>' + (r.isGap
                    ? '<span class="gap-badge">无官方要件 · 可收编</span>'
                    : '<span class="ok-badge">已有官方要件</span>') + '</td>' +
                '</tr>';
        });

        html += '</tbody></table>' + distPager(list.length, sl2.page, sl2.maxPage);
        $('causeDistBox').innerHTML = html;
    }

    // ===== 检索 =====
    function search() {
        var kw = ($('judgeKeyword').value || '').trim();
        var dept = $('deptFilter').value;

        if (!kw) {
            renderEmptyResult('请先输入法官姓名或工号', '例如：王建国 或 F001');
            return;
        }

        currentJudges = M.searchJudges(kw, dept);

        if (!currentJudges.length) {
            currentJudgeId = '';
            renderEmptyResult('未找到该法官', '请检查姓名或工号是否正确，或切换部门筛选');
            return;
        }

        currentJudgeId = currentJudges[0].id;
        currentTab = 'template';
        renderResult();
    }

    function quickSearch(name) {
        $('judgeKeyword').value = name;
        $('deptFilter').value = 'all';
        search();
        var panel = document.querySelector('.panel:last-of-type');
        if (panel && panel.scrollIntoView) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function reset() {
        $('judgeKeyword').value = '';
        $('deptFilter').value = 'all';
        currentJudges = [];
        currentJudgeId = '';
        renderEmptyResult('输入法官姓名或工号开始检索');
    }

    function renderEmptyResult(title, sub) {
        $('resultBox').innerHTML = '<div class="empty-state">' +
            '<i class="fas fa-search"></i>' +
            '<div class="es-title">' + esc(title) + '</div>' +
            (sub ? '<div class="es-sub">' + esc(sub) + '</div>' : '') +
            '</div>';
    }

    // ===== 检索结果：法官卡片 + Tab + 列表 =====
    function renderResult() {
        var judge = currentJudges.filter(function (j) { return j.id === currentJudgeId; })[0];
        if (!judge) { renderEmptyResult('未找到该法官'); return; }

        var tplN = (judge.templates || []).length;
        var pmtN = (judge.prompts || []).length;
        var elmN = (judge.elements || []).length;

        var html = '<div class="judge-list">';
        currentJudges.forEach(function (j) {
            html += '<div class="judge-card' + (j.id === currentJudgeId ? ' active' : '') + '" onclick="AdminUserTemplates.selectJudge(\'' + j.id + '\')">' +
                '<div class="jc-name">' + esc(j.name) + '<span class="jc-title">' + esc(j.title || '') + '</span></div>' +
                '<div class="jc-meta">' + esc(j.dept) + ' · ' + esc(j.id) + '</div>' +
                '<div class="jc-counts">模板 ' + (j.templates || []).length + ' · 指令 ' + (j.prompts || []).length + ' · 要件 ' + (j.elements || []).length + '</div>' +
                '</div>';
        });
        html += '</div>';

        html += '<div class="item-subtabs" style="margin-top:16px;">' +
            '<button class="item-subtab' + (currentTab === 'template' ? ' active' : '') + '" onclick="AdminUserTemplates.switchTab(\'template\')"><i class="fas fa-file-alt"></i> 文书模板 <span class="tab-count">' + tplN + '</span></button>' +
            '<button class="item-subtab' + (currentTab === 'prompt' ? ' active' : '') + '" onclick="AdminUserTemplates.switchTab(\'prompt\')"><i class="fas fa-comment-dots"></i> 指令 <span class="tab-count">' + pmtN + '</span></button>' +
            '<button class="item-subtab' + (currentTab === 'element' ? ' active' : '') + '" onclick="AdminUserTemplates.switchTab(\'element\')"><i class="fas fa-puzzle-piece"></i> 要件 <span class="tab-count">' + elmN + '</span></button>' +
            '</div>';

        html += renderItemTable(judge);
        $('resultBox').innerHTML = html;
    }

    function selectJudge(id) {
        currentJudgeId = id;
        renderResult();
    }

    function switchTab(tab) {
        currentTab = tab;
        renderResult();
    }

    // 三 Tab 各自渲染（数据结构差异大，不共用一套列）
    function renderItemTable(judge) {
        if (currentTab === 'template') return renderTemplates(judge);
        if (currentTab === 'prompt') return renderPrompts(judge);
        return renderElements(judge);
    }

    function renderTemplates(judge) {
        var list = judge.templates || [];
        if (!list.length) return emptyRow('该法官暂无自建文书模板');

        var rows = list.map(function (t) {
            return '<tr onclick="AdminUserTemplates.openDrawer(\'' + judge.id + '\',\'template\',\'' + t.id + '\')">' +
                '<td><div class="item-name">' + esc(t.name) + '</div>' +
                '<div class="item-sub">' + esc((t.content || '').replace(/\n/g, ' ').slice(0, 60)) + '…</div></td>' +
                '<td class="meta-cell">' + esc(t.docType || '-') + '</td>' +
                '<td class="meta-cell">' + wordCount(t.content) + '</td>' +
                '<td class="meta-cell">' + esc(t.updatedAt || '-') + '</td>' +
                '<td class="meta-cell"><span class="status-badge ' + (t.enabled ? 'on' : 'off') + '">' + (t.enabled ? '已启用' : '已停用') + '</span></td>' +
                '</tr>';
        }).join('');

        return '<table class="item-table"><thead><tr>' +
            '<th>模板名称</th><th>文书类型</th><th>字数</th><th>更新时间</th><th>状态</th>' +
            '</tr></thead><tbody>' + rows + '</tbody></table>';
    }

    function renderPrompts(judge) {
        var list = judge.prompts || [];
        if (!list.length) return emptyRow('该法官暂无自建指令');

        var rows = list.map(function (p) {
            return '<tr onclick="AdminUserTemplates.openDrawer(\'' + judge.id + '\',\'prompt\',\'' + p.id + '\')">' +
                '<td><div class="item-name">' + esc(p.name) + '</div>' +
                '<div class="item-sub">' + esc((p.content || '').slice(0, 60)) + '…</div></td>' +
                '<td class="meta-cell">' + esc(p.docType || '通用') + '</td>' +
                '<td class="meta-cell">' + wordCount(p.content) + '</td>' +
                '<td class="meta-cell">' + esc(p.updatedAt || '-') + '</td>' +
                '</tr>';
        }).join('');

        return '<table class="item-table"><thead><tr>' +
            '<th>指令名称</th><th>适用文书类型</th><th>字数</th><th>更新时间</th>' +
            '</tr></thead><tbody>' + rows + '</tbody></table>';
    }

    function renderElements(judge) {
        var list = judge.elements || [];
        if (!list.length) return emptyRow('该法官暂无自建要件');

        var rows = list.map(function (e) {
            var words = (e.caseWords || []).map(function (w) {
                return '<span class="judge-tag">' + esc(w) + '</span>';
            }).join('') || '<span style="color:var(--text-muted);">—</span>';

            return '<tr onclick="AdminUserTemplates.openDrawer(\'' + judge.id + '\',\'element\',\'' + e.id + '\')">' +
                '<td><div class="item-name">' + esc(e.name) + '</div>' +
                '<div class="item-sub">' + esc(e.question || '') + '</div></td>' +
                '<td class="meta-cell">' + esc(e.cause || '-') + '</td>' +
                '<td><div class="judge-tags">' + words + '</div></td>' +
                '<td class="meta-cell">' + esc(e.updatedAt || '-') + '</td>' +
                '</tr>';
        }).join('');

        return '<table class="item-table"><thead><tr>' +
            '<th>要件名称</th><th>案由</th><th>适用案字</th><th>更新时间</th>' +
            '</tr></thead><tbody>' + rows + '</tbody></table>';
    }

    function emptyRow(text) {
        return '<div class="empty-state" style="padding:36px 20px;">' +
            '<i class="fas fa-inbox"></i>' +
            '<div class="es-title">' + esc(text) + '</div></div>';
    }

    // ===== 详情抽屉（只读）=====
    function openDrawer(judgeId, type, itemId) {
        var judge = M.judges.filter(function (j) { return j.id === judgeId; })[0];
        if (!judge) return;

        var item = null;
        if (type === 'template') item = (judge.templates || []).filter(function (x) { return x.id === itemId; })[0];
        else if (type === 'prompt') item = (judge.prompts || []).filter(function (x) { return x.id === itemId; })[0];
        else item = (judge.elements || []).filter(function (x) { return x.id === itemId; })[0];
        if (!item) return;

        $('drawerName').textContent = item.name || '-';

        var meta = ['<span><i class="fas fa-user"></i> ' + esc(judge.name) + '（' + esc(judge.dept) + '）</span>'];
        if (type === 'template') {
            var dt = item.docType || '-';
            meta.push('<span>文书类型：' + esc(dt) + '</span>');
            var cs = (M.docTypeCauses && M.docTypeCauses[dt]) || [];
            meta.push('<span>该类型匹配案由：' + (cs.length ? esc(cs.join('、')) : '通用') + '</span>');
            meta.push('<span>状态：' + (item.enabled ? '已启用' : '已停用') + '</span>');
        } else if (type === 'prompt') {
            meta.push('<span>适用文书类型：' + esc(item.docType || '通用') + '</span>');
        } else {
            meta.push('<span>案由：' + esc(item.cause || '-') + '</span>');
            if ((item.caseWords || []).length) {
                meta.push('<span>适用案字：' + esc((item.caseWords || []).join('、')) + '</span>');
            }
        }
        meta.push('<span>更新：' + esc(item.updatedAt || '-') + '</span>');
        $('drawerMeta').innerHTML = meta.join('');

        // 正文：模板/指令用 content，要件用 question
        $('drawerContent').textContent = (type === 'element' ? (item.question || '') : (item.content || '')) || '（无内容）';

        $('itemDrawer').classList.add('show');
        $('drawerOverlay').classList.add('show');
    }

    function closeDrawer() {
        $('itemDrawer').classList.remove('show');
        $('drawerOverlay').classList.remove('show');
    }

    // ESC 关闭抽屉 / 法官名单弹层
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { closeDrawer(); closeJudgeList(); }
    });

    document.addEventListener('DOMContentLoaded', init);

    window.AdminUserTemplates = {
        search: search,
        reset: reset,
        selectJudge: selectJudge,
        switchTab: switchTab,
        switchDistTab: switchDistTab,
        distPage: distPage,
        quickSearch: quickSearch,
        openJudgeList: openJudgeList,
        closeJudgeList: closeJudgeList,
        pickJudge: pickJudge,
        openDrawer: openDrawer,
        closeDrawer: closeDrawer
    };
})();

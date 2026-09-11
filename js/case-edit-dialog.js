// ============ 案件信息编辑弹框公共组件（V1.2.10）============
// 详情页与列表页共用。详情页从提示条【去修改】调用，列表页后续迁移。
// 依赖：case-data.js（案由库 / 案字表 / 承办人 / 案件查找）+ common.js（showNotification）。
// 入口：openCaseEditDialog(caseId, opts)，opts.onSaved(caseItem) 保存后回调。
// 自动注入 DOM（幂等），不影响调用方页面结构。

(function () {
    'use strict';

    const ROOT_ID = 'caseEditDialogRoot';
    const PREFIX = 'ced_';   // 公共组件 DOM id 前缀，避免与 cases.html 原 editDialog 冲突

    let currentCaseId = '';
    let onSavedCallback = null;
    let causeSelectorValue = '';   // 案由树弹窗内当前选中值

    function $(id) { return document.getElementById(PREFIX + id); }
    function $n(id) { return document.getElementById(id); }  // 公共无前缀 id（不重名）

    // ---- DOM 注入（幂等） ----
    function ensureDom() {
        if (document.getElementById(ROOT_ID)) return;
        const root = document.createElement('div');
        root.id = ROOT_ID;
        root.innerHTML = '' +
            // 案由树弹窗（公共，仅一份）
            '<div class="cause-selector-modal" id="' + PREFIX + 'causeSelectorModal" onclick="closeCaseEditCauseSelector(event)">' +
            '    <div class="cause-selector-content" onclick="event.stopPropagation()">' +
            '        <div class="cause-selector-header">' +
            '            <h3><i class="fas fa-sitemap"></i> 选择案由</h3>' +
            '            <button class="cause-selector-close" onclick="closeCaseEditCauseSelector()"><i class="fas fa-times"></i></button>' +
            '        </div>' +
            '        <div class="cause-selector-body">' +
            '            <div class="cause-selector-search">' +
            '                <input type="text" id="' + PREFIX + 'causeSearchInput" placeholder="搜索案由……" oninput="filterCaseEditCauseTree()">' +
            '            </div>' +
            '            <div class="cause-tree" id="' + PREFIX + 'causeTreeContainer"></div>' +
            '        </div>' +
            '    </div>' +
            '</div>';
        document.body.appendChild(root);
    }

    function ensureDialog() {
        if ($n('caseEditOverlay')) return;
        ensureDom();
        const dialogWrap = document.createElement('div');
        dialogWrap.innerHTML = '' +
            '<div class="modal-overlay" id="caseEditOverlay" onclick="closeCaseEditDialog()" style="z-index:520;"></div>' +
            '<div class="modal-dialog" id="caseEditDialog" style="z-index:521;">' +
            '    <div class="modal-header">' +
            '        <h3><i class="fas fa-edit"></i> 编辑案件信息</h3>' +
            '        <button class="modal-close" onclick="closeCaseEditDialog()"><i class="fas fa-times"></i></button>' +
            '    </div>' +
            '    <div class="modal-body">' +
            '        <div class="modal-form-row">' +
            '            <label class="modal-form-label required">案件名称</label>' +
            '            <input type="text" class="modal-form-input" id="ced_name" placeholder="请输入案件名称">' +
            '        </div>' +
            '        <div class="modal-form-row">' +
            '            <label class="modal-form-label">案号</label>' +
            '            <input type="text" class="modal-form-input" id="ced_number" placeholder="请输入案号">' +
            '        </div>' +
            '        <div class="modal-form-row">' +
            '            <label class="modal-form-label">案字</label>' +
            '            <select class="modal-form-select" id="ced_word"><option value="">请选择案字</option></select>' +
            '        </div>' +
            '        <div class="modal-form-row">' +
            '            <label class="modal-form-label">案由</label>' +
            '            <input type="hidden" id="ced_cause">' +
            '            <button type="button" class="cause-trigger" onclick="openCaseEditCauseSelector()">' +
            '                <span class="placeholder" id="ced_causeText">请选择案由</span>' +
            '                <i class="fas fa-chevron-down" style="color:var(--text-muted);font-size:12px;"></i>' +
            '            </button>' +
            '        </div>' +
            '        <div class="modal-form-row">' +
            '            <label class="modal-form-label" id="ced_partyALabel">原告</label>' +
            '            <input type="text" class="modal-form-input" id="ced_partyA" placeholder="请输入">' +
            '        </div>' +
            '        <div class="modal-form-row">' +
            '            <label class="modal-form-label" id="ced_partyBLabel">被告</label>' +
            '            <input type="text" class="modal-form-input" id="ced_partyB" placeholder="请输入">' +
            '        </div>' +
            '        <div class="modal-form-row">' +
            '            <label class="modal-form-label">承办人</label>' +
            '            <input type="text" class="modal-form-input" id="ced_handler" placeholder="请输入承办人">' +
            '        </div>' +
            '        <div class="modal-form-row">' +
            '            <label class="modal-form-label">上传日期</label>' +
            '            <input type="date" class="modal-form-input" id="ced_date">' +
            '        </div>' +
            '    </div>' +
            '    <div class="modal-footer">' +
            '        <button class="modal-btn-secondary" onclick="closeCaseEditDialog()">取消</button>' +
            '        <button class="modal-btn-primary" onclick="submitCaseEditDialog()">保存</button>' +
            '    </div>' +
            '</div>';
        document.body.appendChild(dialogWrap);
    }

    // ---- 打开 / 关闭 ----
    window.openCaseEditDialog = function (caseId, opts) {
        ensureDialog();
        currentCaseId = caseId;
        onSavedCallback = (opts && typeof opts.onSaved === 'function') ? opts.onSaved : null;

        const result = (typeof findCaseById === 'function') ? findCaseById(caseId) : null;
        const caseItem = result && result.caseItem;
        if (!caseItem) { return; }

        const current = (typeof getCurrentBusiness === 'function') ? getCurrentBusiness() : { partiesLabels: ['原告', '被告'] };
        const labels = current.partiesLabels || ['原告', '被告'];
        $('partyALabel').textContent = labels[0] || '原告';
        $('partyBLabel').textContent = labels[1] || '被告';

        // V1.2.2 首次解析预填逻辑
        const displayCase = Object.assign({}, caseItem);
        if (typeof getCaseParseStats === 'function') {
            const parseStats = getCaseParseStats(caseItem);
            const parseDone = parseStats.parsing === 0 && (caseItem.files || []).length > 0;
            if (caseItem.firstParsePending && parseDone && caseItem.parseResult) {
                displayCase.caseNumber = caseItem.parseResult.caseNumber || caseItem.caseNumber;
                displayCase.caseWord = caseItem.parseResult.caseWord || caseItem.caseWord;
                displayCase.cause = caseItem.parseResult.cause || caseItem.cause;
                displayCase.partyA = caseItem.parseResult.partyA || caseItem.partyA;
                displayCase.partyB = caseItem.parseResult.partyB || caseItem.partyB;
            }
        }

        // 案由
        if (displayCase.cause) {
            $('cause').value = displayCase.cause;
            $('causeText').textContent = displayCase.cause;
            $('causeText').classList.remove('placeholder');
        } else {
            $('cause').value = '';
            $('causeText').textContent = '请选择案由';
            $('causeText').classList.add('placeholder');
        }

        $('name').value = displayCase.caseName || '';
        $('number').value = displayCase.caseNumber || '';

        // 案字下拉
        const org = (typeof currentBusiness !== 'undefined' ? currentBusiness : 'court');
        const words = (typeof caseWordListByOrg !== 'undefined' && caseWordListByOrg[org]) || [];
        $('word').innerHTML = '<option value="">请选择案字</option>' +
            words.map(function (w) { return '<option value="' + w + '">' + w + '</option>'; }).join('');
        $('word').value = displayCase.caseWord || '';

        $('partyA').value = displayCase.partyA || '';
        $('partyB').value = displayCase.partyB || '';
        $('handler').value = (typeof getCaseHandlers === 'function' ? getCaseHandlers(caseItem) : [caseItem.handler || '']).join('、');
        $('date').value = displayCase.date || '';

        $n('caseEditOverlay').classList.add('show');
        $n('caseEditDialog').classList.add('show');
    };

    window.closeCaseEditDialog = function () {
        const o = $n('caseEditOverlay'), d = $n('caseEditDialog');
        if (o) o.classList.remove('show');
        if (d) d.classList.remove('show');
        currentCaseId = '';
    };

    window.submitCaseEditDialog = function () {
        const caseName = ($('name') && $('name').value || '').trim();
        if (!caseName) { showNotification('请填写案件名称', 'error'); return; }

        const result = (typeof findCaseById === 'function') ? findCaseById(currentCaseId) : null;
        const caseItem = result && result.caseItem;
        if (!caseItem) { return; }

        const cause = $('cause').value;
        const type = (typeof getCauseType === 'function' ? getCauseType(cause) : null) || caseItem.type;

        caseItem.caseName = caseName;
        caseItem.caseNumber = ($('number').value || '').trim();
        caseItem.caseWord = $('word').value || '';
        caseItem.cause = cause;
        caseItem.type = type;
        caseItem.partyA = ($('partyA').value || '').trim();
        caseItem.partyB = ($('partyB').value || '').trim();
        const handlerText = ($('handler').value || '').trim();
        const handlerArr = handlerText ? handlerText.split(/[、,，]/).map(function (s) { return s.trim(); }).filter(Boolean) : [];
        const primaryHandler = handlerArr[0] || caseItem.handler || (typeof getCurrentUserName === 'function' ? getCurrentUserName() : '');
        caseItem.handler = primaryHandler;
        caseItem.handlers = handlerArr.length > 0 ? handlerArr : [primaryHandler];
        caseItem.date = $('date').value || caseItem.date;
        caseItem.updatedAt = new Date().toISOString().split('T')[0];

        // V1.2.2 首次解析确认：清掉首检标记与识别结果缓存
        // V1.2.21: 该标记（firstParsePending）现仅驱动列表页「待确认」标识与详情页提示条；「新」标识改由 createdAt 独立控制
        if (caseItem.firstParsePending) {
            caseItem.firstParsePending = false;
            delete caseItem.parseResult;
        }

        if (typeof saveBusinessSystems === 'function') saveBusinessSystems();
        closeCaseEditDialog();
        showNotification('案件信息已更新', 'success');
        if (onSavedCallback) {
            try { onSavedCallback(caseItem); } catch (e) { /* ignore */ }
        }
    };

    // ---- 案由树弹窗 ----
    window.openCaseEditCauseSelector = function () {
        ensureDialog();
        causeSelectorValue = $('cause').value || '';
        const input = $('causeSearchInput'); if (input) input.value = '';
        renderCaseEditCauseTree();
        $('causeSelectorModal').classList.add('show');
    };

    window.closeCaseEditCauseSelector = function (event) {
        if (event && event.target !== $('causeSelectorModal')) return;
        $('causeSelectorModal').classList.remove('show');
    };

    function getCaseEditCauseTree() {
        const org = (typeof currentBusiness !== 'undefined' ? currentBusiness : 'court');
        return (typeof causeTreeDataByOrg !== 'undefined' && (causeTreeDataByOrg[org] || causeTreeDataByOrg.court)) || [];
    }

    function escapeAttr(s) { return String(s).replace(/'/g, "\\'"); }

    function renderCaseEditCauseTree() {
        const container = $('causeTreeContainer');
        if (!container) return;
        const tree = getCaseEditCauseTree();
        container.innerHTML = tree.map(function (l1, i1) {
            return '' +
                '<div class="cause-level-1 ' + (l1.expanded ? 'expanded' : '') + '" data-level="1" data-index="' + i1 + '">' +
                '    <div class="cause-level-1-item">' +
                '        <div class="cause-level-1-header" data-cause="' + l1.name + '" data-level="1" data-index="' + i1 + '">' +
                '            <i class="fas fa-chevron-right cause-expand-icon" onclick="event.stopPropagation(); toggleCaseEditCauseLevel1(' + i1 + ')"></i>' +
                '            <span class="cause-level-1-name" onclick="event.stopPropagation(); selectCaseEditCause(\'' + escapeAttr(l1.name) + '\')">' + l1.name + '</span>' +
                '        </div>' +
                '    </div>' +
                '    <div class="cause-level-2-container">' +
                            l1.children.map(function (l2, i2) {
                                if (typeof l2 === 'string') {
                                    return renderCaseEditCauseItem(l2, 'l1-' + i1);
                                }
                                return '' +
                                    '<div class="cause-level-2 ' + (l2.expanded ? 'expanded' : '') + '" data-level="2" data-index="' + i1 + '-' + i2 + '">' +
                                    '    <div class="cause-level-2-header" data-cause="' + l2.name + '" data-level="2" data-index="' + i1 + '-' + i2 + '">' +
                                    '        <i class="fas fa-chevron-right cause-expand-icon" onclick="event.stopPropagation(); toggleCaseEditCauseLevel2(' + i1 + ', ' + i2 + ')"></i>' +
                                    '        <span class="cause-level-2-name" onclick="event.stopPropagation(); selectCaseEditCause(\'' + escapeAttr(l2.name) + '\')">' + l2.name + '</span>' +
                                    '    </div>' +
                                    '    <div class="cause-level-3-container">' +
                                                (l2.children || []).map(function (c) { return renderCaseEditCauseItem(c, 'l2-' + i1 + '-' + i2); }).join('') +
                                    '    </div>' +
                                    '</div>';
                            }).join('') +
                '    </div>' +
                '</div>';
        }).join('');
        updateCaseEditCauseSelection();
    }

    function renderCaseEditCauseItem(causeName, groupKey) {
        const isSel = causeSelectorValue === causeName;
        return '' +
            '<div class="cause-item ' + (isSel ? 'selected' : '') + '" data-cause="' + causeName + '" data-group="' + groupKey + '" onclick="selectCaseEditCause(\'' + escapeAttr(causeName) + '\')">' +
            '    <span class="cause-name">' + causeName + '</span>' +
            '    <i class="fas fa-check-circle cause-check"></i>' +
            '</div>';
    }

    window.toggleCaseEditCauseLevel1 = function (index) {
        const tree = getCaseEditCauseTree();
        if (tree[index]) { tree[index].expanded = !tree[index].expanded; renderCaseEditCauseTree(); }
    };

    window.toggleCaseEditCauseLevel2 = function (i1, i2) {
        const tree = getCaseEditCauseTree();
        const l2 = tree[i1] && tree[i1].children[i2];
        if (l2 && typeof l2 !== 'string') { l2.expanded = !l2.expanded; renderCaseEditCauseTree(); }
    };

    window.selectCaseEditCause = function (causeName) {
        causeSelectorValue = causeName;
        $('cause').value = causeName;
        $('causeText').textContent = causeName;
        $('causeText').classList.remove('placeholder');
        updateCaseEditCauseSelection();
        closeCaseEditCauseSelector();
    };

    function updateCaseEditCauseSelection() {
        const container = $('causeTreeContainer');
        if (!container) return;
        container.querySelectorAll('.cause-item').forEach(function (item) {
            item.classList.toggle('selected', item.dataset.cause === causeSelectorValue);
        });
        container.querySelectorAll('.cause-level-1-header, .cause-level-2-header').forEach(function (header) {
            const sel = header.dataset.cause === causeSelectorValue;
            header.classList.toggle('selected', sel);
            const nameEl = header.querySelector('.cause-level-1-name, .case-level-2-name, .cause-level-2-name');
            if (nameEl) nameEl.classList.toggle('selected', sel);
        });
    }

    window.filterCaseEditCauseTree = function () {
        const keyword = ($('causeSearchInput') && $('causeSearchInput').value || '').trim().toLowerCase();
        const container = $('causeTreeContainer');
        if (!container) return;
        container.querySelectorAll('.cause-item').forEach(function (item) {
            const name = (item.querySelector('.cause-name').textContent || '').toLowerCase();
            const match = !keyword || name.indexOf(keyword) !== -1;
            item.style.display = match ? 'flex' : 'none';
            if (match && keyword) {
                let p = item.closest('.cause-level-2'); if (p) p.classList.add('expanded');
                p = item.closest('.cause-level-1'); if (p) p.classList.add('expanded');
            }
        });
    };

    // ESC 关闭
    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') return;
        if ($('causeSelectorModal') && $('causeSelectorModal').classList.contains('show')) {
            closeCaseEditCauseSelector();
            return;
        }
        if ($n('caseEditDialog') && $n('caseEditDialog').classList.contains('show')) {
            closeCaseEditDialog();
        }
    });
})();

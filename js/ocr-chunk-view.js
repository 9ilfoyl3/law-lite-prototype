/**
 * 管理后台 - OCR/分块查看（独立页面）
 * 依赖：case-data.js
 * 入口：案件管理列表操作列【OCR/分块】按钮 -> ocr-chunk-view.html?caseId=xxx
 * 布局：左材料列表 / 右 OCR 内容与分块；支持识别全文、3 种粒度切分、重新切片
 * 说明：V1.2.15 由原弹框（modal）改为独立页面；mock OCR 文本与切分逻辑与旧弹框保持一致
 */
(function () {
    'use strict';

    const currentBusiness = 'court'; // 固定法院业务系统
    let allCases = [];
    let viewerState = null; // { caseId, fileId, granularity, ocrText, chunks, subTab }

    // ===== 工具 =====
    function getUrlParam(name) {
        const params = new URLSearchParams(window.location.search);
        return params.get(name) || '';
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    let notifyTimer = null;
    function showNotification(msg, type) {
        const el = document.getElementById('notifyToast');
        if (!el) return;
        el.textContent = msg;
        el.className = 'notify-toast show' + (type ? ' ' + type : '');
        if (notifyTimer) clearTimeout(notifyTimer);
        notifyTimer = setTimeout(function () { el.className = 'notify-toast'; }, 2000);
    }

    // ===== 数据加载 =====
    function loadData() {
        allCases = [];
        if (typeof businessSystems === 'undefined') {
            console.error('[ocr-chunk-view] businessSystems 未定义，请确认 case-data.js 已加载');
            return;
        }
        const system = businessSystems[currentBusiness];
        if (system && Array.isArray(system.cases)) {
            system.cases.forEach(function (c) { allCases.push(c); });
        }
    }

    // ===== 渲染：左材料列表 =====
    function renderOcrMaterialList(files) {
        const box = document.getElementById('ocrMaterialList');
        if (!box) return;
        if (!files || files.length === 0) {
            box.innerHTML = '<div class="ocr-empty">暂无材料</div>';
            return;
        }
        box.innerHTML = files.map(function (f) {
            const st = f.parseStatus || (f.ocrStatus === 'done' ? 'success' : (f.ocrStatus === 'pending' ? 'parsing' : 'error'));
            const dotCls = st === 'success' || st === 'done' ? 'success' : (st === 'parsing' || st === 'pending' ? 'parsing' : 'error');
            const active = viewerState && viewerState.fileId === f.id ? ' active' : '';
            return '<button type="button" class="ocr-material-item' + active + '" onclick="window.OcrChunkView.selectOcrFile(\'' + f.id + '\')" title="' + escapeHtml(f.name || '') + '">' +
                '<span class="ocr-status-dot ' + dotCls + '"></span>' +
                '<span class="ocr-mat-name">' + escapeHtml(f.name || '未命名文件') + '</span>' +
                '</button>';
        }).join('');
    }

    function renderOcrFileInfo(f) {
        const box = document.getElementById('ocrFileInfo');
        if (!box) return;
        if (!f) { box.innerHTML = ''; return; }
        const st = f.parseStatus || (f.ocrStatus === 'done' ? 'success' : (f.ocrStatus === 'pending' ? 'parsing' : 'error'));
        const stLabel = ({ success: '已识别', parsing: '解析中', pending: '待识别', error: '解析失败', done: '已识别' })[st] || st;
        const stCls = (st === 'success' || st === 'done') ? 'st-success' : (st === 'parsing' ? 'st-parsing' : 'st-error');
        const pages = Math.max(1, Math.ceil((f.size || 0) / 600));
        box.innerHTML =
            '<span>文件 <b>' + escapeHtml(f.name || '-') + '</b></span>' +
            '<span>状态 <b class="' + stCls + '">' + escapeHtml(stLabel) + '</b></span>' +
            '<span>错误类型 <b>' + escapeHtml(f.errorType || '-') + '</b></span>' +
            '<span>解析时间 <b>' + escapeHtml(String(f.parsedAt || '-')) + '</b></span>' +
            '<span>页数 <b>' + pages + '</b></span>';
    }

    // ===== 渲染：右内容 =====
    function switchOcrSubTab(tab) {
        if (viewerState) viewerState.subTab = tab;
        const t1 = document.getElementById('ocrSubTextTab');
        const t2 = document.getElementById('ocrSubChunkTab');
        const p1 = document.getElementById('ocrPaneText');
        const p2 = document.getElementById('ocrPaneChunk');
        const isText = tab === 'text';
        if (t1) t1.classList.toggle('active', isText);
        if (t2) t2.classList.toggle('active', !isText);
        if (p1) p1.style.display = isText ? 'flex' : 'none';
        if (p2) p2.style.display = isText ? 'none' : 'flex';
    }

    function renderOcrTextBody(text) {
        const b = document.getElementById('ocrTextBody');
        const ftr = document.getElementById('ocrTextFooter');
        if (b) b.textContent = text || '';
        if (ftr) ftr.textContent = '';
    }

    function renderOcrText() {
        if (!viewerState) return renderOcrTextBody('');
        const text = viewerState.ocrText || '';
        const b = document.getElementById('ocrTextBody');
        const ftr = document.getElementById('ocrTextFooter');
        if (b) b.textContent = text;
        if (ftr) ftr.textContent = '共 ' + text.length + ' 字 · ' + ((text.match(/\n\n/g) || []).length + 1) + ' 段';
    }

    function renderOcrChunkBodyEmpty(msg) {
        const b = document.getElementById('ocrChunkBody');
        if (b) b.innerHTML = '<div class="ocr-empty">' + (msg || '无分块') + '</div>';
    }

    function renderOcrChunks() {
        const b = document.getElementById('ocrChunkBody');
        if (!b) return;
        if (!viewerState || !viewerState.chunks.length) return renderOcrChunkBodyEmpty();
        b.innerHTML = viewerState.chunks.map(function (ck, i) {
            const s = (ck.text || '').replace(/\s+/g, ' ').slice(0, 80) + ((ck.text || '').length > 80 ? '…' : '');
            return '<div class="ocr-chunk-card">' +
                '<div class="ocr-chunk-card-head">' +
                '<span class="ocr-chunk-idx">#' + (i + 1) + '</span>' +
                '<span class="ocr-chunk-gran">' + escapeHtml(ck.granLabel) + '</span>' +
                '<span class="ocr-chunk-range">' + escapeHtml(ck.range) + '</span>' +
                '</div>' +
                '<div class="ocr-chunk-text">' + escapeHtml(s) + '</div>' +
                '</div>';
        }).join('');
    }

    // ===== 交互 =====
    function selectOcrFile(fileId) {
        if (!viewerState) return;
        viewerState.fileId = fileId;
        const c = allCases.find(function (x) { return x.id === viewerState.caseId; });
        const files = (c && Array.isArray(c.files)) ? c.files.filter(function (f) { return f; }) : [];
        const f = files.find(function (x) { return x.id === fileId; });
        if (!f) return;
        viewerState.ocrText = buildMockOcrText(f);
        viewerState.chunks = sliceOcrText(viewerState.ocrText, viewerState.granularity);
        renderOcrMaterialList(files);
        renderOcrFileInfo(f);
        renderOcrText();
        renderOcrChunks();
    }

    function setOcrGranularity(g) {
        if (!viewerState) return;
        viewerState.granularity = g;
        viewerState.chunks = sliceOcrText(viewerState.ocrText, g);
        renderOcrChunks();
    }

    function rerunOcrSlice() {
        if (!viewerState) return;
        const btn = document.getElementById('ocrResliceBtn');
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 重新切片中…'; }
        setTimeout(function () {
            if (!viewerState) return;
            viewerState.chunks = sliceOcrText(viewerState.ocrText, viewerState.granularity);
            renderOcrChunks();
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-rotate"></i> 重新切片'; }
            showNotification('已按当前粒度重新切分', 'success');
        }, 600);
    }

    // ---- mock OCR 文本 + 三种粒度切分（与旧弹框实现保持一致） ----
    function buildMockOcrText(f) {
        const name = (f && f.name) || 'file';
        const size = (f && f.size) || 0;
        const pageCount = Math.max(1, Math.min(6, Math.ceil(size / 500)));
        const lines = [];
        const isJudgment = /判决|裁定|一审|二审|终审/i.test(name);
        lines.push(isJudgment
            ? '原告：张三，男，1985年3月12日出生，汉族，住北京市海淀区。\n被告：李四，男，1980年7月20日出生，汉族，住北京市朝阳区。'
            : '证据材料：双方当事人提交的证据材料清单如下。');
        for (let p = 1; p <= pageCount; p++) {
            lines.push('[page]第 ' + p + ' 页');
            for (let s = 0; s < 4; s++) lines.push('（段落 ' + (s + 1) + '）本院经审理查明，原告主张被告…');
            if (p === Math.ceil(pageCount / 2)) lines.push('被告辩称：原告所述与事实不符…');
            if (p === pageCount) lines.push('本院认为：综合上述事实与证据，依据《中华人民共和国民法典》相关规定，判决如下…');
        }
        return lines.join('\n');
    }

    function sliceOcrText(text, granularity) {
        if (!text) return [];
        if (granularity === 'page') {
            const parts = text.split(/\[page\]/);
            const out = [];
            for (let i = 1; i < parts.length; i++) {
                out.push({ granLabel: '按页', range: '第 ' + i + ' 页', text: parts[i].replace(/^\s*/, '').slice(0, 4096) });
            }
            return out;
        }
        if (granularity === 'paragraph') {
            return text.split(/\n{2,}/).filter(function (p) { return p.trim(); }).map(function (p, i) {
                return { granLabel: '按段', range: '第 ' + (i + 1) + ' 段', text: p };
            });
        }
        const out2 = [];
        let n = 0;
        text.split(/(?<=[。！？\n])/).forEach(function (s) {
            if (!s.trim()) return;
            n++;
            out2.push({ granLabel: '按句', range: '第 ' + n + ' 句', text: s });
        });
        return out2;
    }

    // ===== 初始化 =====
    function init() {
        loadData();
        const caseId = getUrlParam('caseId');
        const c = allCases.find(function (x) { return x.id === caseId; });
        const nameEl = document.getElementById('pageCaseName');
        const caseLabel = c ? (c.caseName || c.caseNumber || '案件') : '案件';
        if (nameEl) nameEl.textContent = caseLabel + ' · OCR/分块查看';
        document.title = caseLabel + ' · OCR/分块查看 - AI法官助理管理后台';

        if (!c) {
            renderOcrMaterialList([]);
            renderOcrFileInfo(null);
            renderOcrTextBody(caseId ? '未找到该案件（caseId：' + caseId + '），请从案件列表重新进入。' : '缺少 caseId 参数，请从案件列表操作列进入本页。');
            renderOcrChunkBodyEmpty('无法加载分块');
            return;
        }

        const files = Array.isArray(c.files) ? c.files.filter(function (f) { return f; }) : [];
        viewerState = { caseId: caseId, fileId: '', granularity: 'paragraph', ocrText: '', chunks: [], subTab: 'text' };
        renderOcrMaterialList(files);
        if (files.length > 0) {
            selectOcrFile(files[0].id);
        } else {
            renderOcrFileInfo(null);
            renderOcrTextBody('该案件暂无材料。');
            renderOcrChunkBodyEmpty();
        }
        switchOcrSubTab('text');
    }

    window.OcrChunkView = {
        selectOcrFile,
        switchOcrSubTab,
        setOcrGranularity,
        rerunOcrSlice
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

// ============ 文书精修页面 ============
// v1.2 精修独立页面：左侧文书内容展示区 + 右侧对话式精修区
// 通过 URL 参数 caseId + versionId 加载对应版本
// 精修结果保存为新版本（type='polish'），不覆盖原版本
// v1.2 上下文区改为三卡片（文书来源/知识库/结构化数据）
// v1.2 右侧对话改为结构化修改建议（分析过程 + 修改建议卡片）
// v1.2 支持上传文书进入精修（无案件模式，按钮暂隐藏）

let polishCaseId = '';
let polishVersionId = '';
let polishCaseItem = null;
let polishVersion = null;
let polishDoc = null;
let originalContent = '';      // 原始文书内容（用于撤销）
let currentContent = '';       // 当前文书内容
let editHistory = [];          // 精修历史（用于多步撤销）
let hasUnsavedChanges = false; // 是否有未保存的修改
let docEditor = null;          // DocEditor 实例
let isUploadMode = false;      // 是否为上传文书模式（无案件）

// AI 改写状态
let aiRewriteRange = null;             // 当前选区 Range 克隆
let aiRewriteOriginalText = '';        // 选中的原文
let aiRewriteCurrentResult = '';       // 当前改写结果
let aiRewriteLoading = false;          // 是否正在生成

// 结构化审查消息状态
// 结构：{ [msgId]: { reviews: [...], snapshotBeforeApply: 'html'|null, appliedReviewIds: [] } }
let reviewMessages = {};

// ===== 初始化 =====
function initPolishPage() {
    const params = new URLSearchParams(window.location.search);
    polishCaseId = params.get('caseId') || '';
    polishVersionId = params.get('versionId') || '';

    if (!polishCaseId || !polishVersionId) {
        // 兼容旧入口：从 localStorage.refineContext 读取（无 versionId 时）
        const ctx = JSON.parse(localStorage.getItem('refineContext') || 'null');
        if (ctx && ctx.docContent) {
            polishCaseId = ctx.caseId || '';
            polishVersionId = '';
            loadFromContext(ctx);
            return;
        }
        showError('缺少案件ID或版本ID参数');
        return;
    }

    loadVersionData();
}

// 从 URL 参数加载案件版本数据
function loadVersionData() {
    const result = findCaseById(polishCaseId);
    if (!result || !result.caseItem) {
        showError('未找到案件');
        return;
    }
    polishCaseItem = result.caseItem;

    // 查找对应版本
    for (const doc of (polishCaseItem.documents || [])) {
        if (!doc || !Array.isArray(doc.versions)) continue;
        const v = doc.versions.find(x => x.versionId === polishVersionId);
        if (v) {
            polishDoc = doc;
            polishVersion = v;
            break;
        }
    }

    if (!polishVersion) {
        showError('未找到文书版本');
        return;
    }

    originalContent = polishVersion.content || '';
    currentContent = originalContent;
    renderPolishPage();
}

// 从 localStorage 上下文加载（兼容无 versionId 的旧入口）
function loadFromContext(ctx) {
    originalContent = ctx.docContent || '';
    currentContent = originalContent;
    polishCaseItem = ctx.caseId ? findCaseById(ctx.caseId)?.caseItem : null;

    document.getElementById('polishDocTitle').textContent = ctx.docTitle || '法律文书';
    document.getElementById('polishCaseName').textContent = ctx.caseName || '';
    document.getElementById('versionTag').textContent = '未保存';
    initDocEditor(currentContent);
    renderContextInfo(ctx);
}

function renderPolishPage() {
    const title = polishDoc?.title || polishCaseItem.caseName || '法律文书';
    document.getElementById('polishDocTitle').textContent = title;
    document.getElementById('polishCaseName').textContent = polishCaseItem.caseName || polishCaseItem.caseNumber || '';

    // 版本标签
    const versions = polishDoc?.versions || [];
    const idx = versions.findIndex(v => v.versionId === polishVersionId);
    const versionNo = idx >= 0 ? `v${versions.length - idx}` : '原版本';
    document.getElementById('versionTag').textContent = versionNo;

    // 文书内容
    initDocEditor(currentContent);

    renderContextInfo();
}

// 初始化文档编辑器
function initDocEditor(content) {
    const root = document.getElementById('docEditorRoot');
    if (!root || typeof DocEditor === 'undefined') {
        root.innerHTML = `<p style="color:#dc2626;text-align:center;">编辑器加载失败</p>`;
        return;
    }
    if (docEditor) docEditor.destroy();

    docEditor = new DocEditor(root, {
        content: content,
        placeholder: '暂无内容',
        showToolbar: true,
        readonly: false,
        onChange: (html) => {
            currentContent = html;
            if (!hasUnsavedChanges) {
                hasUnsavedChanges = true;
                document.getElementById('editHint').textContent = '有未保存的精修改动';
            }
        }
    });

    // 绑定选区变化 -> 显示/隐藏 AI 改写浮动工具条
    docEditor.onSelectionChange((range, valid) => {
        if (valid && range && !aiRewriteLoading) {
            showAiRewriteToolbar(range);
        } else {
            hideAiRewriteToolbar();
        }
    });

    // 点击编辑器空白处隐藏工具条与卡片
    const paper = docEditor.paper;
    paper.addEventListener('mousedown', (e) => {
        const toolbar = document.getElementById('aiRewriteToolbar');
        const card = document.getElementById('aiRewriteCard');
        if (toolbar && toolbar.contains(e.target)) return;
        if (card && card.contains(e.target)) return;
        // 延迟，让选区更新完成后再判断
        setTimeout(() => hideAiRewriteToolbar(), 0);
    });

    // 滚动时隐藏浮动工具条和卡片
    docEditor.editorShell.addEventListener('scroll', () => {
        hideAiRewriteToolbar();
        hideAiRewriteCard();
    });
}

// 渲染上下文信息（三卡片：文书来源 / 知识库 / 结构化数据）
function renderContextInfo(ctx) {
    const cfg = polishVersion?.config || {};
    const caseName = ctx?.caseName || polishCaseItem?.caseName || '';
    const caseNumber = ctx?.caseNumber || polishCaseItem?.caseNumber || '';
    const docTitle = polishDoc?.title || ctx?.docTitle || '法律文书';
    const source = polishVersion?.source || (ctx?.docContent ? 'upload' : 'ai');
    const sourceLabel = source === 'upload' ? '用户上传' : '生成跳转';

    // 知识库材料数
    const materials = polishCaseItem?.materials || polishCaseItem?.files || [];
    const materialCount = materials.length;
    const materialNames = getMaterialNamesByIds(cfg.materialIds);

    // 结构化数据（五步工作法+要件清单）
    const hasStructData = !!(cfg.stepsSnapshot || (cfg.materialIds && cfg.materialIds.length));

    let html = '<div class="polish-context-cards">';

    // 卡片1：文书来源
    html += `
        <div class="polish-context-card">
            <div class="polish-context-card-icon doc"><i class="fas fa-file-alt"></i></div>
            <div class="polish-context-card-body">
                <div class="polish-context-card-title">文书来源</div>
                <div class="polish-context-card-value">${escapeHtml(docTitle)}</div>
            </div>
            <span class="polish-context-card-tag source">${sourceLabel}</span>
            <span class="polish-context-card-tag auto">已自动加载</span>
        </div>
    `;

    // 卡片2：个案知识库
    if (isUploadMode || !polishCaseItem) {
        html += `
            <div class="polish-context-card disabled">
                <div class="polish-context-card-icon kb"><i class="fas fa-book"></i></div>
                <div class="polish-context-card-body">
                    <div class="polish-context-card-title">个案知识库</div>
                    <div class="polish-context-card-value">无关联案件，未加载</div>
                </div>
            </div>
        `;
    } else {
        html += `
            <div class="polish-context-card">
                <div class="polish-context-card-icon kb"><i class="fas fa-book"></i></div>
                <div class="polish-context-card-body">
                    <div class="polish-context-card-title">个案知识库</div>
                    <div class="polish-context-card-value">已加载 ${materialCount} 份材料${materialNames.length ? '（含 ' + escapeHtml(materialNames.slice(0,2).join('、')) + (materialNames.length > 2 ? '等' : '') + '）' : ''}</div>
                </div>
                <span class="polish-context-card-tag auto">已自动加载</span>
            </div>
        `;
    }

    // 卡片3：结构化数据
    if (isUploadMode || !hasStructData) {
        html += `
            <div class="polish-context-card disabled">
                <div class="polish-context-card-icon struct"><i class="fas fa-list-check"></i></div>
                <div class="polish-context-card-body">
                    <div class="polish-context-card-title">结构化数据</div>
                    <div class="polish-context-card-value">${isUploadMode ? '无关联案件，未加载' : '五步工作法 + 要件清单'}</div>
                </div>
                ${isUploadMode ? '' : '<span class="polish-context-card-tag auto">已自动加载</span>'}
            </div>
        `;
    } else {
        html += `
            <div class="polish-context-card">
                <div class="polish-context-card-icon struct"><i class="fas fa-list-check"></i></div>
                <div class="polish-context-card-body">
                    <div class="polish-context-card-title">结构化数据</div>
                    <div class="polish-context-card-value">五步工作法 + 要件清单</div>
                </div>
                <span class="polish-context-card-tag auto">已自动加载</span>
            </div>
        `;
    }

    html += '</div>';
    document.getElementById('contextRow').innerHTML = html;
}

// 根据 materialIds 从案件材料中解析材料名
function getMaterialNamesByIds(ids) {
    if (!ids || !Array.isArray(ids) || ids.length === 0) return [];
    const materials = polishCaseItem?.materials || polishCaseItem?.files || [];
    return ids.map(id => {
        const item = materials.find(m => m && (m.id === id || m.fileId === id));
        return item ? (item.name || item.fileName || `材料${id}`) : `材料${id}`;
    }).filter(Boolean);
}

function showError(msg) {
    const root = document.getElementById('docEditorRoot');
    if (root) root.innerHTML = `<p style="color:#dc2626;text-align:center;padding:40px;">${msg}</p>`;
    document.getElementById('sendBtn').disabled = true;
    document.getElementById('saveBtn').disabled = true;
}

// ===== AI 改写：浮动工具条 =====
function showAiRewriteToolbar(range) {
    const toolbar = document.getElementById('aiRewriteToolbar');
    if (!toolbar || !range) return;

    const rects = range.getClientRects();
    const rect = rects && rects.length ? rects[0] : range.getBoundingClientRect();
    if (!rect || rect.width === 0) return;

    const root = document.getElementById('docEditorRoot');
    const rootRect = root.getBoundingClientRect();

    // 默认显示在选区上方居中
    let top = rect.top - rootRect.top - toolbar.offsetHeight - 8;
    let left = rect.left - rootRect.left + (rect.width - toolbar.offsetWidth) / 2;

    // 若上方空间不足，显示在选区下方
    if (top < 0) {
        top = rect.bottom - rootRect.top + 8;
    }
    // 边界约束
    if (left < 8) left = 8;
    const maxLeft = rootRect.width - toolbar.offsetWidth - 8;
    if (left > maxLeft) left = maxLeft;

    toolbar.style.top = top + 'px';
    toolbar.style.left = left + 'px';
    toolbar.classList.add('visible');
}

function hideAiRewriteToolbar() {
    const toolbar = document.getElementById('aiRewriteToolbar');
    if (toolbar) toolbar.classList.remove('visible');
}

// ===== AI 改写：卡片弹窗 =====
// 流程：选中段落 → 点系统改写 → 显示原文 + 指令输入框 → 用户输入指令 → 点发送开始生成 → 展示结果
function openAiRewriteCard() {
    if (!docEditor || aiRewriteLoading) return;
    const range = docEditor.getSelectionRange();
    const text = docEditor.getSelectedText();
    if (!range || !text) {
        showNotification('请先选中文本段落', 'info');
        return;
    }

    // 克隆 range 用于后续替换
    aiRewriteRange = range.cloneRange();
    aiRewriteOriginalText = text;

    const card = document.getElementById('aiRewriteCard');
    const body = document.getElementById('aiRewriteCardBody');
    const actions = document.getElementById('aiRewriteActions');
    const footer = document.getElementById('aiRewriteFooter');

    // 初始状态：显示原文 + 指令输入框，不自动生成
    body.innerHTML = `
        <div class="ai-rewrite-section">
            <div class="ai-rewrite-label">原文</div>
            <div class="ai-rewrite-original">${escapeHtml(aiRewriteOriginalText)}</div>
        </div>
        <div class="ai-rewrite-section">
            <div class="ai-rewrite-label">改写指令</div>
            <div class="ai-rewrite-hint">请输入改写要求，例如：更正式一些、补充法条引用、精简表述</div>
        </div>
    `;
    actions.style.display = 'none';
    // 显示底部指令输入框，用户输入后点发送开始生成
    footer.style.display = 'flex';
    const instructionInput = document.getElementById('aiRewriteInstruction');
    if (instructionInput) {
        instructionInput.value = '';
        instructionInput.placeholder = '输入改写指令后点击发送开始生成';
        instructionInput.focus();
    }

    positionAiRewriteCard(range);
    card.classList.add('visible');
    hideAiRewriteToolbar();
}

function positionAiRewriteCard(range) {
    const card = document.getElementById('aiRewriteCard');
    if (!card || !range) return;
    const root = document.getElementById('docEditorRoot');
    const rootRect = root.getBoundingClientRect();
    const rect = range.getBoundingClientRect();

    let top = rect.bottom - rootRect.top + 12;
    let left = rect.left - rootRect.left;

    // 保证卡片不超出右侧边界
    const cardWidth = card.offsetWidth || 420;
    if (left + cardWidth > rootRect.width - 16) {
        left = Math.max(8, rootRect.width - cardWidth - 16);
    }
    // 若下方空间不足，显示在选区上方
    const cardHeight = card.offsetHeight || 280;
    if (top + cardHeight > rootRect.height - 16) {
        top = Math.max(8, rect.top - rootRect.top - cardHeight - 12);
    }

    card.style.top = top + 'px';
    card.style.left = left + 'px';
}

function hideAiRewriteCard() {
    const card = document.getElementById('aiRewriteCard');
    if (card) card.classList.remove('visible');
    aiRewriteRange = null;
    aiRewriteOriginalText = '';
    aiRewriteCurrentResult = '';
}

function closeAiRewriteCard() {
    hideAiRewriteCard();
}

// 模拟生成改写结果
function generateAiRewriteResult(originalText, instruction) {
    aiRewriteLoading = true;
    const body = document.getElementById('aiRewriteCardBody');
    const actions = document.getElementById('aiRewriteActions');
    const footer = document.getElementById('aiRewriteFooter');

    setTimeout(() => {
        aiRewriteLoading = false;
        const result = mockRewrite(originalText, instruction);
        aiRewriteCurrentResult = result.text;

        body.innerHTML = `
            <div class="ai-rewrite-section">
                <div class="ai-rewrite-label">原文</div>
                <div class="ai-rewrite-original">${escapeHtml(aiRewriteOriginalText)}</div>
            </div>
            <div class="ai-rewrite-section">
                <div class="ai-rewrite-label">修改说明</div>
                <div class="ai-rewrite-reason">${escapeHtml(result.reason)}</div>
            </div>
            <div class="ai-rewrite-section">
                <div class="ai-rewrite-label">修改结果</div>
                <textarea class="ai-rewrite-result" id="aiRewriteResultText">${escapeHtml(result.text)}</textarea>
            </div>
        `;
        actions.style.display = 'flex';
        footer.style.display = 'flex';
        document.getElementById('aiRewriteInstruction').value = instruction || '';
        document.getElementById('aiRewriteInstruction').focus();
    }, 700);
}

// 模拟改写逻辑（原型演示）
function mockRewrite(text, instruction) {
    const trimmed = text.trim();
    let reason = '优化法律表述，使句子更正式、准确';
    let result = trimmed;

    if (instruction) {
        if (/更正式|正式|严谨/.test(instruction)) {
            reason = '调整为更正式的法律文书表述';
        } else if (/补充|增加|添加/.test(instruction)) {
            reason = '补充必要信息，完善文书内容';
        } else if (/精简|缩短|简洁/.test(instruction)) {
            reason = '精简冗余表述，保留核心内容';
        } else {
            reason = `按“${instruction}”方向改写`;
        }
    }

    // 简单改写规则（仅用于原型演示）
    if (/原告|被告|第三人/.test(trimmed) && /称|认为|主张/.test(trimmed)) {
        result = trimmed.replace(/称/g, '诉称').replace(/认为/g, '主张');
        if (!/本院/.test(result) && instruction && /补充/.test(instruction)) {
            result += '，本院予以确认。';
        }
    } else if (/本院/.test(trimmed) && /查明|认定/.test(trimmed)) {
        result = trimmed.replace(/查明/g, '经审理查明').replace(/认定/g, '依法认定');
        if (instruction && /更正式/.test(instruction)) {
            result = result.replace(/。$/, '，事实清楚，证据充分。');
        }
    } else {
        // 通用改写：加连接词
        result = trimmed.replace(/，/g, '；').replace(/。$/g, '。');
        if (result === trimmed) {
            result = '经审查，' + trimmed;
        }
    }

    return { text: result, reason };
}

function handleAiRewriteKeydown(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        sendAiRewriteInstruction();
    }
}

function sendAiRewriteInstruction() {
    if (aiRewriteLoading) return;
    const input = document.getElementById('aiRewriteInstruction');
    const instruction = input ? input.value.trim() : '';
    if (!instruction) {
        showNotification('请输入改写指令后再发送', 'info');
        if (input) input.focus();
        return;
    }
    const body = document.getElementById('aiRewriteCardBody');
    body.innerHTML = `
        <div class="ai-rewrite-loading">
            <span>系统正在按指令改写</span>
        </div>
    `;
    document.getElementById('aiRewriteActions').style.display = 'none';
    document.getElementById('aiRewriteFooter').style.display = 'none';
    generateAiRewriteResult(aiRewriteOriginalText, instruction);
}

function regenerateAiRewrite() {
    if (aiRewriteLoading || !aiRewriteOriginalText) return;
    const instruction = document.getElementById('aiRewriteInstruction')?.value.trim() || '';
    const body = document.getElementById('aiRewriteCardBody');
    body.innerHTML = `
        <div class="ai-rewrite-loading">
            <span>系统正在重新生成</span>
        </div>
    `;
    document.getElementById('aiRewriteActions').style.display = 'none';
    document.getElementById('aiRewriteFooter').style.display = 'none';
    generateAiRewriteResult(aiRewriteOriginalText, instruction);
}

function getAiRewriteResultText() {
    const el = document.getElementById('aiRewriteResultText');
    return el ? el.value.trim() : aiRewriteCurrentResult;
}

function copyAiRewriteResult() {
    const text = getAiRewriteResultText();
    if (!text) {
        showNotification('暂无可复制的内容', 'info');
        return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
            showNotification('已复制到剪贴板', 'success');
        }).catch(() => {
            fallbackCopy(text);
        });
    } else {
        fallbackCopy(text);
    }
}

function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try {
        document.execCommand('copy');
        showNotification('已复制到剪贴板', 'success');
    } catch (e) {
        showNotification('复制失败，请手动复制', 'error');
    }
    document.body.removeChild(ta);
}

function insertAiRewriteResult() {
    if (!docEditor) return;
    const text = getAiRewriteResultText();
    if (!text) {
        showNotification('暂无可插入的内容', 'info');
        return;
    }
    saveEditHistory();
    const ok = docEditor.insertTextAtCursor(text);
    if (ok) {
        markUnsaved();
        showNotification('已插入到光标位置', 'success');
        hideAiRewriteCard();
    } else {
        showNotification('插入失败，请先在编辑器内定位光标', 'error');
    }
}

function replaceAiRewriteOriginal() {
    if (!docEditor || !aiRewriteRange) {
        showNotification('原文位置已变化，请重新选中文本', 'error');
        return;
    }
    const text = getAiRewriteResultText();
    if (!text) {
        showNotification('暂无可替换的内容', 'info');
        return;
    }

    saveEditHistory();
    const ok = docEditor.replaceTextPreserveFormat(aiRewriteRange, text);
    if (ok) {
        // 高亮替换位置
        const newRange = docEditor.getSelectionRange();
        if (newRange) docEditor.flashRange(newRange, 800);
        markUnsaved();
        showNotification('已替换原文并保留格式', 'success');
        hideAiRewriteCard();
    } else {
        showNotification('替换失败，原文位置可能已变化', 'error');
    }
}

function saveEditHistory() {
    editHistory.push(currentContent);
    document.getElementById('undoBtn').disabled = false;
}

function markUnsaved() {
    hasUnsavedChanges = true;
    document.getElementById('editHint').textContent = '有未保存的精修改动';
}

// ===== 对话精修 =====
function handleChatKeydown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendPolishMessage();
    }
    // 自适应高度
    const input = event.target;
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
}

function sendPolishMessage() {
    const input = document.getElementById('chatInput');
    const message = input.value.trim();
    if (!message) return;

    // 移除空态提示
    const emptyEl = document.querySelector('.polish-chat-empty');
    if (emptyEl) emptyEl.remove();

    // 渲染用户消息
    appendMessage('user', message);
    input.value = '';
    input.style.height = 'auto';

    // 禁用发送按钮
    document.getElementById('sendBtn').disabled = true;

    // 生成结构化审查消息
    const msgId = 'msg-' + Date.now();
    const payload = mockReviewMessage(message);
    payload.msgId = msgId;

    // 1. 渲染助手消息占位（分析中...）
    appendReviewMessagePlaceholder(msgId);

    // 2. 流式展示分析过程，完成后展示修改建议
    streamAnalysisSteps(msgId, payload.analysis, () => {
        // 初始化消息状态
        reviewMessages[msgId] = {
            reviews: payload.reviews,
            snapshotBeforeApply: null,
            appliedReviewIds: []
        };
        // 渲染修改建议列表
        renderReviewList(msgId, payload.reviews);
        // 流式展示审查点卡片
        streamReviewCards(msgId, payload.reviews);
        // 启用发送按钮
        document.getElementById('sendBtn').disabled = false;
    });
}

// 改造后的 appendMessage：支持字符串和对象 payload
function appendMessage(role, payload) {
    const container = document.getElementById('chatMessages');
    const avatarIcon = role === 'user' ? 'fa-user' : 'fa-robot';
    const div = document.createElement('div');
    div.className = `polish-msg ${role}`;

    // payload 为字符串 → 文本气泡
    if (typeof payload === 'string') {
        div.innerHTML = `
            <div class="polish-msg-avatar"><i class="fas ${avatarIcon}"></i></div>
            <div class="polish-msg-bubble">${escapeHtml(payload)}</div>
        `;
    } else if (payload && payload.type === 'review') {
        // 结构化审查消息由 appendReviewMessagePlaceholder 处理
        return;
    }

    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

// 渲染结构化审查消息占位（分析中...）
function appendReviewMessagePlaceholder(msgId) {
    const container = document.getElementById('chatMessages');
    const div = document.createElement('div');
    div.className = 'polish-msg assistant review';
    div.dataset.msgId = msgId;
    div.innerHTML = `
        <div class="polish-msg-avatar"><i class="fas fa-robot"></i></div>
        <div class="polish-msg-bubble">
            <div class="review-analysis" id="analysis-${msgId}">
                <div class="review-analysis-header" onclick="toggleAnalysis('${msgId}')">
                    <i class="fas fa-spinner spinner"></i>
                    <span>分析中...</span>
                </div>
                <div class="review-analysis-body" id="analysisBody-${msgId}"></div>
            </div>
            <div class="review-list" id="reviewList-${msgId}" style="display:none;"></div>
        </div>
    `;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

// 流式展示分析过程
function streamAnalysisSteps(msgId, analysis, onComplete) {
    const body = document.getElementById(`analysisBody-${msgId}`);
    const header = document.querySelector(`#analysis-${msgId} .review-analysis-header`);
    if (!body || !header) return;

    let stepIndex = 0;
    const showNextStep = () => {
        if (stepIndex >= analysis.length) {
            // 全部展示完成
            setTimeout(() => {
                // 更新 header 为"已完成分析"
                header.innerHTML = `
                    <i class="fas fa-check-circle check"></i>
                    <span>已完成分析</span>
                    <i class="fas fa-chevron-down review-analysis-toggle"></i>
                `;
                // 自动折叠
                const analysisEl = document.getElementById(`analysis-${msgId}`);
                if (analysisEl) analysisEl.classList.add('collapsed');
                // 0.3s 后展示修改建议
                setTimeout(onComplete, 300);
            }, 500);
            return;
        }
        const step = analysis[stepIndex];
        const stepDiv = document.createElement('div');
        stepDiv.className = 'review-step';
        stepDiv.innerHTML = `
            <div class="review-step-title">${stepIndex + 1}. ${escapeHtml(step.title)}</div>
            <div class="review-step-content">${escapeHtml(step.content)}</div>
        `;
        body.appendChild(stepDiv);
        const container = document.getElementById('chatMessages');
        container.scrollTop = container.scrollHeight;
        stepIndex++;
        setTimeout(showNextStep, 600);
    };

    // 0.8s 后显示第一步
    setTimeout(showNextStep, 800);
}

// 渲染修改建议列表容器
function renderReviewList(msgId, reviews) {
    const listEl = document.getElementById(`reviewList-${msgId}`);
    if (!listEl) return;

    const count = reviews.length;
    listEl.innerHTML = `
        <div class="review-list-header">
            <span class="review-list-title">修改建议（${count} 项）</span>
            <div class="review-list-actions">
                <button class="review-list-action-btn primary" onclick="applyAllReviews('${msgId}')" id="applyAllBtn-${msgId}">
                    <i class="fas fa-check-double"></i> 全部插入
                </button>
                <button class="review-list-action-btn" onclick="undoAllReviews('${msgId}')" id="undoAllBtn-${msgId}" disabled>
                    <i class="fas fa-undo"></i> 全部撤销
                </button>
            </div>
        </div>
    `;
    listEl.style.display = 'block';
}

// 流式展示审查点卡片
function streamReviewCards(msgId, reviews) {
    const listEl = document.getElementById(`reviewList-${msgId}`);
    if (!listEl) return;

    if (!reviews || reviews.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'review-empty';
        empty.textContent = '未识别到需要修改的内容，请尝试更具体的指令';
        listEl.appendChild(empty);
        return;
    }

    let cardIndex = 0;
    const showNextCard = () => {
        if (cardIndex >= reviews.length) return;
        const review = reviews[cardIndex];
        const card = document.createElement('div');
        card.className = 'review-card';
        card.id = `reviewCard-${msgId}-${review.id}`;
        card.innerHTML = renderReviewCardHtml(msgId, review, cardIndex + 1);
        listEl.appendChild(card);
        const container = document.getElementById('chatMessages');
        container.scrollTop = container.scrollHeight;
        cardIndex++;
        setTimeout(showNextCard, 300);
    };
    showNextCard();
}

// 渲染单个审查点卡片 HTML
function renderReviewCardHtml(msgId, review, index) {
    return `
        <div class="review-card-title">
            <span>${index}. ${escapeHtml(review.title)}</span>
            <span class="review-card-status applied" id="status-${msgId}-${review.id}" style="display:none;">已应用</span>
            <span class="review-card-status ignored" id="ignoredStatus-${msgId}-${review.id}" style="display:none;">已忽略</span>
        </div>
        <div class="review-card-section">
            <div class="review-card-label">风险概述</div>
            <div class="review-card-risk">${escapeHtml(review.risk)}</div>
        </div>
        <div class="review-card-section">
            <div class="review-card-label">修改方案</div>
            <div class="review-card-solution">${escapeHtml(review.solution)}</div>
        </div>
        <div class="review-card-section">
            <div class="review-card-label">修改内容</div>
            <div class="review-card-tabs">
                <button class="review-card-tab active" onclick="switchReviewTab('${msgId}', '${review.id}', 'revised')">修订版</button>
                <button class="review-card-tab" onclick="switchReviewTab('${msgId}', '${review.id}', 'clean')">清洁版</button>
            </div>
            <div class="review-card-content" id="content-${msgId}-${review.id}">
                ${review.revisedText}
            </div>
        </div>
        <div class="review-card-actions">
            <button class="review-card-action-btn" onclick="locateReview('${msgId}', '${review.id}')" id="locateBtn-${msgId}-${review.id}" title="在左侧编辑器中高亮原文">
                <i class="fas fa-crosshairs"></i> 定位原文
            </button>
            <button class="review-card-action-btn danger" onclick="undoReview('${msgId}', '${review.id}')" id="undoBtn-${msgId}-${review.id}" disabled>
                <i class="fas fa-undo"></i> 撤销修订
            </button>
            <button class="review-card-action-btn" onclick="ignoreReview('${msgId}', '${review.id}')" id="ignoreBtn-${msgId}-${review.id}">
                <i class="fas fa-times"></i> 忽略
            </button>
            <button class="review-card-action-btn primary" onclick="applyReview('${msgId}', '${review.id}')" id="applyBtn-${msgId}-${review.id}">
                <i class="fas fa-check"></i> 插入
            </button>
        </div>
    `;
}

// 切换修订版/清洁版
function switchReviewTab(msgId, reviewId, tab) {
    const msgState = reviewMessages[msgId];
    if (!msgState) return;
    const review = msgState.reviews.find(r => r.id === reviewId);
    if (!review) return;

    // 更新 tab 样式
    const card = document.getElementById(`reviewCard-${msgId}-${reviewId}`);
    if (!card) return;
    card.querySelectorAll('.review-card-tab').forEach(btn => btn.classList.remove('active'));
    const tabs = card.querySelectorAll('.review-card-tab');
    if (tab === 'revised') tabs[0].classList.add('active');
    else tabs[1].classList.add('active');

    // 更新内容
    const contentEl = document.getElementById(`content-${msgId}-${reviewId}`);
    if (contentEl) {
        contentEl.innerHTML = tab === 'revised' ? review.revisedText : escapeHtml(review.cleanText);
    }
}

// 折叠/展开分析过程
function toggleAnalysis(msgId) {
    const analysisEl = document.getElementById(`analysis-${msgId}`);
    if (analysisEl) analysisEl.classList.toggle('collapsed');
}

// ===== 修改建议用户操作 =====

// 单点插入
function applyReview(msgId, reviewId) {
    const msgState = reviewMessages[msgId];
    if (!msgState) return;
    const review = msgState.reviews.find(r => r.id === reviewId);
    if (!review || review.applied || review.ignored) return;
    if (!docEditor) { showNotification('编辑器未就绪', 'error'); return; }

    // 记录快照（首次 apply 时）
    if (!msgState.snapshotBeforeApply) {
        msgState.snapshotBeforeApply = docEditor.getContent();
    }

    // 保存到全局撤销栈
    saveEditHistory();

    // 查找原文锚点
    const range = docEditor.findText(review.originalAnchor);
    if (range) {
        // 替换原文
        const ok = docEditor.replaceTextPreserveFormat(range, review.cleanText);
        if (ok) {
            // 高亮
            const newRange = docEditor.findText(review.cleanText.substring(0, 20));
            if (newRange) docEditor.flashRange(newRange, 800);
        }
    } else {
        // 找不到原文，fallback 到光标处插入
        docEditor.insertTextAtCursor(review.cleanText);
        showNotification('原文位置已变化，已插入到光标处', 'info');
    }

    // 更新状态
    review.applied = true;
    msgState.appliedReviewIds.push(reviewId);
    updateReviewCardStatus(msgId, reviewId);
    markUnsaved();
    updateReviewListBatchButtons(msgId);
}

// 全部插入
function applyAllReviews(msgId) {
    const msgState = reviewMessages[msgId];
    if (!msgState) return;
    let success = 0;
    let failed = 0;
    msgState.reviews.forEach(review => {
        if (review.applied || review.ignored) return;
        if (!docEditor) return;

        if (!msgState.snapshotBeforeApply) {
            msgState.snapshotBeforeApply = docEditor.getContent();
        }
        saveEditHistory();

        const range = docEditor.findText(review.originalAnchor);
        if (range) {
            const ok = docEditor.replaceTextPreserveFormat(range, review.cleanText);
            if (ok) {
                review.applied = true;
                msgState.appliedReviewIds.push(review.id);
                updateReviewCardStatus(msgId, review.id);
                success++;
            } else { failed++; }
        } else {
            docEditor.insertTextAtCursor(review.cleanText);
            review.applied = true;
            msgState.appliedReviewIds.push(review.id);
            updateReviewCardStatus(msgId, review.id);
            failed++;
        }
    });

    markUnsaved();
    updateReviewListBatchButtons(msgId);
    if (failed > 0) {
        showNotification(`${success} 项成功插入，${failed} 项因原文变化已插入到光标处`, 'info');
    } else {
        showNotification(`已插入 ${success} 项修改`, 'success');
    }
}

// 撤销单点
function undoReview(msgId, reviewId) {
    const msgState = reviewMessages[msgId];
    if (!msgState) return;
    const review = msgState.reviews.find(r => r.id === reviewId);
    if (!review || !review.applied) return;
    if (!docEditor) return;
    if (!msgState.snapshotBeforeApply) return;

    // 保存当前状态到全局撤销栈
    saveEditHistory();

    // 恢复到操作前快照
    docEditor.setContent(msgState.snapshotBeforeApply);

    // 移除该 review 的已应用标记
    const idx = msgState.appliedReviewIds.indexOf(reviewId);
    if (idx >= 0) msgState.appliedReviewIds.splice(idx, 1);
    review.applied = false;

    // 重新应用其他已应用的 review
    msgState.appliedReviewIds.forEach(rid => {
        const r = msgState.reviews.find(x => x.id === rid);
        if (r) {
            const range = docEditor.findText(r.originalAnchor);
            if (range) {
                docEditor.replaceTextPreserveFormat(range, r.cleanText);
            } else {
                docEditor.insertTextAtCursor(r.cleanText);
            }
        }
    });

    // 若全部撤销，清除快照
    if (msgState.appliedReviewIds.length === 0) {
        msgState.snapshotBeforeApply = null;
    }

    updateReviewCardStatus(msgId, reviewId);
    updateReviewListBatchButtons(msgId);
    showNotification('已撤销该修订', 'success');
}

// 全部撤销
function undoAllReviews(msgId) {
    const msgState = reviewMessages[msgId];
    if (!msgState) return;
    if (!msgState.snapshotBeforeApply || !docEditor) return;

    saveEditHistory();
    docEditor.setContent(msgState.snapshotBeforeApply);

    // 清除所有已应用标记
    msgState.reviews.forEach(r => { r.applied = false; });
    msgState.appliedReviewIds = [];
    msgState.snapshotBeforeApply = null;

    // 更新所有卡片状态
    msgState.reviews.forEach(r => updateReviewCardStatus(msgId, r.id));
    updateReviewListBatchButtons(msgId);
    showNotification('已撤销全部修订', 'success');
}

// 定位原文
function locateReview(msgId, reviewId) {
    const msgState = reviewMessages[msgId];
    if (!msgState) return;
    const review = msgState.reviews.find(r => r.id === reviewId);
    if (!review || !docEditor) return;

    const range = docEditor.findText(review.originalAnchor);
    if (range) {
        docEditor.scrollToRange(range, true);
        showNotification('已定位到原文位置', 'info');
    } else {
        showNotification('原文位置已变化，无法定位', 'error');
    }
}

// 忽略
function ignoreReview(msgId, reviewId) {
    const msgState = reviewMessages[msgId];
    if (!msgState) return;
    const review = msgState.reviews.find(r => r.id === reviewId);
    if (!review || review.applied) return;

    review.ignored = true;
    updateReviewCardStatus(msgId, reviewId);
}

// 更新审查点卡片状态显示
function updateReviewCardStatus(msgId, reviewId) {
    const msgState = reviewMessages[msgId];
    if (!msgState) return;
    const review = msgState.reviews.find(r => r.id === reviewId);
    if (!review) return;

    const card = document.getElementById(`reviewCard-${msgId}-${reviewId}`);
    if (!card) return;

    const applyBtn = document.getElementById(`applyBtn-${msgId}-${reviewId}`);
    const undoBtn = document.getElementById(`undoBtn-${msgId}-${reviewId}`);
    const ignoreBtn = document.getElementById(`ignoreBtn-${msgId}-${reviewId}`);
    const locateBtn = document.getElementById(`locateBtn-${msgId}-${reviewId}`);
    const statusEl = document.getElementById(`status-${msgId}-${reviewId}`);
    const ignoredStatusEl = document.getElementById(`ignoredStatus-${msgId}-${reviewId}`);

    card.classList.remove('applied', 'ignored');

    if (review.applied) {
        card.classList.add('applied');
        if (applyBtn) applyBtn.disabled = true;
        if (undoBtn) undoBtn.disabled = false;
        if (ignoreBtn) ignoreBtn.disabled = true;
        if (statusEl) statusEl.style.display = 'inline-block';
        if (ignoredStatusEl) ignoredStatusEl.style.display = 'none';
    } else if (review.ignored) {
        card.classList.add('ignored');
        if (applyBtn) applyBtn.disabled = true;
        if (undoBtn) undoBtn.disabled = true;
        if (ignoreBtn) ignoreBtn.disabled = true;
        if (statusEl) statusEl.style.display = 'none';
        if (ignoredStatusEl) ignoredStatusEl.style.display = 'inline-block';
    } else {
        if (applyBtn) applyBtn.disabled = false;
        if (undoBtn) undoBtn.disabled = true;
        if (ignoreBtn) ignoreBtn.disabled = false;
        if (statusEl) statusEl.style.display = 'none';
        if (ignoredStatusEl) ignoredStatusEl.style.display = 'none';
    }

    // 定位原文按钮：实时校验
    if (locateBtn && docEditor) {
        const range = docEditor.findText(review.originalAnchor);
        locateBtn.disabled = !range;
        locateBtn.title = range ? '在左侧编辑器中高亮原文' : '原文位置已变化，无法定位';
    }
}

// 更新批量操作按钮状态
function updateReviewListBatchButtons(msgId) {
    const msgState = reviewMessages[msgId];
    if (!msgState) return;
    const applyAllBtn = document.getElementById(`applyAllBtn-${msgId}`);
    const undoAllBtn = document.getElementById(`undoAllBtn-${msgId}`);
    const hasUnapplied = msgState.reviews.some(r => !r.applied && !r.ignored);
    const hasApplied = msgState.appliedReviewIds.length > 0;
    if (applyAllBtn) applyAllBtn.disabled = !hasUnapplied;
    if (undoAllBtn) undoAllBtn.disabled = !hasApplied;
}

// ===== 模拟审查消息生成（原型演示） =====
function mockReviewMessage(instruction) {
    if (/重写|改写/.test(instruction)) return mockRewriteTemplate(instruction);
    if (/格式|排版|格式问题/.test(instruction)) return mockFormatTemplate(instruction);
    if (/补充|增加|添加/.test(instruction)) return mockSupplementTemplate(instruction);
    return mockGenericTemplate(instruction);
}

function mockRewriteTemplate(instruction) {
    return {
        type: 'review',
        analysis: [
            { title: '梳理历史任务', content: '本次为首次精修，无历史任务可参考。' },
            { title: '明确用户需求', content: `用户希望重写文书内容，指令为："${instruction}"。需结合案件事实与法律依据进行改写。` },
            { title: '定位与检索', content: '已定位到原文"本院认为"部分，并检索到《民法典》相关法条。' },
            { title: '起草与完善', content: '基于案件材料与要件清单，生成 2 处修改建议，重点补充法律依据与说理逻辑。' }
        ],
        reviews: [
            {
                id: 'r1',
                title: '本院认为部分缺少法律依据',
                risk: '原文"本院认为"段落仅陈述事实，未引用具体法条，说理不充分，可能影响文书说服力。',
                solution: '补充《中华人民共和国民法典》第六百七十九条引用，增强说理逻辑。',
                originalAnchor: '本院认为，原告与被告之间存在借贷关系。',
                revisedText: '本院认为，<del>原告与被告之间存在借贷关系</del>。<ins>根据《中华人民共和国民法典》第六百七十九条，自然人之间的借款合同自贷款人提供借款时成立。本案中，原告已通过银行转账向被告支付借款，双方借贷关系依法成立</ins>。',
                cleanText: '本院认为，根据《中华人民共和国民法典》第六百七十九条，自然人之间的借款合同自贷款人提供借款时成立。本案中，原告已通过银行转账向被告支付借款，双方借贷关系依法成立。',
                applied: false,
                ignored: false
            },
            {
                id: 'r2',
                title: '裁判主文表述不够规范',
                risk: '原裁判主文未明确履行期限，可能导致执行困难。',
                solution: '补充履行期限表述，明确"于本判决生效之日起十日内"。',
                originalAnchor: '被告应返还原告借款本金。',
                revisedText: '被告应返还原告借款本金<ins>，于本判决生效之日起十日内付清</ins>。',
                cleanText: '被告应返还原告借款本金，于本判决生效之日起十日内付清。',
                applied: false,
                ignored: false
            }
        ]
    };
}

function mockFormatTemplate(instruction) {
    return {
        type: 'review',
        analysis: [
            { title: '读取文书结构', content: '已读取文书全文，识别段落结构、标题层级与编号。' },
            { title: '识别格式异常', content: `按指令"${instruction}"检查，发现 2 处格式问题。` },
            { title: '生成格式修正建议', content: '针对段落缩进、编号不规范等问题生成修正建议。' }
        ],
        reviews: [
            {
                id: 'r1',
                title: '首段缩进不规范',
                risk: '文书首段未设置首行缩进，不符合法律文书格式规范。',
                solution: '为首段添加首行缩进 2 字符。',
                originalAnchor: '原告张三诉称',
                revisedText: '<ins>　　</ins>原告张三诉称',
                cleanText: '　　原告张三诉称',
                applied: false,
                ignored: false
            },
            {
                id: 'r2',
                title: '条款编号不连续',
                risk: '文书第3条后直接跳到第5条，编号不连续。',
                solution: '将原第5条改为第4条，后续编号顺延。',
                originalAnchor: '第五条',
                revisedText: '<del>第五条</del><ins>第四条</ins>',
                cleanText: '第四条',
                applied: false,
                ignored: false
            }
        ]
    };
}

function mockSupplementTemplate(instruction) {
    return {
        type: 'review',
        analysis: [
            { title: '定位补充目标', content: `按指令"${instruction}"，定位到需要补充的段落。` },
            { title: '检索证据材料', content: '从个案知识库中检索相关证据与法条。' },
            { title: '生成补充内容', content: '基于检索结果生成 1 处补充建议。' }
        ],
        reviews: [
            {
                id: 'r1',
                title: '事实认定部分缺少证据佐证',
                risk: '事实认定段落仅陈述事实，未列明对应证据，可能影响事实认定的客观性。',
                solution: '补充证据编号与证明内容。',
                originalAnchor: '经审理查明，被告于2024年1月向原告借款。',
                revisedText: '经审理查明，被告于2024年1月向原告借款<ins>（见原告提交的证据一：银行转账凭证，证明原告于2024年1月5日向被告转账人民币5万元）</ins>。',
                cleanText: '经审理查明，被告于2024年1月向原告借款（见原告提交的证据一：银行转账凭证，证明原告于2024年1月5日向被告转账人民币5万元）。',
                applied: false,
                ignored: false
            }
        ]
    };
}

function mockGenericTemplate(instruction) {
    return {
        type: 'review',
        analysis: [
            { title: '理解用户需求', content: `已接收指令："${instruction}"。` },
            { title: '分析文书内容', content: '通读文书全文，识别可优化的表述与结构。' },
            { title: '生成修改建议', content: '生成 1 处通用修改建议。' }
        ],
        reviews: [
            {
                id: 'r1',
                title: '文书表述可进一步优化',
                risk: '部分表述口语化，不符合法律文书规范用语。',
                solution: '将口语化表述调整为规范法律用语。',
                originalAnchor: '被告说没钱还',
                revisedText: '<del>被告说没钱还</del><ins>被告辩称暂无还款能力</ins>',
                cleanText: '被告辩称暂无还款能力',
                applied: false,
                ignored: false
            }
        ]
    };
}

// ===== 上传文书入口 =====
function triggerUploadDocument() {
    const input = document.getElementById('uploadDocInput');
    if (input) input.click();
}

function handleUploadDocument(event) {
    const file = event.target.files[0];
    if (!file) return;
    event.target.value = ''; // 允许重复上传同一文件

    const reader = new FileReader();
    reader.onload = (e) => {
        const content = e.target.result || '';
        // 进入上传模式
        isUploadMode = true;
        polishCaseItem = null;
        polishDoc = null;
        polishVersion = null;
        polishCaseId = '';
        polishVersionId = '';
        originalContent = content;
        currentContent = content;
        editHistory = [];
        hasUnsavedChanges = false;
        reviewMessages = {};

        // 更新 UI
        document.getElementById('polishDocTitle').textContent = file.name.replace(/\.(html?|txt)$/i, '');
        document.getElementById('polishCaseName').textContent = '上传文书（无关联案件）';
        document.getElementById('versionTag').textContent = '上传';
        document.getElementById('editHint').textContent = '描述要修改的内容...';
        document.getElementById('undoBtn').disabled = true;

        // 保存按钮改为"下载文书"
        const saveBtn = document.getElementById('saveBtn');
        saveBtn.innerHTML = '<i class="fas fa-download"></i> 下载文书';
        saveBtn.onclick = downloadDocumentFile;

        // 初始化编辑器
        initDocEditor(content);
        renderContextInfo();

        // 清空对话区
        document.getElementById('chatMessages').innerHTML = `
            <div class="polish-chat-empty">
                <i class="fas fa-comment-dots"></i>
                <div>输入修改需求，系统将定位原文并给出修改建议</div>
                <div style="margin-top:6px;font-size:12px;">例如：重写本院认为部分、补充法条引用、检查格式问题</div>
            </div>
        `;

        showNotification('文书已上传，可开始精修', 'success');
    };
    reader.onerror = () => {
        showNotification('文件读取失败', 'error');
    };
    reader.readAsText(file);
}

function downloadDocumentFile() {
    const content = docEditor ? docEditor.getContent() : currentContent;
    const title = document.getElementById('polishDocTitle').textContent || '文书';
    const blob = new Blob([content], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = title + '.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showNotification('文书已下载', 'success');
}

function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ===== 撤销 =====
function undoLastEdit() {
    if (editHistory.length === 0) {
        showNotification('没有可撤销的操作', 'info');
        return;
    }
    currentContent = editHistory.pop();
    if (docEditor) docEditor.setContent(currentContent);
    if (editHistory.length === 0) {
        document.getElementById('undoBtn').disabled = true;
    }
    hasUnsavedChanges = editHistory.length > 0;
    if (!hasUnsavedChanges) {
        document.getElementById('editHint').textContent = '精修指令将在此区域生效';
    }
    showNotification('已撤销上一步精修', 'success');
}

// ===== 保存为新版本（任务 5.3）=====
function saveAsNewVersion() {
    if (!polishCaseItem) {
        showNotification('案件数据缺失，无法保存', 'error');
        return;
    }

    // 获取编辑区最新内容（支持用户手动编辑）
    const latestContent = docEditor ? docEditor.getContent() : currentContent;

    // 从原版本继承配置
    const origCfg = polishVersion?.config || {};
    const versionData = {
        type: 'polish',
        genMethod: polishVersion?.genMethod || 'material',
        source: 'ai',
        content: latestContent,
        createdBy: getCurrentUserName(),
        polishedFrom: polishVersionId || undefined,
        config: {
            docType: origCfg.docType || 'judgment',
            template: origCfg.template || '',
            prompt: origCfg.prompt || '',
            modelId: origCfg.modelId || '',
            materialIds: Array.isArray(origCfg.materialIds) ? [...origCfg.materialIds] : [],
            materialTokens: origCfg.materialTokens || 0,
            stepsSnapshot: Array.isArray(origCfg.stepsSnapshot) ? origCfg.stepsSnapshot : null
        }
    };

    const savedVersion = addDocumentVersion(polishCaseItem.id, versionData);
    if (savedVersion) {
        hasUnsavedChanges = false;
        editHistory = [];
        document.getElementById('undoBtn').disabled = true;
        document.getElementById('editHint').textContent = '已保存';

        // 更新版本标签
        const versions = getAllDocumentVersions(polishCaseItem.id);
        document.getElementById('versionTag').textContent = `精修版（共 ${versions.length} 版）`;

        showNotification('已保存为新版本', 'success');
        // 提供返回入口
        const saveBtn = document.getElementById('saveBtn');
        saveBtn.innerHTML = '<i class="fas fa-check"></i> 已保存';
        saveBtn.disabled = true;
        setTimeout(() => {
            saveBtn.innerHTML = '<i class="fas fa-save"></i> 保存为新版本';
            saveBtn.disabled = false;
        }, 2000);
    } else {
        showNotification('保存失败，请重试', 'error');
    }
}

// ===== 返回案件（任务 5.4）=====
function goBackToCase() {
    if (hasUnsavedChanges) {
        if (!confirm('有未保存的精修改动，确定要离开吗？')) return;
    }
    if (polishCaseId) {
        window.location.href = `case-files.html?caseId=${encodeURIComponent(polishCaseId)}`;
    } else {
        window.location.href = 'cases.html';
    }
}

// 未保存时关闭页面二次确认
window.addEventListener('beforeunload', function(e) {
    if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
    }
});

// ===== 启动 =====
initPolishPage();

// 全局点击隐藏 AI 改写工具条/卡片（当点击目标不在编辑器区域内时）
document.addEventListener('mousedown', (e) => {
    const root = document.getElementById('docEditorRoot');
    const toolbar = document.getElementById('aiRewriteToolbar');
    const card = document.getElementById('aiRewriteCard');
    if (!root) return;
    const clickInsideEditor = root.contains(e.target);
    const clickInToolbar = toolbar && toolbar.contains(e.target);
    const clickInCard = card && card.contains(e.target);
    if (!clickInsideEditor && !clickInToolbar && !clickInCard) {
        hideAiRewriteToolbar();
        hideAiRewriteCard();
    }
});

// ===== 可拖动分隔条（文书 / 精修对话 宽度调整） =====
// 默认 3:1（文书 75% / 对话 25%），用户可拖动分隔条调整
// 拖动时动态设置两列 flex-basis，松手后持久化到 localStorage
(function initPolishResizer() {
    const resizer = document.getElementById('polishResizer');
    const docCol = document.querySelector('.polish-doc-col');
    const chatCol = document.querySelector('.polish-chat-col');
    if (!resizer || !docCol || !chatCol) return;

    // 恢复上次比例
    try {
        const saved = localStorage.getItem('polishDocFlex');
        if (saved) {
            const parts = saved.split('|');
            if (parts.length === 2) {
                docCol.style.flex = parts[0];
                chatCol.style.flex = parts[1];
            }
        }
    } catch (e) { /* ignore */ }

    let dragging = false;
    let startX = 0;
    let startBodyWidth = 0;
    let startDocWidth = 0;

    resizer.addEventListener('mousedown', (e) => {
        dragging = true;
        startX = e.clientX;
        const body = document.querySelector('.polish-body');
        startBodyWidth = body ? body.getBoundingClientRect().width : window.innerWidth;
        startDocWidth = docCol.getBoundingClientRect().width;
        resizer.classList.add('dragging');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        const delta = e.clientX - startX;
        let newDocWidth = startDocWidth + delta;
        // 限制最小宽度（与 CSS min-width 对齐）
        const minDoc = 320;
        const minChat = 240;
        const maxDoc = startBodyWidth - 6 - minChat; // 6 = resizer 宽度
        if (newDocWidth < minDoc) newDocWidth = minDoc;
        if (newDocWidth > maxDoc) newDocWidth = maxDoc;
        const newChatWidth = startBodyWidth - 6 - newDocWidth;
        const docRatio = newDocWidth / startBodyWidth;
        const chatRatio = newChatWidth / startBodyWidth;
        docCol.style.flex = `${docRatio} 1 0`;
        chatCol.style.flex = `${chatRatio} 1 0`;
    });

    document.addEventListener('mouseup', () => {
        if (!dragging) return;
        dragging = false;
        resizer.classList.remove('dragging');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        // 持久化
        try {
            localStorage.setItem('polishDocFlex', `${docCol.style.flex}|${chatCol.style.flex}`);
        } catch (e) { /* ignore */ }
    });
})();

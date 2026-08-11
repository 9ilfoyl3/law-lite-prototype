// ============ 可复用文档编辑器组件 ============
// 用于案件详情页生成结果区与文书精修页左侧文书编辑
// 基于 contenteditable，提供符合法律文书排版习惯的编辑体验

(function(global) {
    'use strict';

    const DEFAULT_OPTIONS = {
        placeholder: '暂无内容',
        minHeight: '400px',
        showToolbar: true,
        readonly: false,
        onChange: null,
        onFocus: null,
        onBlur: null
    };

    class DocEditor {
        constructor(container, options = {}) {
            this.container = typeof container === 'string' ? document.getElementById(container) : container;
            if (!this.container) {
                throw new Error('DocEditor: 容器元素不存在');
            }
            this.options = Object.assign({}, DEFAULT_OPTIONS, options);
            this._init();
        }

        _init() {
            this.container.classList.add('doc-editor-root');
            this.container.innerHTML = '';

            // 工具栏
            if (this.options.showToolbar) {
                this.toolbar = this._buildToolbar();
                this.container.appendChild(this.toolbar);
            }

            // 编辑区外壳
            this.editorShell = document.createElement('div');
            this.editorShell.className = 'doc-editor-shell';
            this.editorShell.setAttribute('tabindex', '0');

            // 纸张
            this.paper = document.createElement('div');
            this.paper.className = 'doc-editor-paper';
            this.paper.setAttribute('contenteditable', this.options.readonly ? 'false' : 'true');
            this.paper.setAttribute('spellcheck', 'false');
            this.paper.innerHTML = this.options.content || `<p style="color:var(--text-muted);">${this.options.placeholder}</p>`;

            this.editorShell.appendChild(this.paper);
            this.container.appendChild(this.editorShell);

            // 事件绑定
            this._bindEvents();
        }

        _buildToolbar() {
            const toolbar = document.createElement('div');
            toolbar.className = 'doc-editor-toolbar';

            const groups = [
                [
                    { cmd: 'undo', icon: 'fa-undo', title: '撤销' },
                    { cmd: 'redo', icon: 'fa-redo', title: '重做' }
                ],
                [
                    { cmd: 'bold', icon: 'fa-bold', title: '加粗' },
                    { cmd: 'italic', icon: 'fa-italic', title: '斜体' },
                    { cmd: 'underline', icon: 'fa-underline', title: '下划线' },
                    { cmd: 'strikeThrough', icon: 'fa-strikethrough', title: '删除线' }
                ],
                [
                    { cmd: 'formatBlock', value: 'H2', icon: 'fa-heading', title: '大标题', label: 'H2' },
                    { cmd: 'formatBlock', value: 'H3', icon: 'fa-heading', title: '小标题', label: 'H3' },
                    { cmd: 'formatBlock', value: 'P', icon: 'fa-paragraph', title: '正文', label: 'P' }
                ],
                [
                    { cmd: 'justifyLeft', icon: 'fa-align-left', title: '左对齐' },
                    { cmd: 'justifyCenter', icon: 'fa-align-center', title: '居中' },
                    { cmd: 'justifyRight', icon: 'fa-align-right', title: '右对齐' },
                    { cmd: 'justifyFull', icon: 'fa-align-justify', title: '两端对齐' }
                ],
                [
                    { cmd: 'insertOrderedList', icon: 'fa-list-ol', title: '有序列表' },
                    { cmd: 'insertUnorderedList', icon: 'fa-list-ul', title: '无序列表' }
                ],
                [
                    { cmd: 'removeFormat', icon: 'fa-eraser', title: '清除格式' }
                ]
            ];

            groups.forEach((group, idx) => {
                const groupEl = document.createElement('div');
                groupEl.className = 'doc-editor-toolbar-group';
                group.forEach(item => {
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'doc-editor-toolbar-btn';
                    btn.title = item.title;
                    btn.dataset.cmd = item.cmd;
                    btn.dataset.value = item.value || '';
                    btn.innerHTML = item.label
                        ? `<i class="fas ${item.icon}"></i><span class="btn-label">${item.label}</span>`
                        : `<i class="fas ${item.icon}"></i>`;
                    btn.addEventListener('click', (e) => {
                        e.preventDefault();
                        this.execCommand(item.cmd, item.value || null);
                    });
                    groupEl.appendChild(btn);
                });
                toolbar.appendChild(groupEl);
                if (idx < groups.length - 1) {
                    const sep = document.createElement('div');
                    sep.className = 'doc-editor-toolbar-sep';
                    toolbar.appendChild(sep);
                }
            });

            return toolbar;
        }

        _bindEvents() {
            const paper = this.paper;

            // 占位符处理：聚焦时若只有占位符则清空
            paper.addEventListener('focus', () => {
                if (this._isPlaceholder()) {
                    paper.innerHTML = '<p><br></p>';
                }
                if (typeof this.options.onFocus === 'function') {
                    this.options.onFocus();
                }
            });

            paper.addEventListener('blur', () => {
                if (this._isEmpty()) {
                    paper.innerHTML = `<p style="color:var(--text-muted);">${this.options.placeholder}</p>`;
                }
                if (typeof this.options.onBlur === 'function') {
                    this.options.onBlur();
                }
            });

            // 输入/修改回调
            let inputTimer = null;
            paper.addEventListener('input', () => {
                if (typeof this.options.onChange === 'function') {
                    clearTimeout(inputTimer);
                    inputTimer = setTimeout(() => this.options.onChange(this.getContent()), 150);
                }
            });

            // 快捷键：Ctrl/Cmd + S 阻止默认保存
            paper.addEventListener('keydown', (e) => {
                if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                    e.preventDefault();
                }
            });

            // 工具栏按钮 active 状态
            if (this.toolbar) {
                paper.addEventListener('keyup', () => this._updateToolbarState());
                paper.addEventListener('mouseup', () => this._updateToolbarState());
                paper.addEventListener('click', () => this._updateToolbarState());
            }

            // 选区变化监听（用于 AI 改写浮动工具条）
            this._selectionListeners = [];
            const onSelChange = () => this._notifySelectionChange();
            document.addEventListener('selectionchange', onSelChange);
            paper.addEventListener('mouseup', onSelChange);
            paper.addEventListener('keyup', onSelChange);
            paper.addEventListener('blur', onSelChange);
            this._boundSelectionChange = onSelChange;
        }

        _notifySelectionChange() {
            const sel = window.getSelection();
            const range = sel && sel.rangeCount ? sel.getRangeAt(0) : null;
            let valid = false;
            if (range && !range.collapsed && this.paper.contains(range.commonAncestorContainer)) {
                const text = (range.toString() || '').trim();
                valid = text.length > 0;
            }
            this._selectionListeners.forEach(cb => {
                try { cb(range, valid); } catch (e) { console.warn(e); }
            });
        }

        onSelectionChange(callback) {
            if (typeof callback === 'function') {
                this._selectionListeners.push(callback);
            }
        }

        getSelectionRange() {
            const sel = window.getSelection();
            if (!sel || !sel.rangeCount) return null;
            const range = sel.getRangeAt(0);
            if (!this.paper.contains(range.commonAncestorContainer)) return null;
            return range;
        }

        getSelectedText() {
            const range = this.getSelectionRange();
            return range ? (range.toString() || '').trim() : '';
        }

        _isPlaceholder() {
            return this.paper.innerHTML.trim() === `<p style="color:var(--text-muted);">${this.options.placeholder}</p>`;
        }

        _isEmpty() {
            const text = this.paper.innerText || '';
            return text.trim().length === 0 || this.paper.innerHTML.trim() === '<p><br></p>';
        }

        _updateToolbarState() {
            if (!this.toolbar) return;
            this.toolbar.querySelectorAll('.doc-editor-toolbar-btn').forEach(btn => {
                const cmd = btn.dataset.cmd;
                const value = btn.dataset.value;
                let active = false;
                try {
                    if (cmd === 'formatBlock') {
                        const block = document.queryCommandValue('formatBlock');
                        active = block.toUpperCase() === value.toUpperCase();
                    } else {
                        active = document.queryCommandState(cmd);
                    }
                } catch (e) {
                    active = false;
                }
                btn.classList.toggle('active', active);
            });
        }

        execCommand(command, value = null) {
            this.paper.focus();
            try {
                document.execCommand(command, false, value);
            } catch (e) {
                console.warn('DocEditor execCommand failed:', command, e);
            }
            this._updateToolbarState();
        }

        getContent() {
            if (this._isPlaceholder() || this._isEmpty()) return '';
            return this.paper.innerHTML;
        }

        setContent(html) {
            if (!html || html.trim() === '') {
                this.paper.innerHTML = `<p style="color:var(--text-muted);">${this.options.placeholder}</p>`;
            } else {
                this.paper.innerHTML = html;
            }
            this._updateToolbarState();
        }

        getText() {
            return this.paper.innerText || '';
        }

        focus() {
            this.paper.focus();
        }

        setReadonly(readonly) {
            this.options.readonly = readonly;
            this.paper.setAttribute('contenteditable', readonly ? 'false' : 'true');
            if (this.toolbar) {
                this.toolbar.style.display = readonly ? 'none' : '';
            }
        }

        // 在指定 Range 处替换文本，尽量保留段落格式
        // 简单实现：当 range 完全位于单一文本节点内时直接替换 textContent；
        // 否则尝试用 surroundContents 包裹后替换文本节点
        replaceTextPreserveFormat(range, newText) {
            if (!range) return false;
            this.paper.focus();

            // 记录选区文本用于回退匹配
            const originalText = range.toString();

            try {
                // 情况1：选区在单个文本节点内
                const startNode = range.startContainer;
                const endNode = range.endContainer;
                if (startNode === endNode && startNode.nodeType === Node.TEXT_NODE) {
                    const fullText = startNode.textContent;
                    const before = fullText.substring(0, range.startOffset);
                    const after = fullText.substring(range.endOffset);
                    startNode.textContent = before + newText + after;
                    return true;
                }

                // 情况2：跨节点选区，使用提取+重建文本节点
                const fragment = range.extractContents();
                // 仅保留最外层容器（段落级）避免破坏结构
                const wrapper = document.createElement('span');
                wrapper.appendChild(fragment);
                const textNodes = [];
                const walk = (node) => {
                    if (node.nodeType === Node.TEXT_NODE) {
                        textNodes.push(node);
                    } else {
                        Array.from(node.childNodes).forEach(walk);
                    }
                };
                walk(wrapper);
                const replacedFragment = document.createDocumentFragment();
                // 如果 newText 包含换行，按行拆分
                const lines = String(newText).split(/\n/);
                lines.forEach((line, idx) => {
                    if (idx > 0) replacedFragment.appendChild(document.createElement('br'));
                    if (line) replacedFragment.appendChild(document.createTextNode(line));
                });

                // 尝试定位原段落并在段落内替换
                let anchor = range.startContainer;
                while (anchor && anchor !== this.paper && !/^(P|H[1-6]|LI)$/i.test(anchor.tagName)) {
                    anchor = anchor.parentNode;
                }
                if (anchor && anchor !== this.paper) {
                    // 清空原段落内所有文本节点，保留子元素结构较复杂，这里做简化：
                    // 在原 range 位置插入新 fragment，并删除旧选区文本节点
                    range.insertNode(replacedFragment);
                    textNodes.forEach(n => {
                        if (n.parentNode) n.parentNode.removeChild(n);
                    });
                    // 清理空元素
                    this._cleanupEmptyElements(anchor);
                    return true;
                }

                // 兜底：直接插入
                range.insertNode(replacedFragment);
                return true;
            } catch (e) {
                console.warn('replaceTextPreserveFormat failed:', e);
                // 最终兜底：用原始文本在编辑器内查找替换
                return this._fallbackReplace(originalText, newText);
            }
        }

        _fallbackReplace(originalText, newText) {
            if (!originalText) return false;
            const walker = document.createTreeWalker(this.paper, NodeFilter.SHOW_TEXT, null, false);
            let node;
            while ((node = walker.nextNode())) {
                const idx = node.textContent.indexOf(originalText);
                if (idx >= 0) {
                    node.textContent = node.textContent.substring(0, idx) + newText + node.textContent.substring(idx + originalText.length);
                    return true;
                }
            }
            return false;
        }

        _cleanupEmptyElements(root) {
            const empties = [];
            const walk = (node) => {
                if (node.nodeType === Node.ELEMENT_NODE && !/^(BR|IMG)$/i.test(node.tagName)) {
                    if ((node.textContent || '').trim() === '' && node.children.length === 0) {
                        empties.push(node);
                    }
                }
                Array.from(node.childNodes).forEach(walk);
            };
            walk(root);
            empties.forEach(el => {
                if (el.parentNode) el.parentNode.removeChild(el);
            });
        }

        // 在当前光标位置插入文本（保留光标处格式）
        insertTextAtCursor(text) {
            const sel = window.getSelection();
            if (!sel || !sel.rangeCount) return false;
            const range = sel.getRangeAt(0);
            if (!this.paper.contains(range.commonAncestorContainer)) return false;
            this.paper.focus();
            const lines = String(text).split(/\n/);
            lines.forEach((line, idx) => {
                if (idx > 0) document.execCommand('insertHTML', false, '<br>');
                if (line) document.execCommand('insertText', false, line);
            });
            return true;
        }

        // 高亮某个 Range 区域，闪烁后移除
        flashRange(range, duration = 800) {
            if (!range) return;
            try {
                const marker = document.createElement('span');
                marker.style.background = 'rgba(251, 191, 36, 0.35)';
                marker.style.transition = 'background 0.3s';
                marker.dataset.aiFlash = '1';
                range.surroundContents(marker);
                setTimeout(() => {
                    marker.style.background = 'transparent';
                    setTimeout(() => {
                        if (marker.parentNode) {
                            const parent = marker.parentNode;
                            while (marker.firstChild) parent.insertBefore(marker.firstChild, marker);
                            parent.removeChild(marker);
                        }
                    }, 300);
                }, duration);
            } catch (e) {
                console.warn('flashRange failed:', e);
            }
        }

        // 在编辑器中查找指定文本，返回第一个匹配的 Range
        findText(text) {
            if (!text) return null;
            const target = String(text).trim();
            if (!target) return null;
            const walker = document.createTreeWalker(this.paper, NodeFilter.SHOW_TEXT, null, false);
            let node;
            while ((node = walker.nextNode())) {
                const idx = node.textContent.indexOf(target);
                if (idx >= 0) {
                    const range = document.createRange();
                    range.setStart(node, idx);
                    range.setEnd(node, idx + target.length);
                    return range;
                }
            }
            return null;
        }

        // 滚动到指定 Range 并高亮
        scrollToRange(range, highlight = true) {
            if (!range) return;
            try {
                const rect = range.getBoundingClientRect();
                const shellRect = this.editorShell.getBoundingClientRect();
                this.editorShell.scrollTop += (rect.top - shellRect.top - 100);
                if (highlight) this.flashRange(range, 1500);
            } catch (e) {
                console.warn('scrollToRange failed:', e);
            }
        }

        destroy() {
            if (this._boundSelectionChange) {
                document.removeEventListener('selectionchange', this._boundSelectionChange);
            }
            this.container.innerHTML = '';
            this.container.classList.remove('doc-editor-root');
        }
    }

    // 工厂函数
    function createDocEditor(container, options) {
        return new DocEditor(container, options);
    }

    global.DocEditor = DocEditor;
    global.createDocEditor = createDocEditor;
})(window);

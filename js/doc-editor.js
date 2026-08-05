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

        destroy() {
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

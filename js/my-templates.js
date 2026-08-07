// ============ My Templates (用户侧自定义文书模板) ============
// v1.0 个人文书模板维护，关联文书类型
// v1.1 移除「关联案由」字段：模板作为所属文书类型的下属，案由匹配通过文书类型→workflow 链路间接实现
// v1.2 模板正文交互改造：① 模板正文从 textarea 在线编辑改为文件上传；② 新增/编辑表单提供模板示例下载；③ 卡片列表新增「预览」「下载」「重新上传」三个操作按钮；④ 未上传正文时预览/下载置灰；⑤ 上传内容以纯文本持久化到 content 字段；⑥ 修复保存时读取 content 及表单上传区显示逻辑
// v1.3 模板卡片新增「上传时间」「更新时间」展示：保存时记录 createdAt / updatedAt
// v1.4 V1.1.2 定位调整：模板 content 语义从「带占位符的格式骨架」改为「给 AI 的内容参考文本」，录入方式从仅文件上传改回大文本框在线编辑为主（可选文件上传导入）；移除独立的「重新上传」操作按钮（合并到编辑）；示例文本改为简短内容参考示例（不再带占位符）；格式骨架约束移至 workflow 子配置
// 数据持久化：localStorage.myDocTemplates（按业务系统分组）
// 用户侧联动：case-data.js mergeMyDocTemplates 在加载时合并到 system.docTemplates（key 加 my- 前缀）

(function() {
    'use strict';

    // ===== 状态 =====
    let currentOrg = 'court';
    let currentDocTypeFilter = ''; // '' = 全部
    let editingKey = null;         // 当前编辑的 key（null=新增模式）

    // v1.5 (V1.1.2) 内容参考示例：裁判文书（民事判决书）完整内容结构
    // 注：分步生成阶段（原告诉请/被告答辩/争议焦点/事实认定等）是辅助法官判断的中间产物，
    //     不是裁判文书模板内容；真正的文书模板应描述完整判决书的内容结构与各部分格式要求。
    //     [占位符] 为描述性占位符（给 AI 看的格式要求），由 AI 生成时替换为实际内容；
    //     与 workflow 格式骨架的 {{占位符}}（程序化套版）语义不同。
    const MY_TEMPLATE_EXAMPLE_TEXT = `[法院名称：江苏省XX市XX区人民法院]

民 事 判 决 书
（[年份]）[案字代字]民初[案号]号

原告：[原告名称]，住所地：[原告住所地]。
法定代表人：[法定代表人姓名]，[该公司职位，如该公司员工/该公司执行董事/该公司总经理]
原告：[原告姓名]，[原告性别]，[XXXX年XX月XX日出生]，[原告民族]，住[原告现住址]，公民身份号码：[原告公民身份号码]。
委托诉讼代理人：[原告委托诉讼代理人姓名]，[XX律所律师/该公司员工等情况]。

被告：[被告名称]，住所地：[被告住所地]。
法定代表人：[法定代表人姓名]，[该公司职位，如该公司员工/该公司执行董事/该公司总经理]
被告：[被告姓名]，[被告性别]，[XXXX年XX月XX日出生]，[被告民族]，住[被告现住址]，公民身份号码：[被告公民身份号码]。
委托诉讼代理人：[被告委托诉讼代理人姓名]，[XX律所律师/该公司员工等情况]。

[原告XXXXXX（以下简称原告）诉被告XXXXXX（以下简称被告）[、XXX保险公司（以下简称保险公司）][案由]一案，本院于[立案日期XXXX年XX月XX日]立案后，依法适用[适用程序]于[开庭日期XXXX年XX月XX日]由审判员[审判员XXX]公开开庭进行了审理。[原告方到庭情况]，[被告方到庭情况]，本案现已审理终结。]

原告向本院提出诉讼请求，请求判令：[原告诉讼请求，按照1、…；2、…；3、…；4、…等格式输出，按照原文内容输出]。事实与理由：[按照原文内容输出事实与理由，不要总结，不要遗漏。]

被告辩称：[被告答辩内容，引用原文内容，不要遗漏]。[若被告未到庭，按实际情况注明：被告XXX经本院合法传唤，拒不到庭，本院依法缺席审理 / 被告未到庭，亦未向本院提交书面答辩状及证据材料 / 被告XXX缺席未答辩。][若有多被告答辩，请按照不同被告进行分段输出，引用原文输出即可。]

本院经审理查明：[经审理查明的案件事实，按时间顺序或逻辑顺序组织，事实充分、证据明确。]

本院认为：[从法院角度，结合案情事实以及法律法规，引用相关法律法规对本案原告诉讼请求以及被告答辩内容等进行逐一分析并进行采纳或者不采纳，要求先进行分析，后进行采纳或者不采纳认定。要求尽可能丰富全面。]

综上，[结合本案事实及法律法规进行综合、全面且详细的论述然后生成合理、公正的判决]，依照《[相关法律法规及条款]》之规定，判决如下：
一、[判决主文第一项]。
二、[判决主文第二项]。
……

如果未按本判决指定的期间履行金钱给付义务，应当依照《中华人民共和国民事诉讼法》第二百六十四条之规定，加倍支付迟延履行期间的债务利息。

本案案件受理费[XXX]元，由[负担方]负担[XXX]元。

如不服本判决，可在判决书送达之日起十五日内，向本院递交上诉状，并按对方当事人的人数提出副本，上诉于[上级法院名称]。

本判决书生效后，负有履行义务的当事人应当依法按期履行。逾期未履行的，享有权利的当事人在法律规定的期限内申请执行后，人民法院将依法对被执行人的财产采取查封、扣押、冻结、拍卖、变卖等执行措施，并可对相关当事人采取限制高消费、列入失信名单、罚款、拘留等措施，对构成犯罪的，依法追究刑事责任。

审判员　　[审判员姓名]
[二○XX年XX月XX日]
法官助理　　[法官助理姓名]
书记员　　[书记员姓名]`;

    // ===== 存储 =====
    function getStorage() {
        try {
            return JSON.parse(localStorage.getItem('myDocTemplates')) || {};
        } catch (e) {
            return {};
        }
    }
    function saveStorage(data) {
        localStorage.setItem('myDocTemplates', JSON.stringify(data));
    }
    function getOrgData(org) {
        return getStorage()[org] || {};
    }
    function setOrgData(org, data) {
        const all = getStorage();
        all[org] = data;
        saveStorage(all);
    }

    function getDocTypes(org) {
        return getAdminDocTypes(org) || {};
    }

    function genKey() {
        return 't' + Date.now().toString(36) + Math.floor(Math.random() * 100);
    }

    function escapeHtml(s) {
        if (s === undefined || s === null) return '';
        return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    }

    // v1.3 时间工具：返回格式化时间（YYYY-MM-DD HH:mm）
    function nowTime() {
        const d = new Date();
        const p = n => (n < 10 ? '0' + n : '' + n);
        return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
            + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
    }

    // v1.2 通用工具：下载文本文件
    function downloadTextFile(text, filename) {
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 0);
    }

    // v1.2 通用工具：新窗口预览文本
    function previewTextInWindow(title, text) {
        const w = window.open('', '_blank');
        if (!w) {
            showToast('预览窗口被浏览器拦截，请允许弹窗', 'error');
            return;
        }
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
            <style>body{font-family:'Noto Sans SC',-apple-system,sans-serif;padding:32px;line-height:1.8;max-width:720px;margin:0 auto;color:#1e293b;white-space:pre-wrap;word-break:break-word;}</style>
            </head><body>${escapeHtml(text)}</body></html>`;
        w.document.open();
        w.document.write(html);
        w.document.close();
    }

    // ===== 通知 =====
    function showToast(msg, type) {
        type = type || 'success';
        const toast = document.getElementById('toast');
        toast.textContent = msg;
        toast.className = 'toast ' + type + ' show';
        setTimeout(() => toast.classList.remove('show'), 2200);
    }

    // ===== 业务系统切换 =====
    window.switchBusiness = function(type) {
        if (type === currentOrg) return;
        currentOrg = type;
        currentDocTypeFilter = '';
        document.querySelectorAll('.business-switch-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.type === type);
        });
        renderLeft();
        renderList();
    };

    // ===== 渲染左侧文书类型列表 =====
    function renderLeft() {
        const docTypes = getDocTypes(currentOrg);
        const orgData = getOrgData(currentOrg);
        const totalCount = Object.keys(orgData).length;

        const leftEl = document.getElementById('leftList');
        let html = '<div class="left-item' + (currentDocTypeFilter === '' ? ' active' : '') + '" onclick="selectDocType(\'\')">'
            + '<span>全部</span><span class="count">' + totalCount + '</span></div>';

        Object.entries(docTypes).forEach(([key, cfg]) => {
            const count = Object.entries(orgData).filter(([k, v]) => v.docType === key).length;
            html += '<div class="left-item' + (currentDocTypeFilter === key ? ' active' : '') + '" onclick="selectDocType(\'' + key + '\')">'
                + '<span>' + escapeHtml(cfg.name) + '</span>'
                + '<span class="count">' + count + '</span></div>';
        });
        leftEl.innerHTML = html;
    }
    window.selectDocType = function(key) {
        currentDocTypeFilter = key;
        renderLeft();
        renderList();
    };

    // 渲染单个模板卡片（非编辑态）
    function renderCard(key, t, docTypes) {
        const docTypeName = (docTypes[t.docType] || {}).name || '-';
        const isEnabled = t.enabled !== false; // 缺省视为 true
        const statusBadge = isEnabled
            ? '<span class="item-badge status-on">已启用</span>'
            : '<span class="item-badge status-off">已停用</span>';
        const toggleBtn = isEnabled
            ? '<button class="action-btn toggle-off" onclick="toggleEnabled(\'' + key + '\')">停用</button>'
            : '<button class="action-btn toggle-on" onclick="toggleEnabled(\'' + key + '\')">启用</button>';
        const hasContent = (t.content || '').trim().length > 0;
        const viewDisabled = hasContent ? '' : ' disabled';
        // v1.3 展示上传时间与更新时间（缺省内容兼容旧数据）
        const createdAt = t.createdAt || '';
        const updatedAt = t.updatedAt || '';
        const timeMeta = (createdAt || updatedAt)
            ? '<div class="item-meta">'
                + (createdAt ? '<span class="tpl-time-block">上传：' + escapeHtml(createdAt) + '</span>' : '')
                + (createdAt && updatedAt ? '<span class="tpl-time-sep">·</span>' : '')
                + (updatedAt ? '<span class="tpl-time-block">更新：' + escapeHtml(updatedAt) + '</span>' : '')
                + '</div>'
            : '';
        return '<div class="item-card">'
            + '<div class="item-row">'
            + '<div>'
            + '<span class="item-name">' + escapeHtml(t.name || key) + '</span>'
            + '<span class="item-badge">我的</span>'
            + statusBadge
            + '<div class="item-meta">所属类型：' + escapeHtml(docTypeName) + '</div>'
            + timeMeta
            + '</div>'
            + '<div class="item-actions">'
            + '<button class="action-btn view"' + viewDisabled + ' onclick="previewMyTemplate(\'' + key + '\')">预览</button>'
            + '<button class="action-btn view"' + viewDisabled + ' onclick="downloadMyTemplate(\'' + key + '\')">下载</button>'
            + '<button class="action-btn edit" onclick="editItem(\'' + key + '\')">编辑</button>'
            + toggleBtn
            + '<button class="action-btn delete" onclick="deleteItem(\'' + key + '\')">删除</button>'
            + '</div>'
            + '</div>'
            + '</div>';
    }

    // v1.2 卡片操作：预览/下载
    window.previewMyTemplate = function(key) {
        const orgData = getOrgData(currentOrg);
        const t = orgData[key];
        if (!t || !(t.content || '').trim()) return;
        previewTextInWindow('模板预览：' + t.name, t.content);
    };
    window.downloadMyTemplate = function(key) {
        const orgData = getOrgData(currentOrg);
        const t = orgData[key];
        if (!t || !(t.content || '').trim()) return;
        downloadTextFile(t.content, (t.name || '我的模板正文') + '.txt');
    };

    // 切换启用/停用状态
    window.toggleEnabled = function(key) {
        const orgData = getOrgData(currentOrg);
        const t = orgData[key];
        if (!t) return;
        const isEnabled = t.enabled !== false;
        t.enabled = !isEnabled;
        setOrgData(currentOrg, orgData);
        renderList();
        showToast(isEnabled ? '已停用' : '已启用', 'success');
    };

    // ===== 渲染右侧列表 =====
    function renderList() {
        const docTypes = getDocTypes(currentOrg);
        const orgData = getOrgData(currentOrg);
        const contentTitle = document.getElementById('contentTitle');
        contentTitle.textContent = currentDocTypeFilter
            ? ((docTypes[currentDocTypeFilter] || {}).name || '模板列表')
            : '全部我的模板';

        const list = Object.entries(orgData).filter(([k, v]) => {
            return !currentDocTypeFilter || v.docType === currentDocTypeFilter;
        });

        const listEl = document.getElementById('itemList');
        const empty = document.getElementById('emptyState');

        // 新增模式下，即使列表为空也要在顶部渲染编辑表单
        if (editingKey === '__new__') {
            empty.style.display = 'none';
            const existingHtml = list.map(([key, t]) => renderCard(key, t, docTypes)).join('');
            listEl.innerHTML = renderEditForm('__new__', null) + existingHtml;
            return;
        }

        if (list.length === 0) {
            listEl.innerHTML = '';
            empty.style.display = 'block';
            return;
        }
        empty.style.display = 'none';

        listEl.innerHTML = list.map(([key, t]) => {
            // 如果是编辑中的项，渲染表单
            if (editingKey === key) {
                return renderEditForm(key, t);
            }
            return renderCard(key, t, docTypes);
        }).join('');
    }

    // ===== 新增/编辑表单 =====
    window.openAddForm = function() {
        // 在列表顶部插入新表单
        if (editingKey !== null) {
            showToast('请先保存或取消当前编辑', 'error');
            return;
        }
        editingKey = '__new__';
        renderList();
        // 滚动到顶部
        document.getElementById('itemList').scrollIntoView({ behavior: 'smooth', block: 'start' });
        setTimeout(() => {
            const ta = document.getElementById('formContent');
            if (ta) ta.value = '';
        }, 30);
    };

    window.editItem = function(key) {
        if (editingKey !== null) {
            showToast('请先保存或取消当前编辑', 'error');
            return;
        }
        editingKey = key;
        renderList();
        // v1.4 表单渲染后将已有 content 回填到 textarea
        setTimeout(() => {
            const orgData = getOrgData(currentOrg);
            const t = orgData[key];
            const ta = document.getElementById('formContent');
            if (ta && t) ta.value = t.content || '';
        }, 30);
    };

    window.cancelEdit = function() {
        editingKey = null;
        renderList();
    };

    function renderEditForm(key, t) {
        const isNew = key === '__new__';
        const docTypes = getDocTypes(currentOrg);
        const docTypeOptions = Object.entries(docTypes).map(([k, cfg]) =>
            '<option value="' + k + '"' + (t && t.docType === k ? ' selected' : '') + '>' + escapeHtml(cfg.name) + '</option>'
        ).join('');
        const name = (t && t.name) || '';
        // v1.4 直接以 textarea 为内容主入口，文件上传作为可选导入方式
        const contentValue = (t && t.content) || '';
        const exampleRow = '<div class="tpl-example-row">'
            + '<a href="javascript:void(0)" onclick="insertMyTemplateExample()"><i class="fas fa-lightbulb"></i> 插入示例文本</a>'
            + '<span class="tpl-example-hint">（参考示例，可在此基础上修改）</span>'
            + '<span style="margin:0 10px; color:var(--border-color);">|</span>'
            + '<a href="javascript:void(0)" onclick="document.getElementById(\'myTplFileInput\').click()"><i class="fas fa-upload"></i> 从文件导入</a>'
            + '<span class="tpl-example-hint">（.txt/.doc/.docx，导入后可继续编辑）</span>'
            + '<input type="file" id="myTplFileInput" accept=".txt,.doc,.docx" style="display:none" onchange="handleMyTemplateFileUpload(event)">'
            + '</div>';

        return '<div class="item-card editing">'
            + '<div class="form-group">'
            + '<label class="form-label">模板名 <span class="required">*</span></label>'
            + '<input type="text" class="form-input" id="formName" value="' + escapeHtml(name) + '" placeholder="如：我的民事判决书模板">'
            + '</div>'
            + '<div class="form-group">'
            + '<label class="form-label">所属文书类型 <span class="required">*</span></label>'
            + '<select class="form-select" id="formDocType">' + docTypeOptions + '</select>'
            + '</div>'
            + '<div class="form-group">'
            + '<label class="form-label">模板正文</label>'
            + '<textarea class="form-textarea" id="formContent" placeholder="请输入模板内容参考文本，描述文书应包含哪些内容板块/段落..." style="min-height:180px;">' + escapeHtml(contentValue) + '</textarea>'
            + exampleRow
            + '<div class="form-hint">模板正文作为给 AI 的内容参考文本，文书生成时 AI 据此组织文书结构</div>'
            + '</div>'
            + '<div class="form-actions">'
            + '<button class="btn btn-primary" onclick="saveItem(\'' + (isNew ? '' : key) + '\')">保存</button>'
            + '<button class="btn btn-secondary" onclick="cancelEdit()">取消</button>'
            + '</div>'
            + '</div>';
    }

    window.saveItem = function(existingKey) {
        const name = document.getElementById('formName').value.trim();
        const docType = document.getElementById('formDocType').value;
        // v1.4 直接从 textarea 读取内容
        const content = document.getElementById('formContent').value;

        if (!name) {
            showToast('请填写模板名', 'error');
            document.getElementById('formName').focus();
            return;
        }
        if (!docType) {
            showToast('请选择所属文书类型', 'error');
            return;
        }

        const orgData = getOrgData(currentOrg);
        let key = existingKey;
        if (!key) {
            // 新增：生成唯一 key
            key = genKey();
            while (orgData[key]) key = genKey();
        }
        // 编辑时保留原 enabled 字段；新增时默认启用
        const prevEnabled = existingKey && orgData[key] ? (orgData[key].enabled !== false) : true;
        // v1.3 记录上传时间与更新时间
        const now = nowTime();
        const createdAt = existingKey && orgData[key] && orgData[key].createdAt ? orgData[key].createdAt : now;
        orgData[key] = {
            name: name,
            docType: docType,
            content: content,
            enabled: prevEnabled,
            createdAt: createdAt,
            updatedAt: now
        };
        setOrgData(currentOrg, orgData);

        editingKey = null;
        renderLeft();
        renderList();
        showToast(existingKey ? '模板已更新' : '模板已新增', 'success');
    };

    // v1.4 模板文件导入处理（可选）：将文件内容写入 textarea，便于继续编辑
    // 原型阶段仅解析 .txt；doc/docx 提示需配套解析能力
    window.handleMyTemplateFileUpload = function(event) {
        const file = event.target.files && event.target.files[0];
        if (!file) return;
        const name = file.name || '';
        const ext = name.split('.').pop().toLowerCase();
        if (!['txt', 'doc', 'docx'].includes(ext)) {
            showToast('仅支持 .txt / .doc / .docx 格式', 'error');
            event.target.value = '';
            return;
        }
        const ta = document.getElementById('formContent');
        if (!ta) return;
        if (ext === 'txt') {
            const reader = new FileReader();
            reader.onload = function(e) {
                ta.value = (e.target.result || '').toString();
                showToast('模板正文已导入到文本框，可继续编辑', 'success');
            };
            reader.onerror = function() {
                showToast('文件读取失败', 'error');
            };
            reader.readAsText(file, 'utf-8');
        } else {
            // doc/docx 原型阶段用 mock 解析提示：仅取文件名作为占位
            ta.value = '// 文件：' + name + '\n// 注：doc/docx 格式需配套文档解析服务，原型阶段仅保存文件名标识。';
            showToast('已接收 ' + ext + ' 文件（原型阶段仅保存标识）', 'success');
        }
        event.target.value = '';
    };

    // v1.4 插入示例文本到 textarea
    window.insertMyTemplateExample = function() {
        const ta = document.getElementById('formContent');
        if (!ta) return;
        ta.value = MY_TEMPLATE_EXAMPLE_TEXT;
        showToast('已插入示例文本，可在此基础上修改', 'success');
    };

    // v1.4 下载模板示例（保留便捷入口）
    window.downloadMyTemplateExample = function() {
        downloadTextFile(MY_TEMPLATE_EXAMPLE_TEXT, '文书模板内容参考示例.txt');
    };

    // ===== 删除 =====
    window.deleteItem = function(key) {
        const orgData = getOrgData(currentOrg);
        const t = orgData[key];
        if (!t) return;
        if (!confirm('确定删除模板「' + (t.name || key) + '」吗？此操作不可恢复。')) return;
        delete orgData[key];
        setOrgData(currentOrg, orgData);
        renderLeft();
        renderList();
        showToast('模板已删除', 'success');
    };

    // ===== 初始化 =====
    function init() {
        // 从 URL 读取 org 参数
        const params = new URLSearchParams(window.location.search);
        const orgParam = params.get('org');
        if (orgParam && ['court', 'procuratorate', 'justice'].includes(orgParam)) {
            currentOrg = orgParam;
            document.querySelectorAll('.business-switch-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.type === orgParam);
            });
        }
        renderLeft();
        renderList();
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

// ============ Admin Doc Templates Management ============
// v1.0 文书示例管理：维护各业务系统示例，关联文书类型
// v1.1 移除「关联案由」字段：示例作为所属文书类型的下属，案由匹配通过文书类型→workflow 链路间接实现
// v1.2 示例正文交互改造：① 示例正文从 textarea 在线编辑改为文件上传；② 新增/编辑弹窗提供示例下载；③ 列表新增「预览」「下载」「重新上传」三个操作按钮；④ 未上传正文时预览/下载置灰；⑤ 上传内容以纯文本持久化到 content 字段
// v1.3 内置示例预置默认正文：内置示例 content 赋予 TEMPLATE_EXAMPLE_TEXT，使预览/下载按钮默认可用（自定义示例未上传正文时仍置灰）
// v1.4 示例表格新增「上传时间」「更新时间」两列：保存时记录 createdAt / updatedAt（新增两者相同，编辑/重新上传仅更新 updatedAt）；内置示例无持久化时间显示为空
// v1.5 V1.1.2 定位调整：示例 content 语义从「带占位符的格式骨架」改为「给 AI 的内容参考文本」，录入方式从仅文件上传改回大文本框在线编辑为主（可选文件上传导入）；移除独立的「重新上传」操作按钮（合并到编辑）；内置示例默认 content 改为简短内容参考示例（不再强约束占位符）；格式骨架约束移至 workflow 子配置
// 数据持久化：localStorage.adminDocTemplates（按业务系统分组）
// 用户侧联动：case-data.js mergeAdminDocTemplates 在加载时合并到 system.docTemplates

(function() {
    'use strict';

    // ===== 状态 =====
    let currentOrg = 'court';
    let currentDocTypeFilter = ''; // '' = 全部
    let editingKey = null;        // 当前编辑的示例 key（编辑模式时非空）
    let editingIsBuiltin = false; // 编辑的是内置示例（编辑后转为自定义）
    let pendingConfirmAction = null;

    // v1.6 (V1.1.2) 内容参考示例：裁判文书（民事判决书）完整内容结构
    // 注：分步生成阶段（原告诉请/被告答辩/争议焦点/事实认定等）是辅助法官判断的中间产物，
    //     不是裁判文书示例内容；真正的文书示例应描述完整判决书的内容结构与各部分格式要求。
    //     [占位符] 为描述性占位符（给 AI 看的格式要求），由 AI 生成时替换为实际内容；
    //     与 workflow 格式骨架的 {{占位符}}（程序化套版）语义不同。
    const TEMPLATE_EXAMPLE_TEXT = `[法院名称：江苏省XX市XX区人民法院]

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

    // ===== 工具函数 =====
    function getStorage() {
        try {
            return JSON.parse(localStorage.getItem('adminDocTemplates')) || {};
        } catch (e) {
            return {};
        }
    }
    function saveStorage(data) {
        localStorage.setItem('adminDocTemplates', JSON.stringify(data));
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

    // 获取当前业务系统的文书类型映射（v1.21: 统一走 getAdminDocTypes 合并源）
    function getDocTypes(org) {
        return getAdminDocTypes(org) || {};
    }

    // 获取当前业务系统的内置示例（来自 defaultDocTemplatesByOrg，字符串映射）
    function getBuiltinTemplates(org) {
        return defaultDocTemplatesByOrg[org] || {};
    }

    // 获取当前业务系统下被停用的内置示例 key 列表
    // 存于 adminDocTemplates[org].__builtinDisabled__ 数组中
    function getBuiltinDisabled(org) {
        const orgData = getOrgData(org);
        return Array.isArray(orgData.__builtinDisabled__) ? orgData.__builtinDisabled__ : [];
    }
    function setBuiltinDisabled(org, arr) {
        const orgData = getOrgData(org);
        orgData.__builtinDisabled__ = arr;
        setOrgData(org, orgData);
    }

    // 获取当前业务系统的全部示例（内置 + 自定义）
    // 返回统一对象结构：{key: {name, docType, content, isBuiltin, enabled}}
    function getAllTemplates(org) {
        const docTypes = getDocTypes(org);
        const builtins = getBuiltinTemplates(org);
        const customs = getOrgData(org);
        const builtinDisabled = getBuiltinDisabled(org);

        // 反查表：示例 key → 文书类型 key
        const tplToDocType = {};
        Object.entries(docTypes).forEach(([typeKey, typeCfg]) => {
            (typeCfg.templates || []).forEach(tplKey => {
                tplToDocType[tplKey] = typeKey;
            });
        });

        const result = {};
        // 内置示例（字符串）
        // v1.5 内置示例 content 赋予简短内容参考示例（不再强约束占位符格式骨架）
        Object.entries(builtins).forEach(([key, name]) => {
            result[key] = {
                name: name,
                docType: tplToDocType[key] || '',
                content: TEMPLATE_EXAMPLE_TEXT,
                isBuiltin: true,
                enabled: !builtinDisabled.includes(key)
            };
        });
        // 自定义示例（对象，覆盖同名内置）
        Object.entries(customs).forEach(([key, val]) => {
            if (key === '__builtinDisabled__') return; // 跳过内置停用列表
            if (val && typeof val === 'object') {
                result[key] = {
                    name: val.name || key,
                    docType: val.docType || tplToDocType[key] || '',
                    content: val.content || '',
                    isBuiltin: false,
                    enabled: val.enabled !== false,
                    createdAt: val.createdAt || '', // v1.4 上传/创建时间
                    updatedAt: val.updatedAt || ''  // v1.4 最近更新时间
                };
            }
        });
        return result;
    }

    // 生成唯一 key
    function genTemplateKey(name, docType) {
        const base = (docType || 'tpl') + '-' + Date.now().toString(36);
        return base;
    }

    // v1.2 通用工具：下载文本内容为文件
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

    // v1.2 通用工具：在新窗口预览文本（保留换行）
    function previewTextInWindow(title, text) {
        const w = window.open('', '_blank');
        if (!w) {
            showNotification('预览窗口被浏览器拦截，请允许弹窗', 'warning');
            return;
        }
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
            <style>body{font-family:'Noto Sans SC',-apple-system,sans-serif;padding:32px;line-height:1.8;max-width:720px;margin:0 auto;color:#1a1a2e;white-space:pre-wrap;word-break:break-word;}</style>
            </head><body>${escapeHtml(text)}</body></html>`;
        w.document.open();
        w.document.write(html);
        w.document.close();
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

    // ===== 业务系统切换 =====
    window.switchBusiness = function(type) {
        if (type === currentOrg) return;
        currentOrg = type;
        currentDocTypeFilter = '';
        document.querySelectorAll('.business-switch-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.type === type);
        });
        renderLeft();
        renderRight();
    };

    // ===== 渲染左侧文书类型列表 =====
    function renderLeft() {
        const docTypes = getDocTypes(currentOrg);
        const allTemplates = getAllTemplates(currentOrg);
        const totalCount = Object.keys(allTemplates).length;

        const leftEl = document.getElementById('tplLeft');
        let html = '<div class="tpl-left-item' + (currentDocTypeFilter === '' ? ' active' : '') + '" onclick="selectDocType(\'\')">'
            + '<i class="fas fa-layer-group"></i><span>全部</span><span class="count">' + totalCount + '</span></div>';

        Object.entries(docTypes).forEach(([key, cfg]) => {
            const count = Object.values(allTemplates).filter(t => t.docType === key).length;
            html += '<div class="tpl-left-item' + (currentDocTypeFilter === key ? ' active' : '') + '" onclick="selectDocType(\'' + key + '\')">'
                + '<i class="fas ' + (cfg.icon || 'fa-folder') + '"></i>'
                + '<span>' + cfg.name + '</span>'
                + '<span class="count">' + count + '</span></div>';
        });
        leftEl.innerHTML = html;
    }
    window.selectDocType = function(key) {
        currentDocTypeFilter = key;
        renderLeft();
        renderRight();
    };

    // ===== 渲染右侧表格 =====
    function renderRight() {
        const docTypes = getDocTypes(currentOrg);
        const allTemplates = getAllTemplates(currentOrg);
        const rightTitle = document.getElementById('rightTitle');
        if (currentDocTypeFilter) {
            rightTitle.textContent = (docTypes[currentDocTypeFilter] || {}).name || '示例列表';
        } else {
            rightTitle.textContent = '全部示例';
        }

        const list = Object.entries(allTemplates).filter(([key, t]) => {
            return !currentDocTypeFilter || t.docType === currentDocTypeFilter;
        });

        const tbody = document.getElementById('tplTbody');
        const empty = document.getElementById('emptyState');
        if (list.length === 0) {
            tbody.innerHTML = '';
            empty.style.display = 'block';
            return;
        }
        empty.style.display = 'none';

        tbody.innerHTML = list.map(([key, t]) => {
            const docTypeName = (docTypes[t.docType] || {}).name || '-';
            const badge = t.isBuiltin
                ? '<span class="tpl-badge builtin">内置</span>'
                : '<span class="tpl-badge custom">自定义</span>';
            const isEnabled = t.enabled !== false;
            const statusBadge = isEnabled
                ? '<span class="status-badge status-on">已启用</span>'
                : '<span class="status-badge status-off">已停用</span>';
            const toggleBtn = isEnabled
                ? '<button class="action-btn toggle-off" onclick="toggleTemplateEnabled(\'' + key + '\')">停用</button>'
                : '<button class="action-btn toggle-on" onclick="toggleTemplateEnabled(\'' + key + '\')">启用</button>';
            const hasContent = (t.content || '').trim().length > 0;
            const viewDisabled = hasContent ? '' : ' disabled';
            // v1.5 移除独立的「重新上传」按钮，合并到编辑入口
            const contentActions = '<button class="action-btn view"' + viewDisabled + ' onclick="previewTemplateContent(\'' + key + '\')">预览</button>'
                  + '<button class="action-btn view"' + viewDisabled + ' onclick="downloadTemplateByKey(\'' + key + '\')">下载</button>';
            const actions = t.isBuiltin
                ? contentActions
                  + '<button class="action-btn edit" onclick="editTemplate(\'' + key + '\')">编辑</button>' + toggleBtn
                : contentActions
                  + '<button class="action-btn edit" onclick="editTemplate(\'' + key + '\')">编辑</button>'
                  + toggleBtn
                  + '<button class="action-btn delete" onclick="deleteTemplate(\'' + key + '\')">删除</button>';
            // v1.4 上传时间/更新时间（内置示例无持久化时间，显示为空）
            const createdAt = t.createdAt || '';
            const updatedAt = t.updatedAt || '';
            return '<tr>'
                + '<td class="tpl-name-cell">' + escapeHtml(t.name) + badge + '</td>'
                + '<td>' + escapeHtml(docTypeName) + '</td>'
                + '<td>' + statusBadge + '</td>'
                + '<td class="tpl-time-cell">' + (createdAt ? escapeHtml(createdAt) : '<span class="tpl-time-empty">-</span>') + '</td>'
                + '<td class="tpl-time-cell">' + (updatedAt ? escapeHtml(updatedAt) : '<span class="tpl-time-empty">-</span>') + '</td>'
                + '<td class="tpl-action-cell">' + actions + '</td>'
                + '</tr>';
        }).join('');
    }

    function escapeHtml(s) {
        if (s === undefined || s === null) return '';
        return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    }

    // v1.4 时间工具：返回格式化时间（YYYY-MM-DD HH:mm）
    function nowTime() {
        const d = new Date();
        const p = n => (n < 10 ? '0' + n : '' + n);
        return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
            + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
    }

    // v1.5 弹窗中文本框为内容主入口，文件导入仅作为可选导入方式（导入后写入 textarea）
    // 不再需要 refreshTplUploadUI 切换显示

    // ===== 新增/编辑弹窗 =====
    window.openAddModal = function() {
        editingKey = null;
        editingIsBuiltin = false;
        document.getElementById('modalTitle').textContent = '新增示例';
        document.getElementById('tplName').value = '';
        fillDocTypeSelect('');
        document.getElementById('tplDocType').disabled = false;
        document.getElementById('tplContent').value = ''; // v1.5 清空文本框
        document.getElementById('tplModal').classList.add('show');
        setTimeout(() => document.getElementById('tplName').focus(), 50);
    };

    window.editTemplate = function(key) {
        const all = getAllTemplates(currentOrg);
        const t = all[key];
        if (!t) return;
        editingKey = key;
        editingIsBuiltin = !!t.isBuiltin;
        document.getElementById('modalTitle').textContent = editingIsBuiltin ? '编辑内置示例（另存为自定义）' : '编辑示例';
        document.getElementById('tplName').value = t.name;
        fillDocTypeSelect(t.docType);
        // 编辑内置时禁用文书类型切换，避免逻辑歧义（内置只能在原类型上覆盖）
        document.getElementById('tplDocType').disabled = editingIsBuiltin;
        // v1.5 将已有 content 回填到 textarea（内置示例回填默认示例文本，用户可基于此修改）
        document.getElementById('tplContent').value = t.content || '';
        document.getElementById('tplModal').classList.add('show');
    };

    // v1.5 示例文件导入处理（可选）：将文件内容写入 textarea，便于继续编辑
    // 原型阶段仅解析 .txt；doc/docx 提示需配套解析能力
    window.handleTemplateFileUpload = function(event) {
        const file = event.target.files && event.target.files[0];
        if (!file) return;
        const name = file.name || '';
        const ext = name.split('.').pop().toLowerCase();
        if (!['txt', 'doc', 'docx'].includes(ext)) {
            showNotification('仅支持 .txt / .doc / .docx 格式', 'warning');
            event.target.value = '';
            return;
        }
        const ta = document.getElementById('tplContent');
        if (ext === 'txt') {
            const reader = new FileReader();
            reader.onload = function(e) {
                ta.value = (e.target.result || '').toString();
                showNotification('示例正文已导入到文本框，可继续编辑', 'success');
            };
            reader.onerror = function() {
                showNotification('文件读取失败', 'error');
            };
            reader.readAsText(file, 'utf-8');
        } else {
            // doc/docx 原型阶段用 mock 解析提示：仅取文件名作为占位
            ta.value = `// 文件：${name}\n// 注：doc/docx 格式需配套文档解析服务，原型阶段仅保存文件名标识。`;
            showNotification('已接收 ' + ext + ' 文件（原型阶段仅保存标识）', 'warning');
        }
        event.target.value = '';
    };

    // v1.5 插入示例文本到 textarea
    window.insertTemplateExample = function() {
        document.getElementById('tplContent').value = TEMPLATE_EXAMPLE_TEXT;
        showNotification('已插入示例文本，可在此基础上修改', 'success');
    };

    window.closeModal = function() {
        document.getElementById('tplModal').classList.remove('show');
        editingKey = null;
        editingIsBuiltin = false;
    };

    function fillDocTypeSelect(selected) {
        const docTypes = getDocTypes(currentOrg);
        const sel = document.getElementById('tplDocType');
        sel.innerHTML = '<option value="">请选择...</option>' + Object.entries(docTypes).map(([key, cfg]) =>
            '<option value="' + key + '"' + (key === selected ? ' selected' : '') + '>' + escapeHtml(cfg.name) + '</option>'
        ).join('');
    }

    window.saveTemplate = function() {
        const name = document.getElementById('tplName').value.trim();
        const docType = document.getElementById('tplDocType').value;
        // v1.5 直接从 textarea 读取内容
        const content = document.getElementById('tplContent').value;

        if (!name) {
            showNotification('请填写示例名', 'error');
            document.getElementById('tplName').focus();
            return;
        }
        if (!docType) {
            showNotification('请选择所属文书类型', 'error');
            return;
        }

        const orgData = getOrgData(currentOrg);

        // 决定 key
        let key;
        if (editingKey && !editingIsBuiltin) {
            // 编辑自定义示例：保留原 key
            key = editingKey;
        } else if (editingKey && editingIsBuiltin) {
            // 编辑内置示例：使用内置 key 作为自定义覆盖（用户侧 mergeAdminDocTemplates 会覆盖）
            key = editingKey;
        } else {
            // 新增：生成新 key（确保不与内置 key 冲突）
            key = genTemplateKey(name, docType);
            while (orgData[key]) key = genTemplateKey(name, docType) + Math.floor(Math.random() * 100);
        }

        // 编辑时继承原启用状态；新增默认启用
        let origEnabled = true;
        if (editingKey) {
            const all = getAllTemplates(currentOrg);
            const origT = all[editingKey];
            if (origT) origEnabled = origT.enabled !== false;
        }

        // v1.4 记录上传/更新时间：新增时两者相同；编辑时保留原 createdAt，仅更新 updatedAt
        const now = nowTime();
        const prevTemplate = orgData[key];
        const createdAt = (editingKey && prevTemplate && prevTemplate.createdAt) ? prevTemplate.createdAt : now;

        orgData[key] = {
            name: name,
            docType: docType,
            content: content,
            enabled: origEnabled,
            createdAt: createdAt,
            updatedAt: now
        };

        // 编辑内置示例后，该 key 变为自定义；从 __builtinDisabled__ 清理冗余 key
        if (editingKey && editingIsBuiltin) {
            let arr = getBuiltinDisabled(currentOrg);
            if (arr.includes(editingKey)) {
                orgData.__builtinDisabled__ = arr.filter(k => k !== editingKey);
            }
        }

        setOrgData(currentOrg, orgData);

        closeModal();
        renderLeft();
        renderRight();
        showNotification(editingKey ? '示例已更新' : '示例已新增', 'success');
    };

    // v1.2 列表操作：预览示例正文
    window.previewTemplateContent = function(key) {
        const all = getAllTemplates(currentOrg);
        const t = all[key];
        if (!t || !(t.content || '').trim()) return;
        previewTextInWindow('示例预览：' + t.name, t.content);
    };

    // v1.2 列表操作：下载示例正文
    window.downloadTemplateByKey = function(key) {
        const all = getAllTemplates(currentOrg);
        const t = all[key];
        if (!t || !(t.content || '').trim()) return;
        downloadTextFile(t.content, (t.name || '示例正文') + '.txt');
    };

    // ===== 启用/停用切换 =====
    window.toggleTemplateEnabled = function(key) {
        const all = getAllTemplates(currentOrg);
        const t = all[key];
        if (!t) return;
        const newEnabled = t.enabled === false; // 反转：当前停用→启用；当前启用→停用
        if (t.isBuiltin) {
            // 内置示例：操作 __builtinDisabled__ 数组
            let arr = getBuiltinDisabled(currentOrg);
            if (newEnabled) {
                arr = arr.filter(k => k !== key);
            } else {
                if (!arr.includes(key)) arr.push(key);
            }
            setBuiltinDisabled(currentOrg, arr);
        } else {
            // 自定义示例：直接修改 enabled 字段
            const orgData = getOrgData(currentOrg);
            if (orgData[key] && typeof orgData[key] === 'object') {
                orgData[key].enabled = newEnabled;
                setOrgData(currentOrg, orgData);
            }
        }
        renderRight();
        showNotification(newEnabled ? '示例已启用' : '示例已停用', 'success');
    };

    // ===== 删除 =====
    window.deleteTemplate = function(key) {
        const all = getAllTemplates(currentOrg);
        const t = all[key];
        if (!t) return;
        if (t.isBuiltin) {
            showNotification('内置示例不可删除', 'warning');
            return;
        }
        showConfirm('删除示例', '确定删除示例「' + t.name + '」吗？此操作不可恢复。', () => {
            const orgData = getOrgData(currentOrg);
            delete orgData[key];
            setOrgData(currentOrg, orgData);
            renderLeft();
            renderRight();
            showNotification('示例已删除', 'success');
        });
    };

    // ===== 确认弹窗 =====
    function showConfirm(title, text, onConfirm) {
        document.getElementById('confirmTitle').textContent = title;
        document.getElementById('confirmText').textContent = text;
        pendingConfirmAction = onConfirm;
        const btn = document.getElementById('confirmBtn');
        btn.onclick = function() {
            closeConfirm();
            if (typeof pendingConfirmAction === 'function') pendingConfirmAction();
            pendingConfirmAction = null;
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
    window.AdminDocTemplates = { getAllTemplates, getOrgData, setOrgData };
})();

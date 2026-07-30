// ============ Document Detail Page JavaScript ============
// 列表页「生成文书」未超限时跳转的文书详情页：左材料树 + 右文书显示

let pageCaseId = '';
let pageOrg = 'court';
let pageCaseItem = null;
let pageParams = {};
let pageDoc = null; // 历史文书对象

document.addEventListener('DOMContentLoaded', function() {
    initDocumentDetailPage();
});

function initDocumentDetailPage() {
    pageParams = getUrlParams();
    pageCaseId = pageParams.caseId;
    if (!pageCaseId) {
        showEmptyState('未指定案件 ID');
        return;
    }

    const result = findCaseById(pageCaseId);
    if (!result) {
        showEmptyState('案件不存在');
        return;
    }
    pageOrg = result.org;
    pageCaseItem = result.caseItem;
    currentBusiness = pageOrg;

    if (pageParams.docId) {
        const docs = pageCaseItem.documents || [];
        pageDoc = docs.find(d => d.id === pageParams.docId) || null;
        if (!pageDoc) {
            showEmptyState('文书不存在');
            return;
        }
    }

    renderHeader();
    renderMaterialTree();
    renderDocument();
}

function getUrlParams() {
    const params = new URLSearchParams(window.location.search);
    return {
        caseId: params.get('caseId') || '',
        docId: params.get('docId') || '',
        model: params.get('model') || getCurrentModelId(),
        docType: params.get('docType') || '',
        template: params.get('template') || '',
        requirement: params.get('requirement') || ''
    };
}

function renderHeader() {
    const docTypes = getCurrentDocTypes();
    const templates = getCurrentTemplates();

    if (pageDoc) {
        const docTypeName = (docTypes[pageDoc.docType] && docTypes[pageDoc.docType].name) || '法律文书';
        const templatesForType = getDocTypeTemplates(pageDoc.docType);
        const templateName = templatesForType[pageDoc.template] || docTypeName;
        const createdAt = (pageDoc.createdAt || '').split('T')[0];
        document.getElementById('headerCaseName').textContent = pageCaseItem.caseName || pageCaseItem.caseNumber || '案件文书';
        document.getElementById('headerDocInfo').textContent = pageDoc.title || `${docTypeName} · ${templateName}`;
        document.getElementById('docMeta').textContent = `案号：${pageCaseItem.caseNumber || '-'} · 生成时间：${createdAt}`;
    } else {
        const docTypeName = (docTypes[pageParams.docType] && docTypes[pageParams.docType].name) || '法律文书';
        const templateName = templates[pageParams.template] || docTypeName;
        document.getElementById('headerCaseName').textContent = pageCaseItem.caseName || pageCaseItem.caseNumber || '案件文书';
        document.getElementById('headerDocInfo').textContent = `${docTypeName} · ${templateName}`;
        document.getElementById('docMeta').textContent = `案号：${pageCaseItem.caseNumber || '-'} · 生成时间：${new Date().toLocaleString('zh-CN')}`;
    }
}

// ===== 左侧材料树 =====
function renderMaterialTree() {
    const tree = document.getElementById('materialTree');
    const files = pageCaseItem.files || [];
    const selectedIds = pageDoc && pageDoc.selectedMaterialIds ? new Set(pageDoc.selectedMaterialIds) : null;
    const selectedCount = selectedIds ? files.filter(f => selectedIds.has(f.id)).length : files.length;
    document.getElementById('materialCount').textContent = `${selectedCount} / ${files.length}`;

    if (!files.length) {
        tree.innerHTML = '<div style="padding:20px;color:var(--text-muted);text-align:center;">暂无材料</div>';
        return;
    }

    const categories = classifyMaterials(files);
    tree.innerHTML = Object.entries(categories).map(([categoryName, categoryFiles]) => `
        <div class="doc-detail-category expanded">
            <div class="doc-detail-category-header" onclick="toggleCategory(this)">
                <div class="doc-detail-category-header-left">
                    <i class="fas fa-chevron-right"></i>
                    <span>${categoryName}</span>
                </div>
                <span style="font-size:12px;color:var(--text-muted);">${categoryFiles.length}</span>
            </div>
            <div class="doc-detail-category-children">
                ${categoryFiles.map(f => renderMaterialFile(f, selectedIds)).join('')}
            </div>
        </div>
    `).join('');
}

function renderMaterialFile(f, selectedIds) {
    const icon = getFileIcon(f.name);
    const selected = !selectedIds || selectedIds.has(f.id);
    return `
        <div class="doc-detail-file ${selected ? 'selected' : ''}" title="${f.name}">
            <input type="checkbox" ${selected ? 'checked' : ''} disabled>
            <i class="fas ${icon}"></i>
            <span class="doc-detail-file-name">${f.name}</span>
        </div>
    `;
}

function classifyMaterials(files) {
    const categories = {};
    files.forEach(f => {
        const name = f.name || '';
        let category = f.category || '';
        if (!category) {
            for (const [cat, keys] of Object.entries(MATERIAL_CATEGORIES)) {
                if (cat === '其他材料') continue;
                if (keys.some(k => name.includes(k))) {
                    category = cat;
                    break;
                }
            }
        }
        if (!category) category = '其他材料';
        if (!categories[category]) categories[category] = [];
        categories[category].push(f);
    });
    Object.keys(categories).forEach(k => {
        if (!categories[k].length) delete categories[k];
    });
    return categories;
}

function getFileIcon(name) {
    if (!name) return 'fa-file';
    const ext = name.split('.').pop().toLowerCase();
    const map = {
        pdf: 'fa-file-pdf', doc: 'fa-file-word', docx: 'fa-file-word',
        xls: 'fa-file-excel', xlsx: 'fa-file-excel',
        ppt: 'fa-file-powerpoint', pptx: 'fa-file-powerpoint',
        jpg: 'fa-file-image', jpeg: 'fa-file-image', png: 'fa-file-image', gif: 'fa-file-image',
        zip: 'fa-file-archive', rar: 'fa-file-archive',
        txt: 'fa-file-alt', md: 'fa-file-alt'
    };
    return map[ext] || 'fa-file';
}

function toggleCategory(header) {
    header.closest('.doc-detail-category').classList.toggle('expanded');
}

// ===== 右侧文书生成与展示 =====
function renderDocument() {
    const paper = document.getElementById('docPaper');
    if (pageDoc) {
        const content = (pageDoc.versions && pageDoc.versions[0] && pageDoc.versions[0].content) || '';
        paper.innerHTML = content;
    } else {
        const content = generateDocumentContent(pageCaseItem, pageOrg, pageParams);
        paper.innerHTML = content;
    }
}

function generateDocumentContent(caseData, orgType, params) {
    const templates = getCurrentTemplates();
    const docTypes = getCurrentDocTypes();
    const templateName = getTemplateName(templates[params.template]) || '法律文书';
    const docTypeName = (docTypes[params.docType] && docTypes[params.docType].name) || '';
    const cause = caseData.cause || '纠纷';
    const caseName = caseData.caseName || caseData.caseNumber || '';
    const caseNumber = caseData.caseNumber || '';
    const partyA = caseData.partyA || '原告';
    const partyB = caseData.partyB || '被告';
    const requirement = params.requirement || '';
    const labels = getCurrentBusiness().partiesLabels;
    const dateStr = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }).replace(/\//g, '年').replace(/,/g, '日');

    let body = '';
    if (orgType === 'court') {
        body = `<h2>${templateName}</h2>
            <div class="case-number">${caseNumber}</div>
            <p><strong>${labels[0]}：</strong>${partyA}。</p>
            <p><strong>${labels[1]}：</strong>${partyB}。</p>
            <h3>一、案件由来和审理经过</h3>
            <p>${labels[0]}诉${labels[1]}${cause}一案，本院立案后依法公开开庭进行了审理。本案现已审理终结。</p>
            <h3>二、${labels[0]}诉称</h3>
            <p>${labels[0]}向本院提出诉讼请求，要求${labels[1]}承担相应责任。事实和理由：${requirement || '详见起诉状及相关证据材料。'}</p>
            <h3>三、本院查明的事实</h3>
            <p>本院经审理认定事实如下：根据当事人陈述及经审查确认的证据，本院查明案件事实清楚，证据确实充分。</p>
            <h3>四、本院认为</h3>
            <p>根据相关法律规定，结合本案查明的事实，本院认为${labels[0]}诉请于法有据，应予支持。</p>
            <h3>五、判决结果</h3>
            <p>依照相关法律规定，判决如下：</p>
            <p>一、${labels[1]}于本判决生效之日起十日内履行相应义务；</p>
            <p>二、驳回${labels[0]}的其他诉讼请求。</p>
            <p>如不服本判决，可在判决书送达之日起十五日内提起上诉。</p>
            <div class="signature">
                <p>审　判　长　${(caseData.handler || '').replace('法官', '')}</p>
                <p>${dateStr}</p>
            </div>`;
    } else if (orgType === 'procuratorate') {
        body = `<h2>${templateName}</h2>
            <div class="case-number">${caseNumber}</div>
            <p><strong>${labels[0]}：</strong>${partyA}。</p>
            <p><strong>${labels[1]}：</strong>${partyB}。</p>
            <h3>一、案件来源</h3>
            <p>本案由公安机关侦查终结，以${labels[0]}涉嫌${cause}，于近日移送本院审查起诉。</p>
            <h3>二、审查认定的事实</h3>
            <p>经依法审查查明：${labels[0]}实施了${cause}行为，事实清楚，证据确实充分。${requirement || '具体事实详见侦查卷宗。'}</p>
            <h3>三、处理意见</h3>
            <p>本院认为，${labels[0]}的行为已触犯《中华人民共和国刑法》相关规定，犯罪事实清楚，证据确实充分，应当以${cause}追究其刑事责任。</p>
            <h3>四、决定事项</h3>
            <p>根据审查情况，本院决定依法提起公诉。</p>
            <div class="signature">
                <p>${caseData.handler || ''}</p>
                <p>${dateStr}</p>
            </div>`;
    } else {
        body = `<h2>${templateName}</h2>
            <div class="case-number">${caseNumber}</div>
            <p><strong>${labels[0]}：</strong>${partyA}。</p>
            <p><strong>${labels[1]}：</strong>${partyB}。</p>
            <h3>一、调解请求</h3>
            <p>${labels[0]}因${cause}与${labels[1]}发生争议，向本调解委员会申请调解。</p>
            <h3>二、争议事实</h3>
            <p>经调解委员会调查核实，双方当事人就${cause}事项存在争议。${requirement || '具体事实详见调解申请书及相关材料。'}</p>
            <h3>三、调解结果</h3>
            <p>经双方当事人自愿协商，达成如下协议：双方同意通过友好协商方式解决争议，${labels[1]}同意向${labels[0]}作出相应补偿。</p>
            <h3>四、协议履行</h3>
            <p>本协议自双方签字之日起生效，双方应按照协议内容履行各自义务。</p>
            <div class="signature">
                <p>调　解　员　${(caseData.handler || '').replace('调解员', '')}</p>
                <p>${dateStr}</p>
            </div>`;
    }
    return `<div style="font-family:'Noto Serif SC','SimSun',serif;line-height:2;text-align:justify;">${body}</div>`;
}

function showEmptyState(message) {
    document.getElementById('headerCaseName').textContent = message;
    document.getElementById('headerDocInfo').textContent = '';
    document.getElementById('docViewport').innerHTML = `
        <div class="doc-detail-empty">
            <i class="fas fa-file-alt"></i>
            <div>${message}</div>
        </div>
    `;
}

function goBackToCases() {
    window.location.href = 'cases.html';
}

function printDocument() {
    window.print();
}

function downloadDocument() {
    const paper = document.getElementById('docPaper');
    if (!paper || !paper.innerHTML) return;
    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>${pageCaseItem.caseName || '法律文书'}</title>
    <style>body{font-family:'Noto Serif SC','SimSun',serif;line-height:2;padding:40px;max-width:800px;margin:0 auto;}h2{text-align:center;font-size:22pt;}p{text-indent:2em;font-size:14pt;}</style>
</head>
<body>${paper.innerHTML}</body>
</html>`;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${pageCaseItem.caseName || '法律文书'}.html`;
    a.click();
    URL.revokeObjectURL(url);
}

// v1.38: 精修跳转（任务 5.2）
function refineDocument() {
    if (!pageCaseId || !pageDoc) {
        showNotification('文书数据缺失，无法精修', 'warning');
        return;
    }
    // 取最新版本作为精修目标
    const versions = pageDoc.versions || [];
    const latestVersion = versions[0];
    if (!latestVersion || !latestVersion.versionId) {
        showNotification('未找到可精修的文书版本', 'warning');
        return;
    }
    const url = `document-polish.html?caseId=${encodeURIComponent(pageCaseId)}&versionId=${encodeURIComponent(latestVersion.versionId)}`;
    const win = window.open(url, '_blank');
    if (!win) {
        showNotification('浏览器弹窗被拦截，请允许弹窗后重试', 'error');
    }
}

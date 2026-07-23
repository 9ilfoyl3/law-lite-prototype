// ============ Documents Page JavaScript ============

// Document data
const documentData = [
    { id: 'doc1', name: '(2024)粤01民初12345号民事判决书', caseNumber: '(2024)粤01民初12345号', type: 'pdf', size: '256KB', date: '2024-12-20 15:30' },
    { id: 'doc2', name: '(2024)粤01民初12346号庭审提纲', caseNumber: '(2024)粤01民初12346号', type: 'doc', size: '128KB', date: '2024-12-18 10:15' },
    { id: 'doc3', name: '(2024)粤01民初12347号争议焦点分析', caseNumber: '(2024)粤01民初12347号', type: 'doc', size: '89KB', date: '2024-12-15 09:45' },
    { id: 'doc4', name: '(2024)粤01民初11234号民事调解书', caseNumber: '(2024)粤01民初11234号', type: 'pdf', size: '312KB', date: '2024-11-25 16:20' },
    { id: 'doc5', name: '(2024)粤01民初11235号民事判决书', caseNumber: '(2024)粤01民初11235号', type: 'pdf', size: '456KB', date: '2024-12-10 11:30' },
    { id: 'doc6', name: '(2024)粤01民初10086号庭审提纲', caseNumber: '(2024)粤01民初10086号', type: 'doc', size: '156KB', date: '2024-12-05 14:00' },
    { id: 'doc7', name: '(2023)粤01民终8765号民事裁定书', caseNumber: '(2023)粤01民终8765号', type: 'pdf', size: '234KB', date: '2023-10-20 09:00' },
    { id: 'doc8', name: '(2024)粤01民初9876号争议焦点分析', caseNumber: '(2024)粤01民初9876号', type: 'doc', size: '178KB', date: '2024-11-28 16:45' },
    { id: 'doc9', name: '(2024)粤01民初8765号民事判决书', caseNumber: '(2024)粤01民初8765号', type: 'pdf', size: '389KB', date: '2024-11-18 13:20' },
    { id: 'doc10', name: '(2024)粤01民初7654号庭审提纲', caseNumber: '(2024)粤01民初7654号', type: 'doc', size: '145KB', date: '2024-11-12 10:30' },
    { id: 'doc11', name: '(2024)粤01民初6543号开庭通知书', caseNumber: '(2024)粤01民初6543号', type: 'pdf', size: '98KB', date: '2024-11-08 15:00' },
    { id: 'doc12', name: '(2024)粤01民初5432号民事裁定书', caseNumber: '(2024)粤01民初5432号', type: 'pdf', size: '167KB', date: '2024-11-01 09:30' }
];

// Render document list
function renderDocumentList(docs = documentData) {
    const listBody = document.getElementById('documentListBody');
    
    if (docs.length === 0) {
        listBody.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">
                    <i class="fas fa-file-alt"></i>
                </div>
                <div class="empty-title">暂无文档</div>
                <div class="empty-desc">点击上方"新建文书"按钮创建您的第一个文档</div>
            </div>
        `;
        return;
    }

    listBody.innerHTML = docs.map(doc => `
        <div class="document-item" data-doc-id="${doc.id}">
            <div class="document-info">
                <div class="document-icon ${doc.type}">
                    <i class="fas fa-file-${doc.type === 'pdf' ? 'pdf' : 'word'}"></i>
                </div>
                <div class="document-name-wrapper">
                    <div class="document-name">${doc.name}</div>
                    <div class="document-case">${doc.caseNumber}</div>
                </div>
            </div>
            <div class="document-type">${doc.type.toUpperCase()}</div>
            <div class="document-size">${doc.size}</div>
            <div class="document-date">${doc.date}</div>
            <div class="document-actions">
                <button class="document-action-btn" title="预览" onclick="previewDoc('${doc.id}')">
                    <i class="fas fa-eye"></i>
                </button>
                <button class="document-action-btn" title="下载" onclick="downloadDoc('${doc.id}')">
                    <i class="fas fa-download"></i>
                </button>
                <button class="document-action-btn" title="更多">
                    <i class="fas fa-ellipsis-v"></i>
                </button>
            </div>
        </div>
    `).join('');
}

// Filter documents
function filterDocuments() {
    const searchQuery = document.getElementById('docSearchInput').value.toLowerCase().trim();
    const typeFilter = document.getElementById('typeFilter').value;
    const taskFilter = document.getElementById('taskFilter').value;
    const sortFilter = document.getElementById('sortFilter').value;

    let filtered = [...documentData];

    if (searchQuery) {
        filtered = filtered.filter(doc =>
            doc.name.toLowerCase().includes(searchQuery) ||
            doc.caseNumber.toLowerCase().includes(searchQuery)
        );
    }

    if (typeFilter) {
        filtered = filtered.filter(doc => doc.type === typeFilter);
    }

    if (taskFilter) {
        filtered = filtered.filter(doc => doc.taskType === taskFilter);
    }

    // Sort
    filtered.sort((a, b) => {
        switch (sortFilter) {
            case 'name':
                return a.name.localeCompare(b.name);
            case 'size':
                return parseSize(a.size) - parseSize(b.size);
            case 'date':
            default:
                return new Date(b.date) - new Date(a.date);
        }
    });

    renderDocumentList(filtered);
}

// Parse size string to bytes
function parseSize(sizeStr) {
    const num = parseFloat(sizeStr);
    if (sizeStr.includes('MB')) return num * 1024 * 1024;
    if (sizeStr.includes('KB')) return num * 1024;
    return num;
}

// Use template
function useTemplate(templateType) {
    const templateNames = {
        'judgment': '民事判决书',
        'ruling': '民事裁定书',
        'mediation': '民事调解书',
        'outline': '庭审提纲',
        'focus': '争议焦点',
        'notice': '开庭通知书'
    };
    
    showNotification(`正在使用${templateNames[templateType]}模板……`, 'success');
    setTimeout(() => {
        window.location.href = '../index.html';
    }, 500);
}

// Preview document
function previewDoc(docId) {
    const doc = documentData.find(d => d.id === docId);
    if (doc) {
        showNotification(`预览文档：${doc.name}`, 'success');
    }
}

// Download document
function downloadDoc(docId) {
    const doc = documentData.find(d => d.id === docId);
    if (doc) {
        showNotification(`下载文档：${doc.name}`, 'success');
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    // Render initial document list
    renderDocumentList();

    // Search input handler
    document.getElementById('docSearchInput').addEventListener('input', filterDocuments);

    // Filter handlers
    document.getElementById('typeFilter').addEventListener('change', filterDocuments);
    document.getElementById('taskFilter').addEventListener('change', filterDocuments);
    document.getElementById('sortFilter').addEventListener('change', filterDocuments);
});

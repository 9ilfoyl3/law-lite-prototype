// 临时冒烟：updateResultDocInfo（生成后文书信息条）
function updateResultDocInfoSource() {}
const fs = require('fs');
const src = fs.readFileSync('js/case-files.js', 'utf8');
const start = src.indexOf('function updateResultDocInfo');
let i = src.indexOf('{', start), depth = 0, j = i;
for (; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) break; }
}
const fnSrc = src.slice(start, j + 1);

function makeEl() { return { _t: '', set textContent(v) { this._t = String(v); }, get textContent() { return this._t; } }; }
const els = {
    resultDocInfoTitle: makeEl(),
    resultDocInfoSub: makeEl(),
    resultDocVersionNo: makeEl()
};
global.document = { getElementById: id => els[id] || null };
global.caseItem = { caseName: '测试案件3' };
global.resultDocTitle = '材料总结';
global.resultDocVersionNo = 1;

eval(fnSrc);
updateResultDocInfo();

let pass = 0, fail = 0;
const check = (name, cond, extra) => { if (cond) { pass++; console.log('  ✅ ' + name); } else { fail++; console.log('  ❌ ' + name + ' → ' + extra); } };
check('标题 = 案件名_文书名', els.resultDocInfoTitle._t === '测试案件3_材料总结', els.resultDocInfoTitle._t);
check('副标题前缀', /^第 1 版 · 系统管理员 · \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(els.resultDocInfoSub._t), els.resultDocInfoSub._t);
check('版本徽章号', els.resultDocVersionNo._t === '1', els.resultDocVersionNo._t);

// 无案件名时仅文书名
global.caseItem = null;
eval(fnSrc);
updateResultDocInfo();
check('无案件名时标题仅文书名', els.resultDocInfoTitle._t === '材料总结', els.resultDocInfoTitle._t);

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);

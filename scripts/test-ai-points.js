// اختبار وحدة النقاط: 注册 + الشراء + التجديد اليومي
const ai = require(require('path').join(__dirname, '..', 'utils', 'ai-points.js'));
let bad = 0;
function ck(name, actual, expected) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) bad++;
    console.log((ok ? '  ok   ' : '  FAIL ') + name + '  got=' + JSON.stringify(actual) + (ok ? '' : ' want=' + JSON.stringify(expected)));
}

console.log('=== حساب جديد ===');
ck('a new student starts at 0', ai.STARTING_AI_TOKENS, 0);
ck('a new teacher starts at 0', ai.STARTING_AI_TOKENS, 0);

console.log('\n=== المنح المجاني الافتراضي ===');
ck('no settings at all -> 0', ai.freeAiPoints(undefined, 'student'), 0);
ck('empty settings -> 0', ai.freeAiPoints({}, 'student'), 0);
ck('student key missing -> 0', ai.freeAiPoints({ teacher_free_ai_points: 3 }, 'student'), 0);
ck('teacher key missing -> 0', ai.freeAiPoints({ student_free_ai_points: 3 }, 'teacher'), 0);
ck('null value -> 0', ai.freeAiPoints({ student_free_ai_points: null }, 'student'), 0);
ck('negative -> 0', ai.freeAiPoints({ student_free_ai_points: -5 }, 'student'), 0);
ck('string "7" -> 7', ai.freeAiPoints({ student_free_ai_points: '7' }, 'student'), 7);

console.log('\n=== المالك رفع المنح في لوحة الإعدادات ===');
ck('owner gives 3 to students', ai.freeAiPoints({ student_free_ai_points: 3 }, 'student'), 3);
ck('owner gives 4 to teachers', ai.freeAiPoints({ teacher_free_ai_points: 4 }, 'teacher'), 4);

console.log('\n=== التجديد اليومي ===');
ck('0 free, balance 0 -> stays 0', ai.dailyGrant(0, 0), { tokens: 0, granted: 0 });
ck('0 free, balance 50 -> stays 50 (لا يُمحى)', ai.dailyGrant(50, 0), { tokens: 50, granted: 0 });
ck('0 free, balance 500 -> stays 500', ai.dailyGrant(500, 0), { tokens: 500, granted: 0 });
ck('3 free, balance 50 -> 53', ai.dailyGrant(50, 3), { tokens: 53, granted: 3 });
ck('3 free, balance 0 -> 3', ai.dailyGrant(0, 3), { tokens: 3, granted: 3 });
ck('undefined balance + 3 free -> 3', ai.dailyGrant(undefined, 3), { tokens: 3, granted: 3 });
ck('null balance + 0 free -> 0', ai.dailyGrant(null, 0), { tokens: 0, granted: 0 });
ck('negative balance never granted', ai.dailyGrant(-9, 0), { tokens: 0, granted: 0 });

console.log('\n=== ما بعد 30 يوماً من الشراء ===');
let balance = 0;
balance += 100;                              // اشترى باقة 100 نقطة
for (let day = 0; day < 30; day++) balance = ai.dailyGrant(balance, 0).tokens;
ck('100 نقطة تبقى 100 بعد 30 يوم', balance, 100);

let balance2 = 20;
for (let day = 0; day < 30; day++) balance2 = ai.dailyGrant(balance2, 3).tokens;
ck('20 نقطة + 3 يومية × 30 = 110', balance2, 110);

console.log('\n' + (bad ? 'PROBLEMS: ' + bad : 'ALL GOOD'));
process.exit(bad ? 1 : 0);
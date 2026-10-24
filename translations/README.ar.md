# Dustcode

<div dir="rtl">

Dustcode وكيل برمجة بالذكاء الاصطناعي مفتوح المصدر مخصص لـ **VS Code** فقط. يحتفظ هذا الفرع بالإضافة وواجهة backend المضمّنة فقط، ولا يوزّع CLI مستقلاً أو إضافة JetBrains أو منتجًا سحابيًا.

## التثبيت

1. شغّل `bun run build:vscode` من جذر المستودع، أو نزّل الملف المناسب لمنصتك من تشغيل **VS Code** ناجح في GitHub Actions لهذا المستودع.
2. فك الضغط عند الحاجة، ثم اختر `dustcode-<target>.vsix` باستخدام **Extensions: Install from VSIX...** في VS Code.
3. افتح Dustcode واضبط مزوّد النماذج بشكل منفصل.

معرّف الإضافة هو `dustcode.dustcode`، وتستخدم الإعدادات `dustcode.*`، وتُحفظ حالة المشروع في `.dustcode/`. لا تُستورد بيانات الدخول أو جلسات Kilo Code. لا يوجد نشر تلقائي أو صفحة Dustcode مؤكدة في Marketplace ضمن الإعداد الحالي. Kilo Gateway خدمة خارجية وليست خدمة يشغّلها Dustcode.

راجع [README الرئيسي](../README.md) للمعلومات المعتمدة حول الإعداد والتطوير، و[RELEASING.md](../RELEASING.md) لبناء VSIX وملفات CI.

## المصدر والترخيص

Dustcode فرع من [Kilo Code](https://github.com/Kilo-Org/kilocode)، وتعود أصول backend إلى [OpenCode](https://github.com/anomalyco/opencode).

MIT. يمكنك استخدام هذا الكود وتعديله وتوزيعه، بما في ذلك تجاريًا، ما دمت تحتفظ بإشعارات النسبة والترخيص. راجع [License](../LICENSE). احتفظ أيضًا بإشعارات حقوق النشر والتراخيص للمكونات الخارجية.

</div>

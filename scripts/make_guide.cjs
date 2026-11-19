// راهنمای فارسی کلاس‌هاب — سند docx راست‌به‌چپ
// Runner: node scripts/make_guide.js  (خروجی: download/راهنمای-کلاسهاب.docx)
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, PageNumber, NumberFormat, AlignmentType, HeadingLevel,
  WidthType, BorderStyle, ShadingType, TableLayoutType, SectionType,
  TableOfContents, PageBreak,
} = require("docx");
const fs = require("fs");
const path = require("path");

// ─── پالت (برگرفته از پالت پاستلی خود اپ + WM-1 آموزشی) ───
const P = {
  bg: "F7F3FA",          // پس‌زمینه جلد: بنفش پاستلی خیلی روشن
  primary: "57496F",     // بنفش تیره برای عنوان‌ها
  body: "373343",        // متن اصلی (همان --text اپ)
  secondary: "918B9B",   // خاکستری دومویه
  accent: "8A6FB8",      // بنفش لوندر (همان --lavender-deep)
  pinkDeep: "C2739B",
  surface: "F2EDF7",
  headerBg: "8A6FB8",
  headerText: "FFFFFF",
  innerLine: "DCCFEA",
};

const FONT = { ascii: "Vazirmatn", eastAsia: "Vazirmatn", hAnsi: "Vazirmatn", cs: "Vazirmatn" };
const NB = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const noBorders = { top: NB, bottom: NB, left: NB, right: NB };
const allNoBorders = { top: NB, bottom: NB, left: NB, right: NB, insideHorizontal: NB, insideVertical: NB };

// ─── سازنده‌های پایه ───
function faHeading(text, level) {
  const sizes = { 1: 34, 2: 28, 3: 25 };
  const lv = { 1: HeadingLevel.HEADING_1, 2: HeadingLevel.HEADING_2, 3: HeadingLevel.HEADING_3 };
  return new Paragraph({
    heading: lv[level],
    bidirectional: true,
    alignment: AlignmentType.RIGHT,
    spacing: { before: level === 1 ? 400 : 280, after: 140, line: 340, lineRule: "atLeast" },
    children: [new TextRun({ text, bold: true, size: sizes[level], color: P.primary, font: FONT })],
  });
}

function faBody(text, opts = {}) {
  return new Paragraph({
    bidirectional: true,
    alignment: AlignmentType.RIGHT,
    spacing: { line: 340, after: 120 },
    children: [new TextRun({ text, size: 24, color: P.body, font: FONT, ...opts })],
  });
}

// بند با توپُف (bullet) راست‌چین
function faBullet(runs) {
  return new Paragraph({
    bidirectional: true,
    alignment: AlignmentType.RIGHT,
    spacing: { line: 330, after: 80 },
    indent: { right: 340, hanging: 220 },
    children: [new TextRun({ text: "•  ", size: 24, color: P.accent, font: FONT, bold: true }),
               ...runs],
  });
}

function faRuns(parts) {
  return parts.map((p) => new TextRun({ size: 24, color: P.body, font: FONT, ...p }));
}

// جدول راست‌به‌چپ با ردیف سرستون بنفش
function faTable(headerCells, rows, colPcts) {
  const cellPara = (text, bold, color) => new Paragraph({
    bidirectional: true,
    alignment: AlignmentType.RIGHT,
    spacing: { line: 300, before: 20, after: 20 },
    children: [new TextRun({ text, bold: !!bold, size: 21, color: color || P.body, font: FONT })],
  });
  const mkCell = (text, i, isHeader) => new TableCell({
    width: { size: colPcts[i], type: WidthType.PERCENTAGE },
    shading: isHeader ? { type: ShadingType.CLEAR, fill: P.headerBg }
      : undefined,
    margins: { top: 70, bottom: 70, left: 110, right: 110 },
    children: [cellPara(text, isHeader, isHeader ? P.headerText : undefined)],
  });
  return new Table({
    visuallyRightToLeft: true,
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: P.accent },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: P.accent },
      left: NB, right: NB,
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: P.innerLine },
      insideVertical: NB,
    },
    rows: [
      new TableRow({ tableHeader: true, cantSplit: true, children: headerCells.map((t, i) => mkCell(t, i, true)) }),
      ...rows.map((r) => new TableRow({ cantSplit: true, children: r.map((t, i) => mkCell(t, i, false)) })),
    ],
  });
}

function tableCaption(text) {
  return new Paragraph({
    bidirectional: true,
    alignment: AlignmentType.RIGHT,
    keepNext: true,
    spacing: { before: 160, after: 80 },
    children: [new TextRun({ text, bold: true, size: 21, color: P.secondary, font: FONT })],
  });
}

// کادر نکته (border راست بنفش + پس‌زمینه سطح)
function tipBox(title, text) {
  return new Table({
    visuallyRightToLeft: true,
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    borders: allNoBorders,
    rows: [new TableRow({
      cantSplit: true,
      children: [new TableCell({
        shading: { type: ShadingType.CLEAR, fill: P.surface },
        borders: {
          right: { style: BorderStyle.SINGLE, size: 20, color: P.accent },
          top: NB, bottom: NB, left: NB,
        },
        margins: { top: 110, bottom: 110, left: 160, right: 160 },
        children: [
          new Paragraph({
            bidirectional: true, alignment: AlignmentType.RIGHT,
            spacing: { line: 320, after: 60 },
            children: [new TextRun({ text: title, bold: true, size: 23, color: P.accent, font: FONT })],
          }),
          new Paragraph({
            bidirectional: true, alignment: AlignmentType.RIGHT,
            spacing: { line: 320 },
            children: [new TextRun({ text, size: 22, color: P.body, font: FONT })],
          }),
        ],
      })],
    })],
  });
}

// ─── جلد (بر پایه معماری R1: پاراگراف + wrapper بدون حاشیه) ───
function buildCover() {
  const padR = 1300, padL = 900;
  const children = [];

  // فضای بالایی
  children.push(new Paragraph({ spacing: { before: 2600 } }));

  // برچسب بالای عنوان
  children.push(new Paragraph({
    bidirectional: true,
    alignment: AlignmentType.RIGHT,
    indent: { left: padL, right: padR },
    spacing: { after: 420 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: P.pinkDeep, space: 10 } },
    children: [new TextRun({
      text: "راهنمای کاربری", size: 26, color: P.pinkDeep, font: FONT, bold: true, characterSpacing: 20,
    })],
  }));

  // عنوان اصلی (دو خط دستی — بدون نیم‌کلمه شکستن)
  const titleLines = ["کلاس‌هاب", "درگاه سرِ کلاس"];
  const titlePt = 40;
  titleLines.forEach((line, i) => {
    children.push(new Paragraph({
      bidirectional: true,
      alignment: AlignmentType.RIGHT,
      indent: { left: padL, right: padR },
      spacing: {
        after: i < titleLines.length - 1 ? 120 : 300,
        line: Math.ceil(titlePt * 23), lineRule: "atLeast",
      },
      children: [new TextRun({
        text: line, size: titlePt * 2, bold: true, color: P.primary, font: FONT,
      })],
    }));
  });

  // زیرعنوان
  children.push(new Paragraph({
    bidirectional: true,
    alignment: AlignmentType.RIGHT,
    indent: { left: padL, right: padR },
    spacing: { after: 700, line: 400, lineRule: "atLeast" },
    children: [new TextRun({
      text: "برنامه هفتگی، تکالیف، مهلت‌ها و اطلاعیه‌ها — همه در یک صفحه",
      size: 28, color: P.secondary, font: FONT,
    })],
  }));

  // خطوط متا با خط عمودی راست
  const metaLines = [
    "نسخه ۲ — با رابط کاربری ارتقایافته و فونت‌های وزیرمتن و لاله‌زار",
    "آدرس: school.gigaspaceturnip.workers.dev",
    "مخزن گیت‌هاب: GigaShalgham/school-s-stuff",
    "تاریخ تهیه: آذر ۱۴۰۵ (نوامبر ۲۰۲۶)",
  ];
  metaLines.forEach((line) => {
    children.push(new Paragraph({
      bidirectional: true,
      alignment: AlignmentType.RIGHT,
      indent: { left: padL, right: padR + 200 },
      spacing: { after: 90, line: 330, lineRule: "atLeast" },
      border: { right: { style: BorderStyle.SINGLE, size: 10, color: P.accent, space: 14 } },
      children: [new TextRun({ text: line, size: 24, color: P.body, font: FONT })],
    }));
  });

  // فضای پایینی
  children.push(new Paragraph({ spacing: { before: 2300 } }));

  // پانویس جلد
  children.push(new Paragraph({
    bidirectional: true,
    alignment: AlignmentType.CENTER,
    border: { top: { style: BorderStyle.SINGLE, size: 2, color: P.innerLine, space: 10 } },
    spacing: { before: 200 },
    children: [new TextRun({
      text: "تهیه‌شده با ❤ برای کلاس ۱۰/۲ — دبیرستان شهید بهشتی",
      size: 20, color: P.secondary, font: FONT,
    })],
  }));

  // wrapper تک‌جدولی ۱۶۸۳۸ (معماری R1)
  return [new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    borders: allNoBorders,
    rows: [new TableRow({
      height: { value: 16838, rule: "exact" },
      children: [new TableCell({
        shading: { type: ShadingType.CLEAR, fill: P.bg },
        borders: noBorders,
        verticalAlign: "top",
        children,
      })],
    })],
  })];
}

// ─── سربرگ و پانوشت ───
function pageHeader() {
  return new Header({
    children: [new Paragraph({
      bidirectional: true,
      alignment: AlignmentType.RIGHT,
      border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: P.innerLine, space: 6 } },
      spacing: { after: 0 },
      children: [new TextRun({
        text: "راهنمای کاربری کلاس‌هاب", size: 18, color: P.secondary, font: FONT,
      })],
    })],
  });
}

function pageFooter() {
  return new Footer({
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ children: [PageNumber.CURRENT], size: 18, color: P.secondary, font: FONT })],
    })],
  });
}

// ═══════════════════ محتوای فصل‌ها ═══════════════════
const body = [];

// ─── فصل ۱: آشنایی ───
body.push(faHeading("۱. آشنایی با کلاس‌هاب", 1));
body.push(faBody("کلاس‌هاب یک وب‌سایت تک‌صفحه‌ای و راست‌به‌چپ است که به‌عنوان درگاه مشترک کلاس طراحی شده و تمام اطلاعات مهم کلاس را در یک نگاه در دسترس قرار می‌دهد. دانش‌آموزان بدون نیاز به ثبت‌نام یا ورود، برنامه هفتگی کامل، تکالیف هر زنگ، مهلت‌های حساس مانند امتحان‌ها و پروژه‌ها و اطلاعیه‌های کلاس را می‌بینند. سرِ کلاس نیز از طریق پنل مدیریت امن، این اطلاعات را به‌روز نگه می‌دارد."));
body.push(faBody("قلب تپنده سایت، جدول هفتگی است: هفت ستون (شنبه تا جمعه) که زنگ‌های هر روز به ترتیب زمانی در آن چیده شده‌اند و ستون امروز به‌طور خودکار با روبان رنگی و پس‌زمینه بنفش مشخص می‌شود. در نسخه ۲ رابط کاربری به‌طور کامل بازطراحی شده است: تیترها با فونت لاله‌زار و متن‌ها با فونت وزیرمتن (در هفت وزن) نمایش داده می‌شوند، هر درس ایموجی و رنگ اختصاصی خود را دارد و تمام اندازه‌ها با تایپوگرافی سیال بین گوشی و مانیتور بزرگ هماهنگ می‌مانند."));

body.push(tableCaption("جدول ۱ — امکانات کلیدی در یک نگاه"));
body.push(faTable(
  ["بخش", "توضیح", "مخاطب"],
  [
    ["برنامه هفتگی", "هفت ستون روز با کارت‌های زنگ، رنگ و ایموجی هر درس", "همه"],
    ["جزئیات درس", "کلیک روی هر کارت ← پنل کناری (دسکتاپ) یا بات‌شیت (موبایل)", "همه"],
    ["مهلت‌ها", "امتحان، تحقیق، پروژه، ارائه، آزمونک و تحویل با شمارش معکوس زنده", "همه"],
    ["اطلاعیه‌ها", "پیام‌های کلاس؛ موارد سنجاق‌شده در بالا", "همه"],
    ["زنگ اعلان", "مهلت‌های فوری و اطلاعیه‌های سنجاق‌شده", "همه"],
    ["پنل مدیریت", "ورود امن سرِ کلاس برای ویرایش همه اطلاعات", "سرِ کلاس"],
  ],
  [22, 56, 22],
));
body.push(new Paragraph({ spacing: { after: 120 } }));

body.push(tipBox("💡 نکته", "سایت کاملاً واکنش‌گراست؛ در گوشی جدول هفتگی به‌صورت افقی قابل کشیدن است و دکمه شناور «برو به امروز» همیشه شما را به ستون امروز برمی‌گرداند."));

// ─── فصل ۲: شروع ───
body.push(faHeading("۲. شروع به کار", 1));
body.push(faBody("برای استفاده دانش‌آموزان هیچ کاری لازم نیست: کافی است آدرس سایت را در مرورگر باز کنید. اما برای نخستین راه‌اندازی، سرِ کلاس باید حساب مدیر را بسازد و اطلاعات کلاس را وارد کند. این بخش هر دو مسیر را توضیح می‌دهد."));

body.push(faHeading("۲-۱. ورود دانش‌آموزان", 2));
body.push(faBody("آدرس سایت را باز کنید (می‌توانید آن را در صفحه اصلی گوشی ذخیره کنید تا همیشه دم‌دست باشد). صفحه اصلی شامل سربرگ با نام کلاس و تاریخ شمسی و ساعت زنده تهران، نوار خوش‌آمدگویی، جدول هفتگی، مهلت‌ها و اطلاعیه‌هاست. همه اطلاعات عمومی است و نیازی به ورود ندارد."));

body.push(faHeading("۲-۲. ورود مدیر کلاس", 2));
body.push(faBody("حساب مدیر کلاس از قبل ساخته شده است؛ کافی است از آدرس /admin با نام کاربری و گذرواژه وارد شوید. اگر روزی حساب مدیر پاک شود، بار بعدی که کسی به /admin برود، فرم ورود به‌صورت خودکار به فرم «ساخت حساب مدیر» تبدیل می‌شود و نخستین نفر می‌تواند حساب جدید بسازد — پس گذرواژه را جایی امن نگه دارید. توجه کنید که گذرواژه باید حداقل ۸ نویسه باشد وگرنه سایت با پیام روشن «گذرواژه باید حداقل ۸ نویسه باشد» جلوی ساخت حساب را می‌گیرد."));
body.push(tipBox("🔒 امنیت", "گذرواژه به‌صورت درهم‌سازی‌شده (PBKDF2 با صد هزار تکرار) نگهداری می‌شود و نشست ورود پس از ۱۲ ساعت به‌طور خودکار منقضی می‌شود. اگر گذرواژه را فراموش کردید، از طریق خط فرمان Cloudflare می‌توان جدول مدیران را پاک کرد و راه‌اندازی اولیه را دوباره انجام داد (پیوست الف)."));

// ─── فصل ۳: صفحه اصلی ───
body.push(faHeading("۳. تور صفحه اصلی", 1));

body.push(faHeading("۳-۱. سربرگ", 2));
body.push(faBody("در سربرگ شیشه‌ای سایت، لوگوی کتاب، نام کلاس، تاریخ شمسی امروز و ساعت زنده تهران دیده می‌شود. دکمه زنگ اعلان در سمت چپ، تعداد موارد فوری را با نشان عددی نشان می‌دهد و با کلیک روی آن، فهرست مهلت‌های امروز/فردا و اطلاعیه‌های سنجاق‌شده باز می‌شود. دکمه چرخ‌دنده هم ورود مدیر کلاس است."));

body.push(faHeading("۳-۲. نوار قهرمان (هیرو)", 2));
body.push(faBody("زیر سربرگ، نوار گرادیانی بنفش-صورتی-کرم با آمار زنده کلاس آمده است: تعداد زنگ‌های امروز، مجموع درس‌های هفته، تعداد تکالیف ثبت‌شده و «درس بعدی» امروز با ساعت شروع آن. این آمار هر دقیقه به‌روز می‌شود و اگر کلاس‌های امروز تمام شده باشند، پیام «کلاس‌های امروز تمام شد» نمایش داده می‌شود."));

body.push(faHeading("۳-۳. جدول هفتگی و ساختار زنگ‌ها", 2));
body.push(faBody("هفت ستون روز از شنبه تا جمعه. برنامه بر اساس ساختار واقعی زنگ‌های کلاس چیده شده است: زنگ اول از ساعت ۰۷:۴۵ تا ۰۹:۰۰، زنگ دوم ۰۹:۱۵ تا ۱۰:۳۰، زنگ سوم ۱۱:۰۰ تا ۱۲:۱۵ و زنگ چهارم ۱۲:۳۰ تا ۱۳:۴۵. دوشنبه‌ها فقط سه زنگ است و کلاس از ساعت ۱۲:۱۵ تمام می‌شود؛ سایر روزهای مدرسه (شنبه، یکشنبه، سه‌شنبه و چهارشنبه) چهار زنگ تا ۱۳:۴۵ ادامه دارد و پنجشنبه و جمعه تعطیل است."));
body.push(faBody("هر کارت درس شامل شماره زنگ، ایموجی درس، نام درس، ساعت شروع و پایان و خلاصه تکلیف است؛ اگر مهلتی برای تکلیف تعیین شده باشد، شمارش معکوس آن هم کنار تکلیف می‌آید و اگر مهلت امروز یا نزدیک باشد، نشان قرمز «امروز!» یا «نزدیک!» بالای کارت می‌نشیند. روزهای تعطیل پیام «تعطیل آخر هفته» می‌گیرند."));
body.push(faBullet(faRuns([
  { text: "روی دسکتاپ بزرگ: ", bold: true },
  { text: "هر هفت روز کنار هم دیده می‌شوند و نیازی به اسکرول نیست." },
])));
body.push(faBullet(faRuns([
  { text: "در تبلت و گوشی: ", bold: true },
  { text: "ستون‌ها با کشیدن انگشت به چپ و راست مرور می‌شوند؛ فلش‌های دو طرف، نقطه‌های راهنمای زیر جدول (نقطه پررنگ = روز جاری) و دکمه شناور «برو به امروز» کمک می‌کنند." },
])));

body.push(faHeading("۳-۴. بخش مهلت‌ها", 2));
body.push(faBody("زیر جدول، کارت‌های مهلت به ترتیب نزدیک‌ترین زمان مرتب شده‌اند. هر کارت نوع مورد (تحقیق، پروژه، ارائه، امتحان، آزمونک، تحویل)، درس مرتبط، توضیح کوتاه، تاریخ و ساعت دقیق مهلت و چیپ شمارش معکوس دارد. مهلت‌های مهم نوار رنگی قرمز-کرم بالای کارت می‌گیرند و موارد گذشته به آرشیو می‌روند که با دکمه «آرشیو موارد گذشته» قابل مشاهده‌اند."));

body.push(tableCaption("جدول ۲ — معنی چیپ‌های شمارش معکوس"));
body.push(faTable(
  ["نمایش", "معنی"],
  [
    ["امروز!", "مهلت در جریان امروز است — اولویت بالا"],
    ["فردا", "مهلت فردا است"],
    ["۱۲ ساعت مانده", "کمتر از یک روز باقی مانده"],
    ["۳ روز مانده", "شمارش روزهای تقویمی تا مهلت"],
    ["مهلت گذشته", "زمان گذشته است؛ در آرشیو قابل مشاهده"],
  ],
  [34, 66],
));
body.push(new Paragraph({ spacing: { after: 120 } }));

body.push(faHeading("۳-۵. اطلاعیه‌ها و فوتر", 2));
body.push(faBody("اطلاعیه‌ها با عنوان، خلاصه دوخطی و تاریخ انتشار نمایش داده می‌شوند؛ اطلاعیه‌های سنجاق‌شده با پس‌زمینه صورتی ملایم همیشه بالاتر از بقیه می‌آیند. در پایین صفحه هم فوتر با نام کلاس و پیام سرِ کلاس قرار دارد."));

// ─── فصل ۴: جزئیات درس ───
body.push(faHeading("۴. دیدن جزئیات تکلیف هر درس", 1));
body.push(faBody("روی هر کارت درس کلیک کنید تا پنل جزئیات باز شود؛ در دسکتاپ این پنل از سمت راست صفحه کنار می‌آید و در موبایل به‌شکل ورق پایینی (بات‌شیت) از پایین بالا می‌آید. در این پنل می‌بینید: عنوان تکلیف، توضیحات کامل، صفحات کتاب درسی، دستورالعمل انجام، یادداشت سرِ کلاس، مهلت تحویل با شمارش معکوس و فهرست پیوست‌ها (فایل‌ها با کلیک دانلود می‌شوند)."));
body.push(faBullet(faRuns([{ text: "بستن پنل: ", bold: true }, { text: "دکمه ×، کلیک روی فضای بیرون پنل یا کلید Escape؛ در موبایل می‌توانید با کشیدن دستگیره بالای ورق به پایین آن را ببندید." }])));
body.push(faBullet(faRuns([{ text: "اگر درسی تکلیف نداشته باشد: ", bold: true }, { text: "پیام «برای این درس تکلیفی ثبت نشده است» نمایش داده می‌شود." }])));

// ─── فصل ۵: پنل مدیریت ───
body.push(faHeading("۵. پنل مدیریت (ویژه سرِ کلاس)", 1));
body.push(faBody("پنل مدیریت در آدرس /admin با همان زبان بصری سایت اما با پنج زبانه: «برنامه و تکالیف»، «مهلت‌ها»، «اطلاعیه‌ها»، «درس‌ها» و «تنظیمات». هر تغییر بلافاصله برای همه دانش‌آموزان قابل مشاهده است."));

body.push(faHeading("۵-۱. چیدن برنامه هفتگی با جدول ویرایش", 2));
body.push(faBody("قلب زبانه اول، جدول ویرایش برنامه است: یک ردیف برای هر روز مدرسه (شنبه تا چهارشنبه) و یک ستون برای هر زنگ. در هر خانه یک فهرست بازشدنی از درس‌ها دارید؛ کافی است درس آن زنگ را انتخاب کنید — ساعت شروع و پایان به‌صورت خودکار بر اساس زمان‌بندی استاندارد کلاس پر می‌شود و نیازی به واردکردن ساعت نیست. خانه چهارم دوشنبه از قبل غیرفعال است (با هاشور «بدون کلاس») چون دوشنبه‌ها سه زنگ است؛ ستون زنگ چهارم فقط برای شنبه تا چهارشنبه فعال است. برای خالی‌کردن یک خانه هم کافی است گزینه «— خالی —» را انتخاب کنید."));
body.push(faBody("زیر جدول، دکمه «ذخیره کل برنامه» همه تغییرات را یک‌جا اعمال می‌کند. تا وقتی ذخیره نکنید، شمارنده کنار دکمه به شما یادآوری می‌کند که چند خانه تغییر کرده و هنوز ذخیره نشده است. در هر خانه یک دکمه 📝 هم هست که پنل تکلیف همان درس را باز می‌کند — برای درس‌هایی که تکلیف دارند این دکمه سبز نعنایی است. فهرست پایین صفحه هم خلاصه‌ای از تکالیف ثبت‌شده همه درس‌ها نشان می‌دهد."));
body.push(faBody("در پنل تکلیف می‌توانید عنوان، توضیحات کامل، صفحات کتاب، دستورالعمل، یادداشت سرِ کلاس و مهلت اختیاری را ثبت کنید و فایل پیوست (تصویر، PDF یا سند آفیس تا ۱٫۵ مگابایت) اضافه کنید. پیوست‌های موجود هم در همان‌جا فهرست و با یک کلیک حذف می‌شوند."));

body.push(tableCaption("جدول ۴ — زمان‌بندی استاندارد زنگ‌ها"));
body.push(faTable(
  ["زنگ", "ساعت", "توضیح"],
  [
    ["اول", "۰۷:۴۵ تا ۰۹:۰۰", "شروع مدرسه"],
    ["دوم", "۰۹:۱۵ تا ۱۰:۳۰", "پس از تفریح ۱۵ دقیقه‌ای"],
    ["سوم", "۱۱:۰۰ تا ۱۲:۱۵", "پس از تفریح ناهار ۳۰ دقیقه‌ای — پایان کلاس دوشنبه"],
    ["چهارم", "۱۲:۳۰ تا ۱۳:۴۵", "شنبه، یکشنبه، سه‌شنبه و چهارشنبه"],
  ],
  [20, 34, 46],
));
body.push(new Paragraph({ spacing: { after: 120 } }));

body.push(faHeading("۵-۲. مدیریت مهلت‌ها", 2));
body.push(faBody("مهلت‌ها مستقل از درس‌ها ساخته می‌شوند: نوع، عنوان، درس مرتبط (اختیاری)، توضیحات، تاریخ و ساعت مهلت (به وقت تهران) و اولویت. موارد گذشته را می‌توان با دکمه بایگانی کرد تا از فهرست فعال حذف شوند اما از آرشیو در دسترس بمانند."));

body.push(faHeading("۵-۳. اطلاعیه‌ها، درس‌ها و تنظیمات", 2));
body.push(faBody("اطلاعیه با عنوان، متن و گزینه سنجاق منتشر می‌شود. در زبانه «درس‌ها» می‌توانید درس‌های جدید با نام و یکی از شش رنگ پاستلی اضافه کنید تا در فرم‌های برنامه و مهلت ظاهر شوند. زبانه «تنظیمات» نام کلاس، پیام خوش‌آمد بالای سایت و پیام فوتر را تغییر می‌دهد."));

body.push(tipBox("⚠️ توجه", "عملیات‌های حذف با پنجره تأیید همراه‌اند، اما بازگشتی ندارند؛ قبل از حذف، از درستی مورد مطمئن شوید."));

// ─── فصل ۶: موبایل ───
body.push(faHeading("۶. استفاده در گوشی و تبلت", 1));
body.push(faBody("طراحی موبایل نسخه‌ای مستقل از دسکتاپ نیست بلکه همان تجربه با اندازه‌های متناسب است. جدول هفتگی در موبایل عرض تقریباً یک روز را نشان می‌دهد و با کشیدن افقی بین روزها حرکت می‌کنید؛ نقطه‌های زیر جدول موقعیت روز جاری را نشان می‌دهند و نقطه بنفش امروز را مشخص می‌کند. کارت‌های مهلت در موبایل تک‌ستونه و لمس‌پذیر با ابعاد راحت انگشت می‌شوند، پنل جزئیات به‌صورت ورق پایینی با دستگیره درگ باز می‌شود و دکمه شناور «برو به امروز» وقتی پایین صفحه باشید ظاهر می‌شود."));
body.push(faBody("در پنل مدیریت هم موبایل به‌طور کامل پشتیبانی می‌شود: زبانه‌های بالای پنل در گوشی به‌صورت نواری قابل کشیدن درمی‌آیند و جدول ویرایش برنامه از حالت جدولی به کارت‌های روزانهٔ زیر هم تبدیل می‌شود — هر روز یک کارت با زنگ‌های خودش. دکمه‌های بزرگ و فاصله‌های مناسب لمس، ویرایش برنامه و ثبت تکلیف را در گوشی بدون زحمت ممکن می‌کنند."));
body.push(faTable(
  ["عرض صفحه", "رفتار جدول هفتگی", "پنل جزئیات"],
  [
    ["۳۲۰–۴۸۰ (گوشی کوچک)", "یک روز در دید، اسکرول افقی + نقطه‌ها", "بات‌شیت با درگ"],
    ["۴۸۰–۷۶۸ (گوشی بزرگ)", "یک روز در دید، ستون‌های عریض‌تر", "بات‌شیت با درگ"],
    ["۷۶۸–۱۳۶۰ (تبلت)", "دو تا سه روز در دید + فلش‌ها و نقطه‌ها", "بات‌شیت با درگ"],
    ["۱۳۶۰ و بالاتر (لپ‌تاپ)", "هر هفت روز کنار هم", "پنل کناری راست"],
  ],
  [30, 42, 28],
));
body.push(new Paragraph({ spacing: { after: 120 } }));
body.push(tipBox("📱 افزودن به صفحه اصلی", "در مرورگر گوشی، از منوی «افزودن به صفحه اصلی» استفاده کنید تا کلاس‌هاب مثل یک اپ مستقل با آیکونش اجرا شود."));

// ─── فصل ۷: پرسش‌های متداول ───
body.push(faHeading("۷. پرسش‌های متداول", 1));

const faqs = [
  ["اطلاعات سایت بعد از رفرش می‌پرد؟", "نه. همه داده‌ها در پایگاه داده Cloudflare D1 ذخیره می‌شود و با رفرش مرورگر یا استقرارهای بعدی باقی می‌ماند."],
  ["چرا ستون امروز مشخص نیست؟", "ستون امروز با روبان رنگی بالای ستون و برچسب «امروز» مشخص می‌شود. در موبایل با دکمه «برو به امروز» به آن بروید."],
  ["فایل پیوست چه محدودیتی دارد؟", "تصویر (PNG/JPG/WebP/GIF)، PDF، متن ساده و اسناد Word/PowerPoint/Excel تا ۱٫۵ مگابایت در هر فایل و ۶ مگابایت برای هر مورد."],
  ["اگر گذرواژه مدیر را فراموش کنیم؟", "با ابزار wrangler و دستور پاک‌کردن جدول مدیران (راهنمای پیوست الف) می‌توان راه‌اندازی اولیه را تکرار کرد."],
  ["چرا دوشنبه سه زنگ است و بقیه روزها چهار زنگ؟", "بر اساس برنامه واقعی کلاس: دوشنبه‌ها کلاس از ساعت ۱۲:۱۵ تمام می‌شود و فقط سه زنگ دارد؛ سایر روزها تا ۱۳:۴۵ و چهار زنگ است. پنجشنبه و جمعه هم تعطیل آخر هفته است. اگر برنامه مدرسه تغییر کند، سرِ کلاس می‌تواند از پنل مدیریت خانه‌های جدول را با «— خالی —» آزاد کند."],
  ["چطور درس یک زنگ را عوض کنم؟", "در پنل مدیریت، زبانه «برنامه و تکالیف»، در جدول ویرایش درس جدید را از فهرست همان خانه انتخاب کنید و دکمه «ذخیره کل برنامه» را بزنید. ساعت‌ها خودکار تنظیم می‌شوند."],
  ["امکان تغییر نام کلاس هست؟", "بله؛ در پنل مدیریت، زبانه «تنظیمات» ← نام کلاس را ویرایش و ذخیره کنید."],
  ["پیام «گذرواژه باید حداقل ۸ نویسه باشد» یعنی چه؟", "برای امنیت حساب مدیر، گذرواژه کوتاه‌تر از ۸ نویسه پذیرفته نمی‌شود؛ گذرواژه بلندتر و ترکیبی از حروف و اعداد انتخاب کنید."],
];
faqs.forEach(([q, a], i) => {
  body.push(new Paragraph({
    bidirectional: true,
    alignment: AlignmentType.RIGHT,
    spacing: { before: 160, after: 60, line: 330 },
    children: [new TextRun({ text: `پرسش ${i + 1}: ${q}`, bold: true, size: 24, color: P.accent, font: FONT })],
  }));
  body.push(new Paragraph({
    bidirectional: true,
    alignment: AlignmentType.RIGHT,
    spacing: { after: 100, line: 330 },
    children: [new TextRun({ text: a, size: 23, color: P.body, font: FONT })],
  }));
});

// ─── پیوست ───
body.push(faHeading("پیوست الف — راهنمای فنی و نگهداری", 1));
body.push(faBody("این بخش برای سرِ کلاسی است که می‌خواهد زیرساخت را بشناسد یا مشکلات را رفع کند. کلاس‌هاب به‌طور کامل روی زیرساخت Cloudflare اجرا می‌شود: یک Worker (به‌نام school) هم فایل‌های سایت را میزبانی می‌کند و هم API را اجرا می‌کند؛ پایگاه داده D1 با دو مهاجرت SQL داده‌ها را نگه می‌دارد و فایل‌های پیوست به‌صورت امن (با اعتبارسنجی نوع و حجم) در همان پایگاه داده ذخیره می‌شوند، چون سرویس R2 روی این حساب فعال نیست."));

body.push(tableCaption("جدول ۳ — منابع Cloudflare پروژه"));
body.push(faTable(
  ["منبع", "نام", "توضیح"],
  [
    ["Worker", "school", "اجرای API و میزبانی فایل‌های سایت"],
    ["D1 Database", "school_class_db", "داده‌های برنامه، تکالیف، مهلت‌ها، اطلاعیه‌ها و مدیران"],
    ["R2", "—", "روی این حساب فعال نیست؛ پیوست‌ها در D1"],
  ],
  [22, 30, 48],
));
body.push(new Paragraph({ spacing: { after: 120 } }));

body.push(faHeading("دستورهای پرکاربرد", 2));
const cmds = [
  ["اجرای محلی برای توسعه", "npm install و سپس npm run dev"],
  ["به‌روزرسانی دیتابیس سرور", "npx wrangler d1 migrations apply school_class_db --remote"],
  ["استقرار نسخه جدید", "npx wrangler deploy"],
  ["بازنشانی حساب مدیر (فراموشی گذرواژه)", "npx wrangler d1 execute school_class_db --remote --command \"DELETE FROM admins; DELETE FROM sessions;\""],
  ["اجرای تست‌ها", "npm test"],
];
body.push(faTable(["کار", "دستور"], cmds, [34, 66]));
body.push(new Paragraph({ spacing: { after: 120 } }));
body.push(tipBox("🛡️ امنیت داده‌ها", "رابط عمومی سایت فقط خواندنی است؛ هر تغییری نیازمند نشست مدیر است و در سرور بررسی می‌شود. ورود و آپلود فایل محدودیت نرخ درخواست دارند و فایل‌ها هنگام دانلود به‌صورت پیوست امن (نه اجرای درون‌صفحه‌ای) ارائه می‌شوند."));

// ═══════════════════ سند ═══════════════════
const doc = new Document({
  creator: "کلاس‌هاب",
  title: "راهنمای کاربری کلاس‌هاب",
  styles: {
    default: {
      document: {
        run: { font: FONT, size: 24, color: P.body },
        paragraph: { spacing: { line: 340 } },
      },
      heading1: {
        run: { font: FONT, size: 34, bold: true, color: P.primary },
        paragraph: { spacing: { before: 400, after: 160, line: 340 }, outlineLevel: 0 },
      },
      heading2: {
        run: { font: FONT, size: 28, bold: true, color: P.primary },
        paragraph: { spacing: { before: 280, after: 120, line: 340 }, outlineLevel: 1 },
      },
      heading3: {
        run: { font: FONT, size: 25, bold: true, color: P.primary },
        paragraph: { spacing: { before: 220, after: 100, line: 340 }, outlineLevel: 2 },
      },
    },
  },
  sections: [
    // بخش ۱: جلد (بدون شماره صفحه)
    {
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 0, bottom: 0, left: 0, right: 0 },
        },
      },
      children: buildCover(),
    },
    // بخش ۲: فهرست (شماره رومی)
    {
      properties: {
        type: SectionType.NEXT_PAGE,
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 1440, bottom: 1440, left: 1417, right: 1701 },
          pageNumbers: { start: 1, formatType: NumberFormat.UPPER_ROMAN },
        },
      },
      footers: { default: pageFooter() },
      children: [
        new Paragraph({
          bidirectional: true,
          alignment: AlignmentType.CENTER,
          spacing: { before: 480, after: 360 },
          children: [new TextRun({ text: "فهرست مطالب", bold: true, size: 32, color: P.primary, font: FONT })],
        }),
        new TableOfContents("فهرست", { hyperlink: true, headingStyleRange: "1-3" }),
        new Paragraph({
          bidirectional: true,
          alignment: AlignmentType.RIGHT,
          spacing: { before: 200 },
          children: [new TextRun({
            text: "یادآوری: این فهرست با کد فیلد ساخته شده است؛ پس از هر ویرایش، روی فهرست راست‌کلیک کرده و «به‌روزرسانی فیلد» را بزنید تا شماره صفحات دقیق شود.",
            italics: true, size: 18, color: "888888", font: FONT,
          })],
        }),
        // بدون PageBreak انتهایی — بخش بعدی خودش nextPage است
      ],
    },
    // بخش ۳: بدنه (شماره لاتین از ۱)
    {
      properties: {
        type: SectionType.NEXT_PAGE,
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 1440, bottom: 1440, left: 1417, right: 1701 },
          pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL },
        },
      },
      headers: { default: pageHeader() },
      footers: { default: pageFooter() },
      children: body,
    },
  ],
});

const OUT = path.resolve("/home/z/my-project/download/راهنمای-کلاسهاب.docx");
Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(OUT, buf);
  console.log("saved:", OUT, buf.length, "bytes");
});

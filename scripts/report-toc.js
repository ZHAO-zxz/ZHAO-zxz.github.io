'use strict';

function stripTags(value) {
  return value.replace(/<[^>]+>/g, '').trim();
}

hexo.extend.filter.register('after_render:html', function (html, data) {
  const path = data && data.path;
  const isReportPage = path === '2026/04/27/Q2_2_survival_analysis_report/index.html';
  const isHomePage = path === 'index.html';
  if (!isReportPage && !isHomePage) return html;
  if (html.includes('class="report-toc"')) return html;

  const headings = [];
  const articleHtml = isHomePage ? '' : html;
  const headingPattern = /<h([2-4]) id="([^"]+)"><a href="#[^"]+" class="headerlink" title="[^"]*"><\/a>(.*?)<\/h\1>/g;
  let match;

  while ((match = headingPattern.exec(articleHtml)) !== null) {
    const level = Number(match[1]);
    const id = match[2];
    const title = stripTags(match[3]);

    if (id === 'subtitle-wrap' || !title) continue;

    headings.push({ level, id, title });
  }

  if (isHomePage) {
    headings.push(
      { level: 2, id: 'Part1-数据导入与处理', title: 'Part1: 数据导入与处理' },
      { level: 2, id: 'Part2-Kaplan–Meier-模型与-Log-Rank-检验', title: 'Part2: Kaplan-Meier 模型与 Log-Rank 检验' },
      { level: 2, id: 'Part3-Cox-Proportional-Hazards（Cox-比例风险模型）', title: 'Part3: Cox Proportional Hazards' },
      { level: 2, id: 'Part4-Accelerated-Failure-Time（AFT，加速失效时间模型）', title: 'Part4: Accelerated Failure Time' },
      { level: 2, id: 'Part5：Customer-Lifetime-Value（CLV）', title: 'Part5: Customer Lifetime Value' }
    );
  }

  if (headings.length === 0) return html;

  const links = headings
    .map((heading) => {
      const text = heading.title.length > 42
        ? `${heading.title.slice(0, 42)}...`
        : heading.title;

      const href = isHomePage
        ? `/2026/04/27/Q2_2_survival_analysis_report/#${heading.id}`
        : `#${heading.id}`;

      return `  <a class="report-toc-link report-toc-h${heading.level}" href="${href}" data-target="${heading.id}">${text}</a>`;
    })
    .join('\n');

  const toc = `
<style>
  html {
    scroll-behavior: smooth;
  }

  .report-toc {
    position: fixed;
    top: 120px;
    right: 18px;
    width: 245px;
    max-height: calc(100vh - 150px);
    z-index: 100;
    padding: 14px 16px;
    overflow: auto;
    border-left: 3px solid #2f7d62;
    background: rgba(255, 255, 255, 0.97);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
    font-size: 13px;
    line-height: 1.35;
  }

  .report-toc-title {
    display: block;
    margin-bottom: 9px;
    color: #222;
    font-size: 15px;
    font-weight: 700;
  }

  .report-toc-link {
    display: block;
    margin: 3px 0;
    padding: 4px 6px;
    border-radius: 4px;
    color: #315f88;
    text-decoration: none;
  }

  .report-toc-link:hover,
  .report-toc-link.is-active {
    color: #1f624b;
    background: #edf6f2;
  }

  .report-toc-h2 {
    margin-top: 8px;
    padding-left: 6px;
    font-weight: 700;
  }

  .report-toc-h3 {
    padding-left: 18px;
  }

  .report-toc-h4 {
    padding-left: 32px;
    color: #55718a;
    font-size: 12px;
  }

  @media (max-width: 1180px) {
    .report-toc {
      position: static;
      width: auto;
      max-width: 800px;
      max-height: none;
      margin: 0 auto 18px;
      border-left: 0;
      border-top: 3px solid #2f7d62;
    }
  }
</style>
<nav class="report-toc" aria-label="Report table of contents">
  <strong class="report-toc-title">目录 Contents</strong>
${links}
</nav>
<script>
  (function () {
    var links = Array.prototype.slice.call(document.querySelectorAll('.report-toc-link'));
    var headings = links.map(function (link) {
      return document.getElementById(link.getAttribute('data-target'));
    }).filter(Boolean);

    function setActive(id) {
      links.forEach(function (link) {
        link.classList.toggle('is-active', link.getAttribute('data-target') === id);
      });
    }

    if (!('IntersectionObserver' in window)) return;

    var observer = new IntersectionObserver(function (entries) {
      var visible = entries
        .filter(function (entry) { return entry.isIntersecting; })
        .sort(function (a, b) { return a.boundingClientRect.top - b.boundingClientRect.top; });

      if (visible[0]) setActive(visible[0].target.id);
    }, {
      rootMargin: '-20% 0px -70% 0px',
      threshold: 0
    });

    headings.forEach(function (heading) {
      observer.observe(heading);
    });
  })();
</script>
`;

  return html.replace('<section id="main">', `${toc}\n        <section id="main">`);
});

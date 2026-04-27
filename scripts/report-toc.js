'use strict';

hexo.extend.filter.register('after_render:html', function (html, data) {
  const path = data && data.path;
  if (path !== '2026/04/27/Q2_2_survival_analysis_report/index.html') return html;
  if (html.includes('class="report-part-toc"')) return html;

  const parts = [];
  const partHeading = /<h2 id="([^"]+)"><a href="#[^"]+" class="headerlink" title="([^"]+)"><\/a>(Part[1-5][^<]*)<\/h2>/g;
  let match;

  while ((match = partHeading.exec(html)) !== null) {
    parts.push({
      id: match[1],
      title: match[3]
    });
  }

  if (parts.length === 0) return html;

  const labels = [
    'Part 1: Data Processing',
    'Part 2: Kaplan-Meier',
    'Part 3: Cox Model',
    'Part 4: AFT Model',
    'Part 5: CLV'
  ];

  const links = parts
    .map((part, index) => `  <a href="#${part.id}">${labels[index] || part.title}</a>`)
    .join('\n');

  const toc = `
<style>
  html {
    scroll-behavior: smooth;
  }

  .report-part-toc {
    position: fixed;
    top: 150px;
    right: 24px;
    width: 230px;
    z-index: 100;
    padding: 14px 16px;
    border-left: 3px solid #2f7d62;
    background: rgba(255, 255, 255, 0.96);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
    font-size: 14px;
    line-height: 1.45;
  }

  .report-part-toc strong {
    display: block;
    margin-bottom: 8px;
    color: #222;
    font-size: 15px;
  }

  .report-part-toc a {
    display: block;
    margin: 7px 0;
    color: #2f5f88;
    text-decoration: none;
  }

  .report-part-toc a:hover {
    color: #2f7d62;
    text-decoration: underline;
  }

  @media (max-width: 1180px) {
    .report-part-toc {
      position: static;
      width: auto;
      max-width: 800px;
      margin: 0 auto 18px;
      border-left: 0;
      border-top: 3px solid #2f7d62;
    }
  }
</style>
<nav class="report-part-toc" aria-label="Report parts">
  <strong>Report Parts</strong>
${links}
</nav>
`;

  return html.replace('<section id="main">', `${toc}\n        <section id="main">`);
});

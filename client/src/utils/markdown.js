/**
 * Helper to parse markdown tables into structured HTML
 */
const parseMarkdownTables = (html) => {
  const lines = html.split(/\r?\n/);
  const result = [];
  let inTable = false;
  let tableHeader = null;
  let tableAlignments = [];
  let tableRows = [];

  const isRow = (line) => line.trim().startsWith('|') && line.trim().endsWith('|');
  const isSeparator = (line) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return false;
    const test = trimmed.slice(1, -1).replace(/[\s-:|]/g, '');
    return test === '' && trimmed.includes('-');
  };

  const generateHtmlTable = (header, alignments, rows) => {
    let tableHtml = '<table class="min-w-full divide-y divide-border text-sm my-6 border border-border rounded-xl" style="width: 100%; border-collapse: collapse; margin: 24px 0;">\n';
    
    // Header
    tableHtml += '  <thead class="bg-muted text-foreground">\n';
    tableHtml += '    <tr>\n';
    header.forEach((cell, idx) => {
      const align = alignments[idx] || 'left';
      let alignClass = 'text-left';
      if (align === 'center') alignClass = 'text-center';
      if (align === 'right') alignClass = 'text-right';
      const alignStyle = `text-align: ${align || 'left'};`;
      tableHtml += `      <th class="px-4 py-3 ${alignClass} font-semibold text-foreground border border-border" style="${alignStyle} padding: 12px 16px; font-weight: 600;">${cell}</th>\n`;
    });
    tableHtml += '    </tr>\n';
    tableHtml += '  </thead>\n';
    
    // Body
    tableHtml += '  <tbody class="divide-y divide-border text-muted-foreground">\n';
    rows.forEach(row => {
      tableHtml += '    <tr class="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">\n';
      for (let idx = 0; idx < header.length; idx++) {
        const cell = row[idx] !== undefined ? row[idx] : '';
        const align = alignments[idx] || 'left';
        let alignClass = 'text-left';
        if (align === 'center') alignClass = 'text-center';
        if (align === 'right') alignClass = 'text-right';
        const alignStyle = `text-align: ${align || 'left'};`;
        tableHtml += `      <td class="px-4 py-3 ${alignClass} border border-border" style="${alignStyle} padding: 12px 16px;">${cell}</td>\n`;
      }
      tableHtml += '    </tr>\n';
    });
    tableHtml += '  </tbody>\n';
    
    tableHtml += '</table>';
    return tableHtml;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isRow(line)) {
      if (!inTable) {
        if (i + 1 < lines.length && isSeparator(lines[i + 1])) {
          inTable = true;
          const cells = line.trim().slice(1, -1).split('|').map(c => c.trim());
          tableHeader = cells;
          
          const sepCells = lines[i + 1].trim().slice(1, -1).split('|').map(c => c.trim());
          tableAlignments = sepCells.map(cell => {
            const left = cell.startsWith(':');
            const right = cell.endsWith(':');
            if (left && right) return 'center';
            if (right) return 'right';
            if (left) return 'left';
            return '';
          });
          i++; // skip separator line
        } else {
          result.push(line);
        }
      } else {
        const cells = line.trim().slice(1, -1).split('|').map(c => c.trim());
        tableRows.push(cells);
      }
    } else {
      if (inTable) {
        result.push(generateHtmlTable(tableHeader, tableAlignments, tableRows));
        inTable = false;
        tableHeader = null;
        tableAlignments = [];
        tableRows = [];
      }
      result.push(line);
    }
  }

  if (inTable) {
    result.push(generateHtmlTable(tableHeader, tableAlignments, tableRows));
  }

  return result.join('\n');
};

/**
 * Renders raw Markdown string into clean, safe HTML tags
 */
export const renderMarkdownToHTML = (markdown) => {
  if (!markdown) return '';
  
  // Highlight all links by wrapping non-bolded links in bold markdown syntax
  let processed = markdown.replace(/(?<!\*\*|\!|\[)\[([^\]]+)\]\(([^)]+)\)(?!\*\*)/g, '**[$1]($2)**');
  
  // Escape HTML first to prevent XSS
  let html = processed
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // 1. Code blocks: ```language ... ``` (supporting both Unix \n and Windows \r\n line endings)
  html = html.replace(/```(?:[a-zA-Z0-9]+)?\r?\n([\s\S]*?)\r?\n```/g, (match, code) => {
    return `<pre class="bg-black/5 dark:bg-black/40 border border-border dark:border-white/5 p-4 rounded-xl font-mono text-xs text-foreground dark:text-slate-300 my-4 overflow-x-auto select-text"><code>${code}</code></pre>`;
  });

  // 2. Inline code: `code`
  html = html.replace(/`([^`\n]+)`/g, '<code class="bg-slate-100 dark:bg-white/10 px-1 py-0.5 rounded font-mono text-xs text-primary">$1</code>');

  // 3. Headings: #, ##, ###, ####, #####, ######
  html = html.replace(/^###### (.*?)$/gm, '<h6 class="text-xs font-bold text-muted-foreground mt-3 mb-1">$1</h6>');
  html = html.replace(/^##### (.*?)$/gm, '<h6 class="text-xs font-bold text-muted-foreground/80 mt-4 mb-2">$1</h6>');
  html = html.replace(/^#### (.*?)$/gm, '<h5 class="text-xs md:text-sm font-bold text-foreground mt-4 mb-2">$1</h5>');
  html = html.replace(/^### (.*?)$/gm, '<h4 class="text-sm md:text-base font-bold text-foreground mt-5 mb-2">$1</h4>');
  html = html.replace(/^## (.*?)$/gm, '<h3 class="text-base md:text-lg font-bold text-foreground mt-6 mb-3">$1</h3>');
  html = html.replace(/^# (.*?)$/gm, '<h2 class="text-lg md:text-xl font-bold text-foreground mt-7 mb-4">$1</h2>');

  // 4. Bold: **text**
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-bold">$1</strong>');

  // 5. Italic: *text* or _text_
  html = html.replace(/\*([^*]+)\*/g, '<em class="italic">$1</em>');
  html = html.replace(/_([^_]+)_/g, '<em class="italic">$1</em>');

  // 5.2. Images: ![alt](url)
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" class="rounded-xl border border-border dark:border-white/10 my-4 max-w-full h-auto block" style="max-width: 100%; height: auto; border-radius: 12px; border: 1px solid rgba(255,255,255,0.1); margin: 16px 0; display: block;" />');

  // 5.3. Links: [text](url)
  html = html.replace(/(?<!\!)\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-primary hover:underline" style="color: #e76a1d; font-weight: bold; text-decoration: underline;" target="_blank" rel="noopener noreferrer">$1</a>');

  // 6. Tables: parse markdown tables
  html = parseMarkdownTables(html);

  // 7. Lists and Paragraphs: line-by-line parsing
  let lines = html.split('\n');
  let inList = false;
  let inPre = false;
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    
    // Track if we enter a <pre> block (code block) to avoid wrapping its internal lines in <p> tags
    if (line.includes('<pre')) {
      inPre = true;
    }

    if ((line.startsWith('- ') || line.startsWith('* ')) && !inPre) {
      let content = line.substring(2);
      if (!inList) {
        lines[i] = `<ul class="list-disc ml-5 my-3 space-y-1"><li>${content}</li>`;
        inList = true;
      } else {
        lines[i] = `<li>${content}</li>`;
      }
    } else {
      if (inList) {
        lines[i - 1] += '</ul>';
        inList = false;
      }
      // Wrap non-empty lines that do not start with block-level HTML tags and are not inside a preformatted block
      const isBlockHtml = 
        line.startsWith('<h') || 
        line.startsWith('<pre') || 
        line.startsWith('<code') || 
        line.startsWith('<ul') || 
        line.startsWith('<li') || 
        line.startsWith('</ul') ||
        line.startsWith('<div') ||
        line.startsWith('</div') ||
        line.startsWith('<table') ||
        line.startsWith('</table') ||
        line.startsWith('<thead') ||
        line.startsWith('</thead') ||
        line.startsWith('<tbody') ||
        line.startsWith('</tbody') ||
        line.startsWith('<tr') ||
        line.startsWith('</tr') ||
        line.startsWith('<td') ||
        line.startsWith('</td') ||
        line.startsWith('<th') ||
        line.startsWith('</th');

      if (line && !isBlockHtml && !inPre) {
        lines[i] = `<p class="mb-3 leading-relaxed">${line}</p>`;
      }
    }

    // Track if we leave the <pre> block
    if (line.includes('</pre>')) {
      inPre = false;
    }
  }
  if (inList) {
    lines[lines.length - 1] += '</ul>';
  }
  
  return lines.join('\n');
};

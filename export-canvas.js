const fs = require('fs');
const path = require('path');

const canvasDir = path.join(__dirname, 'content/Canvas');
const obsidianVaultPath = path.join(__dirname, 'content');  // Или реальный vault

// Простой парсер MD wikilink [[text]] → <a href="text">text</a>
function parseNodeText(text) {
  if (!text) return '<div>Node</div>';
  // Замена [[link]] на <a>
  return text.replace(/\[\[([^\]]+)\]\]/g, '<a href="$1" style="color: blue; text-decoration: underline;">$1</a>')
             .replace(/!\[\[([^\]]+)\]\]/g, '<a href="$1" style="color: blue;">![$1]</a>');
}

function exportCanvas(canvasFile) {
  const canvasPath = path.join(obsidianVaultPath, canvasFile);
  if (!fs.existsSync(canvasPath)) {
    console.log(`File not found: ${canvasFile}`);
    return;
  }

  let data;
  try {
    data = JSON.parse(fs.readFileSync(canvasPath, 'utf8'));
  } catch (err) {
    console.error(`Parse error: ${err.message}`);
    return;
  }

  const nodesById = new Map();
  if (data.nodes) {
    data.nodes.forEach(node => nodesById.set(node.id?.toString() || node.id, node));
  }

  const htmlFilename = path.basename(canvasFile, '.canvas').replace(/\s+/g, '_') + '.html';
  const htmlPath = path.join(canvasDir, 'html', htmlFilename);
  fs.mkdirSync(path.dirname(htmlPath), { recursive: true });

  // Нормализация + bounds
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  nodesById.forEach(node => {
    const x = node.x || 0;
    const y = node.y || 0;
    const w = node.width || 150;
    const h = node.height || 80;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
  });
  data.edges?.forEach(edge => {
    const from = nodesById.get(edge.fromNode?.toString());
    const to = nodesById.get(edge.toNode?.toString());
    if (from && to) {
      minX = Math.min(minX, from.x, to.x);
      minY = Math.min(minY, from.y, to.y);
      maxX = Math.max(maxX, from.x + (from.width || 150), to.x + (to.width || 150));
      maxY = Math.max(maxY, from.y + (from.height || 80), to.y + (to.height || 80));
    }
  });
  const padding = 50;
  const rawWidth = maxX - minX + 2 * padding;
  const rawHeight = maxY - minY + 2 * padding;
  const scale = Math.min(1, 1200 / rawWidth, 800 / rawHeight);  // Scale если большой
  const width = rawWidth * scale;
  const height = rawHeight * scale;
  const shiftX = (-minX + padding) * scale;
  const shiftY = (-minY + padding) * scale;

  function shiftedNode(node) {
    const x = (node.x || 0) * scale + shiftX;
    const y = (node.y || 0) * scale + shiftY;
    const w = (node.width || 150) * scale;
    const h = (node.height || 80) * scale;
    return { x, y, width: w, height: h, text: node.text || node.title || node.id || 'Node' };
  }

  // SVG
  let svgContent = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">`;
  // Edges
  data.edges?.forEach(edge => {
    const from = shiftedNode(nodesById.get(edge.fromNode?.toString()) || {});
    const to = shiftedNode(nodesById.get(edge.toNode?.toString()) || {});
    if (from.x && to.x) {
      const fromCx = from.x + from.width / 2;
      const fromCy = from.y + from.height / 2;
      const toCx = to.x + to.width / 2;
      const toCy = to.y + to.height / 2;
      svgContent += `<line x1="${fromCx}" y1="${fromCy}" x2="${toCx}" y2="${toCy}" stroke="gray" stroke-width="2" marker-end="url(#arrow)"/>`;
    }
  });
  // Nodes с foreignObject для MD
  nodesById.forEach(node => {
    const s = shiftedNode(node);
    svgContent += `<rect x="${s.x}" y="${s.y}" width="${s.width}" height="${s.height}" fill="lightblue" rx="5" stroke="blue" stroke-width="1" fill-opacity="0.8"/>`;
    svgContent += `<foreignObject x="${s.x + 5}" y="${s.y + 5}" width="${s.width - 10}" height="${s.height - 10}">
      <div xmlns="http://www.w3.org/1999/xhtml" style="font-family: Arial; font-size: 12px; line-height: 1.2; padding: 5px; word-wrap: break-word; color: black;">
        ${parseNodeText(s.text)}
      </div>
    </foreignObject>`;
  });
  svgContent += '<defs><marker id="arrow" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="gray"/></marker></defs></svg>';

  // HTML с meta для MIME
  const html = `<!DOCTYPE html>
  <html><head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"><title>Canvas: ${path.basename(canvasFile)}</title>
  <style>body { font-family: Arial, sans-serif; margin: 20px; background: #f8f8f8; } svg { border: 1px solid #ddd; max-width: 100%; height: auto; cursor: zoom-in; } svg:hover { cursor: zoom-in; } p { font-size: 14px; color: #666; }</style>
  </head><body><h1>Canvas: ${path.basename(canvasFile)}</h1>${svgContent}
  <p>Generated from Obsidian Canvas. Nodes: ${nodesById.size}, Edges: ${data.edges?.length || 0}. Bounds: ${minX.toFixed(0)},${minY.toFixed(0)} to ${maxX.toFixed(0)},${maxY.toFixed(0)} (scaled x${scale.toFixed(2)}).</p></body></html>`;

  fs.writeFileSync(htmlPath, html);
  console.log(`Exported: ${htmlPath} (Size: ${width.toFixed(0)}x${height.toFixed(0)}, Nodes: ${nodesById.size}, Edges: ${data.edges?.length || 0})`);
}

// Запуск
let canvasFiles;
try {
  canvasFiles = fs.readdirSync(obsidianVaultPath).filter(f => f.endsWith('.canvas'));
} catch (err) {
  console.error(`Error: ${err.message}`);
  return;
}
if (canvasFiles.length === 0) {
  console.log('No .canvas. Add to content/.');
  return;
}
canvasFiles.forEach(exportCanvas);
console.log('Export complete!');

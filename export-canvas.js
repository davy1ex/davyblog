import fs from 'fs';
import path from 'path';

const canvasDir = path.join(process.cwd(), 'content/Canvas');
const obsidianVaultPath = path.join(process.cwd(), 'content');  // Замените на реальный vault, если отдельно

// Парсер MD wikilink/image в HTML
function parseNodeText(text) {
  if (!text) return 'Node';
  // [[text]] → <a href="text">
  return text.replace(/\[\[([^\]\|]+)(?:\|([^\]]+))?\]\]/g, (match, page, label) => 
    `<a href="/${page.replace(/\s+/g, '-').toLowerCase()}" style="color: blue; text-decoration: underline;" target="_blank" data-popover-slug="${page}">${label || page}</a>`
  )
  // ![[image]] → <img src="image">
  .replace(/!\[\[([^\]]+)\]\]/g, '<img src="/$1" style="max-width: 100%; height: auto;" alt="$1" loading="lazy" />');
}

// Функция экспорта одного canvas
async function exportCanvas(canvasFile) {
  const canvasPath = path.join(obsidianVaultPath, canvasFile);
  if (!fs.existsSync(canvasPath)) {
    console.log(`File not found: ${canvasFile}`);
    return;
  }

  let data;
  try {
    data = JSON.parse(fs.readFileSync(canvasPath, 'utf8'));
  } catch (err) {
    console.error(`Parse error in ${canvasFile}: ${err.message}`);
    return;
  }

  // Map nodes по ID (string)
  const nodesById = new Map();
  if (data.nodes && Array.isArray(data.nodes)) {
    data.nodes.forEach(node => {
      const id = node.id?.toString();
      if (id) nodesById.set(id, node);
    });
  }

  const htmlFilename = path.basename(canvasFile, '.canvas').replace(/\s+/g, '_').toLowerCase() + '.html';
  const htmlPath = path.join(canvasDir, 'html', htmlFilename);
  fs.mkdirSync(path.dirname(htmlPath), { recursive: true });

  // Bounds для нормализации
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
  if (data.edges && Array.isArray(data.edges)) {
    data.edges.forEach(edge => {
      const from = nodesById.get(edge.fromNode?.toString());
      const to = nodesById.get(edge.toNode?.toString());
      if (from && to) {
        // Учёт якоря (sides)
        const fromAnchor = getAnchor(from, edge.fromSide || 'center');
        const toAnchor = getAnchor(to, edge.toSide || 'center');
        minX = Math.min(minX, fromAnchor.x, toAnchor.x);
        minY = Math.min(minY, fromAnchor.y, toAnchor.y);
        maxX = Math.max(maxX, fromAnchor.x, toAnchor.x);
        maxY = Math.max(maxY, fromAnchor.y, toAnchor.y);
      }
    });
  }
  const padding = 50;
  const rawWidth = maxX - minX + 2 * padding;
  const rawHeight = maxY - minY + 2 * padding;
  const scale = Math.min(1, 1200 / rawWidth, 800 / rawHeight);
  const width = rawWidth * scale;
  const height = rawHeight * scale;
  const shiftX = (-minX + padding) * scale;
  const shiftY = (-minY + padding) * scale;

  // Anchor по side (top/right/bottom/left/center)
  function getAnchor(node, side = 'center') {
    const x = node.x || 0;
    const y = node.y || 0;
    const w = node.width || 150;
    const h = node.height || 80;
    switch (side) {
      case 'top': return { x: x + w / 2, y };
      case 'right': return { x: x + w, y: y + h / 2 };
      case 'bottom': return { x: x + w / 2, y: y + h };
      case 'left': return { x, y: y + h / 2 };
      default: return { x: x + w / 2, y: y + h / 2 };
    }
  }

  function shiftedNode(node) {
    const x = (node.x || 0) * scale + shiftX;
    const y = (node.y || 0) * scale + shiftY;
    const w = (node.width || 150) * scale;
    const h = (node.height || 80) * scale;
    let content = parseNodeText(node.text || node.title || node.id || 'Node');
    // Для type (file/image/note)
    if (node.type === 'image' && node.file?.path) {
      content = `<img src="/${node.file.path}" style="max-width:100%; height:auto;" alt="${node.file.basename || ''}" />`;
    } else if (node.type === 'file' || node.type === 'note') {
      content = `<a href="/${node.file?.path || node.id}" style="display:block; color:inherit; text-decoration:none;" target="_blank" data-popover-slug="${node.file?.basename || node.id}">${content}</a>`;
    }
    return { x, y, width: w, height: h, content };
  }

  // HTML container
  let htmlContent = `<div class="canvas-container" id="canvas-${Date.now()}" style="position: relative; width: ${width}px; height: ${height}px; overflow: hidden; background: #f9f9f9; border: 1px solid #ddd; cursor: grab;">`;
  // Nodes как DIV (absolute)
  nodesById.forEach(node => {
    const s = shiftedNode(node);
    htmlContent += `<div class="node" style="position: absolute; left: ${s.x}px; top: ${s.y}px; width: ${s.width}px; height: ${s.height}px; background: lightblue; border-radius: 5px; border: 1px solid blue; padding: 8px; box-sizing: border-box; overflow: hidden; cursor: pointer; font-family: Arial; font-size: 12px; line-height: 1.3; word-wrap: break-word;" onclick="if(event.target.tagName!=='A') window.open('/${node.file?.path || node.id}', '_blank');">${s.content}</div>`;
  });
  // SVG overlay для edges
  htmlContent += '<svg class="edges-overlay" style="position: absolute; top:0; left:0; width:100%; height:100%; pointer-events: none; z-index: 1;">';
  if (data.edges && Array.isArray(data.edges)) {
    data.edges.forEach(edge => {
      const from = shiftedNode(nodesById.get(edge.fromNode?.toString()) || {});
      const to = shiftedNode(nodesById.get(edge.toNode?.toString()) || {});
      if (from.x && to.x) {
        const fromAnchor = getAnchor({ ...from, width: from.width / scale, height: from.height / scale }, edge.fromSide || 'center');  // Unscale для anchor
        const toAnchor = getAnchor({ ...to, width: to.width / scale, height: to.height / scale }, edge.toSide || 'center');
        const fromAx = fromAnchor.x * scale + shiftX;
        const fromAy = fromAnchor.y * scale + shiftY;
        const toAx = toAnchor.x * scale + shiftX;
        const toAy = toAnchor.y * scale + shiftY;
        // Curved path (bezier для smooth)
        const midX = (fromAx + toAx) / 2;
        const midY = (fromAy + toAy) / 2;
        htmlContent += `<path d="M ${fromAx} ${fromAy} Q ${midX} ${fromAy} ${midX} ${midY} T ${toAx} ${toAy}" stroke="gray" stroke-width="2" fill="none" marker-end="url(#arrow)" />`;
      }
    });
  }
  htmlContent += '<defs><marker id="arrow" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="gray"/></marker></defs></svg></div>';

  // JS для pan/zoom
  const jsScript = `
  <script>
    const container = document.getElementById('canvas-${Date.now()}');
    let scale = 1, posX = 0, posY = 0, isDragging = false, startX, startY;
    container.style.transformOrigin = '0 0';
    function updateTransform() { container.style.transform = \`scale(\${scale}) translate(\${posX}px, \${posY}px)\`; }
    // Zoom (wheel)
    container.addEventListener('wheel', e => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      scale = Math.max(0.5, Math.min(3, scale * delta));
      updateTransform();
    });
    // Pan (drag)
    container.addEventListener('mousedown', e => { isDragging = true; startX = e.clientX - posX; startY = e.clientY - posY; container.style.cursor = 'grabbing'; });
    document.addEventListener('mousemove', e => { if (isDragging) { posX = e.clientX - startX; posY = e.clientY - startY; updateTransform(); } });
    document.addEventListener('mouseup', () => { isDragging = false; container.style.cursor = 'grab'; });
    // Touch для mobile
    let initialDistance = 0;
    container.addEventListener('touchstart', e => { if (e.touches.length === 2) { /* pinch zoom */ } });
  </script>`;

  // Полный HTML
  const html = `<!DOCTYPE html>
  <html lang="ru"><head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Canvas: ${path.basename(canvasFile)}</title>
    <style>body { font-family: Arial, sans-serif; margin: 20px; background: #f8f8f8; } .canvas-container { max-width: 100%; height: auto; } a { color: #0066cc; } img { max-width: 100%; }</style>
  </head><body><h1>Canvas: ${path.basename(canvasFile)}</h1>${htmlContent}${jsScript}
  <p>Nodes: ${nodesById.size}, Edges: ${data.edges?.length || 0}. Drag to pan, wheel to zoom. Generated from Obsidian Canvas.</p></body></html>`;

  fs.writeFileSync(htmlPath, html);
  console.log(`Exported: ${htmlPath} (Size: ${width.toFixed(0)}x${height.toFixed(0)}, Nodes: ${nodesById.size}, Edges: ${data.edges?.length || 0})`);
}

// Main
async function main() {
  let canvasFiles;
  try {
    canvasFiles = fs.readdirSync(obsidianVaultPath).filter(f => f.endsWith('.canvas'));
  } catch (err) {
    console.error(`Error reading vault: ${err.message}. Check obsidianVaultPath.`);
    return;
  }
  if (canvasFiles.length === 0) {
    console.log('No .canvas files in ${obsidianVaultPath}. Add test.canvas.');
    return;
  }
  for (const file of canvasFiles) {
    await exportCanvas(file);
  }
  console.log('Export complete!');
}

main().catch(console.error);

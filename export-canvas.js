const fs = require('fs');
const path = require('path');
// const { XMLParser } = require('xmldom');  // npm i xmldom для SVG, если нужно (опционально)

const canvasDir = path.join(__dirname, 'content/Canvas');  // Выход в content/Canvas/
const obsidianVaultPath = 'content';  // Замените на путь к Obsidian (где .canvas файлы)
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
    console.error(`Parse error in ${canvasFile}: ${err.message}`);
    return;
  }

  // Создаём map для быстрого доступа по ID (nodes — массив объектов с "id")
  const nodesById = new Map();
  if (data.nodes && Array.isArray(data.nodes)) {
    data.nodes.forEach(node => {
      if (node.id) {
        nodesById.set(node.id.toString(), node);  // ID как string
      }
    });
  }

  const htmlFilename = path.basename(canvasFile, '.canvas') + '.html';
  const htmlPath = path.join(canvasDir, 'html', htmlFilename);
  const libPath = path.join(canvasDir, 'lib');

  fs.mkdirSync(path.dirname(htmlPath), { recursive: true });
  fs.mkdirSync(libPath, { recursive: true });

  // SVG: lines для edges, rect/text для nodes
  let svgContent = '<svg width="1200" height="800" viewBox="0 0 1200 800" xmlns="http://www.w3.org/2000/svg">';
  // Edges (линии между центрами узлов)
  if (data.edges && Array.isArray(data.edges)) {
    data.edges.forEach(edge => {
      const fromId = edge.fromNode?.toString();
      const toId = edge.toNode?.toString();
      const fromNode = nodesById.get(fromId);
      const toNode = nodesById.get(toId);
      if (fromNode && toNode && fromNode.x !== undefined && fromNode.y !== undefined && toNode.x !== undefined && toNode.y !== undefined) {
        // Центр узла: x + width/2, y + height/2 (fallback width/height=100)
        const fromX = (fromNode.x || 0) + (fromNode.width || 100) / 2;
        const fromY = (fromNode.y || 0) + (fromNode.height || 100) / 2;
        const toX = (toNode.x || 0) + (toNode.width || 100) / 2;
        const toY = (toNode.y || 0) + (toNode.height || 100) / 2;
        svgContent += `<line x1="${fromX}" y1="${fromY}" x2="${toX}" y2="${toY}" stroke="gray" stroke-width="2" marker-end="url(#arrow)"/>`;
      } else {
        console.log(`Skipping edge ${edge.id}: node not found`);
      }
    });
  }
  // Nodes (rect + text)
  nodesById.forEach(node => {
    const x = node.x || 0;
    const y = node.y || 0;
    const width = node.width || 120;
    const height = node.height || 60;
    const text = node.text || node.title || node.id || 'Node';
    svgContent += `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="lightblue" rx="5" stroke="blue" stroke-width="1"/>`;
    svgContent += `<text x="${x + width/2}" y="${y + height/2 + 5}" text-anchor="middle" font-size="12" fill="black">${text}</text>`;
  });
  svgContent += '<defs><marker id="arrow" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="gray"/></marker></defs></svg>';

  // HTML
  const html = `<!DOCTYPE html>
  <html><head><title>Canvas: ${path.basename(canvasFile)}</title>
  <style>body { font-family: Arial, sans-serif; margin: 20px; } svg { border: 1px solid #ccc; max-width: 100%; height: auto; }</style>
  </head><body><h1>Canvas: ${path.basename(canvasFile)}</h1>${svgContent}
  <p>Generated from Obsidian Canvas JSON. Nodes: ${nodesById.size}, Edges: ${data.edges?.length || 0}</p></body></html>`;

  fs.writeFileSync(htmlPath, html);
  console.log(`Exported: ${htmlPath} (Nodes: ${nodesById.size}, Edges: ${data.edges?.length || 0})`);
}

// Запуск
let canvasFiles;
try {
  canvasFiles = fs.readdirSync(obsidianVaultPath).filter(f => f.endsWith('.canvas'));
} catch (err) {
  console.error(`Error reading vault: ${err.message}. Check obsidianVaultPath.`);
  return;
}

if (canvasFiles.length === 0) {
  console.log('No .canvas files found. Create one in vault.');
  return;
}
canvasFiles.forEach(exportCanvas);
console.log('Export complete!');
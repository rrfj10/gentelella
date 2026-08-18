// Gentelella 2026 v4 — decomposition / decision tree
// Renders a drill-down tree: root -> branches, each node showing a
// proportional bar (value / parent value) and a breadcrumb of levels
// with a control to collapse the deepest visible level.
//
// Dynamic data (report use): initDecisionTree() accepts either a tree
// object or a Promise<tree> — pass fetchTree(url) or your own
// `fetch(...).then(r => r.json())` to source it from a live report
// endpoint instead of the built-in demo data.
//   initDecisionTree(root, fetchTree('/api/reports/access-tree'));

const ICON_LOCK = '<svg class="icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="11" width="14" height="9" rx="1.5"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
const ICON_CLOSE = '<svg class="icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 5l14 14M19 5L5 19"/></svg>';
const ICON_CHEVRON = '<svg class="icon decomp-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>';

export const DEFAULT_TREE = {
  label: 'Total de Alunos',
  value: 1286,
  children: [
    { label: 'Acesso Criado', value: 1259 },
    {
      label: 'Acesso não Criado',
      value: 27,
      children: [
        {
          label: 'Acesso Não Criado',
          value: 27,
          children: [
            {
              label: 'FORA DO PRAZO',
              value: 27,
              children: [
                { label: 'Pendência Realização', value: 15 },
                { label: 'Pendência Documentação', value: 11 },
                { label: 'Pendência Secretaria', value: 1 }
              ]
            }
          ]
        }
      ]
    }
  ]
};

/**
 * Fetches a decomposition tree from a JSON endpoint. The endpoint must
 * return a single node: { label, value, children? }.
 *
 * @param {string} url
 * @param {{ fetch?: typeof fetch }} [opts]
 */
export async function fetchTree(url, opts = {}) {
  const f = opts.fetch || ((...a) => globalThis.fetch(...a));
  const res = await f(url);
  if (!res.ok) {
    throw new Error(`fetchTree: HTTP ${res.status} for ${url}`);
  }
  return res.json();
}

function treeDepth(node) {
  if (!node.children || node.children.length === 0) {return 1;}
  return 1 + Math.max(...node.children.map(treeDepth));
}

function formatValue(n) {
  return n.toLocaleString('pt-BR');
}

function formatPct(pct) {
  return pct.toFixed(1).replace('.', ',');
}

// Source data casing is inconsistent ("FORA DO PRAZO" vs "Acesso Criado") —
// normalize every label to title case so the tree reads uniformly no matter
// how the upstream report data is written.
function formatLabel(label) {
  return String(label).toLowerCase().replace(/(^|\s)\p{L}/gu, (m) => m.toUpperCase());
}

function renderNodeBox(node, parentValue, canToggle, onToggle) {
  const pct = parentValue ? Math.max(0, Math.min(100, (node.value / parentValue) * 100)) : 100;
  const collapsed = canToggle && !!node._collapsed;
  const box = document.createElement('div');
  box.className = 'decomp-node';
  box.innerHTML = `
    <div class="decomp-node-label">
      <span>${formatLabel(node.label)}</span>
      ${canToggle ? ICON_CHEVRON : ''}
    </div>
    <div class="progress-thin decomp-bar"><div class="bar" style="width:${pct}%;background:var(--green)"></div></div>
    <div class="decomp-node-value">${formatValue(node.value)} (${formatPct(pct)}%)</div>
  `;
  if (canToggle) {
    box.classList.add('decomp-node--branch');
    box.classList.toggle('is-collapsed', collapsed);
    box.setAttribute('role', 'button');
    box.setAttribute('tabindex', '0');
    box.setAttribute('aria-expanded', String(!collapsed));
    box.addEventListener('click', onToggle);
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {e.preventDefault(); onToggle();}
    });
  }
  return box;
}

function renderBranch(node, parentValue, visibleDepth, depth, onToggle) {
  const branch = document.createElement('div');
  branch.className = 'decomp-branch';
  const canToggle = !!(node.children && node.children.length > 0 && depth < visibleDepth);
  branch.appendChild(renderNodeBox(node, parentValue, canToggle, () => onToggle(node)));

  if (canToggle && !node._collapsed) {
    const kids = document.createElement('div');
    kids.className = 'decomp-children';
    node.children.forEach((child) => {
      kids.appendChild(renderBranch(child, node.value, visibleDepth, depth + 1, onToggle));
    });
    branch.appendChild(kids);
  }
  return branch;
}

function drawConnectors(svg, wrapper) {
  const wrapRect = wrapper.getBoundingClientRect();
  svg.setAttribute('width', wrapper.scrollWidth);
  svg.setAttribute('height', wrapper.scrollHeight);
  svg.innerHTML = '';

  wrapper.querySelectorAll('.decomp-branch').forEach((branch) => {
    const parentBox = branch.querySelector(':scope > .decomp-node');
    const kids = branch.querySelector(':scope > .decomp-children');
    if (!parentBox || !kids) {return;}

    const pRect = parentBox.getBoundingClientRect();
    const x1 = pRect.right - wrapRect.left;
    const y1 = pRect.top + pRect.height / 2 - wrapRect.top;

    kids.querySelectorAll(':scope > .decomp-branch > .decomp-node').forEach((childBox) => {
      const cRect = childBox.getBoundingClientRect();
      const x2 = cRect.left - wrapRect.left;
      const y2 = cRect.top + cRect.height / 2 - wrapRect.top;
      const midX = (x1 + x2) / 2;
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', `M${x1},${y1} C${midX},${y1} ${midX},${y2} ${x2},${y2}`);
      path.setAttribute('class', 'decomp-connector');
      svg.appendChild(path);
    });
  });
}

function renderBreadcrumb(bar, maxDepth, visibleDepth, onCollapse) {
  bar.innerHTML = '';
  for (let i = 1; i <= visibleDepth; i += 1) {
    const pill = document.createElement('div');
    pill.className = 'decomp-crumb';
    pill.innerHTML = `${ICON_LOCK}<span>Nível ${i}</span>`;
    bar.appendChild(pill);
  }
  if (visibleDepth > 1) {
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'decomp-crumb-close';
    close.setAttribute('aria-label', 'Recolher último nível');
    close.innerHTML = ICON_CLOSE;
    close.addEventListener('click', onCollapse);
    bar.appendChild(close);
  }
}

/**
 * @param {HTMLElement} [root]
 * @param {object|Promise<object>} [treeOrPromise] A tree node, or a Promise
 *   resolving to one (e.g. fetchTree(url)) for report data loaded live.
 */
export function initDecisionTree(root = document.getElementById('decomp-tree-root'), treeOrPromise = DEFAULT_TREE) {
  if (!root || root.dataset.dtInit) {return;}
  root.dataset.dtInit = '1';

  const breadcrumb = root.querySelector('.decomp-breadcrumb');
  const wrapper = root.querySelector('.decomp-tree-inner');
  const content = root.querySelector('.decomp-tree-content');
  const svg = root.querySelector('.decomp-connectors');

  function setMessage(text) {
    breadcrumb.innerHTML = '';
    content.innerHTML = `<div class="decomp-empty" role="status">${text}</div>`;
  }

  function mount(tree) {
    if (!tree || typeof tree.value !== 'number') {
      setMessage('Sem dados para exibir.');
      return;
    }
    const maxDepth = treeDepth(tree);
    let visibleDepth = maxDepth;

    function toggleNode(node) {
      node._collapsed = !node._collapsed;
      render();
    }

    function render() {
      content.innerHTML = '';
      content.appendChild(renderBranch(tree, null, visibleDepth, 1, toggleNode));
      renderBreadcrumb(breadcrumb, maxDepth, visibleDepth, () => {
        visibleDepth = Math.max(1, visibleDepth - 1);
        render();
      });
      // Layout settles after paint; measure on the next frame.
      requestAnimationFrame(() => drawConnectors(svg, wrapper));
    }

    render();

    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => drawConnectors(svg, wrapper), 100);
    });
  }

  if (typeof treeOrPromise?.then === 'function') {
    setMessage('Carregando…');
    treeOrPromise.then(mount).catch(() => setMessage('Não foi possível carregar os dados.'));
  } else {
    mount(treeOrPromise);
  }
}

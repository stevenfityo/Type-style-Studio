// Font Styles Creator — main plugin logic

figma.showUI(__html__, { width: 560, height: 680 });

// ─── Bootstrap: scan variables on open ───────────────────────────────────────

figma.ui.onmessage = async (msg) => {
  switch (msg.type) {
    case 'scan-variables':        return await scanVariables();
    case 'scan-all-variables':    return await scanAllVariables();
    case 'create-tokens':         return await createTokens(msg.fontFamily);
    case 'validate-tokens':       return await validateTokens(msg);
    case 'create-missing-tokens': return await createMissingTokens(msg);
    case 'create-styles':         return await createStyles(msg);
    case 'create-preview-frame':  return await createPreviewFrame(msg);
    case 'audit-scan':            return await auditScan(msg);
    case 'audit-apply':           return await auditApply(msg);
    case 'audit-select':          return await auditSelect(msg);
    case 'load-settings': {
      const saved = await figma.clientStorage.getAsync('fsc_settings');
      figma.ui.postMessage({ type: 'settings-loaded', settings: saved || {} });
      return;
    }
    case 'save-settings': {
      await figma.clientStorage.setAsync('fsc_settings', msg.settings);
      figma.ui.postMessage({ type: 'settings-saved' });
      return;
    }
    case 'cancel':                return figma.closePlugin();
  }
};

// ─── SCAN VARIABLES ──────────────────────────────────────────────────────────

async function scanVariables() {
  let allVars, allCollections;
  try {
    allVars = await figma.variables.getLocalVariablesAsync();
    allCollections = await figma.variables.getLocalVariableCollectionsAsync();
  } catch (e) {
    figma.ui.postMessage({ type: 'error', text: 'Cannot read variables: ' + e.message });
    return;
  }

  const defaultModeMap = {};
  for (const col of allCollections) {
    defaultModeMap[col.id] = col.defaultModeId;
  }

  // Find STRING variables — candidates for fontFamily tokens
  const stringVars = allVars
    .filter(v => v.resolvedType === 'STRING')
    .map(v => {
      const modeId = defaultModeMap[v.variableCollectionId];
      const raw = modeId ? v.valuesByMode[modeId] : undefined;
      const value = raw !== undefined && raw !== null ? String(raw) : '';
      return { id: v.id, name: v.name, value: String(value) };
    });

  // Detect whether Typography collection already exists
  const hasTypography = allCollections.some(c =>
    c.name.toLowerCase() === 'typography'
  );

  figma.ui.postMessage({
    type: 'variables-ready',
    stringVars,
    hasTypography
  });
}

// ─── SCAN ALL VARIABLES (for Tab 1 token status) ─────────────────────────────

async function scanAllVariables() {
  try {
    const allVars = await figma.variables.getLocalVariablesAsync();
    figma.ui.postMessage({
      type: 'all-variables-ready',
      varNames: allVars.map(v => v.name)
    });
  } catch (e) {
    figma.ui.postMessage({ type: 'error', text: 'Cannot read variables: ' + e.message });
  }
}

// ─── CREATE TYPOGRAPHY TOKENS ────────────────────────────────────────────────

async function createTokens(fontFamily) {
  const family = fontFamily || 'IBM Plex Sans';

  let collection;
  try {
    collection = figma.variables.createVariableCollection('Typography');
  } catch (e) {
    figma.ui.postMessage({ type: 'error', text: 'Could not create collection: ' + e.message });
    return;
  }

  const modeId = collection.defaultModeId;

  function addString(name, value) {
    const v = figma.variables.createVariable(name, collection, 'STRING');
    v.setValueForMode(modeId, value);
  }

  function addFloat(name, value) {
    const v = figma.variables.createVariable(name, collection, 'FLOAT');
    v.setValueForMode(modeId, value);
  }

  // Font family
  addString('fontFamily/body', family);
  addString('fontFamily/display', family);

  // Font weight
  addString('fontWeight/Regular', 'Regular');
  addString('fontWeight/Regular Italic', 'Italic');
  addString('fontWeight/Medium', 'Medium');
  addString('fontWeight/Medium Italic', 'Medium Italic');
  addString('fontWeight/Semibold', 'SemiBold');
  addString('fontWeight/Semibold Italic', 'SemiBold Italic');
  addString('fontWeight/Bold', 'Bold');
  addString('fontWeight/Bold Italic', 'Bold Italic');

  // Font size
  const sizes = [
    ['text-xs', 12], ['text-sm', 14], ['text-md', 16],
    ['text-lg', 18], ['text-xl', 20], ['text-2xl', 24],
    ['text-3xl', 30], ['text-4xl', 36], ['text-5xl', 48]
  ];
  for (const [name, val] of sizes) {
    addFloat('fontSize/' + name, val);
  }

  // Line height
  const lineHeights = [
    ['text-xs', 18], ['text-sm', 20], ['text-md', 24],
    ['text-lg', 28], ['text-xl', 30], ['text-2xl', 32],
    ['text-3xl', 36], ['text-4xl', 40], ['text-5xl', 48]
  ];
  for (const [name, val] of lineHeights) {
    addFloat('lineHeight/' + name, val);
  }

  figma.ui.postMessage({ type: 'tokens-created', family });

  // Re-scan so UI updates with new variables
  await scanVariables();
}

// ─── CREATE TEXT STYLES ───────────────────────────────────────────────────────

const SCALE = [
  { token: 'text-xs',  size: 12, lh: 16 },
  { token: 'text-sm',  size: 14, lh: 20 },
  { token: 'text-md',  size: 16, lh: 24 },
  { token: 'text-lg',  size: 18, lh: 28 },
  { token: 'text-xl',  size: 20, lh: 28 },
  { token: 'text-2xl', size: 24, lh: 32 },
  { token: 'text-3xl', size: 30, lh: 36 },
  { token: 'text-4xl', size: 36, lh: 40 },
  { token: 'text-5xl', size: 48, lh: 48 },
];

const WEIGHT_STYLES = {
  Regular:  'Regular',
  Medium:   'Medium',
  Semibold: 'Semibold',
  Bold:     'Bold',
};

const ITALIC_STYLES = {
  Regular:  'Italic',
  Medium:   'Medium Italic',
  Semibold: 'Semibold Italic',
  Bold:     'Bold Italic',
};

// ─── ADD MISSING TOKENS TO EXISTING COLLECTION ───────────────────────────────

async function createMissingTokens(msg) {
  const { missing, fontFamily } = msg;

  let allCollections;
  try {
    allCollections = await figma.variables.getLocalVariableCollectionsAsync();
  } catch (e) {
    figma.ui.postMessage({ type: 'error', text: 'Cannot read collections: ' + e.message });
    return;
  }

  // Find existing Typography collection, or create it
  let collection = allCollections.find(c => c.name.toLowerCase() === 'typography');
  if (!collection) {
    collection = figma.variables.createVariableCollection('Typography');
  }
  const modeId = collection.defaultModeId;

  // Build set of already-existing variable names in this collection
  let existingVars;
  try {
    existingVars = await figma.variables.getLocalVariablesAsync();
  } catch (e) {
    existingVars = [];
  }
  const existingNames = new Set(
    existingVars
      .filter(v => v.variableCollectionId === collection.id)
      .map(v => v.name)
  );

  let added = 0;
  for (const m of missing) {
    if (existingNames.has(m.name)) continue;

    try {
      // Determine type from group
      const isFloat = m.group === 'Font Size' || m.group === 'Line Height';
      const v = figma.variables.createVariable(m.name, collection, isFloat ? 'FLOAT' : 'STRING');

      if (isFloat) {
        // parse number from expected like "12px"
        const num = parseFloat(m.expected);
        v.setValueForMode(modeId, isNaN(num) ? 0 : num);
      } else {
        // Font Family: use the passed fontFamily; Font Weight: use expected directly
        const val = m.group === 'Font Family' ? (fontFamily || m.expected) : m.expected;
        v.setValueForMode(modeId, val);
      }
      added++;
    } catch (e) {
      console.error('Could not create variable ' + m.name + ':', e.message);
    }
  }

  figma.ui.postMessage({ type: 'missing-tokens-created', added });
  // Re-scan so UI refreshes
  await scanVariables();
}

// ─── VALIDATE TOKENS BEFORE CREATING STYLES ──────────────────────────────────

async function validateTokens(msg) {
  const { fontFamily, sizeData, weightData } = msg;

  let allVars = [], allCollections = [];
  try {
    allVars = await figma.variables.getLocalVariablesAsync();
    allCollections = await figma.variables.getLocalVariableCollectionsAsync();
  } catch (e) {
    figma.ui.postMessage({ type: 'error', text: 'Cannot read variables: ' + e.message });
    return;
  }

  const varByName = {};
  for (const v of allVars) varByName[v.name] = v;

  function varValue(name) {
    const v = varByName[name];
    if (!v) return null;
    const col = allCollections.find(c => c.id === v.variableCollectionId);
    if (!col) return null;
    const val = v.valuesByMode[col.defaultModeId];
    return val !== undefined && val !== null ? String(val) : null;
  }

  const missing = [];

  // fontFamily
  const familyVarExists =
    allVars.some(v => v.resolvedType === 'STRING' && varValue(v.name) === fontFamily) ||
    !!varByName['fontFamily/body'];
  if (!familyVarExists) {
    missing.push({ group: 'Font Family', name: 'fontFamily/body', expected: fontFamily });
  }

  // fontWeight/* — one token per weight label
  for (const w of (weightData || [])) {
    const key = 'fontWeight/' + w.label;
    if (!varByName[key]) missing.push({ group: 'Font Weight', name: key, expected: w.styleStr });
  }

  // fontSize/* and lineHeight/* — one pair per size token
  for (const s of (sizeData || [])) {
    if (!varByName['fontSize/' + s.token])
      missing.push({ group: 'Font Size', name: 'fontSize/' + s.token, expected: s.size + 'px' });
    if (!varByName['lineHeight/' + s.token])
      missing.push({ group: 'Line Height', name: 'lineHeight/' + s.token, expected: s.lh + 'px' });
  }

  if (missing.length > 0) {
    figma.ui.postMessage({ type: 'tokens-missing', missing });
  } else {
    figma.ui.postMessage({ type: 'tokens-ok' });
  }
}

async function createStyles(msg) {
  const { fontFamily, sizeData, weightData } = msg;

  // ── Build variable lookup maps ────────────────────────────────────────────
  let allVars = [];
  let allCollections = [];
  try {
    allVars = await figma.variables.getLocalVariablesAsync();
    allCollections = await figma.variables.getLocalVariableCollectionsAsync();
  } catch (e) {}

  const varByName = {};
  for (const v of allVars) {
    varByName[v.name] = v;
  }

  // Resolve a variable's default-mode string value
  function varValue(name) {
    const v = varByName[name];
    if (!v) return null;
    const col = allCollections.find(c => c.id === v.variableCollectionId);
    if (!col) return null;
    const val = v.valuesByMode[col.defaultModeId];
    return val !== undefined && val !== null ? String(val) : null;
  }

  // fontFamily var: prefer one whose value matches the chosen family
  const familyVar =
    allVars.find(v => v.resolvedType === 'STRING' && varValue(v.name) === fontFamily) ||
    varByName['fontFamily/body'] ||
    null;

  // ── Load the default Inter Regular that new TextStyles start with ─────────
  // createTextStyle() defaults to Inter Regular — we must load it or fontSize
  // assignment will throw "unloaded font" before we can set our own fontName.
  try { await figma.loadFontAsync({ family: 'Inter', style: 'Regular' }); } catch (_) {}

  // ── Create styles ─────────────────────────────────────────────────────────
  const existingStyles = figma.getLocalTextStyles();
  const existingNames = new Set(existingStyles.map(s => s.name));

  let created = 0;
  let skipped = 0;
  const errors = [];

  for (const scale of (sizeData || [])) {
    for (const weightEntry of (weightData || [])) {
      const tokenName = 'fontWeight/' + weightEntry.label;
      // Prefer the variable value so it matches the actual installed font
      const styleStr = varValue(tokenName) || weightEntry.styleStr;
      const styleName = scale.token + '/' + weightEntry.label;

      if (existingNames.has(styleName)) {
        skipped++;
        continue;
      }

      try {
        await figma.loadFontAsync({ family: fontFamily, style: styleStr });

        const ts = figma.createTextStyle();
        ts.name = styleName;

        // Set fontName FIRST — required before touching fontSize
        ts.fontName = { family: fontFamily, style: styleStr };
        ts.fontSize = scale.size;
        ts.lineHeight = { unit: 'PIXELS', value: scale.lh };

        // ── Bind variables ──────────────────────────────────────────────
        const fsVar = varByName['fontSize/' + scale.token];
        if (fsVar) try { ts.setBoundVariable('fontSize', fsVar); } catch (_) {}

        const lhVar = varByName['lineHeight/' + scale.token];
        if (lhVar) try { ts.setBoundVariable('lineHeight', lhVar); } catch (_) {}

        if (familyVar) try { ts.setBoundVariable('fontFamily', familyVar); } catch (_) {}

        const wVar = varByName[tokenName];
        if (wVar) try { ts.setBoundVariable('fontStyle', wVar); } catch (_) {}

        created++;
        existingNames.add(styleName);
      } catch (e) {
        errors.push(scale.token + '/' + weightEntry.label + ': ' + e.message);
      }
    }
  }

  figma.ui.postMessage({
    type: 'styles-created',
    created,
    skipped,
    errors
  });
}

// ─── CREATE PREVIEW FRAME ─────────────────────────────────────────────────────

async function createPreviewFrame(msg) {
  const { fontFamily, sizeData, weightData, baseSize } = msg;
  const base = baseSize || 16;

  // Load Inter Regular for labels (might differ from target font)
  try { await figma.loadFontAsync({ family: 'Inter', style: 'Regular' }); } catch (_) {}

  const PADDING = 40;
  const ROW_GAP = 12;
  const META_W = 200;
  const SAMPLE_TEXT = 'The quick brown fox';

  // Pre-load all target fonts
  for (const w of (weightData || [])) {
    for (const s of (sizeData || [])) {
      try { await figma.loadFontAsync({ family: fontFamily, style: w.styleStr }); } catch (_) {}
    }
    break; // only need to load each style once
  }

  // Build list of rows: one per size × weight combo
  const rows = [];
  for (const s of (sizeData || [])) {
    for (const w of (weightData || [])) {
      rows.push({ size: s, weight: w });
    }
  }

  // Calculate frame height
  let totalH = PADDING * 2;
  for (const r of rows) {
    totalH += Math.max(r.size.lh, r.size.size) + ROW_GAP;
  }
  // Add header row height
  totalH += 32 + ROW_GAP;

  const frameW = 900;
  const frame = figma.createFrame();
  frame.name = 'Typography Preview';
  frame.resize(frameW, totalH);
  frame.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
  frame.x = figma.viewport.center.x - frameW / 2;
  frame.y = figma.viewport.center.y - totalH / 2;

  // ── Header ──────────────────────────────────────────────────────────────
  const headerLabel = (text, x, w, bold) => {
    const t = figma.createText();
    t.fontName = { family: 'Inter', style: bold ? 'Semi Bold' : 'Regular' };
    t.fontSize = 10;
    t.characters = text;
    t.fills = [{ type: 'SOLID', color: { r: 0.4, g: 0.4, b: 0.4 } }];
    t.textAlignVertical = 'CENTER';
    t.resize(w, 20);
    t.x = x;
    t.y = PADDING;
    frame.appendChild(t);
  };

  headerLabel('TOKEN', PADDING, 100, true);
  headerLabel('REM', PADDING + 100, 60, true);
  headerLabel('PX', PADDING + 160, 50, true);
  headerLabel('LH', PADDING + 210, 50, true);
  headerLabel('WEIGHT', PADDING + 260, 100, true);
  headerLabel('SAMPLE', PADDING + META_W + 160, frameW - PADDING - META_W - 160 - PADDING, true);

  // Divider
  const div = figma.createLine();
  div.x = PADDING;
  div.y = PADDING + 26;
  div.resize(frameW - PADDING * 2, 0);
  div.strokes = [{ type: 'SOLID', color: { r: 0.88, g: 0.88, b: 0.88 } }];
  div.strokeWeight = 1;
  frame.appendChild(div);

  // ── Rows ─────────────────────────────────────────────────────────────────
  let yOffset = PADDING + 32 + ROW_GAP;

  for (const { size: s, weight: w } of rows) {
    const rowH = Math.max(s.lh, s.size);
    const rem = (s.size / base).toFixed(3).replace(/\.?0+$/, '');

    // Meta labels (Inter Regular, small)
    const meta = (text, x, width) => {
      const t = figma.createText();
      t.fontName = { family: 'Inter', style: 'Regular' };
      t.fontSize = 11;
      t.characters = text;
      t.fills = [{ type: 'SOLID', color: { r: 0.5, g: 0.5, b: 0.5 } }];
      t.resize(width, rowH);
      t.textAlignVertical = 'CENTER';
      t.x = x;
      t.y = yOffset;
      frame.appendChild(t);
    };

    meta(s.token, PADDING, 100);
    meta(rem + 'rem', PADDING + 100, 60);
    meta(s.size + 'px', PADDING + 160, 50);
    meta(s.lh + 'px', PADDING + 210, 50);
    meta(w.label, PADDING + 260, 100);

    // Sample text in the actual font
    try {
      const sample = figma.createText();
      sample.fontName = { family: fontFamily, style: w.styleStr };
      sample.fontSize = s.size;
      sample.lineHeight = { unit: 'PIXELS', value: s.lh };
      sample.characters = SAMPLE_TEXT;
      sample.fills = [{ type: 'SOLID', color: { r: 0.07, g: 0.07, b: 0.07 } }];
      sample.x = PADDING + META_W + 160;
      sample.y = yOffset;
      // Apply matching text style if it exists
      const matchStyle = figma.getLocalTextStyles().find(ts => ts.name === s.token + '/' + w.label);
      if (matchStyle) sample.textStyleId = matchStyle.id;
      frame.appendChild(sample);
    } catch (_) {}

    yOffset += rowH + ROW_GAP;
  }

  // Resize frame to actual content height
  frame.resize(frameW, yOffset + PADDING);

  figma.viewport.scrollAndZoomIntoView([frame]);

  figma.ui.postMessage({ type: 'preview-created', rows: rows.length });
}

// ─── AUDIT: SCAN TEXT NODES WITHOUT STYLE ────────────────────────────────────

async function auditScan(msg) {
  const scope = msg.scope || 'page';

  let root;
  let frameRoots = null; // non-null only for 'frame' scope with multiple roots

  if (scope === 'frame') {
    const sel = figma.currentPage.selection;
    if (!sel || sel.length === 0) {
      figma.ui.postMessage({ type: 'error', text: 'No frames selected. Select one or more frames on the canvas first.' });
      return;
    }
    // Collect the selected nodes themselves (frames, components, groups)
    // If a non-container is selected, walk up to the nearest frame/component ancestor
    const CONTAINER_TYPES = new Set(['FRAME', 'COMPONENT', 'COMPONENT_SET', 'GROUP']);
    const collected = [];
    const seen = new Set();
    for (let node of sel) {
      let candidate = node;
      while (candidate && !CONTAINER_TYPES.has(candidate.type) && candidate.type !== 'PAGE' && candidate.type !== 'DOCUMENT') {
        candidate = candidate.parent;
      }
      if (candidate && CONTAINER_TYPES.has(candidate.type) && !seen.has(candidate.id)) {
        seen.add(candidate.id);
        collected.push(candidate);
      }
    }
    if (collected.length === 0) {
      figma.ui.postMessage({ type: 'error', text: 'No valid frames found in selection. Select at least one frame.' });
      return;
    }
    frameRoots = collected;
    root = null; // will iterate frameRoots instead
  } else if (scope === 'document') {
    root = figma.root;
  } else {
    root = figma.currentPage;
  }

  let textNodes;
  if (frameRoots) {
    textNodes = [];
    for (const fr of frameRoots) {
      textNodes.push(...fr.findAllWithCriteria({ types: ['TEXT'] }));
    }
  } else {
    textNodes = root.findAllWithCriteria({ types: ['TEXT'] });
  }

  // ── Collect local text styles ──────────────────────────────────────────
  const textStyles = figma.getLocalTextStyles();
  const localStyleById = {};
  for (const s of textStyles) localStyleById[s.id] = s;

  // Library styles are fetched by the UI via REST API and do not come through here

  // Determine if a node is eligible and what context it lives in
  function getContext(node) {
    let p = node.parent;
    while (p && p.type !== 'PAGE' && p.type !== 'DOCUMENT') {
      if (p.type === 'INSTANCE')  return null;
      if (p.type === 'COMPONENT') return 'main-component';
      p = p.parent;
    }
    return 'standalone';
  }

  // Nearest frame/component ancestor name for grouping
  function getFrameName(node) {
    let p = node.parent;
    while (p && p.type !== 'PAGE' && p.type !== 'DOCUMENT') {
      if (p.type === 'FRAME' || p.type === 'COMPONENT' || p.type === 'COMPONENT_SET') return p.name;
      p = p.parent;
    }
    return '(Page level)';
  }

  // Resolve fontSize + fontStyle from a potentially mixed text node
  function getTextProps(node) {
    const isMixed = node.fontSize === figma.mixed || node.fontName === figma.mixed;
    if (isMixed) {
      const segs = node.getStyledTextSegments(['fontName', 'fontSize']);
      if (!segs.length) return null;
      return { fontSize: segs[0].fontSize, fontStyle: segs[0].fontName.style, fontFamily: segs[0].fontName.family };
    }
    return { fontSize: node.fontSize, fontStyle: node.fontName.style, fontFamily: node.fontName.family };
  }

  // Auto-match by fontSize + fontStyle against local styles only
  function findMatch(props) {
    return textStyles.find(s =>
      s.fontSize === props.fontSize &&
      s.fontName.style.toLowerCase() === props.fontStyle.toLowerCase()
    ) || null;
  }

  const items = [];

  for (const node of textNodes) {
    const context = getContext(node);
    if (context === null) continue;

    const props = getTextProps(node);
    if (!props) continue;

    const rawStyleId = node.textStyleId;
    const hasStyle   = rawStyleId && rawStyleId !== '' && rawStyleId !== figma.mixed;

    // Look up current style — check local first, then try figma.getStyleById (library styles already in use)
    let currentStyle = hasStyle ? (localStyleById[rawStyleId] || null) : null;
    let currentIsLibrary = false;
    if (hasStyle && !currentStyle) {
      try {
        const s = figma.getStyleById(rawStyleId);
        if (s && s.type === 'TEXT') {
          currentStyle = { id: rawStyleId, name: s.name };
          currentIsLibrary = true;
        }
      } catch (_) {}
    }

    // Auto-match against local styles
    const match = findMatch(props);

    const defaultStyleId   = hasStyle ? rawStyleId        : (match ? match.id   : null);
    const defaultStyleName = hasStyle
      ? (currentStyle ? currentStyle.name : null)
      : (match ? match.name : null);

    items.push({
      nodeId:            node.id,
      nodeName:          node.name,
      frameName:         getFrameName(node),
      fontFamily:        props.fontFamily,
      fontSize:          props.fontSize,
      fontStyle:         props.fontStyle,
      hasStyle,
      currentStyleId:    hasStyle ? rawStyleId : null,
      currentStyleName:  currentStyle ? currentStyle.name : null,
      currentIsLibrary,
      matchedStyleId:    defaultStyleId,
      matchedStyleName:  defaultStyleName,
      context
    });
  }

  const total   = items.length;
  const matched = items.filter(i => i.matchedStyleId).length;

  const localStyles = textStyles.map(s => ({ id: s.id, name: s.name, isLibrary: false }));
  figma.ui.postMessage({ type: 'audit-results', items, total, matched, localStyles });
}

// ─── AUDIT: APPLY SELECTED STYLES ────────────────────────────────────────────

async function auditApply(msg) {
  const items = msg.items || []; // [{ nodeId, styleId }] — styleId may be "lib:<key>"
  let applied = 0;
  let errors  = 0;

  // Cache imported library styles within this apply batch to avoid redundant imports
  const importedByKey = {};

  for (const { nodeId, styleId } of items) {
    try {
      const node = figma.getNodeById(nodeId);
      if (!node || node.type !== 'TEXT') continue;

      let resolvedStyleId = styleId;

      // Library style — import it first
      if (styleId && styleId.startsWith('lib:')) {
        const key = styleId.slice(4);
        if (!importedByKey[key]) {
          const imported = await figma.importStyleByKeyAsync(key);
          importedByKey[key] = imported.id;
        }
        resolvedStyleId = importedByKey[key];
      }

      node.textStyleId = resolvedStyleId;
      applied++;
    } catch (e) {
      errors++;
    }
  }

  figma.ui.postMessage({ type: 'audit-applied', applied, errors });
}

// ─── AUDIT: SELECT NODES IN FIGMA ────────────────────────────────────────────

async function auditSelect(msg) {
  const nodeIds = msg.nodeIds || [];
  const nodes = nodeIds
    .map(id => figma.getNodeById(id))
    .filter(n => n !== null);

  if (nodes.length === 0) return;

  // Switch to the page that contains the first node (for document-wide scans)
  const firstNode = nodes[0];
  let page = firstNode;
  while (page && page.type !== 'PAGE') page = page.parent;
  if (page && page.type === 'PAGE' && figma.currentPage !== page) {
    figma.currentPage = page;
  }

  figma.currentPage.selection = nodes;
  figma.viewport.scrollAndZoomIntoView(nodes);
}

// ─── Helper: resolve a variable's default-mode value ─────────────────────────
function resolvedValue(variable, collections) {
  const col = collections.find(c => c.id === variable.variableCollectionId);
  if (!col) return null;
  const val = variable.valuesByMode[col.defaultModeId];
  return val !== undefined && val !== null ? String(val) : null;
}

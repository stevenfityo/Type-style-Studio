// Font Styles Creator — main plugin logic

figma.showUI(__html__, { width: 560, height: 680 });

// ─── Bootstrap: scan variables on open ───────────────────────────────────────

figma.ui.onmessage = async (msg) => {
  try {
    switch (msg.type) {
      case 'scan-variables':        return await scanVariables();
      case 'scan-all-variables':    return await scanAllVariables();
      case 'create-tokens':         return await createTokens(msg.fontFamily, msg.fontFamilyDisplay);
      case 'validate-tokens':       return await validateTokens(msg);
      case 'create-missing-tokens': return await createMissingTokens(msg);
      case 'create-styles':         return await createStyles(msg);
      case 'create-preview-frame':  return await createPreviewFrame(msg);
      case 'audit-scan':            return await auditScan(msg);
      case 'audit-apply':           return await auditApply(msg);
      case 'audit-select':          return await auditSelect(msg);
      case 'scan-scale':            return await scanScale();
      case 'update-scale':          return await updateScale(msg);
      case 'create-scale':          return await createScale(msg);
      case 'scan-colors':           return await scanColors();
      case 'create-colors':         return await createColors(msg);
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
  } catch (e) {
    // Never leave the UI hanging — surface the failure so buttons reset
    figma.ui.postMessage({ type: 'error', text: (e && e.message) ? e.message : String(e) });
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

async function createTokens(fontFamily, fontFamilyDisplay) {
  const family = fontFamily || 'IBM Plex Sans';
  const displayFamily = fontFamilyDisplay || family;

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
  addString('fontFamily/display', displayFamily);

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
        // Use the per-token expected value (body/display families differ);
        // fall back to the passed fontFamily only when none was provided.
        const val = (m.expected !== undefined && m.expected !== null && m.expected !== '')
          ? m.expected
          : fontFamily;
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
  const existingStyles = await figma.getLocalTextStylesAsync();
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

  // Fetch local text styles once for matching against rows
  const localTextStyles = await figma.getLocalTextStylesAsync();

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
      const matchStyle = localTextStyles.find(ts => ts.name === s.token + '/' + w.label);
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
  const textStyles = await figma.getLocalTextStylesAsync();
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

  // Normalise a lineHeight object ({unit, value} | {unit:'AUTO'}) → comparable string
  function lhKey(lh) {
    if (!lh || lh.unit === 'AUTO') return 'auto';
    // Round PIXELS/PERCENT to 2dp so float noise doesn't split groups
    return lh.unit + ':' + Math.round(lh.value * 100) / 100;
  }

  // Resolve fontSize + fontStyle + lineHeight from a potentially mixed text node
  function getTextProps(node) {
    const isMixed = node.fontSize === figma.mixed || node.fontName === figma.mixed
      || node.lineHeight === figma.mixed;
    if (isMixed) {
      const segs = node.getStyledTextSegments(['fontName', 'fontSize', 'lineHeight']);
      if (!segs.length) return null;
      const s = segs[0];
      return { fontSize: s.fontSize, fontStyle: s.fontName.style, fontFamily: s.fontName.family, lineHeight: lhKey(s.lineHeight) };
    }
    return { fontSize: node.fontSize, fontStyle: node.fontName.style, fontFamily: node.fontName.family, lineHeight: lhKey(node.lineHeight) };
  }

  // Auto-match against local styles, Figma-style: tightest match first, then
  // progressively relax. fontFamily is the key precision gain over the old
  // size+style-only matcher — a 16px Regular in Inter no longer matches an
  // IBM Plex 16px/Regular style.
  function findMatch(props) {
    const sameSizeStyle = s =>
      s.fontSize === props.fontSize &&
      s.fontName.style.toLowerCase() === props.fontStyle.toLowerCase();
    const sameFamily = s => s.fontName.family === props.fontFamily;
    const sameLh     = s => lhKey(s.lineHeight) === props.lineHeight;

    // 1) family + size + style + lineHeight   2) family + size + style
    // 3) size + style + lineHeight            4) size + style (legacy fallback)
    return textStyles.find(s => sameSizeStyle(s) && sameFamily(s) && sameLh(s))
        || textStyles.find(s => sameSizeStyle(s) && sameFamily(s))
        || textStyles.find(s => sameSizeStyle(s) && sameLh(s))
        || textStyles.find(s => sameSizeStyle(s))
        || null;
  }

  const items = [];

  for (const node of textNodes) {
    let context, props;
    try {
      context = getContext(node);
      if (context === null) continue;
      props = getTextProps(node);
    } catch (_) { continue; }
    if (!props) continue;

    const rawStyleId = node.textStyleId;
    const hasStyle   = rawStyleId && rawStyleId !== '' && rawStyleId !== figma.mixed;

    // Look up current style — check local first, then try figma.getStyleById (library styles already in use)
    let currentStyle = hasStyle ? (localStyleById[rawStyleId] || null) : null;
    let currentIsLibrary = false;
    if (hasStyle && !currentStyle) {
      try {
        const s = await figma.getStyleByIdAsync(rawStyleId);
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
      lineHeight:        props.lineHeight,
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
      const node = await figma.getNodeByIdAsync(nodeId);
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
  const resolved = await Promise.all(nodeIds.map(id => figma.getNodeByIdAsync(id)));
  const nodes = resolved.filter(n => n !== null && n !== undefined);

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

// ─── PRIMITIVE SCALE ─────────────────────────────────────────────────────────

async function scanScale() {
  const allCollections = await figma.variables.getLocalVariableCollectionsAsync();
  const allVars        = await figma.variables.getLocalVariablesAsync();

  const primitiveCol = allCollections.find(function(c) { return c.name === 'Primitive'; });
  if (!primitiveCol) {
    figma.ui.postMessage({ type: 'scale-ready', found: false, reason: 'no-primitive' });
    return;
  }

  const modeId    = primitiveCol.defaultModeId;
  const scaleVars = allVars.filter(function(v) {
    return v.variableCollectionId === primitiveCol.id && v.name.indexOf('scale/') === 0;
  });

  if (scaleVars.length === 0) {
    figma.ui.postMessage({ type: 'scale-ready', found: false, reason: 'no-scale-group' });
    return;
  }

  const baseVar    = scaleVars.find(function(v) { return v.name === 'scale/1'; });
  const currentBase = (baseVar && typeof baseVar.valuesByMode[modeId] === 'number')
    ? baseVar.valuesByMode[modeId]
    : null;

  figma.ui.postMessage({ type: 'scale-ready', found: true, currentBase: currentBase, count: scaleVars.length });
}

async function updateScale(msg) {
  const newBase = msg.newBase;
  const allCollections = await figma.variables.getLocalVariableCollectionsAsync();
  const allVars        = await figma.variables.getLocalVariablesAsync();

  const primitiveCol = allCollections.find(function(c) { return c.name === 'Primitive'; });
  if (!primitiveCol) {
    figma.ui.postMessage({ type: 'error', text: 'Primitive collection not found.' });
    return;
  }

  const modeId    = primitiveCol.defaultModeId;
  const scaleVars = allVars.filter(function(v) {
    return v.variableCollectionId === primitiveCol.id && v.name.indexOf('scale/') === 0;
  });

  const baseVar = scaleVars.find(function(v) { return v.name === 'scale/1'; });
  if (!baseVar || typeof baseVar.valuesByMode[modeId] !== 'number') {
    figma.ui.postMessage({ type: 'error', text: 'scale/1 variable not found or has no numeric value.' });
    return;
  }
  const currentBase = baseVar.valuesByMode[modeId];
  if (currentBase === 0) {
    figma.ui.postMessage({ type: 'error', text: 'scale/1 value is 0 — cannot compute ratio.' });
    return;
  }

  var updated = 0;
  for (var i = 0; i < scaleVars.length; i++) {
    var v = scaleVars[i];
    var cur = v.valuesByMode[modeId];
    if (typeof cur !== 'number') continue;
    var newVal = Math.round((cur / currentBase) * newBase * 1000) / 1000;
    v.setValueForMode(modeId, newVal);
    updated++;
  }

  figma.ui.postMessage({ type: 'scale-updated', newBase: newBase, updated: updated });
}

// Full PrimeOne-style primitive scale multipliers (34 entries)
var SCALE_KEYS = [
  'neg-2', 'neg-1-75', 'neg-1-5', 'neg-1-25', 'neg-1-125',
  'neg-1', 'neg-0-875', 'neg-0-75', 'neg-0-625', 'neg-0-5',
  'neg-0-375', 'neg-0-25',
  '0-125', '0-25', '0-375', '0-5', '0-625', '0-75', '0-875',
  '1', '1-125', '1-143', '1-25', '1-5', '1-625', '1-75',
  '2', '2-5', '3', '3-5', '4', '5', '6', '7'
];

function parseScaleKey(key) {
  var negative = false;
  var part = key;
  if (part.indexOf('neg-') === 0) { negative = true; part = part.slice(4); }
  var num = parseFloat(part.replace('-', '.'));
  if (isNaN(num)) return null;
  return negative ? -num : num;
}

async function createScale(msg) {
  var base = msg.base;
  var allCollections = await figma.variables.getLocalVariableCollectionsAsync();

  var primitiveCol = allCollections.find(function(c) { return c.name === 'Primitive'; });
  if (!primitiveCol) {
    primitiveCol = figma.variables.createVariableCollection('Primitive');
  }

  var modeId  = primitiveCol.defaultModeId;
  var allVars = await figma.variables.getLocalVariablesAsync();
  var existing = {};
  allVars.filter(function(v) { return v.variableCollectionId === primitiveCol.id; })
    .forEach(function(v) { existing[v.name] = v; });

  var created = 0;
  for (var i = 0; i < SCALE_KEYS.length; i++) {
    var key        = SCALE_KEYS[i];
    var multiplier = parseScaleKey(key);
    if (multiplier === null) continue;
    var value   = Math.round(multiplier * base * 1000) / 1000;
    var varName = 'scale/' + key;
    if (existing[varName]) {
      existing[varName].setValueForMode(modeId, value);
    } else {
      var v = figma.variables.createVariable(varName, primitiveCol, 'FLOAT');
      v.setValueForMode(modeId, value);
    }
    created++;
  }

  figma.ui.postMessage({ type: 'scale-created', base: base, created: created });
}

// ─── TAILWIND COLOR PRIMITIVES ───────────────────────────────────────────────

// Full Tailwind CSS v3 default palette. Stored as hex strings; converted to
// Figma RGB (0–1 floats) on creation. Naming: color/{family}/{shade}.
var TAILWIND_COLORS = {
  slate:   { 50:'#f8fafc',100:'#f1f5f9',200:'#e2e8f0',300:'#cbd5e1',400:'#94a3b8',500:'#64748b',600:'#475569',700:'#334155',800:'#1e293b',900:'#0f172a',950:'#020617' },
  gray:    { 50:'#f9fafb',100:'#f3f4f6',200:'#e5e7eb',300:'#d1d5db',400:'#9ca3af',500:'#6b7280',600:'#4b5563',700:'#374151',800:'#1f2937',900:'#111827',950:'#030712' },
  zinc:    { 50:'#fafafa',100:'#f4f4f5',200:'#e4e4e7',300:'#d4d4d8',400:'#a1a1aa',500:'#71717a',600:'#52525b',700:'#3f3f46',800:'#27272a',900:'#18181b',950:'#09090b' },
  neutral: { 50:'#fafafa',100:'#f5f5f5',200:'#e5e5e5',300:'#d4d4d4',400:'#a3a3a3',500:'#737373',600:'#525252',700:'#404040',800:'#262626',900:'#171717',950:'#0a0a0a' },
  stone:   { 50:'#fafaf9',100:'#f5f5f4',200:'#e7e5e4',300:'#d6d3d1',400:'#a8a29e',500:'#78716c',600:'#57534e',700:'#44403c',800:'#292524',900:'#1c1917',950:'#0c0a09' },
  red:     { 50:'#fef2f2',100:'#fee2e2',200:'#fecaca',300:'#fca5a5',400:'#f87171',500:'#ef4444',600:'#dc2626',700:'#b91c1c',800:'#991b1b',900:'#7f1d1d',950:'#450a0a' },
  orange:  { 50:'#fff7ed',100:'#ffedd5',200:'#fed7aa',300:'#fdba74',400:'#fb923c',500:'#f97316',600:'#ea580c',700:'#c2410c',800:'#9a3412',900:'#7c2d12',950:'#431407' },
  amber:   { 50:'#fffbeb',100:'#fef3c7',200:'#fde68a',300:'#fcd34d',400:'#fbbf24',500:'#f59e0b',600:'#d97706',700:'#b45309',800:'#92400e',900:'#78350f',950:'#451a03' },
  yellow:  { 50:'#fefce8',100:'#fef9c3',200:'#fef08a',300:'#fde047',400:'#facc15',500:'#eab308',600:'#ca8a04',700:'#a16207',800:'#854d0e',900:'#713f12',950:'#422006' },
  lime:    { 50:'#f7fee7',100:'#ecfccb',200:'#d9f99d',300:'#bef264',400:'#a3e635',500:'#84cc16',600:'#65a30d',700:'#4d7c0f',800:'#3f6212',900:'#365314',950:'#1a2e05' },
  green:   { 50:'#f0fdf4',100:'#dcfce7',200:'#bbf7d0',300:'#86efac',400:'#4ade80',500:'#22c55e',600:'#16a34a',700:'#15803d',800:'#166534',900:'#14532d',950:'#052e16' },
  emerald: { 50:'#ecfdf5',100:'#d1fae5',200:'#a7f3d0',300:'#6ee7b7',400:'#34d399',500:'#10b981',600:'#059669',700:'#047857',800:'#065f46',900:'#064e3b',950:'#022c22' },
  teal:    { 50:'#f0fdfa',100:'#ccfbf1',200:'#99f6e4',300:'#5eead4',400:'#2dd4bf',500:'#14b8a6',600:'#0d9488',700:'#0f766e',800:'#115e59',900:'#134e4a',950:'#042f2e' },
  cyan:    { 50:'#ecfeff',100:'#cffafe',200:'#a5f3fc',300:'#67e8f9',400:'#22d3ee',500:'#06b6d4',600:'#0891b2',700:'#0e7490',800:'#155e75',900:'#164e63',950:'#083344' },
  sky:     { 50:'#f0f9ff',100:'#e0f2fe',200:'#bae6fd',300:'#7dd3fc',400:'#38bdf8',500:'#0ea5e9',600:'#0284c7',700:'#0369a1',800:'#075985',900:'#0c4a6e',950:'#082f49' },
  blue:    { 50:'#eff6ff',100:'#dbeafe',200:'#bfdbfe',300:'#93c5fd',400:'#60a5fa',500:'#3b82f6',600:'#2563eb',700:'#1d4ed8',800:'#1e40af',900:'#1e3a8a',950:'#172554' },
  indigo:  { 50:'#eef2ff',100:'#e0e7ff',200:'#c7d2fe',300:'#a5b4fc',400:'#818cf8',500:'#6366f1',600:'#4f46e5',700:'#4338ca',800:'#3730a3',900:'#312e81',950:'#1e1b4b' },
  violet:  { 50:'#f5f3ff',100:'#ede9fe',200:'#ddd6fe',300:'#c4b5fd',400:'#a78bfa',500:'#8b5cf6',600:'#7c3aed',700:'#6d28d9',800:'#5b21b6',900:'#4c1d95',950:'#2e1065' },
  purple:  { 50:'#faf5ff',100:'#f3e8ff',200:'#e9d5ff',300:'#d8b4fe',400:'#c084fc',500:'#a855f7',600:'#9333ea',700:'#7e22ce',800:'#6b21a8',900:'#581c87',950:'#3b0764' },
  fuchsia: { 50:'#fdf4ff',100:'#fae8ff',200:'#f5d0fe',300:'#f0abfc',400:'#e879f9',500:'#d946ef',600:'#c026d3',700:'#a21caf',800:'#86198f',900:'#701a75',950:'#4a044e' },
  pink:    { 50:'#fdf2f8',100:'#fce7f3',200:'#fbcfe8',300:'#f9a8d4',400:'#f472b6',500:'#ec4899',600:'#db2777',700:'#be185d',800:'#9d174d',900:'#831843',950:'#500724' },
  rose:    { 50:'#fff1f2',100:'#ffe4e6',200:'#fecdd3',300:'#fda4af',400:'#fb7185',500:'#f43f5e',600:'#e11d48',700:'#be123c',800:'#9f1239',900:'#881337',950:'#4c0519' }
};

// Standalone base colors (no shade scale)
var TAILWIND_BASE = { white: '#ffffff', black: '#000000' };

var COLORS_COLLECTION = '_Primitives';

function hexToRgb(hex) {
  var h = hex.replace('#', '');
  return {
    r: parseInt(h.substring(0, 2), 16) / 255,
    g: parseInt(h.substring(2, 4), 16) / 255,
    b: parseInt(h.substring(4, 6), 16) / 255
  };
}

// Build the full ordered list of [name, hex] pairs the palette should produce
function buildColorList() {
  var list = [];
  var families = Object.keys(TAILWIND_COLORS);
  for (var i = 0; i < families.length; i++) {
    var fam    = families[i];
    var shades = TAILWIND_COLORS[fam];
    var keys   = Object.keys(shades);
    for (var j = 0; j < keys.length; j++) {
      list.push(['color/' + fam + '/' + keys[j], shades[keys[j]]]);
    }
  }
  var baseKeys = Object.keys(TAILWIND_BASE);
  for (var k = 0; k < baseKeys.length; k++) {
    list.push(['color/' + baseKeys[k], TAILWIND_BASE[baseKeys[k]]]);
  }
  return list;
}

async function scanColors() {
  var total = buildColorList().length;
  var allCollections = await figma.variables.getLocalVariableCollectionsAsync();
  var col = allCollections.find(function(c) { return c.name === COLORS_COLLECTION; });

  if (!col) {
    figma.ui.postMessage({ type: 'colors-ready', found: false, reason: 'no-collection', present: 0, total: total });
    return;
  }

  var allVars   = await figma.variables.getLocalVariablesAsync();
  var colorVars = allVars.filter(function(v) {
    return v.variableCollectionId === col.id && v.resolvedType === 'COLOR' && v.name.indexOf('color/') === 0;
  });

  figma.ui.postMessage({
    type: 'colors-ready',
    found: colorVars.length > 0,
    reason: 'no-colors',
    present: colorVars.length,
    total: total
  });
}

async function createColors(msg) {
  var allCollections = await figma.variables.getLocalVariableCollectionsAsync();
  var col = allCollections.find(function(c) { return c.name === COLORS_COLLECTION; });
  if (!col) {
    col = figma.variables.createVariableCollection(COLORS_COLLECTION);
  }

  var modeId  = col.defaultModeId;
  var allVars = await figma.variables.getLocalVariablesAsync();
  var existing = {};
  allVars.filter(function(v) { return v.variableCollectionId === col.id; })
    .forEach(function(v) { existing[v.name] = v; });

  var list    = buildColorList();
  var created = 0;
  var skipped = 0;

  for (var i = 0; i < list.length; i++) {
    var name = list[i][0];
    var rgb  = hexToRgb(list[i][1]);
    if (existing[name]) { skipped++; continue; }
    try {
      var v = figma.variables.createVariable(name, col, 'COLOR');
      v.setValueForMode(modeId, rgb);
      created++;
    } catch (e) {
      console.error('Could not create color ' + name + ':', e.message);
    }
  }

  figma.ui.postMessage({ type: 'colors-created', created: created, skipped: skipped });
  await scanColors();
}

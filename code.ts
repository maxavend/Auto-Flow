/// <reference types="@figma/plugin-typings" />
// Auto Flow — Connector for Figma & FigJam (main)
// In FigJam, uses the native ConnectorNode API. In Figma (Design), the plugin attempts native creation (experimental) and otherwise exits without asking for manual steps.

figma.showUI(__html__, { width: 620, height: 860, title: 'Auto Flow — Connector' });

const MSG = {
  APPLY: 'APPLY_CONNECTOR',
  COPY: 'COPY_TEMPLATE',
  UPDATE: 'UPDATE_CONNECTOR',
  SELECTION: 'SELECTION_INFO',
  UI_READY: 'UI_READY',
} as const;

let templateConnectorId: string | null = null;

function clearTemplateConnector() {
  if (!templateConnectorId) return;
  const existing = figma.getNodeById(templateConnectorId);
  if (existing && existing.type === 'CONNECTOR') {
    try {
      existing.remove();
    } catch (err) {
      // ignore cleanup errors
    }
  }
  templateConnectorId = null;
}

// Connector endpoint magnets used by FigJam connectors
type Magnet = 'AUTO' | 'TOP' | 'LEFT' | 'BOTTOM' | 'RIGHT' | 'CENTER';

// Cap literals used by UI and mapped to Figma's ConnectorStrokeCap
type Cap = 'NONE' | 'ARROW' | 'ARROW_FILLED' | 'CIRCLE_FILLED' | 'DIAMOND_FILLED';

// --- Utilities shared by both editors ---
function postSelectionInfo() {
  const allSel = figma.currentPage.selection;
  const sceneSel = allSel.filter((n): n is SceneNode => 'id' in n && n.type !== 'CONNECTOR');
  const connectorSel = allSel.filter((n): n is ConnectorNode => n.type === 'CONNECTOR');

  const hasOneConnector = connectorSel.length === 1;

  if (sceneSel.length === 2) {
    const [a, b] = sceneSel;
    figma.ui.postMessage({
      type: MSG.SELECTION,
      data: {
        a: { id: a.id, name: a.name },
        b: { id: b.id, name: b.name },
        hasConnector: hasOneConnector,
        connectorId: hasOneConnector ? connectorSel[0].id : null,
        hasTemplate: !!templateConnectorId
      }
    });
  } else {
    figma.ui.postMessage({
      type: MSG.SELECTION,
      data: {
        a: null,
        b: null,
        hasConnector: hasOneConnector,
        connectorId: hasOneConnector ? connectorSel[0].id : null,
        hasTemplate: !!templateConnectorId
      }
    });
  }
}

figma.on('selectionchange', postSelectionInfo);

function hexToRGB(hex: string): RGB {
  hex = hex.trim().toUpperCase();
  if (hex.startsWith('#')) hex = hex.slice(1);
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  return { r, g, b };
}

function ensureMagnetForLineType(lineType: ConnectorNode['connectorLineType'], magnet: Magnet): Magnet {
  // In FigJam, STRAIGHT supports only CENTER (or NONE). Force CENTER.
  if (lineType === 'STRAIGHT') return 'CENTER';
  return magnet;
}

// --- Figma (Design) helpers ---
// Deleted unused vector helper functions as requested.

// Message types exchanged with UI
type ApplyPayload = {
  lineType?: 'ELBOWED' | 'STRAIGHT' | 'CURVED';
  strokeWeight?: number;
  color?: string;
  startCap?: Cap;
  endCap?: Cap;
  startMagnet?: Magnet;
  endMagnet?: Magnet;
};

type UIMessage =
  | { type: typeof MSG.UI_READY }
  | { type: typeof MSG.COPY; data: { connectorId: string } }
  | { type: typeof MSG.UPDATE; data: ApplyPayload }
  | { type: typeof MSG.APPLY; data: ApplyPayload };

// Added helper to map Cap to ConnectorStrokeCap
function mapCapToConnectorCap(cap: Cap): ConnectorStrokeCap {
  switch (cap) {
    case 'ARROW':
      return 'ARROW_LINES'; // outline arrow
    case 'ARROW_FILLED':
      return 'TRIANGLE_FILLED'; // filled triangle head per docs
    case 'CIRCLE_FILLED':
      return 'CIRCLE_FILLED';
    case 'DIAMOND_FILLED':
      return 'DIAMOND_FILLED';
    default:
      return 'NONE';
  }
}

// NOTE: In Figma (Design) we do not create vector fallback anymore.
// To achieve native look, user must paste a FigJam Connector into the file and select it for relink.

function getMagnetPosition(node: SceneNode, magnet: Magnet): Vector {
  const bounds = node.absoluteBoundingBox;
  if (!bounds) return { x: 0, y: 0 };
  const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  if (magnet === 'TOP') return { x: center.x, y: bounds.y };
  if (magnet === 'BOTTOM') return { x: center.x, y: bounds.y + bounds.height };
  if (magnet === 'LEFT') return { x: bounds.x, y: center.y };
  if (magnet === 'RIGHT') return { x: bounds.x + bounds.width, y: center.y };
  return center;
}



// --- Main message flow ---
figma.ui.onmessage = async (msg: UIMessage) => {
  if (!msg) return;

  if (msg.type === MSG.UI_READY) {
    postSelectionInfo();
    return;
  }

  if (msg.type === MSG.COPY) {
    const candidateId =
      (msg as Extract<UIMessage, { type: typeof MSG.COPY }>).data?.connectorId ??
      figma.currentPage.selection.find((n): n is ConnectorNode => n.type === 'CONNECTOR')?.id;

    if (!candidateId) {
      figma.notify('Selecciona un conector para copiar.');
      return;
    }

    const source = figma.getNodeById(candidateId);
    if (!source || source.type !== 'CONNECTOR') {
      figma.notify('El conector seleccionado no es valido.');
      return;
    }

    clearTemplateConnector();

    const clone = source.clone();
    clone.visible = false;
    clone.locked = true;
    templateConnectorId = clone.id;

    try {
      (figma as any).clipboard.writeText(clone.id);
    } catch (err) {
      // ignore clipboard failures; template ID still stored
    }

    figma.notify('Conector copiado. Selecciona dos nodos y pega con Ctrl/Cmd+V.');
    postSelectionInfo();
    return;
  }

  if (msg.type === MSG.UPDATE) {
    // Live Update: Update the selected connector immediately
    const allSel = figma.currentPage.selection;
    const connectorSel = allSel.filter((n): n is ConnectorNode => n.type === 'CONNECTOR');

    if (connectorSel.length === 1) {
      const connector = connectorSel[0];
      const data = (msg as Extract<UIMessage, { type: typeof MSG.UPDATE }>).data;

      // Update magnets only if provided
      if (data.startMagnet) {
        const startEndpoint = connector.connectorStart;
        if ('endpointNodeId' in startEndpoint) {
          connector.connectorStart = {
            endpointNodeId: startEndpoint.endpointNodeId,
            magnet: ensureMagnetForLineType(connector.connectorLineType, data.startMagnet)
          };
        }
      }
      if (data.endMagnet) {
        const endEndpoint = connector.connectorEnd;
        if ('endpointNodeId' in endEndpoint) {
          connector.connectorEnd = {
            endpointNodeId: endEndpoint.endpointNodeId,
            magnet: ensureMagnetForLineType(connector.connectorLineType, data.endMagnet)
          };
        }
      }
    }
    return;
  }

  if (msg.type === MSG.APPLY) {
    // Collect exactly two SceneNodes (ignore CONNECTORs in selection when counting)
    const allSel = figma.currentPage.selection;
    const sceneSel = allSel.filter((n): n is SceneNode => 'id' in n && n.type !== 'CONNECTOR');
    const connectorSel = allSel.filter((n): n is ConnectorNode => n.type === 'CONNECTOR');

    if (sceneSel.length !== 2) {
      figma.notify('Selecciona exactamente dos elementos (origen y destino) para conectar.');
      return;
    }
    const [startNode, endNode] = sceneSel.sort((a, b) => {
      const ax = a.absoluteBoundingBox ? a.absoluteBoundingBox.x : 0;
      const bx = b.absoluteBoundingBox ? b.absoluteBoundingBox.x : 0;
      return ax - bx;
    });

    const data = (msg as Extract<UIMessage, { type: typeof MSG.APPLY }>).data || {} as ApplyPayload;
    const lt: 'ELBOWED' | 'STRAIGHT' | 'CURVED' = data.lineType ?? 'ELBOWED';
    const strokeWeight: number = Math.max(1, Number(data.strokeWeight) || 3);
    const colorHex: string = (data.color as string) || '#9CA3AF';
    const startCapRaw: Cap = data.startCap ?? 'NONE';
    const endCapRaw: Cap = data.endCap ?? 'ARROW_FILLED';
    const startCapConn = mapCapToConnectorCap(startCapRaw);
    const endCapConn = mapCapToConnectorCap(endCapRaw);
    const startMagnet: Magnet = (data.startMagnet as Magnet) ?? 'RIGHT';
    const endMagnet: Magnet = (data.endMagnet as Magnet) ?? 'LEFT';

    // === REUSE EXISTING CONNECTOR ===
    if (connectorSel.length === 1) {
      const connector = connectorSel[0];
      try {
        connector.connectorStart = { endpointNodeId: startNode.id, magnet: ensureMagnetForLineType(connector.connectorLineType, startMagnet) };
        connector.connectorEnd = { endpointNodeId: endNode.id, magnet: ensureMagnetForLineType(connector.connectorLineType, endMagnet) };
        figma.notify('Conectado usando conector existente ✔');
      } catch (err) {
        figma.notify('Error al actualizar el conector existente.');
      }
      return;
    }

    // === PASTE FROM "CLIPBOARD" (Template) ===
    if (templateConnectorId) {
      const template = figma.getNodeById(templateConnectorId) as ConnectorNode | null;
      if (template && template.type === 'CONNECTOR') {
        const newConnector = template.clone();
        newConnector.visible = true;
        newConnector.locked = false;

        newConnector.connectorLineType = lt as ConnectorNode['connectorLineType'];
        newConnector.connectorStart = { endpointNodeId: startNode.id, magnet: ensureMagnetForLineType(lt as ConnectorNode['connectorLineType'], startMagnet) };
        newConnector.connectorEnd = { endpointNodeId: endNode.id, magnet: ensureMagnetForLineType(lt as ConnectorNode['connectorLineType'], endMagnet) };

        newConnector.strokes = [{ type: 'SOLID', color: hexToRGB(colorHex) }];
        newConnector.strokeWeight = strokeWeight;
        newConnector.connectorStartStrokeCap = startCapConn;
        newConnector.connectorEndStrokeCap = endCapConn;

        const maybeCorner = newConnector as unknown as { cornerRadius?: number };
        if ('cornerRadius' in newConnector && typeof maybeCorner.cornerRadius === 'number') {
          maybeCorner.cornerRadius = Math.max(0, Math.round(strokeWeight * 2));
        }

        figma.notify('Conector pegado (desde portapapeles) ✔');
        figma.currentPage.selection = [startNode, endNode, newConnector];
        return;
      } else {
        // Template was deleted
        templateConnectorId = null;
        figma.notify('⚠️ El conector copiado ya no existe. Por favor copia uno nuevo.');
        postSelectionInfo();
      }
    }

    // === FALLBACKS (Native FigJam or Vector) ===

    // 1. Try finding ANY connector on page (Hybrid backup)
    const anyConnector = figma.currentPage.findOne(n => n.type === 'CONNECTOR') as ConnectorNode | null;
    if (anyConnector) {
      const newConnector = anyConnector.clone();
      newConnector.connectorLineType = lt as ConnectorNode['connectorLineType'];
      newConnector.connectorStart = { endpointNodeId: startNode.id, magnet: ensureMagnetForLineType(lt as ConnectorNode['connectorLineType'], startMagnet) };
      newConnector.connectorEnd = { endpointNodeId: endNode.id, magnet: ensureMagnetForLineType(lt as ConnectorNode['connectorLineType'], endMagnet) };
      newConnector.strokes = [{ type: 'SOLID', color: hexToRGB(colorHex) }];
      newConnector.strokeWeight = strokeWeight;
      newConnector.connectorStartStrokeCap = startCapConn;
      newConnector.connectorEndStrokeCap = endCapConn;
      const maybeCorner = newConnector as unknown as { cornerRadius?: number };
      if ('cornerRadius' in newConnector && typeof maybeCorner.cornerRadius === 'number') {
        maybeCorner.cornerRadius = Math.max(0, Math.round(strokeWeight * 2));
      }
      figma.notify('Conector creado (clonado de plantilla en página) ✔');
      figma.currentPage.selection = [startNode, endNode, newConnector];
      return;
    }

    // Vector fallback removed – native connector handling only
  }
};

// Relaunch: create (FigJam-only) and relink (Figma/FigJam)
if (figma.command === 'create' && figma.editorType === 'figjam') {
  (async () => {
    const sel = figma.currentPage.selection.filter((n): n is SceneNode => 'id' in n && n.type !== 'CONNECTOR');
    if (sel.length < 2) { figma.notify('Selecciona dos nodos en FigJam para crear el conector.'); return; }
    const [a, b] = sel;
    const c = figma.createConnector();
    c.connectorLineType = 'ELBOWED';
    c.connectorStart = { endpointNodeId: a.id, magnet: 'RIGHT' };
    c.connectorEnd = { endpointNodeId: b.id, magnet: 'LEFT' };
    c.strokes = [{ type: 'SOLID', color: hexToRGB('#9CA3AF') }];
    c.strokeWeight = 3;
    c.connectorStartStrokeCap = 'NONE';
    c.connectorEndStrokeCap = mapCapToConnectorCap('ARROW_FILLED');
    const maybeCorner3 = c as unknown as { cornerRadius?: number };
    if ('cornerRadius' in c && typeof maybeCorner3.cornerRadius === 'number') {
      maybeCorner3.cornerRadius = 6;
    }
    figma.notify('Connector nativo creado (FigJam) ✔');
  })();
}

// Kickoff: send selection to UI
postSelectionInfo();

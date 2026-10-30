/**
 * Vertex Proxies — Machine & Node Identifier
 * Ensures multi-computer proxy fleets register distinctly in Supabase
 * without port collisions or device_path overwrites.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const CONFIG_FILE = path.join(__dirname, '..', 'machine_node.json');

/**
 * Returns a clean, alphanumeric machine slug from hostname or MAC
 */
function getHostnameSlug() {
  const raw = os.hostname() || 'worker-node';
  return raw.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 24);
}

/**
 * Generates or reads persistent node configuration for this computer.
 */
function initNodeIdentifier(supabaseClient = null) {
  // 1. Check if explicitly defined via environment variables
  if (process.env.NODE_INDEX !== undefined) {
    const nodeIndex = parseInt(process.env.NODE_INDEX, 10);
    const nodeName = process.env.NODE_NAME || getHostnameSlug();
    const portOffset = nodeIndex * 100;
    return {
      nodeIndex,
      portOffset,
      nodeName,
      nodeId: `node_${nodeIndex}_${getHostnameSlug()}`,
      isExplicit: true,
    };
  }

  // 2. Check if local config file exists
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      if (typeof data.nodeIndex === 'number' && data.nodeIndex >= 0) {
        return {
          nodeIndex: data.nodeIndex,
          portOffset: data.nodeIndex * 100,
          nodeName: data.nodeName || getHostnameSlug(),
          nodeId: data.nodeId || `node_${data.nodeIndex}_${getHostnameSlug()}`,
          isExplicit: false,
        };
      }
    } catch (_) {}
  }

  // 3. Fallback default: Node 0 (for first computer), will be saved
  const defaultNode = {
    nodeIndex: 0,
    portOffset: 0,
    nodeName: getHostnameSlug(),
    nodeId: `node_0_${getHostnameSlug()}`,
    isExplicit: false,
  };

  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(defaultNode, null, 2), 'utf8');
  } catch (_) {}

  return defaultNode;
}

/**
 * Automatically detects existing nodes from Supabase and assigns an unused node index
 * if this computer does not already have an assigned index.
 */
async function autoResolveNodeIndex(supabase) {
  if (!supabase) return initNodeIdentifier();

  // If node is explicitly set in ENV or already saved in machine_node.json, use it
  if (process.env.NODE_INDEX !== undefined) {
    return initNodeIdentifier();
  }

  const hostname = getHostnameSlug();

  // Check if we already have an assigned index locally
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const local = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      if (typeof local.nodeIndex === 'number') {
        return {
          nodeIndex: local.nodeIndex,
          portOffset: local.nodeIndex * 100,
          nodeName: local.nodeName || hostname,
          nodeId: local.nodeId || `node_${local.nodeIndex}_${hostname}`,
        };
      }
    } catch (_) {}
  }

  try {
    // Query existing residential modems in Supabase to inspect registered node indices
    const { data: modems, error } = await supabase
      .from('modems')
      .select('device_path, label, model, last_seen')
      .like('device_path', 'residential_%');

    if (!error && Array.isArray(modems)) {
      const usedIndices = new Set();
      let matchedIndex = null;

      for (const m of modems) {
        // Check if device_path matches residential_node_{N}_slot_
        const match = (m.device_path || '').match(/^residential_node_(\d+)_/);
        if (match) {
          const idx = parseInt(match[1], 10);
          usedIndices.add(idx);
          // If this modem model or label contains our hostname, it's our previous node!
          if ((m.model || '').includes(hostname) || (m.label || '').includes(hostname)) {
            matchedIndex = idx;
          }
        } else if (m.device_path && m.device_path.startsWith('residential_slot_')) {
          // Legacy slot with no node prefix counts as node 0
          usedIndices.add(0);
        }
      }

      let chosenIndex = matchedIndex;
      if (chosenIndex === null) {
        // Find the lowest unused index starting from 0 (or 1 if 0 is taken)
        chosenIndex = 0;
        while (usedIndices.has(chosenIndex)) {
          chosenIndex++;
        }
      }

      const assigned = {
        nodeIndex: chosenIndex,
        portOffset: chosenIndex * 100,
        nodeName: hostname,
        nodeId: `node_${chosenIndex}_${hostname}`,
      };

      try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(assigned, null, 2), 'utf8');
      } catch (_) {}

      console.log(`[NodeIdentifier] Auto-assigned this machine (${hostname}) -> Node #${chosenIndex} (Port Offset: +${assigned.portOffset})`);
      return assigned;
    }
  } catch (err) {
    console.warn('[NodeIdentifier] Could not query existing nodes from Supabase, using local defaults:', err.message);
  }

  return initNodeIdentifier();
}

/**
 * Returns deterministic port set for a slot based on the machine's port offset.
 */
function getPortSetForSlot(slot, portOffset = 0) {
  const idx = Math.max(0, (slot || 1) - 1);
  const offset = parseInt(portOffset || 0, 10);

  return {
    http:         31000 + idx,            // Local port (on this machine's loopback)
    socks4:       32000 + idx,            // Local port
    socks5:       33000 + idx,            // Local port
    publicHttp:   41000 + offset + idx,   // Public VPS port (Globally unique!)
    publicSocks4: 42000 + offset + idx,   // Public VPS port (Globally unique!)
    publicSocks5: 43000 + offset + idx,   // Public VPS port (Globally unique!)
  };
}

module.exports = {
  initNodeIdentifier,
  autoResolveNodeIndex,
  getPortSetForSlot,
  getHostnameSlug,
};

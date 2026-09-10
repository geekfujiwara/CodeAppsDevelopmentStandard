const id = { type: "string", pattern: "^[A-Za-z][A-Za-z0-9_-]{0,59}$" }
const text = { type: "string", minLength: 1, maxLength: 200 }
const coordinate = { type: "number", minimum: -1000, maximum: 1000 }
const point = { type: "array", items: coordinate, minItems: 3, maxItems: 3 }
const ring = { type: "array", minItems: 4, maxItems: 100, items: { type: "array", items: coordinate, minItems: 2, maxItems: 2 } }
const terminal = { type: "object", additionalProperties: false, required: ["nodeId", "portId"], properties: { nodeId: id, portId: { enum: ["inlet", "outlet", "power"] } } }
const externalTerminal = { ...terminal, required: ["unitId", "nodeId", "portId"], properties: { ...terminal.properties, unitId: id } }
const connection = { type: "object", additionalProperties: false, required: ["id", "from", "to", "elevation", "lane"], properties: { id, from: terminal, to: terminal, elevation: { type: "number", minimum: 0.2, maximum: 100 }, lane: coordinate } }

export const PLANT_DESIGN_SCHEMA = {
  $schema: "http://json-schema.org/draft-07/schema#", title: "Plant concept design", type: "object", additionalProperties: false,
  required: ["schemaVersion", "id", "name", "revision", "site", "modules", "units", "connections"],
  properties: {
    schemaVersion: { const: 1 }, id, name: text, revision: { type: "integer", minimum: 1, maximum: 1000000 },
    site: { type: "object", additionalProperties: false, required: ["boundary", "exclusions", "clearance"], properties: {
      boundary: ring, clearance: { type: "number", minimum: 0, maximum: 10 },
      exclusions: { type: "array", maxItems: 20, items: { type: "object", additionalProperties: false, required: ["id", "name", "polygon"], properties: { id, name: text, polygon: ring } } },
    } },
    modules: { type: "array", minItems: 1, maxItems: 20, items: { type: "object", additionalProperties: false, required: ["id", "name", "equipment", "connections"], properties: {
      id, name: text,
      equipment: { type: "array", minItems: 1, maxItems: 30, items: { type: "object", additionalProperties: false, required: ["id", "tag", "name", "kind", "position", "size", "properties"], properties: {
        id, tag: text, name: text, kind: { enum: ["tank", "pump", "exchanger", "valve", "tower", "component"] }, position: point,
        size: { type: "array", minItems: 3, maxItems: 3, items: { type: "number", minimum: 0.1, maximum: 50 } },
        properties: { type: "object", maxProperties: 20, additionalProperties: { type: "string", maxLength: 500 } },
      } } }, connections: { type: "array", maxItems: 60, items: connection },
    } } },
    units: { type: "array", minItems: 1, maxItems: 30, items: { type: "object", additionalProperties: false, required: ["id", "moduleId", "name", "position", "rotation"], properties: {
      id, moduleId: id, name: text, position: { ...point, items: [coordinate, { const: 0 }, coordinate], additionalItems: false }, rotation: { enum: [0, 90, 180, 270] },
    } } },
    connections: { type: "array", maxItems: 100, items: { ...connection, properties: { ...connection.properties, from: externalTerminal, to: externalTerminal } } },
  },
} as const
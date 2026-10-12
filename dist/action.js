#!/usr/bin/env node
import { createRequire as __agentciCreateRequire } from "node:module"; const require = __agentciCreateRequire(import.meta.url);
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __commonJS = (cb, mod) => function __require2() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/nodes/identity.js
var require_identity = __commonJS({
  "node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/nodes/identity.js"(exports) {
    "use strict";
    var ALIAS = /* @__PURE__ */ Symbol.for("yaml.alias");
    var DOC = /* @__PURE__ */ Symbol.for("yaml.document");
    var MAP = /* @__PURE__ */ Symbol.for("yaml.map");
    var PAIR = /* @__PURE__ */ Symbol.for("yaml.pair");
    var SCALAR = /* @__PURE__ */ Symbol.for("yaml.scalar");
    var SEQ = /* @__PURE__ */ Symbol.for("yaml.seq");
    var NODE_TYPE = /* @__PURE__ */ Symbol.for("yaml.node.type");
    var isAlias = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === ALIAS;
    var isDocument = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === DOC;
    var isMap = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === MAP;
    var isPair = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === PAIR;
    var isScalar = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === SCALAR;
    var isSeq = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === SEQ;
    function isCollection(node) {
      if (node && typeof node === "object")
        switch (node[NODE_TYPE]) {
          case MAP:
          case SEQ:
            return true;
        }
      return false;
    }
    function isNode(node) {
      if (node && typeof node === "object")
        switch (node[NODE_TYPE]) {
          case ALIAS:
          case MAP:
          case SCALAR:
          case SEQ:
            return true;
        }
      return false;
    }
    var hasAnchor = (node) => (isScalar(node) || isCollection(node)) && !!node.anchor;
    exports.ALIAS = ALIAS;
    exports.DOC = DOC;
    exports.MAP = MAP;
    exports.NODE_TYPE = NODE_TYPE;
    exports.PAIR = PAIR;
    exports.SCALAR = SCALAR;
    exports.SEQ = SEQ;
    exports.hasAnchor = hasAnchor;
    exports.isAlias = isAlias;
    exports.isCollection = isCollection;
    exports.isDocument = isDocument;
    exports.isMap = isMap;
    exports.isNode = isNode;
    exports.isPair = isPair;
    exports.isScalar = isScalar;
    exports.isSeq = isSeq;
  }
});

// node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/visit.js
var require_visit = __commonJS({
  "node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/visit.js"(exports) {
    "use strict";
    var identity = require_identity();
    var BREAK = /* @__PURE__ */ Symbol("break visit");
    var SKIP = /* @__PURE__ */ Symbol("skip children");
    var REMOVE = /* @__PURE__ */ Symbol("remove node");
    function visit(node, visitor) {
      const visitor_ = initVisitor(visitor);
      if (identity.isDocument(node)) {
        const cd = visit_(null, node.contents, visitor_, Object.freeze([node]));
        if (cd === REMOVE)
          node.contents = null;
      } else
        visit_(null, node, visitor_, Object.freeze([]));
    }
    visit.BREAK = BREAK;
    visit.SKIP = SKIP;
    visit.REMOVE = REMOVE;
    function visit_(key, node, visitor, path4) {
      const ctrl = callVisitor(key, node, visitor, path4);
      if (identity.isNode(ctrl) || identity.isPair(ctrl)) {
        replaceNode(key, path4, ctrl);
        return visit_(key, ctrl, visitor, path4);
      }
      if (typeof ctrl !== "symbol") {
        if (identity.isCollection(node)) {
          path4 = Object.freeze(path4.concat(node));
          for (let i = 0; i < node.items.length; ++i) {
            const ci = visit_(i, node.items[i], visitor, path4);
            if (typeof ci === "number")
              i = ci - 1;
            else if (ci === BREAK)
              return BREAK;
            else if (ci === REMOVE) {
              node.items.splice(i, 1);
              i -= 1;
            }
          }
        } else if (identity.isPair(node)) {
          path4 = Object.freeze(path4.concat(node));
          const ck = visit_("key", node.key, visitor, path4);
          if (ck === BREAK)
            return BREAK;
          else if (ck === REMOVE)
            node.key = null;
          const cv = visit_("value", node.value, visitor, path4);
          if (cv === BREAK)
            return BREAK;
          else if (cv === REMOVE)
            node.value = null;
        }
      }
      return ctrl;
    }
    async function visitAsync(node, visitor) {
      const visitor_ = initVisitor(visitor);
      if (identity.isDocument(node)) {
        const cd = await visitAsync_(null, node.contents, visitor_, Object.freeze([node]));
        if (cd === REMOVE)
          node.contents = null;
      } else
        await visitAsync_(null, node, visitor_, Object.freeze([]));
    }
    visitAsync.BREAK = BREAK;
    visitAsync.SKIP = SKIP;
    visitAsync.REMOVE = REMOVE;
    async function visitAsync_(key, node, visitor, path4) {
      const ctrl = await callVisitor(key, node, visitor, path4);
      if (identity.isNode(ctrl) || identity.isPair(ctrl)) {
        replaceNode(key, path4, ctrl);
        return visitAsync_(key, ctrl, visitor, path4);
      }
      if (typeof ctrl !== "symbol") {
        if (identity.isCollection(node)) {
          path4 = Object.freeze(path4.concat(node));
          for (let i = 0; i < node.items.length; ++i) {
            const ci = await visitAsync_(i, node.items[i], visitor, path4);
            if (typeof ci === "number")
              i = ci - 1;
            else if (ci === BREAK)
              return BREAK;
            else if (ci === REMOVE) {
              node.items.splice(i, 1);
              i -= 1;
            }
          }
        } else if (identity.isPair(node)) {
          path4 = Object.freeze(path4.concat(node));
          const ck = await visitAsync_("key", node.key, visitor, path4);
          if (ck === BREAK)
            return BREAK;
          else if (ck === REMOVE)
            node.key = null;
          const cv = await visitAsync_("value", node.value, visitor, path4);
          if (cv === BREAK)
            return BREAK;
          else if (cv === REMOVE)
            node.value = null;
        }
      }
      return ctrl;
    }
    function initVisitor(visitor) {
      if (typeof visitor === "object" && (visitor.Collection || visitor.Node || visitor.Value)) {
        return Object.assign({
          Alias: visitor.Node,
          Map: visitor.Node,
          Scalar: visitor.Node,
          Seq: visitor.Node
        }, visitor.Value && {
          Map: visitor.Value,
          Scalar: visitor.Value,
          Seq: visitor.Value
        }, visitor.Collection && {
          Map: visitor.Collection,
          Seq: visitor.Collection
        }, visitor);
      }
      return visitor;
    }
    function callVisitor(key, node, visitor, path4) {
      if (typeof visitor === "function")
        return visitor(key, node, path4);
      if (identity.isMap(node))
        return visitor.Map?.(key, node, path4);
      if (identity.isSeq(node))
        return visitor.Seq?.(key, node, path4);
      if (identity.isPair(node))
        return visitor.Pair?.(key, node, path4);
      if (identity.isScalar(node))
        return visitor.Scalar?.(key, node, path4);
      if (identity.isAlias(node))
        return visitor.Alias?.(key, node, path4);
      return void 0;
    }
    function replaceNode(key, path4, node) {
      const parent = path4[path4.length - 1];
      if (identity.isCollection(parent)) {
        parent.items[key] = node;
      } else if (identity.isPair(parent)) {
        if (key === "key")
          parent.key = node;
        else
          parent.value = node;
      } else if (identity.isDocument(parent)) {
        parent.contents = node;
      } else {
        const pt = identity.isAlias(parent) ? "alias" : "scalar";
        throw new Error(`Cannot replace node with ${pt} parent`);
      }
    }
    exports.visit = visit;
    exports.visitAsync = visitAsync;
  }
});

// node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/doc/directives.js
var require_directives = __commonJS({
  "node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/doc/directives.js"(exports) {
    "use strict";
    var identity = require_identity();
    var visit = require_visit();
    var escapeChars = {
      "!": "%21",
      ",": "%2C",
      "[": "%5B",
      "]": "%5D",
      "{": "%7B",
      "}": "%7D"
    };
    var escapeTagName = (tn) => tn.replace(/[!,[\]{}]/g, (ch) => escapeChars[ch]);
    var Directives = class _Directives {
      constructor(yaml, tags) {
        this.docStart = null;
        this.docEnd = false;
        this.yaml = Object.assign({}, _Directives.defaultYaml, yaml);
        this.tags = Object.assign({}, _Directives.defaultTags, tags);
      }
      clone() {
        const copy = new _Directives(this.yaml, this.tags);
        copy.docStart = this.docStart;
        return copy;
      }
      /**
       * During parsing, get a Directives instance for the current document and
       * update the stream state according to the current version's spec.
       */
      atDocument() {
        const res = new _Directives(this.yaml, this.tags);
        switch (this.yaml.version) {
          case "1.1":
            this.atNextDocument = true;
            break;
          case "1.2":
            this.atNextDocument = false;
            this.yaml = {
              explicit: _Directives.defaultYaml.explicit,
              version: "1.2"
            };
            this.tags = Object.assign({}, _Directives.defaultTags);
            break;
        }
        return res;
      }
      /**
       * @param onError - May be called even if the action was successful
       * @returns `true` on success
       */
      add(line, onError) {
        if (this.atNextDocument) {
          this.yaml = { explicit: _Directives.defaultYaml.explicit, version: "1.1" };
          this.tags = Object.assign({}, _Directives.defaultTags);
          this.atNextDocument = false;
        }
        const parts = line.trim().split(/[ \t]+/);
        const name = parts.shift();
        switch (name) {
          case "%TAG": {
            if (parts.length !== 2) {
              onError(0, "%TAG directive should contain exactly two parts");
              if (parts.length < 2)
                return false;
            }
            const [handle, prefix] = parts;
            this.tags[handle] = prefix;
            return true;
          }
          case "%YAML": {
            this.yaml.explicit = true;
            if (parts.length !== 1) {
              onError(0, "%YAML directive should contain exactly one part");
              return false;
            }
            const [version] = parts;
            if (version === "1.1" || version === "1.2") {
              this.yaml.version = version;
              return true;
            } else {
              const isValid = /^\d+\.\d+$/.test(version);
              onError(6, `Unsupported YAML version ${version}`, isValid);
              return false;
            }
          }
          default:
            onError(0, `Unknown directive ${name}`, true);
            return false;
        }
      }
      /**
       * Resolves a tag, matching handles to those defined in %TAG directives.
       *
       * @returns Resolved tag, which may also be the non-specific tag `'!'` or a
       *   `'!local'` tag, or `null` if unresolvable.
       */
      tagName(source, onError) {
        if (source === "!")
          return "!";
        if (source[0] !== "!") {
          onError(`Not a valid tag: ${source}`);
          return null;
        }
        if (source[1] === "<") {
          const verbatim = source.slice(2, -1);
          if (verbatim === "!" || verbatim === "!!") {
            onError(`Verbatim tags aren't resolved, so ${source} is invalid.`);
            return null;
          }
          if (source[source.length - 1] !== ">")
            onError("Verbatim tags must end with a >");
          return verbatim;
        }
        const [, handle, suffix] = source.match(/^(.*!)([^!]*)$/s);
        if (!suffix)
          onError(`The ${source} tag has no suffix`);
        const prefix = this.tags[handle];
        if (prefix) {
          try {
            return prefix + decodeURIComponent(suffix);
          } catch (error) {
            onError(String(error));
            return null;
          }
        }
        if (handle === "!")
          return source;
        onError(`Could not resolve tag: ${source}`);
        return null;
      }
      /**
       * Given a fully resolved tag, returns its printable string form,
       * taking into account current tag prefixes and defaults.
       */
      tagString(tag) {
        for (const [handle, prefix] of Object.entries(this.tags)) {
          if (tag.startsWith(prefix))
            return handle + escapeTagName(tag.substring(prefix.length));
        }
        return tag[0] === "!" ? tag : `!<${tag}>`;
      }
      toString(doc) {
        const lines = this.yaml.explicit ? [`%YAML ${this.yaml.version || "1.2"}`] : [];
        const tagEntries = Object.entries(this.tags);
        let tagNames;
        if (doc && tagEntries.length > 0 && identity.isNode(doc.contents)) {
          const tags = {};
          visit.visit(doc.contents, (_key, node) => {
            if (identity.isNode(node) && node.tag)
              tags[node.tag] = true;
          });
          tagNames = Object.keys(tags);
        } else
          tagNames = [];
        for (const [handle, prefix] of tagEntries) {
          if (handle === "!!" && prefix === "tag:yaml.org,2002:")
            continue;
          if (!doc || tagNames.some((tn) => tn.startsWith(prefix)))
            lines.push(`%TAG ${handle} ${prefix}`);
        }
        return lines.join("\n");
      }
    };
    Directives.defaultYaml = { explicit: false, version: "1.2" };
    Directives.defaultTags = { "!!": "tag:yaml.org,2002:" };
    exports.Directives = Directives;
  }
});

// node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/doc/anchors.js
var require_anchors = __commonJS({
  "node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/doc/anchors.js"(exports) {
    "use strict";
    var identity = require_identity();
    var visit = require_visit();
    function anchorIsValid(anchor) {
      if (/[\x00-\x19\s,[\]{}]/.test(anchor)) {
        const sa = JSON.stringify(anchor);
        const msg = `Anchor must not contain whitespace or control characters: ${sa}`;
        throw new Error(msg);
      }
      return true;
    }
    function anchorNames(root) {
      const anchors = /* @__PURE__ */ new Set();
      visit.visit(root, {
        Value(_key, node) {
          if (node.anchor)
            anchors.add(node.anchor);
        }
      });
      return anchors;
    }
    function findNewAnchor(prefix, exclude) {
      for (let i = 1; true; ++i) {
        const name = `${prefix}${i}`;
        if (!exclude.has(name))
          return name;
      }
    }
    function createNodeAnchors(doc, prefix) {
      const aliasObjects = [];
      const sourceObjects = /* @__PURE__ */ new Map();
      let prevAnchors = null;
      return {
        onAnchor: (source) => {
          aliasObjects.push(source);
          prevAnchors ?? (prevAnchors = anchorNames(doc));
          const anchor = findNewAnchor(prefix, prevAnchors);
          prevAnchors.add(anchor);
          return anchor;
        },
        /**
         * With circular references, the source node is only resolved after all
         * of its child nodes are. This is why anchors are set only after all of
         * the nodes have been created.
         */
        setAnchors: () => {
          for (const source of aliasObjects) {
            const ref = sourceObjects.get(source);
            if (typeof ref === "object" && ref.anchor && (identity.isScalar(ref.node) || identity.isCollection(ref.node))) {
              ref.node.anchor = ref.anchor;
            } else {
              const error = new Error("Failed to resolve repeated object (this should not happen)");
              error.source = source;
              throw error;
            }
          }
        },
        sourceObjects
      };
    }
    exports.anchorIsValid = anchorIsValid;
    exports.anchorNames = anchorNames;
    exports.createNodeAnchors = createNodeAnchors;
    exports.findNewAnchor = findNewAnchor;
  }
});

// node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/doc/applyReviver.js
var require_applyReviver = __commonJS({
  "node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/doc/applyReviver.js"(exports) {
    "use strict";
    function applyReviver(reviver, obj, key, val) {
      if (val && typeof val === "object") {
        if (Array.isArray(val)) {
          for (let i = 0, len = val.length; i < len; ++i) {
            const v0 = val[i];
            const v1 = applyReviver(reviver, val, String(i), v0);
            if (v1 === void 0)
              delete val[i];
            else if (v1 !== v0)
              val[i] = v1;
          }
        } else if (val instanceof Map) {
          for (const k of Array.from(val.keys())) {
            const v0 = val.get(k);
            const v1 = applyReviver(reviver, val, k, v0);
            if (v1 === void 0)
              val.delete(k);
            else if (v1 !== v0)
              val.set(k, v1);
          }
        } else if (val instanceof Set) {
          for (const v0 of Array.from(val)) {
            const v1 = applyReviver(reviver, val, v0, v0);
            if (v1 === void 0)
              val.delete(v0);
            else if (v1 !== v0) {
              val.delete(v0);
              val.add(v1);
            }
          }
        } else {
          for (const [k, v0] of Object.entries(val)) {
            const v1 = applyReviver(reviver, val, k, v0);
            if (v1 === void 0)
              delete val[k];
            else if (v1 !== v0)
              val[k] = v1;
          }
        }
      }
      return reviver.call(obj, key, val);
    }
    exports.applyReviver = applyReviver;
  }
});

// node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/nodes/toJS.js
var require_toJS = __commonJS({
  "node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/nodes/toJS.js"(exports) {
    "use strict";
    var identity = require_identity();
    function toJS(value, arg, ctx) {
      if (Array.isArray(value))
        return value.map((v, i) => toJS(v, String(i), ctx));
      if (value && typeof value.toJSON === "function") {
        if (!ctx || !identity.hasAnchor(value))
          return value.toJSON(arg, ctx);
        const data = { aliasCount: 0, count: 1, res: void 0 };
        ctx.anchors.set(value, data);
        ctx.onCreate = (res2) => {
          data.res = res2;
          delete ctx.onCreate;
        };
        const res = value.toJSON(arg, ctx);
        if (ctx.onCreate)
          ctx.onCreate(res);
        return res;
      }
      if (typeof value === "bigint" && !ctx?.keep)
        return Number(value);
      return value;
    }
    exports.toJS = toJS;
  }
});

// node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/nodes/Node.js
var require_Node = __commonJS({
  "node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/nodes/Node.js"(exports) {
    "use strict";
    var applyReviver = require_applyReviver();
    var identity = require_identity();
    var toJS = require_toJS();
    var NodeBase = class {
      constructor(type) {
        Object.defineProperty(this, identity.NODE_TYPE, { value: type });
      }
      /** Create a copy of this node.  */
      clone() {
        const copy = Object.create(Object.getPrototypeOf(this), Object.getOwnPropertyDescriptors(this));
        if (this.range)
          copy.range = this.range.slice();
        return copy;
      }
      /** A plain JavaScript representation of this node. */
      toJS(doc, { mapAsMap, maxAliasCount, onAnchor, reviver } = {}) {
        if (!identity.isDocument(doc))
          throw new TypeError("A document argument is required");
        const ctx = {
          anchors: /* @__PURE__ */ new Map(),
          doc,
          keep: true,
          mapAsMap: mapAsMap === true,
          mapKeyWarned: false,
          maxAliasCount: typeof maxAliasCount === "number" ? maxAliasCount : 100
        };
        const res = toJS.toJS(this, "", ctx);
        if (typeof onAnchor === "function")
          for (const { count, res: res2 } of ctx.anchors.values())
            onAnchor(res2, count);
        return typeof reviver === "function" ? applyReviver.applyReviver(reviver, { "": res }, "", res) : res;
      }
    };
    exports.NodeBase = NodeBase;
  }
});

// node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/nodes/Alias.js
var require_Alias = __commonJS({
  "node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/nodes/Alias.js"(exports) {
    "use strict";
    var anchors = require_anchors();
    var visit = require_visit();
    var identity = require_identity();
    var Node = require_Node();
    var toJS = require_toJS();
    var Alias = class extends Node.NodeBase {
      constructor(source) {
        super(identity.ALIAS);
        this.source = source;
        Object.defineProperty(this, "tag", {
          set() {
            throw new Error("Alias nodes cannot have tags");
          }
        });
      }
      /**
       * Resolve the value of this alias within `doc`, finding the last
       * instance of the `source` anchor before this node.
       */
      resolve(doc, ctx) {
        if (ctx?.maxAliasCount === 0)
          throw new ReferenceError("Alias resolution is disabled");
        let nodes;
        if (ctx?.aliasResolveCache) {
          nodes = ctx.aliasResolveCache;
        } else {
          nodes = [];
          visit.visit(doc, {
            Node: (_key, node) => {
              if (identity.isAlias(node) || identity.hasAnchor(node))
                nodes.push(node);
            }
          });
          if (ctx)
            ctx.aliasResolveCache = nodes;
        }
        let found = void 0;
        for (const node of nodes) {
          if (node === this)
            break;
          if (node.anchor === this.source)
            found = node;
        }
        return found;
      }
      toJSON(_arg, ctx) {
        if (!ctx)
          return { source: this.source };
        const { anchors: anchors2, doc, maxAliasCount } = ctx;
        const source = this.resolve(doc, ctx);
        if (!source) {
          const msg = `Unresolved alias (the anchor must be set before the alias): ${this.source}`;
          throw new ReferenceError(msg);
        }
        let data = anchors2.get(source);
        if (!data) {
          toJS.toJS(source, null, ctx);
          data = anchors2.get(source);
        }
        if (data?.res === void 0) {
          const msg = "This should not happen: Alias anchor was not resolved?";
          throw new ReferenceError(msg);
        }
        if (maxAliasCount >= 0) {
          data.count += 1;
          if (data.aliasCount === 0)
            data.aliasCount = getAliasCount(doc, source, anchors2);
          if (data.count * data.aliasCount > maxAliasCount) {
            const msg = "Excessive alias count indicates a resource exhaustion attack";
            throw new ReferenceError(msg);
          }
        }
        return data.res;
      }
      toString(ctx, _onComment, _onChompKeep) {
        const src = `*${this.source}`;
        if (ctx) {
          anchors.anchorIsValid(this.source);
          if (ctx.options.verifyAliasOrder && !ctx.anchors.has(this.source)) {
            const msg = `Unresolved alias (the anchor must be set before the alias): ${this.source}`;
            throw new Error(msg);
          }
          if (ctx.implicitKey)
            return `${src} `;
        }
        return src;
      }
    };
    function getAliasCount(doc, node, anchors2) {
      if (identity.isAlias(node)) {
        const source = node.resolve(doc);
        const anchor = anchors2 && source && anchors2.get(source);
        return anchor ? anchor.count * anchor.aliasCount : 0;
      } else if (identity.isCollection(node)) {
        let count = 0;
        for (const item of node.items) {
          const c = getAliasCount(doc, item, anchors2);
          if (c > count)
            count = c;
        }
        return count;
      } else if (identity.isPair(node)) {
        const kc = getAliasCount(doc, node.key, anchors2);
        const vc = getAliasCount(doc, node.value, anchors2);
        return Math.max(kc, vc);
      }
      return 1;
    }
    exports.Alias = Alias;
  }
});

// node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/nodes/Scalar.js
var require_Scalar = __commonJS({
  "node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/nodes/Scalar.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Node = require_Node();
    var toJS = require_toJS();
    var isScalarValue = (value) => !value || typeof value !== "function" && typeof value !== "object";
    var Scalar = class extends Node.NodeBase {
      constructor(value) {
        super(identity.SCALAR);
        this.value = value;
      }
      toJSON(arg, ctx) {
        return ctx?.keep ? this.value : toJS.toJS(this.value, arg, ctx);
      }
      toString() {
        return String(this.value);
      }
    };
    Scalar.BLOCK_FOLDED = "BLOCK_FOLDED";
    Scalar.BLOCK_LITERAL = "BLOCK_LITERAL";
    Scalar.PLAIN = "PLAIN";
    Scalar.QUOTE_DOUBLE = "QUOTE_DOUBLE";
    Scalar.QUOTE_SINGLE = "QUOTE_SINGLE";
    exports.Scalar = Scalar;
    exports.isScalarValue = isScalarValue;
  }
});

// node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/doc/createNode.js
var require_createNode = __commonJS({
  "node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/doc/createNode.js"(exports) {
    "use strict";
    var Alias = require_Alias();
    var identity = require_identity();
    var Scalar = require_Scalar();
    var defaultTagPrefix = "tag:yaml.org,2002:";
    function findTagObject(value, tagName, tags) {
      if (tagName) {
        const match = tags.filter((t) => t.tag === tagName);
        const tagObj = match.find((t) => !t.format) ?? match[0];
        if (!tagObj)
          throw new Error(`Tag ${tagName} not found`);
        return tagObj;
      }
      return tags.find((t) => t.identify?.(value) && !t.format);
    }
    function createNode(value, tagName, ctx) {
      if (identity.isDocument(value))
        value = value.contents;
      if (identity.isNode(value))
        return value;
      if (identity.isPair(value)) {
        const map = ctx.schema[identity.MAP].createNode?.(ctx.schema, null, ctx);
        map.items.push(value);
        return map;
      }
      if (value instanceof String || value instanceof Number || value instanceof Boolean || typeof BigInt !== "undefined" && value instanceof BigInt) {
        value = value.valueOf();
      }
      const { aliasDuplicateObjects, onAnchor, onTagObj, schema, sourceObjects } = ctx;
      let ref = void 0;
      if (aliasDuplicateObjects && value && typeof value === "object") {
        ref = sourceObjects.get(value);
        if (ref) {
          ref.anchor ?? (ref.anchor = onAnchor(value));
          return new Alias.Alias(ref.anchor);
        } else {
          ref = { anchor: null, node: null };
          sourceObjects.set(value, ref);
        }
      }
      if (tagName?.startsWith("!!"))
        tagName = defaultTagPrefix + tagName.slice(2);
      let tagObj = findTagObject(value, tagName, schema.tags);
      if (!tagObj) {
        if (value && typeof value.toJSON === "function") {
          value = value.toJSON();
        }
        if (!value || typeof value !== "object") {
          const node2 = new Scalar.Scalar(value);
          if (ref)
            ref.node = node2;
          return node2;
        }
        tagObj = value instanceof Map ? schema[identity.MAP] : Symbol.iterator in Object(value) ? schema[identity.SEQ] : schema[identity.MAP];
      }
      if (onTagObj) {
        onTagObj(tagObj);
        delete ctx.onTagObj;
      }
      const node = tagObj?.createNode ? tagObj.createNode(ctx.schema, value, ctx) : typeof tagObj?.nodeClass?.from === "function" ? tagObj.nodeClass.from(ctx.schema, value, ctx) : new Scalar.Scalar(value);
      if (tagName)
        node.tag = tagName;
      else if (!tagObj.default)
        node.tag = tagObj.tag;
      if (ref)
        ref.node = node;
      return node;
    }
    exports.createNode = createNode;
  }
});

// node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/nodes/Collection.js
var require_Collection = __commonJS({
  "node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/nodes/Collection.js"(exports) {
    "use strict";
    var createNode = require_createNode();
    var identity = require_identity();
    var Node = require_Node();
    function collectionFromPath(schema, path4, value) {
      let v = value;
      for (let i = path4.length - 1; i >= 0; --i) {
        const k = path4[i];
        if (typeof k === "number" && Number.isInteger(k) && k >= 0) {
          const a = [];
          a[k] = v;
          v = a;
        } else {
          v = /* @__PURE__ */ new Map([[k, v]]);
        }
      }
      return createNode.createNode(v, void 0, {
        aliasDuplicateObjects: false,
        keepUndefined: false,
        onAnchor: () => {
          throw new Error("This should not happen, please report a bug.");
        },
        schema,
        sourceObjects: /* @__PURE__ */ new Map()
      });
    }
    var isEmptyPath = (path4) => path4 == null || typeof path4 === "object" && !!path4[Symbol.iterator]().next().done;
    var Collection = class extends Node.NodeBase {
      constructor(type, schema) {
        super(type);
        Object.defineProperty(this, "schema", {
          value: schema,
          configurable: true,
          enumerable: false,
          writable: true
        });
      }
      /**
       * Create a copy of this collection.
       *
       * @param schema - If defined, overwrites the original's schema
       */
      clone(schema) {
        const copy = Object.create(Object.getPrototypeOf(this), Object.getOwnPropertyDescriptors(this));
        if (schema)
          copy.schema = schema;
        copy.items = copy.items.map((it) => identity.isNode(it) || identity.isPair(it) ? it.clone(schema) : it);
        if (this.range)
          copy.range = this.range.slice();
        return copy;
      }
      /**
       * Adds a value to the collection. For `!!map` and `!!omap` the value must
       * be a Pair instance or a `{ key, value }` object, which may not have a key
       * that already exists in the map.
       */
      addIn(path4, value) {
        if (isEmptyPath(path4))
          this.add(value);
        else {
          const [key, ...rest] = path4;
          const node = this.get(key, true);
          if (identity.isCollection(node))
            node.addIn(rest, value);
          else if (node === void 0 && this.schema)
            this.set(key, collectionFromPath(this.schema, rest, value));
          else
            throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
        }
      }
      /**
       * Removes a value from the collection.
       * @returns `true` if the item was found and removed.
       */
      deleteIn(path4) {
        const [key, ...rest] = path4;
        if (rest.length === 0)
          return this.delete(key);
        const node = this.get(key, true);
        if (identity.isCollection(node))
          return node.deleteIn(rest);
        else
          throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
      }
      /**
       * Returns item at `key`, or `undefined` if not found. By default unwraps
       * scalar values from their surrounding node; to disable set `keepScalar` to
       * `true` (collections are always returned intact).
       */
      getIn(path4, keepScalar) {
        const [key, ...rest] = path4;
        const node = this.get(key, true);
        if (rest.length === 0)
          return !keepScalar && identity.isScalar(node) ? node.value : node;
        else
          return identity.isCollection(node) ? node.getIn(rest, keepScalar) : void 0;
      }
      hasAllNullValues(allowScalar) {
        return this.items.every((node) => {
          if (!identity.isPair(node))
            return false;
          const n = node.value;
          return n == null || allowScalar && identity.isScalar(n) && n.value == null && !n.commentBefore && !n.comment && !n.tag;
        });
      }
      /**
       * Checks if the collection includes a value with the key `key`.
       */
      hasIn(path4) {
        const [key, ...rest] = path4;
        if (rest.length === 0)
          return this.has(key);
        const node = this.get(key, true);
        return identity.isCollection(node) ? node.hasIn(rest) : false;
      }
      /**
       * Sets a value in this collection. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       */
      setIn(path4, value) {
        const [key, ...rest] = path4;
        if (rest.length === 0) {
          this.set(key, value);
        } else {
          const node = this.get(key, true);
          if (identity.isCollection(node))
            node.setIn(rest, value);
          else if (node === void 0 && this.schema)
            this.set(key, collectionFromPath(this.schema, rest, value));
          else
            throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
        }
      }
    };
    exports.Collection = Collection;
    exports.collectionFromPath = collectionFromPath;
    exports.isEmptyPath = isEmptyPath;
  }
});

// node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/stringify/stringifyComment.js
var require_stringifyComment = __commonJS({
  "node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/stringify/stringifyComment.js"(exports) {
    "use strict";
    var stringifyComment = (str) => str.replace(/^(?!$)(?: $)?/gm, "#");
    function indentComment(comment, indent) {
      if (/^\n+$/.test(comment))
        return comment.substring(1);
      return indent ? comment.replace(/^(?! *$)/gm, indent) : comment;
    }
    var lineComment = (str, indent, comment) => str.endsWith("\n") ? indentComment(comment, indent) : comment.includes("\n") ? "\n" + indentComment(comment, indent) : (str.endsWith(" ") ? "" : " ") + comment;
    exports.indentComment = indentComment;
    exports.lineComment = lineComment;
    exports.stringifyComment = stringifyComment;
  }
});

// node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/stringify/foldFlowLines.js
var require_foldFlowLines = __commonJS({
  "node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/stringify/foldFlowLines.js"(exports) {
    "use strict";
    var FOLD_FLOW = "flow";
    var FOLD_BLOCK = "block";
    var FOLD_QUOTED = "quoted";
    function foldFlowLines(text, indent, mode = "flow", { indentAtStart, lineWidth = 80, minContentWidth = 20, onFold, onOverflow } = {}) {
      if (!lineWidth || lineWidth < 0)
        return text;
      if (lineWidth < minContentWidth)
        minContentWidth = 0;
      const endStep = Math.max(1 + minContentWidth, 1 + lineWidth - indent.length);
      if (text.length <= endStep)
        return text;
      const folds = [];
      const escapedFolds = {};
      let end = lineWidth - indent.length;
      if (typeof indentAtStart === "number") {
        if (indentAtStart > lineWidth - Math.max(2, minContentWidth))
          folds.push(0);
        else
          end = lineWidth - indentAtStart;
      }
      let split = void 0;
      let prev = void 0;
      let overflow = false;
      let i = -1;
      let escStart = -1;
      let escEnd = -1;
      if (mode === FOLD_BLOCK) {
        i = consumeMoreIndentedLines(text, i, indent.length);
        if (i !== -1)
          end = i + endStep;
      }
      for (let ch; ch = text[i += 1]; ) {
        if (mode === FOLD_QUOTED && ch === "\\") {
          escStart = i;
          switch (text[i + 1]) {
            case "x":
              i += 3;
              break;
            case "u":
              i += 5;
              break;
            case "U":
              i += 9;
              break;
            default:
              i += 1;
          }
          escEnd = i;
        }
        if (ch === "\n") {
          if (mode === FOLD_BLOCK)
            i = consumeMoreIndentedLines(text, i, indent.length);
          end = i + indent.length + endStep;
          split = void 0;
        } else {
          if (ch === " " && prev && prev !== " " && prev !== "\n" && prev !== "	") {
            const next = text[i + 1];
            if (next && next !== " " && next !== "\n" && next !== "	")
              split = i;
          }
          if (i >= end) {
            if (split) {
              folds.push(split);
              end = split + endStep;
              split = void 0;
            } else if (mode === FOLD_QUOTED) {
              while (prev === " " || prev === "	") {
                prev = ch;
                ch = text[i += 1];
                overflow = true;
              }
              const j = i > escEnd + 1 ? i - 2 : escStart - 1;
              if (escapedFolds[j])
                return text;
              folds.push(j);
              escapedFolds[j] = true;
              end = j + endStep;
              split = void 0;
            } else {
              overflow = true;
            }
          }
        }
        prev = ch;
      }
      if (overflow && onOverflow)
        onOverflow();
      if (folds.length === 0)
        return text;
      if (onFold)
        onFold();
      let res = text.slice(0, folds[0]);
      for (let i2 = 0; i2 < folds.length; ++i2) {
        const fold = folds[i2];
        const end2 = folds[i2 + 1] || text.length;
        if (fold === 0)
          res = `
${indent}${text.slice(0, end2)}`;
        else {
          if (mode === FOLD_QUOTED && escapedFolds[fold])
            res += `${text[fold]}\\`;
          res += `
${indent}${text.slice(fold + 1, end2)}`;
        }
      }
      return res;
    }
    function consumeMoreIndentedLines(text, i, indent) {
      let end = i;
      let start = i + 1;
      let ch = text[start];
      while (ch === " " || ch === "	") {
        if (i < start + indent) {
          ch = text[++i];
        } else {
          do {
            ch = text[++i];
          } while (ch && ch !== "\n");
          end = i;
          start = i + 1;
          ch = text[start];
        }
      }
      return end;
    }
    exports.FOLD_BLOCK = FOLD_BLOCK;
    exports.FOLD_FLOW = FOLD_FLOW;
    exports.FOLD_QUOTED = FOLD_QUOTED;
    exports.foldFlowLines = foldFlowLines;
  }
});

// node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/stringify/stringifyString.js
var require_stringifyString = __commonJS({
  "node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/stringify/stringifyString.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var foldFlowLines = require_foldFlowLines();
    var getFoldOptions = (ctx, isBlock) => ({
      indentAtStart: isBlock ? ctx.indent.length : ctx.indentAtStart,
      lineWidth: ctx.options.lineWidth,
      minContentWidth: ctx.options.minContentWidth
    });
    var containsDocumentMarker = (str) => /^(%|---|\.\.\.)/m.test(str);
    function lineLengthOverLimit(str, lineWidth, indentLength) {
      if (!lineWidth || lineWidth < 0)
        return false;
      const limit = lineWidth - indentLength;
      const strLen = str.length;
      if (strLen <= limit)
        return false;
      for (let i = 0, start = 0; i < strLen; ++i) {
        if (str[i] === "\n") {
          if (i - start > limit)
            return true;
          start = i + 1;
          if (strLen - start <= limit)
            return false;
        }
      }
      return true;
    }
    function doubleQuotedString(value, ctx) {
      const json = JSON.stringify(value);
      if (ctx.options.doubleQuotedAsJSON)
        return json;
      const { implicitKey } = ctx;
      const minMultiLineLength = ctx.options.doubleQuotedMinMultiLineLength;
      const indent = ctx.indent || (containsDocumentMarker(value) ? "  " : "");
      let str = "";
      let start = 0;
      for (let i = 0, ch = json[i]; ch; ch = json[++i]) {
        if (ch === " " && json[i + 1] === "\\" && json[i + 2] === "n") {
          str += json.slice(start, i) + "\\ ";
          i += 1;
          start = i;
          ch = "\\";
        }
        if (ch === "\\")
          switch (json[i + 1]) {
            case "u":
              {
                str += json.slice(start, i);
                const code = json.substr(i + 2, 4);
                switch (code) {
                  case "0000":
                    str += "\\0";
                    break;
                  case "0007":
                    str += "\\a";
                    break;
                  case "000b":
                    str += "\\v";
                    break;
                  case "001b":
                    str += "\\e";
                    break;
                  case "0085":
                    str += "\\N";
                    break;
                  case "00a0":
                    str += "\\_";
                    break;
                  case "2028":
                    str += "\\L";
                    break;
                  case "2029":
                    str += "\\P";
                    break;
                  default:
                    if (code.substr(0, 2) === "00")
                      str += "\\x" + code.substr(2);
                    else
                      str += json.substr(i, 6);
                }
                i += 5;
                start = i + 1;
              }
              break;
            case "n":
              if (implicitKey || json[i + 2] === '"' || json.length < minMultiLineLength) {
                i += 1;
              } else {
                str += json.slice(start, i) + "\n\n";
                while (json[i + 2] === "\\" && json[i + 3] === "n" && json[i + 4] !== '"') {
                  str += "\n";
                  i += 2;
                }
                str += indent;
                if (json[i + 2] === " ")
                  str += "\\";
                i += 1;
                start = i + 1;
              }
              break;
            default:
              i += 1;
          }
      }
      str = start ? str + json.slice(start) : json;
      return implicitKey ? str : foldFlowLines.foldFlowLines(str, indent, foldFlowLines.FOLD_QUOTED, getFoldOptions(ctx, false));
    }
    function singleQuotedString(value, ctx) {
      if (ctx.options.singleQuote === false || ctx.implicitKey && value.includes("\n") || /[ \t]\n|\n[ \t]/.test(value))
        return doubleQuotedString(value, ctx);
      const indent = ctx.indent || (containsDocumentMarker(value) ? "  " : "");
      const res = "'" + value.replace(/'/g, "''").replace(/\n+/g, `$&
${indent}`) + "'";
      return ctx.implicitKey ? res : foldFlowLines.foldFlowLines(res, indent, foldFlowLines.FOLD_FLOW, getFoldOptions(ctx, false));
    }
    function quotedString(value, ctx) {
      const { singleQuote } = ctx.options;
      let qs;
      if (singleQuote === false)
        qs = doubleQuotedString;
      else {
        const hasDouble = value.includes('"');
        const hasSingle = value.includes("'");
        if (hasDouble && !hasSingle)
          qs = singleQuotedString;
        else if (hasSingle && !hasDouble)
          qs = doubleQuotedString;
        else
          qs = singleQuote ? singleQuotedString : doubleQuotedString;
      }
      return qs(value, ctx);
    }
    var blockEndNewlines;
    try {
      blockEndNewlines = new RegExp("(^|(?<!\n))\n+(?!\n|$)", "g");
    } catch {
      blockEndNewlines = /\n+(?!\n|$)/g;
    }
    function blockString({ comment, type, value }, ctx, onComment, onChompKeep) {
      const { blockQuote, commentString, lineWidth } = ctx.options;
      if (!blockQuote || /\n[\t ]+$/.test(value)) {
        return quotedString(value, ctx);
      }
      const indent = ctx.indent || (ctx.forceBlockIndent || containsDocumentMarker(value) ? "  " : "");
      const literal = blockQuote === "literal" ? true : blockQuote === "folded" || type === Scalar.Scalar.BLOCK_FOLDED ? false : type === Scalar.Scalar.BLOCK_LITERAL ? true : !lineLengthOverLimit(value, lineWidth, indent.length);
      if (!value)
        return literal ? "|\n" : ">\n";
      let chomp;
      let endStart;
      for (endStart = value.length; endStart > 0; --endStart) {
        const ch = value[endStart - 1];
        if (ch !== "\n" && ch !== "	" && ch !== " ")
          break;
      }
      let end = value.substring(endStart);
      const endNlPos = end.indexOf("\n");
      if (endNlPos === -1) {
        chomp = "-";
      } else if (value === end || endNlPos !== end.length - 1) {
        chomp = "+";
        if (onChompKeep)
          onChompKeep();
      } else {
        chomp = "";
      }
      if (end) {
        value = value.slice(0, -end.length);
        if (end[end.length - 1] === "\n")
          end = end.slice(0, -1);
        end = end.replace(blockEndNewlines, `$&${indent}`);
      }
      let startWithSpace = false;
      let startEnd;
      let startNlPos = -1;
      for (startEnd = 0; startEnd < value.length; ++startEnd) {
        const ch = value[startEnd];
        if (ch === " ")
          startWithSpace = true;
        else if (ch === "\n")
          startNlPos = startEnd;
        else
          break;
      }
      let start = value.substring(0, startNlPos < startEnd ? startNlPos + 1 : startEnd);
      if (start) {
        value = value.substring(start.length);
        start = start.replace(/\n+/g, `$&${indent}`);
      }
      const indentSize = indent ? "2" : "1";
      let header = (startWithSpace ? indentSize : "") + chomp;
      if (comment) {
        header += " " + commentString(comment.replace(/ ?[\r\n]+/g, " "));
        if (onComment)
          onComment();
      }
      if (!literal) {
        const foldedValue = value.replace(/\n+/g, "\n$&").replace(/(?:^|\n)([\t ].*)(?:([\n\t ]*)\n(?![\n\t ]))?/g, "$1$2").replace(/\n+/g, `$&${indent}`);
        let literalFallback = false;
        const foldOptions = getFoldOptions(ctx, true);
        if (blockQuote !== "folded" && type !== Scalar.Scalar.BLOCK_FOLDED) {
          foldOptions.onOverflow = () => {
            literalFallback = true;
          };
        }
        const body = foldFlowLines.foldFlowLines(`${start}${foldedValue}${end}`, indent, foldFlowLines.FOLD_BLOCK, foldOptions);
        if (!literalFallback)
          return `>${header}
${indent}${body}`;
      }
      value = value.replace(/\n+/g, `$&${indent}`);
      return `|${header}
${indent}${start}${value}${end}`;
    }
    function plainString(item, ctx, onComment, onChompKeep) {
      const { type, value } = item;
      const { actualString, implicitKey, indent, indentStep, inFlow } = ctx;
      if (implicitKey && value.includes("\n") || inFlow && /[[\]{},]/.test(value)) {
        return quotedString(value, ctx);
      }
      if (/^[\n\t ,[\]{}#&*!|>'"%@`]|^[?-]$|^[?-][ \t]|[\n:][ \t]|[ \t]\n|[\n\t ]#|[\n\t :]$/.test(value)) {
        return implicitKey || inFlow || !value.includes("\n") ? quotedString(value, ctx) : blockString(item, ctx, onComment, onChompKeep);
      }
      if (!implicitKey && !inFlow && type !== Scalar.Scalar.PLAIN && value.includes("\n")) {
        return blockString(item, ctx, onComment, onChompKeep);
      }
      if (containsDocumentMarker(value)) {
        if (indent === "") {
          ctx.forceBlockIndent = true;
          return blockString(item, ctx, onComment, onChompKeep);
        } else if (implicitKey && indent === indentStep) {
          return quotedString(value, ctx);
        }
      }
      const str = value.replace(/\n+/g, `$&
${indent}`);
      if (actualString) {
        const test = (tag) => tag.default && tag.tag !== "tag:yaml.org,2002:str" && tag.test?.test(str);
        const { compat, tags } = ctx.doc.schema;
        if (tags.some(test) || compat?.some(test))
          return quotedString(value, ctx);
      }
      return implicitKey ? str : foldFlowLines.foldFlowLines(str, indent, foldFlowLines.FOLD_FLOW, getFoldOptions(ctx, false));
    }
    function stringifyString(item, ctx, onComment, onChompKeep) {
      const { implicitKey, inFlow } = ctx;
      const ss = typeof item.value === "string" ? item : Object.assign({}, item, { value: String(item.value) });
      let { type } = item;
      if (type !== Scalar.Scalar.QUOTE_DOUBLE) {
        if (/[\x00-\x08\x0b-\x1f\x7f-\x9f\u{D800}-\u{DFFF}]/u.test(ss.value))
          type = Scalar.Scalar.QUOTE_DOUBLE;
      }
      const _stringify = (_type) => {
        switch (_type) {
          case Scalar.Scalar.BLOCK_FOLDED:
          case Scalar.Scalar.BLOCK_LITERAL:
            return implicitKey || inFlow ? quotedString(ss.value, ctx) : blockString(ss, ctx, onComment, onChompKeep);
          case Scalar.Scalar.QUOTE_DOUBLE:
            return doubleQuotedString(ss.value, ctx);
          case Scalar.Scalar.QUOTE_SINGLE:
            return singleQuotedString(ss.value, ctx);
          case Scalar.Scalar.PLAIN:
            return plainString(ss, ctx, onComment, onChompKeep);
          default:
            return null;
        }
      };
      let res = _stringify(type);
      if (res === null) {
        const { defaultKeyType, defaultStringType } = ctx.options;
        const t = implicitKey && defaultKeyType || defaultStringType;
        res = _stringify(t);
        if (res === null)
          throw new Error(`Unsupported default string type ${t}`);
      }
      return res;
    }
    exports.stringifyString = stringifyString;
  }
});

// node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/stringify/stringify.js
var require_stringify = __commonJS({
  "node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/stringify/stringify.js"(exports) {
    "use strict";
    var anchors = require_anchors();
    var identity = require_identity();
    var stringifyComment = require_stringifyComment();
    var stringifyString = require_stringifyString();
    function createStringifyContext(doc, options) {
      const opt = Object.assign({
        blockQuote: true,
        commentString: stringifyComment.stringifyComment,
        defaultKeyType: null,
        defaultStringType: "PLAIN",
        directives: null,
        doubleQuotedAsJSON: false,
        doubleQuotedMinMultiLineLength: 40,
        falseStr: "false",
        flowCollectionPadding: true,
        indentSeq: true,
        lineWidth: 80,
        minContentWidth: 20,
        nullStr: "null",
        simpleKeys: false,
        singleQuote: null,
        trailingComma: false,
        trueStr: "true",
        verifyAliasOrder: true
      }, doc.schema.toStringOptions, options);
      let inFlow;
      switch (opt.collectionStyle) {
        case "block":
          inFlow = false;
          break;
        case "flow":
          inFlow = true;
          break;
        default:
          inFlow = null;
      }
      return {
        anchors: /* @__PURE__ */ new Set(),
        doc,
        flowCollectionPadding: opt.flowCollectionPadding ? " " : "",
        indent: "",
        indentStep: typeof opt.indent === "number" ? " ".repeat(opt.indent) : "  ",
        inFlow,
        options: opt
      };
    }
    function getTagObject(tags, item) {
      if (item.tag) {
        const match = tags.filter((t) => t.tag === item.tag);
        if (match.length > 0)
          return match.find((t) => t.format === item.format) ?? match[0];
      }
      let tagObj = void 0;
      let obj;
      if (identity.isScalar(item)) {
        obj = item.value;
        let match = tags.filter((t) => t.identify?.(obj));
        if (match.length > 1) {
          const testMatch = match.filter((t) => t.test);
          if (testMatch.length > 0)
            match = testMatch;
        }
        tagObj = match.find((t) => t.format === item.format) ?? match.find((t) => !t.format);
      } else {
        obj = item;
        tagObj = tags.find((t) => t.nodeClass && obj instanceof t.nodeClass);
      }
      if (!tagObj) {
        const name = obj?.constructor?.name ?? (obj === null ? "null" : typeof obj);
        throw new Error(`Tag not resolved for ${name} value`);
      }
      return tagObj;
    }
    function stringifyProps(node, tagObj, { anchors: anchors$1, doc }) {
      if (!doc.directives)
        return "";
      const props = [];
      const anchor = (identity.isScalar(node) || identity.isCollection(node)) && node.anchor;
      if (anchor && anchors.anchorIsValid(anchor)) {
        anchors$1.add(anchor);
        props.push(`&${anchor}`);
      }
      const tag = node.tag ?? (tagObj.default ? null : tagObj.tag);
      if (tag)
        props.push(doc.directives.tagString(tag));
      return props.join(" ");
    }
    function stringify(item, ctx, onComment, onChompKeep) {
      if (identity.isPair(item))
        return item.toString(ctx, onComment, onChompKeep);
      if (identity.isAlias(item)) {
        if (ctx.doc.directives)
          return item.toString(ctx);
        if (ctx.resolvedAliases?.has(item)) {
          throw new TypeError(`Cannot stringify circular structure without alias nodes`);
        } else {
          if (ctx.resolvedAliases)
            ctx.resolvedAliases.add(item);
          else
            ctx.resolvedAliases = /* @__PURE__ */ new Set([item]);
          item = item.resolve(ctx.doc);
        }
      }
      let tagObj = void 0;
      const node = identity.isNode(item) ? item : ctx.doc.createNode(item, { onTagObj: (o) => tagObj = o });
      tagObj ?? (tagObj = getTagObject(ctx.doc.schema.tags, node));
      const props = stringifyProps(node, tagObj, ctx);
      if (props.length > 0)
        ctx.indentAtStart = (ctx.indentAtStart ?? 0) + props.length + 1;
      const str = typeof tagObj.stringify === "function" ? tagObj.stringify(node, ctx, onComment, onChompKeep) : identity.isScalar(node) ? stringifyString.stringifyString(node, ctx, onComment, onChompKeep) : node.toString(ctx, onComment, onChompKeep);
      if (!props)
        return str;
      return identity.isScalar(node) || str[0] === "{" || str[0] === "[" ? `${props} ${str}` : `${props}
${ctx.indent}${str}`;
    }
    exports.createStringifyContext = createStringifyContext;
    exports.stringify = stringify;
  }
});

// node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/stringify/stringifyPair.js
var require_stringifyPair = __commonJS({
  "node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/stringify/stringifyPair.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var stringify = require_stringify();
    var stringifyComment = require_stringifyComment();
    function stringifyPair({ key, value }, ctx, onComment, onChompKeep) {
      const { allNullValues, doc, indent, indentStep, options: { commentString, indentSeq, simpleKeys } } = ctx;
      let keyComment = identity.isNode(key) && key.comment || null;
      if (simpleKeys) {
        if (keyComment) {
          throw new Error("With simple keys, key nodes cannot have comments");
        }
        if (identity.isCollection(key) || !identity.isNode(key) && typeof key === "object") {
          const msg = "With simple keys, collection cannot be used as a key value";
          throw new Error(msg);
        }
      }
      let explicitKey = !simpleKeys && (!key || keyComment && value == null && !ctx.inFlow || identity.isCollection(key) || (identity.isScalar(key) ? key.type === Scalar.Scalar.BLOCK_FOLDED || key.type === Scalar.Scalar.BLOCK_LITERAL : typeof key === "object"));
      ctx = Object.assign({}, ctx, {
        allNullValues: false,
        implicitKey: !explicitKey && (simpleKeys || !allNullValues),
        indent: indent + indentStep
      });
      let keyCommentDone = false;
      let chompKeep = false;
      let str = stringify.stringify(key, ctx, () => keyCommentDone = true, () => chompKeep = true);
      if (!explicitKey && !ctx.inFlow && str.length > 1024) {
        if (simpleKeys)
          throw new Error("With simple keys, single line scalar must not span more than 1024 characters");
        explicitKey = true;
      }
      if (ctx.inFlow) {
        if (allNullValues || value == null) {
          if (keyCommentDone && onComment)
            onComment();
          return str === "" ? "?" : explicitKey ? `? ${str}` : str;
        }
      } else if (allNullValues && !simpleKeys || value == null && explicitKey) {
        str = `? ${str}`;
        if (keyComment && !keyCommentDone) {
          str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment));
        } else if (chompKeep && onChompKeep)
          onChompKeep();
        return str;
      }
      if (keyCommentDone)
        keyComment = null;
      if (explicitKey) {
        if (keyComment)
          str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment));
        str = `? ${str}
${indent}:`;
      } else {
        str = `${str}:`;
        if (keyComment)
          str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment));
      }
      let vsb, vcb, valueComment;
      if (identity.isNode(value)) {
        vsb = !!value.spaceBefore;
        vcb = value.commentBefore;
        valueComment = value.comment;
      } else {
        vsb = false;
        vcb = null;
        valueComment = null;
        if (value && typeof value === "object")
          value = doc.createNode(value);
      }
      ctx.implicitKey = false;
      if (!explicitKey && !keyComment && identity.isScalar(value))
        ctx.indentAtStart = str.length + 1;
      chompKeep = false;
      if (!indentSeq && indentStep.length >= 2 && !ctx.inFlow && !explicitKey && identity.isSeq(value) && !value.flow && !value.tag && !value.anchor) {
        ctx.indent = ctx.indent.substring(2);
      }
      let valueCommentDone = false;
      const valueStr = stringify.stringify(value, ctx, () => valueCommentDone = true, () => chompKeep = true);
      let ws = " ";
      if (keyComment || vsb || vcb) {
        ws = vsb ? "\n" : "";
        if (vcb) {
          const cs = commentString(vcb);
          ws += `
${stringifyComment.indentComment(cs, ctx.indent)}`;
        }
        if (valueStr === "" && !ctx.inFlow) {
          if (ws === "\n" && valueComment)
            ws = "\n\n";
        } else {
          ws += `
${ctx.indent}`;
        }
      } else if (!explicitKey && identity.isCollection(value)) {
        const vs0 = valueStr[0];
        const nl0 = valueStr.indexOf("\n");
        const hasNewline = nl0 !== -1;
        const flow = ctx.inFlow ?? value.flow ?? value.items.length === 0;
        if (hasNewline || !flow) {
          let hasPropsLine = false;
          if (hasNewline && (vs0 === "&" || vs0 === "!")) {
            let sp0 = valueStr.indexOf(" ");
            if (vs0 === "&" && sp0 !== -1 && sp0 < nl0 && valueStr[sp0 + 1] === "!") {
              sp0 = valueStr.indexOf(" ", sp0 + 1);
            }
            if (sp0 === -1 || nl0 < sp0)
              hasPropsLine = true;
          }
          if (!hasPropsLine)
            ws = `
${ctx.indent}`;
        }
      } else if (valueStr === "" || valueStr[0] === "\n") {
        ws = "";
      }
      str += ws + valueStr;
      if (ctx.inFlow) {
        if (valueCommentDone && onComment)
          onComment();
      } else if (valueComment && !valueCommentDone) {
        str += stringifyComment.lineComment(str, ctx.indent, commentString(valueComment));
      } else if (chompKeep && onChompKeep) {
        onChompKeep();
      }
      return str;
    }
    exports.stringifyPair = stringifyPair;
  }
});

// node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/log.js
var require_log = __commonJS({
  "node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/log.js"(exports) {
    "use strict";
    var node_process = __require("process");
    function debug(logLevel, ...messages) {
      if (logLevel === "debug")
        console.log(...messages);
    }
    function warn(logLevel, warning) {
      if (logLevel === "debug" || logLevel === "warn") {
        if (typeof node_process.emitWarning === "function")
          node_process.emitWarning(warning);
        else
          console.warn(warning);
      }
    }
    exports.debug = debug;
    exports.warn = warn;
  }
});

// node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/schema/yaml-1.1/merge.js
var require_merge = __commonJS({
  "node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/schema/yaml-1.1/merge.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var MERGE_KEY = "<<";
    var merge = {
      identify: (value) => value === MERGE_KEY || typeof value === "symbol" && value.description === MERGE_KEY,
      default: "key",
      tag: "tag:yaml.org,2002:merge",
      test: /^<<$/,
      resolve: () => Object.assign(new Scalar.Scalar(Symbol(MERGE_KEY)), {
        addToJSMap: addMergeToJSMap
      }),
      stringify: () => MERGE_KEY
    };
    var isMergeKey = (ctx, key) => (merge.identify(key) || identity.isScalar(key) && (!key.type || key.type === Scalar.Scalar.PLAIN) && merge.identify(key.value)) && ctx?.doc.schema.tags.some((tag) => tag.tag === merge.tag && tag.default);
    function addMergeToJSMap(ctx, map, value) {
      const source = resolveAliasValue(ctx, value);
      if (identity.isSeq(source))
        for (const it of source.items)
          mergeValue(ctx, map, it);
      else if (Array.isArray(source))
        for (const it of source)
          mergeValue(ctx, map, it);
      else
        mergeValue(ctx, map, source);
    }
    function mergeValue(ctx, map, value) {
      const source = resolveAliasValue(ctx, value);
      if (!identity.isMap(source))
        throw new Error("Merge sources must be maps or map aliases");
      const srcMap = source.toJSON(null, ctx, Map);
      for (const [key, value2] of srcMap) {
        if (map instanceof Map) {
          if (!map.has(key))
            map.set(key, value2);
        } else if (map instanceof Set) {
          map.add(key);
        } else if (!Object.prototype.hasOwnProperty.call(map, key)) {
          Object.defineProperty(map, key, {
            value: value2,
            writable: true,
            enumerable: true,
            configurable: true
          });
        }
      }
      return map;
    }
    function resolveAliasValue(ctx, value) {
      return ctx && identity.isAlias(value) ? value.resolve(ctx.doc, ctx) : value;
    }
    exports.addMergeToJSMap = addMergeToJSMap;
    exports.isMergeKey = isMergeKey;
    exports.merge = merge;
  }
});

// node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/nodes/addPairToJSMap.js
var require_addPairToJSMap = __commonJS({
  "node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/nodes/addPairToJSMap.js"(exports) {
    "use strict";
    var log = require_log();
    var merge = require_merge();
    var stringify = require_stringify();
    var identity = require_identity();
    var toJS = require_toJS();
    function addPairToJSMap(ctx, map, { key, value }) {
      if (identity.isNode(key) && key.addToJSMap)
        key.addToJSMap(ctx, map, value);
      else if (merge.isMergeKey(ctx, key))
        merge.addMergeToJSMap(ctx, map, value);
      else {
        const jsKey = toJS.toJS(key, "", ctx);
        if (map instanceof Map) {
          map.set(jsKey, toJS.toJS(value, jsKey, ctx));
        } else if (map instanceof Set) {
          map.add(jsKey);
        } else {
          const stringKey = stringifyKey(key, jsKey, ctx);
          const jsValue = toJS.toJS(value, stringKey, ctx);
          if (stringKey in map)
            Object.defineProperty(map, stringKey, {
              value: jsValue,
              writable: true,
              enumerable: true,
              configurable: true
            });
          else
            map[stringKey] = jsValue;
        }
      }
      return map;
    }
    function stringifyKey(key, jsKey, ctx) {
      if (jsKey === null)
        return "";
      if (typeof jsKey !== "object")
        return String(jsKey);
      if (identity.isNode(key) && ctx?.doc) {
        const strCtx = stringify.createStringifyContext(ctx.doc, {});
        strCtx.anchors = /* @__PURE__ */ new Set();
        for (const node of ctx.anchors.keys())
          strCtx.anchors.add(node.anchor);
        strCtx.inFlow = true;
        strCtx.inStringifyKey = true;
        const strKey = key.toString(strCtx);
        if (!ctx.mapKeyWarned) {
          let jsonStr = JSON.stringify(strKey);
          if (jsonStr.length > 40)
            jsonStr = jsonStr.substring(0, 36) + '..."';
          log.warn(ctx.doc.options.logLevel, `Keys with collection values will be stringified due to JS Object restrictions: ${jsonStr}. Set mapAsMap: true to use object keys.`);
          ctx.mapKeyWarned = true;
        }
        return strKey;
      }
      return JSON.stringify(jsKey);
    }
    exports.addPairToJSMap = addPairToJSMap;
  }
});

// node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/nodes/Pair.js
var require_Pair = __commonJS({
  "node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/nodes/Pair.js"(exports) {
    "use strict";
    var createNode = require_createNode();
    var stringifyPair = require_stringifyPair();
    var addPairToJSMap = require_addPairToJSMap();
    var identity = require_identity();
    function createPair(key, value, ctx) {
      const k = createNode.createNode(key, void 0, ctx);
      const v = createNode.createNode(value, void 0, ctx);
      return new Pair(k, v);
    }
    var Pair = class _Pair {
      constructor(key, value = null) {
        Object.defineProperty(this, identity.NODE_TYPE, { value: identity.PAIR });
        this.key = key;
        this.value = value;
      }
      clone(schema) {
        let { key, value } = this;
        if (identity.isNode(key))
          key = key.clone(schema);
        if (identity.isNode(value))
          value = value.clone(schema);
        return new _Pair(key, value);
      }
      toJSON(_, ctx) {
        const pair = ctx?.mapAsMap ? /* @__PURE__ */ new Map() : {};
        return addPairToJSMap.addPairToJSMap(ctx, pair, this);
      }
      toString(ctx, onComment, onChompKeep) {
        return ctx?.doc ? stringifyPair.stringifyPair(this, ctx, onComment, onChompKeep) : JSON.stringify(this);
      }
    };
    exports.Pair = Pair;
    exports.createPair = createPair;
  }
});

// node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/stringify/stringifyCollection.js
var require_stringifyCollection = __commonJS({
  "node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/stringify/stringifyCollection.js"(exports) {
    "use strict";
    var identity = require_identity();
    var stringify = require_stringify();
    var stringifyComment = require_stringifyComment();
    function stringifyCollection(collection, ctx, options) {
      const flow = ctx.inFlow ?? collection.flow;
      const stringify2 = flow ? stringifyFlowCollection : stringifyBlockCollection;
      return stringify2(collection, ctx, options);
    }
    function stringifyBlockCollection({ comment, items }, ctx, { blockItemPrefix, flowChars, itemIndent, onChompKeep, onComment }) {
      const { indent, options: { commentString } } = ctx;
      const itemCtx = Object.assign({}, ctx, { indent: itemIndent, type: null });
      let chompKeep = false;
      const lines = [];
      for (let i = 0; i < items.length; ++i) {
        const item = items[i];
        let comment2 = null;
        if (identity.isNode(item)) {
          if (!chompKeep && item.spaceBefore)
            lines.push("");
          addCommentBefore(ctx, lines, item.commentBefore, chompKeep);
          if (item.comment)
            comment2 = item.comment;
        } else if (identity.isPair(item)) {
          const ik = identity.isNode(item.key) ? item.key : null;
          if (ik) {
            if (!chompKeep && ik.spaceBefore)
              lines.push("");
            addCommentBefore(ctx, lines, ik.commentBefore, chompKeep);
          }
        }
        chompKeep = false;
        let str2 = stringify.stringify(item, itemCtx, () => comment2 = null, () => chompKeep = true);
        if (comment2)
          str2 += stringifyComment.lineComment(str2, itemIndent, commentString(comment2));
        if (chompKeep && comment2)
          chompKeep = false;
        lines.push(blockItemPrefix + str2);
      }
      let str;
      if (lines.length === 0) {
        str = flowChars.start + flowChars.end;
      } else {
        str = lines[0];
        for (let i = 1; i < lines.length; ++i) {
          const line = lines[i];
          str += line ? `
${indent}${line}` : "\n";
        }
      }
      if (comment) {
        str += "\n" + stringifyComment.indentComment(commentString(comment), indent);
        if (onComment)
          onComment();
      } else if (chompKeep && onChompKeep)
        onChompKeep();
      return str;
    }
    function stringifyFlowCollection({ items }, ctx, { flowChars, itemIndent }) {
      const { indent, indentStep, flowCollectionPadding: fcPadding, options: { commentString } } = ctx;
      itemIndent += indentStep;
      const itemCtx = Object.assign({}, ctx, {
        indent: itemIndent,
        inFlow: true,
        type: null
      });
      let reqNewline = false;
      let linesAtValue = 0;
      const lines = [];
      for (let i = 0; i < items.length; ++i) {
        const item = items[i];
        let comment = null;
        if (identity.isNode(item)) {
          if (item.spaceBefore)
            lines.push("");
          addCommentBefore(ctx, lines, item.commentBefore, false);
          if (item.comment)
            comment = item.comment;
        } else if (identity.isPair(item)) {
          const ik = identity.isNode(item.key) ? item.key : null;
          if (ik) {
            if (ik.spaceBefore)
              lines.push("");
            addCommentBefore(ctx, lines, ik.commentBefore, false);
            if (ik.comment)
              reqNewline = true;
          }
          const iv = identity.isNode(item.value) ? item.value : null;
          if (iv) {
            if (iv.comment)
              comment = iv.comment;
            if (iv.commentBefore)
              reqNewline = true;
          } else if (item.value == null && ik?.comment) {
            comment = ik.comment;
          }
        }
        if (comment)
          reqNewline = true;
        let str = stringify.stringify(item, itemCtx, () => comment = null);
        reqNewline || (reqNewline = lines.length > linesAtValue || str.includes("\n"));
        if (i < items.length - 1) {
          str += ",";
        } else if (ctx.options.trailingComma) {
          if (ctx.options.lineWidth > 0) {
            reqNewline || (reqNewline = lines.reduce((sum, line) => sum + line.length + 2, 2) + (str.length + 2) > ctx.options.lineWidth);
          }
          if (reqNewline) {
            str += ",";
          }
        }
        if (comment)
          str += stringifyComment.lineComment(str, itemIndent, commentString(comment));
        lines.push(str);
        linesAtValue = lines.length;
      }
      const { start, end } = flowChars;
      if (lines.length === 0) {
        return start + end;
      } else {
        if (!reqNewline) {
          const len = lines.reduce((sum, line) => sum + line.length + 2, 2);
          reqNewline = ctx.options.lineWidth > 0 && len > ctx.options.lineWidth;
        }
        if (reqNewline) {
          let str = start;
          for (const line of lines)
            str += line ? `
${indentStep}${indent}${line}` : "\n";
          return `${str}
${indent}${end}`;
        } else {
          return `${start}${fcPadding}${lines.join(" ")}${fcPadding}${end}`;
        }
      }
    }
    function addCommentBefore({ indent, options: { commentString } }, lines, comment, chompKeep) {
      if (comment && chompKeep)
        comment = comment.replace(/^\n+/, "");
      if (comment) {
        const ic = stringifyComment.indentComment(commentString(comment), indent);
        lines.push(ic.trimStart());
      }
    }
    exports.stringifyCollection = stringifyCollection;
  }
});

// node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/nodes/YAMLMap.js
var require_YAMLMap = __commonJS({
  "node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/nodes/YAMLMap.js"(exports) {
    "use strict";
    var stringifyCollection = require_stringifyCollection();
    var addPairToJSMap = require_addPairToJSMap();
    var Collection = require_Collection();
    var identity = require_identity();
    var Pair = require_Pair();
    var Scalar = require_Scalar();
    function findPair(items, key) {
      const k = identity.isScalar(key) ? key.value : key;
      for (const it of items) {
        if (identity.isPair(it)) {
          if (it.key === key || it.key === k)
            return it;
          if (identity.isScalar(it.key) && it.key.value === k)
            return it;
        }
      }
      return void 0;
    }
    var YAMLMap = class extends Collection.Collection {
      static get tagName() {
        return "tag:yaml.org,2002:map";
      }
      constructor(schema) {
        super(identity.MAP, schema);
        this.items = [];
      }
      /**
       * A generic collection parsing method that can be extended
       * to other node classes that inherit from YAMLMap
       */
      static from(schema, obj, ctx) {
        const { keepUndefined, replacer } = ctx;
        const map = new this(schema);
        const add = (key, value) => {
          if (typeof replacer === "function")
            value = replacer.call(obj, key, value);
          else if (Array.isArray(replacer) && !replacer.includes(key))
            return;
          if (value !== void 0 || keepUndefined)
            map.items.push(Pair.createPair(key, value, ctx));
        };
        if (obj instanceof Map) {
          for (const [key, value] of obj)
            add(key, value);
        } else if (obj && typeof obj === "object") {
          for (const key of Object.keys(obj))
            add(key, obj[key]);
        }
        if (typeof schema.sortMapEntries === "function") {
          map.items.sort(schema.sortMapEntries);
        }
        return map;
      }
      /**
       * Adds a value to the collection.
       *
       * @param overwrite - If not set `true`, using a key that is already in the
       *   collection will throw. Otherwise, overwrites the previous value.
       */
      add(pair, overwrite) {
        let _pair;
        if (identity.isPair(pair))
          _pair = pair;
        else if (!pair || typeof pair !== "object" || !("key" in pair)) {
          _pair = new Pair.Pair(pair, pair?.value);
        } else
          _pair = new Pair.Pair(pair.key, pair.value);
        const prev = findPair(this.items, _pair.key);
        const sortEntries = this.schema?.sortMapEntries;
        if (prev) {
          if (!overwrite)
            throw new Error(`Key ${_pair.key} already set`);
          if (identity.isScalar(prev.value) && Scalar.isScalarValue(_pair.value))
            prev.value.value = _pair.value;
          else
            prev.value = _pair.value;
        } else if (sortEntries) {
          const i = this.items.findIndex((item) => sortEntries(_pair, item) < 0);
          if (i === -1)
            this.items.push(_pair);
          else
            this.items.splice(i, 0, _pair);
        } else {
          this.items.push(_pair);
        }
      }
      delete(key) {
        const it = findPair(this.items, key);
        if (!it)
          return false;
        const del = this.items.splice(this.items.indexOf(it), 1);
        return del.length > 0;
      }
      get(key, keepScalar) {
        const it = findPair(this.items, key);
        const node = it?.value;
        return (!keepScalar && identity.isScalar(node) ? node.value : node) ?? void 0;
      }
      has(key) {
        return !!findPair(this.items, key);
      }
      set(key, value) {
        this.add(new Pair.Pair(key, value), true);
      }
      /**
       * @param ctx - Conversion context, originally set in Document#toJS()
       * @param {Class} Type - If set, forces the returned collection type
       * @returns Instance of Type, Map, or Object
       */
      toJSON(_, ctx, Type) {
        const map = Type ? new Type() : ctx?.mapAsMap ? /* @__PURE__ */ new Map() : {};
        if (ctx?.onCreate)
          ctx.onCreate(map);
        for (const item of this.items)
          addPairToJSMap.addPairToJSMap(ctx, map, item);
        return map;
      }
      toString(ctx, onComment, onChompKeep) {
        if (!ctx)
          return JSON.stringify(this);
        for (const item of this.items) {
          if (!identity.isPair(item))
            throw new Error(`Map items must all be pairs; found ${JSON.stringify(item)} instead`);
        }
        if (!ctx.allNullValues && this.hasAllNullValues(false))
          ctx = Object.assign({}, ctx, { allNullValues: true });
        return stringifyCollection.stringifyCollection(this, ctx, {
          blockItemPrefix: "",
          flowChars: { start: "{", end: "}" },
          itemIndent: ctx.indent || "",
          onChompKeep,
          onComment
        });
      }
    };
    exports.YAMLMap = YAMLMap;
    exports.findPair = findPair;
  }
});

// node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/schema/common/map.js
var require_map = __commonJS({
  "node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/schema/common/map.js"(exports) {
    "use strict";
    var identity = require_identity();
    var YAMLMap = require_YAMLMap();
    var map = {
      collection: "map",
      default: true,
      nodeClass: YAMLMap.YAMLMap,
      tag: "tag:yaml.org,2002:map",
      resolve(map2, onError) {
        if (!identity.isMap(map2))
          onError("Expected a mapping for this tag");
        return map2;
      },
      createNode: (schema, obj, ctx) => YAMLMap.YAMLMap.from(schema, obj, ctx)
    };
    exports.map = map;
  }
});

// node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/nodes/YAMLSeq.js
var require_YAMLSeq = __commonJS({
  "node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/nodes/YAMLSeq.js"(exports) {
    "use strict";
    var createNode = require_createNode();
    var stringifyCollection = require_stringifyCollection();
    var Collection = require_Collection();
    var identity = require_identity();
    var Scalar = require_Scalar();
    var toJS = require_toJS();
    var YAMLSeq = class extends Collection.Collection {
      static get tagName() {
        return "tag:yaml.org,2002:seq";
      }
      constructor(schema) {
        super(identity.SEQ, schema);
        this.items = [];
      }
      add(value) {
        this.items.push(value);
      }
      /**
       * Removes a value from the collection.
       *
       * `key` must contain a representation of an integer for this to succeed.
       * It may be wrapped in a `Scalar`.
       *
       * @returns `true` if the item was found and removed.
       */
      delete(key) {
        const idx = asItemIndex(key);
        if (typeof idx !== "number")
          return false;
        const del = this.items.splice(idx, 1);
        return del.length > 0;
      }
      get(key, keepScalar) {
        const idx = asItemIndex(key);
        if (typeof idx !== "number")
          return void 0;
        const it = this.items[idx];
        return !keepScalar && identity.isScalar(it) ? it.value : it;
      }
      /**
       * Checks if the collection includes a value with the key `key`.
       *
       * `key` must contain a representation of an integer for this to succeed.
       * It may be wrapped in a `Scalar`.
       */
      has(key) {
        const idx = asItemIndex(key);
        return typeof idx === "number" && idx < this.items.length;
      }
      /**
       * Sets a value in this collection. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       *
       * If `key` does not contain a representation of an integer, this will throw.
       * It may be wrapped in a `Scalar`.
       */
      set(key, value) {
        const idx = asItemIndex(key);
        if (typeof idx !== "number")
          throw new Error(`Expected a valid index, not ${key}.`);
        const prev = this.items[idx];
        if (identity.isScalar(prev) && Scalar.isScalarValue(value))
          prev.value = value;
        else
          this.items[idx] = value;
      }
      toJSON(_, ctx) {
        const seq = [];
        if (ctx?.onCreate)
          ctx.onCreate(seq);
        let i = 0;
        for (const item of this.items)
          seq.push(toJS.toJS(item, String(i++), ctx));
        return seq;
      }
      toString(ctx, onComment, onChompKeep) {
        if (!ctx)
          return JSON.stringify(this);
        return stringifyCollection.stringifyCollection(this, ctx, {
          blockItemPrefix: "- ",
          flowChars: { start: "[", end: "]" },
          itemIndent: (ctx.indent || "") + "  ",
          onChompKeep,
          onComment
        });
      }
      static from(schema, obj, ctx) {
        const { replacer } = ctx;
        const seq = new this(schema);
        if (obj && Symbol.iterator in Object(obj)) {
          let i = 0;
          for (let it of obj) {
            if (typeof replacer === "function") {
              const key = obj instanceof Set ? it : String(i++);
              it = replacer.call(obj, key, it);
            }
            seq.items.push(createNode.createNode(it, void 0, ctx));
          }
        }
        return seq;
      }
    };
    function asItemIndex(key) {
      let idx = identity.isScalar(key) ? key.value : key;
      if (idx && typeof idx === "string")
        idx = Number(idx);
      return typeof idx === "number" && Number.isInteger(idx) && idx >= 0 ? idx : null;
    }
    exports.YAMLSeq = YAMLSeq;
  }
});

// node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/schema/common/seq.js
var require_seq = __commonJS({
  "node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/schema/common/seq.js"(exports) {
    "use strict";
    var identity = require_identity();
    var YAMLSeq = require_YAMLSeq();
    var seq = {
      collection: "seq",
      default: true,
      nodeClass: YAMLSeq.YAMLSeq,
      tag: "tag:yaml.org,2002:seq",
      resolve(seq2, onError) {
        if (!identity.isSeq(seq2))
          onError("Expected a sequence for this tag");
        return seq2;
      },
      createNode: (schema, obj, ctx) => YAMLSeq.YAMLSeq.from(schema, obj, ctx)
    };
    exports.seq = seq;
  }
});

// node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/schema/common/string.js
var require_string = __commonJS({
  "node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/schema/common/string.js"(exports) {
    "use strict";
    var stringifyString = require_stringifyString();
    var string = {
      identify: (value) => typeof value === "string",
      default: true,
      tag: "tag:yaml.org,2002:str",
      resolve: (str) => str,
      stringify(item, ctx, onComment, onChompKeep) {
        ctx = Object.assign({ actualString: true }, ctx);
        return stringifyString.stringifyString(item, ctx, onComment, onChompKeep);
      }
    };
    exports.string = string;
  }
});

// node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/schema/common/null.js
var require_null = __commonJS({
  "node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/schema/common/null.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var nullTag = {
      identify: (value) => value == null,
      createNode: () => new Scalar.Scalar(null),
      default: true,
      tag: "tag:yaml.org,2002:null",
      test: /^(?:~|[Nn]ull|NULL)?$/,
      resolve: () => new Scalar.Scalar(null),
      stringify: ({ source }, ctx) => typeof source === "string" && nullTag.test.test(source) ? source : ctx.options.nullStr
    };
    exports.nullTag = nullTag;
  }
});

// node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/schema/core/bool.js
var require_bool = __commonJS({
  "node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/schema/core/bool.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var boolTag = {
      identify: (value) => typeof value === "boolean",
      default: true,
      tag: "tag:yaml.org,2002:bool",
      test: /^(?:[Tt]rue|TRUE|[Ff]alse|FALSE)$/,
      resolve: (str) => new Scalar.Scalar(str[0] === "t" || str[0] === "T"),
      stringify({ source, value }, ctx) {
        if (source && boolTag.test.test(source)) {
          const sv = source[0] === "t" || source[0] === "T";
          if (value === sv)
            return source;
        }
        return value ? ctx.options.trueStr : ctx.options.falseStr;
      }
    };
    exports.boolTag = boolTag;
  }
});

// node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/stringify/stringifyNumber.js
var require_stringifyNumber = __commonJS({
  "node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/stringify/stringifyNumber.js"(exports) {
    "use strict";
    function stringifyNumber({ format, minFractionDigits, tag, value }) {
      if (typeof value === "bigint")
        return String(value);
      const num = typeof value === "number" ? value : Number(value);
      if (!isFinite(num))
        return isNaN(num) ? ".nan" : num < 0 ? "-.inf" : ".inf";
      let n = Object.is(value, -0) ? "-0" : JSON.stringify(value);
      if (!format && minFractionDigits && (!tag || tag === "tag:yaml.org,2002:float") && /^-?\d/.test(n) && !n.includes("e")) {
        let i = n.indexOf(".");
        if (i < 0) {
          i = n.length;
          n += ".";
        }
        let d = minFractionDigits - (n.length - i - 1);
        while (d-- > 0)
          n += "0";
      }
      return n;
    }
    exports.stringifyNumber = stringifyNumber;
  }
});

// node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/schema/core/float.js
var require_float = __commonJS({
  "node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/schema/core/float.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var stringifyNumber = require_stringifyNumber();
    var floatNaN = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$/,
      resolve: (str) => str.slice(-3).toLowerCase() === "nan" ? NaN : str[0] === "-" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY,
      stringify: stringifyNumber.stringifyNumber
    };
    var floatExp = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      format: "EXP",
      test: /^[-+]?(?:\.[0-9]+|[0-9]+(?:\.[0-9]*)?)[eE][-+]?[0-9]+$/,
      resolve: (str) => parseFloat(str),
      stringify(node) {
        const num = Number(node.value);
        return isFinite(num) ? num.toExponential() : stringifyNumber.stringifyNumber(node);
      }
    };
    var float = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^[-+]?(?:\.[0-9]+|[0-9]+\.[0-9]*)$/,
      resolve(str) {
        const node = new Scalar.Scalar(parseFloat(str));
        const dot = str.indexOf(".");
        if (dot !== -1 && str[str.length - 1] === "0")
          node.minFractionDigits = str.length - dot - 1;
        return node;
      },
      stringify: stringifyNumber.stringifyNumber
    };
    exports.float = float;
    exports.floatExp = floatExp;
    exports.floatNaN = floatNaN;
  }
});

// node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/schema/core/int.js
var require_int = __commonJS({
  "node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/schema/core/int.js"(exports) {
    "use strict";
    var stringifyNumber = require_stringifyNumber();
    var intIdentify = (value) => typeof value === "bigint" || Number.isInteger(value);
    var intResolve = (str, offset, radix, { intAsBigInt }) => intAsBigInt ? BigInt(str) : parseInt(str.substring(offset), radix);
    function intStringify(node, radix, prefix) {
      const { value } = node;
      if (intIdentify(value) && value >= 0)
        return prefix + value.toString(radix);
      return stringifyNumber.stringifyNumber(node);
    }
    var intOct = {
      identify: (value) => intIdentify(value) && value >= 0,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "OCT",
      test: /^0o[0-7]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 8, opt),
      stringify: (node) => intStringify(node, 8, "0o")
    };
    var int = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      test: /^[-+]?[0-9]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 0, 10, opt),
      stringify: stringifyNumber.stringifyNumber
    };
    var intHex = {
      identify: (value) => intIdentify(value) && value >= 0,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "HEX",
      test: /^0x[0-9a-fA-F]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 16, opt),
      stringify: (node) => intStringify(node, 16, "0x")
    };
    exports.int = int;
    exports.intHex = intHex;
    exports.intOct = intOct;
  }
});

// node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/schema/core/schema.js
var require_schema = __commonJS({
  "node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/schema/core/schema.js"(exports) {
    "use strict";
    var map = require_map();
    var _null = require_null();
    var seq = require_seq();
    var string = require_string();
    var bool = require_bool();
    var float = require_float();
    var int = require_int();
    var schema = [
      map.map,
      seq.seq,
      string.string,
      _null.nullTag,
      bool.boolTag,
      int.intOct,
      int.int,
      int.intHex,
      float.floatNaN,
      float.floatExp,
      float.float
    ];
    exports.schema = schema;
  }
});

// node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/schema/json/schema.js
var require_schema2 = __commonJS({
  "node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/schema/json/schema.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var map = require_map();
    var seq = require_seq();
    function intIdentify(value) {
      return typeof value === "bigint" || Number.isInteger(value);
    }
    var stringifyJSON = ({ value }) => JSON.stringify(value);
    var jsonScalars = [
      {
        identify: (value) => typeof value === "string",
        default: true,
        tag: "tag:yaml.org,2002:str",
        resolve: (str) => str,
        stringify: stringifyJSON
      },
      {
        identify: (value) => value == null,
        createNode: () => new Scalar.Scalar(null),
        default: true,
        tag: "tag:yaml.org,2002:null",
        test: /^null$/,
        resolve: () => null,
        stringify: stringifyJSON
      },
      {
        identify: (value) => typeof value === "boolean",
        default: true,
        tag: "tag:yaml.org,2002:bool",
        test: /^true$|^false$/,
        resolve: (str) => str === "true",
        stringify: stringifyJSON
      },
      {
        identify: intIdentify,
        default: true,
        tag: "tag:yaml.org,2002:int",
        test: /^-?(?:0|[1-9][0-9]*)$/,
        resolve: (str, _onError, { intAsBigInt }) => intAsBigInt ? BigInt(str) : parseInt(str, 10),
        stringify: ({ value }) => intIdentify(value) ? value.toString() : JSON.stringify(value)
      },
      {
        identify: (value) => typeof value === "number",
        default: true,
        tag: "tag:yaml.org,2002:float",
        test: /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]*)?(?:[eE][-+]?[0-9]+)?$/,
        resolve: (str) => parseFloat(str),
        stringify: stringifyJSON
      }
    ];
    var jsonError = {
      default: true,
      tag: "",
      test: /^/,
      resolve(str, onError) {
        onError(`Unresolved plain scalar ${JSON.stringify(str)}`);
        return str;
      }
    };
    var schema = [map.map, seq.seq].concat(jsonScalars, jsonError);
    exports.schema = schema;
  }
});

// node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/schema/yaml-1.1/binary.js
var require_binary = __commonJS({
  "node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/schema/yaml-1.1/binary.js"(exports) {
    "use strict";
    var node_buffer = __require("buffer");
    var Scalar = require_Scalar();
    var stringifyString = require_stringifyString();
    var binary = {
      identify: (value) => value instanceof Uint8Array,
      // Buffer inherits from Uint8Array
      default: false,
      tag: "tag:yaml.org,2002:binary",
      /**
       * Returns a Buffer in node and an Uint8Array in browsers
       *
       * To use the resulting buffer as an image, you'll want to do something like:
       *
       *   const blob = new Blob([buffer], { type: 'image/jpeg' })
       *   document.querySelector('#photo').src = URL.createObjectURL(blob)
       */
      resolve(src, onError) {
        if (typeof node_buffer.Buffer === "function") {
          return node_buffer.Buffer.from(src, "base64");
        } else if (typeof atob === "function") {
          const str = atob(src.replace(/[\n\r]/g, ""));
          const buffer = new Uint8Array(str.length);
          for (let i = 0; i < str.length; ++i)
            buffer[i] = str.charCodeAt(i);
          return buffer;
        } else {
          onError("This environment does not support reading binary tags; either Buffer or atob is required");
          return src;
        }
      },
      stringify({ comment, type, value }, ctx, onComment, onChompKeep) {
        if (!value)
          return "";
        const buf = value;
        let str;
        if (typeof node_buffer.Buffer === "function") {
          str = buf instanceof node_buffer.Buffer ? buf.toString("base64") : node_buffer.Buffer.from(buf.buffer).toString("base64");
        } else if (typeof btoa === "function") {
          let s = "";
          for (let i = 0; i < buf.length; ++i)
            s += String.fromCharCode(buf[i]);
          str = btoa(s);
        } else {
          throw new Error("This environment does not support writing binary tags; either Buffer or btoa is required");
        }
        type ?? (type = Scalar.Scalar.BLOCK_LITERAL);
        if (type !== Scalar.Scalar.QUOTE_DOUBLE) {
          const lineWidth = Math.max(ctx.options.lineWidth - ctx.indent.length, ctx.options.minContentWidth);
          const n = Math.ceil(str.length / lineWidth);
          const lines = new Array(n);
          for (let i = 0, o = 0; i < n; ++i, o += lineWidth) {
            lines[i] = str.substr(o, lineWidth);
          }
          str = lines.join(type === Scalar.Scalar.BLOCK_LITERAL ? "\n" : " ");
        }
        return stringifyString.stringifyString({ comment, type, value: str }, ctx, onComment, onChompKeep);
      }
    };
    exports.binary = binary;
  }
});

// node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/schema/yaml-1.1/pairs.js
var require_pairs = __commonJS({
  "node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/schema/yaml-1.1/pairs.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Pair = require_Pair();
    var Scalar = require_Scalar();
    var YAMLSeq = require_YAMLSeq();
    function resolvePairs(seq, onError) {
      if (identity.isSeq(seq)) {
        for (let i = 0; i < seq.items.length; ++i) {
          let item = seq.items[i];
          if (identity.isPair(item))
            continue;
          else if (identity.isMap(item)) {
            if (item.items.length > 1)
              onError("Each pair must have its own sequence indicator");
            const pair = item.items[0] || new Pair.Pair(new Scalar.Scalar(null));
            if (item.commentBefore)
              pair.key.commentBefore = pair.key.commentBefore ? `${item.commentBefore}
${pair.key.commentBefore}` : item.commentBefore;
            if (item.comment) {
              const cn = pair.value ?? pair.key;
              cn.comment = cn.comment ? `${item.comment}
${cn.comment}` : item.comment;
            }
            item = pair;
          }
          seq.items[i] = identity.isPair(item) ? item : new Pair.Pair(item);
        }
      } else
        onError("Expected a sequence for this tag");
      return seq;
    }
    function createPairs(schema, iterable, ctx) {
      const { replacer } = ctx;
      const pairs2 = new YAMLSeq.YAMLSeq(schema);
      pairs2.tag = "tag:yaml.org,2002:pairs";
      let i = 0;
      if (iterable && Symbol.iterator in Object(iterable))
        for (let it of iterable) {
          if (typeof replacer === "function")
            it = replacer.call(iterable, String(i++), it);
          let key, value;
          if (Array.isArray(it)) {
            if (it.length === 2) {
              key = it[0];
              value = it[1];
            } else
              throw new TypeError(`Expected [key, value] tuple: ${it}`);
          } else if (it && it instanceof Object) {
            const keys = Object.keys(it);
            if (keys.length === 1) {
              key = keys[0];
              value = it[key];
            } else {
              throw new TypeError(`Expected tuple with one key, not ${keys.length} keys`);
            }
          } else {
            key = it;
          }
          pairs2.items.push(Pair.createPair(key, value, ctx));
        }
      return pairs2;
    }
    var pairs = {
      collection: "seq",
      default: false,
      tag: "tag:yaml.org,2002:pairs",
      resolve: resolvePairs,
      createNode: createPairs
    };
    exports.createPairs = createPairs;
    exports.pairs = pairs;
    exports.resolvePairs = resolvePairs;
  }
});

// node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/schema/yaml-1.1/omap.js
var require_omap = __commonJS({
  "node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/schema/yaml-1.1/omap.js"(exports) {
    "use strict";
    var identity = require_identity();
    var toJS = require_toJS();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var pairs = require_pairs();
    var YAMLOMap = class _YAMLOMap extends YAMLSeq.YAMLSeq {
      constructor() {
        super();
        this.add = YAMLMap.YAMLMap.prototype.add.bind(this);
        this.delete = YAMLMap.YAMLMap.prototype.delete.bind(this);
        this.get = YAMLMap.YAMLMap.prototype.get.bind(this);
        this.has = YAMLMap.YAMLMap.prototype.has.bind(this);
        this.set = YAMLMap.YAMLMap.prototype.set.bind(this);
        this.tag = _YAMLOMap.tag;
      }
      /**
       * If `ctx` is given, the return type is actually `Map<unknown, unknown>`,
       * but TypeScript won't allow widening the signature of a child method.
       */
      toJSON(_, ctx) {
        if (!ctx)
          return super.toJSON(_);
        const map = /* @__PURE__ */ new Map();
        if (ctx?.onCreate)
          ctx.onCreate(map);
        for (const pair of this.items) {
          let key, value;
          if (identity.isPair(pair)) {
            key = toJS.toJS(pair.key, "", ctx);
            value = toJS.toJS(pair.value, key, ctx);
          } else {
            key = toJS.toJS(pair, "", ctx);
          }
          if (map.has(key))
            throw new Error("Ordered maps must not include duplicate keys");
          map.set(key, value);
        }
        return map;
      }
      static from(schema, iterable, ctx) {
        const pairs$1 = pairs.createPairs(schema, iterable, ctx);
        const omap2 = new this();
        omap2.items = pairs$1.items;
        return omap2;
      }
    };
    YAMLOMap.tag = "tag:yaml.org,2002:omap";
    var omap = {
      collection: "seq",
      identify: (value) => value instanceof Map,
      nodeClass: YAMLOMap,
      default: false,
      tag: "tag:yaml.org,2002:omap",
      resolve(seq, onError) {
        const pairs$1 = pairs.resolvePairs(seq, onError);
        const seenKeys = [];
        for (const { key } of pairs$1.items) {
          if (identity.isScalar(key)) {
            if (seenKeys.includes(key.value)) {
              onError(`Ordered maps must not include duplicate keys: ${key.value}`);
            } else {
              seenKeys.push(key.value);
            }
          }
        }
        return Object.assign(new YAMLOMap(), pairs$1);
      },
      createNode: (schema, iterable, ctx) => YAMLOMap.from(schema, iterable, ctx)
    };
    exports.YAMLOMap = YAMLOMap;
    exports.omap = omap;
  }
});

// node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/schema/yaml-1.1/bool.js
var require_bool2 = __commonJS({
  "node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/schema/yaml-1.1/bool.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    function boolStringify({ value, source }, ctx) {
      const boolObj = value ? trueTag : falseTag;
      if (source && boolObj.test.test(source))
        return source;
      return value ? ctx.options.trueStr : ctx.options.falseStr;
    }
    var trueTag = {
      identify: (value) => value === true,
      default: true,
      tag: "tag:yaml.org,2002:bool",
      test: /^(?:Y|y|[Yy]es|YES|[Tt]rue|TRUE|[Oo]n|ON)$/,
      resolve: () => new Scalar.Scalar(true),
      stringify: boolStringify
    };
    var falseTag = {
      identify: (value) => value === false,
      default: true,
      tag: "tag:yaml.org,2002:bool",
      test: /^(?:N|n|[Nn]o|NO|[Ff]alse|FALSE|[Oo]ff|OFF)$/,
      resolve: () => new Scalar.Scalar(false),
      stringify: boolStringify
    };
    exports.falseTag = falseTag;
    exports.trueTag = trueTag;
  }
});

// node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/schema/yaml-1.1/float.js
var require_float2 = __commonJS({
  "node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/schema/yaml-1.1/float.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var stringifyNumber = require_stringifyNumber();
    var floatNaN = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$/,
      resolve: (str) => str.slice(-3).toLowerCase() === "nan" ? NaN : str[0] === "-" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY,
      stringify: stringifyNumber.stringifyNumber
    };
    var floatExp = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      format: "EXP",
      test: /^[-+]?(?:[0-9][0-9_]*)?(?:\.[0-9_]*)?[eE][-+]?[0-9]+$/,
      resolve: (str) => parseFloat(str.replace(/_/g, "")),
      stringify(node) {
        const num = Number(node.value);
        return isFinite(num) ? num.toExponential() : stringifyNumber.stringifyNumber(node);
      }
    };
    var float = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^[-+]?(?:[0-9][0-9_]*)?\.[0-9_]*$/,
      resolve(str) {
        const node = new Scalar.Scalar(parseFloat(str.replace(/_/g, "")));
        const dot = str.indexOf(".");
        if (dot !== -1) {
          const f = str.substring(dot + 1).replace(/_/g, "");
          if (f[f.length - 1] === "0")
            node.minFractionDigits = f.length;
        }
        return node;
      },
      stringify: stringifyNumber.stringifyNumber
    };
    exports.float = float;
    exports.floatExp = floatExp;
    exports.floatNaN = floatNaN;
  }
});

// node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/schema/yaml-1.1/int.js
var require_int2 = __commonJS({
  "node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/schema/yaml-1.1/int.js"(exports) {
    "use strict";
    var stringifyNumber = require_stringifyNumber();
    var intIdentify = (value) => typeof value === "bigint" || Number.isInteger(value);
    function intResolve(str, offset, radix, { intAsBigInt }) {
      const sign = str[0];
      if (sign === "-" || sign === "+")
        offset += 1;
      str = str.substring(offset).replace(/_/g, "");
      if (intAsBigInt) {
        switch (radix) {
          case 2:
            str = `0b${str}`;
            break;
          case 8:
            str = `0o${str}`;
            break;
          case 16:
            str = `0x${str}`;
            break;
        }
        const n2 = BigInt(str);
        return sign === "-" ? BigInt(-1) * n2 : n2;
      }
      const n = parseInt(str, radix);
      return sign === "-" ? -1 * n : n;
    }
    function intStringify(node, radix, prefix) {
      const { value } = node;
      if (intIdentify(value)) {
        const str = value.toString(radix);
        return value < 0 ? "-" + prefix + str.substr(1) : prefix + str;
      }
      return stringifyNumber.stringifyNumber(node);
    }
    var intBin = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "BIN",
      test: /^[-+]?0b[0-1_]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 2, opt),
      stringify: (node) => intStringify(node, 2, "0b")
    };
    var intOct = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "OCT",
      test: /^[-+]?0[0-7_]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 1, 8, opt),
      stringify: (node) => intStringify(node, 8, "0")
    };
    var int = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      test: /^[-+]?[0-9][0-9_]*$/,
      resolve: (str, _onError, opt) => intResolve(str, 0, 10, opt),
      stringify: stringifyNumber.stringifyNumber
    };
    var intHex = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "HEX",
      test: /^[-+]?0x[0-9a-fA-F_]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 16, opt),
      stringify: (node) => intStringify(node, 16, "0x")
    };
    exports.int = int;
    exports.intBin = intBin;
    exports.intHex = intHex;
    exports.intOct = intOct;
  }
});

// node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/schema/yaml-1.1/set.js
var require_set = __commonJS({
  "node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/schema/yaml-1.1/set.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Pair = require_Pair();
    var YAMLMap = require_YAMLMap();
    var YAMLSet = class _YAMLSet extends YAMLMap.YAMLMap {
      constructor(schema) {
        super(schema);
        this.tag = _YAMLSet.tag;
      }
      add(key) {
        let pair;
        if (identity.isPair(key))
          pair = key;
        else if (key && typeof key === "object" && "key" in key && "value" in key && key.value === null)
          pair = new Pair.Pair(key.key, null);
        else
          pair = new Pair.Pair(key, null);
        const prev = YAMLMap.findPair(this.items, pair.key);
        if (!prev)
          this.items.push(pair);
      }
      /**
       * If `keepPair` is `true`, returns the Pair matching `key`.
       * Otherwise, returns the value of that Pair's key.
       */
      get(key, keepPair) {
        const pair = YAMLMap.findPair(this.items, key);
        return !keepPair && identity.isPair(pair) ? identity.isScalar(pair.key) ? pair.key.value : pair.key : pair;
      }
      set(key, value) {
        if (typeof value !== "boolean")
          throw new Error(`Expected boolean value for set(key, value) in a YAML set, not ${typeof value}`);
        const prev = YAMLMap.findPair(this.items, key);
        if (prev && !value) {
          this.items.splice(this.items.indexOf(prev), 1);
        } else if (!prev && value) {
          this.items.push(new Pair.Pair(key));
        }
      }
      toJSON(_, ctx) {
        return super.toJSON(_, ctx, Set);
      }
      toString(ctx, onComment, onChompKeep) {
        if (!ctx)
          return JSON.stringify(this);
        if (this.hasAllNullValues(true))
          return super.toString(Object.assign({}, ctx, { allNullValues: true }), onComment, onChompKeep);
        else
          throw new Error("Set items must all have null values");
      }
      static from(schema, iterable, ctx) {
        const { replacer } = ctx;
        const set2 = new this(schema);
        if (iterable && Symbol.iterator in Object(iterable))
          for (let value of iterable) {
            if (typeof replacer === "function")
              value = replacer.call(iterable, value, value);
            set2.items.push(Pair.createPair(value, null, ctx));
          }
        return set2;
      }
    };
    YAMLSet.tag = "tag:yaml.org,2002:set";
    var set = {
      collection: "map",
      identify: (value) => value instanceof Set,
      nodeClass: YAMLSet,
      default: false,
      tag: "tag:yaml.org,2002:set",
      createNode: (schema, iterable, ctx) => YAMLSet.from(schema, iterable, ctx),
      resolve(map, onError) {
        if (identity.isMap(map)) {
          if (map.hasAllNullValues(true))
            return Object.assign(new YAMLSet(), map);
          else
            onError("Set items must all have null values");
        } else
          onError("Expected a mapping for this tag");
        return map;
      }
    };
    exports.YAMLSet = YAMLSet;
    exports.set = set;
  }
});

// node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/schema/yaml-1.1/timestamp.js
var require_timestamp = __commonJS({
  "node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/schema/yaml-1.1/timestamp.js"(exports) {
    "use strict";
    var stringifyNumber = require_stringifyNumber();
    function parseSexagesimal(str, asBigInt) {
      const sign = str[0];
      const parts = sign === "-" || sign === "+" ? str.substring(1) : str;
      const num = (n) => asBigInt ? BigInt(n) : Number(n);
      const res = parts.replace(/_/g, "").split(":").reduce((res2, p) => res2 * num(60) + num(p), num(0));
      return sign === "-" ? num(-1) * res : res;
    }
    function stringifySexagesimal(node) {
      let { value } = node;
      let num = (n) => n;
      if (typeof value === "bigint")
        num = (n) => BigInt(n);
      else if (isNaN(value) || !isFinite(value))
        return stringifyNumber.stringifyNumber(node);
      let sign = "";
      if (value < 0) {
        sign = "-";
        value *= num(-1);
      }
      const _60 = num(60);
      const parts = [value % _60];
      if (value < 60) {
        parts.unshift(0);
      } else {
        value = (value - parts[0]) / _60;
        parts.unshift(value % _60);
        if (value >= 60) {
          value = (value - parts[0]) / _60;
          parts.unshift(value);
        }
      }
      return sign + parts.map((n) => String(n).padStart(2, "0")).join(":").replace(/000000\d*$/, "");
    }
    var intTime = {
      identify: (value) => typeof value === "bigint" || Number.isInteger(value),
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "TIME",
      test: /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+$/,
      resolve: (str, _onError, { intAsBigInt }) => parseSexagesimal(str, intAsBigInt),
      stringify: stringifySexagesimal
    };
    var floatTime = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      format: "TIME",
      test: /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+\.[0-9_]*$/,
      resolve: (str) => parseSexagesimal(str, false),
      stringify: stringifySexagesimal
    };
    var timestamp = {
      identify: (value) => value instanceof Date,
      default: true,
      tag: "tag:yaml.org,2002:timestamp",
      // If the time zone is omitted, the timestamp is assumed to be specified in UTC. The time part
      // may be omitted altogether, resulting in a date format. In such a case, the time part is
      // assumed to be 00:00:00Z (start of day, UTC).
      test: RegExp("^([0-9]{4})-([0-9]{1,2})-([0-9]{1,2})(?:(?:t|T|[ \\t]+)([0-9]{1,2}):([0-9]{1,2}):([0-9]{1,2}(\\.[0-9]+)?)(?:[ \\t]*(Z|[-+][012]?[0-9](?::[0-9]{2})?))?)?$"),
      resolve(str) {
        const match = str.match(timestamp.test);
        if (!match)
          throw new Error("!!timestamp expects a date, starting with yyyy-mm-dd");
        const [, year, month, day, hour, minute, second] = match.map(Number);
        const millisec = match[7] ? Number((match[7] + "00").substr(1, 3)) : 0;
        let date = Date.UTC(year, month - 1, day, hour || 0, minute || 0, second || 0, millisec);
        const tz = match[8];
        if (tz && tz !== "Z") {
          let d = parseSexagesimal(tz, false);
          if (Math.abs(d) < 30)
            d *= 60;
          date -= 6e4 * d;
        }
        return new Date(date);
      },
      stringify: ({ value }) => value?.toISOString().replace(/(T00:00:00)?\.000Z$/, "") ?? ""
    };
    exports.floatTime = floatTime;
    exports.intTime = intTime;
    exports.timestamp = timestamp;
  }
});

// node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/schema/yaml-1.1/schema.js
var require_schema3 = __commonJS({
  "node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/schema/yaml-1.1/schema.js"(exports) {
    "use strict";
    var map = require_map();
    var _null = require_null();
    var seq = require_seq();
    var string = require_string();
    var binary = require_binary();
    var bool = require_bool2();
    var float = require_float2();
    var int = require_int2();
    var merge = require_merge();
    var omap = require_omap();
    var pairs = require_pairs();
    var set = require_set();
    var timestamp = require_timestamp();
    var schema = [
      map.map,
      seq.seq,
      string.string,
      _null.nullTag,
      bool.trueTag,
      bool.falseTag,
      int.intBin,
      int.intOct,
      int.int,
      int.intHex,
      float.floatNaN,
      float.floatExp,
      float.float,
      binary.binary,
      merge.merge,
      omap.omap,
      pairs.pairs,
      set.set,
      timestamp.intTime,
      timestamp.floatTime,
      timestamp.timestamp
    ];
    exports.schema = schema;
  }
});

// node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/schema/tags.js
var require_tags = __commonJS({
  "node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/schema/tags.js"(exports) {
    "use strict";
    var map = require_map();
    var _null = require_null();
    var seq = require_seq();
    var string = require_string();
    var bool = require_bool();
    var float = require_float();
    var int = require_int();
    var schema = require_schema();
    var schema$1 = require_schema2();
    var binary = require_binary();
    var merge = require_merge();
    var omap = require_omap();
    var pairs = require_pairs();
    var schema$2 = require_schema3();
    var set = require_set();
    var timestamp = require_timestamp();
    var schemas = /* @__PURE__ */ new Map([
      ["core", schema.schema],
      ["failsafe", [map.map, seq.seq, string.string]],
      ["json", schema$1.schema],
      ["yaml11", schema$2.schema],
      ["yaml-1.1", schema$2.schema]
    ]);
    var tagsByName = {
      binary: binary.binary,
      bool: bool.boolTag,
      float: float.float,
      floatExp: float.floatExp,
      floatNaN: float.floatNaN,
      floatTime: timestamp.floatTime,
      int: int.int,
      intHex: int.intHex,
      intOct: int.intOct,
      intTime: timestamp.intTime,
      map: map.map,
      merge: merge.merge,
      null: _null.nullTag,
      omap: omap.omap,
      pairs: pairs.pairs,
      seq: seq.seq,
      set: set.set,
      timestamp: timestamp.timestamp
    };
    var coreKnownTags = {
      "tag:yaml.org,2002:binary": binary.binary,
      "tag:yaml.org,2002:merge": merge.merge,
      "tag:yaml.org,2002:omap": omap.omap,
      "tag:yaml.org,2002:pairs": pairs.pairs,
      "tag:yaml.org,2002:set": set.set,
      "tag:yaml.org,2002:timestamp": timestamp.timestamp
    };
    function getTags(customTags, schemaName, addMergeTag) {
      const schemaTags = schemas.get(schemaName);
      if (schemaTags && !customTags) {
        return addMergeTag && !schemaTags.includes(merge.merge) ? schemaTags.concat(merge.merge) : schemaTags.slice();
      }
      let tags = schemaTags;
      if (!tags) {
        if (Array.isArray(customTags))
          tags = [];
        else {
          const keys = Array.from(schemas.keys()).filter((key) => key !== "yaml11").map((key) => JSON.stringify(key)).join(", ");
          throw new Error(`Unknown schema "${schemaName}"; use one of ${keys} or define customTags array`);
        }
      }
      if (Array.isArray(customTags)) {
        for (const tag of customTags)
          tags = tags.concat(tag);
      } else if (typeof customTags === "function") {
        tags = customTags(tags.slice());
      }
      if (addMergeTag)
        tags = tags.concat(merge.merge);
      return tags.reduce((tags2, tag) => {
        const tagObj = typeof tag === "string" ? tagsByName[tag] : tag;
        if (!tagObj) {
          const tagName = JSON.stringify(tag);
          const keys = Object.keys(tagsByName).map((key) => JSON.stringify(key)).join(", ");
          throw new Error(`Unknown custom tag ${tagName}; use one of ${keys}`);
        }
        if (!tags2.includes(tagObj))
          tags2.push(tagObj);
        return tags2;
      }, []);
    }
    exports.coreKnownTags = coreKnownTags;
    exports.getTags = getTags;
  }
});

// node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/schema/Schema.js
var require_Schema = __commonJS({
  "node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/schema/Schema.js"(exports) {
    "use strict";
    var identity = require_identity();
    var map = require_map();
    var seq = require_seq();
    var string = require_string();
    var tags = require_tags();
    var sortMapEntriesByKey = (a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
    var Schema = class _Schema {
      constructor({ compat, customTags, merge, resolveKnownTags, schema, sortMapEntries, toStringDefaults }) {
        this.compat = Array.isArray(compat) ? tags.getTags(compat, "compat") : compat ? tags.getTags(null, compat) : null;
        this.name = typeof schema === "string" && schema || "core";
        this.knownTags = resolveKnownTags ? tags.coreKnownTags : {};
        this.tags = tags.getTags(customTags, this.name, merge);
        this.toStringOptions = toStringDefaults ?? null;
        Object.defineProperty(this, identity.MAP, { value: map.map });
        Object.defineProperty(this, identity.SCALAR, { value: string.string });
        Object.defineProperty(this, identity.SEQ, { value: seq.seq });
        this.sortMapEntries = typeof sortMapEntries === "function" ? sortMapEntries : sortMapEntries === true ? sortMapEntriesByKey : null;
      }
      clone() {
        const copy = Object.create(_Schema.prototype, Object.getOwnPropertyDescriptors(this));
        copy.tags = this.tags.slice();
        return copy;
      }
    };
    exports.Schema = Schema;
  }
});

// node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/stringify/stringifyDocument.js
var require_stringifyDocument = __commonJS({
  "node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/stringify/stringifyDocument.js"(exports) {
    "use strict";
    var identity = require_identity();
    var stringify = require_stringify();
    var stringifyComment = require_stringifyComment();
    function stringifyDocument(doc, options) {
      const lines = [];
      let hasDirectives = options.directives === true;
      if (options.directives !== false && doc.directives) {
        const dir = doc.directives.toString(doc);
        if (dir) {
          lines.push(dir);
          hasDirectives = true;
        } else if (doc.directives.docStart)
          hasDirectives = true;
      }
      if (hasDirectives)
        lines.push("---");
      const ctx = stringify.createStringifyContext(doc, options);
      const { commentString } = ctx.options;
      if (doc.commentBefore) {
        if (lines.length !== 1)
          lines.unshift("");
        const cs = commentString(doc.commentBefore);
        lines.unshift(stringifyComment.indentComment(cs, ""));
      }
      let chompKeep = false;
      let contentComment = null;
      if (doc.contents) {
        if (identity.isNode(doc.contents)) {
          if (doc.contents.spaceBefore && hasDirectives)
            lines.push("");
          if (doc.contents.commentBefore) {
            const cs = commentString(doc.contents.commentBefore);
            lines.push(stringifyComment.indentComment(cs, ""));
          }
          ctx.forceBlockIndent = !!doc.comment;
          contentComment = doc.contents.comment;
        }
        const onChompKeep = contentComment ? void 0 : () => chompKeep = true;
        let body = stringify.stringify(doc.contents, ctx, () => contentComment = null, onChompKeep);
        if (contentComment)
          body += stringifyComment.lineComment(body, "", commentString(contentComment));
        if ((body[0] === "|" || body[0] === ">") && lines[lines.length - 1] === "---") {
          lines[lines.length - 1] = `--- ${body}`;
        } else
          lines.push(body);
      } else {
        lines.push(stringify.stringify(doc.contents, ctx));
      }
      if (doc.directives?.docEnd) {
        if (doc.comment) {
          const cs = commentString(doc.comment);
          if (cs.includes("\n")) {
            lines.push("...");
            lines.push(stringifyComment.indentComment(cs, ""));
          } else {
            lines.push(`... ${cs}`);
          }
        } else {
          lines.push("...");
        }
      } else {
        let dc = doc.comment;
        if (dc && chompKeep)
          dc = dc.replace(/^\n+/, "");
        if (dc) {
          if ((!chompKeep || contentComment) && lines[lines.length - 1] !== "")
            lines.push("");
          lines.push(stringifyComment.indentComment(commentString(dc), ""));
        }
      }
      return lines.join("\n") + "\n";
    }
    exports.stringifyDocument = stringifyDocument;
  }
});

// node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/doc/Document.js
var require_Document = __commonJS({
  "node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/doc/Document.js"(exports) {
    "use strict";
    var Alias = require_Alias();
    var Collection = require_Collection();
    var identity = require_identity();
    var Pair = require_Pair();
    var toJS = require_toJS();
    var Schema = require_Schema();
    var stringifyDocument = require_stringifyDocument();
    var anchors = require_anchors();
    var applyReviver = require_applyReviver();
    var createNode = require_createNode();
    var directives = require_directives();
    var Document = class _Document {
      constructor(value, replacer, options) {
        this.commentBefore = null;
        this.comment = null;
        this.errors = [];
        this.warnings = [];
        Object.defineProperty(this, identity.NODE_TYPE, { value: identity.DOC });
        let _replacer = null;
        if (typeof replacer === "function" || Array.isArray(replacer)) {
          _replacer = replacer;
        } else if (options === void 0 && replacer) {
          options = replacer;
          replacer = void 0;
        }
        const opt = Object.assign({
          intAsBigInt: false,
          keepSourceTokens: false,
          logLevel: "warn",
          prettyErrors: true,
          strict: true,
          stringKeys: false,
          uniqueKeys: true,
          version: "1.2"
        }, options);
        this.options = opt;
        let { version } = opt;
        if (options?._directives) {
          this.directives = options._directives.atDocument();
          if (this.directives.yaml.explicit)
            version = this.directives.yaml.version;
        } else
          this.directives = new directives.Directives({ version });
        this.setSchema(version, options);
        this.contents = value === void 0 ? null : this.createNode(value, _replacer, options);
      }
      /**
       * Create a deep copy of this Document and its contents.
       *
       * Custom Node values that inherit from `Object` still refer to their original instances.
       */
      clone() {
        const copy = Object.create(_Document.prototype, {
          [identity.NODE_TYPE]: { value: identity.DOC }
        });
        copy.commentBefore = this.commentBefore;
        copy.comment = this.comment;
        copy.errors = this.errors.slice();
        copy.warnings = this.warnings.slice();
        copy.options = Object.assign({}, this.options);
        if (this.directives)
          copy.directives = this.directives.clone();
        copy.schema = this.schema.clone();
        copy.contents = identity.isNode(this.contents) ? this.contents.clone(copy.schema) : this.contents;
        if (this.range)
          copy.range = this.range.slice();
        return copy;
      }
      /** Adds a value to the document. */
      add(value) {
        if (assertCollection(this.contents))
          this.contents.add(value);
      }
      /** Adds a value to the document. */
      addIn(path4, value) {
        if (assertCollection(this.contents))
          this.contents.addIn(path4, value);
      }
      /**
       * Create a new `Alias` node, ensuring that the target `node` has the required anchor.
       *
       * If `node` already has an anchor, `name` is ignored.
       * Otherwise, the `node.anchor` value will be set to `name`,
       * or if an anchor with that name is already present in the document,
       * `name` will be used as a prefix for a new unique anchor.
       * If `name` is undefined, the generated anchor will use 'a' as a prefix.
       */
      createAlias(node, name) {
        if (!node.anchor) {
          const prev = anchors.anchorNames(this);
          node.anchor = // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          !name || prev.has(name) ? anchors.findNewAnchor(name || "a", prev) : name;
        }
        return new Alias.Alias(node.anchor);
      }
      createNode(value, replacer, options) {
        let _replacer = void 0;
        if (typeof replacer === "function") {
          value = replacer.call({ "": value }, "", value);
          _replacer = replacer;
        } else if (Array.isArray(replacer)) {
          const keyToStr = (v) => typeof v === "number" || v instanceof String || v instanceof Number;
          const asStr = replacer.filter(keyToStr).map(String);
          if (asStr.length > 0)
            replacer = replacer.concat(asStr);
          _replacer = replacer;
        } else if (options === void 0 && replacer) {
          options = replacer;
          replacer = void 0;
        }
        const { aliasDuplicateObjects, anchorPrefix, flow, keepUndefined, onTagObj, tag } = options ?? {};
        const { onAnchor, setAnchors, sourceObjects } = anchors.createNodeAnchors(
          this,
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          anchorPrefix || "a"
        );
        const ctx = {
          aliasDuplicateObjects: aliasDuplicateObjects ?? true,
          keepUndefined: keepUndefined ?? false,
          onAnchor,
          onTagObj,
          replacer: _replacer,
          schema: this.schema,
          sourceObjects
        };
        const node = createNode.createNode(value, tag, ctx);
        if (flow && identity.isCollection(node))
          node.flow = true;
        setAnchors();
        return node;
      }
      /**
       * Convert a key and a value into a `Pair` using the current schema,
       * recursively wrapping all values as `Scalar` or `Collection` nodes.
       */
      createPair(key, value, options = {}) {
        const k = this.createNode(key, null, options);
        const v = this.createNode(value, null, options);
        return new Pair.Pair(k, v);
      }
      /**
       * Removes a value from the document.
       * @returns `true` if the item was found and removed.
       */
      delete(key) {
        return assertCollection(this.contents) ? this.contents.delete(key) : false;
      }
      /**
       * Removes a value from the document.
       * @returns `true` if the item was found and removed.
       */
      deleteIn(path4) {
        if (Collection.isEmptyPath(path4)) {
          if (this.contents == null)
            return false;
          this.contents = null;
          return true;
        }
        return assertCollection(this.contents) ? this.contents.deleteIn(path4) : false;
      }
      /**
       * Returns item at `key`, or `undefined` if not found. By default unwraps
       * scalar values from their surrounding node; to disable set `keepScalar` to
       * `true` (collections are always returned intact).
       */
      get(key, keepScalar) {
        return identity.isCollection(this.contents) ? this.contents.get(key, keepScalar) : void 0;
      }
      /**
       * Returns item at `path`, or `undefined` if not found. By default unwraps
       * scalar values from their surrounding node; to disable set `keepScalar` to
       * `true` (collections are always returned intact).
       */
      getIn(path4, keepScalar) {
        if (Collection.isEmptyPath(path4))
          return !keepScalar && identity.isScalar(this.contents) ? this.contents.value : this.contents;
        return identity.isCollection(this.contents) ? this.contents.getIn(path4, keepScalar) : void 0;
      }
      /**
       * Checks if the document includes a value with the key `key`.
       */
      has(key) {
        return identity.isCollection(this.contents) ? this.contents.has(key) : false;
      }
      /**
       * Checks if the document includes a value at `path`.
       */
      hasIn(path4) {
        if (Collection.isEmptyPath(path4))
          return this.contents !== void 0;
        return identity.isCollection(this.contents) ? this.contents.hasIn(path4) : false;
      }
      /**
       * Sets a value in this document. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       */
      set(key, value) {
        if (this.contents == null) {
          this.contents = Collection.collectionFromPath(this.schema, [key], value);
        } else if (assertCollection(this.contents)) {
          this.contents.set(key, value);
        }
      }
      /**
       * Sets a value in this document. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       */
      setIn(path4, value) {
        if (Collection.isEmptyPath(path4)) {
          this.contents = value;
        } else if (this.contents == null) {
          this.contents = Collection.collectionFromPath(this.schema, Array.from(path4), value);
        } else if (assertCollection(this.contents)) {
          this.contents.setIn(path4, value);
        }
      }
      /**
       * Change the YAML version and schema used by the document.
       * A `null` version disables support for directives, explicit tags, anchors, and aliases.
       * It also requires the `schema` option to be given as a `Schema` instance value.
       *
       * Overrides all previously set schema options.
       */
      setSchema(version, options = {}) {
        if (typeof version === "number")
          version = String(version);
        let opt;
        switch (version) {
          case "1.1":
            if (this.directives)
              this.directives.yaml.version = "1.1";
            else
              this.directives = new directives.Directives({ version: "1.1" });
            opt = { resolveKnownTags: false, schema: "yaml-1.1" };
            break;
          case "1.2":
          case "next":
            if (this.directives)
              this.directives.yaml.version = version;
            else
              this.directives = new directives.Directives({ version });
            opt = { resolveKnownTags: true, schema: "core" };
            break;
          case null:
            if (this.directives)
              delete this.directives;
            opt = null;
            break;
          default: {
            const sv = JSON.stringify(version);
            throw new Error(`Expected '1.1', '1.2' or null as first argument, but found: ${sv}`);
          }
        }
        if (options.schema instanceof Object)
          this.schema = options.schema;
        else if (opt)
          this.schema = new Schema.Schema(Object.assign(opt, options));
        else
          throw new Error(`With a null YAML version, the { schema: Schema } option is required`);
      }
      // json & jsonArg are only used from toJSON()
      toJS({ json, jsonArg, mapAsMap, maxAliasCount, onAnchor, reviver } = {}) {
        const ctx = {
          anchors: /* @__PURE__ */ new Map(),
          doc: this,
          keep: !json,
          mapAsMap: mapAsMap === true,
          mapKeyWarned: false,
          maxAliasCount: typeof maxAliasCount === "number" ? maxAliasCount : 100
        };
        const res = toJS.toJS(this.contents, jsonArg ?? "", ctx);
        if (typeof onAnchor === "function")
          for (const { count, res: res2 } of ctx.anchors.values())
            onAnchor(res2, count);
        return typeof reviver === "function" ? applyReviver.applyReviver(reviver, { "": res }, "", res) : res;
      }
      /**
       * A JSON representation of the document `contents`.
       *
       * @param jsonArg Used by `JSON.stringify` to indicate the array index or
       *   property name.
       */
      toJSON(jsonArg, onAnchor) {
        return this.toJS({ json: true, jsonArg, mapAsMap: false, onAnchor });
      }
      /** A YAML representation of the document. */
      toString(options = {}) {
        if (this.errors.length > 0)
          throw new Error("Document with errors cannot be stringified");
        if ("indent" in options && (!Number.isInteger(options.indent) || Number(options.indent) <= 0)) {
          const s = JSON.stringify(options.indent);
          throw new Error(`"indent" option must be a positive integer, not ${s}`);
        }
        return stringifyDocument.stringifyDocument(this, options);
      }
    };
    function assertCollection(contents) {
      if (identity.isCollection(contents))
        return true;
      throw new Error("Expected a YAML collection as document contents");
    }
    exports.Document = Document;
  }
});

// node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/errors.js
var require_errors = __commonJS({
  "node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/errors.js"(exports) {
    "use strict";
    var YAMLError = class extends Error {
      constructor(name, pos, code, message) {
        super();
        this.name = name;
        this.code = code;
        this.message = message;
        this.pos = pos;
      }
    };
    var YAMLParseError = class extends YAMLError {
      constructor(pos, code, message) {
        super("YAMLParseError", pos, code, message);
      }
    };
    var YAMLWarning = class extends YAMLError {
      constructor(pos, code, message) {
        super("YAMLWarning", pos, code, message);
      }
    };
    var prettifyError = (src, lc) => (error) => {
      if (error.pos[0] === -1)
        return;
      error.linePos = error.pos.map((pos) => lc.linePos(pos));
      const { line, col } = error.linePos[0];
      error.message += ` at line ${line}, column ${col}`;
      let ci = col - 1;
      let lineStr = src.substring(lc.lineStarts[line - 1], lc.lineStarts[line]).replace(/[\n\r]+$/, "");
      if (ci >= 60 && lineStr.length > 80) {
        const trimStart = Math.min(ci - 39, lineStr.length - 79);
        lineStr = "\u2026" + lineStr.substring(trimStart);
        ci -= trimStart - 1;
      }
      if (lineStr.length > 80)
        lineStr = lineStr.substring(0, 79) + "\u2026";
      if (line > 1 && /^ *$/.test(lineStr.substring(0, ci))) {
        let prev = src.substring(lc.lineStarts[line - 2], lc.lineStarts[line - 1]);
        if (prev.length > 80)
          prev = prev.substring(0, 79) + "\u2026\n";
        lineStr = prev + lineStr;
      }
      if (/[^ ]/.test(lineStr)) {
        let count = 1;
        const end = error.linePos[1];
        if (end?.line === line && end.col > col) {
          count = Math.max(1, Math.min(end.col - col, 80 - ci));
        }
        const pointer = " ".repeat(ci) + "^".repeat(count);
        error.message += `:

${lineStr}
${pointer}
`;
      }
    };
    exports.YAMLError = YAMLError;
    exports.YAMLParseError = YAMLParseError;
    exports.YAMLWarning = YAMLWarning;
    exports.prettifyError = prettifyError;
  }
});

// node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/compose/resolve-props.js
var require_resolve_props = __commonJS({
  "node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/compose/resolve-props.js"(exports) {
    "use strict";
    function resolveProps(tokens, { flow, indicator, next, offset, onError, parentIndent, startOnNewline }) {
      let spaceBefore = false;
      let atNewline = startOnNewline;
      let hasSpace = startOnNewline;
      let comment = "";
      let commentSep = "";
      let hasNewline = false;
      let reqSpace = false;
      let tab = null;
      let anchor = null;
      let tag = null;
      let newlineAfterProp = null;
      let comma = null;
      let found = null;
      let start = null;
      for (const token of tokens) {
        if (reqSpace) {
          if (token.type !== "space" && token.type !== "newline" && token.type !== "comma")
            onError(token.offset, "MISSING_CHAR", "Tags and anchors must be separated from the next token by white space");
          reqSpace = false;
        }
        if (tab) {
          if (atNewline && token.type !== "comment" && token.type !== "newline") {
            onError(tab, "TAB_AS_INDENT", "Tabs are not allowed as indentation");
          }
          tab = null;
        }
        switch (token.type) {
          case "space":
            if (!flow && (indicator !== "doc-start" || next?.type !== "flow-collection") && token.source.includes("	")) {
              tab = token;
            }
            hasSpace = true;
            break;
          case "comment": {
            if (!hasSpace)
              onError(token, "MISSING_CHAR", "Comments must be separated from other tokens by white space characters");
            const cb = token.source.substring(1) || " ";
            if (!comment)
              comment = cb;
            else
              comment += commentSep + cb;
            commentSep = "";
            atNewline = false;
            break;
          }
          case "newline":
            if (atNewline) {
              if (comment)
                comment += token.source;
              else if (!found || indicator !== "seq-item-ind")
                spaceBefore = true;
            } else
              commentSep += token.source;
            atNewline = true;
            hasNewline = true;
            if (anchor || tag)
              newlineAfterProp = token;
            hasSpace = true;
            break;
          case "anchor":
            if (anchor)
              onError(token, "MULTIPLE_ANCHORS", "A node can have at most one anchor");
            if (token.source.endsWith(":"))
              onError(token.offset + token.source.length - 1, "BAD_ALIAS", "Anchor ending in : is ambiguous", true);
            anchor = token;
            start ?? (start = token.offset);
            atNewline = false;
            hasSpace = false;
            reqSpace = true;
            break;
          case "tag": {
            if (tag)
              onError(token, "MULTIPLE_TAGS", "A node can have at most one tag");
            tag = token;
            start ?? (start = token.offset);
            atNewline = false;
            hasSpace = false;
            reqSpace = true;
            break;
          }
          case indicator:
            if (anchor || tag)
              onError(token, "BAD_PROP_ORDER", `Anchors and tags must be after the ${token.source} indicator`);
            if (found)
              onError(token, "UNEXPECTED_TOKEN", `Unexpected ${token.source} in ${flow ?? "collection"}`);
            found = token;
            atNewline = indicator === "seq-item-ind" || indicator === "explicit-key-ind";
            hasSpace = false;
            break;
          case "comma":
            if (flow) {
              if (comma)
                onError(token, "UNEXPECTED_TOKEN", `Unexpected , in ${flow}`);
              comma = token;
              atNewline = false;
              hasSpace = false;
              break;
            }
          // else fallthrough
          default:
            onError(token, "UNEXPECTED_TOKEN", `Unexpected ${token.type} token`);
            atNewline = false;
            hasSpace = false;
        }
      }
      const last = tokens[tokens.length - 1];
      const end = last ? last.offset + last.source.length : offset;
      if (reqSpace && next && next.type !== "space" && next.type !== "newline" && next.type !== "comma" && (next.type !== "scalar" || next.source !== "")) {
        onError(next.offset, "MISSING_CHAR", "Tags and anchors must be separated from the next token by white space");
      }
      if (tab && (atNewline && tab.indent <= parentIndent || next?.type === "block-map" || next?.type === "block-seq"))
        onError(tab, "TAB_AS_INDENT", "Tabs are not allowed as indentation");
      return {
        comma,
        found,
        spaceBefore,
        comment,
        hasNewline,
        anchor,
        tag,
        newlineAfterProp,
        end,
        start: start ?? end
      };
    }
    exports.resolveProps = resolveProps;
  }
});

// node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/compose/util-contains-newline.js
var require_util_contains_newline = __commonJS({
  "node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/compose/util-contains-newline.js"(exports) {
    "use strict";
    function containsNewline(key) {
      if (!key)
        return null;
      switch (key.type) {
        case "alias":
        case "scalar":
        case "double-quoted-scalar":
        case "single-quoted-scalar":
          if (key.source.includes("\n"))
            return true;
          if (key.end) {
            for (const st of key.end)
              if (st.type === "newline")
                return true;
          }
          return false;
        case "flow-collection":
          for (const it of key.items) {
            for (const st of it.start)
              if (st.type === "newline")
                return true;
            if (it.sep) {
              for (const st of it.sep)
                if (st.type === "newline")
                  return true;
            }
            if (containsNewline(it.key) || containsNewline(it.value))
              return true;
          }
          return false;
        default:
          return true;
      }
    }
    exports.containsNewline = containsNewline;
  }
});

// node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/compose/util-flow-indent-check.js
var require_util_flow_indent_check = __commonJS({
  "node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/compose/util-flow-indent-check.js"(exports) {
    "use strict";
    var utilContainsNewline = require_util_contains_newline();
    function flowIndentCheck(indent, fc, onError) {
      if (fc?.type === "flow-collection") {
        const end = fc.end[0];
        if (end.indent === indent && (end.source === "]" || end.source === "}") && utilContainsNewline.containsNewline(fc)) {
          const msg = "Flow end indicator should be more indented than parent";
          onError(end, "BAD_INDENT", msg, true);
        }
      }
    }
    exports.flowIndentCheck = flowIndentCheck;
  }
});

// node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/compose/util-map-includes.js
var require_util_map_includes = __commonJS({
  "node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/compose/util-map-includes.js"(exports) {
    "use strict";
    var identity = require_identity();
    function mapIncludes(ctx, items, search) {
      const { uniqueKeys } = ctx.options;
      if (uniqueKeys === false)
        return false;
      const isEqual = typeof uniqueKeys === "function" ? uniqueKeys : (a, b) => a === b || identity.isScalar(a) && identity.isScalar(b) && a.value === b.value;
      return items.some((pair) => isEqual(pair.key, search));
    }
    exports.mapIncludes = mapIncludes;
  }
});

// node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/compose/resolve-block-map.js
var require_resolve_block_map = __commonJS({
  "node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/compose/resolve-block-map.js"(exports) {
    "use strict";
    var Pair = require_Pair();
    var YAMLMap = require_YAMLMap();
    var resolveProps = require_resolve_props();
    var utilContainsNewline = require_util_contains_newline();
    var utilFlowIndentCheck = require_util_flow_indent_check();
    var utilMapIncludes = require_util_map_includes();
    var startColMsg = "All mapping items must start at the same column";
    function resolveBlockMap({ composeNode, composeEmptyNode }, ctx, bm, onError, tag) {
      const NodeClass = tag?.nodeClass ?? YAMLMap.YAMLMap;
      const map = new NodeClass(ctx.schema);
      if (ctx.atRoot)
        ctx.atRoot = false;
      let offset = bm.offset;
      let commentEnd = null;
      for (const collItem of bm.items) {
        const { start, key, sep, value } = collItem;
        const keyProps = resolveProps.resolveProps(start, {
          indicator: "explicit-key-ind",
          next: key ?? sep?.[0],
          offset,
          onError,
          parentIndent: bm.indent,
          startOnNewline: true
        });
        const implicitKey = !keyProps.found;
        if (implicitKey) {
          if (key) {
            if (key.type === "block-seq")
              onError(offset, "BLOCK_AS_IMPLICIT_KEY", "A block sequence may not be used as an implicit map key");
            else if ("indent" in key && key.indent !== bm.indent)
              onError(offset, "BAD_INDENT", startColMsg);
          }
          if (!keyProps.anchor && !keyProps.tag && !sep) {
            commentEnd = keyProps.end;
            if (keyProps.comment) {
              if (map.comment)
                map.comment += "\n" + keyProps.comment;
              else
                map.comment = keyProps.comment;
            }
            continue;
          }
          if (keyProps.newlineAfterProp || utilContainsNewline.containsNewline(key)) {
            onError(key ?? start[start.length - 1], "MULTILINE_IMPLICIT_KEY", "Implicit keys need to be on a single line");
          }
        } else if (keyProps.found?.indent !== bm.indent) {
          onError(offset, "BAD_INDENT", startColMsg);
        }
        ctx.atKey = true;
        const keyStart = keyProps.end;
        const keyNode = key ? composeNode(ctx, key, keyProps, onError) : composeEmptyNode(ctx, keyStart, start, null, keyProps, onError);
        if (ctx.schema.compat)
          utilFlowIndentCheck.flowIndentCheck(bm.indent, key, onError);
        ctx.atKey = false;
        if (utilMapIncludes.mapIncludes(ctx, map.items, keyNode))
          onError(keyStart, "DUPLICATE_KEY", "Map keys must be unique");
        const valueProps = resolveProps.resolveProps(sep ?? [], {
          indicator: "map-value-ind",
          next: value,
          offset: keyNode.range[2],
          onError,
          parentIndent: bm.indent,
          startOnNewline: !key || key.type === "block-scalar"
        });
        offset = valueProps.end;
        if (valueProps.found) {
          if (implicitKey) {
            if (value?.type === "block-map" && !valueProps.hasNewline)
              onError(offset, "BLOCK_AS_IMPLICIT_KEY", "Nested mappings are not allowed in compact mappings");
            if (ctx.options.strict && keyProps.start < valueProps.found.offset - 1024)
              onError(keyNode.range, "KEY_OVER_1024_CHARS", "The : indicator must be at most 1024 chars after the start of an implicit block mapping key");
          }
          const valueNode = value ? composeNode(ctx, value, valueProps, onError) : composeEmptyNode(ctx, offset, sep, null, valueProps, onError);
          if (ctx.schema.compat)
            utilFlowIndentCheck.flowIndentCheck(bm.indent, value, onError);
          offset = valueNode.range[2];
          const pair = new Pair.Pair(keyNode, valueNode);
          if (ctx.options.keepSourceTokens)
            pair.srcToken = collItem;
          map.items.push(pair);
        } else {
          if (implicitKey)
            onError(keyNode.range, "MISSING_CHAR", "Implicit map keys need to be followed by map values");
          if (valueProps.comment) {
            if (keyNode.comment)
              keyNode.comment += "\n" + valueProps.comment;
            else
              keyNode.comment = valueProps.comment;
          }
          const pair = new Pair.Pair(keyNode);
          if (ctx.options.keepSourceTokens)
            pair.srcToken = collItem;
          map.items.push(pair);
        }
      }
      if (commentEnd && commentEnd < offset)
        onError(commentEnd, "IMPOSSIBLE", "Map comment with trailing content");
      map.range = [bm.offset, offset, commentEnd ?? offset];
      return map;
    }
    exports.resolveBlockMap = resolveBlockMap;
  }
});

// node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/compose/resolve-block-seq.js
var require_resolve_block_seq = __commonJS({
  "node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/compose/resolve-block-seq.js"(exports) {
    "use strict";
    var YAMLSeq = require_YAMLSeq();
    var resolveProps = require_resolve_props();
    var utilFlowIndentCheck = require_util_flow_indent_check();
    function resolveBlockSeq({ composeNode, composeEmptyNode }, ctx, bs, onError, tag) {
      const NodeClass = tag?.nodeClass ?? YAMLSeq.YAMLSeq;
      const seq = new NodeClass(ctx.schema);
      if (ctx.atRoot)
        ctx.atRoot = false;
      if (ctx.atKey)
        ctx.atKey = false;
      let offset = bs.offset;
      let commentEnd = null;
      for (const { start, value } of bs.items) {
        const props = resolveProps.resolveProps(start, {
          indicator: "seq-item-ind",
          next: value,
          offset,
          onError,
          parentIndent: bs.indent,
          startOnNewline: true
        });
        if (!props.found) {
          if (props.anchor || props.tag || value) {
            if (value?.type === "block-seq")
              onError(props.end, "BAD_INDENT", "All sequence items must start at the same column");
            else
              onError(offset, "MISSING_CHAR", "Sequence item without - indicator");
          } else {
            commentEnd = props.end;
            if (props.comment)
              seq.comment = props.comment;
            continue;
          }
        }
        const node = value ? composeNode(ctx, value, props, onError) : composeEmptyNode(ctx, props.end, start, null, props, onError);
        if (ctx.schema.compat)
          utilFlowIndentCheck.flowIndentCheck(bs.indent, value, onError);
        offset = node.range[2];
        seq.items.push(node);
      }
      seq.range = [bs.offset, offset, commentEnd ?? offset];
      return seq;
    }
    exports.resolveBlockSeq = resolveBlockSeq;
  }
});

// node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/compose/resolve-end.js
var require_resolve_end = __commonJS({
  "node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/compose/resolve-end.js"(exports) {
    "use strict";
    function resolveEnd(end, offset, reqSpace, onError) {
      let comment = "";
      if (end) {
        let hasSpace = false;
        let sep = "";
        for (const token of end) {
          const { source, type } = token;
          switch (type) {
            case "space":
              hasSpace = true;
              break;
            case "comment": {
              if (reqSpace && !hasSpace)
                onError(token, "MISSING_CHAR", "Comments must be separated from other tokens by white space characters");
              const cb = source.substring(1) || " ";
              if (!comment)
                comment = cb;
              else
                comment += sep + cb;
              sep = "";
              break;
            }
            case "newline":
              if (comment)
                sep += source;
              hasSpace = true;
              break;
            default:
              onError(token, "UNEXPECTED_TOKEN", `Unexpected ${type} at node end`);
          }
          offset += source.length;
        }
      }
      return { comment, offset };
    }
    exports.resolveEnd = resolveEnd;
  }
});

// node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/compose/resolve-flow-collection.js
var require_resolve_flow_collection = __commonJS({
  "node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/compose/resolve-flow-collection.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Pair = require_Pair();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var resolveEnd = require_resolve_end();
    var resolveProps = require_resolve_props();
    var utilContainsNewline = require_util_contains_newline();
    var utilMapIncludes = require_util_map_includes();
    var blockMsg = "Block collections are not allowed within flow collections";
    var isBlock = (token) => token && (token.type === "block-map" || token.type === "block-seq");
    function resolveFlowCollection({ composeNode, composeEmptyNode }, ctx, fc, onError, tag) {
      const isMap = fc.start.source === "{";
      const fcName = isMap ? "flow map" : "flow sequence";
      const NodeClass = tag?.nodeClass ?? (isMap ? YAMLMap.YAMLMap : YAMLSeq.YAMLSeq);
      const coll = new NodeClass(ctx.schema);
      coll.flow = true;
      const atRoot = ctx.atRoot;
      if (atRoot)
        ctx.atRoot = false;
      if (ctx.atKey)
        ctx.atKey = false;
      let offset = fc.offset + fc.start.source.length;
      for (let i = 0; i < fc.items.length; ++i) {
        const collItem = fc.items[i];
        const { start, key, sep, value } = collItem;
        const props = resolveProps.resolveProps(start, {
          flow: fcName,
          indicator: "explicit-key-ind",
          next: key ?? sep?.[0],
          offset,
          onError,
          parentIndent: fc.indent,
          startOnNewline: false
        });
        if (!props.found) {
          if (!props.anchor && !props.tag && !sep && !value) {
            if (i === 0 && props.comma)
              onError(props.comma, "UNEXPECTED_TOKEN", `Unexpected , in ${fcName}`);
            else if (i < fc.items.length - 1)
              onError(props.start, "UNEXPECTED_TOKEN", `Unexpected empty item in ${fcName}`);
            if (props.comment) {
              if (coll.comment)
                coll.comment += "\n" + props.comment;
              else
                coll.comment = props.comment;
            }
            offset = props.end;
            continue;
          }
          if (!isMap && ctx.options.strict && utilContainsNewline.containsNewline(key))
            onError(
              key,
              // checked by containsNewline()
              "MULTILINE_IMPLICIT_KEY",
              "Implicit keys of flow sequence pairs need to be on a single line"
            );
        }
        if (i === 0) {
          if (props.comma)
            onError(props.comma, "UNEXPECTED_TOKEN", `Unexpected , in ${fcName}`);
        } else {
          if (!props.comma)
            onError(props.start, "MISSING_CHAR", `Missing , between ${fcName} items`);
          if (props.comment) {
            let prevItemComment = "";
            loop: for (const st of start) {
              switch (st.type) {
                case "comma":
                case "space":
                  break;
                case "comment":
                  prevItemComment = st.source.substring(1);
                  break loop;
                default:
                  break loop;
              }
            }
            if (prevItemComment) {
              let prev = coll.items[coll.items.length - 1];
              if (identity.isPair(prev))
                prev = prev.value ?? prev.key;
              if (prev.comment)
                prev.comment += "\n" + prevItemComment;
              else
                prev.comment = prevItemComment;
              props.comment = props.comment.substring(prevItemComment.length + 1);
            }
          }
        }
        if (!isMap && !sep && !props.found) {
          const valueNode = value ? composeNode(ctx, value, props, onError) : composeEmptyNode(ctx, props.end, sep, null, props, onError);
          coll.items.push(valueNode);
          offset = valueNode.range[2];
          if (isBlock(value))
            onError(valueNode.range, "BLOCK_IN_FLOW", blockMsg);
        } else {
          ctx.atKey = true;
          const keyStart = props.end;
          const keyNode = key ? composeNode(ctx, key, props, onError) : composeEmptyNode(ctx, keyStart, start, null, props, onError);
          if (isBlock(key))
            onError(keyNode.range, "BLOCK_IN_FLOW", blockMsg);
          ctx.atKey = false;
          const valueProps = resolveProps.resolveProps(sep ?? [], {
            flow: fcName,
            indicator: "map-value-ind",
            next: value,
            offset: keyNode.range[2],
            onError,
            parentIndent: fc.indent,
            startOnNewline: false
          });
          if (valueProps.found) {
            if (!isMap && !props.found && ctx.options.strict) {
              if (sep)
                for (const st of sep) {
                  if (st === valueProps.found)
                    break;
                  if (st.type === "newline") {
                    onError(st, "MULTILINE_IMPLICIT_KEY", "Implicit keys of flow sequence pairs need to be on a single line");
                    break;
                  }
                }
              if (props.start < valueProps.found.offset - 1024)
                onError(valueProps.found, "KEY_OVER_1024_CHARS", "The : indicator must be at most 1024 chars after the start of an implicit flow sequence key");
            }
          } else if (value) {
            if ("source" in value && value.source?.[0] === ":")
              onError(value, "MISSING_CHAR", `Missing space after : in ${fcName}`);
            else
              onError(valueProps.start, "MISSING_CHAR", `Missing , or : between ${fcName} items`);
          }
          const valueNode = value ? composeNode(ctx, value, valueProps, onError) : valueProps.found ? composeEmptyNode(ctx, valueProps.end, sep, null, valueProps, onError) : null;
          if (valueNode) {
            if (isBlock(value))
              onError(valueNode.range, "BLOCK_IN_FLOW", blockMsg);
          } else if (valueProps.comment) {
            if (keyNode.comment)
              keyNode.comment += "\n" + valueProps.comment;
            else
              keyNode.comment = valueProps.comment;
          }
          const pair = new Pair.Pair(keyNode, valueNode);
          if (ctx.options.keepSourceTokens)
            pair.srcToken = collItem;
          if (isMap) {
            const map = coll;
            if (utilMapIncludes.mapIncludes(ctx, map.items, keyNode))
              onError(keyStart, "DUPLICATE_KEY", "Map keys must be unique");
            map.items.push(pair);
          } else {
            const map = new YAMLMap.YAMLMap(ctx.schema);
            map.flow = true;
            map.items.push(pair);
            const endRange = (valueNode ?? keyNode).range;
            map.range = [keyNode.range[0], endRange[1], endRange[2]];
            coll.items.push(map);
          }
          offset = valueNode ? valueNode.range[2] : valueProps.end;
        }
      }
      const expectedEnd = isMap ? "}" : "]";
      const [ce, ...ee] = fc.end;
      let cePos = offset;
      if (ce?.source === expectedEnd)
        cePos = ce.offset + ce.source.length;
      else {
        const name = fcName[0].toUpperCase() + fcName.substring(1);
        const msg = atRoot ? `${name} must end with a ${expectedEnd}` : `${name} in block collection must be sufficiently indented and end with a ${expectedEnd}`;
        onError(offset, atRoot ? "MISSING_CHAR" : "BAD_INDENT", msg);
        if (ce && ce.source.length !== 1)
          ee.unshift(ce);
      }
      if (ee.length > 0) {
        const end = resolveEnd.resolveEnd(ee, cePos, ctx.options.strict, onError);
        if (end.comment) {
          if (coll.comment)
            coll.comment += "\n" + end.comment;
          else
            coll.comment = end.comment;
        }
        coll.range = [fc.offset, cePos, end.offset];
      } else {
        coll.range = [fc.offset, cePos, cePos];
      }
      return coll;
    }
    exports.resolveFlowCollection = resolveFlowCollection;
  }
});

// node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/compose/compose-collection.js
var require_compose_collection = __commonJS({
  "node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/compose/compose-collection.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var resolveBlockMap = require_resolve_block_map();
    var resolveBlockSeq = require_resolve_block_seq();
    var resolveFlowCollection = require_resolve_flow_collection();
    function resolveCollection(CN, ctx, token, onError, tagName, tag) {
      const coll = token.type === "block-map" ? resolveBlockMap.resolveBlockMap(CN, ctx, token, onError, tag) : token.type === "block-seq" ? resolveBlockSeq.resolveBlockSeq(CN, ctx, token, onError, tag) : resolveFlowCollection.resolveFlowCollection(CN, ctx, token, onError, tag);
      const Coll = coll.constructor;
      if (tagName === "!" || tagName === Coll.tagName) {
        coll.tag = Coll.tagName;
        return coll;
      }
      if (tagName)
        coll.tag = tagName;
      return coll;
    }
    function composeCollection(CN, ctx, token, props, onError) {
      const tagToken = props.tag;
      const tagName = !tagToken ? null : ctx.directives.tagName(tagToken.source, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg));
      if (token.type === "block-seq") {
        const { anchor, newlineAfterProp: nl } = props;
        const lastProp = anchor && tagToken ? anchor.offset > tagToken.offset ? anchor : tagToken : anchor ?? tagToken;
        if (lastProp && (!nl || nl.offset < lastProp.offset)) {
          const message = "Missing newline after block sequence props";
          onError(lastProp, "MISSING_CHAR", message);
        }
      }
      const expType = token.type === "block-map" ? "map" : token.type === "block-seq" ? "seq" : token.start.source === "{" ? "map" : "seq";
      if (!tagToken || !tagName || tagName === "!" || tagName === YAMLMap.YAMLMap.tagName && expType === "map" || tagName === YAMLSeq.YAMLSeq.tagName && expType === "seq") {
        return resolveCollection(CN, ctx, token, onError, tagName);
      }
      let tag = ctx.schema.tags.find((t) => t.tag === tagName && t.collection === expType);
      if (!tag) {
        const kt = ctx.schema.knownTags[tagName];
        if (kt?.collection === expType) {
          ctx.schema.tags.push(Object.assign({}, kt, { default: false }));
          tag = kt;
        } else {
          if (kt) {
            onError(tagToken, "BAD_COLLECTION_TYPE", `${kt.tag} used for ${expType} collection, but expects ${kt.collection ?? "scalar"}`, true);
          } else {
            onError(tagToken, "TAG_RESOLVE_FAILED", `Unresolved tag: ${tagName}`, true);
          }
          return resolveCollection(CN, ctx, token, onError, tagName);
        }
      }
      const coll = resolveCollection(CN, ctx, token, onError, tagName, tag);
      const res = tag.resolve?.(coll, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg), ctx.options) ?? coll;
      const node = identity.isNode(res) ? res : new Scalar.Scalar(res);
      node.range = coll.range;
      node.tag = tagName;
      if (tag?.format)
        node.format = tag.format;
      return node;
    }
    exports.composeCollection = composeCollection;
  }
});

// node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/compose/resolve-block-scalar.js
var require_resolve_block_scalar = __commonJS({
  "node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/compose/resolve-block-scalar.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    function resolveBlockScalar(ctx, scalar, onError) {
      const start = scalar.offset;
      const header = parseBlockScalarHeader(scalar, ctx.options.strict, onError);
      if (!header)
        return { value: "", type: null, comment: "", range: [start, start, start] };
      const type = header.mode === ">" ? Scalar.Scalar.BLOCK_FOLDED : Scalar.Scalar.BLOCK_LITERAL;
      const lines = scalar.source ? splitLines(scalar.source) : [];
      let chompStart = lines.length;
      for (let i = lines.length - 1; i >= 0; --i) {
        const content = lines[i][1];
        if (content === "" || content === "\r")
          chompStart = i;
        else
          break;
      }
      if (chompStart === 0) {
        const value2 = header.chomp === "+" && lines.length > 0 ? "\n".repeat(Math.max(1, lines.length - 1)) : "";
        let end2 = start + header.length;
        if (scalar.source)
          end2 += scalar.source.length;
        return { value: value2, type, comment: header.comment, range: [start, end2, end2] };
      }
      let trimIndent = scalar.indent + header.indent;
      let offset = scalar.offset + header.length;
      let contentStart = 0;
      for (let i = 0; i < chompStart; ++i) {
        const [indent, content] = lines[i];
        if (content === "" || content === "\r") {
          if (header.indent === 0 && indent.length > trimIndent)
            trimIndent = indent.length;
        } else {
          if (indent.length < trimIndent) {
            const message = "Block scalars with more-indented leading empty lines must use an explicit indentation indicator";
            onError(offset + indent.length, "MISSING_CHAR", message);
          }
          if (header.indent === 0)
            trimIndent = indent.length;
          contentStart = i;
          if (trimIndent === 0 && !ctx.atRoot) {
            const message = "Block scalar values in collections must be indented";
            onError(offset, "BAD_INDENT", message);
          }
          break;
        }
        offset += indent.length + content.length + 1;
      }
      for (let i = lines.length - 1; i >= chompStart; --i) {
        if (lines[i][0].length > trimIndent)
          chompStart = i + 1;
      }
      let value = "";
      let sep = "";
      let prevMoreIndented = false;
      for (let i = 0; i < contentStart; ++i)
        value += lines[i][0].slice(trimIndent) + "\n";
      for (let i = contentStart; i < chompStart; ++i) {
        let [indent, content] = lines[i];
        offset += indent.length + content.length + 1;
        const crlf = content[content.length - 1] === "\r";
        if (crlf)
          content = content.slice(0, -1);
        if (content && indent.length < trimIndent) {
          const src = header.indent ? "explicit indentation indicator" : "first line";
          const message = `Block scalar lines must not be less indented than their ${src}`;
          onError(offset - content.length - (crlf ? 2 : 1), "BAD_INDENT", message);
          indent = "";
        }
        if (type === Scalar.Scalar.BLOCK_LITERAL) {
          value += sep + indent.slice(trimIndent) + content;
          sep = "\n";
        } else if (indent.length > trimIndent || content[0] === "	") {
          if (sep === " ")
            sep = "\n";
          else if (!prevMoreIndented && sep === "\n")
            sep = "\n\n";
          value += sep + indent.slice(trimIndent) + content;
          sep = "\n";
          prevMoreIndented = true;
        } else if (content === "") {
          if (sep === "\n")
            value += "\n";
          else
            sep = "\n";
        } else {
          value += sep + content;
          sep = " ";
          prevMoreIndented = false;
        }
      }
      switch (header.chomp) {
        case "-":
          break;
        case "+":
          for (let i = chompStart; i < lines.length; ++i)
            value += "\n" + lines[i][0].slice(trimIndent);
          if (value[value.length - 1] !== "\n")
            value += "\n";
          break;
        default:
          value += "\n";
      }
      const end = start + header.length + scalar.source.length;
      return { value, type, comment: header.comment, range: [start, end, end] };
    }
    function parseBlockScalarHeader({ offset, props }, strict, onError) {
      if (props[0].type !== "block-scalar-header") {
        onError(props[0], "IMPOSSIBLE", "Block scalar header not found");
        return null;
      }
      const { source } = props[0];
      const mode = source[0];
      let indent = 0;
      let chomp = "";
      let error = -1;
      for (let i = 1; i < source.length; ++i) {
        const ch = source[i];
        if (!chomp && (ch === "-" || ch === "+"))
          chomp = ch;
        else {
          const n = Number(ch);
          if (!indent && n)
            indent = n;
          else if (error === -1)
            error = offset + i;
        }
      }
      if (error !== -1)
        onError(error, "UNEXPECTED_TOKEN", `Block scalar header includes extra characters: ${source}`);
      let hasSpace = false;
      let comment = "";
      let length = source.length;
      for (let i = 1; i < props.length; ++i) {
        const token = props[i];
        switch (token.type) {
          case "space":
            hasSpace = true;
          // fallthrough
          case "newline":
            length += token.source.length;
            break;
          case "comment":
            if (strict && !hasSpace) {
              const message = "Comments must be separated from other tokens by white space characters";
              onError(token, "MISSING_CHAR", message);
            }
            length += token.source.length;
            comment = token.source.substring(1);
            break;
          case "error":
            onError(token, "UNEXPECTED_TOKEN", token.message);
            length += token.source.length;
            break;
          /* istanbul ignore next should not happen */
          default: {
            const message = `Unexpected token in block scalar header: ${token.type}`;
            onError(token, "UNEXPECTED_TOKEN", message);
            const ts = token.source;
            if (ts && typeof ts === "string")
              length += ts.length;
          }
        }
      }
      return { mode, indent, chomp, comment, length };
    }
    function splitLines(source) {
      const split = source.split(/\n( *)/);
      const first = split[0];
      const m = first.match(/^( *)/);
      const line0 = m?.[1] ? [m[1], first.slice(m[1].length)] : ["", first];
      const lines = [line0];
      for (let i = 1; i < split.length; i += 2)
        lines.push([split[i], split[i + 1]]);
      return lines;
    }
    exports.resolveBlockScalar = resolveBlockScalar;
  }
});

// node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/compose/resolve-flow-scalar.js
var require_resolve_flow_scalar = __commonJS({
  "node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/compose/resolve-flow-scalar.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var resolveEnd = require_resolve_end();
    function resolveFlowScalar(scalar, strict, onError) {
      const { offset, type, source, end } = scalar;
      let _type;
      let value;
      const _onError = (rel, code, msg) => onError(offset + rel, code, msg);
      switch (type) {
        case "scalar":
          _type = Scalar.Scalar.PLAIN;
          value = plainValue(source, _onError);
          break;
        case "single-quoted-scalar":
          _type = Scalar.Scalar.QUOTE_SINGLE;
          value = singleQuotedValue(source, _onError);
          break;
        case "double-quoted-scalar":
          _type = Scalar.Scalar.QUOTE_DOUBLE;
          value = doubleQuotedValue(source, _onError);
          break;
        /* istanbul ignore next should not happen */
        default:
          onError(scalar, "UNEXPECTED_TOKEN", `Expected a flow scalar value, but found: ${type}`);
          return {
            value: "",
            type: null,
            comment: "",
            range: [offset, offset + source.length, offset + source.length]
          };
      }
      const valueEnd = offset + source.length;
      const re = resolveEnd.resolveEnd(end, valueEnd, strict, onError);
      return {
        value,
        type: _type,
        comment: re.comment,
        range: [offset, valueEnd, re.offset]
      };
    }
    function plainValue(source, onError) {
      let badChar = "";
      switch (source[0]) {
        /* istanbul ignore next should not happen */
        case "	":
          badChar = "a tab character";
          break;
        case ",":
          badChar = "flow indicator character ,";
          break;
        case "%":
          badChar = "directive indicator character %";
          break;
        case "|":
        case ">": {
          badChar = `block scalar indicator ${source[0]}`;
          break;
        }
        case "@":
        case "`": {
          badChar = `reserved character ${source[0]}`;
          break;
        }
      }
      if (badChar)
        onError(0, "BAD_SCALAR_START", `Plain value cannot start with ${badChar}`);
      return foldLines(source);
    }
    function singleQuotedValue(source, onError) {
      if (source[source.length - 1] !== "'" || source.length === 1)
        onError(source.length, "MISSING_CHAR", "Missing closing 'quote");
      return foldLines(source.slice(1, -1)).replace(/''/g, "'");
    }
    function foldLines(source) {
      let first, line;
      try {
        first = new RegExp("(.*?)(?<![ 	])[ 	]*\r?\n", "sy");
        line = new RegExp("[ 	]*(.*?)(?:(?<![ 	])[ 	]*)?\r?\n", "sy");
      } catch {
        first = /(.*?)[ \t]*\r?\n/sy;
        line = /[ \t]*(.*?)[ \t]*\r?\n/sy;
      }
      let match = first.exec(source);
      if (!match)
        return source;
      let res = match[1];
      let sep = " ";
      let pos = first.lastIndex;
      line.lastIndex = pos;
      while (match = line.exec(source)) {
        if (match[1] === "") {
          if (sep === "\n")
            res += sep;
          else
            sep = "\n";
        } else {
          res += sep + match[1];
          sep = " ";
        }
        pos = line.lastIndex;
      }
      const last = /[ \t]*(.*)/sy;
      last.lastIndex = pos;
      match = last.exec(source);
      return res + sep + (match?.[1] ?? "");
    }
    function doubleQuotedValue(source, onError) {
      let res = "";
      for (let i = 1; i < source.length - 1; ++i) {
        const ch = source[i];
        if (ch === "\r" && source[i + 1] === "\n")
          continue;
        if (ch === "\n") {
          const { fold, offset } = foldNewline(source, i);
          res += fold;
          i = offset;
        } else if (ch === "\\") {
          let next = source[++i];
          const cc = escapeCodes[next];
          if (cc)
            res += cc;
          else if (next === "\n") {
            next = source[i + 1];
            while (next === " " || next === "	")
              next = source[++i + 1];
          } else if (next === "\r" && source[i + 1] === "\n") {
            next = source[++i + 1];
            while (next === " " || next === "	")
              next = source[++i + 1];
          } else if (next === "x" || next === "u" || next === "U") {
            const length = next === "x" ? 2 : next === "u" ? 4 : 8;
            res += parseCharCode(source, i + 1, length, onError);
            i += length;
          } else {
            const raw = source.substr(i - 1, 2);
            onError(i - 1, "BAD_DQ_ESCAPE", `Invalid escape sequence ${raw}`);
            res += raw;
          }
        } else if (ch === " " || ch === "	") {
          const wsStart = i;
          let next = source[i + 1];
          while (next === " " || next === "	")
            next = source[++i + 1];
          if (next !== "\n" && !(next === "\r" && source[i + 2] === "\n"))
            res += i > wsStart ? source.slice(wsStart, i + 1) : ch;
        } else {
          res += ch;
        }
      }
      if (source[source.length - 1] !== '"' || source.length === 1)
        onError(source.length, "MISSING_CHAR", 'Missing closing "quote');
      return res;
    }
    function foldNewline(source, offset) {
      let fold = "";
      let ch = source[offset + 1];
      while (ch === " " || ch === "	" || ch === "\n" || ch === "\r") {
        if (ch === "\r" && source[offset + 2] !== "\n")
          break;
        if (ch === "\n")
          fold += "\n";
        offset += 1;
        ch = source[offset + 1];
      }
      if (!fold)
        fold = " ";
      return { fold, offset };
    }
    var escapeCodes = {
      "0": "\0",
      // null character
      a: "\x07",
      // bell character
      b: "\b",
      // backspace
      e: "\x1B",
      // escape character
      f: "\f",
      // form feed
      n: "\n",
      // line feed
      r: "\r",
      // carriage return
      t: "	",
      // horizontal tab
      v: "\v",
      // vertical tab
      N: "\x85",
      // Unicode next line
      _: "\xA0",
      // Unicode non-breaking space
      L: "\u2028",
      // Unicode line separator
      P: "\u2029",
      // Unicode paragraph separator
      " ": " ",
      '"': '"',
      "/": "/",
      "\\": "\\",
      "	": "	"
    };
    function parseCharCode(source, offset, length, onError) {
      const cc = source.substr(offset, length);
      const ok = cc.length === length && /^[0-9a-fA-F]+$/.test(cc);
      const code = ok ? parseInt(cc, 16) : NaN;
      try {
        return String.fromCodePoint(code);
      } catch {
        const raw = source.substr(offset - 2, length + 2);
        onError(offset - 2, "BAD_DQ_ESCAPE", `Invalid escape sequence ${raw}`);
        return raw;
      }
    }
    exports.resolveFlowScalar = resolveFlowScalar;
  }
});

// node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/compose/compose-scalar.js
var require_compose_scalar = __commonJS({
  "node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/compose/compose-scalar.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var resolveBlockScalar = require_resolve_block_scalar();
    var resolveFlowScalar = require_resolve_flow_scalar();
    function composeScalar(ctx, token, tagToken, onError) {
      const { value, type, comment, range } = token.type === "block-scalar" ? resolveBlockScalar.resolveBlockScalar(ctx, token, onError) : resolveFlowScalar.resolveFlowScalar(token, ctx.options.strict, onError);
      const tagName = tagToken ? ctx.directives.tagName(tagToken.source, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg)) : null;
      let tag;
      if (ctx.options.stringKeys && ctx.atKey) {
        tag = ctx.schema[identity.SCALAR];
      } else if (tagName)
        tag = findScalarTagByName(ctx.schema, value, tagName, tagToken, onError);
      else if (token.type === "scalar")
        tag = findScalarTagByTest(ctx, value, token, onError);
      else
        tag = ctx.schema[identity.SCALAR];
      let scalar;
      try {
        const res = tag.resolve(value, (msg) => onError(tagToken ?? token, "TAG_RESOLVE_FAILED", msg), ctx.options);
        scalar = identity.isScalar(res) ? res : new Scalar.Scalar(res);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        onError(tagToken ?? token, "TAG_RESOLVE_FAILED", msg);
        scalar = new Scalar.Scalar(value);
      }
      scalar.range = range;
      scalar.source = value;
      if (type)
        scalar.type = type;
      if (tagName)
        scalar.tag = tagName;
      if (tag.format)
        scalar.format = tag.format;
      if (comment)
        scalar.comment = comment;
      return scalar;
    }
    function findScalarTagByName(schema, value, tagName, tagToken, onError) {
      if (tagName === "!")
        return schema[identity.SCALAR];
      const matchWithTest = [];
      for (const tag of schema.tags) {
        if (!tag.collection && tag.tag === tagName) {
          if (tag.default && tag.test)
            matchWithTest.push(tag);
          else
            return tag;
        }
      }
      for (const tag of matchWithTest)
        if (tag.test?.test(value))
          return tag;
      const kt = schema.knownTags[tagName];
      if (kt && !kt.collection) {
        schema.tags.push(Object.assign({}, kt, { default: false, test: void 0 }));
        return kt;
      }
      onError(tagToken, "TAG_RESOLVE_FAILED", `Unresolved tag: ${tagName}`, tagName !== "tag:yaml.org,2002:str");
      return schema[identity.SCALAR];
    }
    function findScalarTagByTest({ atKey, directives, schema }, value, token, onError) {
      const tag = schema.tags.find((tag2) => (tag2.default === true || atKey && tag2.default === "key") && tag2.test?.test(value)) || schema[identity.SCALAR];
      if (schema.compat) {
        const compat = schema.compat.find((tag2) => tag2.default && tag2.test?.test(value)) ?? schema[identity.SCALAR];
        if (tag.tag !== compat.tag) {
          const ts = directives.tagString(tag.tag);
          const cs = directives.tagString(compat.tag);
          const msg = `Value may be parsed as either ${ts} or ${cs}`;
          onError(token, "TAG_RESOLVE_FAILED", msg, true);
        }
      }
      return tag;
    }
    exports.composeScalar = composeScalar;
  }
});

// node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/compose/util-empty-scalar-position.js
var require_util_empty_scalar_position = __commonJS({
  "node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/compose/util-empty-scalar-position.js"(exports) {
    "use strict";
    function emptyScalarPosition(offset, before, pos) {
      if (before) {
        pos ?? (pos = before.length);
        for (let i = pos - 1; i >= 0; --i) {
          let st = before[i];
          switch (st.type) {
            case "space":
            case "comment":
            case "newline":
              offset -= st.source.length;
              continue;
          }
          st = before[++i];
          while (st?.type === "space") {
            offset += st.source.length;
            st = before[++i];
          }
          break;
        }
      }
      return offset;
    }
    exports.emptyScalarPosition = emptyScalarPosition;
  }
});

// node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/compose/compose-node.js
var require_compose_node = __commonJS({
  "node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/compose/compose-node.js"(exports) {
    "use strict";
    var Alias = require_Alias();
    var identity = require_identity();
    var composeCollection = require_compose_collection();
    var composeScalar = require_compose_scalar();
    var resolveEnd = require_resolve_end();
    var utilEmptyScalarPosition = require_util_empty_scalar_position();
    var CN = { composeNode, composeEmptyNode };
    function composeNode(ctx, token, props, onError) {
      const atKey = ctx.atKey;
      const { spaceBefore, comment, anchor, tag } = props;
      let node;
      let isSrcToken = true;
      switch (token.type) {
        case "alias":
          node = composeAlias(ctx, token, onError);
          if (anchor || tag)
            onError(token, "ALIAS_PROPS", "An alias node must not specify any properties");
          break;
        case "scalar":
        case "single-quoted-scalar":
        case "double-quoted-scalar":
        case "block-scalar":
          node = composeScalar.composeScalar(ctx, token, tag, onError);
          if (anchor)
            node.anchor = anchor.source.substring(1);
          break;
        case "block-map":
        case "block-seq":
        case "flow-collection":
          try {
            node = composeCollection.composeCollection(CN, ctx, token, props, onError);
            if (anchor)
              node.anchor = anchor.source.substring(1);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            onError(token, "RESOURCE_EXHAUSTION", message);
          }
          break;
        default: {
          const message = token.type === "error" ? token.message : `Unsupported token (type: ${token.type})`;
          onError(token, "UNEXPECTED_TOKEN", message);
          isSrcToken = false;
        }
      }
      node ?? (node = composeEmptyNode(ctx, token.offset, void 0, null, props, onError));
      if (anchor && node.anchor === "")
        onError(anchor, "BAD_ALIAS", "Anchor cannot be an empty string");
      if (atKey && ctx.options.stringKeys && (!identity.isScalar(node) || typeof node.value !== "string" || node.tag && node.tag !== "tag:yaml.org,2002:str")) {
        const msg = "With stringKeys, all keys must be strings";
        onError(tag ?? token, "NON_STRING_KEY", msg);
      }
      if (spaceBefore)
        node.spaceBefore = true;
      if (comment) {
        if (token.type === "scalar" && token.source === "")
          node.comment = comment;
        else
          node.commentBefore = comment;
      }
      if (ctx.options.keepSourceTokens && isSrcToken)
        node.srcToken = token;
      return node;
    }
    function composeEmptyNode(ctx, offset, before, pos, { spaceBefore, comment, anchor, tag, end }, onError) {
      const token = {
        type: "scalar",
        offset: utilEmptyScalarPosition.emptyScalarPosition(offset, before, pos),
        indent: -1,
        source: ""
      };
      const node = composeScalar.composeScalar(ctx, token, tag, onError);
      if (anchor) {
        node.anchor = anchor.source.substring(1);
        if (node.anchor === "")
          onError(anchor, "BAD_ALIAS", "Anchor cannot be an empty string");
      }
      if (spaceBefore)
        node.spaceBefore = true;
      if (comment) {
        node.comment = comment;
        node.range[2] = end;
      }
      return node;
    }
    function composeAlias({ options }, { offset, source, end }, onError) {
      const alias = new Alias.Alias(source.substring(1));
      if (alias.source === "")
        onError(offset, "BAD_ALIAS", "Alias cannot be an empty string");
      if (alias.source.endsWith(":"))
        onError(offset + source.length - 1, "BAD_ALIAS", "Alias ending in : is ambiguous", true);
      const valueEnd = offset + source.length;
      const re = resolveEnd.resolveEnd(end, valueEnd, options.strict, onError);
      alias.range = [offset, valueEnd, re.offset];
      if (re.comment)
        alias.comment = re.comment;
      return alias;
    }
    exports.composeEmptyNode = composeEmptyNode;
    exports.composeNode = composeNode;
  }
});

// node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/compose/compose-doc.js
var require_compose_doc = __commonJS({
  "node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/compose/compose-doc.js"(exports) {
    "use strict";
    var Document = require_Document();
    var composeNode = require_compose_node();
    var resolveEnd = require_resolve_end();
    var resolveProps = require_resolve_props();
    function composeDoc(options, directives, { offset, start, value, end }, onError) {
      const opts = Object.assign({ _directives: directives }, options);
      const doc = new Document.Document(void 0, opts);
      const ctx = {
        atKey: false,
        atRoot: true,
        directives: doc.directives,
        options: doc.options,
        schema: doc.schema
      };
      const props = resolveProps.resolveProps(start, {
        indicator: "doc-start",
        next: value ?? end?.[0],
        offset,
        onError,
        parentIndent: 0,
        startOnNewline: true
      });
      if (props.found) {
        doc.directives.docStart = true;
        if (value && (value.type === "block-map" || value.type === "block-seq") && !props.hasNewline)
          onError(props.end, "MISSING_CHAR", "Block collection cannot start on same line with directives-end marker");
      }
      doc.contents = value ? composeNode.composeNode(ctx, value, props, onError) : composeNode.composeEmptyNode(ctx, props.end, start, null, props, onError);
      const contentEnd = doc.contents.range[2];
      const re = resolveEnd.resolveEnd(end, contentEnd, false, onError);
      if (re.comment)
        doc.comment = re.comment;
      doc.range = [offset, contentEnd, re.offset];
      return doc;
    }
    exports.composeDoc = composeDoc;
  }
});

// node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/compose/composer.js
var require_composer = __commonJS({
  "node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/compose/composer.js"(exports) {
    "use strict";
    var node_process = __require("process");
    var directives = require_directives();
    var Document = require_Document();
    var errors = require_errors();
    var identity = require_identity();
    var composeDoc = require_compose_doc();
    var resolveEnd = require_resolve_end();
    function getErrorPos(src) {
      if (typeof src === "number")
        return [src, src + 1];
      if (Array.isArray(src))
        return src.length === 2 ? src : [src[0], src[1]];
      const { offset, source } = src;
      return [offset, offset + (typeof source === "string" ? source.length : 1)];
    }
    function parsePrelude(prelude) {
      let comment = "";
      let atComment = false;
      let afterEmptyLine = false;
      for (let i = 0; i < prelude.length; ++i) {
        const source = prelude[i];
        switch (source[0]) {
          case "#":
            comment += (comment === "" ? "" : afterEmptyLine ? "\n\n" : "\n") + (source.substring(1) || " ");
            atComment = true;
            afterEmptyLine = false;
            break;
          case "%":
            if (prelude[i + 1]?.[0] !== "#")
              i += 1;
            atComment = false;
            break;
          default:
            if (!atComment)
              afterEmptyLine = true;
            atComment = false;
        }
      }
      return { comment, afterEmptyLine };
    }
    var Composer = class {
      constructor(options = {}) {
        this.doc = null;
        this.atDirectives = false;
        this.prelude = [];
        this.errors = [];
        this.warnings = [];
        this.onError = (source, code, message, warning) => {
          const pos = getErrorPos(source);
          if (warning)
            this.warnings.push(new errors.YAMLWarning(pos, code, message));
          else
            this.errors.push(new errors.YAMLParseError(pos, code, message));
        };
        this.directives = new directives.Directives({ version: options.version || "1.2" });
        this.options = options;
      }
      decorate(doc, afterDoc) {
        const { comment, afterEmptyLine } = parsePrelude(this.prelude);
        if (comment) {
          const dc = doc.contents;
          if (afterDoc) {
            doc.comment = doc.comment ? `${doc.comment}
${comment}` : comment;
          } else if (afterEmptyLine || doc.directives.docStart || !dc) {
            doc.commentBefore = comment;
          } else if (identity.isCollection(dc) && !dc.flow && dc.items.length > 0) {
            let it = dc.items[0];
            if (identity.isPair(it))
              it = it.key;
            const cb = it.commentBefore;
            it.commentBefore = cb ? `${comment}
${cb}` : comment;
          } else {
            const cb = dc.commentBefore;
            dc.commentBefore = cb ? `${comment}
${cb}` : comment;
          }
        }
        if (afterDoc) {
          Array.prototype.push.apply(doc.errors, this.errors);
          Array.prototype.push.apply(doc.warnings, this.warnings);
        } else {
          doc.errors = this.errors;
          doc.warnings = this.warnings;
        }
        this.prelude = [];
        this.errors = [];
        this.warnings = [];
      }
      /**
       * Current stream status information.
       *
       * Mostly useful at the end of input for an empty stream.
       */
      streamInfo() {
        return {
          comment: parsePrelude(this.prelude).comment,
          directives: this.directives,
          errors: this.errors,
          warnings: this.warnings
        };
      }
      /**
       * Compose tokens into documents.
       *
       * @param forceDoc - If the stream contains no document, still emit a final document including any comments and directives that would be applied to a subsequent document.
       * @param endOffset - Should be set if `forceDoc` is also set, to set the document range end and to indicate errors correctly.
       */
      *compose(tokens, forceDoc = false, endOffset = -1) {
        for (const token of tokens)
          yield* this.next(token);
        yield* this.end(forceDoc, endOffset);
      }
      /** Advance the composer by one CST token. */
      *next(token) {
        if (node_process.env.LOG_STREAM)
          console.dir(token, { depth: null });
        switch (token.type) {
          case "directive":
            this.directives.add(token.source, (offset, message, warning) => {
              const pos = getErrorPos(token);
              pos[0] += offset;
              this.onError(pos, "BAD_DIRECTIVE", message, warning);
            });
            this.prelude.push(token.source);
            this.atDirectives = true;
            break;
          case "document": {
            const doc = composeDoc.composeDoc(this.options, this.directives, token, this.onError);
            if (this.atDirectives && !doc.directives.docStart)
              this.onError(token, "MISSING_CHAR", "Missing directives-end/doc-start indicator line");
            this.decorate(doc, false);
            if (this.doc)
              yield this.doc;
            this.doc = doc;
            this.atDirectives = false;
            break;
          }
          case "byte-order-mark":
          case "space":
            break;
          case "comment":
          case "newline":
            this.prelude.push(token.source);
            break;
          case "error": {
            const msg = token.source ? `${token.message}: ${JSON.stringify(token.source)}` : token.message;
            const error = new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", msg);
            if (this.atDirectives || !this.doc)
              this.errors.push(error);
            else
              this.doc.errors.push(error);
            break;
          }
          case "doc-end": {
            if (!this.doc) {
              const msg = "Unexpected doc-end without preceding document";
              this.errors.push(new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", msg));
              break;
            }
            this.doc.directives.docEnd = true;
            const end = resolveEnd.resolveEnd(token.end, token.offset + token.source.length, this.doc.options.strict, this.onError);
            this.decorate(this.doc, true);
            if (end.comment) {
              const dc = this.doc.comment;
              this.doc.comment = dc ? `${dc}
${end.comment}` : end.comment;
            }
            this.doc.range[2] = end.offset;
            break;
          }
          default:
            this.errors.push(new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", `Unsupported token ${token.type}`));
        }
      }
      /**
       * Call at end of input to yield any remaining document.
       *
       * @param forceDoc - If the stream contains no document, still emit a final document including any comments and directives that would be applied to a subsequent document.
       * @param endOffset - Should be set if `forceDoc` is also set, to set the document range end and to indicate errors correctly.
       */
      *end(forceDoc = false, endOffset = -1) {
        if (this.doc) {
          this.decorate(this.doc, true);
          yield this.doc;
          this.doc = null;
        } else if (forceDoc) {
          const opts = Object.assign({ _directives: this.directives }, this.options);
          const doc = new Document.Document(void 0, opts);
          if (this.atDirectives)
            this.onError(endOffset, "MISSING_CHAR", "Missing directives-end indicator line");
          doc.range = [0, endOffset, endOffset];
          this.decorate(doc, false);
          yield doc;
        }
      }
    };
    exports.Composer = Composer;
  }
});

// node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/parse/cst-scalar.js
var require_cst_scalar = __commonJS({
  "node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/parse/cst-scalar.js"(exports) {
    "use strict";
    var resolveBlockScalar = require_resolve_block_scalar();
    var resolveFlowScalar = require_resolve_flow_scalar();
    var errors = require_errors();
    var stringifyString = require_stringifyString();
    function resolveAsScalar(token, strict = true, onError) {
      if (token) {
        const _onError = (pos, code, message) => {
          const offset = typeof pos === "number" ? pos : Array.isArray(pos) ? pos[0] : pos.offset;
          if (onError)
            onError(offset, code, message);
          else
            throw new errors.YAMLParseError([offset, offset + 1], code, message);
        };
        switch (token.type) {
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar":
            return resolveFlowScalar.resolveFlowScalar(token, strict, _onError);
          case "block-scalar":
            return resolveBlockScalar.resolveBlockScalar({ options: { strict } }, token, _onError);
        }
      }
      return null;
    }
    function createScalarToken(value, context) {
      const { implicitKey = false, indent, inFlow = false, offset = -1, type = "PLAIN" } = context;
      const source = stringifyString.stringifyString({ type, value }, {
        implicitKey,
        indent: indent > 0 ? " ".repeat(indent) : "",
        inFlow,
        options: { blockQuote: true, lineWidth: -1 }
      });
      const end = context.end ?? [
        { type: "newline", offset: -1, indent, source: "\n" }
      ];
      switch (source[0]) {
        case "|":
        case ">": {
          const he = source.indexOf("\n");
          const head = source.substring(0, he);
          const body = source.substring(he + 1) + "\n";
          const props = [
            { type: "block-scalar-header", offset, indent, source: head }
          ];
          if (!addEndtoBlockProps(props, end))
            props.push({ type: "newline", offset: -1, indent, source: "\n" });
          return { type: "block-scalar", offset, indent, props, source: body };
        }
        case '"':
          return { type: "double-quoted-scalar", offset, indent, source, end };
        case "'":
          return { type: "single-quoted-scalar", offset, indent, source, end };
        default:
          return { type: "scalar", offset, indent, source, end };
      }
    }
    function setScalarValue(token, value, context = {}) {
      let { afterKey = false, implicitKey = false, inFlow = false, type } = context;
      let indent = "indent" in token ? token.indent : null;
      if (afterKey && typeof indent === "number")
        indent += 2;
      if (!type)
        switch (token.type) {
          case "single-quoted-scalar":
            type = "QUOTE_SINGLE";
            break;
          case "double-quoted-scalar":
            type = "QUOTE_DOUBLE";
            break;
          case "block-scalar": {
            const header = token.props[0];
            if (header.type !== "block-scalar-header")
              throw new Error("Invalid block scalar header");
            type = header.source[0] === ">" ? "BLOCK_FOLDED" : "BLOCK_LITERAL";
            break;
          }
          default:
            type = "PLAIN";
        }
      const source = stringifyString.stringifyString({ type, value }, {
        implicitKey: implicitKey || indent === null,
        indent: indent !== null && indent > 0 ? " ".repeat(indent) : "",
        inFlow,
        options: { blockQuote: true, lineWidth: -1 }
      });
      switch (source[0]) {
        case "|":
        case ">":
          setBlockScalarValue(token, source);
          break;
        case '"':
          setFlowScalarValue(token, source, "double-quoted-scalar");
          break;
        case "'":
          setFlowScalarValue(token, source, "single-quoted-scalar");
          break;
        default:
          setFlowScalarValue(token, source, "scalar");
      }
    }
    function setBlockScalarValue(token, source) {
      const he = source.indexOf("\n");
      const head = source.substring(0, he);
      const body = source.substring(he + 1) + "\n";
      if (token.type === "block-scalar") {
        const header = token.props[0];
        if (header.type !== "block-scalar-header")
          throw new Error("Invalid block scalar header");
        header.source = head;
        token.source = body;
      } else {
        const { offset } = token;
        const indent = "indent" in token ? token.indent : -1;
        const props = [
          { type: "block-scalar-header", offset, indent, source: head }
        ];
        if (!addEndtoBlockProps(props, "end" in token ? token.end : void 0))
          props.push({ type: "newline", offset: -1, indent, source: "\n" });
        for (const key of Object.keys(token))
          if (key !== "type" && key !== "offset")
            delete token[key];
        Object.assign(token, { type: "block-scalar", indent, props, source: body });
      }
    }
    function addEndtoBlockProps(props, end) {
      if (end)
        for (const st of end)
          switch (st.type) {
            case "space":
            case "comment":
              props.push(st);
              break;
            case "newline":
              props.push(st);
              return true;
          }
      return false;
    }
    function setFlowScalarValue(token, source, type) {
      switch (token.type) {
        case "scalar":
        case "double-quoted-scalar":
        case "single-quoted-scalar":
          token.type = type;
          token.source = source;
          break;
        case "block-scalar": {
          const end = token.props.slice(1);
          let oa = source.length;
          if (token.props[0].type === "block-scalar-header")
            oa -= token.props[0].source.length;
          for (const tok of end)
            tok.offset += oa;
          delete token.props;
          Object.assign(token, { type, source, end });
          break;
        }
        case "block-map":
        case "block-seq": {
          const offset = token.offset + source.length;
          const nl = { type: "newline", offset, indent: token.indent, source: "\n" };
          delete token.items;
          Object.assign(token, { type, source, end: [nl] });
          break;
        }
        default: {
          const indent = "indent" in token ? token.indent : -1;
          const end = "end" in token && Array.isArray(token.end) ? token.end.filter((st) => st.type === "space" || st.type === "comment" || st.type === "newline") : [];
          for (const key of Object.keys(token))
            if (key !== "type" && key !== "offset")
              delete token[key];
          Object.assign(token, { type, indent, source, end });
        }
      }
    }
    exports.createScalarToken = createScalarToken;
    exports.resolveAsScalar = resolveAsScalar;
    exports.setScalarValue = setScalarValue;
  }
});

// node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/parse/cst-stringify.js
var require_cst_stringify = __commonJS({
  "node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/parse/cst-stringify.js"(exports) {
    "use strict";
    var stringify = (cst) => "type" in cst ? stringifyToken(cst) : stringifyItem(cst);
    function stringifyToken(token) {
      switch (token.type) {
        case "block-scalar": {
          let res = "";
          for (const tok of token.props)
            res += stringifyToken(tok);
          return res + token.source;
        }
        case "block-map":
        case "block-seq": {
          let res = "";
          for (const item of token.items)
            res += stringifyItem(item);
          return res;
        }
        case "flow-collection": {
          let res = token.start.source;
          for (const item of token.items)
            res += stringifyItem(item);
          for (const st of token.end)
            res += st.source;
          return res;
        }
        case "document": {
          let res = stringifyItem(token);
          if (token.end)
            for (const st of token.end)
              res += st.source;
          return res;
        }
        default: {
          let res = token.source;
          if ("end" in token && token.end)
            for (const st of token.end)
              res += st.source;
          return res;
        }
      }
    }
    function stringifyItem({ start, key, sep, value }) {
      let res = "";
      for (const st of start)
        res += st.source;
      if (key)
        res += stringifyToken(key);
      if (sep)
        for (const st of sep)
          res += st.source;
      if (value)
        res += stringifyToken(value);
      return res;
    }
    exports.stringify = stringify;
  }
});

// node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/parse/cst-visit.js
var require_cst_visit = __commonJS({
  "node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/parse/cst-visit.js"(exports) {
    "use strict";
    var BREAK = /* @__PURE__ */ Symbol("break visit");
    var SKIP = /* @__PURE__ */ Symbol("skip children");
    var REMOVE = /* @__PURE__ */ Symbol("remove item");
    function visit(cst, visitor) {
      if ("type" in cst && cst.type === "document")
        cst = { start: cst.start, value: cst.value };
      _visit(Object.freeze([]), cst, visitor);
    }
    visit.BREAK = BREAK;
    visit.SKIP = SKIP;
    visit.REMOVE = REMOVE;
    visit.itemAtPath = (cst, path4) => {
      let item = cst;
      for (const [field, index] of path4) {
        const tok = item?.[field];
        if (tok && "items" in tok) {
          item = tok.items[index];
        } else
          return void 0;
      }
      return item;
    };
    visit.parentCollection = (cst, path4) => {
      const parent = visit.itemAtPath(cst, path4.slice(0, -1));
      const field = path4[path4.length - 1][0];
      const coll = parent?.[field];
      if (coll && "items" in coll)
        return coll;
      throw new Error("Parent collection not found");
    };
    function _visit(path4, item, visitor) {
      let ctrl = visitor(item, path4);
      if (typeof ctrl === "symbol")
        return ctrl;
      for (const field of ["key", "value"]) {
        const token = item[field];
        if (token && "items" in token) {
          for (let i = 0; i < token.items.length; ++i) {
            const ci = _visit(Object.freeze(path4.concat([[field, i]])), token.items[i], visitor);
            if (typeof ci === "number")
              i = ci - 1;
            else if (ci === BREAK)
              return BREAK;
            else if (ci === REMOVE) {
              token.items.splice(i, 1);
              i -= 1;
            }
          }
          if (typeof ctrl === "function" && field === "key")
            ctrl = ctrl(item, path4);
        }
      }
      return typeof ctrl === "function" ? ctrl(item, path4) : ctrl;
    }
    exports.visit = visit;
  }
});

// node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/parse/cst.js
var require_cst = __commonJS({
  "node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/parse/cst.js"(exports) {
    "use strict";
    var cstScalar = require_cst_scalar();
    var cstStringify = require_cst_stringify();
    var cstVisit = require_cst_visit();
    var BOM = "\uFEFF";
    var DOCUMENT = "";
    var FLOW_END = "";
    var SCALAR = "";
    var isCollection = (token) => !!token && "items" in token;
    var isScalar = (token) => !!token && (token.type === "scalar" || token.type === "single-quoted-scalar" || token.type === "double-quoted-scalar" || token.type === "block-scalar");
    function prettyToken(token) {
      switch (token) {
        case BOM:
          return "<BOM>";
        case DOCUMENT:
          return "<DOC>";
        case FLOW_END:
          return "<FLOW_END>";
        case SCALAR:
          return "<SCALAR>";
        default:
          return JSON.stringify(token);
      }
    }
    function tokenType(source) {
      switch (source) {
        case BOM:
          return "byte-order-mark";
        case DOCUMENT:
          return "doc-mode";
        case FLOW_END:
          return "flow-error-end";
        case SCALAR:
          return "scalar";
        case "---":
          return "doc-start";
        case "...":
          return "doc-end";
        case "":
        case "\n":
        case "\r\n":
          return "newline";
        case "-":
          return "seq-item-ind";
        case "?":
          return "explicit-key-ind";
        case ":":
          return "map-value-ind";
        case "{":
          return "flow-map-start";
        case "}":
          return "flow-map-end";
        case "[":
          return "flow-seq-start";
        case "]":
          return "flow-seq-end";
        case ",":
          return "comma";
      }
      switch (source[0]) {
        case " ":
        case "	":
          return "space";
        case "#":
          return "comment";
        case "%":
          return "directive-line";
        case "*":
          return "alias";
        case "&":
          return "anchor";
        case "!":
          return "tag";
        case "'":
          return "single-quoted-scalar";
        case '"':
          return "double-quoted-scalar";
        case "|":
        case ">":
          return "block-scalar-header";
      }
      return null;
    }
    exports.createScalarToken = cstScalar.createScalarToken;
    exports.resolveAsScalar = cstScalar.resolveAsScalar;
    exports.setScalarValue = cstScalar.setScalarValue;
    exports.stringify = cstStringify.stringify;
    exports.visit = cstVisit.visit;
    exports.BOM = BOM;
    exports.DOCUMENT = DOCUMENT;
    exports.FLOW_END = FLOW_END;
    exports.SCALAR = SCALAR;
    exports.isCollection = isCollection;
    exports.isScalar = isScalar;
    exports.prettyToken = prettyToken;
    exports.tokenType = tokenType;
  }
});

// node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/parse/lexer.js
var require_lexer = __commonJS({
  "node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/parse/lexer.js"(exports) {
    "use strict";
    var cst = require_cst();
    function isEmpty(ch) {
      switch (ch) {
        case void 0:
        case " ":
        case "\n":
        case "\r":
        case "	":
          return true;
        default:
          return false;
      }
    }
    var hexDigits = new Set("0123456789ABCDEFabcdef");
    var tagChars = new Set("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-#;/?:@&=+$_.!~*'()");
    var flowIndicatorChars = new Set(",[]{}");
    var invalidAnchorChars = new Set(" ,[]{}\n\r	");
    var isNotAnchorChar = (ch) => !ch || invalidAnchorChars.has(ch);
    var Lexer = class {
      constructor() {
        this.atEnd = false;
        this.blockScalarIndent = -1;
        this.blockScalarKeep = false;
        this.buffer = "";
        this.flowKey = false;
        this.flowLevel = 0;
        this.indentNext = 0;
        this.indentValue = 0;
        this.lineEndPos = null;
        this.next = null;
        this.pos = 0;
      }
      /**
       * Generate YAML tokens from the `source` string. If `incomplete`,
       * a part of the last line may be left as a buffer for the next call.
       *
       * @returns A generator of lexical tokens
       */
      *lex(source, incomplete = false) {
        if (source) {
          if (typeof source !== "string")
            throw TypeError("source is not a string");
          this.buffer = this.buffer ? this.buffer + source : source;
          this.lineEndPos = null;
        }
        this.atEnd = !incomplete;
        let next = this.next ?? "stream";
        while (next && (incomplete || this.hasChars(1)))
          next = yield* this.parseNext(next);
      }
      atLineEnd() {
        let i = this.pos;
        let ch = this.buffer[i];
        while (ch === " " || ch === "	")
          ch = this.buffer[++i];
        if (!ch || ch === "#" || ch === "\n")
          return true;
        if (ch === "\r")
          return this.buffer[i + 1] === "\n";
        return false;
      }
      charAt(n) {
        return this.buffer[this.pos + n];
      }
      continueScalar(offset) {
        let ch = this.buffer[offset];
        if (this.indentNext > 0) {
          let indent = 0;
          while (ch === " ")
            ch = this.buffer[++indent + offset];
          if (ch === "\r") {
            const next = this.buffer[indent + offset + 1];
            if (next === "\n" || !next && !this.atEnd)
              return offset + indent + 1;
          }
          return ch === "\n" || indent >= this.indentNext || !ch && !this.atEnd ? offset + indent : -1;
        }
        if (ch === "-" || ch === ".") {
          const dt = this.buffer.substr(offset, 3);
          if ((dt === "---" || dt === "...") && isEmpty(this.buffer[offset + 3]))
            return -1;
        }
        return offset;
      }
      getLine() {
        let end = this.lineEndPos;
        if (typeof end !== "number" || end !== -1 && end < this.pos) {
          end = this.buffer.indexOf("\n", this.pos);
          this.lineEndPos = end;
        }
        if (end === -1)
          return this.atEnd ? this.buffer.substring(this.pos) : null;
        if (this.buffer[end - 1] === "\r")
          end -= 1;
        return this.buffer.substring(this.pos, end);
      }
      hasChars(n) {
        return this.pos + n <= this.buffer.length;
      }
      setNext(state) {
        this.buffer = this.buffer.substring(this.pos);
        this.pos = 0;
        this.lineEndPos = null;
        this.next = state;
        return null;
      }
      peek(n) {
        return this.buffer.substr(this.pos, n);
      }
      *parseNext(next) {
        switch (next) {
          case "stream":
            return yield* this.parseStream();
          case "line-start":
            return yield* this.parseLineStart();
          case "block-start":
            return yield* this.parseBlockStart();
          case "doc":
            return yield* this.parseDocument();
          case "flow":
            return yield* this.parseFlowCollection();
          case "quoted-scalar":
            return yield* this.parseQuotedScalar();
          case "block-scalar":
            return yield* this.parseBlockScalar();
          case "plain-scalar":
            return yield* this.parsePlainScalar();
        }
      }
      *parseStream() {
        let line = this.getLine();
        if (line === null)
          return this.setNext("stream");
        if (line[0] === cst.BOM) {
          yield* this.pushCount(1);
          line = line.substring(1);
        }
        if (line[0] === "%") {
          let dirEnd = line.length;
          let cs = line.indexOf("#");
          while (cs !== -1) {
            const ch = line[cs - 1];
            if (ch === " " || ch === "	") {
              dirEnd = cs - 1;
              break;
            } else {
              cs = line.indexOf("#", cs + 1);
            }
          }
          while (true) {
            const ch = line[dirEnd - 1];
            if (ch === " " || ch === "	")
              dirEnd -= 1;
            else
              break;
          }
          const n = (yield* this.pushCount(dirEnd)) + (yield* this.pushSpaces(true));
          yield* this.pushCount(line.length - n);
          this.pushNewline();
          return "stream";
        }
        if (this.atLineEnd()) {
          const sp = yield* this.pushSpaces(true);
          yield* this.pushCount(line.length - sp);
          yield* this.pushNewline();
          return "stream";
        }
        yield cst.DOCUMENT;
        return yield* this.parseLineStart();
      }
      *parseLineStart() {
        const ch = this.charAt(0);
        if (!ch && !this.atEnd)
          return this.setNext("line-start");
        if (ch === "-" || ch === ".") {
          if (!this.atEnd && !this.hasChars(4))
            return this.setNext("line-start");
          const s = this.peek(3);
          if ((s === "---" || s === "...") && isEmpty(this.charAt(3))) {
            yield* this.pushCount(3);
            this.indentValue = 0;
            this.indentNext = 0;
            return s === "---" ? "doc" : "stream";
          }
        }
        this.indentValue = yield* this.pushSpaces(false);
        if (this.indentNext > this.indentValue && !isEmpty(this.charAt(1)))
          this.indentNext = this.indentValue;
        return yield* this.parseBlockStart();
      }
      *parseBlockStart() {
        const [ch0, ch1] = this.peek(2);
        if (!ch1 && !this.atEnd)
          return this.setNext("block-start");
        if ((ch0 === "-" || ch0 === "?" || ch0 === ":") && isEmpty(ch1)) {
          const n = (yield* this.pushCount(1)) + (yield* this.pushSpaces(true));
          this.indentNext = this.indentValue + 1;
          this.indentValue += n;
          return yield* this.parseBlockStart();
        }
        return "doc";
      }
      *parseDocument() {
        yield* this.pushSpaces(true);
        const line = this.getLine();
        if (line === null)
          return this.setNext("doc");
        let n = yield* this.pushIndicators();
        switch (line[n]) {
          case "#":
            yield* this.pushCount(line.length - n);
          // fallthrough
          case void 0:
            yield* this.pushNewline();
            return yield* this.parseLineStart();
          case "{":
          case "[":
            yield* this.pushCount(1);
            this.flowKey = false;
            this.flowLevel = 1;
            return "flow";
          case "}":
          case "]":
            yield* this.pushCount(1);
            return "doc";
          case "*":
            yield* this.pushUntil(isNotAnchorChar);
            return "doc";
          case '"':
          case "'":
            return yield* this.parseQuotedScalar();
          case "|":
          case ">":
            n += yield* this.parseBlockScalarHeader();
            n += yield* this.pushSpaces(true);
            yield* this.pushCount(line.length - n);
            yield* this.pushNewline();
            return yield* this.parseBlockScalar();
          default:
            return yield* this.parsePlainScalar();
        }
      }
      *parseFlowCollection() {
        let nl, sp;
        let indent = -1;
        do {
          nl = yield* this.pushNewline();
          if (nl > 0) {
            sp = yield* this.pushSpaces(false);
            this.indentValue = indent = sp;
          } else {
            sp = 0;
          }
          sp += yield* this.pushSpaces(true);
        } while (nl + sp > 0);
        const line = this.getLine();
        if (line === null)
          return this.setNext("flow");
        if (indent !== -1 && indent < this.indentNext && line[0] !== "#" || indent === 0 && (line.startsWith("---") || line.startsWith("...")) && isEmpty(line[3])) {
          const atFlowEndMarker = indent === this.indentNext - 1 && this.flowLevel === 1 && (line[0] === "]" || line[0] === "}");
          if (!atFlowEndMarker) {
            this.flowLevel = 0;
            yield cst.FLOW_END;
            return yield* this.parseLineStart();
          }
        }
        let n = 0;
        while (line[n] === ",") {
          n += yield* this.pushCount(1);
          n += yield* this.pushSpaces(true);
          this.flowKey = false;
        }
        n += yield* this.pushIndicators();
        switch (line[n]) {
          case void 0:
            return "flow";
          case "#":
            yield* this.pushCount(line.length - n);
            return "flow";
          case "{":
          case "[":
            yield* this.pushCount(1);
            this.flowKey = false;
            this.flowLevel += 1;
            return "flow";
          case "}":
          case "]":
            yield* this.pushCount(1);
            this.flowKey = true;
            this.flowLevel -= 1;
            return this.flowLevel ? "flow" : "doc";
          case "*":
            yield* this.pushUntil(isNotAnchorChar);
            return "flow";
          case '"':
          case "'":
            this.flowKey = true;
            return yield* this.parseQuotedScalar();
          case ":": {
            const next = this.charAt(1);
            if (this.flowKey || isEmpty(next) || next === ",") {
              this.flowKey = false;
              yield* this.pushCount(1);
              yield* this.pushSpaces(true);
              return "flow";
            }
          }
          // fallthrough
          default:
            this.flowKey = false;
            return yield* this.parsePlainScalar();
        }
      }
      *parseQuotedScalar() {
        const quote = this.charAt(0);
        let end = this.buffer.indexOf(quote, this.pos + 1);
        if (quote === "'") {
          while (end !== -1 && this.buffer[end + 1] === "'")
            end = this.buffer.indexOf("'", end + 2);
        } else {
          while (end !== -1) {
            let n = 0;
            while (this.buffer[end - 1 - n] === "\\")
              n += 1;
            if (n % 2 === 0)
              break;
            end = this.buffer.indexOf('"', end + 1);
          }
        }
        const qb = this.buffer.substring(0, end);
        let nl = qb.indexOf("\n", this.pos);
        if (nl !== -1) {
          while (nl !== -1) {
            const cs = this.continueScalar(nl + 1);
            if (cs === -1)
              break;
            nl = qb.indexOf("\n", cs);
          }
          if (nl !== -1) {
            end = nl - (qb[nl - 1] === "\r" ? 2 : 1);
          }
        }
        if (end === -1) {
          if (!this.atEnd)
            return this.setNext("quoted-scalar");
          end = this.buffer.length;
        }
        yield* this.pushToIndex(end + 1, false);
        return this.flowLevel ? "flow" : "doc";
      }
      *parseBlockScalarHeader() {
        this.blockScalarIndent = -1;
        this.blockScalarKeep = false;
        let i = this.pos;
        while (true) {
          const ch = this.buffer[++i];
          if (ch === "+")
            this.blockScalarKeep = true;
          else if (ch > "0" && ch <= "9")
            this.blockScalarIndent = Number(ch) - 1;
          else if (ch !== "-")
            break;
        }
        return yield* this.pushUntil((ch) => isEmpty(ch) || ch === "#");
      }
      *parseBlockScalar() {
        let nl = this.pos - 1;
        let indent = 0;
        let ch;
        loop: for (let i2 = this.pos; ch = this.buffer[i2]; ++i2) {
          switch (ch) {
            case " ":
              indent += 1;
              break;
            case "\n":
              nl = i2;
              indent = 0;
              break;
            case "\r": {
              const next = this.buffer[i2 + 1];
              if (!next && !this.atEnd)
                return this.setNext("block-scalar");
              if (next === "\n")
                break;
            }
            // fallthrough
            default:
              break loop;
          }
        }
        if (!ch && !this.atEnd)
          return this.setNext("block-scalar");
        if (indent >= this.indentNext) {
          if (this.blockScalarIndent === -1)
            this.indentNext = indent;
          else {
            this.indentNext = this.blockScalarIndent + (this.indentNext === 0 ? 1 : this.indentNext);
          }
          do {
            const cs = this.continueScalar(nl + 1);
            if (cs === -1)
              break;
            nl = this.buffer.indexOf("\n", cs);
          } while (nl !== -1);
          if (nl === -1) {
            if (!this.atEnd)
              return this.setNext("block-scalar");
            nl = this.buffer.length;
          }
        }
        let i = nl + 1;
        ch = this.buffer[i];
        while (ch === " ")
          ch = this.buffer[++i];
        if (ch === "	") {
          while (ch === "	" || ch === " " || ch === "\r" || ch === "\n")
            ch = this.buffer[++i];
          nl = i - 1;
        } else if (!this.blockScalarKeep) {
          do {
            let i2 = nl - 1;
            let ch2 = this.buffer[i2];
            if (ch2 === "\r")
              ch2 = this.buffer[--i2];
            const lastChar = i2;
            while (ch2 === " ")
              ch2 = this.buffer[--i2];
            if (ch2 === "\n" && i2 >= this.pos && i2 + 1 + indent > lastChar)
              nl = i2;
            else
              break;
          } while (true);
        }
        yield cst.SCALAR;
        yield* this.pushToIndex(nl + 1, true);
        return yield* this.parseLineStart();
      }
      *parsePlainScalar() {
        const inFlow = this.flowLevel > 0;
        let end = this.pos - 1;
        let i = this.pos - 1;
        let ch;
        while (ch = this.buffer[++i]) {
          if (ch === ":") {
            const next = this.buffer[i + 1];
            if (isEmpty(next) || inFlow && flowIndicatorChars.has(next))
              break;
            end = i;
          } else if (isEmpty(ch)) {
            let next = this.buffer[i + 1];
            if (ch === "\r") {
              if (next === "\n") {
                i += 1;
                ch = "\n";
                next = this.buffer[i + 1];
              } else
                end = i;
            }
            if (next === "#" || inFlow && flowIndicatorChars.has(next))
              break;
            if (ch === "\n") {
              const cs = this.continueScalar(i + 1);
              if (cs === -1)
                break;
              i = Math.max(i, cs - 2);
            }
          } else {
            if (inFlow && flowIndicatorChars.has(ch))
              break;
            end = i;
          }
        }
        if (!ch && !this.atEnd)
          return this.setNext("plain-scalar");
        yield cst.SCALAR;
        yield* this.pushToIndex(end + 1, true);
        return inFlow ? "flow" : "doc";
      }
      *pushCount(n) {
        if (n > 0) {
          yield this.buffer.substr(this.pos, n);
          this.pos += n;
          return n;
        }
        return 0;
      }
      *pushToIndex(i, allowEmpty) {
        const s = this.buffer.slice(this.pos, i);
        if (s) {
          yield s;
          this.pos += s.length;
          return s.length;
        } else if (allowEmpty)
          yield "";
        return 0;
      }
      *pushIndicators() {
        switch (this.charAt(0)) {
          case "!":
            return (yield* this.pushTag()) + (yield* this.pushSpaces(true)) + (yield* this.pushIndicators());
          case "&":
            return (yield* this.pushUntil(isNotAnchorChar)) + (yield* this.pushSpaces(true)) + (yield* this.pushIndicators());
          case "-":
          // this is an error
          case "?":
          // this is an error outside flow collections
          case ":": {
            const inFlow = this.flowLevel > 0;
            const ch1 = this.charAt(1);
            if (isEmpty(ch1) || inFlow && flowIndicatorChars.has(ch1)) {
              if (!inFlow)
                this.indentNext = this.indentValue + 1;
              else if (this.flowKey)
                this.flowKey = false;
              return (yield* this.pushCount(1)) + (yield* this.pushSpaces(true)) + (yield* this.pushIndicators());
            }
          }
        }
        return 0;
      }
      *pushTag() {
        if (this.charAt(1) === "<") {
          let i = this.pos + 2;
          let ch = this.buffer[i];
          while (!isEmpty(ch) && ch !== ">")
            ch = this.buffer[++i];
          return yield* this.pushToIndex(ch === ">" ? i + 1 : i, false);
        } else {
          let i = this.pos + 1;
          let ch = this.buffer[i];
          while (ch) {
            if (tagChars.has(ch))
              ch = this.buffer[++i];
            else if (ch === "%" && hexDigits.has(this.buffer[i + 1]) && hexDigits.has(this.buffer[i + 2])) {
              ch = this.buffer[i += 3];
            } else
              break;
          }
          return yield* this.pushToIndex(i, false);
        }
      }
      *pushNewline() {
        const ch = this.buffer[this.pos];
        if (ch === "\n")
          return yield* this.pushCount(1);
        else if (ch === "\r" && this.charAt(1) === "\n")
          return yield* this.pushCount(2);
        else
          return 0;
      }
      *pushSpaces(allowTabs) {
        let i = this.pos - 1;
        let ch;
        do {
          ch = this.buffer[++i];
        } while (ch === " " || allowTabs && ch === "	");
        const n = i - this.pos;
        if (n > 0) {
          yield this.buffer.substr(this.pos, n);
          this.pos = i;
        }
        return n;
      }
      *pushUntil(test) {
        let i = this.pos;
        let ch = this.buffer[i];
        while (!test(ch))
          ch = this.buffer[++i];
        return yield* this.pushToIndex(i, false);
      }
    };
    exports.Lexer = Lexer;
  }
});

// node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/parse/line-counter.js
var require_line_counter = __commonJS({
  "node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/parse/line-counter.js"(exports) {
    "use strict";
    var LineCounter = class {
      constructor() {
        this.lineStarts = [];
        this.addNewLine = (offset) => this.lineStarts.push(offset);
        this.linePos = (offset) => {
          let low = 0;
          let high = this.lineStarts.length;
          while (low < high) {
            const mid = low + high >> 1;
            if (this.lineStarts[mid] < offset)
              low = mid + 1;
            else
              high = mid;
          }
          if (this.lineStarts[low] === offset)
            return { line: low + 1, col: 1 };
          if (low === 0)
            return { line: 0, col: offset };
          const start = this.lineStarts[low - 1];
          return { line: low, col: offset - start + 1 };
        };
      }
    };
    exports.LineCounter = LineCounter;
  }
});

// node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/parse/parser.js
var require_parser = __commonJS({
  "node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/parse/parser.js"(exports) {
    "use strict";
    var node_process = __require("process");
    var cst = require_cst();
    var lexer = require_lexer();
    function includesToken(list, type) {
      for (let i = 0; i < list.length; ++i)
        if (list[i].type === type)
          return true;
      return false;
    }
    function findNonEmptyIndex(list) {
      for (let i = 0; i < list.length; ++i) {
        switch (list[i].type) {
          case "space":
          case "comment":
          case "newline":
            break;
          default:
            return i;
        }
      }
      return -1;
    }
    function isFlowToken(token) {
      switch (token?.type) {
        case "alias":
        case "scalar":
        case "single-quoted-scalar":
        case "double-quoted-scalar":
        case "flow-collection":
          return true;
        default:
          return false;
      }
    }
    function getPrevProps(parent) {
      switch (parent.type) {
        case "document":
          return parent.start;
        case "block-map": {
          const it = parent.items[parent.items.length - 1];
          return it.sep ?? it.start;
        }
        case "block-seq":
          return parent.items[parent.items.length - 1].start;
        /* istanbul ignore next should not happen */
        default:
          return [];
      }
    }
    function getFirstKeyStartProps(prev) {
      if (prev.length === 0)
        return [];
      let i = prev.length;
      loop: while (--i >= 0) {
        switch (prev[i].type) {
          case "doc-start":
          case "explicit-key-ind":
          case "map-value-ind":
          case "seq-item-ind":
          case "newline":
            break loop;
        }
      }
      while (prev[++i]?.type === "space") {
      }
      return prev.splice(i, prev.length);
    }
    function fixFlowSeqItems(fc) {
      if (fc.start.type === "flow-seq-start") {
        for (const it of fc.items) {
          if (it.sep && !it.value && !includesToken(it.start, "explicit-key-ind") && !includesToken(it.sep, "map-value-ind")) {
            if (it.key)
              it.value = it.key;
            delete it.key;
            if (isFlowToken(it.value)) {
              if (it.value.end)
                Array.prototype.push.apply(it.value.end, it.sep);
              else
                it.value.end = it.sep;
            } else
              Array.prototype.push.apply(it.start, it.sep);
            delete it.sep;
          }
        }
      }
    }
    var Parser = class {
      /**
       * @param onNewLine - If defined, called separately with the start position of
       *   each new line (in `parse()`, including the start of input).
       */
      constructor(onNewLine) {
        this.atNewLine = true;
        this.atScalar = false;
        this.indent = 0;
        this.offset = 0;
        this.onKeyLine = false;
        this.stack = [];
        this.source = "";
        this.type = "";
        this.lexer = new lexer.Lexer();
        this.onNewLine = onNewLine;
      }
      /**
       * Parse `source` as a YAML stream.
       * If `incomplete`, a part of the last line may be left as a buffer for the next call.
       *
       * Errors are not thrown, but yielded as `{ type: 'error', message }` tokens.
       *
       * @returns A generator of tokens representing each directive, document, and other structure.
       */
      *parse(source, incomplete = false) {
        if (this.onNewLine && this.offset === 0)
          this.onNewLine(0);
        for (const lexeme of this.lexer.lex(source, incomplete))
          yield* this.next(lexeme);
        if (!incomplete)
          yield* this.end();
      }
      /**
       * Advance the parser by the `source` of one lexical token.
       */
      *next(source) {
        this.source = source;
        if (node_process.env.LOG_TOKENS)
          console.log("|", cst.prettyToken(source));
        if (this.atScalar) {
          this.atScalar = false;
          yield* this.step();
          this.offset += source.length;
          return;
        }
        const type = cst.tokenType(source);
        if (!type) {
          const message = `Not a YAML token: ${source}`;
          yield* this.pop({ type: "error", offset: this.offset, message, source });
          this.offset += source.length;
        } else if (type === "scalar") {
          this.atNewLine = false;
          this.atScalar = true;
          this.type = "scalar";
        } else {
          this.type = type;
          yield* this.step();
          switch (type) {
            case "newline":
              this.atNewLine = true;
              this.indent = 0;
              if (this.onNewLine)
                this.onNewLine(this.offset + source.length);
              break;
            case "space":
              if (this.atNewLine && source[0] === " ")
                this.indent += source.length;
              break;
            case "explicit-key-ind":
            case "map-value-ind":
            case "seq-item-ind":
              if (this.atNewLine)
                this.indent += source.length;
              break;
            case "doc-mode":
            case "flow-error-end":
              return;
            default:
              this.atNewLine = false;
          }
          this.offset += source.length;
        }
      }
      /** Call at end of input to push out any remaining constructions */
      *end() {
        while (this.stack.length > 0)
          yield* this.pop();
      }
      get sourceToken() {
        const st = {
          type: this.type,
          offset: this.offset,
          indent: this.indent,
          source: this.source
        };
        return st;
      }
      *step() {
        const top = this.peek(1);
        if (this.type === "doc-end" && top?.type !== "doc-end") {
          while (this.stack.length > 0)
            yield* this.pop();
          this.stack.push({
            type: "doc-end",
            offset: this.offset,
            source: this.source
          });
          return;
        }
        if (!top)
          return yield* this.stream();
        switch (top.type) {
          case "document":
            return yield* this.document(top);
          case "alias":
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar":
            return yield* this.scalar(top);
          case "block-scalar":
            return yield* this.blockScalar(top);
          case "block-map":
            return yield* this.blockMap(top);
          case "block-seq":
            return yield* this.blockSequence(top);
          case "flow-collection":
            return yield* this.flowCollection(top);
          case "doc-end":
            return yield* this.documentEnd(top);
        }
        yield* this.pop();
      }
      peek(n) {
        return this.stack[this.stack.length - n];
      }
      *pop(error) {
        const token = error ?? this.stack.pop();
        if (!token) {
          const message = "Tried to pop an empty stack";
          yield { type: "error", offset: this.offset, source: "", message };
        } else if (this.stack.length === 0) {
          yield token;
        } else {
          const top = this.peek(1);
          if (token.type === "block-scalar") {
            token.indent = "indent" in top ? top.indent : 0;
          } else if (token.type === "flow-collection" && top.type === "document") {
            token.indent = 0;
          }
          if (token.type === "flow-collection")
            fixFlowSeqItems(token);
          switch (top.type) {
            case "document":
              top.value = token;
              break;
            case "block-scalar":
              top.props.push(token);
              break;
            case "block-map": {
              const it = top.items[top.items.length - 1];
              if (it.value) {
                top.items.push({ start: [], key: token, sep: [] });
                this.onKeyLine = true;
                return;
              } else if (it.sep) {
                it.value = token;
              } else {
                Object.assign(it, { key: token, sep: [] });
                this.onKeyLine = !it.explicitKey;
                return;
              }
              break;
            }
            case "block-seq": {
              const it = top.items[top.items.length - 1];
              if (it.value)
                top.items.push({ start: [], value: token });
              else
                it.value = token;
              break;
            }
            case "flow-collection": {
              const it = top.items[top.items.length - 1];
              if (!it || it.value)
                top.items.push({ start: [], key: token, sep: [] });
              else if (it.sep)
                it.value = token;
              else
                Object.assign(it, { key: token, sep: [] });
              return;
            }
            /* istanbul ignore next should not happen */
            default:
              yield* this.pop();
              yield* this.pop(token);
          }
          if ((top.type === "document" || top.type === "block-map" || top.type === "block-seq") && (token.type === "block-map" || token.type === "block-seq")) {
            const last = token.items[token.items.length - 1];
            if (last && !last.sep && !last.value && last.start.length > 0 && findNonEmptyIndex(last.start) === -1 && (token.indent === 0 || last.start.every((st) => st.type !== "comment" || st.indent < token.indent))) {
              if (top.type === "document")
                top.end = last.start;
              else
                top.items.push({ start: last.start });
              token.items.splice(-1, 1);
            }
          }
        }
      }
      *stream() {
        switch (this.type) {
          case "directive-line":
            yield { type: "directive", offset: this.offset, source: this.source };
            return;
          case "byte-order-mark":
          case "space":
          case "comment":
          case "newline":
            yield this.sourceToken;
            return;
          case "doc-mode":
          case "doc-start": {
            const doc = {
              type: "document",
              offset: this.offset,
              start: []
            };
            if (this.type === "doc-start")
              doc.start.push(this.sourceToken);
            this.stack.push(doc);
            return;
          }
        }
        yield {
          type: "error",
          offset: this.offset,
          message: `Unexpected ${this.type} token in YAML stream`,
          source: this.source
        };
      }
      *document(doc) {
        if (doc.value)
          return yield* this.lineEnd(doc);
        switch (this.type) {
          case "doc-start": {
            if (findNonEmptyIndex(doc.start) !== -1) {
              yield* this.pop();
              yield* this.step();
            } else
              doc.start.push(this.sourceToken);
            return;
          }
          case "anchor":
          case "tag":
          case "space":
          case "comment":
          case "newline":
            doc.start.push(this.sourceToken);
            return;
        }
        const bv = this.startBlockValue(doc);
        if (bv)
          this.stack.push(bv);
        else {
          yield {
            type: "error",
            offset: this.offset,
            message: `Unexpected ${this.type} token in YAML document`,
            source: this.source
          };
        }
      }
      *scalar(scalar) {
        if (this.type === "map-value-ind") {
          const prev = getPrevProps(this.peek(2));
          const start = getFirstKeyStartProps(prev);
          let sep;
          if (scalar.end) {
            sep = scalar.end;
            sep.push(this.sourceToken);
            delete scalar.end;
          } else
            sep = [this.sourceToken];
          const map = {
            type: "block-map",
            offset: scalar.offset,
            indent: scalar.indent,
            items: [{ start, key: scalar, sep }]
          };
          this.onKeyLine = true;
          this.stack[this.stack.length - 1] = map;
        } else
          yield* this.lineEnd(scalar);
      }
      *blockScalar(scalar) {
        switch (this.type) {
          case "space":
          case "comment":
          case "newline":
            scalar.props.push(this.sourceToken);
            return;
          case "scalar":
            scalar.source = this.source;
            this.atNewLine = true;
            this.indent = 0;
            if (this.onNewLine) {
              let nl = this.source.indexOf("\n") + 1;
              while (nl !== 0) {
                this.onNewLine(this.offset + nl);
                nl = this.source.indexOf("\n", nl) + 1;
              }
            }
            yield* this.pop();
            break;
          /* istanbul ignore next should not happen */
          default:
            yield* this.pop();
            yield* this.step();
        }
      }
      *blockMap(map) {
        const it = map.items[map.items.length - 1];
        switch (this.type) {
          case "newline":
            this.onKeyLine = false;
            if (it.value) {
              const end = "end" in it.value ? it.value.end : void 0;
              const last = Array.isArray(end) ? end[end.length - 1] : void 0;
              if (last?.type === "comment")
                end?.push(this.sourceToken);
              else
                map.items.push({ start: [this.sourceToken] });
            } else if (it.sep) {
              it.sep.push(this.sourceToken);
            } else {
              it.start.push(this.sourceToken);
            }
            return;
          case "space":
          case "comment":
            if (it.value) {
              map.items.push({ start: [this.sourceToken] });
            } else if (it.sep) {
              it.sep.push(this.sourceToken);
            } else {
              if (this.atIndentedComment(it.start, map.indent)) {
                const prev = map.items[map.items.length - 2];
                const end = prev?.value?.end;
                if (Array.isArray(end)) {
                  Array.prototype.push.apply(end, it.start);
                  end.push(this.sourceToken);
                  map.items.pop();
                  return;
                }
              }
              it.start.push(this.sourceToken);
            }
            return;
        }
        if (this.indent >= map.indent) {
          const atMapIndent = !this.onKeyLine && this.indent === map.indent;
          const atNextItem = atMapIndent && (it.sep || it.explicitKey) && this.type !== "seq-item-ind";
          let start = [];
          if (atNextItem && it.sep && !it.value) {
            const nl = [];
            for (let i = 0; i < it.sep.length; ++i) {
              const st = it.sep[i];
              switch (st.type) {
                case "newline":
                  nl.push(i);
                  break;
                case "space":
                  break;
                case "comment":
                  if (st.indent > map.indent)
                    nl.length = 0;
                  break;
                default:
                  nl.length = 0;
              }
            }
            if (nl.length >= 2)
              start = it.sep.splice(nl[1]);
          }
          switch (this.type) {
            case "anchor":
            case "tag":
              if (atNextItem || it.value) {
                start.push(this.sourceToken);
                map.items.push({ start });
                this.onKeyLine = true;
              } else if (it.sep) {
                it.sep.push(this.sourceToken);
              } else {
                it.start.push(this.sourceToken);
              }
              return;
            case "explicit-key-ind":
              if (!it.sep && !it.explicitKey) {
                it.start.push(this.sourceToken);
                it.explicitKey = true;
              } else if (atNextItem || it.value) {
                start.push(this.sourceToken);
                map.items.push({ start, explicitKey: true });
              } else {
                this.stack.push({
                  type: "block-map",
                  offset: this.offset,
                  indent: this.indent,
                  items: [{ start: [this.sourceToken], explicitKey: true }]
                });
              }
              this.onKeyLine = true;
              return;
            case "map-value-ind":
              if (it.explicitKey) {
                if (!it.sep) {
                  if (includesToken(it.start, "newline")) {
                    Object.assign(it, { key: null, sep: [this.sourceToken] });
                  } else {
                    const start2 = getFirstKeyStartProps(it.start);
                    this.stack.push({
                      type: "block-map",
                      offset: this.offset,
                      indent: this.indent,
                      items: [{ start: start2, key: null, sep: [this.sourceToken] }]
                    });
                  }
                } else if (it.value) {
                  map.items.push({ start: [], key: null, sep: [this.sourceToken] });
                } else if (includesToken(it.sep, "map-value-ind")) {
                  this.stack.push({
                    type: "block-map",
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start, key: null, sep: [this.sourceToken] }]
                  });
                } else if (isFlowToken(it.key) && !includesToken(it.sep, "newline")) {
                  const start2 = getFirstKeyStartProps(it.start);
                  const key = it.key;
                  const sep = it.sep;
                  sep.push(this.sourceToken);
                  delete it.key;
                  delete it.sep;
                  this.stack.push({
                    type: "block-map",
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start: start2, key, sep }]
                  });
                } else if (start.length > 0) {
                  it.sep = it.sep.concat(start, this.sourceToken);
                } else {
                  it.sep.push(this.sourceToken);
                }
              } else {
                if (!it.sep) {
                  Object.assign(it, { key: null, sep: [this.sourceToken] });
                } else if (it.value || atNextItem) {
                  map.items.push({ start, key: null, sep: [this.sourceToken] });
                } else if (includesToken(it.sep, "map-value-ind")) {
                  this.stack.push({
                    type: "block-map",
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start: [], key: null, sep: [this.sourceToken] }]
                  });
                } else {
                  it.sep.push(this.sourceToken);
                }
              }
              this.onKeyLine = true;
              return;
            case "alias":
            case "scalar":
            case "single-quoted-scalar":
            case "double-quoted-scalar": {
              const fs4 = this.flowScalar(this.type);
              if (atNextItem || it.value) {
                map.items.push({ start, key: fs4, sep: [] });
                this.onKeyLine = true;
              } else if (it.sep) {
                this.stack.push(fs4);
              } else {
                Object.assign(it, { key: fs4, sep: [] });
                this.onKeyLine = true;
              }
              return;
            }
            default: {
              const bv = this.startBlockValue(map);
              if (bv) {
                if (bv.type === "block-seq") {
                  if (!it.explicitKey && it.sep && !includesToken(it.sep, "newline")) {
                    yield* this.pop({
                      type: "error",
                      offset: this.offset,
                      message: "Unexpected block-seq-ind on same line with key",
                      source: this.source
                    });
                    return;
                  }
                } else if (atMapIndent) {
                  map.items.push({ start });
                }
                this.stack.push(bv);
                return;
              }
            }
          }
        }
        yield* this.pop();
        yield* this.step();
      }
      *blockSequence(seq) {
        const it = seq.items[seq.items.length - 1];
        switch (this.type) {
          case "newline":
            if (it.value) {
              const end = "end" in it.value ? it.value.end : void 0;
              const last = Array.isArray(end) ? end[end.length - 1] : void 0;
              if (last?.type === "comment")
                end?.push(this.sourceToken);
              else
                seq.items.push({ start: [this.sourceToken] });
            } else
              it.start.push(this.sourceToken);
            return;
          case "space":
          case "comment":
            if (it.value)
              seq.items.push({ start: [this.sourceToken] });
            else {
              if (this.atIndentedComment(it.start, seq.indent)) {
                const prev = seq.items[seq.items.length - 2];
                const end = prev?.value?.end;
                if (Array.isArray(end)) {
                  Array.prototype.push.apply(end, it.start);
                  end.push(this.sourceToken);
                  seq.items.pop();
                  return;
                }
              }
              it.start.push(this.sourceToken);
            }
            return;
          case "anchor":
          case "tag":
            if (it.value || this.indent <= seq.indent)
              break;
            it.start.push(this.sourceToken);
            return;
          case "seq-item-ind":
            if (this.indent !== seq.indent)
              break;
            if (it.value || includesToken(it.start, "seq-item-ind"))
              seq.items.push({ start: [this.sourceToken] });
            else
              it.start.push(this.sourceToken);
            return;
        }
        if (this.indent > seq.indent) {
          const bv = this.startBlockValue(seq);
          if (bv) {
            this.stack.push(bv);
            return;
          }
        }
        yield* this.pop();
        yield* this.step();
      }
      *flowCollection(fc) {
        const it = fc.items[fc.items.length - 1];
        if (this.type === "flow-error-end") {
          let top;
          do {
            yield* this.pop();
            top = this.peek(1);
          } while (top?.type === "flow-collection");
        } else if (fc.end.length === 0) {
          switch (this.type) {
            case "comma":
            case "explicit-key-ind":
              if (!it || it.sep)
                fc.items.push({ start: [this.sourceToken] });
              else
                it.start.push(this.sourceToken);
              return;
            case "map-value-ind":
              if (!it || it.value)
                fc.items.push({ start: [], key: null, sep: [this.sourceToken] });
              else if (it.sep)
                it.sep.push(this.sourceToken);
              else
                Object.assign(it, { key: null, sep: [this.sourceToken] });
              return;
            case "space":
            case "comment":
            case "newline":
            case "anchor":
            case "tag":
              if (!it || it.value)
                fc.items.push({ start: [this.sourceToken] });
              else if (it.sep)
                it.sep.push(this.sourceToken);
              else
                it.start.push(this.sourceToken);
              return;
            case "alias":
            case "scalar":
            case "single-quoted-scalar":
            case "double-quoted-scalar": {
              const fs4 = this.flowScalar(this.type);
              if (!it || it.value)
                fc.items.push({ start: [], key: fs4, sep: [] });
              else if (it.sep)
                this.stack.push(fs4);
              else
                Object.assign(it, { key: fs4, sep: [] });
              return;
            }
            case "flow-map-end":
            case "flow-seq-end":
              fc.end.push(this.sourceToken);
              return;
          }
          const bv = this.startBlockValue(fc);
          if (bv)
            this.stack.push(bv);
          else {
            yield* this.pop();
            yield* this.step();
          }
        } else {
          const parent = this.peek(2);
          if (parent.type === "block-map" && (this.type === "map-value-ind" && parent.indent === fc.indent || this.type === "newline" && !parent.items[parent.items.length - 1].sep)) {
            yield* this.pop();
            yield* this.step();
          } else if (this.type === "map-value-ind" && parent.type !== "flow-collection") {
            const prev = getPrevProps(parent);
            const start = getFirstKeyStartProps(prev);
            fixFlowSeqItems(fc);
            const sep = fc.end.splice(1, fc.end.length);
            sep.push(this.sourceToken);
            const map = {
              type: "block-map",
              offset: fc.offset,
              indent: fc.indent,
              items: [{ start, key: fc, sep }]
            };
            this.onKeyLine = true;
            this.stack[this.stack.length - 1] = map;
          } else {
            yield* this.lineEnd(fc);
          }
        }
      }
      flowScalar(type) {
        if (this.onNewLine) {
          let nl = this.source.indexOf("\n") + 1;
          while (nl !== 0) {
            this.onNewLine(this.offset + nl);
            nl = this.source.indexOf("\n", nl) + 1;
          }
        }
        return {
          type,
          offset: this.offset,
          indent: this.indent,
          source: this.source
        };
      }
      startBlockValue(parent) {
        switch (this.type) {
          case "alias":
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar":
            return this.flowScalar(this.type);
          case "block-scalar-header":
            return {
              type: "block-scalar",
              offset: this.offset,
              indent: this.indent,
              props: [this.sourceToken],
              source: ""
            };
          case "flow-map-start":
          case "flow-seq-start":
            return {
              type: "flow-collection",
              offset: this.offset,
              indent: this.indent,
              start: this.sourceToken,
              items: [],
              end: []
            };
          case "seq-item-ind":
            return {
              type: "block-seq",
              offset: this.offset,
              indent: this.indent,
              items: [{ start: [this.sourceToken] }]
            };
          case "explicit-key-ind": {
            this.onKeyLine = true;
            const prev = getPrevProps(parent);
            const start = getFirstKeyStartProps(prev);
            start.push(this.sourceToken);
            return {
              type: "block-map",
              offset: this.offset,
              indent: this.indent,
              items: [{ start, explicitKey: true }]
            };
          }
          case "map-value-ind": {
            this.onKeyLine = true;
            const prev = getPrevProps(parent);
            const start = getFirstKeyStartProps(prev);
            return {
              type: "block-map",
              offset: this.offset,
              indent: this.indent,
              items: [{ start, key: null, sep: [this.sourceToken] }]
            };
          }
        }
        return null;
      }
      atIndentedComment(start, indent) {
        if (this.type !== "comment")
          return false;
        if (this.indent <= indent)
          return false;
        return start.every((st) => st.type === "newline" || st.type === "space");
      }
      *documentEnd(docEnd) {
        if (this.type !== "doc-mode") {
          if (docEnd.end)
            docEnd.end.push(this.sourceToken);
          else
            docEnd.end = [this.sourceToken];
          if (this.type === "newline")
            yield* this.pop();
        }
      }
      *lineEnd(token) {
        switch (this.type) {
          case "comma":
          case "doc-start":
          case "doc-end":
          case "flow-seq-end":
          case "flow-map-end":
          case "map-value-ind":
            yield* this.pop();
            yield* this.step();
            break;
          case "newline":
            this.onKeyLine = false;
          // fallthrough
          case "space":
          case "comment":
          default:
            if (token.end)
              token.end.push(this.sourceToken);
            else
              token.end = [this.sourceToken];
            if (this.type === "newline")
              yield* this.pop();
        }
      }
    };
    exports.Parser = Parser;
  }
});

// node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/public-api.js
var require_public_api = __commonJS({
  "node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/public-api.js"(exports) {
    "use strict";
    var composer = require_composer();
    var Document = require_Document();
    var errors = require_errors();
    var log = require_log();
    var identity = require_identity();
    var lineCounter = require_line_counter();
    var parser = require_parser();
    function parseOptions(options) {
      const prettyErrors = options.prettyErrors !== false;
      const lineCounter$1 = options.lineCounter || prettyErrors && new lineCounter.LineCounter() || null;
      return { lineCounter: lineCounter$1, prettyErrors };
    }
    function parseAllDocuments(source, options = {}) {
      const { lineCounter: lineCounter2, prettyErrors } = parseOptions(options);
      const parser$1 = new parser.Parser(lineCounter2?.addNewLine);
      const composer$1 = new composer.Composer(options);
      const docs = Array.from(composer$1.compose(parser$1.parse(source)));
      if (prettyErrors && lineCounter2)
        for (const doc of docs) {
          doc.errors.forEach(errors.prettifyError(source, lineCounter2));
          doc.warnings.forEach(errors.prettifyError(source, lineCounter2));
        }
      if (docs.length > 0)
        return docs;
      return Object.assign([], { empty: true }, composer$1.streamInfo());
    }
    function parseDocument(source, options = {}) {
      const { lineCounter: lineCounter2, prettyErrors } = parseOptions(options);
      const parser$1 = new parser.Parser(lineCounter2?.addNewLine);
      const composer$1 = new composer.Composer(options);
      let doc = null;
      for (const _doc of composer$1.compose(parser$1.parse(source), true, source.length)) {
        if (!doc)
          doc = _doc;
        else if (doc.options.logLevel !== "silent") {
          doc.errors.push(new errors.YAMLParseError(_doc.range.slice(0, 2), "MULTIPLE_DOCS", "Source contains multiple documents; please use YAML.parseAllDocuments()"));
          break;
        }
      }
      if (prettyErrors && lineCounter2) {
        doc.errors.forEach(errors.prettifyError(source, lineCounter2));
        doc.warnings.forEach(errors.prettifyError(source, lineCounter2));
      }
      return doc;
    }
    function parse(src, reviver, options) {
      let _reviver = void 0;
      if (typeof reviver === "function") {
        _reviver = reviver;
      } else if (options === void 0 && reviver && typeof reviver === "object") {
        options = reviver;
      }
      const doc = parseDocument(src, options);
      if (!doc)
        return null;
      doc.warnings.forEach((warning) => log.warn(doc.options.logLevel, warning));
      if (doc.errors.length > 0) {
        if (doc.options.logLevel !== "silent")
          throw doc.errors[0];
        else
          doc.errors = [];
      }
      return doc.toJS(Object.assign({ reviver: _reviver }, options));
    }
    function stringify(value, replacer, options) {
      let _replacer = null;
      if (typeof replacer === "function" || Array.isArray(replacer)) {
        _replacer = replacer;
      } else if (options === void 0 && replacer) {
        options = replacer;
      }
      if (typeof options === "string")
        options = options.length;
      if (typeof options === "number") {
        const indent = Math.round(options);
        options = indent < 1 ? void 0 : indent > 8 ? { indent: 8 } : { indent };
      }
      if (value === void 0) {
        const { keepUndefined } = options ?? replacer ?? {};
        if (!keepUndefined)
          return void 0;
      }
      if (identity.isDocument(value) && !_replacer)
        return value.toString(options);
      return new Document.Document(value, _replacer, options).toString(options);
    }
    exports.parse = parse;
    exports.parseAllDocuments = parseAllDocuments;
    exports.parseDocument = parseDocument;
    exports.stringify = stringify;
  }
});

// node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/index.js
var require_dist = __commonJS({
  "node_modules/.pnpm/yaml@2.8.4/node_modules/yaml/dist/index.js"(exports) {
    "use strict";
    var composer = require_composer();
    var Document = require_Document();
    var Schema = require_Schema();
    var errors = require_errors();
    var Alias = require_Alias();
    var identity = require_identity();
    var Pair = require_Pair();
    var Scalar = require_Scalar();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var cst = require_cst();
    var lexer = require_lexer();
    var lineCounter = require_line_counter();
    var parser = require_parser();
    var publicApi = require_public_api();
    var visit = require_visit();
    exports.Composer = composer.Composer;
    exports.Document = Document.Document;
    exports.Schema = Schema.Schema;
    exports.YAMLError = errors.YAMLError;
    exports.YAMLParseError = errors.YAMLParseError;
    exports.YAMLWarning = errors.YAMLWarning;
    exports.Alias = Alias.Alias;
    exports.isAlias = identity.isAlias;
    exports.isCollection = identity.isCollection;
    exports.isDocument = identity.isDocument;
    exports.isMap = identity.isMap;
    exports.isNode = identity.isNode;
    exports.isPair = identity.isPair;
    exports.isScalar = identity.isScalar;
    exports.isSeq = identity.isSeq;
    exports.Pair = Pair.Pair;
    exports.Scalar = Scalar.Scalar;
    exports.YAMLMap = YAMLMap.YAMLMap;
    exports.YAMLSeq = YAMLSeq.YAMLSeq;
    exports.CST = cst;
    exports.Lexer = lexer.Lexer;
    exports.LineCounter = lineCounter.LineCounter;
    exports.Parser = parser.Parser;
    exports.parse = publicApi.parse;
    exports.parseAllDocuments = publicApi.parseAllDocuments;
    exports.parseDocument = publicApi.parseDocument;
    exports.stringify = publicApi.stringify;
    exports.visit = visit.visit;
    exports.visitAsync = visit.visitAsync;
  }
});

// node_modules/.pnpm/picocolors@1.1.1/node_modules/picocolors/picocolors.js
var require_picocolors = __commonJS({
  "node_modules/.pnpm/picocolors@1.1.1/node_modules/picocolors/picocolors.js"(exports, module) {
    "use strict";
    var p = process || {};
    var argv = p.argv || [];
    var env = p.env || {};
    var isColorSupported = !(!!env.NO_COLOR || argv.includes("--no-color")) && (!!env.FORCE_COLOR || argv.includes("--color") || p.platform === "win32" || (p.stdout || {}).isTTY && env.TERM !== "dumb" || !!env.CI);
    var formatter = (open, close, replace = open) => (input2) => {
      let string = "" + input2, index = string.indexOf(close, open.length);
      return ~index ? open + replaceClose(string, close, replace, index) + close : open + string + close;
    };
    var replaceClose = (string, close, replace, index) => {
      let result = "", cursor = 0;
      do {
        result += string.substring(cursor, index) + replace;
        cursor = index + close.length;
        index = string.indexOf(close, cursor);
      } while (~index);
      return result + string.substring(cursor);
    };
    var createColors = (enabled = isColorSupported) => {
      let f = enabled ? formatter : () => String;
      return {
        isColorSupported: enabled,
        reset: f("\x1B[0m", "\x1B[0m"),
        bold: f("\x1B[1m", "\x1B[22m", "\x1B[22m\x1B[1m"),
        dim: f("\x1B[2m", "\x1B[22m", "\x1B[22m\x1B[2m"),
        italic: f("\x1B[3m", "\x1B[23m"),
        underline: f("\x1B[4m", "\x1B[24m"),
        inverse: f("\x1B[7m", "\x1B[27m"),
        hidden: f("\x1B[8m", "\x1B[28m"),
        strikethrough: f("\x1B[9m", "\x1B[29m"),
        black: f("\x1B[30m", "\x1B[39m"),
        red: f("\x1B[31m", "\x1B[39m"),
        green: f("\x1B[32m", "\x1B[39m"),
        yellow: f("\x1B[33m", "\x1B[39m"),
        blue: f("\x1B[34m", "\x1B[39m"),
        magenta: f("\x1B[35m", "\x1B[39m"),
        cyan: f("\x1B[36m", "\x1B[39m"),
        white: f("\x1B[37m", "\x1B[39m"),
        gray: f("\x1B[90m", "\x1B[39m"),
        bgBlack: f("\x1B[40m", "\x1B[49m"),
        bgRed: f("\x1B[41m", "\x1B[49m"),
        bgGreen: f("\x1B[42m", "\x1B[49m"),
        bgYellow: f("\x1B[43m", "\x1B[49m"),
        bgBlue: f("\x1B[44m", "\x1B[49m"),
        bgMagenta: f("\x1B[45m", "\x1B[49m"),
        bgCyan: f("\x1B[46m", "\x1B[49m"),
        bgWhite: f("\x1B[47m", "\x1B[49m"),
        blackBright: f("\x1B[90m", "\x1B[39m"),
        redBright: f("\x1B[91m", "\x1B[39m"),
        greenBright: f("\x1B[92m", "\x1B[39m"),
        yellowBright: f("\x1B[93m", "\x1B[39m"),
        blueBright: f("\x1B[94m", "\x1B[39m"),
        magentaBright: f("\x1B[95m", "\x1B[39m"),
        cyanBright: f("\x1B[96m", "\x1B[39m"),
        whiteBright: f("\x1B[97m", "\x1B[39m"),
        bgBlackBright: f("\x1B[100m", "\x1B[49m"),
        bgRedBright: f("\x1B[101m", "\x1B[49m"),
        bgGreenBright: f("\x1B[102m", "\x1B[49m"),
        bgYellowBright: f("\x1B[103m", "\x1B[49m"),
        bgBlueBright: f("\x1B[104m", "\x1B[49m"),
        bgMagentaBright: f("\x1B[105m", "\x1B[49m"),
        bgCyanBright: f("\x1B[106m", "\x1B[49m"),
        bgWhiteBright: f("\x1B[107m", "\x1B[49m")
      };
    };
    module.exports = createColors();
    module.exports.createColors = createColors;
  }
});

// src/action-runner.ts
import fs3 from "fs/promises";
import path3 from "path";

// src/config.ts
import fs from "fs/promises";
import path from "path";
var EMPTY = { ignore: [], ignorePaths: [] };
var CONFIG_FILENAMES = ["agentci.config.json", ".agentcirc.json"];
async function loadConfig(root, explicitPath) {
  const candidates = explicitPath ? [path.resolve(explicitPath)] : CONFIG_FILENAMES.map((name) => path.join(root, name));
  for (const file of candidates) {
    let raw;
    try {
      raw = await fs.readFile(file, "utf8");
    } catch (error) {
      if (explicitPath) {
        const detail = error instanceof Error ? `: ${error.message}` : "";
        throw new Error(`Unable to read config file ${file}${detail}`);
      }
      continue;
    }
    const parsed = JSON.parse(raw);
    return {
      ignore: toStringArray(parsed.ignore),
      ignorePaths: toStringArray(parsed.ignorePaths),
      defaultPermissions: normalizeDefaultPermissions(
        parsed.defaultPermissions
      )
    };
  }
  return EMPTY;
}
function toStringArray(value) {
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
}
function normalizeDefaultPermissions(value) {
  if (value === void 0) return void 0;
  if (value === "unknown" || value === "none" || value === "read-all" || value === "write-all") {
    return value;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(
      "defaultPermissions must be unknown, none, read-all, write-all, or a permission map."
    );
  }
  const normalized = {};
  for (const [scope, level] of Object.entries(value)) {
    if (level !== "none" && level !== "read" && level !== "write") {
      throw new Error(
        `defaultPermissions.${scope} must be none, read, or write.`
      );
    }
    normalized[scope] = level;
  }
  return normalized;
}
function parseInlineIgnores(raw) {
  const rules = /* @__PURE__ */ new Set();
  let all = false;
  for (const line of raw.split("\n")) {
    if (/^#\s*agentci-ignore-all\b/i.test(line)) {
      all = true;
      continue;
    }
    const match = /^#\s*agentci-ignore\s+([^\n]+)/i.exec(line);
    if (!match) continue;
    const spec = match[1].split("--")[0];
    for (const id of spec.split(/[\s,]+/)) {
      if (id) rules.add(id);
    }
  }
  return { all, rules };
}
function matchesPath(glob, target) {
  const pattern = glob.split("**").map(
    (part) => part.split("*").map((segment) => segment.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join("[^/]*")
  ).join(".*");
  return new RegExp(`^${pattern}$`).test(target);
}

// src/detect.ts
var AI_AGENT_ACTION_PATTERNS = [
  /anthropics\/claude-code(?:-base)?-action/i,
  /\banthropics\/[\w.-]*claude/i,
  /\baider-ai\/aider\b/i,
  /\bsweepai\//i,
  // The OpenHands organization renamed from All-Hands-AI and publishes agents
  // under repositories other than `openhands` (extensions, software-agent-sdk),
  // so the org is anchored and the repository left open. Both legacy org names
  // are kept because pinned older references stay valid indefinitely.
  /^openhands\/[\w.-]+/i,
  /(?:all-hands-ai|opendevin)\/[\w.-]*(?:openhands|opendevin|extensions|software-agent-sdk)/i,
  /\bcontinuedev\//i,
  /\bblock\/goose\b|\bgoose-ai\//i,
  /\bgithub\/copilot[\w-]*agent/i,
  /\bopenai\/codex[\w-]*/i,
  // Google's Gemini CLI action and its archived predecessor. Exact repository
  // names, because the google-github-actions organization also publishes
  // auth, setup-gcloud, and deploy actions that are not agents. Its action.yml
  // (upstream main, read 2026-09-05) defaults `github_issue_number` and
  // `github_pr_number` to the triggering event's payload and takes a
  // `settings` JSON that configures MCP servers, so it operates on the event
  // like the other agent actions; it documents no write-access gate.
  /\bgoogle-github-actions\/run-gemini-cli(?=@|\s|$)/i,
  /\bgoogle-gemini\/gemini-cli-action(?=@|\s|$)/i
];
var AI_AGENT_CLI_PATTERNS = [
  /(?:^|[\n;&|()]\s*)(?:(?:sudo|command|exec|npx|uvx)\s+)*claude(?=[\s;&|)]|$)(?![ \t]+(?:--version|--help|-h)(?:[\s;&|)]|$))/im,
  /(?:^|[\n;&|()]\s*)(?:(?:sudo|command|exec|uvx)\s+|npx\s+(?:(?:-y|--yes)\s+)*)*@anthropic-ai\/claude-code(?:@[A-Za-z0-9^~][A-Za-z0-9._+^~-]*)?(?=[\s;&|)]|$)(?![ \t]+(?:--version|--help|-h)(?:[\s;&|)]|$))/im,
  /(?:^|[\n;&|()]\s*)(?:(?:sudo|command|exec|npx|uvx)\s+)*(?:python3?\s+-m\s+)?aider(?=[\s;&|)]|$)(?![ \t]+(?:--version|--help|-h)(?:[\s;&|)]|$))/im,
  /(?:^|[\n;&|()]\s*)(?:(?:sudo|command|exec|npx|uvx)\s+)*cursor-agent(?=[\s;&|)]|$)(?![ \t]+(?:--version|--help|-h)(?:[\s;&|)]|$))/im,
  /(?:^|[\n;&|()]\s*)(?:(?:sudo|command|exec|npx|uvx)\s+)*codex[ \t]+(?:exec|run)(?:[\s]|$)/im
];
var AI_AGENT_API_PATTERNS = [
  /https?:\/\/api\.cursor\.com\/v1\/agents(?:\/[^/\s"'?#]+\/runs)?(?=$|[\s"'?#\\])/i,
  /https?:\/\/api\.cursor\.com\/v0\/agents(?:\/[^/\s"'?#]+\/followup)?(?=$|[\s"'?#\\])/i,
  /https?:\/\/api\.devin\.ai\/v1\/sessions(?=$|[\s"'?#\\])/i,
  /https?:\/\/api\.devin\.ai\/v3\/organizations\/[^/\s"'?#]+\/sessions(?=$|[\s"'?#\\])/i,
  /https?:\/\/api\.github\.com\/agents\/repos\/[^/\s"'?#]+\/[^/\s"'?#]+\/tasks(?=$|[\s"'?#\\])/i
];
var AI_AGENT_PATTERNS = [
  ...AI_AGENT_ACTION_PATTERNS,
  ...AI_AGENT_CLI_PATTERNS
];
var UNTRUSTED_CONTEXT_PATTERNS = [
  {
    pattern: /github\.event\.pull_request\.(body|title)/i,
    source: "pull_request",
    events: [
      "pull_request",
      "pull_request_target",
      "pull_request_review",
      "pull_request_review_comment"
    ],
    parentEvents: ["pull_request_review", "pull_request_review_comment"]
  },
  {
    pattern: /github\.event\.pull_request\.head\.ref/i,
    source: "pr_head_ref",
    events: [
      "pull_request",
      "pull_request_target",
      "pull_request_review",
      "pull_request_review_comment"
    ],
    parentEvents: ["pull_request_review", "pull_request_review_comment"]
  },
  {
    pattern: /github\.event\.issue\.(body|title)/i,
    source: "issue",
    events: ["issues", "issue_comment"],
    parentEvents: ["issue_comment"]
  },
  {
    pattern: /github\.event\.discussion\.(body|title)/i,
    source: "discussion",
    events: ["discussion", "discussion_comment"],
    parentEvents: ["discussion_comment"]
  },
  {
    pattern: /github\.event\.comment\.body/i,
    source: "comment",
    events: [
      "issue_comment",
      "discussion_comment",
      "pull_request_review_comment"
    ]
  },
  {
    pattern: /github\.event\.review\.body/i,
    source: "review",
    events: ["pull_request_review"]
  },
  {
    pattern: /github\.event\.review_comment\.body/i,
    source: "comment",
    events: ["pull_request_review_comment"]
  },
  {
    pattern: /github\.event\.head_commit\.message/i,
    source: "commit",
    events: ["push"]
  },
  {
    pattern: /github\.head_ref/i,
    source: "pr_head_ref",
    events: ["pull_request", "pull_request_target"]
  },
  {
    pattern: /github\.ref_name/i,
    source: "other",
    events: ["*"]
  }
];
var SECRET_PATTERNS = [
  /secrets\.[A-Za-z0-9_]+/i,
  /\$\{\{[^}]*\bsecrets\s*\[[^\]]+\]/i,
  /\$\{\{[^}]*\btoJSON\s*\(\s*secrets\s*\)/i,
  /github\.token/i,
  /\$\{\{\s*(?:env\.)?[A-Z0-9_]*(?:TOKEN|KEY)\s*\}\}/
];
var SHELL_TOOL_PATTERN = /(?:^|[\s,[("'`])(?:Bash|Shell)(?=$|[\s,(\])}"'`])/i;
var SHELL_ARGUMENT_PATTERN = /(?:--allowedTools?\s+[^\n]*(?:Bash|Shell)|--dangerously-skip-permissions)\b/i;
function isSelfGatingAgentAction(uses) {
  return /^anthropics\/claude-code-action(?:@|$)/i.test(uses.trim());
}
function hasAgentGateBypass(withBlock) {
  if (!withBlock || typeof withBlock !== "object") return false;
  for (const key of ["allowed_non_write_users", "allowed_bots"]) {
    const value = withBlock[key];
    if (value === void 0 || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (key === "allowed_non_write_users" && !String(withBlock.github_token ?? "").trim()) {
      continue;
    }
    return true;
  }
  return false;
}
var SELF_GATED_EVENTS = /* @__PURE__ */ new Set([
  "issues",
  "issue_comment",
  "pull_request",
  "pull_request_review",
  "pull_request_review_comment"
]);
function looksLikeAiAction(value) {
  const reference = value.trim().replace(/^docker:\/\/(?:(?:localhost|[^/]*[.:][^/]*)\/)?/i, "");
  return AI_AGENT_ACTION_PATTERNS.some(
    (pattern) => pattern.exec(reference)?.index === 0
  );
}
function shellWords(value) {
  const words = [];
  let text = "";
  let expandableText = "";
  let quote = "";
  let started = false;
  let escaped = false;
  let wordStart = 0;
  const push = (end) => {
    if (started)
      words.push({ text, expandableText, raw: value.slice(wordStart, end) });
    text = "";
    expandableText = "";
    started = false;
  };
  for (let index = 0; index < value.length; index++) {
    if (!started) wordStart = index;
    const character = value[index];
    if (escaped) {
      text += character;
      if (character !== "$") expandableText += character;
      escaped = false;
    } else if (value.startsWith("${{", index)) {
      const end = githubExpressionEnd(value, index);
      if (end < 0) {
        text += character;
        if (quote !== "'") expandableText += character;
      } else {
        const expression = value.slice(index, end);
        text += expression;
        expandableText += expression;
        index = end - 1;
      }
    } else if (character === "\\" && quote !== "'") {
      escaped = true;
    } else if (quote) {
      if (character === quote) quote = "";
      else {
        text += character;
        if (quote !== "'") expandableText += character;
      }
    } else if (character === "'" || character === '"') {
      quote = character;
    } else if (character === "#" && !started) {
      break;
    } else if (/\s/.test(character)) {
      push(index);
      continue;
    } else {
      text += character;
      expandableText += character;
    }
    started = true;
  }
  push(value.length);
  return words;
}
function heredocDelimiter(line) {
  let quote = "";
  let escaped = false;
  for (let index = 0; index < line.length - 1; index++) {
    const character = line[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\" && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = "";
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if (character === "#" && (index === 0 || /\s/.test(line[index - 1]))) break;
    if (line.startsWith("${{", index)) {
      const end = githubExpressionEnd(line, index);
      if (end >= 0) index = end - 1;
      continue;
    }
    if (line.startsWith("<<<", index) || !line.startsWith("<<", index))
      continue;
    const operand = line.slice(index + 2).match(
      /^-?\s*(?:'([A-Za-z_][\w-]*)'|"([A-Za-z_][\w-]*)"|([A-Za-z_][\w-]*))/
    );
    if (operand) return operand[1] ?? operand[2] ?? operand[3];
  }
  return "";
}
function shellScriptWithoutHeredocBodies(value) {
  let heredoc = "";
  return value.replace(/\\\r?\n/g, " ").split("\n").filter((line) => {
    if (heredoc) {
      if (line.trim() === heredoc) heredoc = "";
      return false;
    }
    heredoc = heredocDelimiter(line);
    return true;
  }).join("\n");
}
function githubExpressionEnd(value, start) {
  let quoted = false;
  for (let index = start + 3; index < value.length; index++) {
    if (value[index] === "'") {
      if (quoted && value[index + 1] === "'") index++;
      else quoted = !quoted;
    } else if (!quoted && value.startsWith("}}", index)) {
      return index + 2;
    }
  }
  return -1;
}
function commandSubstitutionEnd(value, start) {
  let depth = 1;
  let quote = "";
  let escaped = false;
  for (let index = start + 2; index < value.length; index++) {
    const character = value[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\" && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = "";
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if (value.startsWith("${{", index)) {
      const end = githubExpressionEnd(value, index);
      if (end >= 0) index = end - 1;
      continue;
    }
    if (character === "(") depth++;
    if (character === ")" && --depth === 0) return index + 1;
  }
  return -1;
}
function shellCommandSegments(value) {
  const script = shellScriptWithoutHeredocBodies(value);
  const segments = [];
  let start = 0;
  let quote = "";
  let escaped = false;
  let pipeline = "";
  let separatorBefore = "";
  const push = (end, separator) => {
    const command = script.slice(start, end).trim();
    if (!command && separator === "\n" && ["&&", "||", "|", "|&"].includes(separatorBefore)) {
      start = end + 1;
      return;
    }
    if (command || separator === ")")
      segments.push({
        command,
        pipedInput: pipeline,
        separatorBefore,
        separatorAfter: separator
      });
    pipeline = separator === "|" || separator === "|&" ? [pipeline, command].filter(Boolean).join("\n") : "";
    separatorBefore = separator;
    start = end + separator.length;
  };
  for (let index = 0; index < script.length; index++) {
    const character = script[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\" && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = "";
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if (script.startsWith("${{", index)) {
      const end = githubExpressionEnd(script, index);
      if (end >= 0) {
        index = end - 1;
        continue;
      }
    }
    if (script.startsWith("$(", index)) {
      const end = commandSubstitutionEnd(script, index);
      index = end >= 0 ? end - 1 : script.length - 1;
      continue;
    }
    if (character === "#" && (index === 0 || /[\s;&|()]/.test(script[index - 1]))) {
      const newline = script.indexOf("\n", index);
      push(index, newline >= 0 ? "\n" : "");
      start = newline >= 0 ? newline + 1 : script.length;
      index = newline >= 0 ? newline : script.length;
      continue;
    }
    if (character === "&" && script[index - 1] === ">") continue;
    if (character === "(" || character === "\n") {
      const prefix = script.slice(Math.max(start, script.lastIndexOf("{", index - 1) + 1), index).trim();
      const declarator = /^(?:(?:if|elif|while|until|then|else|do)\s+)?(?:function\s+)?(?:[A-Za-z_]\w*|:)(?:\s*\(\s*\))?$/;
      if (declarator.test(prefix)) {
        if (character === "(") {
          const emptyParameters = /^\(\s*\)/.exec(script.slice(index));
          if (emptyParameters && !/\(\s*\)$/.test(prefix)) {
            index += emptyParameters[0].length - 1;
            continue;
          }
          if (/\(\s*\)$/.test(prefix) || /(?:^|\s)function\s+/.test(prefix))
            continue;
        }
        if (character === "\n" && (/\(\s*\)$/.test(prefix) || /(?:^|\s)function\s+/.test(prefix)))
          continue;
      }
    }
    if ("\n;&|()".includes(character)) {
      const next = script[index + 1];
      const paired = (character === "&" || character === "|") && next === character || character === "|" && next === "&";
      const separator = paired ? character + next : character;
      push(index, separator);
      if (paired) index++;
    }
  }
  push(script.length, "");
  return segments;
}
function hasOpaqueAiShellGrouping(value) {
  return shellCommandSegments(value).some(
    (segment) => segment.separatorBefore === "("
  );
}
function shellAnd(left, right) {
  if (left === false || right === false) return false;
  return left === "unknown" || right === "unknown" ? "unknown" : true;
}
function shellNot(value) {
  return value === "unknown" ? value : !value;
}
function shellOr(left, right) {
  return shellNot(shellAnd(shellNot(left), shellNot(right)));
}
function literalShellCondition(value, shadowed) {
  if (shadowed.has(value.replace(/^! /, ""))) return "unknown";
  if (value === "true" || value === ":") return true;
  if (value === "false") return false;
  if (value === "! true") return false;
  if (value === "! false") return true;
  return "unknown";
}
var SHELL_FUNCTION_HEADER = /^(?:function\s+([A-Za-z_]\w*|:)(?:\s*\(\s*\))?|([A-Za-z_]\w*|:)\s*\(\s*\))\s*(\{|\(|(?=(?:if|for|select|while|until|case)\b|\[\[))/;
function shellExecutableSegments(value) {
  const executable = [];
  const frames = [];
  const shadowed = /* @__PURE__ */ new Set();
  const deferredShadows = /* @__PURE__ */ new Map();
  const deferredCalls = /* @__PURE__ */ new Map();
  let pendingFunction = "";
  let previousStatus = "unknown";
  let controlTransferSeen = false;
  const reach = () => frames.reduce(
    (current, frame) => shellAnd(current, shellAnd(frame.entered, frame.active)),
    true
  );
  const definitionReach = () => frames.reduce(
    (current, frame) => shellAnd(
      current,
      shellAnd(
        frame.entered,
        frame.kind === "function" ? true : frame.active
      )
    ),
    true
  );
  const closeFunction = (end) => {
    const frame = frames.at(-1);
    if (frame?.kind === "function" && frame.end === end) frames.pop();
  };
  const functionParenthesis = (separator) => {
    for (let index = frames.length - 1; index >= 0; index--) {
      const frame = frames[index];
      if (frame.kind !== "function" || frame.end !== ")") continue;
      if (separator === "(") frame.depth++;
      if (separator === ")" && --frame.depth === 0 && frames.at(-1) === frame)
        frames.pop();
      return;
    }
  };
  for (const segment of shellCommandSegments(value)) {
    if (!segment.command && segment.separatorAfter === ")") {
      functionParenthesis(")");
      continue;
    }
    let command = pendingFunction && segment.separatorBefore === "\n" && /^(?:\{|\(|if|for|select|while|until|case|\[\[)(?=\s|$)/.test(
      segment.command
    ) ? `${pendingFunction} ${segment.command}` : segment.command;
    pendingFunction = "";
    let startsCondition = false;
    let negated = false;
    const parent = frames.at(-1);
    const priorStatus = parent?.inCondition ? parent.condition : previousStatus;
    const gate = segment.separatorBefore === "&&" ? priorStatus : segment.separatorBefore === "||" ? shellNot(priorStatus) : true;
    while (command) {
      const functionHeader = SHELL_FUNCTION_HEADER.exec(command);
      if (functionHeader) {
        const name = functionHeader[1] ?? functionHeader[2];
        if (shellAnd(definitionReach(), gate) !== false) {
          const enclosing = [...frames].reverse().find((frame2) => frame2.kind === "function");
          if (enclosing?.kind === "function") {
            const names = deferredShadows.get(enclosing.name) ?? /* @__PURE__ */ new Set();
            names.add(name);
            deferredShadows.set(enclosing.name, names);
          } else shadowed.add(name);
        }
        command = command.slice(functionHeader[0].length).trimStart();
        const body = functionHeader[3] || command.split(/\s/, 1)[0];
        frames.push({
          kind: "function",
          name,
          entered: gate,
          active: false,
          inCondition: false,
          depth: body === "(" ? 1 : 0,
          end: body === "{" || body === "(" ? body === "{" ? "}" : ")" : body === "if" ? "fi" : body === "case" ? "esac" : body === "[[" ? "segment" : "done"
        });
        continue;
      }
      const keyword = /^(if|elif|then|else|fi|for|select|while|until|do|done|case|esac|!|\{|\})(?=\s|$)/.exec(
        command
      )?.[1];
      if (!keyword) break;
      command = command.slice(keyword.length).trimStart();
      const frame = frames.at(-1);
      if (keyword === "case") {
        frames.push({
          kind: "case",
          entered: gate,
          active: "unknown",
          inCondition: false
        });
        command = "";
        break;
      }
      if (keyword === "esac" && frame?.kind === "case") {
        frames.pop();
        closeFunction("esac");
        command = "";
        break;
      }
      if (keyword === "if") {
        frames.push({
          kind: "if",
          entered: gate,
          matched: false,
          condition: literalShellCondition(command, shadowed),
          active: true,
          inCondition: true
        });
        startsCondition = true;
        if (command.startsWith("! ")) command = command.slice(2).trimStart();
        if (SHELL_FUNCTION_HEADER.test(command)) continue;
        break;
      }
      if (keyword === "for" || keyword === "select") {
        const list = /^([A-Za-z_]\w*)\s+in\s*(.*)$/.exec(command)?.[2];
        const condition = keyword === "select" || list === void 0 ? "unknown" : list === "" ? false : /[$*?[({]/.test(list) ? "unknown" : true;
        frames.push({
          kind: "loop",
          entered: gate,
          condition,
          active: true,
          inCondition: false,
          until: false
        });
        command = "";
        break;
      }
      if (keyword === "while" || keyword === "until") {
        const condition = literalShellCondition(command, shadowed);
        frames.push({
          kind: "loop",
          entered: gate,
          condition,
          active: true,
          inCondition: true,
          until: keyword === "until"
        });
        startsCondition = true;
        if (command.startsWith("! ")) command = command.slice(2).trimStart();
        if (SHELL_FUNCTION_HEADER.test(command)) continue;
        break;
      }
      if (keyword === "then" && frame?.kind === "if") {
        frame.active = shellAnd(shellNot(frame.matched), frame.condition);
        frame.inCondition = false;
        continue;
      }
      if (keyword === "elif" && frame?.kind === "if") {
        frame.matched = shellNot(
          shellAnd(shellNot(frame.matched), shellNot(frame.condition))
        );
        frame.active = shellNot(frame.matched);
        frame.condition = literalShellCondition(command, shadowed);
        frame.inCondition = true;
        startsCondition = true;
        if (command.startsWith("! ")) command = command.slice(2).trimStart();
        if (SHELL_FUNCTION_HEADER.test(command)) continue;
        break;
      }
      if (keyword === "else" && frame?.kind === "if") {
        frame.active = shellAnd(
          shellNot(frame.matched),
          shellNot(frame.condition)
        );
        frame.inCondition = false;
        continue;
      }
      if (keyword === "do" && frame?.kind === "loop") {
        frame.active = frame.until ? shellNot(frame.condition) : frame.condition;
        frame.inCondition = false;
        continue;
      }
      if (keyword === "fi" && frame?.kind === "if") {
        frames.pop();
        closeFunction("fi");
        command = "";
        break;
      }
      if (keyword === "done" && frame?.kind === "loop") {
        frames.pop();
        closeFunction("done");
        command = "";
        break;
      }
      if (keyword === "}" && (frame?.kind === "function" && frame.end === "}" || frame?.kind === "group")) {
        frames.pop();
        command = "";
        break;
      }
      if (keyword === "!") {
        negated = !negated;
        continue;
      }
      if (keyword === "{") {
        frames.push({
          kind: "group",
          entered: gate,
          active: true,
          inCondition: false
        });
        continue;
      }
      command = "";
      break;
    }
    const conditionFrame = frames.at(-1);
    const conditionValue = negated ? shellNot(literalShellCondition(command, shadowed)) : literalShellCondition(command, shadowed);
    const current = shellAnd(
      shellAnd(reach(), gate),
      controlTransferSeen ? "unknown" : true
    );
    if (!startsCondition && conditionFrame?.inCondition && command && (segment.separatorBefore === "&&" || segment.separatorBefore === "||" || segment.separatorBefore === ";" || segment.separatorBefore === "\n" || segment.separatorBefore === "|" || segment.separatorBefore === "|&" || segment.separatorBefore === "&")) {
      conditionFrame.condition = ["|", "|&", "&"].includes(
        segment.separatorBefore
      ) ? "unknown" : segment.separatorBefore === "&&" ? shellAnd(conditionFrame.condition, conditionValue) : segment.separatorBefore === "||" ? shellOr(conditionFrame.condition, conditionValue) : conditionValue;
    }
    const functionBody = frames.some((frame) => frame.kind === "function");
    if (command && (current !== false || functionBody))
      executable.push({
        command,
        pipedInput: segment.pipedInput,
        reach: current,
        functionBody
      });
    previousStatus = ["|", "|&", "&"].includes(segment.separatorBefore) ? "unknown" : conditionFrame?.inCondition ? conditionFrame.condition : command ? gate === false ? priorStatus : gate === "unknown" ? "unknown" : conditionValue : "unknown";
    if (/^(?:function\s+(?:[A-Za-z_]\w*|:)(?:\s*\(\s*\))?|(?:[A-Za-z_]\w*|:)\s*\(\s*\))$/.test(
      command
    ))
      pendingFunction = command;
    if (command && (functionBody || current !== false)) {
      const words = shellWords(command);
      let index = 0;
      while (/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[index]?.raw ?? "")) index++;
      if (!startsCondition && index === 0 && words[0]?.raw === "time") {
        index = words[1]?.raw === "-p" ? 2 : 1;
        while (words[index]?.raw === "!") index++;
      }
      const call = words[index];
      const evalWords = evalLaunchedCommand(words);
      const evalCall = evalWords[0]?.text === "eval";
      const evalScript = evalCall ? evalWords.slice(1).map((word) => word.text).join(" ") : "";
      const simpleEval = /^[A-Za-z_]\w*(?:[ \t]+[A-Za-z0-9_./:+-]+)*$/.test(evalScript) && !/^(?:time|eval|command|builtin|exec|source)\b/.test(evalScript);
      const invoked = evalCall ? simpleEval ? shellWords(evalScript)[0] : void 0 : call;
      const opaqueCall = /[$`*?{}\[\]]/.test(invoked?.expandableText ?? "") || evalCall && evalScript !== "" && !simpleEval;
      const calls = opaqueCall ? ["*"] : invoked ? [invoked.text] : [];
      if (functionBody && shellAnd(definitionReach(), gate) !== false) {
        const enclosing = [...frames].reverse().find((frame) => frame.kind === "function");
        if (enclosing?.kind === "function") {
          const names = deferredCalls.get(enclosing.name) ?? /* @__PURE__ */ new Set();
          for (const name of calls) names.add(name);
          deferredCalls.set(enclosing.name, names);
        }
      } else if (current !== false) {
        const pending = [...calls];
        const seen = /* @__PURE__ */ new Set();
        while (pending.length) {
          const name = pending.pop();
          if (name === "*") {
            pending.push(...deferredShadows.keys(), ...deferredCalls.keys());
            continue;
          }
          if (seen.has(name)) continue;
          seen.add(name);
          for (const nested of deferredShadows.get(name) ?? [])
            shadowed.add(nested);
          pending.push(...deferredCalls.get(name) ?? []);
        }
      }
    }
    closeFunction("segment");
    functionParenthesis(segment.separatorAfter);
    if (!functionBody && /^(?:exit|return|break|continue)(?=\s|$)/.test(command))
      controlTransferSeen = true;
  }
  return executable;
}
function firstUnquotedRedirection(command) {
  let quote = "";
  let escaped = false;
  for (let index = 0; index < command.length; index++) {
    const character = command[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\" && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = "";
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if (command.startsWith("${{", index)) {
      const end = githubExpressionEnd(command, index);
      if (end >= 0) {
        index = end - 1;
        continue;
      }
    }
    if (character === "<" || character === ">") return index;
  }
  return -1;
}
function envLaunchedCommand(words) {
  let index = 0;
  while (/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[index]?.raw ?? "")) index++;
  while (["sudo", "command", "exec", "time"].includes(words[index]?.text)) {
    const launcher = words[index++].text;
    if (launcher === "time" && words[index]?.text === "-p") index++;
    if (launcher === "command") {
      while (words[index]?.text === "-p") index++;
      if (words[index]?.text === "--") index++;
    }
  }
  if (!["env", "/usr/bin/env"].includes(words[index]?.text)) {
    return {
      commandWords: words.slice(index),
      prefixWords: words.slice(0, index)
    };
  }
  index++;
  while (true) {
    const option = words[index]?.text;
    if (option === "--") {
      index++;
      break;
    }
    if (["-i", "--ignore-environment"].includes(option)) {
      index++;
      continue;
    }
    if (["-u", "--unset"].includes(option) && /^[A-Za-z_][A-Za-z0-9_]*$/.test(words[index + 1]?.text ?? "")) {
      index += 2;
      continue;
    }
    if (/^--unset=[A-Za-z_][A-Za-z0-9_]*$/.test(option ?? "")) {
      index++;
      continue;
    }
    break;
  }
  while (/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[index]?.text ?? "")) index++;
  if (["exec", "command"].includes(words[index]?.text)) {
    return { commandWords: [], prefixWords: words };
  }
  return {
    commandWords: words.slice(index),
    prefixWords: words.slice(0, index)
  };
}
function evalLaunchedCommand(words) {
  let index = 0;
  while (/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[index]?.raw ?? "")) index++;
  if (index === 0 && words[index]?.raw === "time") {
    index++;
    if (words[index]?.raw === "-p") index++;
    if (words[index]?.raw === "!") index++;
    while (/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[index]?.raw ?? "")) index++;
  }
  while (["builtin", "command"].includes(words[index]?.text ?? "")) {
    const launcher = words[index++].text;
    if (launcher === "command") {
      while (words[index]?.text === "-p") index++;
    }
    if (words[index]?.text === "--") index++;
  }
  return words.slice(index);
}
function aiCliInvocations(value) {
  const invocations = [];
  for (const segment of shellExecutableSegments(value)) {
    if (segment.reach === false) continue;
    const redirection = firstUnquotedRedirection(segment.command);
    const command = redirection >= 0 ? segment.command.slice(0, redirection) : segment.command;
    const { commandWords, prefixWords } = envLaunchedCommand(
      shellWords(command)
    );
    const executable = commandWords.map((word) => word.text).join(" ");
    if (!AI_AGENT_CLI_PATTERNS.some(
      (pattern) => pattern.exec(executable)?.index === 0
    )) {
      continue;
    }
    const opaqueInput = redirection >= 0 || commandWords.some((word) => /\$\(|`/.test(word.text)) || prefixWords.some((word) => /\$/.test(word.expandableText));
    invocations.push({
      command: executable,
      expandableCommand: commandWords.map((word) => word.expandableText).join(" "),
      pipedInput: segment.pipedInput,
      opaqueInput,
      uncertainControlFlow: segment.reach === "unknown"
    });
  }
  return invocations;
}
function hasOpaqueAiSubstitution(value, matches) {
  const script = shellScriptWithoutHeredocBodies(value);
  let quote = "";
  let escaped = false;
  for (let index = 0; index < script.length - 1; index++) {
    const character = script[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\" && quote !== "'") {
      escaped = true;
      continue;
    }
    if (character === "'" || character === '"') {
      if (!quote) quote = character;
      else if (quote === character) quote = "";
      continue;
    }
    if (quote !== "'" && character === "$" && script[index + 1] === "(") {
      const end = commandSubstitutionEnd(script, index);
      const body = script.slice(index + 2, end >= 0 ? end - 1 : void 0);
      if (matches(body)) return true;
    }
  }
  return false;
}
function hasOpaqueAiCliSubstitution(value) {
  return hasOpaqueAiSubstitution(
    value,
    (body) => aiCliInvocations(body).length > 0 || hasOpaqueAiCliShellCommand(body)
  );
}
function hasOpaqueAiHttpSubstitution(value) {
  return hasOpaqueAiSubstitution(
    value,
    (body) => aiHttpDispatches(body).length > 0 || hasOpaqueAiHttpShellCommand(body)
  );
}
function hasOpaqueAiShellFunction(value) {
  return shellExecutableSegments(value).some(
    (segment) => segment.functionBody && (aiCliInvocations(segment.command).length > 0 || aiHttpDispatches(segment.command).length > 0 || hasOpaqueAiCliShellCommand(segment.command) || hasOpaqueAiHttpShellCommand(segment.command))
  );
}
function hasOpaqueAiShellCommand(value, matches) {
  return shellExecutableSegments(value).some((segment) => {
    if (segment.reach === false) return false;
    const words = shellWords(segment.command);
    const evalWords = evalLaunchedCommand(words);
    if (evalWords[0]?.text === "eval")
      return matches(
        evalWords.slice(1).map((word) => word.text).join(" ")
      );
    const { commandWords } = envLaunchedCommand(words);
    if (![
      "sh",
      "bash",
      "/bin/sh",
      "/bin/bash",
      "/usr/bin/sh",
      "/usr/bin/bash"
    ].includes(commandWords[0]?.text ?? ""))
      return false;
    const args = commandWords.slice(1);
    const commandIndex = args.findIndex(
      (word) => /^-[A-Za-z]*c[A-Za-z]*$/.test(word.text)
    );
    if (commandIndex >= 0) return matches(args[commandIndex + 1]?.text ?? "");
    const stdinIndex = args.findIndex((word) => word.text.startsWith("<<<"));
    if (stdinIndex >= 0 && args.slice(0, stdinIndex).every((word) => word.text.startsWith("-")))
      return matches(
        args[stdinIndex].text.slice(3) || args[stdinIndex + 1]?.text || ""
      );
    if (!args.every((word) => word.text.startsWith("-"))) return false;
    const inputWords = shellWords(segment.pipedInput);
    return ["printf", "echo"].includes(inputWords[0]?.text ?? "") && inputWords.slice(1).some((word) => matches(word.text));
  });
}
function hasOpaqueAiCliShellCommand(value) {
  return hasOpaqueAiShellCommand(
    value,
    (body) => aiCliInvocations(body).length > 0
  );
}
function hasOpaqueAiHttpShellCommand(value) {
  return hasOpaqueAiShellCommand(
    value,
    (body) => aiHttpDispatches(body).length > 0
  );
}
function aiHttpDispatches(value) {
  const dispatches = [];
  for (const segment of shellExecutableSegments(value)) {
    if (segment.reach === false) continue;
    const [executable, ...words] = envLaunchedCommand(
      shellWords(segment.command)
    ).commandWords;
    if (executable?.text !== "curl") continue;
    let method = "";
    let getOverride = false;
    let hasRoute = false;
    const payloads = [];
    for (let index = 0; index < words.length; index++) {
      const word = words[index].text;
      if (word === "-G" || word === "--get") getOverride = true;
      if (word === "-X" || word === "--request") {
        method = words[index + 1]?.text.toUpperCase() ?? "";
        index++;
        continue;
      } else if (word.startsWith("--request=")) {
        method = word.slice("--request=".length).toUpperCase();
        continue;
      } else if (/^-X[A-Za-z]+$/.test(word)) {
        method = word.slice(2).toUpperCase();
        continue;
      }
      if (/^(?:-d|-F|--data(?:-raw|-binary|-urlencode)?|--json|--form)$/.test(
        word
      )) {
        if (words[index + 1]) payloads.push(words[++index]);
        continue;
      }
      const attached = /^(?:-d|-F)(.+)$|^--(?:data(?:-raw|-binary|-urlencode)?|json|form)=(.*)$/.exec(
        word
      );
      if (attached) {
        payloads.push({
          text: attached[1] ?? attached[2],
          expandableText: words[index].expandableText.replace(
            /^(?:-d|-F|--(?:data(?:-raw|-binary|-urlencode)?|json|form)=)/,
            ""
          )
        });
        continue;
      }
      if (word === "-H" || word === "--header") {
        index++;
        continue;
      }
      if (word === "--url") {
        index++;
      } else if (word.startsWith("-") && !word.startsWith("--url=")) {
        if (!/^(?:-[sSLfkvi]+|--(?:silent|show-error|location|fail|fail-with-body|insecure|verbose|compressed|include|http1\.1|http2))$/.test(
          word
        ) && /^https?:\/\//i.test(words[index + 1]?.text ?? ""))
          index++;
        continue;
      }
      const candidate = words[index]?.text.replace(/^--url=/, "") ?? "";
      if (AI_AGENT_API_PATTERNS.some(
        (pattern) => pattern.exec(candidate)?.index === 0
      )) {
        hasRoute = true;
      }
    }
    if (hasRoute && !getOverride && (method === "POST" || !method && payloads.length > 0)) {
      dispatches.push({
        command: `curl ${words.map((word) => word.text).join(" ")}`,
        payload: payloads.map((word) => word.text).join(" "),
        expandablePayload: payloads.map((word) => word.expandableText).join(" "),
        expandableCommand: words.map((word) => word.expandableText).join(" "),
        uncertainControlFlow: segment.reach === "unknown",
        opaquePayload: payloads.some((word) => /^@|\$\(|`/.test(word.text))
      });
    }
  }
  return dispatches;
}
function matchingGitHubContextPatterns(value) {
  const matches = /* @__PURE__ */ new Set();
  let cursor = 0;
  while (true) {
    const start = value.indexOf("${{", cursor);
    if (start < 0) break;
    let expression = "";
    let quoted = false;
    let end = -1;
    for (let index = start + 3; index < value.length; index++) {
      if (value[index] === "'") {
        if (quoted && value[index + 1] === "'") index++;
        else quoted = !quoted;
      } else if (!quoted && value.startsWith("}}", index)) {
        end = index + 2;
        break;
      } else if (!quoted) {
        expression += value[index];
      }
    }
    if (end < 0) break;
    for (const candidate of UNTRUSTED_CONTEXT_PATTERNS) {
      if (candidate.pattern.test(expression)) matches.add(candidate);
    }
    cursor = end;
  }
  return [...matches];
}
function untrustedGitHubContextMatches(value) {
  return matchingGitHubContextPatterns(value).flatMap(
    (candidate) => candidate.events.map((event) => ({ event, source: candidate.source }))
  );
}
function containsSecretReference(value) {
  return SECRET_PATTERNS.some((pattern) => pattern.test(value));
}
function containsShellAccess(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  for (const [key, raw] of Object.entries(value)) {
    const normalized = key.toLowerCase().replaceAll("-", "_");
    if (/^(?:allowed_?tools?|tools?)$/.test(normalized) && SHELL_TOOL_PATTERN.test(stringValue(raw))) {
      return true;
    }
    if (/^(?:claude_)?args$|^(?:options?|additional_args)$/.test(normalized) && SHELL_ARGUMENT_PATTERN.test(stringValue(raw))) {
      return true;
    }
    if (/^(?:dangerously_?skip_?permissions|(?:enable|allow)_?(?:shell|commands?))$/.test(
      normalized
    ) && literalEnabled(raw)) {
      return true;
    }
  }
  return false;
}
function isPinnedAction(uses) {
  const ref = uses.split("@")[1];
  return Boolean(ref && /^[a-f0-9]{40}$/i.test(ref));
}
function stringValue(value) {
  return typeof value === "string" ? value : JSON.stringify(value ?? "");
}
function literalEnabled(value) {
  if (value === true) return true;
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "${{ true }}";
}

// src/options.ts
function parseFailOn(value) {
  if (value === "none" || value === "low" || value === "medium" || value === "high" || value === "critical") {
    return value;
  }
  throw new Error("fail-on must be one of none, low, medium, high, critical.");
}

// src/scanner.ts
var import_yaml = __toESM(require_dist(), 1);
import fs2 from "fs/promises";
import path2 from "path";

// src/rules.ts
var RULES = {
  "agentci/untrusted-ai-write-token": {
    id: "agentci/untrusted-ai-write-token",
    title: "Untrusted event content can reach an AI agent with write permissions",
    severity: "critical",
    why: "An attacker can place prompt-injection text in a PR, issue, or comment. If that text reaches an AI agent with repository write permissions, the agent can be induced to modify code, comments, workflows, or releases.",
    fix: [
      "Do not run privileged AI agents on untrusted triggers.",
      "Use read-only GITHUB_TOKEN permissions for untrusted events.",
      "Account for separately minted Action App tokens; a read-only workflow token alone may not remove write capability.",
      "Require maintainer approval before running the agent.",
      "Sanitize and summarize untrusted content before passing it to an agent."
    ]
  },
  "agentci/gated-ai-write-token": {
    id: "agentci/gated-ai-write-token",
    title: "Untrusted event content reaches a write-capable agent that gates on repository write access",
    severity: "high",
    why: "An untrusted triggering actor's own content reaches anthropics/claude-code-action with write permissions, but the action normally checks that actor for repository write access before running. This reduction does not apply when the agent reads a parent Issue or PR written by someone else, when the gate is bypassed, or when the event is outside the documented gate.",
    fix: [
      "Keep the default gate: never set allowed_non_write_users, and avoid allowed_bots.",
      "Pin the action to a commit SHA so a fixed authorization check cannot silently regress.",
      "Prefer read-only permissions on untrusted triggers and move writes to a separate, maintainer-approved job.",
      "Do not treat a maintainer's comment or label as proof that the parent Issue or PR is trusted."
    ]
  },
  "agentci/pull-request-target-ai": {
    id: "agentci/pull-request-target-ai",
    title: "AI agent runs on pull_request_target",
    severity: "critical",
    why: "pull_request_target runs in the base repository security context and can expose write tokens or secrets to workflows influenced by an untrusted pull request.",
    fix: [
      "Use pull_request with read-only permissions for untrusted code.",
      "Split analysis into a read-only job and a separate maintainer-approved write job.",
      "Avoid checking out untrusted PR head code in pull_request_target."
    ]
  },
  "agentci/ai-with-secrets": {
    id: "agentci/ai-with-secrets",
    title: "AI step references a secret or token",
    severity: "medium",
    why: "Secrets passed into an AI step can be exfiltrated if untrusted prompt content influences tool use, shell commands, or generated output. Most AI actions require a provider key, so this is a baseline exposure to review rather than a vulnerability on its own \u2014 it becomes high-risk when combined with untrusted input or write permissions (see agentci/untrusted-ai-write-token).",
    fix: [
      "Do not expose secrets to agent jobs that process untrusted content.",
      "Use short-lived scoped tokens.",
      "Move secret-bearing actions behind manual approval."
    ]
  },
  "agentci/untrusted-input-in-prompt": {
    id: "agentci/untrusted-input-in-prompt",
    title: "Untrusted GitHub event content is passed into an AI prompt or command",
    severity: "high",
    why: "PR bodies, issue bodies, comments, branch names, and commit messages are attacker-controlled in common workflows and can contain prompt-injection instructions.",
    fix: [
      "Avoid inserting raw GitHub event text into prompts.",
      "Use structured extraction and length limits.",
      "Add prompt-injection filtering before AI execution.",
      "Run the agent with read-only permissions."
    ]
  },
  "agentci/ai-shell-access": {
    id: "agentci/ai-shell-access",
    title: "Local AI CLI runs through shell or Action enables command tool",
    severity: "high",
    why: "A local AI CLI is launched from a runner shell; an Action's explicit command-tool setting is separate evidence of agent command access. A remote HTTP dispatch does not establish either capability inside the hosted agent.",
    fix: [
      "Disable shell tools for untrusted events.",
      "Run in a sandbox with no secrets.",
      "Restrict network and filesystem access."
    ]
  },
  "agentci/broad-write-permissions": {
    id: "agentci/broad-write-permissions",
    title: "Workflow grants broad write permissions near AI usage",
    severity: "medium",
    why: "Broad write scopes increase blast radius if an AI-agent step is influenced by untrusted input.",
    fix: [
      "Set default permissions to read-only.",
      "Grant write scopes only in narrowly scoped jobs.",
      "Prefer job-level permissions over workflow-level write permissions."
    ]
  },
  "agentci/unpinned-ai-action": {
    id: "agentci/unpinned-ai-action",
    title: "AI-related action is not pinned to a commit SHA",
    severity: "medium",
    why: "Tag-pinned third-party actions can change over time. AI-agent actions often receive privileged context, so supply-chain drift matters.",
    fix: [
      "Pin third-party actions to full commit SHAs.",
      "Review updates explicitly.",
      "Prefer first-party or internally mirrored actions for privileged jobs."
    ]
  },
  "agentci/unsafe-checkout": {
    id: "agentci/unsafe-checkout",
    title: "Workflow checks out untrusted pull request head in a privileged context",
    severity: "high",
    why: "An explicit bypass of GitHub's unsafe-PR checkout protection, or a known-unprotected checkout version, can place attacker-controlled code in a privileged workflow workspace.",
    fix: [
      "Do not opt out of checkout's unsafe-PR protection.",
      "Use a current protected actions/checkout release.",
      "Use read-only analysis jobs.",
      "Disable install/build scripts before trust is established."
    ]
  }
};
var SEVERITY_ORDER = ["low", "medium", "high", "critical"];

// src/workflow-model.ts
var STATUS_ONLY_CONDITION = /^[\s()!&|]*(?:(?:always|success|failure|cancelled)\(\s*\)[\s()!&|]*)+$/i;
var UNTRUSTED_EVENTS = /* @__PURE__ */ new Set([
  "pull_request",
  "pull_request_target",
  "issue_comment",
  "issues",
  "pull_request_review",
  "pull_request_review_comment",
  "discussion",
  "discussion_comment"
]);
var SENSITIVE_WRITE_SCOPES = /* @__PURE__ */ new Set([
  "contents",
  "pull-requests",
  "issues",
  "discussions",
  "packages",
  "deployments"
]);
function normalizeTriggers(raw) {
  if (typeof raw === "string") return [raw];
  if (Array.isArray(raw)) {
    return raw.filter((item) => typeof item === "string");
  }
  if (isRecord(raw)) return Object.keys(raw);
  return [];
}
function resolvePermissions(workflowRaw, jobRaw, configuredDefault, ceiling) {
  let effective;
  if (jobRaw !== void 0) {
    effective = normalizeExplicitPermissions(jobRaw, "job");
  } else if (workflowRaw !== void 0) {
    effective = normalizeExplicitPermissions(workflowRaw, "workflow");
  } else if (configuredDefault !== void 0) {
    effective = normalizeExplicitPermissions(
      configuredDefault,
      "configured-default"
    );
  } else {
    effective = {
      default: "unknown",
      scopes: {},
      source: "github-default-unknown"
    };
  }
  return ceiling ? intersectPermissions(ceiling, effective) : effective;
}
function permissionLevel(permissions, scope) {
  return permissions.scopes[scope] ?? permissions.default;
}
function hasSensitiveWrite(permissions) {
  return [...SENSITIVE_WRITE_SCOPES].some(
    (scope) => permissionLevel(permissions, scope) === "write"
  );
}
function hasUnknownSensitivePermission(permissions) {
  return [...SENSITIVE_WRITE_SCOPES].some(
    (scope) => permissionLevel(permissions, scope) === "unknown"
  );
}
function describePermissions(permissions) {
  return JSON.stringify({
    source: permissions.source,
    default: permissions.default,
    scopes: permissions.scopes
  });
}
function mergeEnvironment(...layers) {
  const merged = {};
  for (const layer of layers) {
    if (!isRecord(layer)) continue;
    for (const [key, value] of Object.entries(layer)) {
      merged[key] = typeof value === "string" ? value : JSON.stringify(value ?? "");
    }
  }
  return merged;
}
function narrowEventsDetailed(events, rawCondition) {
  if (rawCondition === void 0 || rawCondition === null) {
    return { events: [...events], unknownEvents: [], complete: true };
  }
  if (rawCondition === true) {
    return { events: [...events], unknownEvents: [], complete: true };
  }
  if (rawCondition === false) {
    return { events: [], unknownEvents: [], complete: true };
  }
  if (typeof rawCondition !== "string") {
    return { events: [...events], unknownEvents: [...events], complete: false };
  }
  const condition = unwrapExpression(rawCondition);
  if (condition === "true") {
    return { events: [...events], unknownEvents: [], complete: true };
  }
  if (condition === "false") {
    return { events: [], unknownEvents: [], complete: true };
  }
  if (STATUS_ONLY_CONDITION.test(condition) && isWellFormedStatusCondition(condition)) {
    return { events: [...events], unknownEvents: [], complete: true };
  }
  const reachable = [];
  const unknownEvents = [];
  for (const event of events) {
    const result = evaluateEventCondition(condition, event);
    if (result === "unknown") unknownEvents.push(event);
    if (result !== false) reachable.push(event);
  }
  return {
    events: reachable,
    unknownEvents,
    complete: unknownEvents.length === 0
  };
}
function evaluateEventCondition(condition, event) {
  const expanded = replaceEventMembership(condition, event);
  const tokens = tokenizeExpression(expanded);
  if (!tokens) return "unknown";
  const parser = new EventExpressionParser(tokens, event);
  return parser.parse();
}
function replaceEventMembership(condition, event) {
  return condition.replace(
    /contains\s*\(\s*fromJSON\s*\(\s*(['"])(.*?)\1\s*\)\s*,\s*github\.event_name\s*\)/gi,
    (original, _quote, encoded) => {
      try {
        const decoded = JSON.parse(encoded);
        if (Array.isArray(decoded) && decoded.every((value) => typeof value === "string")) {
          return String(
            decoded.some(
              (value) => value.toLowerCase() === event.toLowerCase()
            )
          );
        }
      } catch {
      }
      return original;
    }
  );
}
function unwrapExpression(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith("${{") && trimmed.endsWith("}}")) {
    return trimmed.slice(3, -2).trim();
  }
  return trimmed;
}
function tokenizeExpression(value) {
  const tokens = [];
  let index = 0;
  while (index < value.length) {
    const character = value[index];
    if (/\s/.test(character)) {
      index++;
      continue;
    }
    const operator = ["!==", "===", "&&", "||", "!=", "=="].find(
      (item) => value.startsWith(item, index)
    );
    if (operator) {
      tokens.push({ kind: "operator", value: operator });
      index += operator.length;
      continue;
    }
    if (character === "!") {
      tokens.push({ kind: "operator", value: character });
      index++;
      continue;
    }
    if (character === "(") {
      tokens.push({ kind: "left-paren", value: character });
      index++;
      continue;
    }
    if (character === ")") {
      tokens.push({ kind: "right-paren", value: character });
      index++;
      continue;
    }
    if (character === ",") {
      tokens.push({ kind: "comma", value: character });
      index++;
      continue;
    }
    if (character === "'" || character === '"') {
      const quote = character;
      let text = "";
      index++;
      let closed = false;
      while (index < value.length) {
        const current = value[index];
        if (current === "\\" && index + 1 < value.length) {
          text += value[index + 1];
          index += 2;
        } else if (current === quote) {
          closed = true;
          index++;
          break;
        } else {
          text += current;
          index++;
        }
      }
      if (!closed) return null;
      tokens.push({ kind: "string", value: text });
      continue;
    }
    const identifier = /^[A-Za-z_][A-Za-z0-9_.-]*/.exec(
      value.slice(index)
    )?.[0];
    if (!identifier) return null;
    tokens.push({
      kind: identifier === "true" || identifier === "false" ? "boolean" : "identifier",
      value: identifier
    });
    index += identifier.length;
  }
  return tokens;
}
function isWellFormedStatusCondition(condition) {
  const tokens = tokenizeExpression(condition);
  if (!tokens) return false;
  let needsOperand = true;
  let depth = 0;
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (needsOperand) {
      if (token.kind === "operator" && token.value === "!") continue;
      if (token.kind === "left-paren") {
        depth++;
        continue;
      }
      if (token.kind === "identifier" && /^(?:always|success|failure|cancelled)$/i.test(token.value) && tokens[index + 1]?.kind === "left-paren" && tokens[index + 2]?.kind === "right-paren") {
        index += 2;
        needsOperand = false;
        continue;
      }
      return false;
    }
    if (token.kind === "right-paren" && depth > 0) {
      depth--;
    } else if (token.kind === "operator" && (token.value === "&&" || token.value === "||")) {
      needsOperand = true;
    } else {
      return false;
    }
  }
  return !needsOperand && depth === 0;
}
var EventExpressionParser = class {
  constructor(tokens, event) {
    this.tokens = tokens;
    this.event = event;
  }
  tokens;
  event;
  index = 0;
  parse() {
    const result = this.parseOr();
    return this.index === this.tokens.length ? result : "unknown";
  }
  parseOr() {
    let result = this.parseAnd();
    while (this.consumeOperator("||")) {
      result = triOr(result, this.parseAnd());
    }
    return result;
  }
  parseAnd() {
    let result = this.parseUnary();
    while (this.consumeOperator("&&")) {
      result = triAnd(result, this.parseUnary());
    }
    return result;
  }
  parseUnary() {
    if (this.consumeOperator("!")) return triNot(this.parseUnary());
    return this.parsePrimary();
  }
  parsePrimary() {
    const token = this.tokens[this.index];
    if (!token) return "unknown";
    if (token.kind === "left-paren") {
      this.index++;
      const result = this.parseOr();
      if (this.tokens[this.index]?.kind !== "right-paren") return "unknown";
      this.index++;
      return result;
    }
    if (token.kind === "boolean") {
      this.index++;
      return token.value === "true";
    }
    if (token.kind === "identifier" && this.tokens[this.index + 1]?.kind === "left-paren") {
      this.index += 2;
      let depth = 1;
      while (this.index < this.tokens.length && depth > 0) {
        const current = this.tokens[this.index];
        if (current.kind === "left-paren") depth++;
        else if (current.kind === "right-paren") depth--;
        this.index++;
      }
      return "unknown";
    }
    const left = token;
    const operator = this.tokens[this.index + 1];
    const right = this.tokens[this.index + 2];
    if (operator?.kind === "operator" && ["==", "===", "!=", "!=="].includes(operator.value) && right) {
      this.index += 3;
      const comparison = compareEventOperands(
        left,
        right,
        operator.value,
        this.event
      );
      return comparison;
    }
    this.index++;
    return "unknown";
  }
  consumeOperator(operator) {
    const token = this.tokens[this.index];
    if (token?.kind === "operator" && token.value === operator) {
      this.index++;
      return true;
    }
    return false;
  }
};
function compareEventOperands(left, right, operator, event) {
  let expected;
  if (left.kind === "identifier" && left.value === "github.event_name" && right.kind === "string") {
    expected = right.value;
  } else if (right.kind === "identifier" && right.value === "github.event_name" && left.kind === "string") {
    expected = left.value;
  }
  if (expected === void 0) return "unknown";
  const equal = event.toLowerCase() === expected.toLowerCase();
  return operator === "==" || operator === "===" ? equal : !equal;
}
function triNot(value) {
  return value === "unknown" ? value : !value;
}
function triAnd(left, right) {
  if (left === false || right === false) return false;
  if (left === true && right === true) return true;
  return "unknown";
}
function triOr(left, right) {
  if (left === true || right === true) return true;
  if (left === false && right === false) return false;
  return "unknown";
}
function normalizeExplicitPermissions(raw, source) {
  if (raw === "read-all") return { default: "read", scopes: {}, source };
  if (raw === "write-all") return { default: "write", scopes: {}, source };
  if (raw === "none") return { default: "none", scopes: {}, source };
  if (raw === "unknown") return { default: "unknown", scopes: {}, source };
  if (typeof raw === "string") {
    return {
      default: "none",
      scopes: { contents: toPermissionLevel(raw) },
      source
    };
  }
  if (!isRecord(raw)) {
    return { default: "unknown", scopes: {}, source };
  }
  const scopes = {};
  for (const [scope, level] of Object.entries(raw)) {
    scopes[scope] = toPermissionLevel(level);
  }
  return { default: "none", scopes, source };
}
function intersectPermissions(ceiling, requested) {
  const scopes = /* @__PURE__ */ new Set([
    ...Object.keys(ceiling.scopes),
    ...Object.keys(requested.scopes),
    ...SENSITIVE_WRITE_SCOPES
  ]);
  const merged = {};
  for (const scope of scopes) {
    merged[scope] = lowerPermission(
      permissionLevel(ceiling, scope),
      permissionLevel(requested, scope)
    );
  }
  return { default: "none", scopes: merged, source: "reusable-merge" };
}
function lowerPermission(left, right) {
  if (left === "none" || right === "none") return "none";
  if (left === "unknown" || right === "unknown") return "unknown";
  if (left === "read" || right === "read") return "read";
  return "write";
}
function toPermissionLevel(value) {
  if (value === "none" || value === "read" || value === "write") return value;
  return "unknown";
}
function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
var TRUSTED_ACTOR_ATOMS = [
  // Restricted to the repository owner.
  /^(?:github\.actor|github\.event\.sender\.login|github\.event\.comment\.user\.login)\s*(?:==|===)\s*github\.repository_owner$/i,
  /^github\.repository_owner\s*(?:==|===)\s*(?:github\.actor|github\.event\.sender\.login)$/i
];
var TRUSTED_PR_PROVENANCE_ATOMS = [
  // Restricted to pull requests that originate in the base repository.
  /^github\.event\.pull_request\.head\.repo\.full_name\s*(?:==|===)\s*github\.repository$/i,
  /^github\.repository\s*(?:==|===)\s*github\.event\.pull_request\.head\.repo\.full_name$/i,
  // Restricted to non-fork pull requests.
  /^!\s*github\.event\.pull_request\.head\.repo\.fork$/i,
  /^github\.event\.pull_request\.head\.repo\.fork\s*(?:==|===)\s*false$/i
];
var TRUSTED_ASSOCIATIONS = /* @__PURE__ */ new Set(["OWNER"]);
var ASSOCIATION_EQUALITY = /^github\.event\.(?:comment|review)\.author_association\s*(?:==|===)\s*(['"])([A-Za-z_]+)\1$/i;
var ASSOCIATION_MEMBERSHIP = /^contains\s*\(\s*fromJSON\s*\(\s*(['"])(.*?)\1\s*\)\s*,\s*github\.event\.(?:comment|review)\.author_association\s*\)$/i;
function hasTrustedActorGate(rawCondition) {
  if (typeof rawCondition !== "string") return false;
  return conditionImpliesTrustedSource(unwrapExpression(rawCondition), "actor");
}
function hasTrustedPrProvenanceGate(rawCondition) {
  if (typeof rawCondition !== "string") return false;
  return conditionImpliesTrustedSource(unwrapExpression(rawCondition), "pr");
}
function conditionImpliesTrustedSource(condition, source) {
  const trimmed = stripOuterParens(condition.trim());
  if (trimmed.length === 0) return false;
  const disjuncts = splitTopLevel(trimmed, "||");
  if (disjuncts.length > 1) {
    return disjuncts.every(
      (part) => conditionImpliesTrustedSource(part, source)
    );
  }
  const conjuncts = splitTopLevel(trimmed, "&&");
  if (conjuncts.length > 1) {
    return conjuncts.some(
      (part) => conditionImpliesTrustedSource(part, source)
    );
  }
  return isTrustedSourceAtom(trimmed, source);
}
function isTrustedSourceAtom(atom, source) {
  const normalized = atom.replace(/\s+/g, " ").trim();
  if (source === "pr") {
    return TRUSTED_PR_PROVENANCE_ATOMS.some(
      (pattern) => pattern.test(normalized)
    );
  }
  if (TRUSTED_ACTOR_ATOMS.some((pattern) => pattern.test(normalized))) {
    return true;
  }
  const equality = ASSOCIATION_EQUALITY.exec(normalized);
  if (equality) return TRUSTED_ASSOCIATIONS.has(equality[2].toUpperCase());
  const membership = ASSOCIATION_MEMBERSHIP.exec(normalized);
  if (membership) {
    try {
      const decoded = JSON.parse(membership[2]);
      return Array.isArray(decoded) && decoded.length > 0 && decoded.every(
        (value) => typeof value === "string" && TRUSTED_ASSOCIATIONS.has(value.toUpperCase())
      );
    } catch {
      return false;
    }
  }
  return false;
}
function stripOuterParens(value) {
  let current = value.trim();
  while (current.startsWith("(") && current.endsWith(")") && wrapsWholeExpression(current)) {
    current = current.slice(1, -1).trim();
  }
  return current;
}
function wrapsWholeExpression(value) {
  let depth = 0;
  let quote = null;
  for (let index = 0; index < value.length; index++) {
    const character = value[index];
    if (quote) {
      if (character === quote) quote = null;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if (character === "(") depth++;
    else if (character === ")") {
      depth--;
      if (depth === 0) return index === value.length - 1;
    }
  }
  return false;
}
function splitTopLevel(value, operator) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let start = 0;
  for (let index = 0; index < value.length; index++) {
    const character = value[index];
    if (quote) {
      if (character === quote) quote = null;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if (character === "(") depth++;
    else if (character === ")") depth--;
    else if (depth === 0 && value.startsWith(operator, index)) {
      parts.push(value.slice(start, index));
      index += operator.length - 1;
      start = index + 1;
    }
  }
  parts.push(value.slice(start));
  return parts.map((part) => part.trim()).filter((part) => part.length > 0);
}

// src/scanner.ts
var EMPTY_REUSABLE_CONTEXT = {
  inputValues: {},
  stack: [],
  callChain: []
};
var ANTHROPIC_ACTION_WITHOUT_DISCUSSION = "1d6de8cb0c237e7c15e9e1bdf973826ebae490cc";
var ANTHROPIC_ACTION_AGENT_PROMPT_VERIFIED = "787c5a0ce96a9a6cfb050ea0c8f4c05f2447c251";
var VERIFIED_ANTHROPIC_WRITE_GATES = /* @__PURE__ */ new Set([
  ANTHROPIC_ACTION_AGENT_PROMPT_VERIFIED,
  ANTHROPIC_ACTION_WITHOUT_DISCUSSION
]);
async function scanRepository(root, options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const scanRoot = path2.resolve(cwd, root);
  const rootStat = await fs2.stat(scanRoot).catch(() => null);
  if (!rootStat?.isDirectory()) {
    throw new Error(`scan path is not a directory: ${root}`);
  }
  const config = await loadConfig(scanRoot, options.configPath);
  const workflows = await loadWorkflowFiles(scanRoot);
  return scanWorkflowFiles(workflows, scanRoot, config);
}
function scanWorkflowFiles(workflows, scanRoot, config) {
  const repository = {
    root: scanRoot,
    config,
    workflows: new Map(
      workflows.map((workflow) => [path2.resolve(workflow.path), workflow])
    ),
    analyzed: /* @__PURE__ */ new Set(),
    called: /* @__PURE__ */ new Set()
  };
  const roots = workflows.filter((workflow) => {
    const triggers = workflowTriggers(workflow);
    return workflow.parse_error !== void 0 || triggers.length === 0 || triggers.some((trigger) => trigger !== "workflow_call");
  });
  const output = {
    agentUsages: [],
    findings: [],
    diagnostics: []
  };
  for (const workflow of roots) {
    const triggers = workflowTriggers(workflow);
    const directEvents = triggers.filter(
      (trigger) => trigger !== "workflow_call"
    );
    const rootContext = directEvents.length !== triggers.length ? { ...EMPTY_REUSABLE_CONTEXT, events: directEvents } : EMPTY_REUSABLE_CONTEXT;
    mergeOutput(output, analyzeWorkflow(workflow, repository, rootContext));
  }
  for (const workflow of workflows) {
    const absolute = path2.resolve(workflow.path);
    if (!workflowTriggers(workflow).includes("workflow_call") || repository.called.has(absolute)) {
      continue;
    }
    const file = relativeFile(scanRoot, workflow.path);
    output.diagnostics.push({
      code: "agentci/analysis-reusable-without-caller",
      kind: "analysis",
      severity: "warning",
      file,
      message: "Reusable workflow was analyzed without a reachable local caller; caller inputs, events, secrets, and token permissions are unknown.",
      line: 1
    });
    if (!repository.analyzed.has(absolute)) {
      mergeOutput(
        output,
        analyzeWorkflow(workflow, repository, EMPTY_REUSABLE_CONTEXT)
      );
    }
  }
  const findings = dedupe(output.findings).filter(
    (finding) => !config.ignore.includes(finding.rule_id) && !config.ignorePaths.some((glob) => matchesPath(glob, finding.file))
  );
  const diagnostics = dedupeDiagnostics(output.diagnostics);
  return {
    scanned_at: (/* @__PURE__ */ new Date()).toISOString(),
    root: scanRoot,
    workflow_count: workflows.length,
    agent_usages: dedupeAgentUsages(output.agentUsages),
    findings,
    summary: summarize(findings),
    diagnostics,
    // A verified unsupported Action event is a closed path, not uncertainty.
    analysis_complete: diagnostics.every(
      (diagnostic) => diagnostic.code === "agentci/analysis-agent-event-unsupported"
    )
  };
}
async function loadWorkflowFiles(root) {
  const directory = path2.resolve(root, ".github/workflows");
  let entries;
  try {
    entries = await fs2.readdir(directory);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const workflows = [];
  for (const name of entries.filter((name2) => /\.ya?ml$/.test(name2)).sort()) {
    const file = path2.join(directory, name);
    const metadata = await fs2.lstat(file);
    if (!metadata.isFile() || metadata.isSymbolicLink()) continue;
    const raw = await fs2.readFile(file, "utf8");
    workflows.push(parseWorkflowFile(file, raw));
  }
  return workflows;
}
function parseWorkflowFile(file, raw) {
  const document = import_yaml.default.parseDocument(raw, { prettyErrors: true });
  const error = document.errors[0];
  if (error) {
    const line = error.linePos?.[0]?.line;
    return {
      path: file,
      raw,
      document: void 0,
      parse_error: { message: error.message, line }
    };
  }
  return { path: file, raw, document: document.toJS() };
}
function hasFindingAtOrAbove(findings, severity) {
  return findings.some(
    (finding) => SEVERITY_ORDER.indexOf(finding.severity) >= SEVERITY_ORDER.indexOf(severity)
  );
}
function analyzeWorkflow(workflow, repository, context) {
  const file = relativeFile(repository.root, workflow.path);
  repository.analyzed.add(path2.resolve(workflow.path));
  if (workflow.parse_error) {
    return {
      agentUsages: [],
      findings: [],
      diagnostics: [
        {
          code: "agentci/parse-error",
          kind: "parse",
          severity: "error",
          file,
          message: workflow.parse_error.message,
          line: workflow.parse_error.line
        }
      ]
    };
  }
  const doc = isRecord2(workflow.document) ? workflow.document : {};
  const workflowEvents = context.events ?? normalizeTriggers(doc.on ?? doc["on"]);
  const creationOnlyEvents = new Set(
    context.creationOnlyEvents ?? creationOnlyTriggers(doc.on)
  );
  const workflowEnvironment = mergeEnvironment(doc.env);
  const workflowPermissions = context.permissionCeiling && doc.permissions === void 0 ? context.permissionCeiling : resolvePermissions(
    doc.permissions,
    void 0,
    repository.config.defaultPermissions,
    context.permissionCeiling
  );
  const jobs = isRecord2(doc.jobs) ? doc.jobs : {};
  const output = {
    agentUsages: [],
    findings: [],
    diagnostics: []
  };
  for (const [jobName, rawJob] of Object.entries(jobs)) {
    if (!isRecord2(rawJob)) continue;
    const jobLine = locateJobLine(workflow.raw, jobName);
    const jobReachability = narrowEventsDetailed(workflowEvents, rawJob.if);
    const jobUncertainEvents = jobReachability.events.filter(
      (event) => context.uncertainEvents?.includes(event) || jobReachability.unknownEvents.includes(event)
    );
    const jobActorGate = Boolean(context.actorGate) || hasTrustedActorGate(rawJob.if);
    const jobPrGate = Boolean(context.prGate) || hasTrustedPrProvenanceGate(rawJob.if);
    if (!jobReachability.complete) {
      output.diagnostics.push({
        code: "agentci/analysis-event-condition",
        kind: "analysis",
        severity: "warning",
        file,
        job: jobName,
        line: jobLine,
        message: "Could not fully interpret this job's if condition; unresolved branches retain possible event paths, so findings in this job may depend on those paths."
      });
    }
    if (jobReachability.events.length === 0) continue;
    const jobPermissions = rawJob.permissions === void 0 ? workflowPermissions : resolvePermissions(
      doc.permissions,
      rawJob.permissions,
      repository.config.defaultPermissions,
      context.permissionCeiling
    );
    if (typeof rawJob.uses === "string") {
      mergeOutput(
        output,
        analyzeReusableCall(
          workflow,
          jobName,
          rawJob,
          jobLine,
          jobReachability.events,
          jobUncertainEvents,
          [...creationOnlyEvents],
          jobPermissions,
          repository,
          { ...context, triggerSource: context.triggerSource ?? doc.on }
        )
      );
      continue;
    }
    const steps = Array.isArray(rawJob.steps) ? rawJob.steps : [];
    const jobEnvironment = mergeEnvironment(workflowEnvironment, rawJob.env);
    const aiSteps = [];
    let untrustedInRun = false;
    const untrustedRunPaths = [];
    const secretEnvTransferEvents = /* @__PURE__ */ new Set();
    for (const [index, rawStep] of steps.entries()) {
      if (!isRecord2(rawStep)) continue;
      const stepName = typeof rawStep.name === "string" ? rawStep.name : `step ${index + 1}`;
      const stepLine = locateStepLine(workflow.raw, jobName, index);
      let stepReachability = narrowEventsDetailed(
        jobReachability.events,
        rawStep.if
      );
      if (!stepReachability.complete) {
        output.diagnostics.push({
          code: "agentci/analysis-event-condition",
          kind: "analysis",
          severity: "warning",
          file,
          job: jobName,
          step_index: index,
          line: stepLine,
          message: "Could not fully interpret this step's if condition; unresolved branches retain possible event paths, so findings at this step may depend on those paths."
        });
      }
      if (stepReachability.events.length === 0) continue;
      const stepUses = typeof rawStep.uses === "string" ? rawStep.uses : "";
      const actionReference = materializeInputs(stepUses, context.inputValues);
      const pinnedAnthropicRef = /^anthropics\/claude-code-action@([0-9a-f]{40})$/i.exec(actionReference)?.[1]?.toLowerCase();
      const effectiveWith = materializeStructure(
        rawStep.with,
        context.inputValues
      );
      const discussionEvents = isSelfGatingAgentAction(actionReference) ? stepReachability.events.filter(
        (event) => event === "discussion" || event === "discussion_comment"
      ) : [];
      if (discussionEvents.length > 0) {
        const knownUnsupported = pinnedAnthropicRef === ANTHROPIC_ACTION_WITHOUT_DISCUSSION;
        output.diagnostics.push({
          code: knownUnsupported ? "agentci/analysis-agent-event-unsupported" : "agentci/analysis-agent-event-unknown",
          kind: "analysis",
          severity: "warning",
          file,
          job: jobName,
          step_index: index,
          line: stepLine,
          message: knownUnsupported ? "This verified Anthropic Action revision rejects discussion events before Claude starts; those paths were excluded from AI findings." : "This Anthropic Action ref's discussion-event support is unverified; findings on those paths are potential, not confirmed execution."
        });
        if (knownUnsupported) {
          stepReachability = {
            ...stepReachability,
            events: stepReachability.events.filter(
              (event) => event !== "discussion" && event !== "discussion_comment"
            )
          };
          if (stepReachability.events.length === 0) continue;
        }
      }
      if (pinnedAnthropicRef === ANTHROPIC_ACTION_WITHOUT_DISCUSSION) {
        const inputs = isRecord2(effectiveWith) ? effectiveWith : {};
        const progress = String(inputs.track_progress ?? "");
        const noPrompt = String(inputs.prompt ?? "") === "";
        const triggerSource = context.triggerSource ?? doc.on;
        const triggers = isRecord2(triggerSource) ? triggerSource : {};
        const unsupportedEvents = stepReachability.events.filter((event) => {
          const isPr = event === "pull_request" || event === "pull_request_target";
          if (progress !== "true") {
            return isPr && !progress.includes("${{") && noPrompt;
          }
          if (event !== "workflow_call" && ![
            "pull_request",
            "pull_request_target",
            "issues",
            "issue_comment",
            "pull_request_review",
            "pull_request_review_comment"
          ].includes(event)) {
            return true;
          }
          if (!isPr) return false;
          const trigger = triggers[event];
          const types = isRecord2(trigger) ? trigger.types : void 0;
          return Array.isArray(types) && types.length > 0 && types.every(
            (type) => typeof type === "string" && ![
              "opened",
              "synchronize",
              "ready_for_review",
              "reopened",
              "labeled"
            ].includes(type)
          );
        });
        if (unsupportedEvents.length > 0) {
          output.diagnostics.push({
            code: "agentci/analysis-agent-event-unsupported",
            kind: "analysis",
            severity: "warning",
            file,
            job: jobName,
            step_index: index,
            line: stepLine,
            message: "This verified Anthropic Action revision skips or rejects the configured event/input paths before Claude starts; those paths were excluded from AI findings."
          });
          stepReachability = {
            ...stepReachability,
            events: stepReachability.events.filter(
              (event) => !unsupportedEvents.includes(event)
            )
          };
          if (stepReachability.events.length === 0) continue;
        }
      }
      const stepUncertainEvents = stepReachability.events.filter(
        (event) => jobUncertainEvents.includes(event) || stepReachability.unknownEvents.includes(event)
      );
      const effectiveEnvironment = mergeEnvironment(
        jobEnvironment,
        rawStep.env
      );
      const materialized = materializeInputs(
        JSON.stringify({
          uses: rawStep.uses,
          run: rawStep.run,
          with: rawStep.with,
          env: effectiveEnvironment,
          shell: rawStep.shell,
          "working-directory": rawStep["working-directory"]
        }),
        context.inputValues
      );
      const stepRun = typeof rawStep.run === "string" ? rawStep.run : "";
      const stepUsesAiAction = looksLikeAiAction(actionReference);
      const materializedRun = materializeInputs(stepRun, context.inputValues);
      const cliInvocations = aiCliInvocations(materializedRun);
      const stepUsesAiCli = cliInvocations.length > 0;
      const httpDispatches = aiHttpDispatches(materializedRun);
      const stepUsesAi = stepUsesAiAction || stepUsesAiCli || httpDispatches.length > 0;
      if (cliInvocations.some((invocation) => invocation.uncertainControlFlow) || httpDispatches.some((dispatch) => dispatch.uncertainControlFlow) || (stepUsesAiCli || httpDispatches.length > 0) && hasOpaqueAiShellGrouping(materializedRun)) {
        output.diagnostics.push({
          code: "agentci/analysis-shell-control-flow-unknown",
          kind: "analysis",
          severity: "warning",
          file,
          job: jobName,
          step_index: index,
          line: stepLine,
          message: "An AI invocation appears in a shell branch or group whose reachability cannot be resolved statically; findings describe a possible path, not guaranteed execution."
        });
      }
      if (hasOpaqueAiCliSubstitution(materializedRun) || hasOpaqueAiHttpSubstitution(materializedRun) || hasOpaqueAiShellFunction(materializedRun) || hasOpaqueAiCliShellCommand(materializedRun) || hasOpaqueAiHttpShellCommand(materializedRun)) {
        output.diagnostics.push({
          code: "agentci/analysis-run-dataflow-unknown",
          kind: "analysis",
          severity: "warning",
          file,
          job: jobName,
          step_index: index,
          line: stepLine,
          message: "A possible AI call inside command substitution, a shell-evaluated string, or a shell function could not be attributed to a direct executable command."
        });
      }
      const httpOnly = httpDispatches.length > 0 && !stepUsesAiCli && !stepUsesAiAction;
      const httpCommands = httpDispatches.map((dispatch) => dispatch.command).join("\n");
      const cliCommands = cliInvocations.map((invocation) => invocation.command).join("\n");
      const cliExpandableCommands = cliInvocations.map((invocation) => invocation.expandableCommand).join("\n");
      const payload = httpDispatches.map((dispatch) => dispatch.payload).join("\n");
      const referencedEnvironment = (expressionText, shellText) => Object.fromEntries(
        Object.entries(effectiveEnvironment).filter(([name]) => {
          const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          return new RegExp(
            `\\$\\{\\{\\s*env(?:\\.${escaped}|\\[\\s*['"]${escaped}['"]\\s*\\])\\s*\\}\\}`,
            "i"
          ).test(expressionText) || new RegExp(
            `\\$(?:\\{${escaped}\\}|${escaped}(?![A-Za-z0-9_]))`
          ).test(shellText);
        })
      );
      const cliEnvironment = referencedEnvironment(
        cliCommands,
        cliExpandableCommands
      );
      const sinkMaterial = stepUsesAiAction ? materialized : JSON.stringify({
        cli: cliCommands,
        cli_env: cliEnvironment,
        payload,
        http_env: referencedEnvironment(
          payload,
          httpDispatches.map((dispatch) => dispatch.expandablePayload).join("\n")
        )
      });
      const secretMaterial = httpOnly ? JSON.stringify({
        command: httpCommands,
        env: referencedEnvironment(
          httpCommands,
          httpDispatches.map((dispatch) => dispatch.expandableCommand).join("\n")
        )
      }) : "";
      if (stepUsesAi && stepReachability.events.some(
        (event) => secretEnvTransferEvents.has(event)
      )) {
        output.diagnostics.push({
          code: "agentci/analysis-secret-env-transfer-unknown",
          kind: "analysis",
          severity: "warning",
          file,
          job: jobName,
          step_index: index,
          line: stepLine,
          message: "An earlier step may write a secret to GITHUB_ENV; exposure to this AI step is not modeled."
        });
      }
      if (/\bGITHUB_ENV\b/.test(materializedRun) && (containsSecretReference(materializedRun) || containsSecretReference(JSON.stringify(effectiveEnvironment)))) {
        for (const event of stepReachability.events) {
          secretEnvTransferEvents.add(event);
        }
      }
      const stepActorGate = jobActorGate || hasTrustedActorGate(rawStep.if);
      const stepPrGate = jobPrGate || hasTrustedPrProvenanceGate(rawStep.if);
      const activeMatches = (value) => untrustedGitHubContextMatches(value).filter(
        (match) => contextCanReach(stepReachability.events, [match.event]) && !sourceTrustedByGate(
          match.source,
          match.event,
          stepActorGate,
          stepPrGate,
          creationOnlyEvents
        )
      );
      const sinkMatches = activeMatches(sinkMaterial);
      if (stepUsesAiCli && (cliInvocations.some(
        (invocation) => invocation.opaqueInput || activeMatches(invocation.pipedInput).length > 0
      ) || activeMatches(materializedRun).length > 0 && [
        ...cliExpandableCommands.matchAll(
          /\$(?:\{([A-Za-z_]\w*)\}|([A-Za-z_]\w*))/g
        )
      ].some(
        (match) => !Object.prototype.hasOwnProperty.call(
          effectiveEnvironment,
          match[1] ?? match[2]
        )
      ) || activeMatches(JSON.stringify(effectiveEnvironment)).length > 0 && activeMatches(JSON.stringify(cliEnvironment)).length === 0)) {
        output.diagnostics.push({
          code: "agentci/analysis-run-dataflow-unknown",
          kind: "analysis",
          severity: "warning",
          file,
          job: jobName,
          step_index: index,
          line: stepLine,
          message: "The local AI CLI's stdin, shell variables, or inherited environment may carry input that command-level analysis cannot prove."
        });
      }
      if (httpOnly && (activeMatches(materializedRun).length > 0 && activeMatches(sinkMaterial).length === 0 || containsSecretReference(materializedRun) && !containsSecretReference(secretMaterial) || httpDispatches.some(
        (dispatch) => [
          ...dispatch.expandablePayload.matchAll(
            /\$(?:\{([A-Za-z_]\w*)\}|([A-Za-z_]\w*))/g
          )
        ].some(
          (match) => !Object.prototype.hasOwnProperty.call(
            effectiveEnvironment,
            match[1] ?? match[2]
          )
        )
      ) || httpDispatches.some((dispatch) => dispatch.opaquePayload))) {
        output.diagnostics.push({
          code: "agentci/analysis-run-dataflow-unknown",
          kind: "analysis",
          severity: "warning",
          file,
          job: jobName,
          step_index: index,
          line: stepLine,
          message: "The HTTP request body or another command has unresolved input/secret flow; only direct payload references are findings."
        });
      }
      const hasUntrustedSink = sinkMatches.length > 0;
      const fetchedMatches = stepUsesAiAction && pinnedAnthropicRef === ANTHROPIC_ACTION_WITHOUT_DISCUSSION ? selfFetchedSources(
        effectiveWith,
        stepReachability.events,
        creationOnlyEvents
      ).filter(
        (match) => !sourceTrustedByGate(
          match.source,
          match.event,
          stepActorGate,
          stepPrGate,
          creationOnlyEvents
        )
      ) : [];
      const runMatches = stepRun.trim().length > 0 ? activeMatches(materializeInputs(stepRun, context.inputValues)) : [];
      if (runMatches.length > 0) {
        untrustedInRun = true;
        untrustedRunPaths.push({
          events: unionEvents(
            runMatches.flatMap(
              (match) => match.event === "*" ? stepReachability.events : [match.event]
            )
          ),
          uncertainEvents: stepUncertainEvents
        });
      }
      const hasUntrustedIngestion = hasUntrustedSink || fetchedMatches.length > 0;
      if (httpOnly && hasUntrustedIngestion) {
        output.diagnostics.push({
          code: "agentci/analysis-remote-agent-capability-unknown",
          kind: "analysis",
          severity: "warning",
          file,
          job: jobName,
          step_index: index,
          line: stepLine,
          message: "The HTTP request reaches a hosted agent, but this job's GITHUB_TOKEN permissions do not establish the remote agent's repository write capability."
        });
      }
      const potentialAppWrite = isSelfGatingAgentAction(actionReference) && permissionLevel(jobPermissions, "id-token") === "write" && (!isRecord2(effectiveWith) || String(effectiveWith.github_token ?? "").trim().length === 0);
      const selfGated = isSelfGatingAgentAction(actionReference) && !hasAgentGateBypass(rawStep.with);
      const verifiedSelfGate = selfGated && VERIFIED_ANTHROPIC_WRITE_GATES.has(pinnedAnthropicRef ?? "");
      const ungatedIngestionEvents = unionEvents(
        [...sinkMatches, ...fetchedMatches].flatMap((match) => {
          const events = match.event === "*" ? stepReachability.events : [match.event];
          return events.filter(
            (event) => !verifiedSelfGate || !SELF_GATED_EVENTS.has(event) || sourceMayDifferFromTriggerActor(
              match.source,
              event,
              creationOnlyEvents
            )
          );
        })
      );
      const knownAgentModeWithoutImplicitFetch = pinnedAnthropicRef === ANTHROPIC_ACTION_AGENT_PROMPT_VERIFIED && isRecord2(effectiveWith) && String(effectiveWith.prompt ?? "").length > 0 && !/^\$\{\{[\s\S]*\}\}$/.test(String(effectiveWith.prompt)) && String(effectiveWith.track_progress ?? "") !== "true" && !String(effectiveWith.track_progress ?? "").includes("${{");
      const implicitIngestionUnknown = stepUsesAiAction && pinnedAnthropicRef !== ANTHROPIC_ACTION_WITHOUT_DISCUSSION && !knownAgentModeWithoutImplicitFetch && stepReachability.events.some((event) => UNTRUSTED_EVENTS.has(event)) && (hasSensitiveWrite(jobPermissions) || potentialAppWrite);
      if (implicitIngestionUnknown) {
        output.diagnostics.push({
          code: "agentci/analysis-agent-implicit-ingestion-unknown",
          kind: "analysis",
          severity: "warning",
          file,
          job: jobName,
          step_index: index,
          line: stepLine,
          message: "This AI Action ref/event has no verified contract for implicit Issue, PR, or comment ingestion; explicit input flow is analyzed separately."
        });
      }
      const ingestionEvents = unionEvents(
        [...sinkMatches, ...fetchedMatches].flatMap(
          (match) => match.event === "*" ? stepReachability.events : [match.event]
        )
      );
      const sourceMayDifferFromTrigger = [
        ...sinkMatches,
        ...fetchedMatches
      ].some(
        (match) => sourceMayDifferFromTriggerActor(
          match.source,
          match.event,
          creationOnlyEvents
        )
      );
      const hasSecret = httpOnly ? containsSecretReference(secretMaterial) : containsSecretReference(JSON.stringify(effectiveEnvironment)) || containsSecretReference(
        materializeInputs(
          JSON.stringify({
            uses: rawStep.uses,
            run: rawStep.run,
            with: rawStep.with
          }),
          context.inputValues
        )
      );
      if (stepUsesAi) {
        const toolFetchUnknown = Boolean(
          ["issues", "issue_comment"].some(
            (event) => stepReachability.events.includes(event) && !sourceTrustedByGate(
              "issue",
              event,
              stepActorGate || verifiedSelfGate,
              stepPrGate,
              creationOnlyEvents
            )
          ) && (hasSensitiveWrite(jobPermissions) || potentialAppWrite) && (potentialAppWrite || ["GH_TOKEN", "GITHUB_TOKEN"].some(
            (name) => String(effectiveEnvironment[name] ?? "").trim()
          ) || isRecord2(effectiveWith) && String(effectiveWith.github_token ?? "").trim()) && mayFetchIssueViaTool(actionReference, effectiveWith)
        );
        if (toolFetchUnknown) {
          output.diagnostics.push({
            code: "agentci/analysis-agent-tool-fetch-unknown",
            kind: "analysis",
            severity: "warning",
            file,
            job: jobName,
            step_index: index,
            line: stepLine,
            message: "The agent may read an untrusted Issue body with its permitted gh issue tool and a token, but static analysis cannot prove the tool was called."
          });
        }
        output.agentUsages.push({
          id: [file, jobName, index, context.callChain.join(">")].join(":"),
          file,
          job: jobName,
          step: stepName,
          step_index: index,
          kind: httpOnly ? "http" : stepRun.trim().length > 0 ? "cli" : stepUses.length > 0 ? "action" : "other",
          evidence: shrink(
            cliCommands || httpCommands || stepUses || materialized
          ),
          line: stepLine,
          reachable_events: stepReachability.events,
          uncertain_reachable_events: stepUncertainEvents.length ? stepUncertainEvents : void 0,
          call_chain: context.callChain.length > 0 ? context.callChain : void 0
        });
        aiSteps.push({
          hasSecret,
          hasUntrustedSink,
          hasUntrustedIngestion,
          remoteHttp: httpOnly,
          sourceMayDifferFromTrigger,
          ungatedIngestionEvents,
          ingestionEvents,
          potentialAppWrite,
          implicitIngestionUnknown,
          toolFetchUnknown,
          verifiedSelfGate,
          actorGated: stepActorGate,
          events: stepReachability.events,
          uncertainEvents: stepUncertainEvents
        });
        if (hasUntrustedSink) {
          output.findings.push(
            makeFinding("agentci/untrusted-input-in-prompt", {
              file,
              job: jobName,
              step: stepName,
              stepIndex: index,
              evidence: shrink(sinkMaterial),
              line: stepLine,
              events: unionEvents(
                sinkMatches.flatMap(
                  (match) => match.event === "*" ? stepReachability.events : [match.event]
                )
              ),
              uncertainEvents: stepUncertainEvents,
              callChain: context.callChain
            })
          );
        }
        if (stepUsesAiCli || containsShellAccess(effectiveWith)) {
          output.findings.push(
            makeFinding("agentci/ai-shell-access", {
              file,
              job: jobName,
              step: stepName,
              stepIndex: index,
              evidence: stepUsesAiCli ? `AI CLI executes through run: ${shrink(stepRun)}` : shrink(JSON.stringify(effectiveWith)),
              line: stepLine,
              events: stepReachability.events,
              uncertainEvents: stepUncertainEvents,
              callChain: context.callChain
            })
          );
        }
        if (stepUses && !isPinnedAction(stepUses) && !isLocalAction(stepUses)) {
          output.findings.push(
            makeFinding("agentci/unpinned-ai-action", {
              file,
              job: jobName,
              step: stepName,
              stepIndex: index,
              evidence: `uses: ${stepUses}`,
              line: stepLine,
              events: stepReachability.events,
              uncertainEvents: stepUncertainEvents,
              callChain: context.callChain
            })
          );
        }
      }
      if (stepReachability.events.includes("pull_request_target")) {
        const checkout = assessPullRequestTargetCheckout(rawStep);
        if (checkout === "unsafe") {
          output.findings.push(
            makeFinding("agentci/unsafe-checkout", {
              file,
              job: jobName,
              step: stepName,
              stepIndex: index,
              evidence: shrink(JSON.stringify(rawStep)),
              line: stepLine,
              events: ["pull_request_target"],
              uncertainEvents: stepUncertainEvents,
              callChain: context.callChain
            })
          );
        } else if (checkout === "unknown") {
          output.diagnostics.push({
            code: "agentci/analysis-checkout-protection-unknown",
            kind: "analysis",
            severity: "warning",
            file,
            job: jobName,
            step_index: index,
            line: stepLine,
            message: "The checkout step requests pull-request code, but its ref does not identify whether GitHub's built-in unsafe-PR protection is present."
          });
        }
      }
    }
    if (aiSteps.length === 0) continue;
    const jobHasWrite = hasSensitiveWrite(jobPermissions);
    const prTargetSteps = aiSteps.filter(
      (step) => !step.actorGated && step.events.includes("pull_request_target")
    );
    const ingesting = aiSteps.filter(
      (step) => step.hasUntrustedIngestion && !step.remoteHttp && step.ingestionEvents.some((event) => UNTRUSTED_EVENTS.has(event)) && (jobHasWrite || step.potentialAppWrite)
    );
    const untrustedViaInterpolation = ingesting.some(
      (step) => step.hasUntrustedSink
    );
    if (prTargetSteps.length > 0) {
      output.findings.push(
        makeFinding("agentci/pull-request-target-ai", {
          file,
          job: jobName,
          evidence: "AI usage is reachable on pull_request_target",
          line: jobLine,
          events: ["pull_request_target"],
          uncertainEvents: uncertainWitnessEvents(
            ["pull_request_target"],
            prTargetSteps
          ),
          callChain: context.callChain
        })
      );
    }
    if (ingesting.length > 0) {
      const reachableUntrusted = unionEvents(
        ingesting.flatMap((step) => step.ingestionEvents)
      ).filter((event) => UNTRUSTED_EVENTS.has(event));
      const gated = ingesting.every((step) => step.verifiedSelfGate) && reachableUntrusted.every((event) => SELF_GATED_EVENTS.has(event)) && !ingesting.some((step) => step.sourceMayDifferFromTrigger) && !untrustedInRun;
      if (!gated || !aiSteps.some(
        (step) => step.implicitIngestionUnknown || step.toolFetchUnknown
      ) && !output.diagnostics.some(
        (diagnostic) => diagnostic.file === file && diagnostic.job === jobName && diagnostic.code === "agentci/analysis-run-dataflow-unknown"
      ))
        output.findings.push(
          makeFinding(
            gated ? "agentci/gated-ai-write-token" : "agentci/untrusted-ai-write-token",
            {
              file,
              job: jobName,
              evidence: gated ? "actor-authored event content + AI usage + effective write permission; anthropics/claude-code-action normally checks the triggering actor for repository write access, with no configured allowlist bypass or untrusted run: expansion" : untrustedViaInterpolation ? "reachable untrusted event content + AI usage + workflow or potential Action App write capability" : "AI agent action may ingest reachable event content through its runtime context + workflow or potential Action App write capability",
              line: jobLine,
              events: reachableUntrusted,
              uncertainEvents: gated ? uncertainWitnessEvents(
                reachableUntrusted,
                ingesting.map((step) => ({
                  events: step.ingestionEvents,
                  uncertainEvents: step.uncertainEvents
                }))
              ) : reachableUntrusted.filter(
                (event) => !ingesting.some(
                  (step) => step.ungatedIngestionEvents.includes(event) && !step.uncertainEvents.includes(event)
                ) && !(untrustedRunPaths.some(
                  (run) => run.events.includes(event) && !run.uncertainEvents.includes(event)
                ) && ingesting.some(
                  (step) => step.ingestionEvents.includes(event) && !step.uncertainEvents.includes(event)
                ))
              ),
              callChain: context.callChain
            }
          )
        );
    }
    const secretSteps = aiSteps.filter((step) => step.hasSecret);
    if (secretSteps.length > 0) {
      const events = unionEvents(secretSteps.flatMap((step) => step.events));
      output.findings.push(
        makeFinding("agentci/ai-with-secrets", {
          file,
          job: jobName,
          evidence: "AI step's effective environment or inputs reference a secret/token",
          line: jobLine,
          events,
          uncertainEvents: uncertainWitnessEvents(events, secretSteps),
          callChain: context.callChain
        })
      );
    }
    if (jobHasWrite) {
      const events = unionEvents(aiSteps.flatMap((step) => step.events));
      output.findings.push(
        makeFinding("agentci/broad-write-permissions", {
          file,
          job: jobName,
          evidence: `effective permissions: ${describePermissions(jobPermissions)}`,
          line: jobLine,
          events,
          uncertainEvents: uncertainWitnessEvents(events, aiSteps),
          callChain: context.callChain
        })
      );
    } else if (hasUnknownSensitivePermission(jobPermissions)) {
      output.diagnostics.push({
        code: "agentci/analysis-permissions-unknown",
        kind: "analysis",
        severity: "warning",
        file,
        job: jobName,
        line: jobLine,
        message: "AI job omits explicit permissions and no defaultPermissions policy is configured; write capability is unknown."
      });
    }
  }
  const ignores = parseInlineIgnores(workflow.raw);
  output.findings = ignores.all ? [] : output.findings.filter((finding) => !ignores.rules.has(finding.rule_id));
  return output;
}
function analyzeReusableCall(caller, jobName, rawJob, jobLine, events, uncertainEvents, creationOnlyEvents, permissions, repository, context) {
  const uses = String(rawJob.uses);
  const callerFile = relativeFile(repository.root, caller.path);
  if (!uses.startsWith("./")) {
    return {
      agentUsages: [],
      findings: [],
      diagnostics: [
        {
          code: "agentci/analysis-remote-reusable-workflow",
          kind: "analysis",
          severity: "warning",
          file: callerFile,
          job: jobName,
          line: jobLine,
          message: `Remote reusable workflow cannot be resolved statically: ${uses}`
        }
      ]
    };
  }
  const targetPath = path2.resolve(repository.root, uses);
  const target = repository.workflows.get(targetPath);
  if (!target) {
    return {
      agentUsages: [],
      findings: [],
      diagnostics: [
        {
          code: "agentci/analysis-local-reusable-missing",
          kind: "analysis",
          severity: "error",
          file: callerFile,
          job: jobName,
          line: jobLine,
          message: `Local reusable workflow was not found: ${uses}`
        }
      ]
    };
  }
  repository.called.add(targetPath);
  if (context.stack.includes(targetPath)) {
    return {
      agentUsages: [],
      findings: [],
      diagnostics: [
        {
          code: "agentci/analysis-reusable-cycle",
          kind: "analysis",
          severity: "warning",
          file: callerFile,
          job: jobName,
          line: jobLine,
          message: `Reusable workflow cycle detected at ${uses}`
        }
      ]
    };
  }
  return analyzeWorkflow(target, repository, {
    events,
    uncertainEvents,
    triggerSource: context.triggerSource,
    creationOnlyEvents,
    actorGate: Boolean(context.actorGate) || hasTrustedActorGate(rawJob.if),
    prGate: Boolean(context.prGate) || hasTrustedPrProvenanceGate(rawJob.if),
    permissionCeiling: permissions,
    inputValues: toStringMap(rawJob.with, context.inputValues),
    stack: [...context.stack, path2.resolve(caller.path), targetPath],
    callChain: [...context.callChain, `${callerFile}#${jobName}`]
  });
}
function makeFinding(ruleId, context) {
  const rule = RULES[ruleId];
  if (!rule) throw new Error(`Unknown rule: ${ruleId}`);
  const chain = context.callChain?.join(">") ?? "";
  const id = `${ruleId}:${context.file}:${context.job ?? ""}:${context.stepIndex ?? ""}:${chain}`;
  const uncertainEvents = context.events?.filter(
    (event) => context.uncertainEvents?.includes(event)
  );
  return {
    id,
    rule_id: rule.id,
    title: rule.title,
    severity: rule.severity,
    file: context.file,
    job: context.job,
    step: context.step,
    step_index: context.stepIndex,
    message: rule.title,
    why: rule.why,
    fix: rule.fix,
    evidence: context.evidence,
    line: context.line,
    reachable_events: context.events,
    uncertain_reachable_events: uncertainEvents?.length ? uncertainEvents : void 0,
    call_chain: context.callChain && context.callChain.length > 0 ? context.callChain : void 0
  };
}
function workflowTriggers(workflow) {
  const doc = isRecord2(workflow.document) ? workflow.document : {};
  return normalizeTriggers(doc.on ?? doc["on"]);
}
function contextCanReach(reachableEvents, contextEvents) {
  return contextEvents.includes("*") || contextEvents.some((event) => reachableEvents.includes(event));
}
function creationOnlyTriggers(raw) {
  if (!isRecord2(raw)) return [];
  return Object.entries(raw).filter(([event, settings]) => {
    const creation = event === "discussion" ? "created" : "opened";
    return [
      "issues",
      "pull_request",
      "pull_request_target",
      "discussion"
    ].includes(event) && isRecord2(settings) && Array.isArray(settings.types) && settings.types.length === 1 && settings.types[0] === creation;
  }).map(([event]) => event);
}
function sourceTrustedByGate(source, event, actorGate, prGate, creationOnlyEvents) {
  if (source === "history") return false;
  if (source === "commit") return false;
  if (source === "pull_request") {
    return actorGate && creationOnlyEvents.has(event);
  }
  if (source === "pr_head_ref" || source === "pr_head_content") return prGate;
  if (source === "issue" || source === "discussion") {
    return actorGate && creationOnlyEvents.has(event);
  }
  return actorGate;
}
function sourceMayDifferFromTriggerActor(source, event, creationOnlyEvents) {
  return source === "history" || source === "commit" || source === "pr_head_ref" || source === "pr_head_content" || (source === "issue" || source === "pull_request" || source === "discussion") && !creationOnlyEvents.has(event);
}
function selfFetchedSources(withBlock, events, creationOnlyEvents) {
  const inputs = isRecord2(withBlock) ? withBlock : {};
  const prompt = String(inputs.prompt ?? "");
  const hasPrompt = prompt.length > 0 && !/^\$\{\{[\s\S]*\}\}$/.test(prompt);
  const progress = String(inputs.track_progress ?? "");
  const trackProgress = progress === "true" || progress.includes("${{");
  if (hasPrompt && !trackProgress) return [];
  const defaultTagEvents = /* @__PURE__ */ new Set([
    "issues",
    "issue_comment",
    "pull_request_review",
    "pull_request_review_comment"
  ]);
  return events.flatMap(
    (event) => {
      if (!trackProgress && !defaultTagEvents.has(event)) return [];
      if (event === "issues" || event === "issue_comment") {
        return [
          { event, source: "issue" },
          // issue_comment can target a PR, whose changed-file paths are fetched too.
          ...event === "issue_comment" ? [{ event, source: "pr_head_content" }] : [],
          ...!creationOnlyEvents.has(event) ? [{ event, source: "history" }] : []
        ];
      }
      if ([
        "pull_request",
        "pull_request_target",
        "pull_request_review",
        "pull_request_review_comment"
      ].includes(event)) {
        return [
          { event, source: "pull_request" },
          { event, source: "pr_head_content" },
          ...!creationOnlyEvents.has(event) ? [{ event, source: "history" }] : []
        ];
      }
      return [];
    }
  );
}
function mayFetchIssueViaTool(uses, withBlock) {
  if (!isSelfGatingAgentAction(uses) || !isRecord2(withBlock)) return false;
  return /\$\{\{\s*github\.event\.issue\.number\b/i.test(
    String(withBlock.prompt ?? "")
  ) && /--allowedTools?[^\n]*Bash\(gh issue(?: view)?:\*\)/i.test(
    String(withBlock.claude_args ?? "")
  );
}
function assessPullRequestTargetCheckout(step) {
  if (typeof step.uses !== "string" || !/^actions\/checkout@/i.test(step.uses)) {
    return "not-applicable";
  }
  const inputs = isRecord2(step.with) ? step.with : {};
  const ref = String(inputs.ref ?? "");
  const checkoutRepository = String(inputs.repository ?? "");
  const requestsPullRequestCode = /github\.(?:event\.pull_request\.(?:head\.(?:sha|ref)|merge_commit_sha)|head_ref)/i.test(
    ref
  ) || /refs\/pull\/[^\n]+\/(?:head|merge)/i.test(ref) || /github\.event\.pull_request\.head\.repo\.full_name/i.test(
    checkoutRepository
  );
  if (!requestsPullRequestCode) return "not-applicable";
  const actionRef = step.uses.slice(step.uses.lastIndexOf("@") + 1);
  const protection = /^v1(?:$|\.)/i.test(actionRef) ? "absent" : /^v[2-7]$/i.test(actionRef) || /^v7\./i.test(actionRef) ? "present" : "unknown";
  const optOut = literalBoolean(inputs["allow-unsafe-pr-checkout"]);
  if (protection === "absent" || optOut === true) return "unsafe";
  if (protection === "present" && optOut === false) return "protected";
  return "unknown";
}
function literalBoolean(value) {
  if (value === void 0 || value === false) return false;
  if (value === true) return true;
  if (typeof value !== "string") return "unknown";
  const normalized = value.trim().toLowerCase();
  if (normalized === "false" || normalized === "${{ false }}") return false;
  if (normalized === "true" || normalized === "${{ true }}") return true;
  return "unknown";
}
function materializeInputs(value, inputValues) {
  return value.replace(
    /\$\{\{\s*inputs\.([A-Za-z0-9_-]+)\s*\}\}/g,
    (original, name) => inputValues[name] ?? original
  );
}
function materializeStructure(value, inputValues) {
  if (typeof value === "string") return materializeInputs(value, inputValues);
  if (Array.isArray(value)) {
    return value.map((item) => materializeStructure(item, inputValues));
  }
  if (isRecord2(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        materializeStructure(item, inputValues)
      ])
    );
  }
  return value;
}
function toStringMap(value, parentInputs = {}) {
  if (!isRecord2(value)) return {};
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      materializeInputs(
        typeof item === "string" ? item : JSON.stringify(item ?? ""),
        parentInputs
      )
    ])
  );
}
function locateJobLine(raw, jobName) {
  const lines = raw.split("\n");
  const jobsIndex = lines.findIndex((line) => /^\s*jobs\s*:/.test(line));
  if (jobsIndex < 0) return 1;
  const jobsIndent = indentation(lines[jobsIndex]);
  const matcher = keyMatcher(jobName);
  let childIndent;
  for (let index = jobsIndex + 1; index < lines.length; index++) {
    const line = lines[index];
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const indent = indentation(line);
    if (indent <= jobsIndent) break;
    if (childIndent === void 0) childIndent = indent;
    if (indent !== childIndent) continue;
    if (matcher.test(line.trim())) return index + 1;
  }
  return jobsIndex + 1;
}
function locateStepLine(raw, jobName, stepIndex) {
  const lines = raw.split("\n");
  const jobLine = locateJobLine(raw, jobName);
  const jobIndex = Math.max(0, jobLine - 1);
  const jobIndent = indentation(lines[jobIndex] ?? "");
  let stepsIndex = -1;
  let stepsIndent = -1;
  for (let index = jobIndex + 1; index < lines.length; index++) {
    const line = lines[index];
    if (line.trim() && indentation(line) <= jobIndent) break;
    if (/^\s*steps\s*:/.test(line)) {
      stepsIndex = index;
      stepsIndent = indentation(line);
      break;
    }
  }
  if (stepsIndex < 0) return jobLine;
  const stepStarts = [];
  let itemIndent;
  for (let index = stepsIndex + 1; index < lines.length; index++) {
    const line = lines[index];
    if (line.trim() && indentation(line) <= stepsIndent) break;
    const match = /^(\s*)-\s+(?:name\s*:\s*)?(.*)$/.exec(line);
    if (!match) continue;
    const indent = match[1].length;
    if (itemIndent === void 0) itemIndent = indent;
    if (indent !== itemIndent) continue;
    stepStarts.push(index + 1);
  }
  return stepStarts[stepIndex] ?? jobLine;
}
function keyMatcher(key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^(?:${escaped}|"${escaped}"|'${escaped}')\\s*:`);
}
function indentation(line) {
  return /^\s*/.exec(line)?.[0].length ?? 0;
}
function isLocalAction(uses) {
  return uses.startsWith("./") || uses.startsWith("docker://");
}
function relativeFile(root, file) {
  return path2.relative(root, file).split(path2.sep).join("/");
}
function shrink(value) {
  return value.length > 500 ? `${value.slice(0, 500)}...` : value;
}
function unionEvents(events) {
  return [...new Set(events)].sort();
}
function uncertainWitnessEvents(events, witnesses) {
  return events.filter(
    (event) => !witnesses.some(
      (witness) => witness.events.includes(event) && !witness.uncertainEvents.includes(event)
    )
  );
}
function mergeOutput(target, source) {
  target.agentUsages.push(...source.agentUsages);
  target.findings.push(...source.findings);
  target.diagnostics.push(...source.diagnostics);
}
function dedupeAgentUsages(usages) {
  const seen = /* @__PURE__ */ new Set();
  return usages.filter((usage) => {
    if (seen.has(usage.id)) return false;
    seen.add(usage.id);
    return true;
  });
}
function dedupe(findings) {
  const seen = /* @__PURE__ */ new Set();
  return findings.filter((finding) => {
    if (seen.has(finding.id)) return false;
    seen.add(finding.id);
    return true;
  });
}
function dedupeDiagnostics(diagnostics) {
  const seen = /* @__PURE__ */ new Set();
  return diagnostics.filter((diagnostic) => {
    const key = `${diagnostic.code}:${diagnostic.file}:${diagnostic.job ?? ""}:${diagnostic.step_index ?? ""}:${diagnostic.line ?? ""}:${diagnostic.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function summarize(findings) {
  return {
    low: findings.filter((finding) => finding.severity === "low").length,
    medium: findings.filter((finding) => finding.severity === "medium").length,
    high: findings.filter((finding) => finding.severity === "high").length,
    critical: findings.filter((finding) => finding.severity === "critical").length
  };
}
function isRecord2(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

// src/report.ts
var import_picocolors = __toESM(require_picocolors(), 1);
function formatGithubOutputs(result, sarifPath) {
  return [
    `findings=${result.findings.length}`,
    `critical=${result.summary.critical}`,
    `high=${result.summary.high}`,
    `medium=${result.summary.medium}`,
    `low=${result.summary.low}`,
    `sarif-path=${sarifPath ?? ""}`,
    `diagnostics=${result.diagnostics.length}`,
    `analysis-complete=${result.analysis_complete}`
  ].join("\n") + "\n";
}
function renderTextReport(result) {
  const lines = [
    "AgentCI Guard scan",
    `Workflows: ${result.workflow_count}`,
    `Findings: ${result.findings.length}`,
    `Summary: critical=${result.summary.critical} high=${result.summary.high} medium=${result.summary.medium} low=${result.summary.low}`,
    `Analysis: ${result.analysis_complete ? "complete" : `incomplete (${result.diagnostics.length} diagnostic(s))`}`,
    ""
  ];
  for (const finding of result.findings) {
    lines.push(`${label(finding.severity)} ${finding.rule_id}`);
    lines.push(
      `File: ${finding.file}${finding.line ? `:${finding.line}` : ""}${finding.job ? ` / job: ${finding.job}` : ""}${finding.step ? ` / step: ${finding.step}` : ""}${finding.step_index === void 0 ? "" : ` / step_index: ${finding.step_index}`}`
    );
    for (const [name, events] of eventPathDetails(finding)) {
      lines.push(`${name}: ${events}`);
    }
    lines.push(`Evidence: ${finding.evidence}`);
    lines.push(`Why: ${finding.why}`);
    lines.push("Fix:");
    for (const fix of finding.fix) lines.push(`- ${fix}`);
    lines.push("");
  }
  if (result.diagnostics.length > 0) {
    lines.push("Diagnostics:");
    for (const diagnostic of result.diagnostics) {
      lines.push(
        `- [${diagnostic.kind.toUpperCase()}] ${diagnostic.code} ${diagnostic.file}${diagnostic.line ? `:${diagnostic.line}` : ""}${diagnostic.step_index === void 0 ? "" : ` [step_index=${diagnostic.step_index}]`}: ${diagnostic.message}`
      );
    }
  }
  return lines.join("\n");
}
function eventPathDetails(finding) {
  const possible = finding.uncertain_reachable_events ?? [];
  if (possible.length === 0) return [];
  const resolved = (finding.reachable_events ?? []).filter(
    (event) => !possible.includes(event)
  );
  const details = [];
  if (resolved.length)
    details.push(["Event paths with resolved if", resolved.join(", ")]);
  details.push(["Possible event paths (unresolved if)", possible.join(", ")]);
  return details;
}
function label(severity) {
  if (severity === "critical") return import_picocolors.default.red("[CRITICAL]");
  if (severity === "high") return import_picocolors.default.red("[HIGH]");
  if (severity === "medium") return import_picocolors.default.yellow("[MEDIUM]");
  return import_picocolors.default.cyan("[LOW]");
}

// src/sarif.ts
function toSarif(input2) {
  const findings = Array.isArray(input2) ? input2 : input2.findings;
  const scan = Array.isArray(input2) ? void 0 : input2;
  const usedRules = Object.values(RULES).filter(
    (rule) => findings.some((finding) => finding.rule_id === rule.id)
  );
  return {
    version: "2.1.0",
    $schema: "https://docs.oasis-open.org/sarif/sarif/v2.1.0/errata01/os/schemas/sarif-schema-2.1.0.json",
    runs: [
      {
        tool: {
          driver: {
            name: "AgentCI Guard",
            informationUri: "https://github.com/David-Wu1119/agentci-guard",
            rules: usedRules.map((rule) => ({
              id: rule.id,
              name: rule.title,
              shortDescription: { text: rule.title },
              fullDescription: { text: rule.why },
              help: {
                text: rule.fix.join(" "),
                markdown: rule.fix.map((fix) => `- ${fix}`).join("\n")
              },
              defaultConfiguration: { level: sarifLevel(rule.severity) }
            }))
          }
        },
        results: findings.map((finding) => ({
          ruleId: finding.rule_id,
          level: sarifLevel(finding.severity),
          message: { text: `${finding.title}: ${finding.evidence}` },
          properties: {
            "agentci/severity": finding.severity,
            "agentci/reachableEvents": finding.reachable_events ?? [],
            ...finding.uncertain_reachable_events?.length ? {
              "agentci/uncertainReachableEvents": finding.uncertain_reachable_events
            } : {},
            ...finding.job ? { "agentci/job": finding.job } : {},
            ...finding.step ? { "agentci/step": finding.step } : {},
            ...finding.step_index === void 0 ? {} : { "agentci/stepIndex": finding.step_index }
          },
          locations: [
            {
              physicalLocation: {
                artifactLocation: { uri: finding.file },
                region: { startLine: finding.line ?? 1 }
              }
            }
          ]
        })),
        ...scan ? {
          invocations: [
            {
              executionSuccessful: scan.analysis_complete,
              toolExecutionNotifications: scan.diagnostics.map(toNotification)
            }
          ],
          properties: {
            "agentci/analysisComplete": scan.analysis_complete,
            "agentci/diagnosticCount": scan.diagnostics.length
          }
        } : {}
      }
    ]
  };
}
function toNotification(diagnostic) {
  return {
    descriptor: { id: diagnostic.code },
    level: diagnostic.severity,
    message: { text: diagnostic.message },
    locations: [
      {
        physicalLocation: {
          artifactLocation: { uri: diagnostic.file },
          ...diagnostic.line ? { region: { startLine: diagnostic.line } } : {}
        }
      }
    ],
    properties: {
      "agentci/kind": diagnostic.kind,
      ...diagnostic.job ? { "agentci/job": diagnostic.job } : {},
      ...diagnostic.step_index === void 0 ? {} : { "agentci/stepIndex": diagnostic.step_index }
    }
  };
}
function sarifLevel(severity) {
  if (severity === "critical" || severity === "high") return "error";
  if (severity === "medium") return "warning";
  return "note";
}

// src/action-runner.ts
var DEFAULT_IO = {
  log: (message) => console.log(message),
  error: (message) => console.error(`::error::${escapeCommand(message)}`)
};
async function runAction(environment = process.env, io = DEFAULT_IO) {
  try {
    const target = input(environment, "PATH", ".");
    const sarifPath = input(environment, "SARIF", "agentci-results.sarif");
    const failOn = parseFailOn(
      input(environment, "FAIL-ON", "high").toLowerCase()
    );
    if (!target.trim()) throw new Error("path input must not be empty.");
    if (!sarifPath.trim()) throw new Error("sarif input must not be empty.");
    if (/[\r\n]/.test(target) || /[\r\n]/.test(sarifPath)) {
      throw new Error("path and sarif inputs must be single-line values.");
    }
    const targetStat = await fs3.stat(path3.resolve(target)).catch(() => null);
    if (!targetStat?.isDirectory()) {
      throw new Error(`scan path is not a directory: ${target}`);
    }
    const result = await scanRepository(target);
    const resolvedSarif = path3.resolve(sarifPath);
    await fs3.mkdir(path3.dirname(resolvedSarif), { recursive: true });
    await fs3.writeFile(
      resolvedSarif,
      `${JSON.stringify(toSarif(result), null, 2)}
`,
      "utf8"
    );
    io.log(renderTextReport(result));
    if (!result.analysis_complete) {
      const codes = [
        ...new Set(result.diagnostics.map((diagnostic) => diagnostic.code))
      ].join(", ");
      const warning = `AgentCI Guard analysis incomplete: ${result.diagnostics.length} diagnostic(s) (${codes}). A zero-finding result from an incomplete analysis is not a clean result.`;
      io.log(`::warning::${escapeCommand(warning)}`);
      if (environment.GITHUB_STEP_SUMMARY) {
        await fs3.appendFile(
          environment.GITHUB_STEP_SUMMARY,
          `> **Warning:** ${warning}
`,
          "utf8"
        );
      }
    }
    const outputFile = environment.GITHUB_OUTPUT;
    if (outputFile) {
      await fs3.appendFile(
        outputFile,
        formatGithubOutputs(result, sarifPath),
        "utf8"
      );
    }
    const errorDiagnostics = result.diagnostics.filter(
      (diagnostic) => diagnostic.severity === "error"
    );
    if (errorDiagnostics.length > 0) {
      io.error(
        `AgentCI Guard could not analyze every workflow: ${errorDiagnostics.length} error diagnostic(s).`
      );
      return 1;
    }
    if (failOn !== "none" && hasFindingAtOrAbove(result.findings, failOn)) {
      io.error(
        `AgentCI Guard found ${result.findings.length} finding(s), including one at or above ${failOn}.`
      );
      return 2;
    }
    return 0;
  } catch (error) {
    io.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
function input(environment, name, fallback) {
  return (environment[`INPUT_${name}`] ?? environment[`INPUT_${name.replaceAll("-", "_")}`] ?? fallback).trim();
}
function escapeCommand(message) {
  return message.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
}

// src/action.ts
process.exitCode = await runAction();
//# sourceMappingURL=action.js.map
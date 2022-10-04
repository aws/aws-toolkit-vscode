let imports = {};
imports['__wbindgen_placeholder__'] = module.exports;
let wasm;
const { TextDecoder, TextEncoder } = require(`util`);
const Parser = require(`web-tree-sitter`);

const heap = new Array(32).fill(undefined);

heap.push(undefined, null, true, false);

function getObject(idx) {
  return heap[idx];
}

let heap_next = heap.length;

function dropObject(idx) {
  if (idx < 36) return;
  heap[idx] = heap_next;
  heap_next = idx;
}

function takeObject(idx) {
  const ret = getObject(idx);
  dropObject(idx);
  return ret;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });

cachedTextDecoder.decode();

let cachedUint8Memory0 = new Uint8Array();

function getUint8Memory0() {
  if (cachedUint8Memory0.byteLength === 0) {
    cachedUint8Memory0 = new Uint8Array(wasm.memory.buffer);
  }
  return cachedUint8Memory0;
}

function getStringFromWasm0(ptr, len) {
  return cachedTextDecoder.decode(getUint8Memory0().subarray(ptr, ptr + len));
}

function addHeapObject(obj) {
  if (heap_next === heap.length) heap.push(heap.length + 1);
  const idx = heap_next;
  heap_next = heap[idx];

  heap[idx] = obj;
  return idx;
}

function debugString(val) {
  // primitive types
  const type = typeof val;
  if (type == 'number' || type == 'boolean' || val == null) {
    return `${val}`;
  }
  if (type == 'string') {
    return `"${val}"`;
  }
  if (type == 'symbol') {
    const description = val.description;
    if (description == null) {
      return 'Symbol';
    } else {
      return `Symbol(${description})`;
    }
  }
  if (type == 'function') {
    const name = val.name;
    if (typeof name == 'string' && name.length > 0) {
      return `Function(${name})`;
    } else {
      return 'Function';
    }
  }
  // objects
  if (Array.isArray(val)) {
    const length = val.length;
    let debug = '[';
    if (length > 0) {
      debug += debugString(val[0]);
    }
    for (let i = 1; i < length; i++) {
      debug += ', ' + debugString(val[i]);
    }
    debug += ']';
    return debug;
  }
  // Test for built-in
  const builtInMatches = /\[object ([^\]]+)\]/.exec(toString.call(val));
  let className;
  if (builtInMatches.length > 1) {
    className = builtInMatches[1];
  } else {
    // Failed to match the standard '[object ClassName]'
    return toString.call(val);
  }
  if (className == 'Object') {
    // we're a user defined class or Object
    // JSON.stringify avoids problems with cycles, and is generally much
    // easier than looping through ownProperties of `val`.
    try {
      return 'Object(' + JSON.stringify(val) + ')';
    } catch (_) {
      return 'Object';
    }
  }
  // errors
  if (val instanceof Error) {
    return `${val.name}: ${val.message}\n${val.stack}`;
  }
  // TODO we could test for more things here, like `Set`s and `Map`s.
  return className;
}

let WASM_VECTOR_LEN = 0;

let cachedTextEncoder = new TextEncoder('utf-8');

const encodeString =
  typeof cachedTextEncoder.encodeInto === 'function'
    ? function (arg, view) {
        return cachedTextEncoder.encodeInto(arg, view);
      }
    : function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
          read: arg.length,
          written: buf.length,
        };
      };

function passStringToWasm0(arg, malloc, realloc) {
  if (realloc === undefined) {
    const buf = cachedTextEncoder.encode(arg);
    const ptr = malloc(buf.length);
    getUint8Memory0()
      .subarray(ptr, ptr + buf.length)
      .set(buf);
    WASM_VECTOR_LEN = buf.length;
    return ptr;
  }

  let len = arg.length;
  let ptr = malloc(len);

  const mem = getUint8Memory0();

  let offset = 0;

  for (; offset < len; offset++) {
    const code = arg.charCodeAt(offset);
    if (code > 0x7f) break;
    mem[ptr + offset] = code;
  }

  if (offset !== len) {
    if (offset !== 0) {
      arg = arg.slice(offset);
    }
    ptr = realloc(ptr, len, (len = offset + arg.length * 3));
    const view = getUint8Memory0().subarray(ptr + offset, ptr + len);
    const ret = encodeString(arg, view);

    offset += ret.written;
  }

  WASM_VECTOR_LEN = offset;
  return ptr;
}

let cachedInt32Memory0 = new Int32Array();

function getInt32Memory0() {
  if (cachedInt32Memory0.byteLength === 0) {
    cachedInt32Memory0 = new Int32Array(wasm.memory.buffer);
  }
  return cachedInt32Memory0;
}

function makeMutClosure(arg0, arg1, dtor, f) {
  const state = { a: arg0, b: arg1, cnt: 1, dtor };
  const real = (...args) => {
    // First up with a closure we increment the internal reference
    // count. This ensures that the Rust closure environment won't
    // be deallocated while we're invoking it.
    state.cnt++;
    const a = state.a;
    state.a = 0;
    try {
      return f(a, state.b, ...args);
    } finally {
      if (--state.cnt === 0) {
        wasm.__wbindgen_export_2.get(state.dtor)(a, state.b);
      } else {
        state.a = a;
      }
    }
  };
  real.original = state;

  return real;
}
function __wbg_adapter_12(arg0, arg1, arg2) {
  wasm._dyn_core__ops__function__FnMut__A____Output___R_as_wasm_bindgen__closure__WasmClosure___describe__invoke__h0edfae42e7308e6a(
    arg0,
    arg1,
    addHeapObject(arg2),
  );
}

function _assertClass(instance, klass) {
  if (!(instance instanceof klass)) {
    throw new Error(`expected instance of ${klass.name}`);
  }
  return instance.ptr;
}

function getArrayU8FromWasm0(ptr, len) {
  return getUint8Memory0().subarray(ptr / 1, ptr / 1 + len);
}

function isLikeNone(x) {
  return x === undefined || x === null;
}

function handleError(f, args) {
  try {
    return f.apply(this, args);
  } catch (e) {
    wasm.__wbindgen_exn_store(addHeapObject(e));
  }
}
function __wbg_adapter_80(arg0, arg1, arg2, arg3) {
  wasm.wasm_bindgen__convert__closures__invoke2_mut__h6569aace1464e287(
    arg0,
    arg1,
    addHeapObject(arg2),
    addHeapObject(arg3),
  );
}

/**
 */
class Extent {
  static __wrap(ptr) {
    const obj = Object.create(Extent.prototype);
    obj.ptr = ptr;

    return obj;
  }

  __destroy_into_raw() {
    const ptr = this.ptr;
    this.ptr = 0;

    return ptr;
  }

  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_extent_free(ptr);
  }
  /**
   * @returns {Location}
   */
  get start() {
    const ret = wasm.__wbg_get_extent_start(this.ptr);
    return Location.__wrap(ret);
  }
  /**
   * @param {Location} arg0
   */
  set start(arg0) {
    _assertClass(arg0, Location);
    var ptr0 = arg0.ptr;
    arg0.ptr = 0;
    wasm.__wbg_set_extent_start(this.ptr, ptr0);
  }
  /**
   * @returns {Location}
   */
  get end() {
    const ret = wasm.__wbg_get_extent_end(this.ptr);
    return Location.__wrap(ret);
  }
  /**
   * @param {Location} arg0
   */
  set end(arg0) {
    _assertClass(arg0, Location);
    var ptr0 = arg0.ptr;
    arg0.ptr = 0;
    wasm.__wbg_set_extent_end(this.ptr, ptr0);
  }
  /**
   * @param {Location} start
   * @param {Location} end
   */
  constructor(start, end) {
    _assertClass(start, Location);
    var ptr0 = start.ptr;
    start.ptr = 0;
    _assertClass(end, Location);
    var ptr1 = end.ptr;
    end.ptr = 0;
    const ret = wasm.extent_new(ptr0, ptr1);
    return Extent.__wrap(ret);
  }
  /**
   * Check if two extents overlap, i.e. the one extent is (partially) included in the other.
   * @param {Extent} other
   * @returns {boolean}
   */
  overlaps_with(other) {
    _assertClass(other, Extent);
    const ret = wasm.extent_overlaps_with(this.ptr, other.ptr);
    return ret !== 0;
  }
}
module.exports.Extent = Extent;
/**
 */
class Java {
  __destroy_into_raw() {
    const ptr = this.ptr;
    this.ptr = 0;

    return ptr;
  }

  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_java_free(ptr);
  }
  /**
   * @param {string} code
   * @returns {Promise<any>}
   */
  static findNames(code) {
    const ptr0 = passStringToWasm0(code, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.java_findNames(ptr0, len0);
    return takeObject(ret);
  }
  /**
   * @param {string} code
   * @param {Extent} extent
   * @returns {Promise<any>}
   */
  static findNamesWithInExtent(code, extent) {
    const ptr0 = passStringToWasm0(code, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    _assertClass(extent, Extent);
    var ptr1 = extent.ptr;
    extent.ptr = 0;
    const ret = wasm.java_findNamesWithInExtent(ptr0, len0, ptr1);
    return takeObject(ret);
  }
}
module.exports.Java = Java;
/**
 */
class Location {
  static __wrap(ptr) {
    const obj = Object.create(Location.prototype);
    obj.ptr = ptr;

    return obj;
  }

  __destroy_into_raw() {
    const ptr = this.ptr;
    this.ptr = 0;

    return ptr;
  }

  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_location_free(ptr);
  }
  /**
   * @returns {number}
   */
  get line() {
    const ret = wasm.__wbg_get_location_line(this.ptr);
    return ret >>> 0;
  }
  /**
   * @param {number} arg0
   */
  set line(arg0) {
    wasm.__wbg_set_location_line(this.ptr, arg0);
  }
  /**
   * @returns {number}
   */
  get character() {
    const ret = wasm.__wbg_get_location_character(this.ptr);
    return ret >>> 0;
  }
  /**
   * @param {number} arg0
   */
  set character(arg0) {
    wasm.__wbg_set_location_character(this.ptr, arg0);
  }
  /**
   * @param {number} line
   * @param {number} character
   */
  constructor(line, character) {
    const ret = wasm.location_new(line, character);
    return Location.__wrap(ret);
  }
}
module.exports.Location = Location;
/**
 */
class Python {
  __destroy_into_raw() {
    const ptr = this.ptr;
    this.ptr = 0;

    return ptr;
  }

  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_python_free(ptr);
  }
  /**
   * @param {string} code
   * @returns {Promise<any>}
   */
  static findNames(code) {
    const ptr0 = passStringToWasm0(code, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.python_findNames(ptr0, len0);
    return takeObject(ret);
  }
  /**
   * @param {string} code
   * @param {Extent} extent
   * @returns {Promise<any>}
   */
  static findNamesWithInExtent(code, extent) {
    const ptr0 = passStringToWasm0(code, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    _assertClass(extent, Extent);
    var ptr1 = extent.ptr;
    extent.ptr = 0;
    const ret = wasm.python_findNamesWithInExtent(ptr0, len0, ptr1);
    return takeObject(ret);
  }
}
module.exports.Python = Python;
/**
 */
class Tsx {
  __destroy_into_raw() {
    const ptr = this.ptr;
    this.ptr = 0;

    return ptr;
  }

  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_tsx_free(ptr);
  }
  /**
   * @param {string} code
   * @returns {Promise<any>}
   */
  static findNames(code) {
    const ptr0 = passStringToWasm0(code, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.tsx_findNames(ptr0, len0);
    return takeObject(ret);
  }
  /**
   * @param {string} code
   * @param {Extent} extent
   * @returns {Promise<any>}
   */
  static findNamesWithInExtent(code, extent) {
    const ptr0 = passStringToWasm0(code, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    _assertClass(extent, Extent);
    var ptr1 = extent.ptr;
    extent.ptr = 0;
    const ret = wasm.tsx_findNamesWithInExtent(ptr0, len0, ptr1);
    return takeObject(ret);
  }
}
module.exports.Tsx = Tsx;
/**
 */
class TypeScript {
  __destroy_into_raw() {
    const ptr = this.ptr;
    this.ptr = 0;

    return ptr;
  }

  free() {
    const ptr = this.__destroy_into_raw();
    wasm.__wbg_typescript_free(ptr);
  }
  /**
   * @param {string} code
   * @returns {Promise<any>}
   */
  static findNames(code) {
    const ptr0 = passStringToWasm0(code, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.typescript_findNames(ptr0, len0);
    return takeObject(ret);
  }
  /**
   * @param {string} code
   * @param {Extent} extent
   * @returns {Promise<any>}
   */
  static findNamesWithInExtent(code, extent) {
    const ptr0 = passStringToWasm0(code, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    _assertClass(extent, Extent);
    var ptr1 = extent.ptr;
    extent.ptr = 0;
    const ret = wasm.typescript_findNamesWithInExtent(ptr0, len0, ptr1);
    return takeObject(ret);
  }
}
module.exports.TypeScript = TypeScript;

module.exports.__wbg_currentNode_743e40dbb9752693 = function (arg0) {
  const ret = getObject(arg0).currentNode();
  return addHeapObject(ret);
};

module.exports.__wbindgen_object_drop_ref = function (arg0) {
  takeObject(arg0);
};

module.exports.__wbg_gotoFirstChild_c1b25d1286d4f100 = function (arg0) {
  const ret = getObject(arg0).gotoFirstChild();
  return ret;
};

module.exports.__wbg_type_808f16dadce2d9a8 = function (arg0, arg1) {
  const ret = getObject(arg1).type;
  const ptr0 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
  const len0 = WASM_VECTOR_LEN;
  getInt32Memory0()[arg0 / 4 + 1] = len0;
  getInt32Memory0()[arg0 / 4 + 0] = ptr0;
};

module.exports.__wbg_gotoNextSibling_5f48d68cd943055e = function (arg0) {
  const ret = getObject(arg0).gotoNextSibling();
  return ret;
};

module.exports.__wbg_gotoParent_8782b2c4ac8815b1 = function (arg0) {
  const ret = getObject(arg0).gotoParent();
  return ret;
};

module.exports.__wbg_startIndex_7a51d5ed60520d4a = function (arg0) {
  const ret = getObject(arg0).startIndex;
  return ret;
};

module.exports.__wbg_endIndex_92e31b9d47bf64ec = function (arg0) {
  const ret = getObject(arg0).endIndex;
  return ret;
};

module.exports.__wbg_walk_765587dff4642c4b = function (arg0) {
  const ret = getObject(arg0).walk();
  return addHeapObject(ret);
};

module.exports.__wbg_childForFieldName_84762194c7e9f5ad = function (arg0, arg1, arg2) {
  const ret = getObject(arg0).childForFieldName(getStringFromWasm0(arg1, arg2));
  return isLikeNone(ret) ? 0 : addHeapObject(ret);
};

module.exports.__wbg_isNamed_2b04134601bbe1c4 = function (arg0) {
  const ret = getObject(arg0).isNamed();
  return ret;
};

module.exports.__wbg_currentFieldName_87363f752603a5a2 = function (arg0, arg1) {
  const ret = getObject(arg1).currentFieldName();
  var ptr0 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
  var len0 = WASM_VECTOR_LEN;
  getInt32Memory0()[arg0 / 4 + 1] = len0;
  getInt32Memory0()[arg0 / 4 + 0] = ptr0;
};

module.exports.__wbg_hasError_827f0dbc31961fed = function (arg0) {
  const ret = getObject(arg0).hasError();
  return ret;
};

module.exports.__wbg_isMissing_cbb40c5fbb513392 = function (arg0) {
  const ret = getObject(arg0).isMissing();
  return ret;
};

module.exports.__wbg_startPosition_ae969710bea607ce = function (arg0) {
  const ret = getObject(arg0).startPosition;
  return addHeapObject(ret);
};

module.exports.__wbg_endPosition_39a1b9d694d5d73d = function (arg0) {
  const ret = getObject(arg0).endPosition;
  return addHeapObject(ret);
};

module.exports.__wbg_row_925b9b037d7bc7f2 = function (arg0) {
  const ret = getObject(arg0).row;
  return ret;
};

module.exports.__wbg_column_410af50067243600 = function (arg0) {
  const ret = getObject(arg0).column;
  return ret;
};

module.exports.__wbindgen_cb_drop = function (arg0) {
  const obj = takeObject(arg0).original;
  if (obj.cnt-- == 1) {
    obj.a = 0;
    return true;
  }
  const ret = false;
  return ret;
};

module.exports.__wbg_walk_fee2d2a42c3cc248 = function (arg0) {
  const ret = getObject(arg0).walk();
  return addHeapObject(ret);
};

module.exports.__wbindgen_json_parse = function (arg0, arg1) {
  const ret = JSON.parse(getStringFromWasm0(arg0, arg1));
  return addHeapObject(ret);
};

module.exports.__wbg_new_5d066ab487aac211 = function () {
  const ret = new Parser();
  return addHeapObject(ret);
};

module.exports.__wbg_setLanguage_2687ea9ed49a5ae7 = function (arg0, arg1) {
  getObject(arg0).setLanguage(takeObject(arg1));
};

module.exports.__wbg_parse_d5cfe2a268944011 = function (arg0, arg1, arg2) {
  const ret = getObject(arg0).parse(getStringFromWasm0(arg1, arg2));
  return addHeapObject(ret);
};

module.exports.__wbg_init_2f2728dd632fa735 = function () {
  const ret = Parser.init();
  return addHeapObject(ret);
};

module.exports.__wbg_load_13999fd8fb39ce74 = function (arg0, arg1) {
  const ret = Parser.Language.load(getArrayU8FromWasm0(arg0, arg1));
  return addHeapObject(ret);
};

module.exports.__wbg_call_168da88779e35f61 = function () {
  return handleError(function (arg0, arg1, arg2) {
    const ret = getObject(arg0).call(getObject(arg1), getObject(arg2));
    return addHeapObject(ret);
  }, arguments);
};

module.exports.__wbg_new_9962f939219f1820 = function (arg0, arg1) {
  try {
    var state0 = { a: arg0, b: arg1 };
    var cb0 = (arg0, arg1) => {
      const a = state0.a;
      state0.a = 0;
      try {
        return __wbg_adapter_80(a, state0.b, arg0, arg1);
      } finally {
        state0.a = a;
      }
    };
    const ret = new Promise(cb0);
    return addHeapObject(ret);
  } finally {
    state0.a = state0.b = 0;
  }
};

module.exports.__wbg_resolve_99fe17964f31ffc0 = function (arg0) {
  const ret = Promise.resolve(getObject(arg0));
  return addHeapObject(ret);
};

module.exports.__wbg_then_11f7a54d67b4bfad = function (arg0, arg1) {
  const ret = getObject(arg0).then(getObject(arg1));
  return addHeapObject(ret);
};

module.exports.__wbg_then_cedad20fbbd9418a = function (arg0, arg1, arg2) {
  const ret = getObject(arg0).then(getObject(arg1), getObject(arg2));
  return addHeapObject(ret);
};

module.exports.__wbindgen_debug_string = function (arg0, arg1) {
  const ret = debugString(getObject(arg1));
  const ptr0 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
  const len0 = WASM_VECTOR_LEN;
  getInt32Memory0()[arg0 / 4 + 1] = len0;
  getInt32Memory0()[arg0 / 4 + 0] = ptr0;
};

module.exports.__wbindgen_throw = function (arg0, arg1) {
  throw new Error(getStringFromWasm0(arg0, arg1));
};

module.exports.__wbindgen_closure_wrapper418 = function (arg0, arg1, arg2) {
  const ret = makeMutClosure(arg0, arg1, 64, __wbg_adapter_12);
  return addHeapObject(ret);
};

const path = require('path').join(__dirname, 'amzn_mynah_fully_qualified_names_bg.wasm');
const bytes = require('fs').readFileSync(path);

const wasmModule = new WebAssembly.Module(bytes);
const wasmInstance = new WebAssembly.Instance(wasmModule, imports);
wasm = wasmInstance.exports;
module.exports.__wasm = wasm;

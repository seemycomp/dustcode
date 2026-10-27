"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key4 of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key4) && key4 !== except)
        __defProp(to, key4, { get: () => from[key4], enumerable: !(desc = __getOwnPropDesc(from, key4)) || desc.enumerable });
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

// ../../node_modules/.bun/ws@8.21.0/node_modules/ws/lib/constants.js
var require_constants = __commonJS({
  "../../node_modules/.bun/ws@8.21.0/node_modules/ws/lib/constants.js"(exports2, module2) {
    "use strict";
    var BINARY_TYPES = ["nodebuffer", "arraybuffer", "fragments"];
    var hasBlob = typeof Blob !== "undefined";
    if (hasBlob) BINARY_TYPES.push("blob");
    module2.exports = {
      BINARY_TYPES,
      CLOSE_TIMEOUT: 3e4,
      EMPTY_BUFFER: Buffer.alloc(0),
      GUID: "258EAFA5-E914-47DA-95CA-C5AB0DC85B11",
      hasBlob,
      kForOnEventAttribute: /* @__PURE__ */ Symbol("kIsForOnEventAttribute"),
      kListener: /* @__PURE__ */ Symbol("kListener"),
      kStatusCode: /* @__PURE__ */ Symbol("status-code"),
      kWebSocket: /* @__PURE__ */ Symbol("websocket"),
      NOOP: () => {
      }
    };
  }
});

// ../../node_modules/.bun/ws@8.21.0/node_modules/ws/lib/buffer-util.js
var require_buffer_util = __commonJS({
  "../../node_modules/.bun/ws@8.21.0/node_modules/ws/lib/buffer-util.js"(exports2, module2) {
    "use strict";
    var { EMPTY_BUFFER } = require_constants();
    var FastBuffer = Buffer[Symbol.species];
    function concat(list, totalLength) {
      if (list.length === 0) return EMPTY_BUFFER;
      if (list.length === 1) return list[0];
      const target = Buffer.allocUnsafe(totalLength);
      let offset = 0;
      for (let i = 0; i < list.length; i++) {
        const buf = list[i];
        target.set(buf, offset);
        offset += buf.length;
      }
      if (offset < totalLength) {
        return new FastBuffer(target.buffer, target.byteOffset, offset);
      }
      return target;
    }
    function _mask(source, mask, output, offset, length) {
      for (let i = 0; i < length; i++) {
        output[offset + i] = source[i] ^ mask[i & 3];
      }
    }
    function _unmask(buffer, mask) {
      for (let i = 0; i < buffer.length; i++) {
        buffer[i] ^= mask[i & 3];
      }
    }
    function toArrayBuffer(buf) {
      if (buf.length === buf.buffer.byteLength) {
        return buf.buffer;
      }
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length);
    }
    function toBuffer(data) {
      toBuffer.readOnly = true;
      if (Buffer.isBuffer(data)) return data;
      let buf;
      if (data instanceof ArrayBuffer) {
        buf = new FastBuffer(data);
      } else if (ArrayBuffer.isView(data)) {
        buf = new FastBuffer(data.buffer, data.byteOffset, data.byteLength);
      } else {
        buf = Buffer.from(data);
        toBuffer.readOnly = false;
      }
      return buf;
    }
    module2.exports = {
      concat,
      mask: _mask,
      toArrayBuffer,
      toBuffer,
      unmask: _unmask
    };
    if (!process.env.WS_NO_BUFFER_UTIL) {
      try {
        const bufferUtil = require("bufferutil");
        module2.exports.mask = function(source, mask, output, offset, length) {
          if (length < 48) _mask(source, mask, output, offset, length);
          else bufferUtil.mask(source, mask, output, offset, length);
        };
        module2.exports.unmask = function(buffer, mask) {
          if (buffer.length < 32) _unmask(buffer, mask);
          else bufferUtil.unmask(buffer, mask);
        };
      } catch (e) {
      }
    }
  }
});

// ../../node_modules/.bun/ws@8.21.0/node_modules/ws/lib/limiter.js
var require_limiter = __commonJS({
  "../../node_modules/.bun/ws@8.21.0/node_modules/ws/lib/limiter.js"(exports2, module2) {
    "use strict";
    var kDone = /* @__PURE__ */ Symbol("kDone");
    var kRun = /* @__PURE__ */ Symbol("kRun");
    var Limiter = class {
      /**
       * Creates a new `Limiter`.
       *
       * @param {Number} [concurrency=Infinity] The maximum number of jobs allowed
       *     to run concurrently
       */
      constructor(concurrency) {
        this[kDone] = () => {
          this.pending--;
          this[kRun]();
        };
        this.concurrency = concurrency || Infinity;
        this.jobs = [];
        this.pending = 0;
      }
      /**
       * Adds a job to the queue.
       *
       * @param {Function} job The job to run
       * @public
       */
      add(job) {
        this.jobs.push(job);
        this[kRun]();
      }
      /**
       * Removes a job from the queue and runs it if possible.
       *
       * @private
       */
      [kRun]() {
        if (this.pending === this.concurrency) return;
        if (this.jobs.length) {
          const job = this.jobs.shift();
          this.pending++;
          job(this[kDone]);
        }
      }
    };
    module2.exports = Limiter;
  }
});

// ../../node_modules/.bun/ws@8.21.0/node_modules/ws/lib/permessage-deflate.js
var require_permessage_deflate = __commonJS({
  "../../node_modules/.bun/ws@8.21.0/node_modules/ws/lib/permessage-deflate.js"(exports2, module2) {
    "use strict";
    var zlib = require("zlib");
    var bufferUtil = require_buffer_util();
    var Limiter = require_limiter();
    var { kStatusCode } = require_constants();
    var FastBuffer = Buffer[Symbol.species];
    var TRAILER = Buffer.from([0, 0, 255, 255]);
    var kPerMessageDeflate = /* @__PURE__ */ Symbol("permessage-deflate");
    var kTotalLength = /* @__PURE__ */ Symbol("total-length");
    var kCallback = /* @__PURE__ */ Symbol("callback");
    var kBuffers = /* @__PURE__ */ Symbol("buffers");
    var kError = /* @__PURE__ */ Symbol("error");
    var zlibLimiter;
    var PerMessageDeflate2 = class {
      /**
       * Creates a PerMessageDeflate instance.
       *
       * @param {Object} [options] Configuration options
       * @param {(Boolean|Number)} [options.clientMaxWindowBits] Advertise support
       *     for, or request, a custom client window size
       * @param {Boolean} [options.clientNoContextTakeover=false] Advertise/
       *     acknowledge disabling of client context takeover
       * @param {Number} [options.concurrencyLimit=10] The number of concurrent
       *     calls to zlib
       * @param {Boolean} [options.isServer=false] Create the instance in either
       *     server or client mode
       * @param {Number} [options.maxPayload=0] The maximum allowed message length
       * @param {(Boolean|Number)} [options.serverMaxWindowBits] Request/confirm the
       *     use of a custom server window size
       * @param {Boolean} [options.serverNoContextTakeover=false] Request/accept
       *     disabling of server context takeover
       * @param {Number} [options.threshold=1024] Size (in bytes) below which
       *     messages should not be compressed if context takeover is disabled
       * @param {Object} [options.zlibDeflateOptions] Options to pass to zlib on
       *     deflate
       * @param {Object} [options.zlibInflateOptions] Options to pass to zlib on
       *     inflate
       */
      constructor(options2) {
        this._options = options2 || {};
        this._threshold = this._options.threshold !== void 0 ? this._options.threshold : 1024;
        this._maxPayload = this._options.maxPayload | 0;
        this._isServer = !!this._options.isServer;
        this._deflate = null;
        this._inflate = null;
        this.params = null;
        if (!zlibLimiter) {
          const concurrency = this._options.concurrencyLimit !== void 0 ? this._options.concurrencyLimit : 10;
          zlibLimiter = new Limiter(concurrency);
        }
      }
      /**
       * @type {String}
       */
      static get extensionName() {
        return "permessage-deflate";
      }
      /**
       * Create an extension negotiation offer.
       *
       * @return {Object} Extension parameters
       * @public
       */
      offer() {
        const params = {};
        if (this._options.serverNoContextTakeover) {
          params.server_no_context_takeover = true;
        }
        if (this._options.clientNoContextTakeover) {
          params.client_no_context_takeover = true;
        }
        if (this._options.serverMaxWindowBits) {
          params.server_max_window_bits = this._options.serverMaxWindowBits;
        }
        if (this._options.clientMaxWindowBits) {
          params.client_max_window_bits = this._options.clientMaxWindowBits;
        } else if (this._options.clientMaxWindowBits == null) {
          params.client_max_window_bits = true;
        }
        return params;
      }
      /**
       * Accept an extension negotiation offer/response.
       *
       * @param {Array} configurations The extension negotiation offers/reponse
       * @return {Object} Accepted configuration
       * @public
       */
      accept(configurations) {
        configurations = this.normalizeParams(configurations);
        this.params = this._isServer ? this.acceptAsServer(configurations) : this.acceptAsClient(configurations);
        return this.params;
      }
      /**
       * Releases all resources used by the extension.
       *
       * @public
       */
      cleanup() {
        if (this._inflate) {
          this._inflate.close();
          this._inflate = null;
        }
        if (this._deflate) {
          const callback = this._deflate[kCallback];
          this._deflate.close();
          this._deflate = null;
          if (callback) {
            callback(
              new Error(
                "The deflate stream was closed while data was being processed"
              )
            );
          }
        }
      }
      /**
       *  Accept an extension negotiation offer.
       *
       * @param {Array} offers The extension negotiation offers
       * @return {Object} Accepted configuration
       * @private
       */
      acceptAsServer(offers) {
        const opts = this._options;
        const accepted = offers.find((params) => {
          if (opts.serverNoContextTakeover === false && params.server_no_context_takeover || params.server_max_window_bits && (opts.serverMaxWindowBits === false || typeof opts.serverMaxWindowBits === "number" && opts.serverMaxWindowBits > params.server_max_window_bits) || typeof opts.clientMaxWindowBits === "number" && !params.client_max_window_bits) {
            return false;
          }
          return true;
        });
        if (!accepted) {
          throw new Error("None of the extension offers can be accepted");
        }
        if (opts.serverNoContextTakeover) {
          accepted.server_no_context_takeover = true;
        }
        if (opts.clientNoContextTakeover) {
          accepted.client_no_context_takeover = true;
        }
        if (typeof opts.serverMaxWindowBits === "number") {
          accepted.server_max_window_bits = opts.serverMaxWindowBits;
        }
        if (typeof opts.clientMaxWindowBits === "number") {
          accepted.client_max_window_bits = opts.clientMaxWindowBits;
        } else if (accepted.client_max_window_bits === true || opts.clientMaxWindowBits === false) {
          delete accepted.client_max_window_bits;
        }
        return accepted;
      }
      /**
       * Accept the extension negotiation response.
       *
       * @param {Array} response The extension negotiation response
       * @return {Object} Accepted configuration
       * @private
       */
      acceptAsClient(response) {
        const params = response[0];
        if (this._options.clientNoContextTakeover === false && params.client_no_context_takeover) {
          throw new Error('Unexpected parameter "client_no_context_takeover"');
        }
        if (!params.client_max_window_bits) {
          if (typeof this._options.clientMaxWindowBits === "number") {
            params.client_max_window_bits = this._options.clientMaxWindowBits;
          }
        } else if (this._options.clientMaxWindowBits === false || typeof this._options.clientMaxWindowBits === "number" && params.client_max_window_bits > this._options.clientMaxWindowBits) {
          throw new Error(
            'Unexpected or invalid parameter "client_max_window_bits"'
          );
        }
        return params;
      }
      /**
       * Normalize parameters.
       *
       * @param {Array} configurations The extension negotiation offers/reponse
       * @return {Array} The offers/response with normalized parameters
       * @private
       */
      normalizeParams(configurations) {
        configurations.forEach((params) => {
          Object.keys(params).forEach((key4) => {
            let value = params[key4];
            if (value.length > 1) {
              throw new Error(`Parameter "${key4}" must have only a single value`);
            }
            value = value[0];
            if (key4 === "client_max_window_bits") {
              if (value !== true) {
                const num = +value;
                if (!Number.isInteger(num) || num < 8 || num > 15) {
                  throw new TypeError(
                    `Invalid value for parameter "${key4}": ${value}`
                  );
                }
                value = num;
              } else if (!this._isServer) {
                throw new TypeError(
                  `Invalid value for parameter "${key4}": ${value}`
                );
              }
            } else if (key4 === "server_max_window_bits") {
              const num = +value;
              if (!Number.isInteger(num) || num < 8 || num > 15) {
                throw new TypeError(
                  `Invalid value for parameter "${key4}": ${value}`
                );
              }
              value = num;
            } else if (key4 === "client_no_context_takeover" || key4 === "server_no_context_takeover") {
              if (value !== true) {
                throw new TypeError(
                  `Invalid value for parameter "${key4}": ${value}`
                );
              }
            } else {
              throw new Error(`Unknown parameter "${key4}"`);
            }
            params[key4] = value;
          });
        });
        return configurations;
      }
      /**
       * Decompress data. Concurrency limited.
       *
       * @param {Buffer} data Compressed data
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @public
       */
      decompress(data, fin, callback) {
        zlibLimiter.add((done) => {
          this._decompress(data, fin, (err, result) => {
            done();
            callback(err, result);
          });
        });
      }
      /**
       * Compress data. Concurrency limited.
       *
       * @param {(Buffer|String)} data Data to compress
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @public
       */
      compress(data, fin, callback) {
        zlibLimiter.add((done) => {
          this._compress(data, fin, (err, result) => {
            done();
            callback(err, result);
          });
        });
      }
      /**
       * Decompress data.
       *
       * @param {Buffer} data Compressed data
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @private
       */
      _decompress(data, fin, callback) {
        const endpoint = this._isServer ? "client" : "server";
        if (!this._inflate) {
          const key4 = `${endpoint}_max_window_bits`;
          const windowBits = typeof this.params[key4] !== "number" ? zlib.Z_DEFAULT_WINDOWBITS : this.params[key4];
          this._inflate = zlib.createInflateRaw({
            ...this._options.zlibInflateOptions,
            windowBits
          });
          this._inflate[kPerMessageDeflate] = this;
          this._inflate[kTotalLength] = 0;
          this._inflate[kBuffers] = [];
          this._inflate.on("error", inflateOnError);
          this._inflate.on("data", inflateOnData);
        }
        this._inflate[kCallback] = callback;
        this._inflate.write(data);
        if (fin) this._inflate.write(TRAILER);
        this._inflate.flush(() => {
          const err = this._inflate[kError];
          if (err) {
            this._inflate.close();
            this._inflate = null;
            callback(err);
            return;
          }
          const data2 = bufferUtil.concat(
            this._inflate[kBuffers],
            this._inflate[kTotalLength]
          );
          if (this._inflate._readableState.endEmitted) {
            this._inflate.close();
            this._inflate = null;
          } else {
            this._inflate[kTotalLength] = 0;
            this._inflate[kBuffers] = [];
            if (fin && this.params[`${endpoint}_no_context_takeover`]) {
              this._inflate.reset();
            }
          }
          callback(null, data2);
        });
      }
      /**
       * Compress data.
       *
       * @param {(Buffer|String)} data Data to compress
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @private
       */
      _compress(data, fin, callback) {
        const endpoint = this._isServer ? "server" : "client";
        if (!this._deflate) {
          const key4 = `${endpoint}_max_window_bits`;
          const windowBits = typeof this.params[key4] !== "number" ? zlib.Z_DEFAULT_WINDOWBITS : this.params[key4];
          this._deflate = zlib.createDeflateRaw({
            ...this._options.zlibDeflateOptions,
            windowBits
          });
          this._deflate[kTotalLength] = 0;
          this._deflate[kBuffers] = [];
          this._deflate.on("data", deflateOnData);
        }
        this._deflate[kCallback] = callback;
        this._deflate.write(data);
        this._deflate.flush(zlib.Z_SYNC_FLUSH, () => {
          if (!this._deflate) {
            return;
          }
          let data2 = bufferUtil.concat(
            this._deflate[kBuffers],
            this._deflate[kTotalLength]
          );
          if (fin) {
            data2 = new FastBuffer(data2.buffer, data2.byteOffset, data2.length - 4);
          }
          this._deflate[kCallback] = null;
          this._deflate[kTotalLength] = 0;
          this._deflate[kBuffers] = [];
          if (fin && this.params[`${endpoint}_no_context_takeover`]) {
            this._deflate.reset();
          }
          callback(null, data2);
        });
      }
    };
    module2.exports = PerMessageDeflate2;
    function deflateOnData(chunk) {
      this[kBuffers].push(chunk);
      this[kTotalLength] += chunk.length;
    }
    function inflateOnData(chunk) {
      this[kTotalLength] += chunk.length;
      if (this[kPerMessageDeflate]._maxPayload < 1 || this[kTotalLength] <= this[kPerMessageDeflate]._maxPayload) {
        this[kBuffers].push(chunk);
        return;
      }
      this[kError] = new RangeError("Max payload size exceeded");
      this[kError].code = "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH";
      this[kError][kStatusCode] = 1009;
      this.removeListener("data", inflateOnData);
      this.reset();
    }
    function inflateOnError(err) {
      this[kPerMessageDeflate]._inflate = null;
      if (this[kError]) {
        this[kCallback](this[kError]);
        return;
      }
      err[kStatusCode] = 1007;
      this[kCallback](err);
    }
  }
});

// ../../node_modules/.bun/ws@8.21.0/node_modules/ws/lib/validation.js
var require_validation = __commonJS({
  "../../node_modules/.bun/ws@8.21.0/node_modules/ws/lib/validation.js"(exports2, module2) {
    "use strict";
    var { isUtf8 } = require("buffer");
    var { hasBlob } = require_constants();
    var tokenChars = [
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      // 0 - 15
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      // 16 - 31
      0,
      1,
      0,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      1,
      1,
      0,
      1,
      1,
      0,
      // 32 - 47
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      0,
      0,
      0,
      // 48 - 63
      0,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      // 64 - 79
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      1,
      1,
      // 80 - 95
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      // 96 - 111
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      1,
      0,
      1,
      0
      // 112 - 127
    ];
    function isValidStatusCode(code) {
      return code >= 1e3 && code <= 1014 && code !== 1004 && code !== 1005 && code !== 1006 || code >= 3e3 && code <= 4999;
    }
    function _isValidUTF8(buf) {
      const len = buf.length;
      let i = 0;
      while (i < len) {
        if ((buf[i] & 128) === 0) {
          i++;
        } else if ((buf[i] & 224) === 192) {
          if (i + 1 === len || (buf[i + 1] & 192) !== 128 || (buf[i] & 254) === 192) {
            return false;
          }
          i += 2;
        } else if ((buf[i] & 240) === 224) {
          if (i + 2 >= len || (buf[i + 1] & 192) !== 128 || (buf[i + 2] & 192) !== 128 || buf[i] === 224 && (buf[i + 1] & 224) === 128 || // Overlong
          buf[i] === 237 && (buf[i + 1] & 224) === 160) {
            return false;
          }
          i += 3;
        } else if ((buf[i] & 248) === 240) {
          if (i + 3 >= len || (buf[i + 1] & 192) !== 128 || (buf[i + 2] & 192) !== 128 || (buf[i + 3] & 192) !== 128 || buf[i] === 240 && (buf[i + 1] & 240) === 128 || // Overlong
          buf[i] === 244 && buf[i + 1] > 143 || buf[i] > 244) {
            return false;
          }
          i += 4;
        } else {
          return false;
        }
      }
      return true;
    }
    function isBlob(value) {
      return hasBlob && typeof value === "object" && typeof value.arrayBuffer === "function" && typeof value.type === "string" && typeof value.stream === "function" && (value[Symbol.toStringTag] === "Blob" || value[Symbol.toStringTag] === "File");
    }
    module2.exports = {
      isBlob,
      isValidStatusCode,
      isValidUTF8: _isValidUTF8,
      tokenChars
    };
    if (isUtf8) {
      module2.exports.isValidUTF8 = function(buf) {
        return buf.length < 24 ? _isValidUTF8(buf) : isUtf8(buf);
      };
    } else if (!process.env.WS_NO_UTF_8_VALIDATE) {
      try {
        const isValidUTF8 = require("utf-8-validate");
        module2.exports.isValidUTF8 = function(buf) {
          return buf.length < 32 ? _isValidUTF8(buf) : isValidUTF8(buf);
        };
      } catch (e) {
      }
    }
  }
});

// ../../node_modules/.bun/ws@8.21.0/node_modules/ws/lib/receiver.js
var require_receiver = __commonJS({
  "../../node_modules/.bun/ws@8.21.0/node_modules/ws/lib/receiver.js"(exports2, module2) {
    "use strict";
    var { Writable } = require("stream");
    var PerMessageDeflate2 = require_permessage_deflate();
    var {
      BINARY_TYPES,
      EMPTY_BUFFER,
      kStatusCode,
      kWebSocket
    } = require_constants();
    var { concat, toArrayBuffer, unmask } = require_buffer_util();
    var { isValidStatusCode, isValidUTF8 } = require_validation();
    var FastBuffer = Buffer[Symbol.species];
    var GET_INFO = 0;
    var GET_PAYLOAD_LENGTH_16 = 1;
    var GET_PAYLOAD_LENGTH_64 = 2;
    var GET_MASK = 3;
    var GET_DATA = 4;
    var INFLATING = 5;
    var DEFER_EVENT = 6;
    var Receiver2 = class extends Writable {
      /**
       * Creates a Receiver instance.
       *
       * @param {Object} [options] Options object
       * @param {Boolean} [options.allowSynchronousEvents=true] Specifies whether
       *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
       *     multiple times in the same tick
       * @param {String} [options.binaryType=nodebuffer] The type for binary data
       * @param {Object} [options.extensions] An object containing the negotiated
       *     extensions
       * @param {Boolean} [options.isServer=false] Specifies whether to operate in
       *     client or server mode
       * @param {Number} [options.maxBufferedChunks=0] The maximum number of
       *     buffered data chunks
       * @param {Number} [options.maxFragments=0] The maximum number of message
       *     fragments
       * @param {Number} [options.maxPayload=0] The maximum allowed message length
       * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
       *     not to skip UTF-8 validation for text and close messages
       */
      constructor(options2 = {}) {
        super();
        this._allowSynchronousEvents = options2.allowSynchronousEvents !== void 0 ? options2.allowSynchronousEvents : true;
        this._binaryType = options2.binaryType || BINARY_TYPES[0];
        this._extensions = options2.extensions || {};
        this._isServer = !!options2.isServer;
        this._maxBufferedChunks = options2.maxBufferedChunks | 0;
        this._maxFragments = options2.maxFragments | 0;
        this._maxPayload = options2.maxPayload | 0;
        this._skipUTF8Validation = !!options2.skipUTF8Validation;
        this[kWebSocket] = void 0;
        this._bufferedBytes = 0;
        this._buffers = [];
        this._compressed = false;
        this._payloadLength = 0;
        this._mask = void 0;
        this._fragmented = 0;
        this._masked = false;
        this._fin = false;
        this._opcode = 0;
        this._totalPayloadLength = 0;
        this._messageLength = 0;
        this._fragments = [];
        this._errored = false;
        this._loop = false;
        this._state = GET_INFO;
      }
      /**
       * Implements `Writable.prototype._write()`.
       *
       * @param {Buffer} chunk The chunk of data to write
       * @param {String} encoding The character encoding of `chunk`
       * @param {Function} cb Callback
       * @private
       */
      _write(chunk, encoding, cb) {
        if (this._opcode === 8 && this._state == GET_INFO) return cb();
        if (this._maxBufferedChunks > 0 && this._buffers.length >= this._maxBufferedChunks) {
          cb(
            this.createError(
              RangeError,
              "Too many buffered chunks",
              false,
              1008,
              "WS_ERR_TOO_MANY_BUFFERED_PARTS"
            )
          );
          return;
        }
        this._bufferedBytes += chunk.length;
        this._buffers.push(chunk);
        this.startLoop(cb);
      }
      /**
       * Consumes `n` bytes from the buffered data.
       *
       * @param {Number} n The number of bytes to consume
       * @return {Buffer} The consumed bytes
       * @private
       */
      consume(n) {
        this._bufferedBytes -= n;
        if (n === this._buffers[0].length) return this._buffers.shift();
        if (n < this._buffers[0].length) {
          const buf = this._buffers[0];
          this._buffers[0] = new FastBuffer(
            buf.buffer,
            buf.byteOffset + n,
            buf.length - n
          );
          return new FastBuffer(buf.buffer, buf.byteOffset, n);
        }
        const dst = Buffer.allocUnsafe(n);
        do {
          const buf = this._buffers[0];
          const offset = dst.length - n;
          if (n >= buf.length) {
            dst.set(this._buffers.shift(), offset);
          } else {
            dst.set(new Uint8Array(buf.buffer, buf.byteOffset, n), offset);
            this._buffers[0] = new FastBuffer(
              buf.buffer,
              buf.byteOffset + n,
              buf.length - n
            );
          }
          n -= buf.length;
        } while (n > 0);
        return dst;
      }
      /**
       * Starts the parsing loop.
       *
       * @param {Function} cb Callback
       * @private
       */
      startLoop(cb) {
        this._loop = true;
        do {
          switch (this._state) {
            case GET_INFO:
              this.getInfo(cb);
              break;
            case GET_PAYLOAD_LENGTH_16:
              this.getPayloadLength16(cb);
              break;
            case GET_PAYLOAD_LENGTH_64:
              this.getPayloadLength64(cb);
              break;
            case GET_MASK:
              this.getMask();
              break;
            case GET_DATA:
              this.getData(cb);
              break;
            case INFLATING:
            case DEFER_EVENT:
              this._loop = false;
              return;
          }
        } while (this._loop);
        if (!this._errored) cb();
      }
      /**
       * Reads the first two bytes of a frame.
       *
       * @param {Function} cb Callback
       * @private
       */
      getInfo(cb) {
        if (this._bufferedBytes < 2) {
          this._loop = false;
          return;
        }
        const buf = this.consume(2);
        if ((buf[0] & 48) !== 0) {
          const error = this.createError(
            RangeError,
            "RSV2 and RSV3 must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_RSV_2_3"
          );
          cb(error);
          return;
        }
        const compressed = (buf[0] & 64) === 64;
        if (compressed && !this._extensions[PerMessageDeflate2.extensionName]) {
          const error = this.createError(
            RangeError,
            "RSV1 must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_RSV_1"
          );
          cb(error);
          return;
        }
        this._fin = (buf[0] & 128) === 128;
        this._opcode = buf[0] & 15;
        this._payloadLength = buf[1] & 127;
        if (this._opcode === 0) {
          if (compressed) {
            const error = this.createError(
              RangeError,
              "RSV1 must be clear",
              true,
              1002,
              "WS_ERR_UNEXPECTED_RSV_1"
            );
            cb(error);
            return;
          }
          if (!this._fragmented) {
            const error = this.createError(
              RangeError,
              "invalid opcode 0",
              true,
              1002,
              "WS_ERR_INVALID_OPCODE"
            );
            cb(error);
            return;
          }
          this._opcode = this._fragmented;
        } else if (this._opcode === 1 || this._opcode === 2) {
          if (this._fragmented) {
            const error = this.createError(
              RangeError,
              `invalid opcode ${this._opcode}`,
              true,
              1002,
              "WS_ERR_INVALID_OPCODE"
            );
            cb(error);
            return;
          }
          this._compressed = compressed;
        } else if (this._opcode > 7 && this._opcode < 11) {
          if (!this._fin) {
            const error = this.createError(
              RangeError,
              "FIN must be set",
              true,
              1002,
              "WS_ERR_EXPECTED_FIN"
            );
            cb(error);
            return;
          }
          if (compressed) {
            const error = this.createError(
              RangeError,
              "RSV1 must be clear",
              true,
              1002,
              "WS_ERR_UNEXPECTED_RSV_1"
            );
            cb(error);
            return;
          }
          if (this._payloadLength > 125 || this._opcode === 8 && this._payloadLength === 1) {
            const error = this.createError(
              RangeError,
              `invalid payload length ${this._payloadLength}`,
              true,
              1002,
              "WS_ERR_INVALID_CONTROL_PAYLOAD_LENGTH"
            );
            cb(error);
            return;
          }
        } else {
          const error = this.createError(
            RangeError,
            `invalid opcode ${this._opcode}`,
            true,
            1002,
            "WS_ERR_INVALID_OPCODE"
          );
          cb(error);
          return;
        }
        if (!this._fin && !this._fragmented) this._fragmented = this._opcode;
        this._masked = (buf[1] & 128) === 128;
        if (this._isServer) {
          if (!this._masked) {
            const error = this.createError(
              RangeError,
              "MASK must be set",
              true,
              1002,
              "WS_ERR_EXPECTED_MASK"
            );
            cb(error);
            return;
          }
        } else if (this._masked) {
          const error = this.createError(
            RangeError,
            "MASK must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_MASK"
          );
          cb(error);
          return;
        }
        if (this._payloadLength === 126) this._state = GET_PAYLOAD_LENGTH_16;
        else if (this._payloadLength === 127) this._state = GET_PAYLOAD_LENGTH_64;
        else this.haveLength(cb);
      }
      /**
       * Gets extended payload length (7+16).
       *
       * @param {Function} cb Callback
       * @private
       */
      getPayloadLength16(cb) {
        if (this._bufferedBytes < 2) {
          this._loop = false;
          return;
        }
        this._payloadLength = this.consume(2).readUInt16BE(0);
        this.haveLength(cb);
      }
      /**
       * Gets extended payload length (7+64).
       *
       * @param {Function} cb Callback
       * @private
       */
      getPayloadLength64(cb) {
        if (this._bufferedBytes < 8) {
          this._loop = false;
          return;
        }
        const buf = this.consume(8);
        const num = buf.readUInt32BE(0);
        if (num > Math.pow(2, 53 - 32) - 1) {
          const error = this.createError(
            RangeError,
            "Unsupported WebSocket frame: payload length > 2^53 - 1",
            false,
            1009,
            "WS_ERR_UNSUPPORTED_DATA_PAYLOAD_LENGTH"
          );
          cb(error);
          return;
        }
        this._payloadLength = num * Math.pow(2, 32) + buf.readUInt32BE(4);
        this.haveLength(cb);
      }
      /**
       * Payload length has been read.
       *
       * @param {Function} cb Callback
       * @private
       */
      haveLength(cb) {
        if (this._payloadLength && this._opcode < 8) {
          this._totalPayloadLength += this._payloadLength;
          if (this._totalPayloadLength > this._maxPayload && this._maxPayload > 0) {
            const error = this.createError(
              RangeError,
              "Max payload size exceeded",
              false,
              1009,
              "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH"
            );
            cb(error);
            return;
          }
        }
        if (this._masked) this._state = GET_MASK;
        else this._state = GET_DATA;
      }
      /**
       * Reads mask bytes.
       *
       * @private
       */
      getMask() {
        if (this._bufferedBytes < 4) {
          this._loop = false;
          return;
        }
        this._mask = this.consume(4);
        this._state = GET_DATA;
      }
      /**
       * Reads data bytes.
       *
       * @param {Function} cb Callback
       * @private
       */
      getData(cb) {
        let data = EMPTY_BUFFER;
        if (this._payloadLength) {
          if (this._bufferedBytes < this._payloadLength) {
            this._loop = false;
            return;
          }
          data = this.consume(this._payloadLength);
          if (this._masked && (this._mask[0] | this._mask[1] | this._mask[2] | this._mask[3]) !== 0) {
            unmask(data, this._mask);
          }
        }
        if (this._opcode > 7) {
          this.controlMessage(data, cb);
          return;
        }
        if (this._compressed) {
          this._state = INFLATING;
          this.decompress(data, cb);
          return;
        }
        if (data.length) {
          if (this._maxFragments > 0 && this._fragments.length >= this._maxFragments) {
            const error = this.createError(
              RangeError,
              "Too many message fragments",
              false,
              1008,
              "WS_ERR_TOO_MANY_BUFFERED_PARTS"
            );
            cb(error);
            return;
          }
          this._messageLength = this._totalPayloadLength;
          this._fragments.push(data);
        }
        this.dataMessage(cb);
      }
      /**
       * Decompresses data.
       *
       * @param {Buffer} data Compressed data
       * @param {Function} cb Callback
       * @private
       */
      decompress(data, cb) {
        const perMessageDeflate = this._extensions[PerMessageDeflate2.extensionName];
        perMessageDeflate.decompress(data, this._fin, (err, buf) => {
          if (err) return cb(err);
          if (buf.length) {
            this._messageLength += buf.length;
            if (this._messageLength > this._maxPayload && this._maxPayload > 0) {
              const error = this.createError(
                RangeError,
                "Max payload size exceeded",
                false,
                1009,
                "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH"
              );
              cb(error);
              return;
            }
            if (this._maxFragments > 0 && this._fragments.length >= this._maxFragments) {
              const error = this.createError(
                RangeError,
                "Too many message fragments",
                false,
                1008,
                "WS_ERR_TOO_MANY_BUFFERED_PARTS"
              );
              cb(error);
              return;
            }
            this._fragments.push(buf);
          }
          this.dataMessage(cb);
          if (this._state === GET_INFO) this.startLoop(cb);
        });
      }
      /**
       * Handles a data message.
       *
       * @param {Function} cb Callback
       * @private
       */
      dataMessage(cb) {
        if (!this._fin) {
          this._state = GET_INFO;
          return;
        }
        const messageLength = this._messageLength;
        const fragments = this._fragments;
        this._totalPayloadLength = 0;
        this._messageLength = 0;
        this._fragmented = 0;
        this._fragments = [];
        if (this._opcode === 2) {
          let data;
          if (this._binaryType === "nodebuffer") {
            data = concat(fragments, messageLength);
          } else if (this._binaryType === "arraybuffer") {
            data = toArrayBuffer(concat(fragments, messageLength));
          } else if (this._binaryType === "blob") {
            data = new Blob(fragments);
          } else {
            data = fragments;
          }
          if (this._allowSynchronousEvents) {
            this.emit("message", data, true);
            this._state = GET_INFO;
          } else {
            this._state = DEFER_EVENT;
            setImmediate(() => {
              this.emit("message", data, true);
              this._state = GET_INFO;
              this.startLoop(cb);
            });
          }
        } else {
          const buf = concat(fragments, messageLength);
          if (!this._skipUTF8Validation && !isValidUTF8(buf)) {
            const error = this.createError(
              Error,
              "invalid UTF-8 sequence",
              true,
              1007,
              "WS_ERR_INVALID_UTF8"
            );
            cb(error);
            return;
          }
          if (this._state === INFLATING || this._allowSynchronousEvents) {
            this.emit("message", buf, false);
            this._state = GET_INFO;
          } else {
            this._state = DEFER_EVENT;
            setImmediate(() => {
              this.emit("message", buf, false);
              this._state = GET_INFO;
              this.startLoop(cb);
            });
          }
        }
      }
      /**
       * Handles a control message.
       *
       * @param {Buffer} data Data to handle
       * @return {(Error|RangeError|undefined)} A possible error
       * @private
       */
      controlMessage(data, cb) {
        if (this._opcode === 8) {
          if (data.length === 0) {
            this._loop = false;
            this.emit("conclude", 1005, EMPTY_BUFFER);
            this.end();
          } else {
            const code = data.readUInt16BE(0);
            if (!isValidStatusCode(code)) {
              const error = this.createError(
                RangeError,
                `invalid status code ${code}`,
                true,
                1002,
                "WS_ERR_INVALID_CLOSE_CODE"
              );
              cb(error);
              return;
            }
            const buf = new FastBuffer(
              data.buffer,
              data.byteOffset + 2,
              data.length - 2
            );
            if (!this._skipUTF8Validation && !isValidUTF8(buf)) {
              const error = this.createError(
                Error,
                "invalid UTF-8 sequence",
                true,
                1007,
                "WS_ERR_INVALID_UTF8"
              );
              cb(error);
              return;
            }
            this._loop = false;
            this.emit("conclude", code, buf);
            this.end();
          }
          this._state = GET_INFO;
          return;
        }
        if (this._allowSynchronousEvents) {
          this.emit(this._opcode === 9 ? "ping" : "pong", data);
          this._state = GET_INFO;
        } else {
          this._state = DEFER_EVENT;
          setImmediate(() => {
            this.emit(this._opcode === 9 ? "ping" : "pong", data);
            this._state = GET_INFO;
            this.startLoop(cb);
          });
        }
      }
      /**
       * Builds an error object.
       *
       * @param {function(new:Error|RangeError)} ErrorCtor The error constructor
       * @param {String} message The error message
       * @param {Boolean} prefix Specifies whether or not to add a default prefix to
       *     `message`
       * @param {Number} statusCode The status code
       * @param {String} errorCode The exposed error code
       * @return {(Error|RangeError)} The error
       * @private
       */
      createError(ErrorCtor, message, prefix, statusCode, errorCode) {
        this._loop = false;
        this._errored = true;
        const err = new ErrorCtor(
          prefix ? `Invalid WebSocket frame: ${message}` : message
        );
        Error.captureStackTrace(err, this.createError);
        err.code = errorCode;
        err[kStatusCode] = statusCode;
        return err;
      }
    };
    module2.exports = Receiver2;
  }
});

// ../../node_modules/.bun/ws@8.21.0/node_modules/ws/lib/sender.js
var require_sender = __commonJS({
  "../../node_modules/.bun/ws@8.21.0/node_modules/ws/lib/sender.js"(exports2, module2) {
    "use strict";
    var { Duplex } = require("stream");
    var { randomFillSync } = require("crypto");
    var {
      types: { isUint8Array }
    } = require("util");
    var PerMessageDeflate2 = require_permessage_deflate();
    var { EMPTY_BUFFER, kWebSocket, NOOP } = require_constants();
    var { isBlob, isValidStatusCode } = require_validation();
    var { mask: applyMask, toBuffer } = require_buffer_util();
    var kByteLength = /* @__PURE__ */ Symbol("kByteLength");
    var maskBuffer = Buffer.alloc(4);
    var RANDOM_POOL_SIZE = 8 * 1024;
    var randomPool;
    var randomPoolPointer = RANDOM_POOL_SIZE;
    var DEFAULT = 0;
    var DEFLATING = 1;
    var GET_BLOB_DATA = 2;
    var Sender2 = class _Sender {
      /**
       * Creates a Sender instance.
       *
       * @param {Duplex} socket The connection socket
       * @param {Object} [extensions] An object containing the negotiated extensions
       * @param {Function} [generateMask] The function used to generate the masking
       *     key
       */
      constructor(socket, extensions, generateMask) {
        this._extensions = extensions || {};
        if (generateMask) {
          this._generateMask = generateMask;
          this._maskBuffer = Buffer.alloc(4);
        }
        this._socket = socket;
        this._firstFragment = true;
        this._compress = false;
        this._bufferedBytes = 0;
        this._queue = [];
        this._state = DEFAULT;
        this.onerror = NOOP;
        this[kWebSocket] = void 0;
      }
      /**
       * Frames a piece of data according to the HyBi WebSocket protocol.
       *
       * @param {(Buffer|String)} data The data to frame
       * @param {Object} options Options object
       * @param {Boolean} [options.fin=false] Specifies whether or not to set the
       *     FIN bit
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
       *     key
       * @param {Number} options.opcode The opcode
       * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
       *     modified
       * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
       *     RSV1 bit
       * @return {(Buffer|String)[]} The framed data
       * @public
       */
      static frame(data, options2) {
        let mask;
        let merge = false;
        let offset = 2;
        let skipMasking = false;
        if (options2.mask) {
          mask = options2.maskBuffer || maskBuffer;
          if (options2.generateMask) {
            options2.generateMask(mask);
          } else {
            if (randomPoolPointer === RANDOM_POOL_SIZE) {
              if (randomPool === void 0) {
                randomPool = Buffer.alloc(RANDOM_POOL_SIZE);
              }
              randomFillSync(randomPool, 0, RANDOM_POOL_SIZE);
              randomPoolPointer = 0;
            }
            mask[0] = randomPool[randomPoolPointer++];
            mask[1] = randomPool[randomPoolPointer++];
            mask[2] = randomPool[randomPoolPointer++];
            mask[3] = randomPool[randomPoolPointer++];
          }
          skipMasking = (mask[0] | mask[1] | mask[2] | mask[3]) === 0;
          offset = 6;
        }
        let dataLength;
        if (typeof data === "string") {
          if ((!options2.mask || skipMasking) && options2[kByteLength] !== void 0) {
            dataLength = options2[kByteLength];
          } else {
            data = Buffer.from(data);
            dataLength = data.length;
          }
        } else {
          dataLength = data.length;
          merge = options2.mask && options2.readOnly && !skipMasking;
        }
        let payloadLength = dataLength;
        if (dataLength >= 65536) {
          offset += 8;
          payloadLength = 127;
        } else if (dataLength > 125) {
          offset += 2;
          payloadLength = 126;
        }
        const target = Buffer.allocUnsafe(merge ? dataLength + offset : offset);
        target[0] = options2.fin ? options2.opcode | 128 : options2.opcode;
        if (options2.rsv1) target[0] |= 64;
        target[1] = payloadLength;
        if (payloadLength === 126) {
          target.writeUInt16BE(dataLength, 2);
        } else if (payloadLength === 127) {
          target[2] = target[3] = 0;
          target.writeUIntBE(dataLength, 4, 6);
        }
        if (!options2.mask) return [target, data];
        target[1] |= 128;
        target[offset - 4] = mask[0];
        target[offset - 3] = mask[1];
        target[offset - 2] = mask[2];
        target[offset - 1] = mask[3];
        if (skipMasking) return [target, data];
        if (merge) {
          applyMask(data, mask, target, offset, dataLength);
          return [target];
        }
        applyMask(data, mask, data, 0, dataLength);
        return [target, data];
      }
      /**
       * Sends a close message to the other peer.
       *
       * @param {Number} [code] The status code component of the body
       * @param {(String|Buffer)} [data] The message component of the body
       * @param {Boolean} [mask=false] Specifies whether or not to mask the message
       * @param {Function} [cb] Callback
       * @public
       */
      close(code, data, mask, cb) {
        let buf;
        if (code === void 0) {
          buf = EMPTY_BUFFER;
        } else if (typeof code !== "number" || !isValidStatusCode(code)) {
          throw new TypeError("First argument must be a valid error code number");
        } else if (data === void 0 || !data.length) {
          buf = Buffer.allocUnsafe(2);
          buf.writeUInt16BE(code, 0);
        } else {
          const length = Buffer.byteLength(data);
          if (length > 123) {
            throw new RangeError("The message must not be greater than 123 bytes");
          }
          buf = Buffer.allocUnsafe(2 + length);
          buf.writeUInt16BE(code, 0);
          if (typeof data === "string") {
            buf.write(data, 2);
          } else if (isUint8Array(data)) {
            buf.set(data, 2);
          } else {
            throw new TypeError("Second argument must be a string or a Uint8Array");
          }
        }
        const options2 = {
          [kByteLength]: buf.length,
          fin: true,
          generateMask: this._generateMask,
          mask,
          maskBuffer: this._maskBuffer,
          opcode: 8,
          readOnly: false,
          rsv1: false
        };
        if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, buf, false, options2, cb]);
        } else {
          this.sendFrame(_Sender.frame(buf, options2), cb);
        }
      }
      /**
       * Sends a ping message to the other peer.
       *
       * @param {*} data The message to send
       * @param {Boolean} [mask=false] Specifies whether or not to mask `data`
       * @param {Function} [cb] Callback
       * @public
       */
      ping(data, mask, cb) {
        let byteLength;
        let readOnly;
        if (typeof data === "string") {
          byteLength = Buffer.byteLength(data);
          readOnly = false;
        } else if (isBlob(data)) {
          byteLength = data.size;
          readOnly = false;
        } else {
          data = toBuffer(data);
          byteLength = data.length;
          readOnly = toBuffer.readOnly;
        }
        if (byteLength > 125) {
          throw new RangeError("The data size must not be greater than 125 bytes");
        }
        const options2 = {
          [kByteLength]: byteLength,
          fin: true,
          generateMask: this._generateMask,
          mask,
          maskBuffer: this._maskBuffer,
          opcode: 9,
          readOnly,
          rsv1: false
        };
        if (isBlob(data)) {
          if (this._state !== DEFAULT) {
            this.enqueue([this.getBlobData, data, false, options2, cb]);
          } else {
            this.getBlobData(data, false, options2, cb);
          }
        } else if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, data, false, options2, cb]);
        } else {
          this.sendFrame(_Sender.frame(data, options2), cb);
        }
      }
      /**
       * Sends a pong message to the other peer.
       *
       * @param {*} data The message to send
       * @param {Boolean} [mask=false] Specifies whether or not to mask `data`
       * @param {Function} [cb] Callback
       * @public
       */
      pong(data, mask, cb) {
        let byteLength;
        let readOnly;
        if (typeof data === "string") {
          byteLength = Buffer.byteLength(data);
          readOnly = false;
        } else if (isBlob(data)) {
          byteLength = data.size;
          readOnly = false;
        } else {
          data = toBuffer(data);
          byteLength = data.length;
          readOnly = toBuffer.readOnly;
        }
        if (byteLength > 125) {
          throw new RangeError("The data size must not be greater than 125 bytes");
        }
        const options2 = {
          [kByteLength]: byteLength,
          fin: true,
          generateMask: this._generateMask,
          mask,
          maskBuffer: this._maskBuffer,
          opcode: 10,
          readOnly,
          rsv1: false
        };
        if (isBlob(data)) {
          if (this._state !== DEFAULT) {
            this.enqueue([this.getBlobData, data, false, options2, cb]);
          } else {
            this.getBlobData(data, false, options2, cb);
          }
        } else if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, data, false, options2, cb]);
        } else {
          this.sendFrame(_Sender.frame(data, options2), cb);
        }
      }
      /**
       * Sends a data message to the other peer.
       *
       * @param {*} data The message to send
       * @param {Object} options Options object
       * @param {Boolean} [options.binary=false] Specifies whether `data` is binary
       *     or text
       * @param {Boolean} [options.compress=false] Specifies whether or not to
       *     compress `data`
       * @param {Boolean} [options.fin=false] Specifies whether the fragment is the
       *     last one
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Function} [cb] Callback
       * @public
       */
      send(data, options2, cb) {
        const perMessageDeflate = this._extensions[PerMessageDeflate2.extensionName];
        let opcode = options2.binary ? 2 : 1;
        let rsv1 = options2.compress;
        let byteLength;
        let readOnly;
        if (typeof data === "string") {
          byteLength = Buffer.byteLength(data);
          readOnly = false;
        } else if (isBlob(data)) {
          byteLength = data.size;
          readOnly = false;
        } else {
          data = toBuffer(data);
          byteLength = data.length;
          readOnly = toBuffer.readOnly;
        }
        if (this._firstFragment) {
          this._firstFragment = false;
          if (rsv1 && perMessageDeflate && perMessageDeflate.params[perMessageDeflate._isServer ? "server_no_context_takeover" : "client_no_context_takeover"]) {
            rsv1 = byteLength >= perMessageDeflate._threshold;
          }
          this._compress = rsv1;
        } else {
          rsv1 = false;
          opcode = 0;
        }
        if (options2.fin) this._firstFragment = true;
        const opts = {
          [kByteLength]: byteLength,
          fin: options2.fin,
          generateMask: this._generateMask,
          mask: options2.mask,
          maskBuffer: this._maskBuffer,
          opcode,
          readOnly,
          rsv1
        };
        if (isBlob(data)) {
          if (this._state !== DEFAULT) {
            this.enqueue([this.getBlobData, data, this._compress, opts, cb]);
          } else {
            this.getBlobData(data, this._compress, opts, cb);
          }
        } else if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, data, this._compress, opts, cb]);
        } else {
          this.dispatch(data, this._compress, opts, cb);
        }
      }
      /**
       * Gets the contents of a blob as binary data.
       *
       * @param {Blob} blob The blob
       * @param {Boolean} [compress=false] Specifies whether or not to compress
       *     the data
       * @param {Object} options Options object
       * @param {Boolean} [options.fin=false] Specifies whether or not to set the
       *     FIN bit
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
       *     key
       * @param {Number} options.opcode The opcode
       * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
       *     modified
       * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
       *     RSV1 bit
       * @param {Function} [cb] Callback
       * @private
       */
      getBlobData(blob, compress, options2, cb) {
        this._bufferedBytes += options2[kByteLength];
        this._state = GET_BLOB_DATA;
        blob.arrayBuffer().then((arrayBuffer) => {
          if (this._socket.destroyed) {
            const err = new Error(
              "The socket was closed while the blob was being read"
            );
            process.nextTick(callCallbacks, this, err, cb);
            return;
          }
          this._bufferedBytes -= options2[kByteLength];
          const data = toBuffer(arrayBuffer);
          if (!compress) {
            this._state = DEFAULT;
            this.sendFrame(_Sender.frame(data, options2), cb);
            this.dequeue();
          } else {
            this.dispatch(data, compress, options2, cb);
          }
        }).catch((err) => {
          process.nextTick(onError, this, err, cb);
        });
      }
      /**
       * Dispatches a message.
       *
       * @param {(Buffer|String)} data The message to send
       * @param {Boolean} [compress=false] Specifies whether or not to compress
       *     `data`
       * @param {Object} options Options object
       * @param {Boolean} [options.fin=false] Specifies whether or not to set the
       *     FIN bit
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
       *     key
       * @param {Number} options.opcode The opcode
       * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
       *     modified
       * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
       *     RSV1 bit
       * @param {Function} [cb] Callback
       * @private
       */
      dispatch(data, compress, options2, cb) {
        if (!compress) {
          this.sendFrame(_Sender.frame(data, options2), cb);
          return;
        }
        const perMessageDeflate = this._extensions[PerMessageDeflate2.extensionName];
        this._bufferedBytes += options2[kByteLength];
        this._state = DEFLATING;
        perMessageDeflate.compress(data, options2.fin, (_, buf) => {
          if (this._socket.destroyed) {
            const err = new Error(
              "The socket was closed while data was being compressed"
            );
            callCallbacks(this, err, cb);
            return;
          }
          this._bufferedBytes -= options2[kByteLength];
          this._state = DEFAULT;
          options2.readOnly = false;
          this.sendFrame(_Sender.frame(buf, options2), cb);
          this.dequeue();
        });
      }
      /**
       * Executes queued send operations.
       *
       * @private
       */
      dequeue() {
        while (this._state === DEFAULT && this._queue.length) {
          const params = this._queue.shift();
          this._bufferedBytes -= params[3][kByteLength];
          Reflect.apply(params[0], this, params.slice(1));
        }
      }
      /**
       * Enqueues a send operation.
       *
       * @param {Array} params Send operation parameters.
       * @private
       */
      enqueue(params) {
        this._bufferedBytes += params[3][kByteLength];
        this._queue.push(params);
      }
      /**
       * Sends a frame.
       *
       * @param {(Buffer | String)[]} list The frame to send
       * @param {Function} [cb] Callback
       * @private
       */
      sendFrame(list, cb) {
        if (list.length === 2) {
          this._socket.cork();
          this._socket.write(list[0]);
          this._socket.write(list[1], cb);
          this._socket.uncork();
        } else {
          this._socket.write(list[0], cb);
        }
      }
    };
    module2.exports = Sender2;
    function callCallbacks(sender, err, cb) {
      if (typeof cb === "function") cb(err);
      for (let i = 0; i < sender._queue.length; i++) {
        const params = sender._queue[i];
        const callback = params[params.length - 1];
        if (typeof callback === "function") callback(err);
      }
    }
    function onError(sender, err, cb) {
      callCallbacks(sender, err, cb);
      sender.onerror(err);
    }
  }
});

// ../../node_modules/.bun/ws@8.21.0/node_modules/ws/lib/event-target.js
var require_event_target = __commonJS({
  "../../node_modules/.bun/ws@8.21.0/node_modules/ws/lib/event-target.js"(exports2, module2) {
    "use strict";
    var { kForOnEventAttribute, kListener } = require_constants();
    var kCode = /* @__PURE__ */ Symbol("kCode");
    var kData = /* @__PURE__ */ Symbol("kData");
    var kError = /* @__PURE__ */ Symbol("kError");
    var kMessage = /* @__PURE__ */ Symbol("kMessage");
    var kReason = /* @__PURE__ */ Symbol("kReason");
    var kTarget = /* @__PURE__ */ Symbol("kTarget");
    var kType = /* @__PURE__ */ Symbol("kType");
    var kWasClean = /* @__PURE__ */ Symbol("kWasClean");
    var Event = class {
      /**
       * Create a new `Event`.
       *
       * @param {String} type The name of the event
       * @throws {TypeError} If the `type` argument is not specified
       */
      constructor(type) {
        this[kTarget] = null;
        this[kType] = type;
      }
      /**
       * @type {*}
       */
      get target() {
        return this[kTarget];
      }
      /**
       * @type {String}
       */
      get type() {
        return this[kType];
      }
    };
    Object.defineProperty(Event.prototype, "target", { enumerable: true });
    Object.defineProperty(Event.prototype, "type", { enumerable: true });
    var CloseEvent = class extends Event {
      /**
       * Create a new `CloseEvent`.
       *
       * @param {String} type The name of the event
       * @param {Object} [options] A dictionary object that allows for setting
       *     attributes via object members of the same name
       * @param {Number} [options.code=0] The status code explaining why the
       *     connection was closed
       * @param {String} [options.reason=''] A human-readable string explaining why
       *     the connection was closed
       * @param {Boolean} [options.wasClean=false] Indicates whether or not the
       *     connection was cleanly closed
       */
      constructor(type, options2 = {}) {
        super(type);
        this[kCode] = options2.code === void 0 ? 0 : options2.code;
        this[kReason] = options2.reason === void 0 ? "" : options2.reason;
        this[kWasClean] = options2.wasClean === void 0 ? false : options2.wasClean;
      }
      /**
       * @type {Number}
       */
      get code() {
        return this[kCode];
      }
      /**
       * @type {String}
       */
      get reason() {
        return this[kReason];
      }
      /**
       * @type {Boolean}
       */
      get wasClean() {
        return this[kWasClean];
      }
    };
    Object.defineProperty(CloseEvent.prototype, "code", { enumerable: true });
    Object.defineProperty(CloseEvent.prototype, "reason", { enumerable: true });
    Object.defineProperty(CloseEvent.prototype, "wasClean", { enumerable: true });
    var ErrorEvent = class extends Event {
      /**
       * Create a new `ErrorEvent`.
       *
       * @param {String} type The name of the event
       * @param {Object} [options] A dictionary object that allows for setting
       *     attributes via object members of the same name
       * @param {*} [options.error=null] The error that generated this event
       * @param {String} [options.message=''] The error message
       */
      constructor(type, options2 = {}) {
        super(type);
        this[kError] = options2.error === void 0 ? null : options2.error;
        this[kMessage] = options2.message === void 0 ? "" : options2.message;
      }
      /**
       * @type {*}
       */
      get error() {
        return this[kError];
      }
      /**
       * @type {String}
       */
      get message() {
        return this[kMessage];
      }
    };
    Object.defineProperty(ErrorEvent.prototype, "error", { enumerable: true });
    Object.defineProperty(ErrorEvent.prototype, "message", { enumerable: true });
    var MessageEvent = class extends Event {
      /**
       * Create a new `MessageEvent`.
       *
       * @param {String} type The name of the event
       * @param {Object} [options] A dictionary object that allows for setting
       *     attributes via object members of the same name
       * @param {*} [options.data=null] The message content
       */
      constructor(type, options2 = {}) {
        super(type);
        this[kData] = options2.data === void 0 ? null : options2.data;
      }
      /**
       * @type {*}
       */
      get data() {
        return this[kData];
      }
    };
    Object.defineProperty(MessageEvent.prototype, "data", { enumerable: true });
    var EventTarget = {
      /**
       * Register an event listener.
       *
       * @param {String} type A string representing the event type to listen for
       * @param {(Function|Object)} handler The listener to add
       * @param {Object} [options] An options object specifies characteristics about
       *     the event listener
       * @param {Boolean} [options.once=false] A `Boolean` indicating that the
       *     listener should be invoked at most once after being added. If `true`,
       *     the listener would be automatically removed when invoked.
       * @public
       */
      addEventListener(type, handler, options2 = {}) {
        for (const listener of this.listeners(type)) {
          if (!options2[kForOnEventAttribute] && listener[kListener] === handler && !listener[kForOnEventAttribute]) {
            return;
          }
        }
        let wrapper;
        if (type === "message") {
          wrapper = function onMessage(data, isBinary) {
            const event = new MessageEvent("message", {
              data: isBinary ? data : data.toString()
            });
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else if (type === "close") {
          wrapper = function onClose(code, message) {
            const event = new CloseEvent("close", {
              code,
              reason: message.toString(),
              wasClean: this._closeFrameReceived && this._closeFrameSent
            });
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else if (type === "error") {
          wrapper = function onError(error) {
            const event = new ErrorEvent("error", {
              error,
              message: error.message
            });
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else if (type === "open") {
          wrapper = function onOpen() {
            const event = new Event("open");
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else {
          return;
        }
        wrapper[kForOnEventAttribute] = !!options2[kForOnEventAttribute];
        wrapper[kListener] = handler;
        if (options2.once) {
          this.once(type, wrapper);
        } else {
          this.on(type, wrapper);
        }
      },
      /**
       * Remove an event listener.
       *
       * @param {String} type A string representing the event type to remove
       * @param {(Function|Object)} handler The listener to remove
       * @public
       */
      removeEventListener(type, handler) {
        for (const listener of this.listeners(type)) {
          if (listener[kListener] === handler && !listener[kForOnEventAttribute]) {
            this.removeListener(type, listener);
            break;
          }
        }
      }
    };
    module2.exports = {
      CloseEvent,
      ErrorEvent,
      Event,
      EventTarget,
      MessageEvent
    };
    function callListener(listener, thisArg, event) {
      if (typeof listener === "object" && listener.handleEvent) {
        listener.handleEvent.call(listener, event);
      } else {
        listener.call(thisArg, event);
      }
    }
  }
});

// ../../node_modules/.bun/ws@8.21.0/node_modules/ws/lib/extension.js
var require_extension = __commonJS({
  "../../node_modules/.bun/ws@8.21.0/node_modules/ws/lib/extension.js"(exports2, module2) {
    "use strict";
    var { tokenChars } = require_validation();
    function push(dest, name, elem) {
      if (dest[name] === void 0) dest[name] = [elem];
      else dest[name].push(elem);
    }
    function parse2(header) {
      const offers = /* @__PURE__ */ Object.create(null);
      let params = /* @__PURE__ */ Object.create(null);
      let mustUnescape = false;
      let isEscaping = false;
      let inQuotes = false;
      let extensionName;
      let paramName;
      let start = -1;
      let code = -1;
      let end = -1;
      let i = 0;
      for (; i < header.length; i++) {
        code = header.charCodeAt(i);
        if (extensionName === void 0) {
          if (end === -1 && tokenChars[code] === 1) {
            if (start === -1) start = i;
          } else if (i !== 0 && (code === 32 || code === 9)) {
            if (end === -1 && start !== -1) end = i;
          } else if (code === 59 || code === 44) {
            if (start === -1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (end === -1) end = i;
            const name = header.slice(start, end);
            if (code === 44) {
              push(offers, name, params);
              params = /* @__PURE__ */ Object.create(null);
            } else {
              extensionName = name;
            }
            start = end = -1;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
        } else if (paramName === void 0) {
          if (end === -1 && tokenChars[code] === 1) {
            if (start === -1) start = i;
          } else if (code === 32 || code === 9) {
            if (end === -1 && start !== -1) end = i;
          } else if (code === 59 || code === 44) {
            if (start === -1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (end === -1) end = i;
            push(params, header.slice(start, end), true);
            if (code === 44) {
              push(offers, extensionName, params);
              params = /* @__PURE__ */ Object.create(null);
              extensionName = void 0;
            }
            start = end = -1;
          } else if (code === 61 && start !== -1 && end === -1) {
            paramName = header.slice(start, i);
            start = end = -1;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
        } else {
          if (isEscaping) {
            if (tokenChars[code] !== 1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (start === -1) start = i;
            else if (!mustUnescape) mustUnescape = true;
            isEscaping = false;
          } else if (inQuotes) {
            if (tokenChars[code] === 1) {
              if (start === -1) start = i;
            } else if (code === 34 && start !== -1) {
              inQuotes = false;
              end = i;
            } else if (code === 92) {
              isEscaping = true;
            } else {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
          } else if (code === 34 && header.charCodeAt(i - 1) === 61) {
            inQuotes = true;
          } else if (end === -1 && tokenChars[code] === 1) {
            if (start === -1) start = i;
          } else if (start !== -1 && (code === 32 || code === 9)) {
            if (end === -1) end = i;
          } else if (code === 59 || code === 44) {
            if (start === -1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (end === -1) end = i;
            let value = header.slice(start, end);
            if (mustUnescape) {
              value = value.replace(/\\/g, "");
              mustUnescape = false;
            }
            push(params, paramName, value);
            if (code === 44) {
              push(offers, extensionName, params);
              params = /* @__PURE__ */ Object.create(null);
              extensionName = void 0;
            }
            paramName = void 0;
            start = end = -1;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
        }
      }
      if (start === -1 || inQuotes || code === 32 || code === 9) {
        throw new SyntaxError("Unexpected end of input");
      }
      if (end === -1) end = i;
      const token = header.slice(start, end);
      if (extensionName === void 0) {
        push(offers, token, params);
      } else {
        if (paramName === void 0) {
          push(params, token, true);
        } else if (mustUnescape) {
          push(params, paramName, token.replace(/\\/g, ""));
        } else {
          push(params, paramName, token);
        }
        push(offers, extensionName, params);
      }
      return offers;
    }
    function format(extensions) {
      return Object.keys(extensions).map((extension2) => {
        let configurations = extensions[extension2];
        if (!Array.isArray(configurations)) configurations = [configurations];
        return configurations.map((params) => {
          return [extension2].concat(
            Object.keys(params).map((k) => {
              let values = params[k];
              if (!Array.isArray(values)) values = [values];
              return values.map((v) => v === true ? k : `${k}=${v}`).join("; ");
            })
          ).join("; ");
        }).join(", ");
      }).join(", ");
    }
    module2.exports = { format, parse: parse2 };
  }
});

// ../../node_modules/.bun/ws@8.21.0/node_modules/ws/lib/websocket.js
var require_websocket = __commonJS({
  "../../node_modules/.bun/ws@8.21.0/node_modules/ws/lib/websocket.js"(exports2, module2) {
    "use strict";
    var EventEmitter = require("events");
    var https2 = require("https");
    var http = require("http");
    var net = require("net");
    var tls = require("tls");
    var { randomBytes: randomBytes4, createHash: createHash3 } = require("crypto");
    var { Duplex, Readable } = require("stream");
    var { URL: URL4 } = require("url");
    var PerMessageDeflate2 = require_permessage_deflate();
    var Receiver2 = require_receiver();
    var Sender2 = require_sender();
    var { isBlob } = require_validation();
    var {
      BINARY_TYPES,
      CLOSE_TIMEOUT,
      EMPTY_BUFFER,
      GUID,
      kForOnEventAttribute,
      kListener,
      kStatusCode,
      kWebSocket,
      NOOP
    } = require_constants();
    var {
      EventTarget: { addEventListener: addEventListener2, removeEventListener: removeEventListener2 }
    } = require_event_target();
    var { format, parse: parse2 } = require_extension();
    var { toBuffer } = require_buffer_util();
    var kAborted = /* @__PURE__ */ Symbol("kAborted");
    var protocolVersions = [8, 13];
    var readyStates = ["CONNECTING", "OPEN", "CLOSING", "CLOSED"];
    var subprotocolRegex = /^[!#$%&'*+\-.0-9A-Z^_`|a-z~]+$/;
    var WebSocket3 = class _WebSocket extends EventEmitter {
      /**
       * Create a new `WebSocket`.
       *
       * @param {(String|URL)} address The URL to which to connect
       * @param {(String|String[])} [protocols] The subprotocols
       * @param {Object} [options] Connection options
       */
      constructor(address, protocols, options2) {
        super();
        this._binaryType = BINARY_TYPES[0];
        this._closeCode = 1006;
        this._closeFrameReceived = false;
        this._closeFrameSent = false;
        this._closeMessage = EMPTY_BUFFER;
        this._closeTimer = null;
        this._errorEmitted = false;
        this._extensions = {};
        this._paused = false;
        this._protocol = "";
        this._readyState = _WebSocket.CONNECTING;
        this._receiver = null;
        this._sender = null;
        this._socket = null;
        if (address !== null) {
          this._bufferedAmount = 0;
          this._isServer = false;
          this._redirects = 0;
          if (protocols === void 0) {
            protocols = [];
          } else if (!Array.isArray(protocols)) {
            if (typeof protocols === "object" && protocols !== null) {
              options2 = protocols;
              protocols = [];
            } else {
              protocols = [protocols];
            }
          }
          initAsClient(this, address, protocols, options2);
        } else {
          this._autoPong = options2.autoPong;
          this._closeTimeout = options2.closeTimeout;
          this._isServer = true;
        }
      }
      /**
       * For historical reasons, the custom "nodebuffer" type is used by the default
       * instead of "blob".
       *
       * @type {String}
       */
      get binaryType() {
        return this._binaryType;
      }
      set binaryType(type) {
        if (!BINARY_TYPES.includes(type)) return;
        this._binaryType = type;
        if (this._receiver) this._receiver._binaryType = type;
      }
      /**
       * @type {Number}
       */
      get bufferedAmount() {
        if (!this._socket) return this._bufferedAmount;
        return this._socket._writableState.length + this._sender._bufferedBytes;
      }
      /**
       * @type {String}
       */
      get extensions() {
        return Object.keys(this._extensions).join();
      }
      /**
       * @type {Boolean}
       */
      get isPaused() {
        return this._paused;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onclose() {
        return null;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onerror() {
        return null;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onopen() {
        return null;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onmessage() {
        return null;
      }
      /**
       * @type {String}
       */
      get protocol() {
        return this._protocol;
      }
      /**
       * @type {Number}
       */
      get readyState() {
        return this._readyState;
      }
      /**
       * @type {String}
       */
      get url() {
        return this._url;
      }
      /**
       * Set up the socket and the internal resources.
       *
       * @param {Duplex} socket The network socket between the server and client
       * @param {Buffer} head The first packet of the upgraded stream
       * @param {Object} options Options object
       * @param {Boolean} [options.allowSynchronousEvents=false] Specifies whether
       *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
       *     multiple times in the same tick
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Number} [options.maxBufferedChunks=0] The maximum number of
       *     buffered data chunks
       * @param {Number} [options.maxFragments=0] The maximum number of message
       *     fragments
       * @param {Number} [options.maxPayload=0] The maximum allowed message size
       * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
       *     not to skip UTF-8 validation for text and close messages
       * @private
       */
      setSocket(socket, head, options2) {
        const receiver = new Receiver2({
          allowSynchronousEvents: options2.allowSynchronousEvents,
          binaryType: this.binaryType,
          extensions: this._extensions,
          isServer: this._isServer,
          maxBufferedChunks: options2.maxBufferedChunks,
          maxFragments: options2.maxFragments,
          maxPayload: options2.maxPayload,
          skipUTF8Validation: options2.skipUTF8Validation
        });
        const sender = new Sender2(socket, this._extensions, options2.generateMask);
        this._receiver = receiver;
        this._sender = sender;
        this._socket = socket;
        receiver[kWebSocket] = this;
        sender[kWebSocket] = this;
        socket[kWebSocket] = this;
        receiver.on("conclude", receiverOnConclude);
        receiver.on("drain", receiverOnDrain);
        receiver.on("error", receiverOnError);
        receiver.on("message", receiverOnMessage);
        receiver.on("ping", receiverOnPing);
        receiver.on("pong", receiverOnPong);
        sender.onerror = senderOnError;
        if (socket.setTimeout) socket.setTimeout(0);
        if (socket.setNoDelay) socket.setNoDelay();
        if (head.length > 0) socket.unshift(head);
        socket.on("close", socketOnClose);
        socket.on("data", socketOnData);
        socket.on("end", socketOnEnd);
        socket.on("error", socketOnError);
        this._readyState = _WebSocket.OPEN;
        this.emit("open");
      }
      /**
       * Emit the `'close'` event.
       *
       * @private
       */
      emitClose() {
        if (!this._socket) {
          this._readyState = _WebSocket.CLOSED;
          this.emit("close", this._closeCode, this._closeMessage);
          return;
        }
        if (this._extensions[PerMessageDeflate2.extensionName]) {
          this._extensions[PerMessageDeflate2.extensionName].cleanup();
        }
        this._receiver.removeAllListeners();
        this._readyState = _WebSocket.CLOSED;
        this.emit("close", this._closeCode, this._closeMessage);
      }
      /**
       * Start a closing handshake.
       *
       *          +----------+   +-----------+   +----------+
       *     - - -|ws.close()|-->|close frame|-->|ws.close()|- - -
       *    |     +----------+   +-----------+   +----------+     |
       *          +----------+   +-----------+         |
       * CLOSING  |ws.close()|<--|close frame|<--+-----+       CLOSING
       *          +----------+   +-----------+   |
       *    |           |                        |   +---+        |
       *                +------------------------+-->|fin| - - - -
       *    |         +---+                      |   +---+
       *     - - - - -|fin|<---------------------+
       *              +---+
       *
       * @param {Number} [code] Status code explaining why the connection is closing
       * @param {(String|Buffer)} [data] The reason why the connection is
       *     closing
       * @public
       */
      close(code, data) {
        if (this.readyState === _WebSocket.CLOSED) return;
        if (this.readyState === _WebSocket.CONNECTING) {
          const msg = "WebSocket was closed before the connection was established";
          abortHandshake(this, this._req, msg);
          return;
        }
        if (this.readyState === _WebSocket.CLOSING) {
          if (this._closeFrameSent && (this._closeFrameReceived || this._receiver._writableState.errorEmitted)) {
            this._socket.end();
          }
          return;
        }
        this._readyState = _WebSocket.CLOSING;
        this._sender.close(code, data, !this._isServer, (err) => {
          if (err) return;
          this._closeFrameSent = true;
          if (this._closeFrameReceived || this._receiver._writableState.errorEmitted) {
            this._socket.end();
          }
        });
        setCloseTimer(this);
      }
      /**
       * Pause the socket.
       *
       * @public
       */
      pause() {
        if (this.readyState === _WebSocket.CONNECTING || this.readyState === _WebSocket.CLOSED) {
          return;
        }
        this._paused = true;
        this._socket.pause();
      }
      /**
       * Send a ping.
       *
       * @param {*} [data] The data to send
       * @param {Boolean} [mask] Indicates whether or not to mask `data`
       * @param {Function} [cb] Callback which is executed when the ping is sent
       * @public
       */
      ping(data, mask, cb) {
        if (this.readyState === _WebSocket.CONNECTING) {
          throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
        }
        if (typeof data === "function") {
          cb = data;
          data = mask = void 0;
        } else if (typeof mask === "function") {
          cb = mask;
          mask = void 0;
        }
        if (typeof data === "number") data = data.toString();
        if (this.readyState !== _WebSocket.OPEN) {
          sendAfterClose(this, data, cb);
          return;
        }
        if (mask === void 0) mask = !this._isServer;
        this._sender.ping(data || EMPTY_BUFFER, mask, cb);
      }
      /**
       * Send a pong.
       *
       * @param {*} [data] The data to send
       * @param {Boolean} [mask] Indicates whether or not to mask `data`
       * @param {Function} [cb] Callback which is executed when the pong is sent
       * @public
       */
      pong(data, mask, cb) {
        if (this.readyState === _WebSocket.CONNECTING) {
          throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
        }
        if (typeof data === "function") {
          cb = data;
          data = mask = void 0;
        } else if (typeof mask === "function") {
          cb = mask;
          mask = void 0;
        }
        if (typeof data === "number") data = data.toString();
        if (this.readyState !== _WebSocket.OPEN) {
          sendAfterClose(this, data, cb);
          return;
        }
        if (mask === void 0) mask = !this._isServer;
        this._sender.pong(data || EMPTY_BUFFER, mask, cb);
      }
      /**
       * Resume the socket.
       *
       * @public
       */
      resume() {
        if (this.readyState === _WebSocket.CONNECTING || this.readyState === _WebSocket.CLOSED) {
          return;
        }
        this._paused = false;
        if (!this._receiver._writableState.needDrain) this._socket.resume();
      }
      /**
       * Send a data message.
       *
       * @param {*} data The message to send
       * @param {Object} [options] Options object
       * @param {Boolean} [options.binary] Specifies whether `data` is binary or
       *     text
       * @param {Boolean} [options.compress] Specifies whether or not to compress
       *     `data`
       * @param {Boolean} [options.fin=true] Specifies whether the fragment is the
       *     last one
       * @param {Boolean} [options.mask] Specifies whether or not to mask `data`
       * @param {Function} [cb] Callback which is executed when data is written out
       * @public
       */
      send(data, options2, cb) {
        if (this.readyState === _WebSocket.CONNECTING) {
          throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
        }
        if (typeof options2 === "function") {
          cb = options2;
          options2 = {};
        }
        if (typeof data === "number") data = data.toString();
        if (this.readyState !== _WebSocket.OPEN) {
          sendAfterClose(this, data, cb);
          return;
        }
        const opts = {
          binary: typeof data !== "string",
          mask: !this._isServer,
          compress: true,
          fin: true,
          ...options2
        };
        if (!this._extensions[PerMessageDeflate2.extensionName]) {
          opts.compress = false;
        }
        this._sender.send(data || EMPTY_BUFFER, opts, cb);
      }
      /**
       * Forcibly close the connection.
       *
       * @public
       */
      terminate() {
        if (this.readyState === _WebSocket.CLOSED) return;
        if (this.readyState === _WebSocket.CONNECTING) {
          const msg = "WebSocket was closed before the connection was established";
          abortHandshake(this, this._req, msg);
          return;
        }
        if (this._socket) {
          this._readyState = _WebSocket.CLOSING;
          this._socket.destroy();
        }
      }
    };
    Object.defineProperty(WebSocket3, "CONNECTING", {
      enumerable: true,
      value: readyStates.indexOf("CONNECTING")
    });
    Object.defineProperty(WebSocket3.prototype, "CONNECTING", {
      enumerable: true,
      value: readyStates.indexOf("CONNECTING")
    });
    Object.defineProperty(WebSocket3, "OPEN", {
      enumerable: true,
      value: readyStates.indexOf("OPEN")
    });
    Object.defineProperty(WebSocket3.prototype, "OPEN", {
      enumerable: true,
      value: readyStates.indexOf("OPEN")
    });
    Object.defineProperty(WebSocket3, "CLOSING", {
      enumerable: true,
      value: readyStates.indexOf("CLOSING")
    });
    Object.defineProperty(WebSocket3.prototype, "CLOSING", {
      enumerable: true,
      value: readyStates.indexOf("CLOSING")
    });
    Object.defineProperty(WebSocket3, "CLOSED", {
      enumerable: true,
      value: readyStates.indexOf("CLOSED")
    });
    Object.defineProperty(WebSocket3.prototype, "CLOSED", {
      enumerable: true,
      value: readyStates.indexOf("CLOSED")
    });
    [
      "binaryType",
      "bufferedAmount",
      "extensions",
      "isPaused",
      "protocol",
      "readyState",
      "url"
    ].forEach((property) => {
      Object.defineProperty(WebSocket3.prototype, property, { enumerable: true });
    });
    ["open", "error", "close", "message"].forEach((method) => {
      Object.defineProperty(WebSocket3.prototype, `on${method}`, {
        enumerable: true,
        get() {
          for (const listener of this.listeners(method)) {
            if (listener[kForOnEventAttribute]) return listener[kListener];
          }
          return null;
        },
        set(handler) {
          for (const listener of this.listeners(method)) {
            if (listener[kForOnEventAttribute]) {
              this.removeListener(method, listener);
              break;
            }
          }
          if (typeof handler !== "function") return;
          this.addEventListener(method, handler, {
            [kForOnEventAttribute]: true
          });
        }
      });
    });
    WebSocket3.prototype.addEventListener = addEventListener2;
    WebSocket3.prototype.removeEventListener = removeEventListener2;
    module2.exports = WebSocket3;
    function initAsClient(websocket3, address, protocols, options2) {
      const opts = {
        allowSynchronousEvents: true,
        autoPong: true,
        closeTimeout: CLOSE_TIMEOUT,
        protocolVersion: protocolVersions[1],
        maxBufferedChunks: 1024 * 1024,
        maxFragments: 128 * 1024,
        maxPayload: 100 * 1024 * 1024,
        skipUTF8Validation: false,
        perMessageDeflate: true,
        followRedirects: false,
        maxRedirects: 10,
        ...options2,
        socketPath: void 0,
        hostname: void 0,
        protocol: void 0,
        timeout: void 0,
        method: "GET",
        host: void 0,
        path: void 0,
        port: void 0
      };
      websocket3._autoPong = opts.autoPong;
      websocket3._closeTimeout = opts.closeTimeout;
      if (!protocolVersions.includes(opts.protocolVersion)) {
        throw new RangeError(
          `Unsupported protocol version: ${opts.protocolVersion} (supported versions: ${protocolVersions.join(", ")})`
        );
      }
      let parsedUrl;
      if (address instanceof URL4) {
        parsedUrl = address;
      } else {
        try {
          parsedUrl = new URL4(address);
        } catch {
          throw new SyntaxError(`Invalid URL: ${address}`);
        }
      }
      if (parsedUrl.protocol === "http:") {
        parsedUrl.protocol = "ws:";
      } else if (parsedUrl.protocol === "https:") {
        parsedUrl.protocol = "wss:";
      }
      websocket3._url = parsedUrl.href;
      const isSecure = parsedUrl.protocol === "wss:";
      const isIpcUrl = parsedUrl.protocol === "ws+unix:";
      let invalidUrlMessage;
      if (parsedUrl.protocol !== "ws:" && !isSecure && !isIpcUrl) {
        invalidUrlMessage = `The URL's protocol must be one of "ws:", "wss:", "http:", "https:", or "ws+unix:"`;
      } else if (isIpcUrl && !parsedUrl.pathname) {
        invalidUrlMessage = "The URL's pathname is empty";
      } else if (parsedUrl.hash) {
        invalidUrlMessage = "The URL contains a fragment identifier";
      }
      if (invalidUrlMessage) {
        const err = new SyntaxError(invalidUrlMessage);
        if (websocket3._redirects === 0) {
          throw err;
        } else {
          emitErrorAndClose(websocket3, err);
          return;
        }
      }
      const defaultPort = isSecure ? 443 : 80;
      const key4 = randomBytes4(16).toString("base64");
      const request2 = isSecure ? https2.request : http.request;
      const protocolSet = /* @__PURE__ */ new Set();
      let perMessageDeflate;
      opts.createConnection = opts.createConnection || (isSecure ? tlsConnect : netConnect);
      opts.defaultPort = opts.defaultPort || defaultPort;
      opts.port = parsedUrl.port || defaultPort;
      opts.host = parsedUrl.hostname.startsWith("[") ? parsedUrl.hostname.slice(1, -1) : parsedUrl.hostname;
      opts.headers = {
        ...opts.headers,
        "Sec-WebSocket-Version": opts.protocolVersion,
        "Sec-WebSocket-Key": key4,
        Connection: "Upgrade",
        Upgrade: "websocket"
      };
      opts.path = parsedUrl.pathname + parsedUrl.search;
      opts.timeout = opts.handshakeTimeout;
      if (opts.perMessageDeflate) {
        perMessageDeflate = new PerMessageDeflate2({
          ...opts.perMessageDeflate,
          isServer: false,
          maxPayload: opts.maxPayload
        });
        opts.headers["Sec-WebSocket-Extensions"] = format({
          [PerMessageDeflate2.extensionName]: perMessageDeflate.offer()
        });
      }
      if (protocols.length) {
        for (const protocol of protocols) {
          if (typeof protocol !== "string" || !subprotocolRegex.test(protocol) || protocolSet.has(protocol)) {
            throw new SyntaxError(
              "An invalid or duplicated subprotocol was specified"
            );
          }
          protocolSet.add(protocol);
        }
        opts.headers["Sec-WebSocket-Protocol"] = protocols.join(",");
      }
      if (opts.origin) {
        if (opts.protocolVersion < 13) {
          opts.headers["Sec-WebSocket-Origin"] = opts.origin;
        } else {
          opts.headers.Origin = opts.origin;
        }
      }
      if (parsedUrl.username || parsedUrl.password) {
        opts.auth = `${parsedUrl.username}:${parsedUrl.password}`;
      }
      if (isIpcUrl) {
        const parts = opts.path.split(":");
        opts.socketPath = parts[0];
        opts.path = parts[1];
      }
      let req;
      if (opts.followRedirects) {
        if (websocket3._redirects === 0) {
          websocket3._originalIpc = isIpcUrl;
          websocket3._originalSecure = isSecure;
          websocket3._originalHostOrSocketPath = isIpcUrl ? opts.socketPath : parsedUrl.host;
          const headers2 = options2 && options2.headers;
          options2 = { ...options2, headers: {} };
          if (headers2) {
            for (const [key5, value] of Object.entries(headers2)) {
              options2.headers[key5.toLowerCase()] = value;
            }
          }
        } else if (websocket3.listenerCount("redirect") === 0) {
          const isSameHost = isIpcUrl ? websocket3._originalIpc ? opts.socketPath === websocket3._originalHostOrSocketPath : false : websocket3._originalIpc ? false : parsedUrl.host === websocket3._originalHostOrSocketPath;
          if (!isSameHost || websocket3._originalSecure && !isSecure) {
            delete opts.headers.authorization;
            delete opts.headers.cookie;
            if (!isSameHost) delete opts.headers.host;
            opts.auth = void 0;
          }
        }
        if (opts.auth && !options2.headers.authorization) {
          options2.headers.authorization = "Basic " + Buffer.from(opts.auth).toString("base64");
        }
        req = websocket3._req = request2(opts);
        if (websocket3._redirects) {
          websocket3.emit("redirect", websocket3.url, req);
        }
      } else {
        req = websocket3._req = request2(opts);
      }
      if (opts.timeout) {
        req.on("timeout", () => {
          abortHandshake(websocket3, req, "Opening handshake has timed out");
        });
      }
      req.on("error", (err) => {
        if (req === null || req[kAborted]) return;
        req = websocket3._req = null;
        emitErrorAndClose(websocket3, err);
      });
      req.on("response", (res) => {
        const location2 = res.headers.location;
        const statusCode = res.statusCode;
        if (location2 && opts.followRedirects && statusCode >= 300 && statusCode < 400) {
          if (++websocket3._redirects > opts.maxRedirects) {
            abortHandshake(websocket3, req, "Maximum redirects exceeded");
            return;
          }
          req.abort();
          let addr;
          try {
            addr = new URL4(location2, address);
          } catch (e) {
            const err = new SyntaxError(`Invalid URL: ${location2}`);
            emitErrorAndClose(websocket3, err);
            return;
          }
          initAsClient(websocket3, addr, protocols, options2);
        } else if (!websocket3.emit("unexpected-response", req, res)) {
          abortHandshake(
            websocket3,
            req,
            `Unexpected server response: ${res.statusCode}`
          );
        }
      });
      req.on("upgrade", (res, socket, head) => {
        websocket3.emit("upgrade", res);
        if (websocket3.readyState !== WebSocket3.CONNECTING) return;
        req = websocket3._req = null;
        const upgrade = res.headers.upgrade;
        if (upgrade === void 0 || upgrade.toLowerCase() !== "websocket") {
          abortHandshake(websocket3, socket, "Invalid Upgrade header");
          return;
        }
        const digest = createHash3("sha1").update(key4 + GUID).digest("base64");
        if (res.headers["sec-websocket-accept"] !== digest) {
          abortHandshake(websocket3, socket, "Invalid Sec-WebSocket-Accept header");
          return;
        }
        const serverProt = res.headers["sec-websocket-protocol"];
        let protError;
        if (serverProt !== void 0) {
          if (!protocolSet.size) {
            protError = "Server sent a subprotocol but none was requested";
          } else if (!protocolSet.has(serverProt)) {
            protError = "Server sent an invalid subprotocol";
          }
        } else if (protocolSet.size) {
          protError = "Server sent no subprotocol";
        }
        if (protError) {
          abortHandshake(websocket3, socket, protError);
          return;
        }
        if (serverProt) websocket3._protocol = serverProt;
        const secWebSocketExtensions = res.headers["sec-websocket-extensions"];
        if (secWebSocketExtensions !== void 0) {
          if (!perMessageDeflate) {
            const message = "Server sent a Sec-WebSocket-Extensions header but no extension was requested";
            abortHandshake(websocket3, socket, message);
            return;
          }
          let extensions;
          try {
            extensions = parse2(secWebSocketExtensions);
          } catch (err) {
            const message = "Invalid Sec-WebSocket-Extensions header";
            abortHandshake(websocket3, socket, message);
            return;
          }
          const extensionNames = Object.keys(extensions);
          if (extensionNames.length !== 1 || extensionNames[0] !== PerMessageDeflate2.extensionName) {
            const message = "Server indicated an extension that was not requested";
            abortHandshake(websocket3, socket, message);
            return;
          }
          try {
            perMessageDeflate.accept(extensions[PerMessageDeflate2.extensionName]);
          } catch (err) {
            const message = "Invalid Sec-WebSocket-Extensions header";
            abortHandshake(websocket3, socket, message);
            return;
          }
          websocket3._extensions[PerMessageDeflate2.extensionName] = perMessageDeflate;
        }
        websocket3.setSocket(socket, head, {
          allowSynchronousEvents: opts.allowSynchronousEvents,
          generateMask: opts.generateMask,
          maxBufferedChunks: opts.maxBufferedChunks,
          maxFragments: opts.maxFragments,
          maxPayload: opts.maxPayload,
          skipUTF8Validation: opts.skipUTF8Validation
        });
      });
      if (opts.finishRequest) {
        opts.finishRequest(req, websocket3);
      } else {
        req.end();
      }
    }
    function emitErrorAndClose(websocket3, err) {
      websocket3._readyState = WebSocket3.CLOSING;
      websocket3._errorEmitted = true;
      websocket3.emit("error", err);
      websocket3.emitClose();
    }
    function netConnect(options2) {
      options2.path = options2.socketPath;
      return net.connect(options2);
    }
    function tlsConnect(options2) {
      options2.path = void 0;
      if (!options2.servername && options2.servername !== "") {
        options2.servername = net.isIP(options2.host) ? "" : options2.host;
      }
      return tls.connect(options2);
    }
    function abortHandshake(websocket3, stream, message) {
      websocket3._readyState = WebSocket3.CLOSING;
      const err = new Error(message);
      Error.captureStackTrace(err, abortHandshake);
      if (stream.setHeader) {
        stream[kAborted] = true;
        stream.abort();
        if (stream.socket && !stream.socket.destroyed) {
          stream.socket.destroy();
        }
        process.nextTick(emitErrorAndClose, websocket3, err);
      } else {
        stream.destroy(err);
        stream.once("error", websocket3.emit.bind(websocket3, "error"));
        stream.once("close", websocket3.emitClose.bind(websocket3));
      }
    }
    function sendAfterClose(websocket3, data, cb) {
      if (data) {
        const length = isBlob(data) ? data.size : toBuffer(data).length;
        if (websocket3._socket) websocket3._sender._bufferedBytes += length;
        else websocket3._bufferedAmount += length;
      }
      if (cb) {
        const err = new Error(
          `WebSocket is not open: readyState ${websocket3.readyState} (${readyStates[websocket3.readyState]})`
        );
        process.nextTick(cb, err);
      }
    }
    function receiverOnConclude(code, reason2) {
      const websocket3 = this[kWebSocket];
      websocket3._closeFrameReceived = true;
      websocket3._closeMessage = reason2;
      websocket3._closeCode = code;
      if (websocket3._socket[kWebSocket] === void 0) return;
      websocket3._socket.removeListener("data", socketOnData);
      process.nextTick(resume, websocket3._socket);
      if (code === 1005) websocket3.close();
      else websocket3.close(code, reason2);
    }
    function receiverOnDrain() {
      const websocket3 = this[kWebSocket];
      if (!websocket3.isPaused) websocket3._socket.resume();
    }
    function receiverOnError(err) {
      const websocket3 = this[kWebSocket];
      if (websocket3._socket[kWebSocket] !== void 0) {
        websocket3._socket.removeListener("data", socketOnData);
        process.nextTick(resume, websocket3._socket);
        websocket3.close(err[kStatusCode]);
      }
      if (!websocket3._errorEmitted) {
        websocket3._errorEmitted = true;
        websocket3.emit("error", err);
      }
    }
    function receiverOnFinish() {
      this[kWebSocket].emitClose();
    }
    function receiverOnMessage(data, isBinary) {
      this[kWebSocket].emit("message", data, isBinary);
    }
    function receiverOnPing(data) {
      const websocket3 = this[kWebSocket];
      if (websocket3._autoPong) websocket3.pong(data, !this._isServer, NOOP);
      websocket3.emit("ping", data);
    }
    function receiverOnPong(data) {
      this[kWebSocket].emit("pong", data);
    }
    function resume(stream) {
      stream.resume();
    }
    function senderOnError(err) {
      const websocket3 = this[kWebSocket];
      if (websocket3.readyState === WebSocket3.CLOSED) return;
      if (websocket3.readyState === WebSocket3.OPEN) {
        websocket3._readyState = WebSocket3.CLOSING;
        setCloseTimer(websocket3);
      }
      this._socket.end();
      if (!websocket3._errorEmitted) {
        websocket3._errorEmitted = true;
        websocket3.emit("error", err);
      }
    }
    function setCloseTimer(websocket3) {
      websocket3._closeTimer = setTimeout(
        websocket3._socket.destroy.bind(websocket3._socket),
        websocket3._closeTimeout
      );
    }
    function socketOnClose() {
      const websocket3 = this[kWebSocket];
      this.removeListener("close", socketOnClose);
      this.removeListener("data", socketOnData);
      this.removeListener("end", socketOnEnd);
      websocket3._readyState = WebSocket3.CLOSING;
      if (!this._readableState.endEmitted && !websocket3._closeFrameReceived && !websocket3._receiver._writableState.errorEmitted && this._readableState.length !== 0) {
        const chunk = this.read(this._readableState.length);
        websocket3._receiver.write(chunk);
      }
      websocket3._receiver.end();
      this[kWebSocket] = void 0;
      clearTimeout(websocket3._closeTimer);
      if (websocket3._receiver._writableState.finished || websocket3._receiver._writableState.errorEmitted) {
        websocket3.emitClose();
      } else {
        websocket3._receiver.on("error", receiverOnFinish);
        websocket3._receiver.on("finish", receiverOnFinish);
      }
    }
    function socketOnData(chunk) {
      if (!this[kWebSocket]._receiver.write(chunk)) {
        this.pause();
      }
    }
    function socketOnEnd() {
      const websocket3 = this[kWebSocket];
      websocket3._readyState = WebSocket3.CLOSING;
      websocket3._receiver.end();
      this.end();
    }
    function socketOnError() {
      const websocket3 = this[kWebSocket];
      this.removeListener("error", socketOnError);
      this.on("error", NOOP);
      if (websocket3) {
        websocket3._readyState = WebSocket3.CLOSING;
        this.destroy();
      }
    }
  }
});

// ../../node_modules/.bun/ws@8.21.0/node_modules/ws/lib/stream.js
var require_stream = __commonJS({
  "../../node_modules/.bun/ws@8.21.0/node_modules/ws/lib/stream.js"(exports2, module2) {
    "use strict";
    var WebSocket3 = require_websocket();
    var { Duplex } = require("stream");
    function emitClose(stream) {
      stream.emit("close");
    }
    function duplexOnEnd() {
      if (!this.destroyed && this._writableState.finished) {
        this.destroy();
      }
    }
    function duplexOnError(err) {
      this.removeListener("error", duplexOnError);
      this.destroy();
      if (this.listenerCount("error") === 0) {
        this.emit("error", err);
      }
    }
    function createWebSocketStream2(ws, options2) {
      let terminateOnDestroy = true;
      const duplex = new Duplex({
        ...options2,
        autoDestroy: false,
        emitClose: false,
        objectMode: false,
        writableObjectMode: false
      });
      ws.on("message", function message(msg, isBinary) {
        const data = !isBinary && duplex._readableState.objectMode ? msg.toString() : msg;
        if (!duplex.push(data)) ws.pause();
      });
      ws.once("error", function error(err) {
        if (duplex.destroyed) return;
        terminateOnDestroy = false;
        duplex.destroy(err);
      });
      ws.once("close", function close() {
        if (duplex.destroyed) return;
        duplex.push(null);
      });
      duplex._destroy = function(err, callback) {
        if (ws.readyState === ws.CLOSED) {
          callback(err);
          process.nextTick(emitClose, duplex);
          return;
        }
        let called = false;
        ws.once("error", function error(err2) {
          called = true;
          callback(err2);
        });
        ws.once("close", function close() {
          if (!called) callback(err);
          process.nextTick(emitClose, duplex);
        });
        if (terminateOnDestroy) ws.terminate();
      };
      duplex._final = function(callback) {
        if (ws.readyState === ws.CONNECTING) {
          ws.once("open", function open() {
            duplex._final(callback);
          });
          return;
        }
        if (ws._socket === null) return;
        if (ws._socket._writableState.finished) {
          callback();
          if (duplex._readableState.endEmitted) duplex.destroy();
        } else {
          ws._socket.once("finish", function finish() {
            callback();
          });
          ws.close();
        }
      };
      duplex._read = function() {
        if (ws.isPaused) ws.resume();
      };
      duplex._write = function(chunk, encoding, callback) {
        if (ws.readyState === ws.CONNECTING) {
          ws.once("open", function open() {
            duplex._write(chunk, encoding, callback);
          });
          return;
        }
        ws.send(chunk, callback);
      };
      duplex.on("end", duplexOnEnd);
      duplex.on("error", duplexOnError);
      return duplex;
    }
    module2.exports = createWebSocketStream2;
  }
});

// ../../node_modules/.bun/ws@8.21.0/node_modules/ws/lib/subprotocol.js
var require_subprotocol = __commonJS({
  "../../node_modules/.bun/ws@8.21.0/node_modules/ws/lib/subprotocol.js"(exports2, module2) {
    "use strict";
    var { tokenChars } = require_validation();
    function parse2(header) {
      const protocols = /* @__PURE__ */ new Set();
      let start = -1;
      let end = -1;
      let i = 0;
      for (i; i < header.length; i++) {
        const code = header.charCodeAt(i);
        if (end === -1 && tokenChars[code] === 1) {
          if (start === -1) start = i;
        } else if (i !== 0 && (code === 32 || code === 9)) {
          if (end === -1 && start !== -1) end = i;
        } else if (code === 44) {
          if (start === -1) {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
          if (end === -1) end = i;
          const protocol2 = header.slice(start, end);
          if (protocols.has(protocol2)) {
            throw new SyntaxError(`The "${protocol2}" subprotocol is duplicated`);
          }
          protocols.add(protocol2);
          start = end = -1;
        } else {
          throw new SyntaxError(`Unexpected character at index ${i}`);
        }
      }
      if (start === -1 || end !== -1) {
        throw new SyntaxError("Unexpected end of input");
      }
      const protocol = header.slice(start, i);
      if (protocols.has(protocol)) {
        throw new SyntaxError(`The "${protocol}" subprotocol is duplicated`);
      }
      protocols.add(protocol);
      return protocols;
    }
    module2.exports = { parse: parse2 };
  }
});

// ../../node_modules/.bun/ws@8.21.0/node_modules/ws/lib/websocket-server.js
var require_websocket_server = __commonJS({
  "../../node_modules/.bun/ws@8.21.0/node_modules/ws/lib/websocket-server.js"(exports2, module2) {
    "use strict";
    var EventEmitter = require("events");
    var http = require("http");
    var { Duplex } = require("stream");
    var { createHash: createHash3 } = require("crypto");
    var extension2 = require_extension();
    var PerMessageDeflate2 = require_permessage_deflate();
    var subprotocol2 = require_subprotocol();
    var WebSocket3 = require_websocket();
    var { CLOSE_TIMEOUT, GUID, kWebSocket } = require_constants();
    var keyRegex = /^[+/0-9A-Za-z]{22}==$/;
    var RUNNING = 0;
    var CLOSING = 1;
    var CLOSED = 2;
    var WebSocketServer2 = class extends EventEmitter {
      /**
       * Create a `WebSocketServer` instance.
       *
       * @param {Object} options Configuration options
       * @param {Boolean} [options.allowSynchronousEvents=true] Specifies whether
       *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
       *     multiple times in the same tick
       * @param {Boolean} [options.autoPong=true] Specifies whether or not to
       *     automatically send a pong in response to a ping
       * @param {Number} [options.backlog=511] The maximum length of the queue of
       *     pending connections
       * @param {Boolean} [options.clientTracking=true] Specifies whether or not to
       *     track clients
       * @param {Number} [options.closeTimeout=30000] Duration in milliseconds to
       *     wait for the closing handshake to finish after `websocket.close()` is
       *     called
       * @param {Function} [options.handleProtocols] A hook to handle protocols
       * @param {String} [options.host] The hostname where to bind the server
       * @param {Number} [options.maxBufferedChunks=1048576] The maximum number of
       *     buffered data chunks
       * @param {Number} [options.maxFragments=131072] The maximum number of message
       *     fragments
       * @param {Number} [options.maxPayload=104857600] The maximum allowed message
       *     size
       * @param {Boolean} [options.noServer=false] Enable no server mode
       * @param {String} [options.path] Accept only connections matching this path
       * @param {(Boolean|Object)} [options.perMessageDeflate=false] Enable/disable
       *     permessage-deflate
       * @param {Number} [options.port] The port where to bind the server
       * @param {(http.Server|https.Server)} [options.server] A pre-created HTTP/S
       *     server to use
       * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
       *     not to skip UTF-8 validation for text and close messages
       * @param {Function} [options.verifyClient] A hook to reject connections
       * @param {Function} [options.WebSocket=WebSocket] Specifies the `WebSocket`
       *     class to use. It must be the `WebSocket` class or class that extends it
       * @param {Function} [callback] A listener for the `listening` event
       */
      constructor(options2, callback) {
        super();
        options2 = {
          allowSynchronousEvents: true,
          autoPong: true,
          maxBufferedChunks: 1024 * 1024,
          maxFragments: 128 * 1024,
          maxPayload: 100 * 1024 * 1024,
          skipUTF8Validation: false,
          perMessageDeflate: false,
          handleProtocols: null,
          clientTracking: true,
          closeTimeout: CLOSE_TIMEOUT,
          verifyClient: null,
          noServer: false,
          backlog: null,
          // use default (511 as implemented in net.js)
          server: null,
          host: null,
          path: null,
          port: null,
          WebSocket: WebSocket3,
          ...options2
        };
        if (options2.port == null && !options2.server && !options2.noServer || options2.port != null && (options2.server || options2.noServer) || options2.server && options2.noServer) {
          throw new TypeError(
            'One and only one of the "port", "server", or "noServer" options must be specified'
          );
        }
        if (options2.port != null) {
          this._server = http.createServer((req, res) => {
            const body = http.STATUS_CODES[426];
            res.writeHead(426, {
              "Content-Length": body.length,
              "Content-Type": "text/plain"
            });
            res.end(body);
          });
          this._server.listen(
            options2.port,
            options2.host,
            options2.backlog,
            callback
          );
        } else if (options2.server) {
          this._server = options2.server;
        }
        if (this._server) {
          const emitConnection = this.emit.bind(this, "connection");
          this._removeListeners = addListeners(this._server, {
            listening: this.emit.bind(this, "listening"),
            error: this.emit.bind(this, "error"),
            upgrade: (req, socket, head) => {
              this.handleUpgrade(req, socket, head, emitConnection);
            }
          });
        }
        if (options2.perMessageDeflate === true) options2.perMessageDeflate = {};
        if (options2.clientTracking) {
          this.clients = /* @__PURE__ */ new Set();
          this._shouldEmitClose = false;
        }
        this.options = options2;
        this._state = RUNNING;
      }
      /**
       * Returns the bound address, the address family name, and port of the server
       * as reported by the operating system if listening on an IP socket.
       * If the server is listening on a pipe or UNIX domain socket, the name is
       * returned as a string.
       *
       * @return {(Object|String|null)} The address of the server
       * @public
       */
      address() {
        if (this.options.noServer) {
          throw new Error('The server is operating in "noServer" mode');
        }
        if (!this._server) return null;
        return this._server.address();
      }
      /**
       * Stop the server from accepting new connections and emit the `'close'` event
       * when all existing connections are closed.
       *
       * @param {Function} [cb] A one-time listener for the `'close'` event
       * @public
       */
      close(cb) {
        if (this._state === CLOSED) {
          if (cb) {
            this.once("close", () => {
              cb(new Error("The server is not running"));
            });
          }
          process.nextTick(emitClose, this);
          return;
        }
        if (cb) this.once("close", cb);
        if (this._state === CLOSING) return;
        this._state = CLOSING;
        if (this.options.noServer || this.options.server) {
          if (this._server) {
            this._removeListeners();
            this._removeListeners = this._server = null;
          }
          if (this.clients) {
            if (!this.clients.size) {
              process.nextTick(emitClose, this);
            } else {
              this._shouldEmitClose = true;
            }
          } else {
            process.nextTick(emitClose, this);
          }
        } else {
          const server = this._server;
          this._removeListeners();
          this._removeListeners = this._server = null;
          server.close(() => {
            emitClose(this);
          });
        }
      }
      /**
       * See if a given request should be handled by this server instance.
       *
       * @param {http.IncomingMessage} req Request object to inspect
       * @return {Boolean} `true` if the request is valid, else `false`
       * @public
       */
      shouldHandle(req) {
        if (this.options.path) {
          const index = req.url.indexOf("?");
          const pathname = index !== -1 ? req.url.slice(0, index) : req.url;
          if (pathname !== this.options.path) return false;
        }
        return true;
      }
      /**
       * Handle a HTTP Upgrade request.
       *
       * @param {http.IncomingMessage} req The request object
       * @param {Duplex} socket The network socket between the server and client
       * @param {Buffer} head The first packet of the upgraded stream
       * @param {Function} cb Callback
       * @public
       */
      handleUpgrade(req, socket, head, cb) {
        socket.on("error", socketOnError);
        const key4 = req.headers["sec-websocket-key"];
        const upgrade = req.headers.upgrade;
        const version = +req.headers["sec-websocket-version"];
        if (req.method !== "GET") {
          const message = "Invalid HTTP method";
          abortHandshakeOrEmitwsClientError(this, req, socket, 405, message);
          return;
        }
        if (upgrade === void 0 || upgrade.toLowerCase() !== "websocket") {
          const message = "Invalid Upgrade header";
          abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
          return;
        }
        if (key4 === void 0 || !keyRegex.test(key4)) {
          const message = "Missing or invalid Sec-WebSocket-Key header";
          abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
          return;
        }
        if (version !== 13 && version !== 8) {
          const message = "Missing or invalid Sec-WebSocket-Version header";
          abortHandshakeOrEmitwsClientError(this, req, socket, 400, message, {
            "Sec-WebSocket-Version": "13, 8"
          });
          return;
        }
        if (!this.shouldHandle(req)) {
          abortHandshake(socket, 400);
          return;
        }
        const secWebSocketProtocol = req.headers["sec-websocket-protocol"];
        let protocols = /* @__PURE__ */ new Set();
        if (secWebSocketProtocol !== void 0) {
          try {
            protocols = subprotocol2.parse(secWebSocketProtocol);
          } catch (err) {
            const message = "Invalid Sec-WebSocket-Protocol header";
            abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
            return;
          }
        }
        const secWebSocketExtensions = req.headers["sec-websocket-extensions"];
        const extensions = {};
        if (this.options.perMessageDeflate && secWebSocketExtensions !== void 0) {
          const perMessageDeflate = new PerMessageDeflate2({
            ...this.options.perMessageDeflate,
            isServer: true,
            maxPayload: this.options.maxPayload
          });
          try {
            const offers = extension2.parse(secWebSocketExtensions);
            if (offers[PerMessageDeflate2.extensionName]) {
              perMessageDeflate.accept(offers[PerMessageDeflate2.extensionName]);
              extensions[PerMessageDeflate2.extensionName] = perMessageDeflate;
            }
          } catch (err) {
            const message = "Invalid or unacceptable Sec-WebSocket-Extensions header";
            abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
            return;
          }
        }
        if (this.options.verifyClient) {
          const info = {
            origin: req.headers[`${version === 8 ? "sec-websocket-origin" : "origin"}`],
            secure: !!(req.socket.authorized || req.socket.encrypted),
            req
          };
          if (this.options.verifyClient.length === 2) {
            this.options.verifyClient(info, (verified, code, message, headers2) => {
              if (!verified) {
                return abortHandshake(socket, code || 401, message, headers2);
              }
              this.completeUpgrade(
                extensions,
                key4,
                protocols,
                req,
                socket,
                head,
                cb
              );
            });
            return;
          }
          if (!this.options.verifyClient(info)) return abortHandshake(socket, 401);
        }
        this.completeUpgrade(extensions, key4, protocols, req, socket, head, cb);
      }
      /**
       * Upgrade the connection to WebSocket.
       *
       * @param {Object} extensions The accepted extensions
       * @param {String} key The value of the `Sec-WebSocket-Key` header
       * @param {Set} protocols The subprotocols
       * @param {http.IncomingMessage} req The request object
       * @param {Duplex} socket The network socket between the server and client
       * @param {Buffer} head The first packet of the upgraded stream
       * @param {Function} cb Callback
       * @throws {Error} If called more than once with the same socket
       * @private
       */
      completeUpgrade(extensions, key4, protocols, req, socket, head, cb) {
        if (!socket.readable || !socket.writable) return socket.destroy();
        if (socket[kWebSocket]) {
          throw new Error(
            "server.handleUpgrade() was called more than once with the same socket, possibly due to a misconfiguration"
          );
        }
        if (this._state > RUNNING) return abortHandshake(socket, 503);
        const digest = createHash3("sha1").update(key4 + GUID).digest("base64");
        const headers2 = [
          "HTTP/1.1 101 Switching Protocols",
          "Upgrade: websocket",
          "Connection: Upgrade",
          `Sec-WebSocket-Accept: ${digest}`
        ];
        const ws = new this.options.WebSocket(null, void 0, this.options);
        if (protocols.size) {
          const protocol = this.options.handleProtocols ? this.options.handleProtocols(protocols, req) : protocols.values().next().value;
          if (protocol) {
            headers2.push(`Sec-WebSocket-Protocol: ${protocol}`);
            ws._protocol = protocol;
          }
        }
        if (extensions[PerMessageDeflate2.extensionName]) {
          const params = extensions[PerMessageDeflate2.extensionName].params;
          const value = extension2.format({
            [PerMessageDeflate2.extensionName]: [params]
          });
          headers2.push(`Sec-WebSocket-Extensions: ${value}`);
          ws._extensions = extensions;
        }
        this.emit("headers", headers2, req);
        socket.write(headers2.concat("\r\n").join("\r\n"));
        socket.removeListener("error", socketOnError);
        ws.setSocket(socket, head, {
          allowSynchronousEvents: this.options.allowSynchronousEvents,
          maxBufferedChunks: this.options.maxBufferedChunks,
          maxFragments: this.options.maxFragments,
          maxPayload: this.options.maxPayload,
          skipUTF8Validation: this.options.skipUTF8Validation
        });
        if (this.clients) {
          this.clients.add(ws);
          ws.on("close", () => {
            this.clients.delete(ws);
            if (this._shouldEmitClose && !this.clients.size) {
              process.nextTick(emitClose, this);
            }
          });
        }
        cb(ws, req);
      }
    };
    module2.exports = WebSocketServer2;
    function addListeners(server, map) {
      for (const event of Object.keys(map)) server.on(event, map[event]);
      return function removeListeners() {
        for (const event of Object.keys(map)) {
          server.removeListener(event, map[event]);
        }
      };
    }
    function emitClose(server) {
      server._state = CLOSED;
      server.emit("close");
    }
    function socketOnError() {
      this.destroy();
    }
    function abortHandshake(socket, code, message, headers2) {
      message = message || http.STATUS_CODES[code];
      headers2 = {
        Connection: "close",
        "Content-Type": "text/html",
        "Content-Length": Buffer.byteLength(message),
        ...headers2
      };
      socket.once("finish", socket.destroy);
      socket.end(
        `HTTP/1.1 ${code} ${http.STATUS_CODES[code]}\r
` + Object.keys(headers2).map((h) => `${h}: ${headers2[h]}`).join("\r\n") + "\r\n\r\n" + message
      );
    }
    function abortHandshakeOrEmitwsClientError(server, req, socket, code, message, headers2) {
      if (server.listenerCount("wsClientError")) {
        const err = new Error(message);
        Error.captureStackTrace(err, abortHandshakeOrEmitwsClientError);
        server.emit("wsClientError", err, socket, req);
      } else {
        abortHandshake(socket, code, message, headers2);
      }
    }
  }
});

// ../../node_modules/.bun/ipaddr.js@2.4.0/node_modules/ipaddr.js/lib/ipaddr.js
var require_ipaddr = __commonJS({
  "../../node_modules/.bun/ipaddr.js@2.4.0/node_modules/ipaddr.js/lib/ipaddr.js"(exports2, module2) {
    (function(root) {
      "use strict";
      const ipv4Part = "(0?\\d+|0x[a-f0-9]+)";
      const ipv4Regexes = {
        fourOctet: new RegExp(`^${ipv4Part}\\.${ipv4Part}\\.${ipv4Part}\\.${ipv4Part}$`, "i"),
        threeOctet: new RegExp(`^${ipv4Part}\\.${ipv4Part}\\.${ipv4Part}$`, "i"),
        twoOctet: new RegExp(`^${ipv4Part}\\.${ipv4Part}$`, "i"),
        longValue: new RegExp(`^${ipv4Part}$`, "i")
      };
      const octalRegex = new RegExp(`^0[0-7]+$`, "i");
      const hexRegex = new RegExp(`^0x[a-f0-9]+$`, "i");
      const zoneIndex = "%[0-9a-z]{1,}";
      const ipv6Part = "(?:[0-9a-f]+::?)+";
      const ipv6Regexes = {
        zoneIndex: new RegExp(zoneIndex, "i"),
        "native": new RegExp(`^(::)?(${ipv6Part})?([0-9a-f]+)?(::)?(${zoneIndex})?$`, "i"),
        deprecatedTransitional: new RegExp(`^(?:::)(${ipv4Part}\\.${ipv4Part}\\.${ipv4Part}\\.${ipv4Part}(${zoneIndex})?)$`, "i"),
        transitional: new RegExp(`^((?:${ipv6Part})|(?:::)(?:${ipv6Part})?)${ipv4Part}\\.${ipv4Part}\\.${ipv4Part}\\.${ipv4Part}(${zoneIndex})?$`, "i")
      };
      function expandIPv6(string, parts) {
        if (string.indexOf("::") !== string.lastIndexOf("::")) {
          return null;
        }
        let colonCount = 0;
        let lastColon = -1;
        let zoneId = (string.match(ipv6Regexes.zoneIndex) || [])[0];
        let replacement, replacementCount;
        if (zoneId) {
          zoneId = zoneId.substring(1);
          string = string.replace(/%.+$/, "");
        }
        while ((lastColon = string.indexOf(":", lastColon + 1)) >= 0) {
          colonCount++;
        }
        if (string.substr(0, 2) === "::") {
          colonCount--;
        }
        if (string.substr(-2, 2) === "::") {
          colonCount--;
        }
        if (colonCount > parts) {
          return null;
        }
        replacementCount = parts - colonCount;
        replacement = ":";
        while (replacementCount--) {
          replacement += "0:";
        }
        string = string.replace("::", replacement);
        if (string[0] === ":") {
          string = string.slice(1);
        }
        if (string[string.length - 1] === ":") {
          string = string.slice(0, -1);
        }
        parts = (function() {
          const ref = string.split(":");
          const results = [];
          for (let i = 0; i < ref.length; i++) {
            results.push(parseInt(ref[i], 16));
          }
          return results;
        })();
        return {
          parts,
          zoneId
        };
      }
      function matchCIDR(first, second, partSize, cidrBits) {
        if (first.length !== second.length) {
          throw new Error("ipaddr: cannot match CIDR for objects with different lengths");
        }
        let part = 0;
        let shift;
        while (cidrBits > 0) {
          shift = partSize - cidrBits;
          if (shift < 0) {
            shift = 0;
          }
          if (first[part] >> shift !== second[part] >> shift) {
            return false;
          }
          cidrBits -= partSize;
          part += 1;
        }
        return true;
      }
      function parseIntAuto(string) {
        if (hexRegex.test(string)) {
          return parseInt(string, 16);
        }
        if (string[0] === "0" && !isNaN(parseInt(string[1], 10))) {
          if (octalRegex.test(string)) {
            return parseInt(string, 8);
          }
          throw new Error(`ipaddr: cannot parse ${string} as octal`);
        }
        return parseInt(string, 10);
      }
      function padPart(part, length) {
        while (part.length < length) {
          part = `0${part}`;
        }
        return part;
      }
      const ipaddr2 = {};
      ipaddr2.IPv4 = (function() {
        function IPv4(octets) {
          if (octets.length !== 4) {
            throw new Error("ipaddr: ipv4 octet count should be 4");
          }
          let i, octet;
          for (i = 0; i < octets.length; i++) {
            octet = octets[i];
            if (!(0 <= octet && octet <= 255)) {
              throw new Error("ipaddr: ipv4 octet should fit in 8 bits");
            }
          }
          this.octets = octets;
        }
        IPv4.prototype.SpecialRanges = {
          unspecified: [[new IPv4([0, 0, 0, 0]), 8]],
          broadcast: [[new IPv4([255, 255, 255, 255]), 32]],
          // RFC3171
          multicast: [[new IPv4([224, 0, 0, 0]), 4]],
          // RFC3927
          linkLocal: [[new IPv4([169, 254, 0, 0]), 16]],
          // RFC5735
          loopback: [[new IPv4([127, 0, 0, 0]), 8]],
          // RFC6598
          carrierGradeNat: [[new IPv4([100, 64, 0, 0]), 10]],
          // RFC1918
          "private": [
            [new IPv4([10, 0, 0, 0]), 8],
            [new IPv4([172, 16, 0, 0]), 12],
            [new IPv4([192, 168, 0, 0]), 16]
          ],
          // Reserved and testing-only ranges; RFCs 5735, 5737, 2544, 1700
          reserved: [
            [new IPv4([192, 0, 0, 0]), 24],
            [new IPv4([192, 0, 2, 0]), 24],
            [new IPv4([192, 88, 99, 0]), 24],
            [new IPv4([198, 18, 0, 0]), 15],
            [new IPv4([198, 51, 100, 0]), 24],
            [new IPv4([203, 0, 113, 0]), 24],
            [new IPv4([240, 0, 0, 0]), 4]
          ],
          // RFC7534, RFC7535
          as112: [
            [new IPv4([192, 175, 48, 0]), 24],
            [new IPv4([192, 31, 196, 0]), 24]
          ],
          // RFC7450
          amt: [
            [new IPv4([192, 52, 193, 0]), 24]
          ]
        };
        IPv4.prototype.kind = function() {
          return "ipv4";
        };
        IPv4.prototype.match = function(other, cidrRange) {
          let ref;
          if (cidrRange === void 0) {
            ref = other;
            other = ref[0];
            cidrRange = ref[1];
          }
          if (other.kind() !== "ipv4") {
            throw new Error("ipaddr: cannot match ipv4 address with non-ipv4 one");
          }
          return matchCIDR(this.octets, other.octets, 8, cidrRange);
        };
        IPv4.prototype.prefixLengthFromSubnetMask = function() {
          let cidr = 0;
          let stop = false;
          const zerotable = {
            0: 8,
            128: 7,
            192: 6,
            224: 5,
            240: 4,
            248: 3,
            252: 2,
            254: 1,
            255: 0
          };
          let i, octet, zeros;
          for (i = 3; i >= 0; i -= 1) {
            octet = this.octets[i];
            if (octet in zerotable) {
              zeros = zerotable[octet];
              if (stop && zeros !== 0) {
                return null;
              }
              if (zeros !== 8) {
                stop = true;
              }
              cidr += zeros;
            } else {
              return null;
            }
          }
          return 32 - cidr;
        };
        IPv4.prototype.range = function() {
          return ipaddr2.subnetMatch(this, this.SpecialRanges);
        };
        IPv4.prototype.toByteArray = function() {
          return this.octets.slice(0);
        };
        IPv4.prototype.toIPv4MappedAddress = function() {
          return ipaddr2.IPv6.parse(`::ffff:${this.toString()}`);
        };
        IPv4.prototype.toNormalizedString = function() {
          return this.toString();
        };
        IPv4.prototype.toString = function() {
          return this.octets.join(".");
        };
        return IPv4;
      })();
      ipaddr2.IPv4.broadcastAddressFromCIDR = function(string) {
        try {
          const cidr = this.parseCIDR(string);
          const ipInterfaceOctets = cidr[0].toByteArray();
          const subnetMaskOctets = this.subnetMaskFromPrefixLength(cidr[1]).toByteArray();
          const octets = [];
          let i = 0;
          while (i < 4) {
            octets.push(parseInt(ipInterfaceOctets[i], 10) | parseInt(subnetMaskOctets[i], 10) ^ 255);
            i++;
          }
          return new this(octets);
        } catch (e) {
          throw new Error("ipaddr: the address does not have IPv4 CIDR format");
        }
      };
      ipaddr2.IPv4.isIPv4 = function(string) {
        return this.parser(string) !== null;
      };
      ipaddr2.IPv4.isValid = function(string) {
        try {
          new this(this.parser(string));
          return true;
        } catch (e) {
          return false;
        }
      };
      ipaddr2.IPv4.isValidCIDR = function(string) {
        try {
          this.parseCIDR(string);
          return true;
        } catch (e) {
          return false;
        }
      };
      ipaddr2.IPv4.isValidFourPartDecimal = function(string) {
        if (ipaddr2.IPv4.isValid(string) && string.match(/^(0|[1-9]\d*)(\.(0|[1-9]\d*)){3}$/)) {
          return true;
        } else {
          return false;
        }
      };
      ipaddr2.IPv4.isValidCIDRFourPartDecimal = function(string) {
        const match = string.match(/^(.+)\/(\d+)$/);
        if (!ipaddr2.IPv4.isValidCIDR(string) || !match) {
          return false;
        }
        return ipaddr2.IPv4.isValidFourPartDecimal(match[1]);
      };
      ipaddr2.IPv4.networkAddressFromCIDR = function(string) {
        let cidr, i, ipInterfaceOctets, octets, subnetMaskOctets;
        try {
          cidr = this.parseCIDR(string);
          ipInterfaceOctets = cidr[0].toByteArray();
          subnetMaskOctets = this.subnetMaskFromPrefixLength(cidr[1]).toByteArray();
          octets = [];
          i = 0;
          while (i < 4) {
            octets.push(parseInt(ipInterfaceOctets[i], 10) & parseInt(subnetMaskOctets[i], 10));
            i++;
          }
          return new this(octets);
        } catch (e) {
          throw new Error("ipaddr: the address does not have IPv4 CIDR format");
        }
      };
      ipaddr2.IPv4.parse = function(string) {
        const parts = this.parser(string);
        if (parts === null) {
          throw new Error("ipaddr: string is not formatted like an IPv4 Address");
        }
        return new this(parts);
      };
      ipaddr2.IPv4.parseCIDR = function(string) {
        let match;
        if (match = string.match(/^(.+)\/(\d+)$/)) {
          const maskLength = parseInt(match[2]);
          if (maskLength >= 0 && maskLength <= 32) {
            const parsed = [this.parse(match[1]), maskLength];
            Object.defineProperty(parsed, "toString", {
              value: function() {
                return this.join("/");
              }
            });
            return parsed;
          }
        }
        throw new Error("ipaddr: string is not formatted like an IPv4 CIDR range");
      };
      ipaddr2.IPv4.parser = function(string) {
        let match, part, value;
        if (match = string.match(ipv4Regexes.fourOctet)) {
          return (function() {
            const ref = match.slice(1, 6);
            const results = [];
            for (let i = 0; i < ref.length; i++) {
              part = ref[i];
              results.push(parseIntAuto(part));
            }
            return results;
          })();
        } else if (match = string.match(ipv4Regexes.longValue)) {
          value = parseIntAuto(match[1]);
          if (value > 4294967295 || value < 0) {
            throw new Error("ipaddr: address outside defined range");
          }
          return (function() {
            const results = [];
            let shift;
            for (shift = 0; shift <= 24; shift += 8) {
              results.push(value >> shift & 255);
            }
            return results;
          })().reverse();
        } else if (match = string.match(ipv4Regexes.twoOctet)) {
          return (function() {
            const ref = match.slice(1, 4);
            const results = [];
            value = parseIntAuto(ref[1]);
            if (value > 16777215 || value < 0) {
              throw new Error("ipaddr: address outside defined range");
            }
            results.push(parseIntAuto(ref[0]));
            results.push(value >> 16 & 255);
            results.push(value >> 8 & 255);
            results.push(value & 255);
            return results;
          })();
        } else if (match = string.match(ipv4Regexes.threeOctet)) {
          return (function() {
            const ref = match.slice(1, 5);
            const results = [];
            value = parseIntAuto(ref[2]);
            if (value > 65535 || value < 0) {
              throw new Error("ipaddr: address outside defined range");
            }
            results.push(parseIntAuto(ref[0]));
            results.push(parseIntAuto(ref[1]));
            results.push(value >> 8 & 255);
            results.push(value & 255);
            return results;
          })();
        } else {
          return null;
        }
      };
      ipaddr2.IPv4.subnetMaskFromPrefixLength = function(prefix) {
        prefix = parseInt(prefix);
        if (prefix < 0 || prefix > 32) {
          throw new Error("ipaddr: invalid IPv4 prefix length");
        }
        const octets = [0, 0, 0, 0];
        let j = 0;
        const filledOctetCount = Math.floor(prefix / 8);
        while (j < filledOctetCount) {
          octets[j] = 255;
          j++;
        }
        if (filledOctetCount < 4) {
          octets[filledOctetCount] = Math.pow(2, prefix % 8) - 1 << 8 - prefix % 8;
        }
        return new this(octets);
      };
      ipaddr2.IPv6 = (function() {
        function IPv6(parts, zoneId) {
          let i, part;
          if (parts.length === 16) {
            this.parts = [];
            for (i = 0; i <= 14; i += 2) {
              this.parts.push(parts[i] << 8 | parts[i + 1]);
            }
          } else if (parts.length === 8) {
            this.parts = parts;
          } else {
            throw new Error("ipaddr: ipv6 part count should be 8 or 16");
          }
          for (i = 0; i < this.parts.length; i++) {
            part = this.parts[i];
            if (!(0 <= part && part <= 65535)) {
              throw new Error("ipaddr: ipv6 part should fit in 16 bits");
            }
          }
          if (zoneId) {
            this.zoneId = zoneId;
          }
        }
        IPv6.prototype.SpecialRanges = {
          // RFC4291, here and after
          unspecified: [new IPv6([0, 0, 0, 0, 0, 0, 0, 0]), 128],
          linkLocal: [new IPv6([65152, 0, 0, 0, 0, 0, 0, 0]), 10],
          multicast: [new IPv6([65280, 0, 0, 0, 0, 0, 0, 0]), 8],
          loopback: [new IPv6([0, 0, 0, 0, 0, 0, 0, 1]), 128],
          uniqueLocal: [new IPv6([64512, 0, 0, 0, 0, 0, 0, 0]), 7],
          ipv4Mapped: [new IPv6([0, 0, 0, 0, 0, 65535, 0, 0]), 96],
          // RFC3879
          deprecatedSiteLocal: [new IPv6([65216, 0, 0, 0, 0, 0, 0, 0]), 10],
          // RFC6666
          discard: [new IPv6([256, 0, 0, 0, 0, 0, 0, 0]), 64],
          // RFC6145
          rfc6145: [new IPv6([0, 0, 0, 0, 65535, 0, 0, 0]), 96],
          rfc6052: [
            // RFC6052
            [new IPv6([100, 65435, 0, 0, 0, 0, 0, 0]), 96],
            // RFC8215
            [new IPv6([100, 65435, 1, 0, 0, 0, 0, 0]), 48]
          ],
          // RFC3056
          "6to4": [new IPv6([8194, 0, 0, 0, 0, 0, 0, 0]), 16],
          // RFC6052, RFC6146
          teredo: [new IPv6([8193, 0, 0, 0, 0, 0, 0, 0]), 32],
          // RFC5180
          benchmarking: [new IPv6([8193, 2, 0, 0, 0, 0, 0, 0]), 48],
          // RFC7450
          amt: [new IPv6([8193, 3, 0, 0, 0, 0, 0, 0]), 32],
          as112v6: [
            // RFC7535
            [new IPv6([8193, 4, 274, 0, 0, 0, 0, 0]), 48],
            // RFC7534
            [new IPv6([9760, 79, 32768, 0, 0, 0, 0, 0]), 48]
          ],
          // RFC4843
          deprecatedOrchid: [new IPv6([8193, 16, 0, 0, 0, 0, 0, 0]), 28],
          // RFC7343
          orchid2: [new IPv6([8193, 32, 0, 0, 0, 0, 0, 0]), 28],
          // RFC9374
          droneRemoteIdProtocolEntityTags: [new IPv6([8193, 48, 0, 0, 0, 0, 0, 0]), 28],
          // RFC9602
          segmentRouting: [new IPv6([24320, 0, 0, 0, 0, 0, 0, 0]), 16],
          reserved: [
            // RFC3849
            [new IPv6([8193, 0, 0, 0, 0, 0, 0, 0]), 23],
            // RFC2928
            [new IPv6([8193, 3512, 0, 0, 0, 0, 0, 0]), 32],
            // RFC9637
            [new IPv6([16383, 0, 0, 0, 0, 0, 0, 0]), 20]
          ]
        };
        IPv6.prototype.isIPv4MappedAddress = function() {
          return this.range() === "ipv4Mapped";
        };
        IPv6.prototype.kind = function() {
          return "ipv6";
        };
        IPv6.prototype.match = function(other, cidrRange) {
          let ref;
          if (cidrRange === void 0) {
            ref = other;
            other = ref[0];
            cidrRange = ref[1];
          }
          if (other.kind() !== "ipv6") {
            throw new Error("ipaddr: cannot match ipv6 address with non-ipv6 one");
          }
          return matchCIDR(this.parts, other.parts, 16, cidrRange);
        };
        IPv6.prototype.prefixLengthFromSubnetMask = function() {
          let cidr = 0;
          let stop = false;
          const zerotable = {
            0: 16,
            32768: 15,
            49152: 14,
            57344: 13,
            61440: 12,
            63488: 11,
            64512: 10,
            65024: 9,
            65280: 8,
            65408: 7,
            65472: 6,
            65504: 5,
            65520: 4,
            65528: 3,
            65532: 2,
            65534: 1,
            65535: 0
          };
          let part, zeros;
          for (let i = 7; i >= 0; i -= 1) {
            part = this.parts[i];
            if (part in zerotable) {
              zeros = zerotable[part];
              if (stop && zeros !== 0) {
                return null;
              }
              if (zeros !== 16) {
                stop = true;
              }
              cidr += zeros;
            } else {
              return null;
            }
          }
          return 128 - cidr;
        };
        IPv6.prototype.range = function() {
          return ipaddr2.subnetMatch(this, this.SpecialRanges);
        };
        IPv6.prototype.toByteArray = function() {
          let part;
          const bytes = [];
          const ref = this.parts;
          for (let i = 0; i < ref.length; i++) {
            part = ref[i];
            bytes.push(part >> 8);
            bytes.push(part & 255);
          }
          return bytes;
        };
        IPv6.prototype.toFixedLengthString = function() {
          const addr = (function() {
            const results = [];
            for (let i = 0; i < this.parts.length; i++) {
              results.push(padPart(this.parts[i].toString(16), 4));
            }
            return results;
          }).call(this).join(":");
          let suffix = "";
          if (this.zoneId) {
            suffix = `%${this.zoneId}`;
          }
          return addr + suffix;
        };
        IPv6.prototype.toIPv4Address = function() {
          if (!this.isIPv4MappedAddress()) {
            throw new Error("ipaddr: trying to convert a generic ipv6 address to ipv4");
          }
          const ref = this.parts.slice(-2);
          const high = ref[0];
          const low = ref[1];
          return new ipaddr2.IPv4([high >> 8, high & 255, low >> 8, low & 255]);
        };
        IPv6.prototype.toNormalizedString = function() {
          const addr = (function() {
            const results = [];
            for (let i = 0; i < this.parts.length; i++) {
              results.push(this.parts[i].toString(16));
            }
            return results;
          }).call(this).join(":");
          let suffix = "";
          if (this.zoneId) {
            suffix = `%${this.zoneId}`;
          }
          return addr + suffix;
        };
        IPv6.prototype.toRFC5952String = function() {
          const regex = /((^|:)(0(:|$)){2,})/g;
          const string = this.toNormalizedString();
          let bestMatchIndex = 0;
          let bestMatchLength = -1;
          let match;
          while (match = regex.exec(string)) {
            if (match[0].length > bestMatchLength) {
              bestMatchIndex = match.index;
              bestMatchLength = match[0].length;
            }
          }
          if (bestMatchLength < 0) {
            return string;
          }
          return `${string.substring(0, bestMatchIndex)}::${string.substring(bestMatchIndex + bestMatchLength)}`;
        };
        IPv6.prototype.toString = function() {
          return this.toRFC5952String();
        };
        return IPv6;
      })();
      ipaddr2.IPv6.broadcastAddressFromCIDR = function(string) {
        try {
          const cidr = this.parseCIDR(string);
          const ipInterfaceOctets = cidr[0].toByteArray();
          const subnetMaskOctets = this.subnetMaskFromPrefixLength(cidr[1]).toByteArray();
          const octets = [];
          let i = 0;
          while (i < 16) {
            octets.push(parseInt(ipInterfaceOctets[i], 10) | parseInt(subnetMaskOctets[i], 10) ^ 255);
            i++;
          }
          return new this(octets);
        } catch (e) {
          throw new Error(`ipaddr: the address does not have IPv6 CIDR format (${e})`);
        }
      };
      ipaddr2.IPv6.isIPv6 = function(string) {
        return this.parser(string) !== null;
      };
      ipaddr2.IPv6.isValid = function(string) {
        if (typeof string === "string" && string.indexOf(":") === -1) {
          return false;
        }
        try {
          const addr = this.parser(string);
          new this(addr.parts, addr.zoneId);
          return true;
        } catch (e) {
          return false;
        }
      };
      ipaddr2.IPv6.isValidCIDR = function(string) {
        if (typeof string === "string" && string.indexOf(":") === -1) {
          return false;
        }
        try {
          this.parseCIDR(string);
          return true;
        } catch (e) {
          return false;
        }
      };
      ipaddr2.IPv6.networkAddressFromCIDR = function(string) {
        let cidr, i, ipInterfaceOctets, octets, subnetMaskOctets;
        try {
          cidr = this.parseCIDR(string);
          ipInterfaceOctets = cidr[0].toByteArray();
          subnetMaskOctets = this.subnetMaskFromPrefixLength(cidr[1]).toByteArray();
          octets = [];
          i = 0;
          while (i < 16) {
            octets.push(parseInt(ipInterfaceOctets[i], 10) & parseInt(subnetMaskOctets[i], 10));
            i++;
          }
          return new this(octets);
        } catch (e) {
          throw new Error(`ipaddr: the address does not have IPv6 CIDR format (${e})`);
        }
      };
      ipaddr2.IPv6.parse = function(string) {
        const addr = this.parser(string);
        if (addr.parts === null) {
          throw new Error("ipaddr: string is not formatted like an IPv6 Address");
        }
        return new this(addr.parts, addr.zoneId);
      };
      ipaddr2.IPv6.parseCIDR = function(string) {
        let maskLength, match, parsed;
        if (match = string.match(/^(.+)\/(\d+)$/)) {
          maskLength = parseInt(match[2]);
          if (maskLength >= 0 && maskLength <= 128) {
            parsed = [this.parse(match[1]), maskLength];
            Object.defineProperty(parsed, "toString", {
              value: function() {
                return this.join("/");
              }
            });
            return parsed;
          }
        }
        throw new Error("ipaddr: string is not formatted like an IPv6 CIDR range");
      };
      ipaddr2.IPv6.parser = function(string) {
        let addr, i, match, octet, octets, zoneId;
        if (match = string.match(ipv6Regexes.deprecatedTransitional)) {
          return this.parser(`::ffff:${match[1]}`);
        }
        if (ipv6Regexes.native.test(string)) {
          return expandIPv6(string, 8);
        }
        if (match = string.match(ipv6Regexes.transitional)) {
          zoneId = match[6] || "";
          addr = match[1];
          if (!match[1].endsWith("::")) {
            addr = addr.slice(0, -1);
          }
          addr = expandIPv6(addr + zoneId, 6);
          if (addr.parts) {
            octets = [
              parseInt(match[2]),
              parseInt(match[3]),
              parseInt(match[4]),
              parseInt(match[5])
            ];
            for (i = 0; i < octets.length; i++) {
              octet = octets[i];
              if (!(0 <= octet && octet <= 255)) {
                return null;
              }
            }
            addr.parts.push(octets[0] << 8 | octets[1]);
            addr.parts.push(octets[2] << 8 | octets[3]);
            return {
              parts: addr.parts,
              zoneId: addr.zoneId
            };
          }
        }
        return null;
      };
      ipaddr2.IPv6.subnetMaskFromPrefixLength = function(prefix) {
        prefix = parseInt(prefix);
        if (prefix < 0 || prefix > 128) {
          throw new Error("ipaddr: invalid IPv6 prefix length");
        }
        const octets = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        let j = 0;
        const filledOctetCount = Math.floor(prefix / 8);
        while (j < filledOctetCount) {
          octets[j] = 255;
          j++;
        }
        if (filledOctetCount < 16) {
          octets[filledOctetCount] = Math.pow(2, prefix % 8) - 1 << 8 - prefix % 8;
        }
        return new this(octets);
      };
      ipaddr2.fromByteArray = function(bytes) {
        const length = bytes.length;
        if (length === 4) {
          return new ipaddr2.IPv4(bytes);
        } else if (length === 16) {
          return new ipaddr2.IPv6(bytes);
        } else {
          throw new Error("ipaddr: the binary input is neither an IPv6 nor IPv4 address");
        }
      };
      ipaddr2.isValid = function(string) {
        return ipaddr2.IPv6.isValid(string) || ipaddr2.IPv4.isValid(string);
      };
      ipaddr2.isValidCIDR = function(string) {
        return ipaddr2.IPv6.isValidCIDR(string) || ipaddr2.IPv4.isValidCIDR(string);
      };
      ipaddr2.parse = function(string) {
        if (ipaddr2.IPv6.isValid(string)) {
          return ipaddr2.IPv6.parse(string);
        } else if (ipaddr2.IPv4.isValid(string)) {
          return ipaddr2.IPv4.parse(string);
        } else {
          throw new Error("ipaddr: the address has neither IPv6 nor IPv4 format");
        }
      };
      ipaddr2.parseCIDR = function(string) {
        try {
          return ipaddr2.IPv6.parseCIDR(string);
        } catch (e) {
          try {
            return ipaddr2.IPv4.parseCIDR(string);
          } catch (e2) {
            throw new Error("ipaddr: the address has neither IPv6 nor IPv4 CIDR format");
          }
        }
      };
      ipaddr2.process = function(string) {
        const addr = this.parse(string);
        if (addr.kind() === "ipv6" && addr.isIPv4MappedAddress()) {
          return addr.toIPv4Address();
        } else {
          return addr;
        }
      };
      ipaddr2.subnetMatch = function(address, rangeList, defaultName) {
        let i, rangeName, rangeSubnets, subnet;
        if (defaultName === void 0 || defaultName === null) {
          defaultName = "unicast";
        }
        for (rangeName in rangeList) {
          if (Object.prototype.hasOwnProperty.call(rangeList, rangeName)) {
            rangeSubnets = rangeList[rangeName];
            if (rangeSubnets[0] && !(rangeSubnets[0] instanceof Array)) {
              rangeSubnets = [rangeSubnets];
            }
            for (i = 0; i < rangeSubnets.length; i++) {
              subnet = rangeSubnets[i];
              if (address.kind() === subnet[0].kind() && address.match.apply(address, subnet)) {
                return rangeName;
              }
            }
          }
        }
        return defaultName;
      };
      if (typeof module2 !== "undefined" && module2.exports) {
        module2.exports = ipaddr2;
      } else {
        root.ipaddr = ipaddr2;
      }
    })(exports2);
  }
});

// tests/fixtures/browser-network.ts
var import_node_test = require("node:test");
var import_test = require("@playwright/test");
var import_node_crypto4 = require("node:crypto");
var import_node_dgram = require("node:dgram");
var import_node_events2 = require("node:events");
var import_node_http4 = require("node:http");
var import_node_https = require("node:https");
var import_node_net4 = require("node:net");
var import_playwright_core2 = require("playwright-core");

// ../../node_modules/.bun/ws@8.21.0/node_modules/ws/wrapper.mjs
var import_stream = __toESM(require_stream(), 1);
var import_extension = __toESM(require_extension(), 1);
var import_permessage_deflate = __toESM(require_permessage_deflate(), 1);
var import_receiver = __toESM(require_receiver(), 1);
var import_sender = __toESM(require_sender(), 1);
var import_subprotocol = __toESM(require_subprotocol(), 1);
var import_websocket = __toESM(require_websocket(), 1);
var import_websocket_server = __toESM(require_websocket_server(), 1);
var wrapper_default = import_websocket.default;

// src/services/browser-automation/browser-broker.ts
var import_node_crypto3 = require("node:crypto");
var import_node_http3 = require("node:http");
var import_node_url3 = require("node:url");
var import_node_util = require("node:util");
var import_playwright_core = require("playwright-core");

// src/services/browser-automation/browser-devtools.ts
var import_node_crypto = require("node:crypto");
var import_node_http = require("node:http");
var import_node_url = require("node:url");
var LIFETIME = 15 * 60 * 1e3;
var PAYLOAD = 16 * 1024 * 1024;
function equal(left, right) {
  const actual = Buffer.from(left);
  const expected = Buffer.from(right);
  return actual.byteLength === expected.byteLength && (0, import_node_crypto.timingSafeEqual)(actual, expected);
}
function reject(socket, status, reason2) {
  socket.write(`HTTP/1.1 ${status} ${reason2}\r
Connection: close\r
Content-Length: 0\r
\r
`);
  socket.destroy();
}
function resource(port, path2) {
  return new Promise((resolve, reject2) => {
    const req = (0, import_node_http.request)({ hostname: "127.0.0.1", port, path: path2, method: "GET" }, (response) => {
      const chunks = [];
      let size = 0;
      response.on("data", (chunk) => {
        size += chunk.byteLength;
        if (size > PAYLOAD) {
          response.destroy(new Error("Browser developer tools asset exceeds the size limit"));
          return;
        }
        chunks.push(chunk);
      });
      response.once("error", reject2);
      response.once(
        "end",
        () => resolve({ status: response.statusCode ?? 502, headers: response.headers, body: Buffer.concat(chunks) })
      );
    });
    req.setTimeout(1e4, () => req.destroy(new Error("Browser developer tools asset request timed out")));
    req.once("error", reject2);
    req.end();
  });
}
function inspect(data) {
  const value = Array.isArray(data) ? Buffer.concat(data).toString("utf8") : data instanceof ArrayBuffer ? Buffer.from(data).toString("utf8") : data.toString("utf8");
  if (!value.includes("Overlay.")) return;
  try {
    const message = JSON.parse(value);
    return typeof message.method === "string" ? message : void 0;
  } catch {
    return void 0;
  }
}
var BrowserDevtools = class {
  constructor(server, port, log, mode) {
    this.server = server;
    this.port = port;
    this.log = log;
    this.mode = mode;
    this.server.on("upgrade", this.upgrade);
  }
  server;
  port;
  log;
  mode;
  targets = /* @__PURE__ */ new Map();
  sockets = new import_websocket_server.default({ noServer: true, maxPayload: PAYLOAD });
  upgrade = (req, socket, head) => {
    this.connect(req, socket, head);
  };
  open(browser, page, port, theme) {
    this.revoke(browser);
    const secret = (0, import_node_crypto.randomBytes)(32).toString("hex");
    const target = {
      browser,
      page,
      port,
      secret,
      theme,
      expires: Date.now() + LIFETIME,
      sockets: /* @__PURE__ */ new Set(),
      inspecting: /* @__PURE__ */ new Set()
    };
    this.targets.set(browser, target);
    const path2 = `/browser/devtools/${browser}/${secret}`;
    const query = new URLSearchParams({
      ws: `127.0.0.1:${this.port}${path2}/connect`
    });
    return `http://127.0.0.1:${this.port}${path2}/inspector.html?${query}`;
  }
  async handle(req, res, route) {
    if (!route.pathname.startsWith("/browser/devtools/")) return false;
    const scope2 = this.match(req, route);
    if (!scope2 || req.method !== "GET" || scope2.path === "connect") {
      res.writeHead(scope2 ? 405 : 401, { "cache-control": "no-store" });
      res.end();
      return true;
    }
    if (scope2.path === "kilo-bootstrap.js") {
      const script = [
        `localStorage.setItem("ui-theme",JSON.stringify(${JSON.stringify(scope2.target.theme)}))`,
        'localStorage.setItem("currentDockState",JSON.stringify("undocked"))'
      ].join(";");
      res.writeHead(200, {
        "cache-control": "no-store",
        "content-length": Buffer.byteLength(script),
        "content-type": "application/javascript; charset=utf-8"
      });
      res.end(script);
      return true;
    }
    try {
      const response = await resource(scope2.target.port, `/devtools/${scope2.path}${route.search}`);
      const data = response.body;
      const body = scope2.path === "inspector.html" && response.status === 200 ? Buffer.from(
        data.toString("utf8").replace(
          /<script\s+type="module"/i,
          '<script src="./kilo-bootstrap.js"></script><script type="module"'
        )
      ) : data;
      const headers2 = {
        "cache-control": "no-store",
        "content-length": body.byteLength,
        "referrer-policy": "no-referrer"
      };
      for (const name of ["content-type", "content-security-policy"]) {
        const value = response.headers[name];
        if (typeof value === "string") headers2[name] = value;
      }
      res.writeHead(response.status, headers2);
      res.end(body);
    } catch (error) {
      this.log("Browser developer tools asset failed", { browser: scope2.target.browser, error });
      res.writeHead(502, { "cache-control": "no-store" });
      res.end();
    }
    return true;
  }
  revoke(browser) {
    const target = this.targets.get(browser);
    if (!target) return;
    this.targets.delete(browser);
    if (target.inspecting.size) this.mode(browser, false);
    target.inspecting.clear();
    for (const socket of target.sockets) socket.close(1001, "Browser session closed");
    target.sockets.clear();
  }
  dispose() {
    this.server.off("upgrade", this.upgrade);
    for (const browser of [...this.targets.keys()]) this.revoke(browser);
    this.sockets.close();
  }
  match(req, route) {
    if (req.headers.host !== `127.0.0.1:${this.port}`) return;
    const parts = route.pathname.split("/");
    if (parts[1] !== "browser" || parts[2] !== "devtools" || parts.length < 6) return;
    const target = this.targets.get(parts[3]);
    if (!target || target.expires < Date.now() || !equal(parts[4], target.secret)) return;
    const path2 = parts.slice(5).join("/");
    if (!path2 || path2.includes("..") || path2.includes("\\") || /%2f|%5c/i.test(path2)) return;
    target.expires = Date.now() + LIFETIME;
    return { target, path: path2 };
  }
  connect(req, socket, head) {
    const route = new import_node_url.URL(req.url ?? "/", `http://127.0.0.1:${this.port}`);
    const scope2 = this.match(req, route);
    if (!scope2 || scope2.path !== "connect") return reject(socket, 401, "Unauthorized");
    if (req.headers.origin !== `http://127.0.0.1:${this.port}`) return reject(socket, 403, "Forbidden");
    this.sockets.handleUpgrade(req, socket, head, (client) => this.bridge(scope2.target, client));
  }
  select(target, client, active) {
    const previous = target.inspecting.size > 0;
    if (active) target.inspecting.add(client);
    if (!active) target.inspecting.delete(client);
    const current = target.inspecting.size > 0;
    if (previous !== current) this.mode(target.browser, current);
  }
  bridge(target, client) {
    const upstream = new wrapper_default(`ws://127.0.0.1:${target.port}/devtools/page/${target.page}`, {
      maxPayload: PAYLOAD
    });
    const queued = [];
    target.sockets.add(client);
    const close = () => {
      this.select(target, client, false);
      target.sockets.delete(client);
      if (client.readyState === wrapper_default.OPEN || client.readyState === wrapper_default.CONNECTING) client.close();
      if (upstream.readyState === wrapper_default.OPEN || upstream.readyState === wrapper_default.CONNECTING) upstream.close();
    };
    upstream.on("open", () => {
      for (const item of queued.splice(0)) upstream.send(item.data, { binary: item.binary });
    });
    upstream.on("message", (data, binary) => {
      const message = inspect(data);
      if (message?.method === "Overlay.inspectNodeRequested" || message?.method === "Overlay.inspectModeCanceled") {
        this.select(target, client, false);
      }
      if (client.readyState === wrapper_default.OPEN) client.send(data, { binary });
    });
    upstream.on("error", (error) => {
      this.log("Browser developer tools connection failed", { browser: target.browser, error });
      close();
    });
    upstream.on("close", close);
    client.on("message", (data, binary) => {
      const message = inspect(data);
      if (message?.method === "Overlay.setInspectMode") {
        this.select(
          target,
          client,
          message.params?.mode === "searchForNode" || message.params?.mode === "searchForUAShadowDOM"
        );
      }
      if (upstream.readyState === wrapper_default.OPEN) {
        upstream.send(data, { binary });
        return;
      }
      if (upstream.readyState === wrapper_default.CONNECTING) queued.push({ data, binary });
    });
    client.on("error", (error) => {
      this.log("Browser developer tools client failed", { browser: target.browser, error });
      close();
    });
    client.on("close", close);
  }
};

// src/services/browser-automation/browser-element.ts
var import_promises = require("node:fs/promises");
var import_node_path = __toESM(require("node:path"));
function integer(value) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : void 0;
}
async function coordinates(file, source, size) {
  const line = integer(source.line);
  const text2 = line && size <= 1048576 ? await (0, import_promises.readFile)(file, "utf8").catch(() => void 0) : void 0;
  const lines = text2?.split("\n");
  const valid2 = line && lines && line <= lines.length ? line : void 0;
  const column = integer(source.column);
  return {
    line: valid2,
    column: valid2 && column && column <= (lines?.[valid2 - 1]?.length ?? 0) + 1 ? column : void 0
  };
}
async function locate(directory, source) {
  if (!source?.file || source.file.includes("\0") || /^[a-z][a-z0-9+.-]*:\/\//i.test(source.file)) return void 0;
  if (!/\.(?:[cm]?[jt]sx?|vue|svelte|html?|css|scss|sass|less)$/i.test(source.file)) return void 0;
  const candidate = import_node_path.default.resolve(directory, source.file);
  const [root, file] = await Promise.all([
    (0, import_promises.realpath)(directory).catch(() => void 0),
    (0, import_promises.realpath)(candidate).catch(() => void 0)
  ]);
  if (!root || !file) return void 0;
  const relative = import_node_path.default.relative(root, file);
  if (!relative || import_node_path.default.isAbsolute(relative) || relative.split(import_node_path.default.sep).includes("..")) return void 0;
  if (relative.split(import_node_path.default.sep).some((part) => part === "node_modules" || part === ".git")) return void 0;
  const info = await (0, import_promises.stat)(file).catch(() => void 0);
  if (!info?.isFile()) return void 0;
  return { file: relative.split(import_node_path.default.sep).join("/"), ...await coordinates(file, source, info.size) };
}
function capture(position2) {
  const root = document.documentElement;
  if (root.scrollHeight > innerHeight && root.clientWidth === innerWidth) {
    root.style.setProperty("scrollbar-gutter", "stable");
  }
  const node = document.elementFromPoint(position2.x * innerWidth, position2.y * innerHeight);
  if (!(node instanceof Element)) return void 0;
  const label = (element) => {
    const tag = element.tagName.toLowerCase();
    if (element.id) return `${tag}#${CSS.escape(element.id.slice(0, 120))}`;
    const classes = [...element.classList].slice(0, 3).map((item) => `.${CSS.escape(item.slice(0, 60))}`);
    return `${tag}${classes.join("")}`;
  };
  const locator = (element) => {
    if (element.id && element.id.length <= 180) {
      const selector2 = `#${CSS.escape(element.id)}`;
      if (document.querySelectorAll(selector2).length === 1) return selector2;
    }
    for (const name of ["data-testid", "data-test", "data-cy", "aria-label"]) {
      const value = element.getAttribute(name);
      if (!value || value.length > 160) continue;
      const selector2 = `${element.tagName.toLowerCase()}[${name}="${CSS.escape(value)}"]`;
      if (document.querySelectorAll(selector2).length === 1) return selector2;
    }
    return void 0;
  };
  const selector = () => {
    const direct = locator(node);
    if (direct) return direct;
    const path2 = [];
    let current = node;
    while (current && path2.length < 128) {
      const anchor = locator(current);
      if (anchor) {
        path2.unshift(anchor);
        const value2 = path2.join(" > ");
        return value2.length <= 2048 && document.querySelectorAll(value2).length === 1 ? value2 : void 0;
      }
      const tag = current.tagName.toLowerCase();
      const siblings = current.parentElement ? [...current.parentElement.children].filter((item) => item.tagName === current?.tagName) : [];
      path2.unshift(`${tag}${siblings.length > 1 ? `:nth-of-type(${siblings.indexOf(current) + 1})` : ""}`);
      const value = path2.join(" > ");
      if (value.length > 2048) return void 0;
      if (document.querySelectorAll(value).length === 1) return value;
      current = current.parentElement;
    }
    return void 0;
  };
  const identity = selector();
  if (!identity) return void 0;
  const rect = node.getBoundingClientRect();
  const left = Math.max(0, Math.min(innerWidth, rect.left));
  const top = Math.max(0, Math.min(innerHeight, rect.top));
  const right = Math.max(left, Math.min(innerWidth, rect.right));
  const bottom = Math.max(top, Math.min(innerHeight, rect.bottom));
  const result = {
    tag: node.tagName.toLowerCase(),
    id: node.id.slice(0, 120) || void 0,
    classes: node.getAttribute("class")?.trim().slice(0, 180) || void 0,
    selector: identity,
    rect: {
      x: left / innerWidth,
      y: top / innerHeight,
      width: (right - left) / innerWidth,
      height: (bottom - top) / innerHeight
    }
  };
  if (position2.detail === false) return result;
  const ancestry = [];
  let parent = node;
  while (parent && ancestry.length < 6) {
    ancestry.unshift(parent);
    parent = parent.parentElement;
  }
  const hidden = (element) => {
    if (element.matches(
      "script,style,noscript,template,input,textarea,select,[hidden],[aria-hidden=true],[contenteditable]:not([contenteditable=false])"
    )) {
      return true;
    }
    const style = getComputedStyle(element);
    return style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse" || style.opacity === "0" || style.contentVisibility === "hidden";
  };
  const content = () => {
    const editable = node.closest("input,textarea,select,[contenteditable]:not([contenteditable=false])");
    if (editable) return editable.getAttribute("aria-label")?.slice(0, 180);
    const pending = [];
    let current = node.firstChild;
    let visits = 0;
    let value = "";
    while (current && visits++ < 256 && value.length < 180) {
      if (current instanceof Element && !hidden(current) && current.firstChild) {
        if (current.nextSibling) pending.push(current.nextSibling);
        current = current.firstChild;
        continue;
      }
      if (current.nodeType === 3) value += (current.textContent ?? "").replace(/\s+/g, " ").slice(0, 180 - value.length);
      current = current.nextSibling ?? pending.pop() ?? null;
    }
    return value.trim() || void 0;
  };
  const text2 = content();
  const snippet = node.cloneNode(false);
  const allowed = /* @__PURE__ */ new Set([
    "id",
    "class",
    "role",
    "type",
    "name",
    "aria-label",
    "title",
    "data-testid",
    "data-test",
    "data-cy"
  ]);
  for (const attribute of [...snippet.attributes]) {
    if (!allowed.has(attribute.name)) snippet.removeAttribute(attribute.name);
    else snippet.setAttribute(attribute.name, attribute.value.slice(0, 180));
  }
  snippet.textContent = text2 ?? "";
  const styles = getComputedStyle(node);
  const source = () => {
    const file = node.getAttribute("data-source-file");
    if (file) {
      const line = Number(node.getAttribute("data-source-line"));
      const column = Number(node.getAttribute("data-source-column"));
      return {
        file: file.slice(0, 4096),
        line: Number.isInteger(line) && line > 0 ? line : void 0,
        column: Number.isInteger(column) && column > 0 ? column : void 0
      };
    }
    const key4 = Object.keys(node).find(
      (item) => item.startsWith("__reactFiber$") || item.startsWith("__reactInternalInstance$")
    );
    if (!key4) return void 0;
    let fiber = node[key4];
    for (let depth = 0; fiber && depth < 8; depth++) {
      const origin = fiber._debugSource;
      if (origin?.fileName) {
        return { file: origin.fileName.slice(0, 4096), line: origin.lineNumber, column: origin.columnNumber };
      }
      fiber = fiber._debugOwner ?? fiber.return;
    }
    return void 0;
  };
  return {
    ...result,
    text: text2,
    hierarchy: ancestry.map(label),
    html: snippet.outerHTML.slice(0, 800),
    styles: { color: styles.color.slice(0, 80), backgroundColor: styles.backgroundColor.slice(0, 80) },
    source: source()
  };
}

// src/services/browser-automation/browser-runtime.ts
function options(system, port, env = process.env) {
  return {
    chromiumSandbox: true,
    headless: true,
    env: Object.fromEntries(
      Object.entries(env).filter(
        ([key4, value]) => typeof value === "string" && !/proxy/i.test(key4) && !/(TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTH|API[_-]?KEY|ACCESS[_-]?KEY|PRIVATE[_-]?KEY)(_|$)/i.test(key4)
      )
    ),
    args: [
      "--no-proxy-server",
      ...port ? ["--remote-debugging-address=127.0.0.1", `--remote-debugging-port=${port}`] : []
    ],
    ...system ? { channel: "chrome" } : {}
  };
}

// src/services/browser-automation/browser-stream.ts
var import_promises2 = require("node:timers/promises");

// src/shared/browser-stream.ts
var CURSORS = /* @__PURE__ */ new Set([
  "default",
  "none",
  "context-menu",
  "help",
  "pointer",
  "progress",
  "wait",
  "cell",
  "crosshair",
  "text",
  "vertical-text",
  "alias",
  "copy",
  "move",
  "no-drop",
  "not-allowed",
  "grab",
  "grabbing",
  "all-scroll",
  "col-resize",
  "row-resize",
  "n-resize",
  "e-resize",
  "s-resize",
  "w-resize",
  "ne-resize",
  "nw-resize",
  "se-resize",
  "sw-resize",
  "ew-resize",
  "ns-resize",
  "nesw-resize",
  "nwse-resize",
  "zoom-in",
  "zoom-out"
]);
var VIEWPORT_LIMIT = { width: 4096, height: 2160 };
function mergeWheel(current, next) {
  if (current.x !== next.x || current.y !== next.y || current.modifiers !== next.modifiers) return false;
  for (const axis of ["deltaX", "deltaY"]) {
    if (Math.sign(current[axis]) !== Math.sign(next[axis])) return false;
    if (Math.abs(current[axis] + next[axis]) > 1e4) return false;
  }
  current.deltaX += next.deltaX;
  current.deltaY += next.deltaY;
  return true;
}

// src/services/browser-automation/browser-stream.ts
var PAYLOAD2 = 2 * 1024 * 1024;
var TEXT = 64 * 1024;
var SETTLE = 250;
var BINDING = "__kiloCursor";
var WORLD = "kilo-cursor";
var BUTTONS = { left: 1, right: 2, middle: 4 };
var MODIFIERS = [
  { key: "Alt", code: "AltLeft", keyCode: 18, mask: 1 },
  { key: "Control", code: "ControlLeft", keyCode: 17, mask: 2 },
  { key: "Meta", code: "MetaLeft", keyCode: 91, mask: 4 },
  { key: "Shift", code: "ShiftLeft", keyCode: 16, mask: 8 }
];
var EDITING = {
  "4:KeyA": "selectAll",
  "4:KeyZ": "undo",
  "12:KeyZ": "redo",
  "1:Backspace": "deleteWordBackward",
  "1:Delete": "deleteWordForward",
  "4:Backspace": "deleteToBeginningOfLine",
  "1:ArrowLeft": "moveWordLeft",
  "1:ArrowRight": "moveWordRight",
  "4:ArrowLeft": "moveToLeftEndOfLine",
  "4:ArrowRight": "moveToRightEndOfLine",
  "4:ArrowUp": "moveToBeginningOfDocument",
  "4:ArrowDown": "moveToEndOfDocument",
  "9:ArrowLeft": "moveWordLeftAndModifySelection",
  "9:ArrowRight": "moveWordRightAndModifySelection",
  "12:ArrowLeft": "moveToLeftEndOfLineAndModifySelection",
  "12:ArrowRight": "moveToRightEndOfLineAndModifySelection",
  "12:ArrowUp": "moveToBeginningOfDocumentAndModifySelection",
  "12:ArrowDown": "moveToEndOfDocumentAndModifySelection"
};
function range(value, min, max, integer2 = false) {
  return Number.isFinite(value) && value >= min && value <= max && (!integer2 || Number.isSafeInteger(value));
}
function text(value, limit) {
  return typeof value === "string" && value.length <= limit;
}
function dimensions(value) {
  const data = Buffer.from(value, "base64");
  if (data.length < 4 || data.readUInt16BE(0) !== 65496) return;
  for (let offset = 2; offset + 4 <= data.length; ) {
    const marker = data.readUInt16BE(offset);
    if ((marker & 65280) !== 65280 || marker === 65498 || marker === 65497) return;
    const length = data.readUInt16BE(offset + 2);
    if (length < 2 || offset + 2 + length > data.length) return;
    if (marker >= 65472 && marker <= 65487 && ![65476, 65480, 65484].includes(marker)) {
      if (length < 8) return;
      return { width: data.readUInt16BE(offset + 7), height: data.readUInt16BE(offset + 5) };
    }
    offset += length + 2;
  }
}
function position(event) {
  return range(event.x, 0, 1) && range(event.y, 0, 1) && range(event.modifiers, 0, 15, true);
}
function pointer(event) {
  return position(event) && ["move", "down", "up"].includes(event.action) && ["left", "middle", "right"].includes(event.button) && range(event.buttons, 0, 7, true) && range(event.clicks, 0, 3, true);
}
function key(event) {
  return ["down", "up"].includes(event.action) && text(event.key, 64) && event.key.length > 0 && text(event.code, 64) && range(event.keyCode, 0, 255, true) && range(event.modifiers, 0, 15, true) && typeof event.repeat === "boolean" && (event.text === void 0 || text(event.text, 64));
}
function location(event) {
  if (!MODIFIERS.some((modifier) => modifier.key === event.key)) return 0;
  return event.code.endsWith("Right") ? 2 : 1;
}
function valid(event) {
  if (!event || typeof event !== "object") return false;
  switch (event.kind) {
    case "pointer":
      return pointer(event);
    case "wheel":
      return position(event) && range(event.deltaX, -1e4, 1e4) && range(event.deltaY, -1e4, 1e4);
    case "key":
      return key(event);
    case "text":
      return text(event.text, TEXT);
    case "composition":
      return text(event.text, TEXT) && range(event.start, 0, event.text.length, true) && range(event.end, event.start, event.text.length, true);
    case "clipboard":
      return ["copy", "cut", "paste"].includes(event.action);
    case "release":
      return true;
    default:
      return false;
  }
}
function selection(opts) {
  let node = document.activeElement;
  while (node?.shadowRoot?.activeElement) node = node.shadowRoot.activeElement;
  if (node instanceof HTMLIFrameElement || node instanceof HTMLFrameElement) return { focused: false };
  const transfer = () => {
    if (opts.action !== "paste" && node instanceof HTMLInputElement && node.type === "password")
      return { handled: true };
    const data = new DataTransfer();
    if (opts.action === "paste") data.setData("text/plain", opts.text ?? "");
    const allowed = (node ?? document).dispatchEvent(
      new ClipboardEvent(opts.action, { bubbles: true, cancelable: true, composed: true, clipboardData: data })
    );
    if (opts.action === "paste") return { handled: true, text: allowed ? opts.text : void 0 };
    if (allowed) return { handled: false };
    const value2 = data.types.includes("text/plain") ? data.getData("text/plain") : void 0;
    if (value2 !== void 0 && value2.length > opts.limit) throw new Error("Browser selection exceeds the text limit");
    return { handled: true, text: value2 };
  };
  const event = transfer();
  if (event.handled) return { focused: true, text: event.text };
  const field = (node2) => {
    if (node2 instanceof HTMLInputElement && node2.type === "password") return void 0;
    const start = node2.selectionStart;
    const end = node2.selectionEnd;
    if (start === null || end === null || start === end) return void 0;
    if (end - start > opts.limit) throw new Error("Browser selection exceeds the text limit");
    const value2 = node2.value.slice(start, end);
    if (opts.action === "cut" && !node2.readOnly && !node2.disabled) document.execCommand("delete");
    return value2;
  };
  const editable = (node2) => {
    let element = node2 instanceof HTMLElement ? node2 : node2.parentElement;
    if (!element?.isContentEditable) return void 0;
    while (element.parentElement?.isContentEditable) element = element.parentElement;
    return element;
  };
  const remove = (range2) => {
    const root = editable(range2.startContainer);
    if (!root || root !== editable(range2.endContainer)) return;
    const nodes = root.querySelectorAll('[contenteditable="false"], input, textarea');
    if ([...nodes].some((node2) => range2.intersectsNode(node2))) return;
    document.execCommand("delete");
  };
  if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) {
    return { focused: true, text: field(node) };
  }
  const value = document.getSelection();
  if (!value || value.isCollapsed || value.rangeCount !== 1) return { focused: true };
  const result = value.toString();
  if (result.length > opts.limit) throw new Error("Browser selection exceeds the text limit");
  if (opts.action === "cut") remove(value.getRangeAt(0));
  return { focused: true, text: result };
}
function kept(current, next) {
  return !!current && next.active && next.width === current.width && next.height === current.height && next.scale === current.scale;
}
function reporter(name, epoch, keywords) {
  const globals = globalThis;
  const cleanup2 = `${name}Cleanup`;
  const previous = globals[cleanup2];
  if (typeof previous === "function") previous();
  const report = globals[name];
  if (typeof report !== "function") return;
  const fields = ["text", "search", "email", "url", "tel", "password", "number"];
  const resolve = (event2, node = event2.composedPath()[0]) => {
    if (!(node instanceof Element)) return "default";
    const style = getComputedStyle(node);
    const keyword = style.cursor.slice(style.cursor.lastIndexOf(",") + 1).trim();
    if (keyword !== "auto") return keywords.includes(keyword) ? keyword : "default";
    if (node instanceof HTMLTextAreaElement) return node.disabled ? "default" : "text";
    if (node instanceof HTMLElement && node.isContentEditable) return "text";
    if (node instanceof HTMLInputElement) return !node.disabled && fields.includes(node.type) ? "text" : "default";
    if (node.closest("button, select")) return "default";
    if (style.userSelect === "none") return "default";
    const caret = document.caretRangeFromPoint?.(event2.clientX, event2.clientY);
    const text2 = caret?.startContainer;
    if (!caret || !(text2 instanceof Text) || !text2.length) return "default";
    const range2 = document.createRange();
    range2.setStart(text2, Math.max(0, caret.startOffset - 1));
    range2.setEnd(text2, Math.min(text2.length, caret.startOffset + 1));
    return [...range2.getClientRects()].some(
      (rect) => event2.clientX >= rect.left && event2.clientX <= rect.right && event2.clientY >= rect.top && event2.clientY <= rect.bottom
    ) ? "text" : "default";
  };
  let last = "";
  const emit = (value) => {
    if (value === last) return;
    last = value;
    report(`${epoch}:${value}`);
  };
  const event = typeof PointerEvent === "undefined" ? "mousemove" : "pointermove";
  const enter = event === "pointermove" ? "pointerover" : "mouseover";
  const presses = event === "pointermove" ? ["pointerdown", "pointerup", "pointercancel"] : ["mousedown", "mouseup"];
  let scheduled = 0;
  const move = (event2) => {
    if (event2.type === enter) last = "";
    emit(resolve(event2));
  };
  const press = (event2) => {
    const node = event2.composedPath()[0];
    cancelAnimationFrame(scheduled);
    scheduled = requestAnimationFrame(() => {
      scheduled = 0;
      emit(
        resolve(
          event2,
          node instanceof Element && node.isConnected ? node : document.elementFromPoint(event2.clientX, event2.clientY)
        )
      );
    });
  };
  const leave = () => {
    cancelAnimationFrame(scheduled);
    scheduled = 0;
    emit("default");
  };
  addEventListener(event, move, { capture: true, passive: true });
  addEventListener(enter, move, { capture: true, passive: true });
  for (const event2 of presses) addEventListener(event2, press, { capture: true, passive: true });
  document.addEventListener("mouseleave", leave, { passive: true });
  globals[cleanup2] = () => {
    cancelAnimationFrame(scheduled);
    removeEventListener(event, move, true);
    removeEventListener(enter, move, true);
    for (const event2 of presses) removeEventListener(event2, press, true);
    document.removeEventListener("mouseleave", leave);
    delete globals[cleanup2];
  };
}
var BrowserStream = class {
  constructor(page, identity, emit, log, cursor) {
    this.page = page;
    this.identity = identity;
    this.emit = emit;
    this.log = log;
    this.cursor = cursor;
    this.scope = { ...identity() };
    page.on("close", this.ended);
  }
  page;
  identity;
  emit;
  log;
  cursor;
  session;
  view;
  casting;
  scope;
  epoch = 0;
  sequence = 0;
  outstanding;
  buffered;
  pending = Promise.resolve();
  cancel;
  wheel;
  closing;
  closed = false;
  started = false;
  buttons = 0;
  modifiers = 0;
  x = 0;
  y = 0;
  composing = false;
  keys = /* @__PURE__ */ new Map();
  contexts = /* @__PURE__ */ new Set();
  reporter = Promise.resolve();
  script;
  keyword;
  async configure(view) {
    if (this.closed) return;
    if (!view || !range(view.width, Number.MIN_VALUE, Number.MAX_VALUE) || !range(view.height, Number.MIN_VALUE, Number.MAX_VALUE) || view.scale !== void 0 && !range(view.scale, Number.MIN_VALUE, Number.MAX_VALUE) || !range(view.revision, 0, Number.MAX_SAFE_INTEGER, true) || typeof view.active !== "boolean") {
      throw new Error("Invalid browser viewport");
    }
    const current = this.view;
    const suspend = current && current.active && !view.active && view.revision === current.revision;
    if (current && view.revision <= current.revision && !suspend) return;
    const width = Math.max(32, Math.min(VIEWPORT_LIMIT.width, Math.round(view.width)));
    const height = Math.max(32, Math.min(VIEWPORT_LIMIT.height, Math.round(view.height)));
    const next = suspend ? { ...current, active: false } : {
      width,
      height,
      scale: Math.max(
        1,
        Math.min(view.scale ?? 1, 2, VIEWPORT_LIMIT.width / width, VIEWPORT_LIMIT.height / height)
      ),
      revision: view.revision,
      active: view.active
    };
    this.view = next;
    this.reset();
    if (this.casting === current && kept(current, next)) {
      this.casting = next;
      await this.install();
      return;
    }
    await this.serial(async () => {
      if (this.closed || this.view !== next) return;
      const session = await this.connect();
      if (this.closed || this.view !== next) return;
      await this.stop();
      await this.release();
      if (this.closed || this.view !== next || suspend) return;
      await this.page.setViewportSize({ width: next.width, height: next.height });
      if (this.closed || this.view !== next || !next.active) return;
      const abort = new AbortController();
      await Promise.race([
        this.page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())))).catch(() => this.report("resize wait failed")),
        (0, import_promises2.setTimeout)(SETTLE, void 0, { signal: abort.signal }).catch(() => void 0)
      ]);
      abort.abort();
      if (this.closed || this.view !== next) return;
      await session.send("Emulation.setVisibleSize", { width: next.width, height: next.height }).catch(() => this.report("visible size failed"));
      if (this.closed || this.view !== next) return;
      this.casting = next;
      this.started = true;
      await session.send("Page.startScreencast", {
        format: "jpeg",
        quality: 90,
        maxWidth: Math.round(next.width * (next.scale ?? 1)),
        maxHeight: Math.round(next.height * (next.scale ?? 1)),
        everyNthFrame: 1
      });
      await this.install();
    }).catch((error) => {
      this.casting = void 0;
      if (!this.closed) throw error;
    });
  }
  acknowledge(sequence) {
    if (this.closed || !range(sequence, 1, Number.MAX_SAFE_INTEGER, true)) return;
    this.synchronize();
    if (this.outstanding !== sequence) return;
    this.outstanding = void 0;
    const frame = this.buffered;
    this.buffered = void 0;
    if (frame) this.deliver(frame);
  }
  async interact(event, read2, write) {
    if (this.closed) return;
    if (!valid(event)) throw new Error("Invalid browser interaction");
    const input = { ...event };
    this.synchronize();
    const queued = this.coalesce(input);
    if (queued) return queued;
    const epoch = this.epoch;
    const view = this.view;
    const result = this.serial(async () => {
      if (this.wheel?.event === input) this.wheel = void 0;
      if (this.closed) return;
      this.synchronize();
      if (input.kind === "release") {
        await this.release();
        return;
      }
      if (epoch !== this.epoch || !view?.active || this.view !== view || this.casting !== view) return;
      const session = this.session;
      if (!session) return;
      switch (input.kind) {
        case "pointer":
          await this.point(session, input, view);
          return;
        case "wheel":
          this.coordinates(input, view);
          this.dispatch(
            session.send("Input.dispatchMouseEvent", {
              type: "mouseWheel",
              x: this.x,
              y: this.y,
              modifiers: this.modifiers,
              buttons: this.buttons,
              deltaX: input.deltaX,
              deltaY: input.deltaY
            })
          );
          return;
        case "key":
          await this.keyboard(session, input);
          return;
        case "text":
          await session.send("Input.insertText", { text: input.text });
          this.composing = false;
          return;
        case "composition":
          this.composing = input.text.length > 0;
          await session.send("Input.imeSetComposition", {
            text: input.text,
            selectionStart: input.start,
            selectionEnd: input.end
          });
          return;
        case "clipboard":
          if (input.action === "paste") {
            await this.paste(read2, epoch);
            return;
          }
          return this.clipboard(input.action, epoch, void 0, write);
      }
    }).catch((error) => {
      if (!this.closed) throw error;
      return void 0;
    });
    if (input.kind === "wheel") this.wheel = { event: input, result };
    return result;
  }
  async paste(read2, epoch) {
    if (!read2) throw new Error("Clipboard access is not available.");
    const value = await this.cancellable(read2);
    this.synchronize();
    if (value === void 0 || this.closed || epoch !== this.epoch) return;
    if (!text(value, TEXT)) throw new Error("Browser clipboard exceeds the text limit");
    const pasted = await this.clipboard("paste", epoch, value);
    this.synchronize();
    if (pasted === void 0 || this.closed || epoch !== this.epoch) return;
    await this.session?.send("Input.insertText", { text: pasted });
    this.composing = false;
  }
  async cancellable(run) {
    const stopped = Promise.withResolvers();
    const cancel = () => stopped.resolve(void 0);
    this.cancel = cancel;
    try {
      return await Promise.race([run(), stopped.promise]);
    } finally {
      if (this.cancel === cancel) this.cancel = void 0;
    }
  }
  coalesce(event) {
    const queued = this.wheel;
    this.wheel = void 0;
    if (event.kind !== "wheel" || !queued || !mergeWheel(queued.event, event)) return;
    this.wheel = queued;
    return queued.result;
  }
  // Runs a page operation that must not overlap viewport changes or input.
  exclusive(run) {
    return this.serial(run);
  }
  close() {
    if (this.closing) return this.closing;
    this.closed = true;
    this.reset();
    this.page.off("close", this.ended);
    this.closing = this.serial(async () => {
      await this.release();
      const session = this.session;
      if (!session) return;
      await this.stop().catch(() => this.report("stop failed"));
      await this.reporter;
      if (this.script) {
        await session.send("Page.removeScriptToEvaluateOnNewDocument", { identifier: this.script }).catch(() => this.report("cursor script removal failed"));
        this.script = void 0;
      }
      await Promise.all(
        [...this.contexts].map(
          (contextId) => session.send("Runtime.evaluate", {
            contextId,
            expression: `globalThis.${BINDING}Cleanup?.(); delete globalThis.${BINDING}`
          }).catch(() => this.report("cursor listener removal failed"))
        )
      );
      if (this.cursor)
        await session.send("Runtime.removeBinding", { name: BINDING }).catch(() => this.report("cursor binding removal failed"));
      session.off("Page.screencastFrame", this.receive);
      session.off("Page.frameNavigated", this.navigated);
      session.off("Runtime.bindingCalled", this.pointed);
      session.off("Runtime.executionContextCreated", this.created);
      session.off("Runtime.executionContextDestroyed", this.destroyed);
      session.off("Runtime.executionContextsCleared", this.cleared);
      this.contexts.clear();
      this.session = void 0;
      await session.detach().catch(() => this.report("detach failed"));
    });
    return this.closing;
  }
  ended = () => {
    void this.close().catch(() => this.report("close failed"));
  };
  // Only a new main-frame document releases held input. Same-document navigations, such as pushState, keep it.
  navigated = (event) => {
    if (this.closed || event.frame.parentId) return;
    this.synchronize();
    this.reset();
    void this.install();
    void this.serial(() => this.release()).catch(() => this.report("navigation release failed"));
  };
  serial(run) {
    const result = this.pending.then(run);
    this.pending = result.then(
      () => void 0,
      () => void 0
    );
    return result;
  }
  report(message) {
    this.log(`[Dustcode] Browser stream ${message}`);
  }
  reset() {
    this.epoch++;
    this.cancel?.();
    this.cancel = void 0;
    this.wheel = void 0;
    this.outstanding = void 0;
    this.buffered = void 0;
    this.keyword = void 0;
  }
  synchronize() {
    const scope2 = this.identity();
    if (scope2.browserId === this.scope.browserId && scope2.navigation === this.scope.navigation) return;
    this.scope = { ...scope2 };
    this.reset();
  }
  async connect() {
    if (this.session) return this.session;
    const session = await this.page.context().newCDPSession(this.page);
    this.session = session;
    session.on("Page.screencastFrame", this.receive);
    session.on("Page.frameNavigated", this.navigated);
    if (!this.closed) await session.send("Page.enable");
    if (!this.closed && this.cursor) {
      session.on("Runtime.bindingCalled", this.pointed);
      session.on("Runtime.executionContextCreated", this.created);
      session.on("Runtime.executionContextDestroyed", this.destroyed);
      session.on("Runtime.executionContextsCleared", this.cleared);
      await session.send("Runtime.enable").then(() => session.send("Runtime.addBinding", { name: BINDING, executionContextName: WORLD })).catch(() => this.report("cursor binding setup failed"));
    }
    return session;
  }
  created = (event) => {
    if (event.context.name === WORLD) this.contexts.add(event.context.id);
  };
  destroyed = (event) => {
    this.contexts.delete(event.executionContextId);
  };
  cleared = () => {
    this.contexts.clear();
  };
  install() {
    if (!this.cursor || this.closed || !this.session) return Promise.resolve();
    this.synchronize();
    const view = this.view;
    const epoch = this.epoch;
    this.reporter = this.reporter.then(async () => {
      const session = this.session;
      if (this.closed || !session || !view?.active || this.view !== view || this.epoch !== epoch) return;
      if (this.script) await session.send("Page.removeScriptToEvaluateOnNewDocument", { identifier: this.script });
      const result = await session.send("Page.addScriptToEvaluateOnNewDocument", {
        source: `(${reporter.toString()})(${JSON.stringify(BINDING)}, ${epoch}, ${JSON.stringify([...CURSORS])})`,
        worldName: WORLD,
        runImmediately: true
      });
      this.script = result.identifier;
    }).catch(() => this.report("cursor reporter setup failed"));
    return this.reporter;
  }
  pointed = (event) => {
    if (this.closed || event.name !== BINDING || !this.contexts.has(event.executionContextId)) return;
    this.synchronize();
    const view = this.casting;
    if (!view?.active || this.view !== view || typeof event.payload !== "string" || event.payload.length > 64) return;
    const prefix = `${this.epoch}:`;
    if (!event.payload.startsWith(prefix)) return;
    const cursor = event.payload.slice(prefix.length);
    if (!CURSORS.has(cursor) || cursor === this.keyword) return;
    this.keyword = cursor;
    this.cursor?.({ ...this.scope, revision: view.revision, cursor });
  };
  async stop() {
    this.casting = void 0;
    if (!this.started || !this.session) return;
    this.started = false;
    await this.session.send("Page.stopScreencast");
  }
  receive = (event) => {
    const session = this.session;
    if (!session) return;
    void session.send("Page.screencastFrameAck", { sessionId: event.sessionId }).catch(() => {
      if (!this.closed) this.report("frame acknowledgement failed");
    });
    const view = this.casting;
    if (this.closed || !view || this.view !== view) return;
    this.synchronize();
    if (typeof event.data !== "string" || !event.data.length || event.data.length > Math.ceil(PAYLOAD2 / 3) * 4 || Buffer.byteLength(event.data, "base64") > PAYLOAD2 || event.metadata.deviceWidth !== view.width || event.metadata.deviceHeight !== view.height)
      return;
    const size = dimensions(event.data);
    if (!size || !size.width || !size.height || Math.abs(size.width - Math.round(view.width * (view.scale ?? 1))) > 1 || Math.abs(size.height - Math.round(view.height * (view.scale ?? 1))) > 1)
      return;
    const frame = {
      ...this.scope,
      revision: view.revision,
      sequence: ++this.sequence,
      width: size.width,
      height: size.height,
      data: event.data
    };
    if (this.outstanding !== void 0) {
      this.buffered = frame;
      return;
    }
    this.deliver(frame);
  };
  deliver(frame) {
    this.outstanding = frame.sequence;
    try {
      this.emit(frame);
    } catch {
      if (this.outstanding === frame.sequence) this.outstanding = void 0;
      this.report("frame delivery failed");
    }
  }
  coordinates(event, view) {
    this.x = Math.min(view.width - 1, event.x * view.width);
    this.y = Math.min(view.height - 1, event.y * view.height);
    this.modifiers = event.modifiers;
  }
  async point(session, event, view) {
    this.coordinates(event, view);
    this.buttons |= event.buttons;
    if (event.action === "down") this.buttons |= BUTTONS[event.button];
    if (event.action === "up") this.buttons &= ~BUTTONS[event.button];
    const sent = session.send("Input.dispatchMouseEvent", {
      type: event.action === "move" ? "mouseMoved" : event.action === "down" ? "mousePressed" : "mouseReleased",
      x: this.x,
      y: this.y,
      button: event.action === "move" && !this.buttons ? "none" : event.button,
      buttons: this.buttons,
      clickCount: event.clicks,
      modifiers: this.modifiers
    });
    if (event.action === "move") return this.dispatch(sent);
    await sent;
  }
  // Chrome answers a mouse move or wheel event only after the page renders the next frame. Waiting for that answer
  // limits input to the frame rate, so input from a display with a higher refresh rate lags more and more. CDP keeps
  // the event order, and Chrome merges these events while the page is busy, so they do not wait for the answer.
  dispatch(sent) {
    void sent.catch(() => {
      if (!this.closed) this.report("mouse input failed");
    });
  }
  async clipboard(action, epoch, value, write) {
    let frame = this.page.mainFrame();
    while (!this.closed) {
      this.synchronize();
      if (this.epoch !== epoch) return;
      const result = await frame.evaluate(selection, { action, limit: TEXT, text: value });
      this.synchronize();
      if (this.closed || this.epoch !== epoch) return;
      if (result.focused) {
        const copied = result.text;
        if (copied !== void 0 && !text(copied, TEXT)) throw new Error("Browser selection exceeds the text limit");
        if (copied === void 0 || !write) return copied;
        await this.cancellable(() => write(copied));
        this.synchronize();
        if (this.closed || epoch !== this.epoch) return;
        return copied;
      }
      const handle = await frame.evaluateHandle(() => {
        let node = document.activeElement;
        while (node?.shadowRoot?.activeElement) node = node.shadowRoot.activeElement;
        return node;
      });
      const child = await (handle.asElement()?.contentFrame() ?? Promise.resolve(null)).finally(() => handle.dispose());
      if (!child) return;
      frame = child;
    }
  }
  async keyboard(session, event) {
    const id = event.code || event.key;
    if (event.action === "down") {
      if (this.keys.size >= 256 && !this.keys.has(id)) throw new Error("Too many pressed browser keys");
      this.keys.set(id, event);
    }
    if (event.action === "up") this.keys.delete(id);
    this.modifiers = event.modifiers;
    const enter = event.key === "Enter" && !(event.modifiers & 7);
    const value = event.action === "down" ? event.text ?? (enter ? "\r" : void 0) : void 0;
    const command = process.platform === "darwin" ? EDITING[`${event.modifiers}:${event.code}`] : void 0;
    await session.send("Input.dispatchKeyEvent", {
      type: event.action === "up" ? "keyUp" : value ? "keyDown" : "rawKeyDown",
      key: event.key,
      code: event.code,
      windowsVirtualKeyCode: event.keyCode,
      modifiers: event.modifiers,
      autoRepeat: event.repeat,
      location: location(event),
      isKeypad: event.code.startsWith("Numpad"),
      text: value,
      unmodifiedText: value,
      commands: event.action === "down" && command ? [command] : void 0
    });
  }
  async release() {
    const session = this.session;
    if (!session) return;
    for (const button of ["left", "middle", "right"]) {
      if (!(this.buttons & BUTTONS[button])) continue;
      this.buttons &= ~BUTTONS[button];
      await session.send("Input.dispatchMouseEvent", {
        type: "mouseReleased",
        x: this.x,
        y: this.y,
        button,
        buttons: this.buttons,
        modifiers: this.modifiers,
        clickCount: 1
      }).catch(() => this.report("mouse release failed"));
    }
    for (const modifier of MODIFIERS) {
      if (!(this.modifiers & modifier.mask) || [...this.keys.values()].some((key4) => key4.key === modifier.key)) continue;
      this.keys.set(modifier.code, { ...modifier, kind: "key", action: "up", modifiers: 0, repeat: false });
    }
    const keys = [...this.keys.values()];
    this.keys.clear();
    for (const key4 of keys) {
      this.modifiers &= ~(MODIFIERS.find((modifier) => modifier.key === key4.key)?.mask ?? 0);
      await session.send("Input.dispatchKeyEvent", {
        type: "keyUp",
        key: key4.key,
        code: key4.code,
        windowsVirtualKeyCode: key4.keyCode,
        modifiers: this.modifiers,
        location: location(key4),
        isKeypad: key4.code.startsWith("Numpad")
      }).catch(() => this.report("key release failed"));
    }
    this.modifiers = 0;
    if (!this.composing) return;
    this.composing = false;
    await session.send("Input.imeSetComposition", { text: "", selectionStart: 0, selectionEnd: 0 }).catch(() => this.report("composition release failed"));
  }
};

// src/services/browser-automation/browser-network.ts
var guards = /* @__PURE__ */ new WeakMap();
var Guard = class _Guard {
  constructor(browser, session) {
    this.browser = browser;
    this.session = session;
    session.on("Fetch.requestPaused", this.request);
    session.on("Fetch.authRequired", this.request);
    session.on("Inspector.detached", this.lost);
    browser.on("disconnected", this.lost);
  }
  browser;
  session;
  owners = /* @__PURE__ */ new Map();
  pending = /* @__PURE__ */ new Map();
  send = (method, params) => this.session.send(method, params).catch((error) => {
    if (!(error instanceof Error && error.message.includes("Invalid InterceptionId"))) this.lost();
    throw error;
  });
  closed = false;
  static async acquire(browser) {
    const existing = guards.get(browser);
    if (existing) return existing;
    const pending = (async () => {
      const session = await browser.newBrowserCDPSession();
      const guard = new _Guard(browser, session);
      try {
        await session.send("Fetch.enable", {
          patterns: [{ urlPattern: "*", requestStage: "Request" }],
          handleAuthRequests: true
        });
        return guard;
      } catch (error) {
        guard.lost();
        throw error;
      }
    })();
    guards.set(browser, pending);
    try {
      return await pending;
    } catch (error) {
      if (guards.get(browser) === pending) guards.delete(browser);
      throw error;
    }
  }
  bind(context, owner) {
    if (this.closed || this.owners.has(context)) throw new Error("Browser context network ownership is unavailable");
    this.owners.set(context, owner);
    return async () => {
      if (this.owners.get(context) === owner) this.owners.delete(context);
      await Promise.all(
        [...this.pending].filter(([, paused]) => paused.owner === owner).map(async ([id, paused]) => {
          this.pending.delete(id);
          await this.cancel(id, paused.auth);
        })
      );
    };
  }
  request = (event) => {
    const auth = "authChallenge" in event;
    const owner = [...this.owners.values()].find((owner2) => owner2.frames.has(event.frameId));
    if (this.closed || !owner?.active()) {
      void this.cancel(event.requestId, auth);
      return;
    }
    const paused = { owner, auth };
    this.pending.set(event.requestId, paused);
    const operation = auth ? owner.authenticate(event, this.send) : owner.request(event, this.send);
    void operation.catch(() => this.lost()).finally(() => {
      if (this.pending.get(event.requestId) === paused) this.pending.delete(event.requestId);
    });
  };
  async cancel(requestId, auth) {
    const operation = auth ? this.session.send("Fetch.continueWithAuth", { requestId, authChallengeResponse: { response: "CancelAuth" } }) : this.session.send("Fetch.failRequest", { requestId, errorReason: "BlockedByClient" });
    await operation.catch((error) => {
      if (error instanceof Error && error.message.includes("Invalid InterceptionId")) return;
      this.lost();
    });
  }
  lost = () => {
    if (this.closed) return;
    this.closed = true;
    const pending = guards.get(this.browser);
    for (const owner of this.owners.values()) owner.fail();
    this.owners.clear();
    const requests = [...this.pending];
    this.pending.clear();
    void Promise.all(requests.map(([id, paused]) => this.cancel(id, paused.auth))).then(() => this.session.detach()).catch(() => this.lost()).finally(() => {
      if (guards.get(this.browser) === pending) guards.delete(this.browser);
      this.session.off("Fetch.requestPaused", this.request);
      this.session.off("Fetch.authRequired", this.request);
      this.session.off("Inspector.detached", this.lost);
      this.browser.off("disconnected", this.lost);
    });
  };
};
var BrowserNetwork = class _BrowserNetwork {
  constructor(page, session, opts) {
    this.page = page;
    this.session = session;
    this.opts = opts;
    this.origins.add(opts.url.origin);
  }
  page;
  session;
  opts;
  origins = /* @__PURE__ */ new Set();
  challenges = /* @__PURE__ */ new Set();
  approvals = /* @__PURE__ */ new Map();
  frames = /* @__PURE__ */ new Map();
  documents = /* @__PURE__ */ new Map();
  send = (method, params) => this.session.send(method, params);
  release;
  stopping;
  sequence = 0;
  root = "";
  closed = false;
  failed = false;
  get active() {
    return !this.closed && !this.failed;
  }
  static async attach(page, opts) {
    const session = await page.context().newCDPSession(page);
    const network = new _BrowserNetwork(page, session, opts);
    session.on("Page.frameNavigated", network.navigated);
    session.on("Page.frameAttached", network.inserted);
    session.on("Page.frameDetached", network.removed);
    session.on("Inspector.detached", network.lost);
    session.on("Target.attachedToTarget", network.attached);
    session.on("Target.receivedMessageFromTarget", network.received);
    session.on("Target.detachedFromTarget", network.detached);
    try {
      const browser = page.context().browser();
      if (!browser) throw new Error("Browser network ownership requires a browser connection");
      const { targetInfo: target } = await session.send("Target.getTargetInfo");
      if (!target.browserContextId) throw new Error("Browser network ownership requires an isolated context");
      await session.send("Page.enable");
      const tree = await session.send("Page.getFrameTree");
      network.root = tree.frameTree.frame.id;
      network.documents.set(network.root, void 0);
      const guard = await Guard.acquire(browser);
      network.release = guard.bind(target.browserContextId, {
        frames: network.documents,
        active: () => network.active,
        request: network.request,
        authenticate: network.authenticate,
        fail: network.lost
      });
      await network.enable(network.send);
      return network;
    } catch (error) {
      await network.close();
      throw error;
    }
  }
  authorize(url) {
    this.origins.add(url.origin);
  }
  async enable(send2) {
    await send2("Page.enable");
    await send2("Network.setCacheDisabled", { cacheDisabled: true });
    await send2("Target.setAutoAttach", {
      autoAttach: true,
      waitForDebuggerOnStart: true,
      flatten: false,
      filter: [{ type: "iframe" }]
    });
  }
  attached = (event, parent) => {
    const pending = /* @__PURE__ */ new Map();
    const upstream = parent ? this.frames.get(parent)?.send : this.send;
    if (!upstream) return this.lost();
    const send2 = (method, params) => {
      const deferred = Promise.withResolvers();
      const id = ++this.sequence;
      pending.set(id, deferred);
      void upstream("Target.sendMessageToTarget", {
        sessionId: event.sessionId,
        message: JSON.stringify({ id, method, params })
      }).catch(deferred.reject);
      return deferred.promise.finally(() => pending.delete(id));
    };
    this.frames.set(event.sessionId, { send: send2, pending, parent });
    void (async () => {
      if (!this.active || event.targetInfo.type !== "iframe") throw new Error("Browser frame is not available");
      await this.enable(send2);
      await send2("Runtime.runIfWaitingForDebugger");
    })().catch((error) => {
      if (!this.active || !this.frames.has(event.sessionId)) return;
      this.opts.log("Browser frame network controls failed", error);
      this.lost();
    });
  };
  received = (event) => {
    const frame = this.frames.get(event.sessionId);
    if (!frame) return;
    const message = JSON.parse(event.message);
    if (message.id !== void 0) {
      const deferred = frame.pending.get(message.id);
      if (message.error) return deferred?.reject(new Error(message.error.message));
      deferred?.resolve(message.result);
      return;
    }
    if (message.method === "Page.frameAttached")
      this.inserted(message.params);
    if (message.method === "Page.frameDetached") this.removed(message.params);
    if (message.method === "Inspector.detached") this.lost();
    if (message.method === "Target.attachedToTarget") this.attached(message.params, event.sessionId);
    if (message.method === "Target.receivedMessageFromTarget") {
      this.received(message.params);
    }
    if (message.method === "Target.detachedFromTarget") this.detached(message.params);
  };
  detached = (event) => {
    const frame = this.frames.get(event.sessionId);
    if (!frame) return;
    this.frames.delete(event.sessionId);
    for (const deferred of frame.pending.values()) deferred.reject(new Error("Browser frame was detached"));
    for (const [id, child] of this.frames) {
      if (child.parent === event.sessionId) this.detached({ sessionId: id });
    }
  };
  inserted = (event) => {
    if (this.documents.has(event.parentFrameId)) this.documents.set(event.frameId, event.parentFrameId);
  };
  removed = (event) => {
    if (event.reason !== "remove") return;
    this.documents.delete(event.frameId);
    for (const [frameId, parent] of this.documents) {
      if (parent === event.frameId) this.removed({ frameId, reason: "remove" });
    }
  };
  navigated = (event) => {
    if (event.frame.parentId) return;
    if (this.root !== event.frame.id) this.removed({ frameId: this.root, reason: "remove" });
    this.root = event.frame.id;
    this.documents.set(this.root, void 0);
    if (this.active) this.opts.committed?.();
  };
  lost = () => {
    if (!this.active) return;
    this.failed = true;
    this.opts.blocked("Browser network controls disconnected. Close and reopen the browser.");
    void this.opts.proxy.close().catch((error) => this.opts.log("Browser proxy close failed", error));
  };
  authenticate = async (event, send2) => {
    const credentials = this.opts.proxy.credentials;
    const challenge = event.authChallenge;
    const allowed = this.active && !this.challenges.has(event.requestId) && challenge.source === "Proxy" && challenge.origin === credentials.origin && challenge.realm === credentials.realm && challenge.scheme.toLowerCase() === "basic";
    this.challenges.add(event.requestId);
    if (this.challenges.size > 256) {
      const first = this.challenges.values().next().value;
      if (first) this.challenges.delete(first);
    }
    await send2("Fetch.continueWithAuth", {
      requestId: event.requestId,
      authChallengeResponse: allowed ? { response: "ProvideCredentials", username: credentials.username, password: credentials.password } : { response: "CancelAuth" }
    }).catch((error) => {
      if (!this.closed) this.opts.log("Browser proxy authentication ended", error);
    });
  };
  request = (event, send2) => {
    return this.continue(event, send2).catch(async (error) => {
      if (!this.closed) this.opts.log("Browser request policy failed", error);
      await this.reject(event.requestId, send2);
    });
  };
  async continue(event, send2) {
    if (!this.active) return this.reject(event.requestId, send2);
    const url = URL.parse(event.request.url);
    if (!url || url.username || url.password) return this.reject(event.requestId, send2);
    if (url.protocol === "data:" || url.protocol === "blob:" || url.protocol === "about:") {
      if (event.resourceType === "Document" && event.frameId === this.root) return this.reject(event.requestId, send2);
      return this.resume(event.requestId, send2);
    }
    if (!this.allowed(url, event.resourceType === "Document")) {
      if (event.resourceType === "Document" && event.frameId === this.root) {
        this.opts.blocked(
          this.opts.url.protocol === "http:" ? "Local browser navigation must stay on the approved origin." : "Remote browser pages must use public HTTPS."
        );
      }
      return this.reject(event.requestId, send2);
    }
    if (event.resourceType !== "Document" || event.frameId !== this.root || this.origins.has(url.origin)) {
      return this.resume(event.requestId, send2);
    }
    const approval = this.approvals.get(url.origin) ?? this.opts.approve(url);
    this.approvals.set(url.origin, approval);
    const allowed = await approval.finally(() => {
      if (this.approvals.get(url.origin) === approval) this.approvals.delete(url.origin);
    });
    if (!this.active) return this.reject(event.requestId, send2);
    if (!allowed) {
      this.opts.blocked(`Navigation to ${url.origin} was not approved.`);
      return this.reject(event.requestId, send2);
    }
    this.origins.add(url.origin);
    return this.resume(event.requestId, send2);
  }
  allowed(url, document2) {
    if (this.opts.url.protocol !== "http:") return url.protocol === "https:" || url.protocol === "wss:";
    const origin = url.protocol === "ws:" ? `http://${url.host}` : url.origin;
    if (["http:", "ws:"].includes(url.protocol) && origin === this.opts.url.origin) return true;
    return !document2 && ["https:", "wss:"].includes(url.protocol);
  }
  async resume(requestId, send2) {
    if (!this.active) return this.reject(requestId, send2);
    await send2("Fetch.continueRequest", { requestId });
  }
  async reject(requestId, send2) {
    await send2("Fetch.failRequest", { requestId, errorReason: "BlockedByClient" }).catch((error) => {
      if (!this.closed) this.opts.log("Browser request already ended", error);
    });
  }
  close() {
    return this.stopping ??= this.stop();
  }
  async stop() {
    if (this.closed) return;
    this.closed = true;
    await this.opts.proxy.close().catch((error) => this.opts.log("Browser proxy close failed", error));
    this.approvals.clear();
    this.challenges.clear();
    this.session.off("Page.frameNavigated", this.navigated);
    this.session.off("Page.frameAttached", this.inserted);
    this.session.off("Page.frameDetached", this.removed);
    this.documents.clear();
    await this.release?.();
    this.release = void 0;
    this.session.off("Inspector.detached", this.lost);
    this.session.off("Target.attachedToTarget", this.attached);
    this.session.off("Target.receivedMessageFromTarget", this.received);
    this.session.off("Target.detachedFromTarget", this.detached);
    for (const sessionId of this.frames.keys()) this.detached({ sessionId });
    if (this.page.isClosed()) return;
    await this.session.send("Target.setAutoAttach", { autoAttach: false, waitForDebuggerOnStart: false, flatten: false }).catch((error) => {
      if (!this.page.isClosed()) this.opts.log("Browser frame network controls ended", error);
    });
    if (this.page.isClosed()) return;
    await this.session.detach().catch((error) => {
      if (!this.page.isClosed()) this.opts.log("Browser network session ended", error);
    });
  }
};

// ../kilo-sandbox/src/destination.ts
var import_node_net = require("node:net");
var import_node_url2 = require("node:url");
var import_ipaddr = __toESM(require_ipaddr(), 1);
function invalid(input) {
  return new TypeError(`Invalid sandbox network destination: ${JSON.stringify(input)}`);
}
function hostname(input) {
  if (input.length === 0 || input.length > 253 || (0, import_node_net.isIP)(input) !== 0 || /^[0-9.]+$/.test(input)) throw invalid(input);
  const host = (0, import_node_url2.domainToASCII)(input.toLowerCase());
  if (!host || host.length > 253) throw invalid(input);
  const labels = host.split(".");
  if (labels.some(
    (label) => label.length === 0 || label.length > 63 || label.startsWith("-") || label.endsWith("-") || !/^[a-z0-9-]+$/.test(label)
  )) {
    throw invalid(input);
  }
  return host;
}
function parseDestination(input, defaultPort = 443) {
  if (input !== input.trim() || /[\u0000-\u0020\u007f/@?#*]/.test(input)) throw invalid(input);
  const colon = input.lastIndexOf(":");
  const hasPort = colon > -1;
  const value = hasPort ? input.slice(0, colon) : input;
  const raw = value.endsWith(".") ? value.slice(0, -1) : value;
  const text2 = hasPort ? input.slice(colon + 1) : String(defaultPort);
  if (!/^\d+$/.test(text2)) throw invalid(input);
  const port = Number(text2);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw invalid(input);
  const host = hostname(raw);
  return { host, port, authority: `${host}:${port}` };
}
function isPublicAddress(input) {
  if (!import_ipaddr.default.isValid(input)) return false;
  const address = import_ipaddr.default.parse(input);
  if (address.kind() === "ipv6") {
    const ipv6 = address;
    if (ipv6.isIPv4MappedAddress() || ipv6.match(import_ipaddr.default.IPv6.parse("::"), 96)) return false;
  }
  return address.range() === "unicast";
}

// src/services/browser-automation/browser-proxy.ts
var import_node_crypto2 = require("node:crypto");
var import_promises3 = require("node:dns/promises");
var import_node_events = require("node:events");
var import_node_http2 = require("node:http");
var import_node_net3 = require("node:net");

// src/services/browser-automation/browser-policy.ts
var import_node_net2 = require("node:net");
function parse(value) {
  if (value !== value.trim() || /[\u0000-\u001f\u007f\\]/.test(value) || !/^https?:\/\//i.test(value)) {
    throw new TypeError("Browser URL is invalid");
  }
  const url = new URL(value);
  if (url.port === "0") throw new TypeError("Browser URL port is invalid");
  if (url.username || url.password || /^https?:\/\/[^/?#]*@/i.test(value)) {
    throw new TypeError("Browser URLs must not contain credentials");
  }
  if (url.protocol === "http:" && url.hostname === "0.0.0.0") url.hostname = "localhost";
  if (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)) {
    return url;
  }
  if (url.protocol !== "https:") {
    throw new TypeError("Browser URLs must use public HTTPS or HTTP localhost/127.0.0.1");
  }
  const host = url.hostname.startsWith("[") ? url.hostname.slice(1, -1) : url.hostname;
  if ((0, import_node_net2.isIP)(host)) {
    if (!isPublicAddress(host)) throw new TypeError("Browser HTTPS destinations must be public");
    return url;
  }
  const dest = parseDestination(url.host);
  if (dest.host === "localhost" || dest.host.endsWith(".localhost")) {
    throw new TypeError("Browser HTTPS destinations must be public");
  }
  url.hostname = dest.host;
  return url;
}

// src/services/browser-automation/browser-proxy.ts
var LIMIT = 16 * 1024;
var UNREACHABLE = "x-kilo-browser-unreachable";
var Unreachable = class extends Error {
};
function authority(value, scheme) {
  if (!/^(?:\[[\da-f:]+\]|[^\s:/?#@\\]+):\d+$/i.test(value)) {
    throw new TypeError("Invalid proxy authority");
  }
  return parse(`${scheme}://${value}/`);
}
function headers(input, host) {
  const blocked = /* @__PURE__ */ new Set([
    "connection",
    "proxy-connection",
    "proxy-authorization",
    "proxy-authenticate",
    "keep-alive",
    "transfer-encoding",
    "te",
    "trailer",
    "upgrade",
    ...(input.connection ?? "").split(",").map((value) => value.trim().toLowerCase())
  ]);
  return {
    ...Object.fromEntries(
      Object.entries(input).filter(([name, value]) => value !== void 0 && !blocked.has(name.toLowerCase()))
    ),
    ...host ? { host } : {}
  };
}
function local(request2, url) {
  const fields = request2.headers;
  if (fields.origin !== void 0 && fields.origin !== url.origin) {
    throw new Error("Local browser request origin is not approved");
  }
  if (fields["sec-fetch-site"] === "same-origin") return;
  if (fields["sec-fetch-site"] === "none" && fields["sec-fetch-mode"] === "navigate" && fields["sec-fetch-dest"] === "document" && ["GET", "HEAD"].includes(request2.method ?? ""))
    return;
  throw new Error("Local browser request requires an approved document origin");
}
function websocket(input) {
  return input.upgrade?.toLowerCase() === "websocket" && input.connection?.split(",").some((value) => value.trim().toLowerCase() === "upgrade") === true;
}
function key2(input) {
  const value = input["sec-websocket-key"];
  if (!websocket(input) || input["sec-websocket-version"] !== "13" || typeof value !== "string" || !/^[A-Za-z0-9+/]{22}==$/.test(value) || Buffer.from(value, "base64").length !== 16 || input["content-length"] !== void 0 || input["transfer-encoding"] !== void 0) {
    throw new TypeError("Invalid WebSocket upgrade");
  }
  return value;
}
function opening(input, url) {
  const end = input.indexOf("\r\n\r\n");
  if (end < 0) return false;
  if (end + 4 !== input.length) throw new TypeError("Unexpected WebSocket handshake data");
  const lines = input.subarray(0, end).toString("latin1").split("\r\n");
  const line = /^GET (\/[^\s#]*) HTTP\/1\.1$/.exec(lines.shift() ?? "");
  if (!line || parse(`${url.origin}${line[1]}`).origin !== url.origin) {
    throw new TypeError("Invalid WebSocket request");
  }
  const fields = /* @__PURE__ */ Object.create(null);
  for (const line2 of lines) {
    const colon = line2.indexOf(":");
    const name = line2.slice(0, colon).toLowerCase();
    const value = line2.slice(colon + 1);
    (0, import_node_http2.validateHeaderName)(name);
    (0, import_node_http2.validateHeaderValue)(name, value);
    if (colon < 1 || fields[name] !== void 0) throw new TypeError("Invalid WebSocket headers");
    fields[name] = value.trim();
  }
  const host = fields.host ?? "";
  if (/[\s/?#@\\]/.test(host)) throw new TypeError("Invalid WebSocket host");
  const target = parse(`http://${host}/`);
  if (target.origin !== url.origin || fields.origin !== url.origin || fields["proxy-authorization"] !== void 0) {
    throw new TypeError("WebSocket origin is not approved");
  }
  key2(fields);
  return true;
}
function validate(input) {
  let offset = 0;
  const take = (size) => {
    if (offset + size > input.length) throw new TypeError("Truncated TLS ClientHello");
    const value = input.subarray(offset, offset + size);
    offset += size;
    return value;
  };
  const version = take(2);
  if (version[0] !== 3 || version[1] < 1 || version[1] > 3) throw new TypeError("Invalid TLS version");
  take(32);
  const session = take(1)[0];
  if (session > 32) throw new TypeError("Invalid TLS session");
  take(session);
  const ciphers = take(2).readUInt16BE();
  if (ciphers < 2 || ciphers % 2) throw new TypeError("Invalid TLS ciphers");
  take(ciphers);
  const compression = take(take(1)[0]);
  if (!compression.includes(0)) throw new TypeError("Invalid TLS compression");
  const length = take(2).readUInt16BE();
  if (length !== input.length - offset) throw new TypeError("Invalid TLS extensions");
  const seen = /* @__PURE__ */ new Set();
  while (offset < input.length) {
    const type = take(2).readUInt16BE();
    const size = take(2).readUInt16BE();
    if (seen.has(type)) throw new TypeError("Duplicate TLS extension");
    seen.add(type);
    take(size);
  }
}
var Preface = class {
  constructor(url) {
    this.url = url;
    this.input = Buffer.alloc(url.protocol === "http:" ? LIMIT : 128 * 1024);
  }
  url;
  input;
  body = Buffer.alloc(64 * 1024 + 4);
  size = 0;
  offset = 0;
  count = 0;
  ready = false;
  push(chunk) {
    if (this.size + chunk.length > this.input.length) throw new TypeError("Proxy handshake is too large");
    chunk.copy(this.input, this.size);
    this.size += chunk.length;
    if (this.url.protocol === "http:") return opening(this.bytes(), this.url);
    if (this.ready) return true;
    while (this.offset + 5 <= this.size) {
      const start = this.offset;
      const length = this.input.readUInt16BE(start + 3);
      if (this.input[start] !== 22 || this.input[start + 1] !== 3 || this.input[start + 2] < 1 || this.input[start + 2] > 3 || length === 0 || length > LIMIT) {
        throw new TypeError("CONNECT requires TLS");
      }
      if (start + 5 + length > this.size) return false;
      if (this.count + length > this.body.length) throw new TypeError("TLS ClientHello is too large");
      this.input.copy(this.body, this.count, start + 5, start + 5 + length);
      this.count += length;
      this.offset += length + 5;
      if (this.count < 4) continue;
      const size = this.body.readUIntBE(1, 3);
      if (this.body[0] !== 1 || size > 65535) throw new TypeError("Invalid TLS ClientHello");
      if (this.count < size + 4) continue;
      if (this.count !== size + 4) throw new TypeError("Invalid TLS handshake length");
      validate(this.body.subarray(4, this.count));
      this.ready = true;
      return true;
    }
    return false;
  }
  bytes() {
    return this.input.subarray(0, this.size);
  }
};
function scope(client, parent, timeout) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timer = setTimeout(abort, timeout);
  timer.unref();
  client.once("close", abort);
  client.once("error", abort);
  return {
    signal: AbortSignal.any([parent, controller.signal]),
    abort,
    ready: () => clearTimeout(timer),
    close: () => {
      clearTimeout(timer);
      client.off("close", abort);
      client.off("error", abort);
    }
  };
}
function waiting(promise, signal) {
  const pending = Promise.withResolvers();
  const abort = () => pending.reject(new Error("Proxy request cancelled"));
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
  return Promise.race([promise, pending.promise]).finally(() => signal.removeEventListener("abort", abort));
}
function pipe(client, upstream, head) {
  client.pause();
  client.once("close", () => upstream.destroy());
  upstream.once("close", () => client.destroy());
  upstream.pipe(client);
  const resume = () => client.pipe(upstream);
  if (head.length === 0 || upstream.write(head)) resume();
  else upstream.once("drain", resume);
}
var BrowserProxy = class _BrowserProxy {
  constructor(policy, opts, server, origin, timeout) {
    this.policy = policy;
    this.opts = opts;
    this.server = server;
    this.timeout = timeout;
    this.proxy = Object.freeze({ server: origin, bypass: "<-loopback>" });
    this.credentials = Object.freeze({
      username: (0, import_node_crypto2.randomBytes)(16).toString("hex"),
      password: (0, import_node_crypto2.randomBytes)(32).toString("base64url"),
      origin,
      realm: `kilo-browser-${(0, import_node_crypto2.randomBytes)(16).toString("hex")}`
    });
    server.on("connection", (socket) => this.track(socket));
    server.on("request", (request2, response) => void this.forward(request2, response));
    server.on("upgrade", (request2, client, head) => void this.upgrade(request2, client, head));
    server.on("connect", (request2, client, head) => this.tunnel(request2, client, head));
    server.on("clientError", (_error, socket) => {
      socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
    });
  }
  policy;
  opts;
  server;
  timeout;
  proxy;
  credentials;
  sockets = /* @__PURE__ */ new Set();
  stop = new AbortController();
  closing;
  static async start(policy, opts = {}) {
    const target = policy instanceof URL ? parse(policy.href) : policy;
    if (target instanceof URL ? target.protocol !== "http:" : !["deny", "public"].includes(target)) {
      throw new TypeError("Invalid browser proxy policy");
    }
    const timeout = opts.timeout ?? 3e4;
    if (!Number.isInteger(timeout) || timeout < 1 || timeout > 3e4) {
      throw new TypeError("Invalid browser proxy timeout");
    }
    const server = (0, import_node_http2.createServer)({
      maxHeaderSize: LIMIT,
      headersTimeout: Math.min(timeout, 1e4),
      requestTimeout: timeout,
      connectionsCheckingInterval: Math.min(timeout, 1e3),
      keepAliveTimeout: 5e3
    });
    server.maxConnections = 128;
    const ready = (0, import_node_events.once)(server, "listening");
    server.listen(0, "127.0.0.1");
    await ready;
    const address = server.address();
    if (!address || typeof address === "string") {
      server.close();
      throw new Error("Browser proxy did not bind a local port");
    }
    return new _BrowserProxy(
      target instanceof URL ? target.origin : target,
      opts,
      server,
      `http://127.0.0.1:${address.port}`,
      timeout
    );
  }
  close() {
    if (this.closing) return this.closing;
    const closed = Promise.withResolvers();
    this.closing = closed.promise;
    this.stop.abort();
    for (const socket of this.sockets) socket.destroy();
    this.server.close(() => closed.resolve());
    return this.closing;
  }
  track(socket) {
    this.sockets.add(socket);
    socket.once("close", () => this.sockets.delete(socket));
    socket.on("error", () => socket.destroy());
    if (this.stop.signal.aborted) socket.destroy();
    return socket;
  }
  authenticated(request2) {
    const value = /^Basic ([A-Za-z0-9+/]+={0,2})$/i.exec(request2.headers["proxy-authorization"] ?? "");
    if (!value) return false;
    const actual = Buffer.from(value[1], "base64");
    const expected = Buffer.from(`${this.credentials.username}:${this.credentials.password}`);
    return actual.length === expected.length && (0, import_node_crypto2.timingSafeEqual)(actual, expected);
  }
  challenge() {
    return { "Proxy-Authenticate": `Basic realm="${this.credentials.realm}"` };
  }
  reject(client, status = 403) {
    const challenge = status === 407 ? `Proxy-Authenticate: ${this.challenge()["Proxy-Authenticate"]}\r
` : "";
    client.end(
      `HTTP/1.1 ${status} Proxy Request Rejected\r
${challenge}Connection: close\r
Content-Length: 0\r
\r
`
    );
  }
  target(value, tunnel = false) {
    if (this.policy === "deny" || this.policy === "public" && !tunnel) {
      throw new Error("Browser proxy destination is not approved");
    }
    const local2 = tunnel && this.policy !== "public" && new URL(`http://${value}/`).origin === this.policy;
    const url = tunnel ? authority(value, local2 ? "http" : "https") : parse(value.replace(/^ws:/i, "http:"));
    if (!tunnel && (url.protocol !== "http:" || url.origin !== this.policy)) {
      throw new Error("Browser proxy origin is not approved");
    }
    if (url.hash) throw new TypeError("Invalid proxy request URL");
    return url;
  }
  async dial(url, signal) {
    signal.throwIfAborted();
    const host = url.hostname.startsWith("[") ? url.hostname.slice(1, -1) : url.hostname;
    const family = (0, import_node_net3.isIP)(host);
    const answers = family ? [{ address: host, family }] : await waiting(
      (this.opts.lookup ?? ((host2) => (0, import_promises3.lookup)(host2, { all: true, verbatim: true })))(host, signal),
      signal
    );
    signal.throwIfAborted();
    const addresses = answers.map((entry) => ({ address: entry.address, family: entry.family }));
    if (addresses.length === 0 || addresses.some(
      (entry) => !(0, import_node_net3.isIP)(entry.address) || (0, import_node_net3.isIP)(entry.address) !== entry.family || (url.protocol === "https:" ? !isPublicAddress(entry.address) : !["127.0.0.1", "::1"].includes(entry.address))
    )) {
      throw new Error("Browser proxy denied a non-public or unapproved address");
    }
    const timeout = addresses.length > 1 ? Math.min(5e3, this.timeout / addresses.length) : this.timeout;
    let err = new Error("Browser proxy could not connect");
    for (const address of addresses) {
      signal.throwIfAborted();
      const family2 = (0, import_node_net3.isIP)(address.address);
      if (family2 !== 4 && family2 !== 6) throw new Error("Invalid proxy address family");
      const socket = this.track(
        (this.opts.connect ?? import_node_net3.connect)({
          host: address.address,
          port: Number(url.port || (url.protocol === "https:" ? 443 : 80)),
          family: family2
        })
      );
      const attempt = scope(socket, signal, timeout);
      try {
        await (0, import_node_events.once)(socket, "connect", { signal: attempt.signal });
        attempt.signal.throwIfAborted();
        return { socket, host: address.address, family: family2 };
      } catch (cause) {
        socket.destroy();
        err = cause;
      } finally {
        attempt.close();
      }
    }
    throw new Unreachable("Browser proxy could not connect", { cause: err });
  }
  tunnel(request2, client, head) {
    if (!this.authenticated(request2)) return this.reject(client, 407);
    const url = (() => {
      try {
        return this.target(request2.url ?? "", true);
      } catch {
        this.reject(client);
      }
    })();
    if (!url) return;
    const state = scope(client, this.stop.signal, this.timeout);
    const preface = new Preface(url);
    let pending = false;
    const cleanup2 = () => {
      client.off("data", inspect2);
      client.off("end", fail);
      state.signal.removeEventListener("abort", fail);
      state.close();
    };
    const fail = () => {
      cleanup2();
      state.abort();
      client.destroy();
    };
    const inspect2 = (chunk) => {
      try {
        if (!preface.push(chunk) || pending) return;
        pending = true;
        void this.dial(url, state.signal).then((peer) => {
          if (state.signal.aborted || client.destroyed) {
            peer.socket.destroy();
            fail();
            return;
          }
          cleanup2();
          pipe(client, peer.socket, preface.bytes());
        }, fail);
      } catch {
        fail();
      }
    };
    state.signal.addEventListener("abort", fail, { once: true });
    client.once("end", fail);
    client.on("data", inspect2);
    client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
    if (head.length) inspect2(head);
    client.resume();
  }
  async forward(request2, response) {
    if (!this.authenticated(request2)) {
      response.writeHead(407, { ...this.challenge(), connection: "close" }).end();
      return;
    }
    const state = scope(request2.socket, this.stop.signal, this.timeout);
    response.once("close", () => {
      state.abort();
      state.close();
    });
    response.once("finish", state.close);
    try {
      const url = this.target(request2.url ?? "");
      local(request2, url);
      const peer = await this.dial(url, state.signal);
      const upstream = (0, import_node_http2.request)({
        hostname: peer.host,
        family: peer.family,
        port: Number(url.port || 80),
        method: request2.method,
        path: `${url.pathname}${url.search}`,
        headers: headers(request2.headers, url.host),
        createConnection: () => peer.socket,
        signal: state.signal
      });
      upstream.on("response", (incoming) => {
        state.ready();
        response.writeHead(incoming.statusCode ?? 502, headers(incoming.headers));
        incoming.on("error", () => response.destroy());
        incoming.pipe(response);
      });
      upstream.on("error", () => {
        if (!response.headersSent) response.writeHead(502);
        response.end();
      });
      request2.pipe(upstream);
    } catch (error) {
      state.close();
      if (!response.headersSent) {
        response.writeHead(
          error instanceof Unreachable ? 502 : 403,
          error instanceof Unreachable ? { connection: "close", [UNREACHABLE]: "1" } : { connection: "close" }
        );
      }
      response.end();
    }
  }
  async upgrade(request2, client, head) {
    if (!this.authenticated(request2)) return this.reject(client, 407);
    const state = scope(client, this.stop.signal, this.timeout);
    try {
      const url = this.target(request2.url ?? "");
      if (request2.headers.origin !== url.origin) throw new Error("Local WebSocket origin is not approved");
      if (request2.method !== "GET") throw new TypeError("Invalid WebSocket method");
      const accept = (0, import_node_crypto2.createHash)("sha1").update(`${key2(request2.headers)}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest("base64");
      const peer = await this.dial(url, state.signal);
      const upstream = (0, import_node_http2.request)({
        hostname: peer.host,
        family: peer.family,
        port: Number(url.port || 80),
        path: `${url.pathname}${url.search}`,
        headers: { ...headers(request2.headers, url.host), connection: "Upgrade", upgrade: "websocket" },
        createConnection: () => peer.socket,
        signal: state.signal
      });
      upstream.on("response", (incoming) => {
        incoming.destroy();
        state.close();
        this.reject(client, 502);
      });
      upstream.on("error", () => {
        state.close();
        client.destroy();
      });
      upstream.on("upgrade", (incoming, socket, data) => {
        state.close();
        if (!websocket(incoming.headers) || incoming.headers["sec-websocket-accept"] !== accept) {
          socket.destroy();
          this.reject(client, 502);
          return;
        }
        const fields = { ...headers(incoming.headers), connection: "Upgrade", upgrade: "websocket" };
        client.write("HTTP/1.1 101 Switching Protocols\r\n");
        for (const [name, value] of Object.entries(fields)) {
          for (const item of Array.isArray(value) ? value : [value]) client.write(`${name}: ${item}\r
`);
        }
        client.write("\r\n");
        if (data.length) client.write(data);
        pipe(client, peer.socket, head);
      });
      upstream.end();
    } catch {
      state.close();
      this.reject(client);
    }
  }
};

// src/services/browser-automation/browser-broker.ts
var BrowserLaunchError = class extends Error {
  constructor(missing, cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(
      missing === "chrome" ? "Google Chrome was not found. Install Chrome or disable Use System Chrome in Dustcode Settings > Experimental for the Integrated Browser to use an installed Playwright Chromium browser." : missing === "chromium" ? "A compatible Playwright Chromium browser was not found. Install one or enable Use System Chrome in Dustcode Settings > Experimental for the Integrated Browser." : `The browser could not start. ${detail}`,
      { cause }
    );
    this.missing = missing;
    this.name = "BrowserLaunchError";
  }
  missing;
};
var BrowserNavigationError = class extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
    this.name = "BrowserNavigationError";
  }
  status;
};
var MAX_BODY = 32 * 1024;
var MAX_SCREENSHOT = 2 * 1024 * 1024;
var TIMEOUT = /ERR_CONNECTION_TIMED_OUT|ETIMEDOUT|Timeout \d+ms exceeded/i;
var CRASHED = "The browser stopped unexpectedly. Refresh to start it again.";
var MISSING = /Chrom(?:e|ium) distribution ("|')chrom(?:e|ium)(\1) is not found\b|Executable doesn't exist at\b/i;
function unreachable(url) {
  return `Cannot connect to ${url ?? "the local application"}. Make sure the local server is running.`;
}
function reason(entry, error, url) {
  if (entry.dead) return new BrowserNavigationError(entry.state.error ?? CRASHED);
  if (entry.unreachable) return new BrowserNavigationError(unreachable(url.href), entry.response);
  if (entry.waiting.size === 0 || !TIMEOUT.test(error instanceof Error ? error.message : String(error))) return error;
  return new BrowserNavigationError(
    "Browser navigation stopped while waiting for approval in VS Code. Dismiss the approval prompt and retry."
  );
}
function diagnostic(error, url) {
  const text2 = (0, import_node_util.stripVTControlCharacters)(error instanceof Error ? error.message : String(error));
  const launch = error instanceof BrowserLaunchError;
  if (!launch && /ERR_CONNECTION_REFUSED|ECONNREFUSED/i.test(text2)) return unreachable(url);
  if (!launch && TIMEOUT.test(text2)) {
    return url && import_node_url3.URL.parse(url)?.protocol === "https:" ? "The website did not respond in time. Check the URL and network connection, then try again." : "The local application did not respond in time. Check the server and try again.";
  }
  if (!launch && /Target page, context or browser has been closed|Browser has been closed/i.test(text2)) {
    return "The browser session was closed. Reopen the browser and try again.";
  }
  return text2.split(/\n\s*Call log:/i)[0].replace(/^page\.(?:goto|reload):\s*/i, "").replace(/\s+/g, " ").trim().slice(0, 500);
}
function reserve() {
  return new Promise((resolve, reject2) => {
    const server = (0, import_node_http3.createServer)();
    server.once("error", reject2);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject2(new Error("Browser developer tools did not receive a local port")));
        return;
      }
      server.close((error) => {
        if (error) return reject2(error);
        resolve(address.port);
      });
    });
  });
}
function json(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(body) });
  res.end(body);
}
function read(req) {
  return new Promise((resolve, reject2) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject2(new Error("Request body is too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject2);
  });
}
var BrowserBroker = class {
  constructor(opts) {
    this.opts = opts;
  }
  opts;
  entries = /* @__PURE__ */ new Map();
  pending = /* @__PURE__ */ new Map();
  claims = /* @__PURE__ */ new Map();
  listeners = /* @__PURE__ */ new Set();
  viewers = /* @__PURE__ */ new Set();
  pointers = /* @__PURE__ */ new Set();
  token = (0, import_node_crypto3.randomBytes)(32).toString("hex");
  proxies = /* @__PURE__ */ new Set();
  gateway;
  owners = [];
  server;
  sockets = /* @__PURE__ */ new Set();
  port;
  debugging;
  tools;
  browser;
  browserStarting;
  starting;
  closed = false;
  scheme() {
    return this.opts.theme?.() ?? "light";
  }
  /**
   * Re-apply the current IDE color scheme to every live page. A page keeps the
   * emulated scheme across navigations, so this only needs to run when the IDE
   * theme changes, not on every navigation.
   */
  retheme() {
    const colorScheme = this.scheme();
    for (const entry of this.entries.values()) {
      if (entry.dead) continue;
      void entry.page.emulateMedia({ colorScheme }).catch((error) => this.opts.log("Browser theme update failed", error));
    }
  }
  async start() {
    if (this.closed) throw new Error("Browser broker is closed");
    if (this.port !== void 0) return;
    if (this.starting) return this.starting;
    this.starting = new Promise((resolve, reject2) => {
      this.server = (0, import_node_http3.createServer)((req, res) => {
        void this.handle(req, res);
      });
      this.server.on("connection", (socket) => {
        this.sockets.add(socket);
        socket.once("close", () => this.sockets.delete(socket));
      });
      this.server.once("error", reject2);
      this.server.listen(0, "127.0.0.1", () => {
        const server = this.server;
        const address = server?.address();
        if (!server || !address || typeof address === "string") {
          reject2(new Error("Browser broker did not receive a local port"));
          return;
        }
        this.port = address.port;
        this.tools = new BrowserDevtools(server, address.port, this.opts.log, (browser, active) => {
          const entry = [...this.entries.values()].find((item) => item.browserId === browser);
          if (!entry || entry.state.inspecting === active) return;
          entry.state.inspecting = active;
          this.emit(entry.state);
        });
        resolve();
      });
    }).finally(() => {
      this.starting = void 0;
    });
    return this.starting;
  }
  async env() {
    await this.start();
    return {
      KILO_BROWSER_BROKER_URL: `http://127.0.0.1:${this.port}`,
      KILO_BROWSER_BROKER_TOKEN: this.token
    };
  }
  /**
   * Register a route owner. Owners are tried in registration order, so a surface
   * that wants to claim a request first (for example the editor-tab browser for
   * sidebar sessions) must register before the Agent Manager.
   *
   * A request that carries a project id only resolves against owners that return
   * the same project id, which keeps Agent Manager worktree entries from being
   * captured by the sidebar resolver. A request without a project id resolves
   * against the first owner that accepts it.
   *
   * Each owner carries its own navigation approval so a route is gated by the
   * surface that owns it, not by another surface's registration order.
   */
  bind(resolve, approve) {
    const owner = { resolve, approve };
    this.owners.push(owner);
    return owner;
  }
  /** Remove a previously registered owner so its resolver cannot be called again. */
  unbind(owner) {
    const index = this.owners.indexOf(owner);
    if (index >= 0) this.owners.splice(index, 1);
  }
  resolve(route) {
    if (this.owners.length === 0) return { scope: route };
    for (const owner of this.owners) {
      const scope2 = owner.resolve(route);
      if (!scope2) continue;
      if (route.projectId !== void 0 && scope2.projectId !== route.projectId) continue;
      return { scope: scope2, owner };
    }
    return;
  }
  revalid(route, owner) {
    if (this.owners.length === 0) return route;
    for (const item of owner ? [owner] : this.owners) {
      const scope2 = item.resolve(route);
      if (scope2 && scope2.projectId === route.projectId && scope2.directory === route.directory) return scope2;
    }
    return;
  }
  async approve(route, url, owner) {
    if (!owner?.approve) return false;
    return owner.approve(route, url);
  }
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  replay(listener) {
    for (const entry of this.entries.values()) listener(this.copy(entry.state));
  }
  frames(listener) {
    this.viewers.add(listener);
    return () => this.viewers.delete(listener);
  }
  cursors(listener) {
    this.pointers.add(listener);
    return () => this.pointers.delete(listener);
  }
  async viewport(sessionId, projectId, browserId, navigation, viewport) {
    this.available();
    const entry = this.view(sessionId, projectId, { browserId, navigation });
    if (!entry || !Number.isSafeInteger(viewport.revision) || viewport.revision < 1) return;
    if (entry.viewport && viewport.revision < entry.viewport.revision) return;
    entry.viewport = { ...viewport };
    await this.cast(entry).configure(viewport);
  }
  cast(entry) {
    if (entry.stream) return entry.stream;
    const route = entry.route;
    entry.stream = new BrowserStream(
      entry.page,
      () => ({ browserId: entry.browserId, navigation: entry.state.navigation }),
      (frame) => {
        if (!this.view(route.sessionId, route.projectId, frame) || entry.viewport?.active !== true) return;
        for (const viewer of this.viewers) viewer({ ...frame, projectId: route.projectId, sessionId: route.sessionId });
      },
      this.opts.log,
      (cursor) => {
        if (!this.accepts(route.sessionId, route.projectId, cursor)) return;
        for (const listener of this.pointers)
          listener({ ...cursor, projectId: route.projectId, sessionId: route.sessionId });
      }
    );
    return entry.stream;
  }
  accepts(sessionId, projectId, identity) {
    const entry = this.view(sessionId, projectId, identity);
    return !!entry?.stream && entry.viewport?.active === true && entry.viewport.revision === identity.revision;
  }
  acknowledge(sessionId, projectId, identity, sequence) {
    const entry = this.view(sessionId, projectId, identity);
    if (entry?.viewport?.revision !== identity.revision) return;
    if (Number.isSafeInteger(sequence) && sequence > 0) entry.stream?.acknowledge(sequence);
  }
  async interact(sessionId, projectId, identity, event, read2, write) {
    if (!this.accepts(sessionId, projectId, identity)) return;
    const entry = this.view(sessionId, projectId, identity);
    if (!entry?.stream) return;
    const copied = await entry.stream.interact(
      event,
      read2,
      write && ((text2) => {
        if (this.view(sessionId, projectId, identity)) return write(text2);
      })
    );
    return this.view(sessionId, projectId, identity) ? copied : void 0;
  }
  suspend() {
    for (const entry of this.entries.values()) {
      if (!entry.viewport || !entry.stream) continue;
      entry.viewport = { ...entry.viewport, active: false };
      void entry.stream.configure(entry.viewport).catch((error) => this.opts.log("Browser stream pause failed", error));
    }
  }
  view(sessionId, projectId, identity) {
    if (this.closed || this.opts.enabled?.() === false || this.opts.trusted?.() === false) return;
    const entry = this.entries.get(this.key(sessionId, projectId));
    if (!entry || entry.dead || entry.browserId !== identity.browserId || entry.state.navigation !== identity.navigation)
      return;
    const scope2 = this.revalid(entry.route, entry.owner);
    return scope2?.directory === entry.route.directory && scope2.projectId === entry.route.projectId ? entry : void 0;
  }
  get(sessionId, projectId) {
    const entries = [...this.entries.values()].filter(
      (entry) => entry.route.sessionId === sessionId && (projectId === void 0 || entry.route.projectId === projectId)
    );
    return entries.length === 1 ? this.copy(entries[0].state) : void 0;
  }
  sessions() {
    return [...new Set([...this.entries.keys(), ...this.pending.keys()].map((key4) => key4.slice(key4.indexOf("\0") + 1)))];
  }
  /** True when a surface other than `owner` holds an entry or in-flight open for the session. */
  ownedByOther(sessionId, owner) {
    for (const key4 of [...this.entries.keys(), ...this.pending.keys()]) {
      if (key4.slice(key4.indexOf("\0") + 1) !== sessionId) continue;
      const current = this.ownerOf(key4);
      if (current && current !== owner) return true;
    }
    return false;
  }
  open(route, target, capture2 = true) {
    const resolved = this.resolve(route);
    if (!resolved)
      return Promise.reject(new Error("Browser session does not belong to the requested project or directory"));
    const key4 = this.key(resolved.scope.sessionId, resolved.scope.projectId);
    if (resolved.owner) this.claims.set(key4, resolved.owner);
    return this.serial(key4, () => this.create(resolved.scope, target, capture2, resolved.owner));
  }
  async create(scope2, target, capture2, owner) {
    this.available();
    const url = this.validate(target);
    const existing = this.entries.get(this.key(scope2.sessionId, scope2.projectId));
    if (existing) {
      if (existing.route.directory !== scope2.directory) throw new Error("Browser session directory cannot change");
      if (existing.route.projectId !== scope2.projectId) {
        throw new Error("Browser session project cannot change");
      }
      const replace = existing.dead === true || existing.network?.active === false || existing.local !== (url.protocol === "http:") || existing.local && existing.origin !== url.origin;
      if (!replace) {
        existing.route.projectId = scope2.projectId ?? existing.route.projectId;
        existing.state.projectId = existing.route.projectId;
        existing.network?.authorize(url);
        const reload = existing.state.status === "ready" && existing.page.url() === url.href;
        await this.goto(existing, url, reload, capture2);
        return this.copy(existing.state);
      }
      await this.retire(existing);
    }
    const browser = await this.ensureBrowser();
    this.available();
    const proxy = await BrowserProxy.start(url.protocol === "http:" ? url : "public");
    this.proxies.add(proxy);
    const context = await (async () => {
      this.available();
      return browser.newContext({
        serviceWorkers: "block",
        viewport: { width: 1280, height: 720 },
        deviceScaleFactor: 2,
        colorScheme: this.scheme(),
        proxy: proxy.proxy,
        ignoreHTTPSErrors: false,
        acceptDownloads: false
      });
    })().catch(async (error) => {
      await proxy.close();
      this.proxies.delete(proxy);
      throw error;
    });
    const page = await context.newPage().catch(async (error) => {
      await proxy.close();
      this.proxies.delete(proxy);
      await context.close().catch((failure) => this.opts.log("Browser context close failed", failure));
      throw error;
    });
    const entry = {
      route: { ...scope2 },
      owner,
      browserId: (0, import_node_crypto3.randomUUID)(),
      context,
      page,
      proxy,
      waiting: /* @__PURE__ */ new Set(),
      local: url.protocol === "http:",
      origin: url.origin,
      state: {
        browserId: "",
        projectId: scope2.projectId,
        sessionId: scope2.sessionId,
        navigation: 0,
        status: "starting",
        errors: 0,
        logs: []
      }
    };
    entry.state.browserId = entry.browserId;
    const key4 = this.key(scope2.sessionId, scope2.projectId);
    this.entries.set(key4, entry);
    this.attach(entry);
    try {
      this.available();
      if (this.owners.length > 0 && !this.revalid(scope2, owner))
        throw new Error("Browser session is no longer available");
      entry.network = await (this.opts.network ?? BrowserNetwork.attach)(page, {
        url,
        proxy,
        approve: async (target2) => {
          const identity = { browserId: entry.browserId, navigation: entry.state.navigation };
          if (!this.view(scope2.sessionId, scope2.projectId, identity)) return false;
          entry.waiting.add(target2.origin);
          try {
            const approved = await this.approve(entry.route, target2, entry.owner);
            return approved === true && entry.network?.active !== false && !!this.view(scope2.sessionId, scope2.projectId, identity);
          } finally {
            entry.waiting.delete(target2.origin);
          }
        },
        blocked: (message) => {
          entry.state.error = message;
          this.emit(entry.state);
        },
        // A new document starts a new view identity, so input for the old document cannot reach it. Same-document
        // navigations keep the identity, so a client-side route change does not restart the view or drop input.
        committed: () => {
          if (entry.navigating) return;
          entry.state.navigation++;
          this.emit(entry.state);
          void this.update(entry).then(() => this.emit(entry.state)).catch((error) => this.fail(entry, error));
        },
        log: this.opts.log
      });
      this.available();
      if (this.owners.length > 0 && !this.revalid(scope2, owner))
        throw new Error("Browser session is no longer available");
    } catch (error) {
      await this.retire(entry);
      throw error;
    }
    this.emit(entry.state);
    await this.goto(entry, url, false, capture2);
    return this.copy(entry.state);
  }
  devtools(sessionId, projectId, theme = "dark") {
    return this.serial(this.key(sessionId, projectId), async () => {
      this.available();
      const entry = this.require(sessionId, void 0, projectId);
      await this.start();
      const port = this.debugging ?? this.browser?.debugging;
      if (!port || !this.tools || typeof entry.context.newCDPSession !== "function") {
        throw new Error("Browser developer tools are unavailable for this browser session");
      }
      const session = await entry.context.newCDPSession(entry.page);
      const info = await session.send("Target.getTargetInfo").finally(
        () => session.detach().catch((error) => this.opts.log("Browser CDP session close failed", error))
      );
      return {
        browserId: entry.browserId,
        url: this.tools.open(entry.browserId, info.targetInfo.targetId, port, theme)
      };
    });
  }
  inspect(sessionId, projectId, position2, detail = true) {
    return this.serial(this.key(sessionId, projectId), async () => {
      this.available();
      const entry = this.require(sessionId, void 0, projectId);
      await this.point(entry, position2);
      const selected = await entry.page.evaluate(capture, { ...position2, detail });
      if (selected?.source) selected.source = await locate(entry.route.directory, selected.source);
      await this.update(entry);
      return {
        url: entry.state.url,
        title: entry.state.title,
        element: selected,
        logs: [...entry.state.logs ?? []]
      };
    });
  }
  input(sessionId, projectId, position2, click) {
    return this.serial(this.key(sessionId, projectId), async () => {
      this.available();
      const entry = this.require(sessionId, void 0, projectId);
      if (!entry.state.inspecting) return;
      const point = await this.point(entry, position2);
      await entry.page.mouse.move(point.x, point.y);
      if (!click) return;
      await entry.page.mouse.down();
      await entry.page.mouse.up();
    });
  }
  history(sessionId, projectId, direction) {
    return this.serial(this.key(sessionId, projectId), async () => {
      this.available();
      const entry = this.require(sessionId, void 0, projectId);
      if (entry.dead || !(direction === "back" ? entry.state.back : entry.state.forward)) return this.copy(entry.state);
      const opts = { waitUntil: "domcontentloaded", timeout: 3e4 };
      await (direction === "back" ? entry.page.goBack(opts) : entry.page.goForward(opts)).catch((error) => {
        this.fail(entry, error);
        throw error;
      });
      await this.update(entry);
      this.emit(entry.state);
      return this.copy(entry.state);
    });
  }
  refresh(sessionId, projectId, capture2 = true) {
    return this.serial(this.key(sessionId, projectId), async () => {
      this.available();
      const entry = this.require(sessionId, void 0, projectId);
      const url = this.validate(entry.state.url ?? entry.origin);
      if (entry.dead) {
        const scope2 = this.revalid(entry.route, entry.owner);
        if (!scope2) throw new Error("Browser session does not belong to the requested project or directory");
        return this.create(scope2, url.href, capture2, entry.owner);
      }
      await this.goto(entry, url, true, capture2);
      return this.copy(entry.state);
    });
  }
  close(sessionId, projectId) {
    const keys = /* @__PURE__ */ new Set([...this.entries.keys(), ...this.pending.keys()]);
    return Promise.all(
      [...keys].filter(
        (key4) => projectId === void 0 ? key4.slice(key4.indexOf("\0") + 1) === sessionId : key4 === this.key(sessionId, projectId)
      ).map((key4) => this.stop(key4))
    ).then(() => void 0);
  }
  /** Close only the entry for this exact session and project, leaving other projects' entries intact. */
  closeScoped(sessionId, projectId) {
    return this.stop(this.key(sessionId, projectId)).then(() => void 0);
  }
  /** Close every entry and in-flight open owned by one surface, leaving other owners intact. */
  closeOwned(owner) {
    const keys = /* @__PURE__ */ new Set([...this.entries.keys(), ...this.pending.keys()]);
    return Promise.all([...keys].filter((key4) => this.ownerOf(key4) === owner).map((key4) => this.stop(key4))).then(
      () => void 0
    );
  }
  stop(key4) {
    const entry = this.entries.get(key4);
    void entry?.proxy.close().catch((error) => this.opts.log("Browser proxy close failed", error));
    return this.serial(key4, async () => {
      const current = this.entries.get(key4);
      if (current) await this.retire(current);
    });
  }
  async retire(entry) {
    const key4 = this.key(entry.route.sessionId, entry.route.projectId);
    if (this.entries.get(key4) === entry) this.entries.delete(key4);
    this.tools?.revoke(entry.browserId);
    void entry.history?.then((session) => session?.detach()).catch((error) => this.opts.log("Browser history session close failed", error));
    const stream = entry.stream?.close().catch((error) => this.opts.log("Browser stream close failed", error));
    const network = entry.network?.close().catch((error) => this.opts.log("Browser network close failed", error));
    await entry.proxy.close().catch((error) => this.opts.log("Browser proxy close failed", error));
    this.proxies.delete(entry.proxy);
    await entry.context.close().catch((error) => this.opts.log("Browser context close failed", error));
    await Promise.all([stream, network]);
    entry.state.status = "closed";
    entry.state.screenshot = void 0;
    this.emit(entry.state);
  }
  async disposeAsync() {
    if (this.closed) return;
    this.closed = true;
    await Promise.all([...this.proxies].map((proxy) => proxy.close()));
    await Promise.all([.../* @__PURE__ */ new Set([...this.entries.keys(), ...this.pending.keys()])].map((key4) => this.stop(key4)));
    this.proxies.clear();
    this.gateway = void 0;
    await this.browserStarting?.catch((error) => this.opts.log("Browser startup failed", error));
    await this.browser?.close().catch((error) => this.opts.log("Browser close failed", error));
    this.browser = void 0;
    this.debugging = void 0;
    this.tools?.dispose();
    this.tools = void 0;
    await new Promise((resolve) => {
      if (!this.server) return resolve();
      this.server.close(() => resolve());
      for (const socket of this.sockets) socket.destroy();
      this.sockets.clear();
      if (!this.server.listening) resolve();
    });
    this.server = void 0;
    this.port = void 0;
    this.listeners.clear();
    this.viewers.clear();
    this.pointers.clear();
  }
  dispose() {
    void this.disposeAsync().catch((error) => this.opts.log("Browser broker dispose failed", error));
  }
  ensureBrowser() {
    if (this.closed) return Promise.reject(new Error("Browser broker is closed"));
    if (this.browser) return Promise.resolve(this.browser);
    if (this.browserStarting) return this.browserStarting;
    let system = this.opts.useSystemChrome?.() !== false;
    const starting = (async () => {
      const port = this.opts.launch ? void 0 : await reserve();
      const base = options(system, port);
      const gateway = await BrowserProxy.start("deny");
      this.proxies.add(gateway);
      this.gateway = gateway;
      this.available();
      const config = {
        ...base,
        proxy: gateway.proxy,
        ignoreDefaultArgs: ["--disable-popup-blocking"],
        args: [
          ...(base.args ?? []).filter((arg) => arg !== "--no-proxy-server"),
          "--force-device-scale-factor=2",
          "--disable-quic",
          "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1",
          "--webrtc-ip-handling-policy=disable_non_proxied_udp",
          "--force-webrtc-ip-handling-policy=disable_non_proxied_udp"
        ]
      };
      const launch = (config2) => this.opts.launch?.(config2) ?? import_playwright_core.chromium.launch(config2);
      const browser = await launch(config).catch((error) => {
        const detail = error instanceof Error ? error.message : String(error);
        if (!system || !this.opts.fallback?.() || !MISSING.test(detail)) throw error;
        system = false;
        this.opts.log("Chrome is not installed in WSL. Trying Playwright Chromium.");
        return launch({ ...config, channel: void 0 });
      });
      this.debugging = ("debugging" in browser ? browser.debugging : void 0) ?? port;
      this.browser = browser;
      browser.on?.("disconnected", () => this.lost(browser));
      return browser;
    })().catch(async (error) => {
      await this.release();
      const detail = error instanceof Error ? error.message : String(error);
      const missing = MISSING.test(detail) ? system ? "chrome" : "chromium" : void 0;
      throw new BrowserLaunchError(missing, error);
    }).finally(() => {
      if (this.browserStarting === starting) this.browserStarting = void 0;
    });
    this.browserStarting = starting;
    return starting;
  }
  async release() {
    const gateway = this.gateway;
    this.gateway = void 0;
    if (!gateway) return;
    await gateway.close().catch((failure) => this.opts.log("Browser proxy close failed", failure));
    this.proxies.delete(gateway);
  }
  // Chromium exited or crashed. Keep each entry so its panel shows the failure, and let the next open or
  // refresh replace it with a new browser.
  lost(browser) {
    if (this.closed || this.browser !== browser) return;
    this.opts.log("Browser disconnected");
    this.browser = void 0;
    this.debugging = void 0;
    void this.release();
    for (const entry of this.entries.values()) this.kill(entry, CRASHED);
  }
  kill(entry, message) {
    if (entry.dead) return;
    entry.dead = true;
    this.tools?.revoke(entry.browserId);
    void entry.stream?.close().catch((error) => this.opts.log("Browser stream close failed", error));
    void entry.network?.close().catch((error) => this.opts.log("Browser network close failed", error));
    void entry.proxy.close().catch((error) => this.opts.log("Browser proxy close failed", error));
    entry.stream = void 0;
    entry.viewport = void 0;
    entry.state.status = "error";
    entry.state.error = message;
    entry.state.screenshot = void 0;
    entry.state.mime = void 0;
    entry.state.inspecting = false;
    this.emit(entry.state);
  }
  record(entry, message) {
    const text2 = message.replace(/\s+/g, " ").trim().slice(0, 1e3);
    if (!text2) return;
    entry.state.logs = [...entry.state.logs ?? [], text2].slice(-20);
  }
  attach(entry) {
    entry.page.on("response", (response) => {
      if (response.request().isNavigationRequest() && response.frame() === entry.page.mainFrame()) {
        entry.response = response.status();
        entry.unreachable = response.headers()[UNREACHABLE] === "1";
      }
    });
    entry.page.on("console", (message) => {
      const type = message.type();
      if (type === "error") entry.state.errors++;
      this.record(entry, `[${type}] ${message.text()}`);
      this.emit(entry.state);
    });
    entry.page.on("pageerror", (error) => {
      entry.state.errors++;
      this.record(entry, error.message);
      this.emit(entry.state);
    });
    entry.page.on("crash", () => this.kill(entry, "The page crashed. Refresh to load it again."));
    entry.page.on("popup", (page) => {
      entry.state.errors++;
      this.record(entry, "Blocked browser popup");
      this.emit(entry.state);
      void page.close().catch((error) => this.opts.log("Browser popup close failed", error));
    });
    entry.page.on("framenavigated", (frame) => {
      if (frame !== entry.page.mainFrame()) return;
      void this.update(entry).then(() => this.emit(entry.state)).catch((error) => this.fail(entry, error));
    });
    entry.page.on("domcontentloaded", () => {
      void this.update(entry).then(() => this.emit(entry.state)).catch((error) => this.fail(entry, error));
    });
  }
  async goto(entry, url, reload = false, capture2 = true) {
    entry.navigating = true;
    entry.origin = url.origin;
    entry.response = void 0;
    entry.unreachable = false;
    entry.state.navigation++;
    entry.state.status = "loading";
    entry.state.url = url.href;
    entry.state.title = void 0;
    entry.state.screenshot = void 0;
    entry.state.mime = void 0;
    entry.state.error = void 0;
    entry.state.frameError = void 0;
    entry.state.errors = 0;
    entry.state.logs = [];
    this.emit(entry.state);
    try {
      const response = reload ? await entry.page.reload({ waitUntil: "domcontentloaded", timeout: 3e4 }) : await entry.page.goto(url.href, { waitUntil: "domcontentloaded", timeout: 3e4 });
      entry.response = response?.status() ?? entry.response;
      if (entry.response !== void 0 && entry.response >= 400) {
        await this.update(entry);
        if (capture2) await this.capture(entry);
        throw new BrowserNavigationError(`Local application returned HTTP ${entry.response}`, entry.response);
      }
      await this.update(entry);
      if (capture2) await this.capture(entry);
      entry.state.status = "ready";
      this.emit(entry.state);
    } catch (error) {
      const failure = reason(entry, error, url);
      if (failure !== error && !entry.dead && !entry.unreachable)
        await entry.network?.close().catch((error2) => this.opts.log("Browser network close failed", error2));
      entry.state.url = url.href;
      this.fail(entry, failure);
      throw failure;
    } finally {
      entry.navigating = false;
    }
  }
  async point(entry, position2) {
    if (!Number.isFinite(position2.x) || !Number.isFinite(position2.y) || position2.x < 0 || position2.x > 1 || position2.y < 0 || position2.y > 1 || !Number.isFinite(position2.width) || !Number.isFinite(position2.height) || position2.width < 1 || position2.height < 1) {
      throw new Error("Browser element coordinates are invalid");
    }
    const viewport = entry.page.viewportSize?.();
    const width = entry.viewport && viewport ? viewport.width : Math.max(1, Math.min(1920, Math.round(position2.width)));
    const height = entry.viewport && viewport ? viewport.height : Math.max(1, Math.min(1440, Math.round(position2.height)));
    if (viewport?.width !== width || viewport.height !== height) {
      await entry.page.setViewportSize({ width, height });
    }
    return { x: position2.x * width, y: position2.y * height };
  }
  async update(entry) {
    const navigation = entry.state.navigation;
    const url = entry.page.url();
    const parsed = import_node_url3.URL.parse(url);
    if (!parsed || !["http:", "https:"].includes(parsed.protocol)) return;
    const title = await entry.page.title().catch(() => void 0);
    const steps = await this.steps(entry);
    if (entry.state.navigation !== navigation || entry.page.url() !== url) return;
    entry.state.url = url;
    entry.state.title = title;
    entry.state.back = steps.back;
    entry.state.forward = steps.forward;
  }
  // Reads the page history. The first entry of a new context is about:blank, so only web pages count as steps.
  async steps(entry) {
    if (typeof entry.context.newCDPSession !== "function") return { back: false, forward: false };
    entry.history ??= entry.context.newCDPSession(entry.page).catch((error) => {
      this.opts.log("Browser history session failed", error);
      return void 0;
    });
    const session = await entry.history;
    const result = await session?.send("Page.getNavigationHistory").catch(() => void 0);
    if (!Array.isArray(result?.entries)) return { back: false, forward: false };
    const web = (index) => /^https?:/i.test(result.entries.at(index)?.url ?? "") && index >= 0;
    return { back: web(result.currentIndex - 1), forward: web(result.currentIndex + 1) };
  }
  async capture(entry) {
    const data = await this.cast(entry).exclusive(() => entry.page.screenshot({ type: "jpeg", quality: 70 }));
    if (data.byteLength > MAX_SCREENSHOT) throw new Error("Browser screenshot is too large");
    entry.state.screenshot = `data:image/jpeg;base64,${data.toString("base64")}`;
    entry.state.mime = "image/jpeg";
    this.emit(entry.state);
  }
  key(session, project) {
    return `${project ?? ""}\0${session}`;
  }
  /** Owner of a keyed session, preferring a live entry over a pending open's claim. */
  ownerOf(key4) {
    const entry = this.entries.get(key4);
    if (entry) return entry.owner;
    return this.pending.has(key4) ? this.claims.get(key4) : void 0;
  }
  async serial(session, operation) {
    const previous = this.pending.get(session)?.catch(() => void 0) ?? Promise.resolve();
    const next = previous.then(operation);
    this.pending.set(session, next);
    try {
      return await next;
    } finally {
      if (this.pending.get(session) === next) {
        this.pending.delete(session);
        this.claims.delete(session);
      }
    }
  }
  available() {
    if (this.closed) throw new Error("Browser broker is closed");
    if (this.opts.trusted && !this.opts.trusted()) throw new Error("Browser preview requires a trusted workspace.");
    if (this.opts.enabled && !this.opts.enabled()) {
      throw new Error("Browser automation is disabled. Enable it in Dustcode Settings > Experimental.");
    }
  }
  fail(entry, error) {
    entry.state.status = "error";
    const text2 = error instanceof Error ? error.message : String(error);
    entry.state.error = entry.response && text2.includes("ERR_HTTP_RESPONSE_CODE_FAILURE") ? `Local application returned HTTP ${entry.response}` : diagnostic(error, entry.state.url);
    this.emit(entry.state);
  }
  require(sessionId, directory, projectId) {
    const entries = [...this.entries.values()].filter((entry) => entry.route.sessionId === sessionId);
    if (entries.length === 0) throw new Error("No browser is open for this Agent Manager session");
    const projects = projectId === void 0 ? entries : entries.filter((entry) => entry.route.projectId === projectId);
    if (projects.length === 0) throw new Error("Browser session project does not match");
    const directories = directory === void 0 ? projects : projects.filter((entry) => entry.route.directory === directory);
    if (directories.length === 0) throw new Error("Browser session directory does not match");
    if (directories.length !== 1) throw new Error("Browser session identity is ambiguous");
    return directories[0];
  }
  validate(target) {
    return parse(target);
  }
  copy(state) {
    return { ...state, logs: state.logs ? [...state.logs] : void 0 };
  }
  emit(state) {
    if (state.status !== "closed") {
      if (this.closed) return;
      const entry = this.entries.get(this.key(state.sessionId, state.projectId));
      if (!entry || entry.browserId !== state.browserId) return;
    }
    const next = this.copy(state);
    for (const listener of this.listeners) listener(next);
  }
  authorized(req) {
    const value = req.headers.authorization;
    if (typeof value !== "string") return false;
    const actual = Buffer.from(value);
    const expected = Buffer.from(`Bearer ${this.token}`);
    return actual.byteLength === expected.byteLength && (0, import_node_crypto3.timingSafeEqual)(actual, expected);
  }
  status(req, res, route) {
    if (req.method !== "GET" || route.pathname !== "/browser/status") return false;
    json(res, 200, {
      enabled: !this.closed && this.opts.enabled?.() !== false && this.opts.trusted?.() !== false
    });
    return true;
  }
  async operation(path2, body) {
    const project = typeof body.projectID === "string" ? body.projectID : void 0;
    if (path2 === "/browser/open") {
      if (typeof body.url !== "string") throw new Error("A local application URL is required");
      return this.open({ projectId: project, sessionId: body.sessionID, directory: body.directory }, body.url);
    }
    if (!["/browser/refresh", "/browser/close"].includes(path2)) return void 0;
    const entry = this.require(body.sessionID, body.directory, project);
    if (path2 === "/browser/refresh") return this.refresh(entry.route.sessionId, entry.route.projectId);
    await this.close(entry.route.sessionId, entry.route.projectId);
    return { sessionId: entry.route.sessionId, status: "closed" };
  }
  async handle(req, res) {
    const route = new import_node_url3.URL(req.url ?? "/", "http://127.0.0.1");
    if (this.tools && await this.tools.handle(req, res, route)) return;
    if (!this.authorized(req)) {
      json(res, 401, { error: "Unauthorized" });
      return;
    }
    if (this.status(req, res, route)) return;
    if (req.method !== "POST") {
      json(res, 405, { error: "Method not allowed" });
      return;
    }
    let body;
    try {
      const value = JSON.parse(await read(req));
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid JSON object");
      body = value;
    } catch (error) {
      json(res, 400, { error: error instanceof Error ? error.message : "Invalid JSON" });
      return;
    }
    if (typeof body.sessionID !== "string" || typeof body.directory !== "string") {
      json(res, 400, { error: "sessionID and directory are required" });
      return;
    }
    try {
      const result = await this.operation(route.pathname, {
        ...body,
        sessionID: body.sessionID,
        directory: body.directory
      });
      if (!result) {
        json(res, 404, { error: "Unknown browser operation" });
        return;
      }
      json(res, 200, result);
    } catch (error) {
      json(res, 400, { error: diagnostic(error, typeof body.url === "string" ? body.url : void 0) });
    }
  }
};

// tests/fixtures/browser-network-tls.ts
var cert = `-----BEGIN CERTIFICATE-----
MIIBTjCB9qADAgECAgkAzHzw5jNdvXYwCgYIKoZIzj0EAwIwFzEVMBMGA1UEAwwM
YnJvd3Nlci50ZXN0MB4XDTI2MDgzMTIzNTQwNFoXDTM2MDgyODIzNTQwNFowFzEV
MBMGA1UEAwwMYnJvd3Nlci50ZXN0MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE
EKAOH2JIkTDfZAfmCp+aN8NPoceiQAh/xLK5nwRo9n+kM2PjPAlcMHgFlRP08+yC
xq2LNoFfa3a8ayUQtQtwbKMrMCkwJwYDVR0RBCAwHoIMYnJvd3Nlci50ZXN0gg4q
LmJyb3dzZXIudGVzdDAKBggqhkjOPQQDAgNHADBEAiA/7flxJI8949DYN55Xf5OT
1KJUCJu0ZTqrV0k0sLQkPQIgUZZKgPFqEovDx9lKCDu7OAmUP6fl7/qqGMRw9kNE
xxY=
-----END CERTIFICATE-----`;
var key3 = `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgbGEY5MJBMVr4EnOX
Dkf7qTOluKhKo9B3+Ljb64wckzGhRANCAAQQoA4fYkiRMN9kB+YKn5o3w0+hx6JA
CH/EsrmfBGj2f6QzY+M8CVwweAWVE/Tz7ILGrYs2gV9rdrxrJRC1C3Bs
-----END PRIVATE KEY-----`;

// tests/fixtures/browser-network.ts
var executable = process.env.CHROME_PATH;
if (!executable) throw new Error("The browser-network wrapper must provide CHROME_PATH");
var proxies = [];
var networks = [];
var contexts = [];
var cleanup = [];
async function listen(server) {
  const sockets = /* @__PURE__ */ new Set();
  let contacts = 0;
  server.on("connection", (socket) => {
    contacts++;
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
    socket.on("error", () => socket.destroy());
  });
  const ready = (0, import_node_events2.once)(server, "listening");
  server.listen(0, "127.0.0.1");
  await ready;
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing fixture port");
  cleanup.push(async () => {
    for (const socket of sockets) socket.destroy();
    await new Promise((resolve) => server.close(() => resolve()));
  });
  return { port: address.port, contacts: () => contacts };
}
function websocket2(server) {
  const sockets = new import_websocket_server.default({ server });
  const requests = [];
  sockets.on("connection", (socket, request2) => {
    requests.push(request2);
    socket.on("message", (data) => socket.send(data.toString()));
    socket.on("error", () => socket.terminate());
  });
  cleanup.push(() => {
    for (const socket of sockets.clients) socket.terminate();
    sockets.close();
  });
  return requests;
}
async function secure(name, handle) {
  const requests = [];
  const server = (0, import_node_https.createServer)({ cert, key: key3 }, (request2, response) => {
    requests.push(request2);
    handle(request2, response);
  });
  const target = await listen(server);
  return { ...target, server, requests, url: new URL(`https://${name}.browser.test:${target.port}/`) };
}
async function transport(ports, policy = "public") {
  return BrowserProxy.start(policy, {
    lookup: async (host) => {
      if (host === "localhost" || host === "loop.browser.test") return [{ address: "127.0.0.1", family: 4 }];
      if (!host.endsWith(".browser.test")) throw new Error("Unexpected fixture hostname");
      return [{ address: "8.8.8.8", family: 4 }];
    },
    connect: (options2) => {
      if (options2.host !== "8.8.8.8") return (0, import_node_net4.connect)(options2);
      if (options2.family !== 4 || !ports.includes(options2.port)) throw new Error("Unmapped fixture address");
      return (0, import_node_net4.connect)({ ...options2, host: "127.0.0.1" });
    }
  });
}
(0, import_node_test.describe)("BrowserNetwork Chromium", () => {
  let browser;
  let gateway;
  async function launch(pinned = true, flags = []) {
    const base = options(false);
    const pin = (0, import_node_crypto4.createHash)("sha256").update(new import_node_crypto4.X509Certificate(cert).publicKey.export({ format: "der", type: "spki" })).digest("base64");
    return import_playwright_core2.chromium.launch({
      ...base,
      executablePath: executable,
      proxy: gateway.proxy,
      ignoreDefaultArgs: ["--disable-popup-blocking"],
      args: [
        ...(base.args ?? []).filter((arg) => arg !== "--no-proxy-server"),
        ...flags,
        "--disable-quic",
        "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1",
        "--webrtc-ip-handling-policy=disable_non_proxied_udp",
        "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
        ...pinned ? [`--ignore-certificate-errors-spki-list=${pin}`] : []
      ]
    });
  }
  (0, import_node_test.before)(
    async () => {
      gateway = await BrowserProxy.start("deny");
      browser = await launch();
    },
    { timeout: 2e4 }
  );
  (0, import_node_test.afterEach)(async () => {
    await Promise.all(proxies.splice(0).map((proxy) => proxy.close()));
    await Promise.all(networks.splice(0).map((network) => network.close()));
    await Promise.all(contexts.splice(0).map((context) => context.close()));
    for (const close of cleanup.splice(0).reverse()) await close();
  });
  (0, import_node_test.after)(async () => {
    await browser?.close();
    await gateway?.close();
  });
  async function session(url, opts = {}) {
    const dials = [];
    const proxy = opts.proxy ?? await BrowserProxy.start(url.protocol === "http:" ? url : "public", {
      connect: (options2) => {
        dials.push(options2);
        return (0, import_node_net4.connect)(options2);
      }
    });
    proxies.push(proxy);
    const context = await (opts.browser ?? browser).newContext({
      proxy: proxy.proxy,
      serviceWorkers: "block",
      ignoreHTTPSErrors: false,
      acceptDownloads: false,
      viewport: { width: 640, height: 480 }
    });
    contexts.push(context);
    const page = await context.newPage();
    page.setDefaultNavigationTimeout(5e3);
    page.setDefaultTimeout(5e3);
    const blocked = [];
    const approvals = [];
    const logs = [];
    const network = await BrowserNetwork.attach(page, {
      url,
      proxy,
      approve: async (target) => {
        approvals.push(target.href);
        return opts.approve?.(target) ?? false;
      },
      blocked: (message) => blocked.push(message),
      log: (...args) => logs.push(args)
    });
    networks.push(network);
    return { page, context, network, proxy, dials, blocked, approvals, logs };
  }
  (0, import_node_test.test)(
    "authenticates local HTTP and native WebSockets without exposing proxy credentials",
    { timeout: 2e4 },
    async () => {
      const requests = [];
      const server = (0, import_node_http4.createServer)((request2, response) => {
        requests.push(request2);
        response.writeHead(200, { "content-type": "text/html" }).end("<title>Local fixture</title><h1>Ready</h1>");
      });
      const target = await listen(server);
      const sockets = websocket2(server);
      const url = new URL(`http://localhost:${target.port}/`);
      const current = await session(url);
      (0, import_test.expect)((await current.page.goto(url.href))?.status()).toBe(200);
      const echoed = await current.page.evaluate(
        (url2) => new Promise((resolve, reject2) => {
          const socket = new WebSocket(url2);
          socket.onopen = () => socket.send("browser-network");
          socket.onerror = () => reject2(new Error("Local WebSocket failed"));
          socket.onmessage = (event) => {
            socket.close();
            resolve(String(event.data));
          };
        }),
        `ws://localhost:${target.port}/socket`
      );
      (0, import_test.expect)(echoed).toBe("browser-network");
      (0, import_test.expect)(current.dials.length).toBeGreaterThan(0);
      (0, import_test.expect)(current.approvals).toEqual([]);
      (0, import_test.expect)(current.blocked).toEqual([]);
      (0, import_test.expect)(current.network.active).toBe(true);
      (0, import_test.expect)(requests.length).toBeGreaterThan(0);
      (0, import_test.expect)(sockets).toHaveLength(1);
      (0, import_test.expect)([...requests, ...sockets].every((request2) => request2.headers["proxy-authorization"] === void 0)).toBe(
        true
      );
    }
  );
  (0, import_node_test.test)(
    "loads public HTTPS modules from a localhost document without granting public navigation",
    { timeout: 2e4 },
    async () => {
      const assets = await secure("assets", (request2, response) => {
        response.writeHead(200, {
          "content-type": "application/javascript",
          "access-control-allow-origin": "*"
        });
        response.end(
          request2.url === "/entry.js" ? "export { value } from './nested.js'" : "export const value = 'loaded'"
        );
      });
      const requests = [];
      const source = await listen(
        (0, import_node_http4.createServer)((request2, response) => {
          requests.push(request2.url ?? "");
          if (request2.url === "/module-api") return response.end("local authority");
          response.writeHead(200, { "content-type": "text/html" }).end(
            `<title>Local modules</title><link rel="icon" href="data:,"><h1>Local page</h1><script type="module">import { value } from '${new URL("/entry.js", assets.url)}'; document.documentElement.dataset.resource = value; document.documentElement.dataset.local = await fetch('/module-api').then(response => response.text());</script>`
          );
        })
      );
      const url = new URL(`http://localhost:${source.port}/`);
      const current = await session(url, { proxy: await transport([assets.port], url) });
      await current.page.goto(url.href);
      await current.page.waitForFunction(
        () => document.documentElement.dataset.local === "local authority",
        void 0,
        {
          timeout: 2e3
        }
      );
      (0, import_test.expect)(await current.page.locator("html").getAttribute("data-resource")).toBe("loaded");
      (0, import_test.expect)(requests).toContain("/module-api");
      (0, import_test.expect)(assets.requests.map((request2) => request2.url)).toEqual(["/entry.js", "/nested.js"]);
      (0, import_test.expect)(current.approvals).toEqual([]);
      (0, import_test.expect)(current.blocked).toEqual([]);
      const frame = new URL("/frame", assets.url).href;
      const denied = current.page.waitForEvent("requestfailed", (request2) => request2.url() === frame);
      await current.page.evaluate((url2) => {
        const frame2 = document.createElement("iframe");
        frame2.src = url2;
        document.body.append(frame2);
      }, frame);
      (0, import_test.expect)((await denied).failure()?.errorText).toBe("net::ERR_BLOCKED_BY_CLIENT");
      (0, import_test.expect)(assets.requests.some((request2) => request2.url === "/frame")).toBe(false);
      await (0, import_test.expect)(current.page.goto(new URL("/document", assets.url).href)).rejects.toThrow("ERR_BLOCKED_BY_CLIENT");
      (0, import_test.expect)(assets.requests.some((request2) => request2.url === "/document")).toBe(false);
    }
  );
  (0, import_node_test.test)("a public module redirect cannot contact the approved local origin", { timeout: 2e4 }, async () => {
    const requests = [];
    const source = await listen(
      (0, import_node_http4.createServer)((request2, response) => {
        requests.push(request2.url ?? "");
        response.writeHead(200, { "content-type": "text/html", "access-control-allow-origin": "*" });
        response.end('<title>Local redirect test</title><link rel="icon" href="data:,">');
      })
    );
    const url = new URL(`http://localhost:${source.port}/`);
    const asset = await secure("redirect", (_request, response) => {
      response.writeHead(302, { location: new URL("/from-cdn", url).href, "access-control-allow-origin": "*" }).end();
    });
    const current = await session(url, { proxy: await transport([asset.port], url) });
    await current.page.goto(url.href);
    const contacts = source.contacts();
    (0, import_test.expect)(
      await current.page.evaluate(
        (url2) => import(url2).then(
          () => true,
          () => false
        ),
        asset.url.href
      )
    ).toBe(false);
    (0, import_test.expect)(asset.requests).toHaveLength(1);
    (0, import_test.expect)(requests).not.toContain("/from-cdn");
    (0, import_test.expect)(source.contacts()).toBe(contacts);
  });
  for (const mode of ["frame", "data-worker", "blob-worker"]) {
    (0, import_node_test.test)(
      `an opaque ${mode} cannot contact the approved local HTTP or WebSocket endpoint`,
      { timeout: 15e3 },
      async () => {
        const requests = [];
        const server = (0, import_node_http4.createServer)((request2, response) => {
          requests.push(request2.url ?? "");
          response.writeHead(200, { "content-type": "text/html" }).end('<title>Local origin</title><link rel="icon" href="data:,">');
        });
        const source = await listen(server);
        const sockets = websocket2(server);
        const url = new URL(`http://localhost:${source.port}/`);
        const current = await session(url);
        await current.page.goto(url.href);
        const contacts = source.contacts();
        const result = await current.page.evaluate(
          async ({ mode: mode2, http, ws }) => {
            const probe = async (urls) => {
              const controller = new AbortController();
              const timeout = setTimeout(() => controller.abort(), 1e3);
              const fetched = fetch(urls.http, { mode: "no-cors", signal: controller.signal }).then(
                () => "response",
                () => "blocked"
              ).finally(() => clearTimeout(timeout));
              const result2 = Promise.withResolvers();
              const socket = new WebSocket(urls.ws);
              const timer2 = setTimeout(() => result2.resolve("timeout"), 1e3);
              socket.onopen = () => result2.resolve("open");
              socket.onerror = () => result2.resolve("blocked");
              const connected = await result2.promise;
              clearTimeout(timer2);
              socket.close();
              return { origin: self.origin, fetched: await fetched, connected };
            };
            const call = `(${probe.toString()})(${JSON.stringify({ http, ws })})`;
            const script = mode2 === "frame" ? `${call}.then(value => parent.postMessage(value, '*'))` : `const code = ${JSON.stringify(`${call}.then(value => postMessage(value))`)}; const worker = new Worker(${mode2 === "data-worker" ? "'data:text/javascript,' + encodeURIComponent(code)" : "URL.createObjectURL(new Blob([code], {type:'application/javascript'}))"}); worker.onmessage = event => { parent.postMessage(event.data, '*'); worker.terminate(); };`;
            const frame = document.createElement("iframe");
            frame.sandbox.add("allow-scripts");
            frame.srcdoc = `<script>${script}</script>`;
            const done = Promise.withResolvers();
            const timer = setTimeout(() => done.reject(new Error("Opaque context probe timed out")), 5e3);
            const receive = (event) => {
              if (event.source === frame.contentWindow) done.resolve(event.data);
            };
            window.addEventListener("message", receive);
            document.body.append(frame);
            return done.promise.finally(() => {
              clearTimeout(timer);
              window.removeEventListener("message", receive);
              frame.remove();
            });
          },
          { mode, http: new URL("/private-fetch", url).href, ws: `ws://${url.host}/private-ws` }
        );
        (0, import_test.expect)(result.origin).toBe("null");
        (0, import_test.expect)(result.connected).not.toBe("open");
        (0, import_test.expect)(requests).not.toContain("/private-fetch");
        (0, import_test.expect)(sockets).toHaveLength(0);
        (0, import_test.expect)(source.contacts()).toBe(contacts);
      }
    );
  }
  for (const scheme of ["http", "https"]) {
    (0, import_node_test.test)(
      `${scheme} origin 401 never receives cached proxy credentials, even with a matching realm`,
      { timeout: 2e4 },
      async () => {
        const authorizations = [];
        const state = { realm: "origin" };
        const handle = (request2, response) => {
          if (request2.url !== "/challenge") {
            response.writeHead(200, { "content-type": "text/html" }).end("<title>Warm proxy authentication</title>");
            return;
          }
          authorizations.push(request2.headers.authorization);
          response.writeHead(401, { "www-authenticate": `Basic realm="${state.realm}"` }).end("Authentication required");
        };
        const server = scheme === "https" ? (0, import_node_https.createServer)({ key: key3, cert }, handle) : (0, import_node_http4.createServer)(handle);
        const target = await listen(server);
        const host = scheme === "https" ? "auth.browser.test" : "localhost";
        const url = new URL(`${scheme}://${host}:${target.port}/`);
        const current = await session(url, scheme === "https" ? { proxy: await transport([target.port]) } : {});
        state.realm = current.proxy.credentials.realm;
        (0, import_test.expect)((await current.page.goto(url.href))?.status()).toBe(200);
        const result = await current.page.goto(new URL("/challenge", url).href).then(
          (response) => String(response?.status()),
          (error) => error.message
        );
        (0, import_test.expect)(result).toMatch(/401|ERR_INVALID_AUTH_CREDENTIALS|ERR_HTTP_RESPONSE_CODE_FAILURE/);
        (0, import_test.expect)(authorizations.length).toBeGreaterThan(0);
        (0, import_test.expect)(authorizations.every((value) => value === void 0)).toBe(true);
        (0, import_test.expect)(current.network.active).toBe(true);
      }
    );
  }
  for (const [mode, status] of [
    ["allow", 301],
    ["deny", 301],
    ["allow", 302],
    ["deny", 302]
  ]) {
    (0, import_node_test.test)(`${mode} checks approval at every cross-origin ${status} redirect hop`, { timeout: 2e4 }, async () => {
      const final = await secure("final", (_request, response) => {
        response.writeHead(200, { "content-type": "text/html" }).end("<title>Final origin</title>");
      });
      const destination = new URL("/final", final.url);
      const middle = await secure("middle", (_request, response) => {
        response.writeHead(status, { location: destination.href }).end();
      });
      const hop = new URL("/hop", middle.url);
      const source = await secure("source", (_request, response) => {
        response.writeHead(status, { location: hop.href }).end();
      });
      const entered = Promise.withResolvers();
      const decision = Promise.withResolvers();
      const current = await session(source.url, {
        proxy: await transport([source.port, middle.port, final.port]),
        approve: async (url) => {
          if (url.origin === middle.url.origin) return true;
          entered.resolve(url);
          return decision.promise;
        }
      });
      const navigation = current.page.goto(source.url.href).then(
        (response) => ({ status: response?.status(), error: "" }),
        (error) => ({ status: void 0, error: error.message })
      );
      const requested = await Promise.race([
        entered.promise,
        navigation.then((result2) => {
          throw new Error(`Redirect did not pause: ${result2.error || result2.status}`);
        })
      ]);
      (0, import_test.expect)(requested.href).toBe(destination.href);
      (0, import_test.expect)(current.approvals).toEqual([hop.href, destination.href]);
      (0, import_test.expect)(final.requests).toHaveLength(0);
      const committed = current.page.waitForEvent("framenavigated", (frame) => frame === current.page.mainFrame());
      decision.resolve(mode === "allow");
      const result = await navigation;
      await committed;
      (0, import_test.expect)(middle.requests.filter((request2) => request2.url === "/hop")).toHaveLength(1);
      if (mode === "allow") {
        (0, import_test.expect)(result.status).toBe(200);
        (0, import_test.expect)(current.page.url()).toBe(destination.href);
        (0, import_test.expect)(final.requests.filter((request2) => request2.url === "/final")).toHaveLength(1);
        (0, import_test.expect)((await current.page.goto(source.url.href))?.status()).toBe(200);
        (0, import_test.expect)(current.approvals).toEqual([hop.href, destination.href]);
        return;
      }
      (0, import_test.expect)(result.error).toContain("ERR_BLOCKED_BY_CLIENT");
      (0, import_test.expect)(final.requests).toHaveLength(0);
      (0, import_test.expect)(current.blocked).toEqual([`Navigation to ${final.url.origin} was not approved.`]);
      current.network.authorize(destination);
      (0, import_test.expect)((await current.page.goto(source.url.href))?.status()).toBe(200);
      (0, import_test.expect)(current.approvals).toEqual([hop.href, destination.href]);
    });
  }
  for (const mode of ["deny", "allow"]) {
    (0, import_node_test.test)(
      `${mode} preserves the server's native CORS preflight decision before a credentialed mutation`,
      { timeout: 2e4 },
      async () => {
        const source = await secure("source", (_request, response) => {
          response.writeHead(200, { "content-type": "text/html" }).end('<title>Source</title><link rel="icon" href="data:,">');
        });
        const target = await secure("target", (request2, response) => {
          if (request2.method === "OPTIONS" && mode === "deny") return void response.writeHead(403).end();
          response.writeHead(request2.method === "OPTIONS" ? 204 : 200, {
            "access-control-allow-origin": source.url.origin,
            "access-control-allow-credentials": "true",
            "access-control-allow-methods": "POST",
            "access-control-allow-headers": "content-type"
          });
          response.end(request2.method === "OPTIONS" ? void 0 : "mutated");
        });
        const current = await session(source.url, { proxy: await transport([source.port, target.port]) });
        await current.context.addCookies([
          { url: target.url.href, name: "auth", value: "fixture", httpOnly: true, secure: true, sameSite: "Lax" }
        ]);
        await current.page.goto(source.url.href);
        const result = await current.page.evaluate(
          (url) => fetch(url, {
            method: "POST",
            credentials: "include",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ change: true })
          }).then(
            (response) => response.text(),
            () => "blocked"
          ),
          new URL("/mutation", target.url).href
        );
        (0, import_test.expect)(result).toBe(mode === "allow" ? "mutated" : "blocked");
        const requests = target.requests.filter((request2) => request2.url === "/mutation");
        (0, import_test.expect)(requests.map((request2) => request2.method)).toEqual(mode === "allow" ? ["OPTIONS", "POST"] : ["OPTIONS"]);
        (0, import_test.expect)(requests.at(0)?.headers.cookie).toBeUndefined();
        if (mode === "allow") (0, import_test.expect)(requests.at(1)?.headers.cookie).toBe("auth=fixture");
        (0, import_test.expect)(current.approvals).toEqual([]);
        (0, import_test.expect)(current.logs).toEqual([]);
      }
    );
  }
  (0, import_node_test.test)(
    "public cross-origin scripts, frames, fetch and WSS do not grant navigation permission",
    { timeout: 2e4 },
    async () => {
      const assets = await secure("assets", (request2, response) => {
        if (request2.url === "/script.js") {
          response.writeHead(200, { "content-type": "application/javascript" }).end("document.documentElement.dataset.resource = 'loaded'");
          return;
        }
        if (request2.url === "/fetch") {
          response.writeHead(200, { "access-control-allow-origin": "*" }).end("public resource");
          return;
        }
        response.writeHead(200, { "content-type": "text/html" }).end("<title>Public resource frame</title>");
      });
      const sockets = websocket2(assets.server);
      const source = await secure("source", (_request, response) => {
        response.writeHead(200, { "content-type": "text/html" }).end(
          `<title>Source origin</title><script src="${new URL("/script.js", assets.url)}"></script><iframe src="${new URL("/frame", assets.url)}"></iframe>`
        );
      });
      const current = await session(source.url, { proxy: await transport([source.port, assets.port]) });
      await current.page.goto(source.url.href);
      await current.page.waitForFunction(() => document.documentElement.dataset.resource === "loaded");
      (0, import_test.expect)(
        await current.page.evaluate(
          (url) => fetch(url).then((response) => response.text()),
          new URL("/fetch", assets.url).href
        )
      ).toBe("public resource");
      const echoed = await current.page.evaluate(
        (url) => new Promise((resolve, reject2) => {
          const socket = new WebSocket(url);
          socket.onopen = () => socket.send("public websocket");
          socket.onerror = () => reject2(new Error("Public WSS failed"));
          socket.onmessage = (event) => {
            socket.close();
            resolve(String(event.data));
          };
        }),
        `wss://${assets.url.host}/socket`
      );
      (0, import_test.expect)(echoed).toBe("public websocket");
      (0, import_test.expect)(assets.requests.some((request2) => request2.url === "/frame")).toBe(true);
      (0, import_test.expect)(sockets).toHaveLength(1);
      (0, import_test.expect)(current.approvals).toEqual([]);
      const destination = new URL("/document", assets.url);
      await (0, import_test.expect)(current.page.goto(destination.href)).rejects.toThrow("ERR_BLOCKED_BY_CLIENT");
      (0, import_test.expect)(current.approvals).toEqual([destination.href]);
      (0, import_test.expect)(assets.requests.some((request2) => request2.url === "/document")).toBe(false);
    }
  );
  (0, import_node_test.test)(
    "tracks nested out-of-process frames and closes one context without changing another",
    { timeout: 2e4 },
    async () => {
      const isolated = await launch(true, ["--site-per-process"]);
      cleanup.push(() => isolated.close());
      const leaf = await secure("leaf", (request2, response) => {
        response.writeHead(200, { "content-type": "text/html", "access-control-allow-origin": "*" });
        response.end(
          request2.url === "/fetch" ? "worker resource" : request2.url === "/container" ? '<iframe src="/"></iframe>' : "<h1>Nested frame</h1>"
        );
      });
      const outer = await secure("outer", (_request, response) => {
        response.writeHead(200, { "content-type": "text/html" }).end(`<iframe src="${leaf.url}"></iframe>`);
      });
      outer.url.hostname = "8.8.8.8";
      const source = await secure("source", (_request, response) => {
        response.writeHead(200, { "content-type": "text/html" }).end(`<iframe src="${outer.url}"></iframe>`);
      });
      const ports = [source.port, outer.port, leaf.port];
      const [current, other] = await Promise.all([
        session(source.url, { browser: isolated, proxy: await transport(ports) }),
        session(source.url, { browser: isolated, proxy: await transport(ports) })
      ]);
      await Promise.all([current.page.goto(source.url.href), other.page.goto(source.url.href)]);
      const nested = current.page.frameLocator("iframe").frameLocator("iframe").locator("h1");
      await nested.waitFor();
      (0, import_test.expect)(await nested.textContent()).toBe("Nested frame");
      const frame = current.page.frames().find((frame2) => frame2.url() === outer.url.href);
      if (!frame) throw new Error("Missing out-of-process fixture frame");
      const protocol = await current.context.newCDPSession(frame);
      (0, import_test.expect)((await protocol.send("Target.getTargetInfo")).targetInfo.type).toBe("iframe");
      await protocol.detach();
      const result = await frame.evaluate(async (url) => {
        const code = `fetch(${JSON.stringify(url)}).then(response => response.text()).then(value => postMessage(value), () => postMessage('blocked'))`;
        const source2 = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
        const worker = new Worker(source2);
        const result2 = Promise.withResolvers();
        worker.onmessage = (event) => result2.resolve(String(event.data));
        worker.onerror = () => result2.resolve("failed");
        return result2.promise.finally(() => {
          worker.terminate();
          URL.revokeObjectURL(source2);
        });
      }, new URL("/fetch", leaf.url).href);
      (0, import_test.expect)(result).toBe("worker resource");
      for (const url of [new URL("/container", leaf.url).href, outer.url.href]) {
        const count = leaf.requests.filter((request2) => request2.url === "/").length;
        const navigated = current.page.waitForEvent("framenavigated", (frame2) => frame2.url() === url);
        await current.page.locator("iframe").evaluate((frame2, url2) => frame2.setAttribute("src", url2), url);
        await navigated;
        if (url === outer.url.href) await nested.waitFor();
        if (url !== outer.url.href) {
          const parent = current.page.frames().find((frame2) => frame2.url() === url);
          if (!parent) throw new Error("Missing fixture frame after the process swap");
          await parent.waitForFunction(() => {
            const doc = document.querySelector("iframe")?.contentDocument;
            const heading = doc?.querySelector("h1");
            if (!heading || doc?.readyState !== "complete") return false;
            const rect = heading.getBoundingClientRect();
            return heading.textContent === "Nested frame" && getComputedStyle(heading).visibility === "visible" && rect.width > 0 && rect.height > 0;
          });
        }
        (0, import_test.expect)(leaf.requests.filter((request2) => request2.url === "/")).toHaveLength(count + 1);
      }
      (0, import_test.expect)(
        await frame.evaluate((url) => fetch(url).then((response) => response.text()), new URL("/fetch", leaf.url).href)
      ).toBe("worker resource");
      const detached = current.page.waitForEvent("framedetached", (value) => value === frame);
      await current.page.evaluate(() => document.querySelector("iframe")?.remove());
      await detached;
      (0, import_test.expect)(current.network.active).toBe(true);
      await current.page.reload();
      await nested.waitFor();
      await Promise.all([current.network.close(), current.context.close()]);
      (0, import_test.expect)(current.network.active).toBe(false);
      (0, import_test.expect)((await other.page.reload())?.status()).toBe(200);
      await other.page.frameLocator("iframe").frameLocator("iframe").locator("h1").waitFor();
      (0, import_test.expect)(other.network.active).toBe(true);
      (0, import_test.expect)(current.approvals).toEqual([]);
      (0, import_test.expect)(other.approvals).toEqual([]);
      (0, import_test.expect)(current.logs).toEqual([]);
      (0, import_test.expect)(other.logs).toEqual([]);
      await isolated.close();
      (0, import_test.expect)(other.network.active).toBe(false);
      await (0, import_test.expect)(fetch(other.proxy.proxy.server)).rejects.toThrow();
    }
  );
  for (const mode of ["direct", "noopener", "blank", "new-page"]) {
    (0, import_node_test.test)(
      `blocks the first ${mode} popup HTTPS request with cached proxy auth and a warm connection`,
      { timeout: 2e4 },
      async () => {
        const target = await secure("popup", (_request, response) => {
          response.writeHead(200, { "content-type": "text/html", "access-control-allow-origin": "*" });
          response.end("<title>Unapproved popup</title>");
        });
        const destination = new URL("/first-request", target.url);
        const script = mode === "blank" ? `window.open('about:blank').location = '${destination.href}'` : `window.open('${destination.href}', '_blank', '${mode === "noopener" ? "noopener" : ""}')`;
        const source = await secure("source", (_request, response) => {
          response.writeHead(200, { "content-type": "text/html" }).end(
            `<button>Open popup</button><script>document.querySelector('button').onclick = () => { ${script} }</script>`
          );
        });
        const current = await session(source.url, { proxy: await transport([source.port, target.port]) });
        await current.context.addCookies([
          { url: target.url.href, name: "popup", value: "fixture", httpOnly: true, secure: true, sameSite: "Lax" }
        ]);
        (0, import_test.expect)((await current.page.goto(source.url.href))?.status()).toBe(200);
        await current.page.evaluate(
          (url) => fetch(url).then((response) => response.text()),
          new URL("/warm", target.url).href
        );
        const finished = Promise.withResolvers();
        const complete = (request2) => {
          if (request2.url() === destination.href) finished.resolve(request2.failure()?.errorText);
        };
        current.context.on("requestfinished", complete);
        current.context.on("requestfailed", complete);
        const opened = current.context.waitForEvent("page");
        if (mode === "new-page") {
          const page = await current.context.newCDPSession(current.page);
          const { targetInfo: owner } = await page.send("Target.getTargetInfo");
          await page.detach();
          const monitor = await browser.newBrowserCDPSession();
          await monitor.send("Target.createTarget", { url: destination.href, browserContextId: owner.browserContextId });
          await monitor.detach();
        }
        if (mode !== "new-page") await current.page.getByRole("button", { name: "Open popup" }).click();
        const popup = await opened;
        if (mode === "new-page") {
          await popup.waitForLoadState("domcontentloaded");
          const page = await current.context.newCDPSession(popup);
          const tree = await page.send("Page.getFrameTree");
          (0, import_test.expect)(tree.frameTree.frame.unreachableUrl).toBe(destination.href);
          await page.detach();
        }
        if (mode !== "new-page") (0, import_test.expect)(await finished.promise).toBe("net::ERR_BLOCKED_BY_CLIENT");
        await popup.close();
        current.context.off("requestfinished", complete);
        current.context.off("requestfailed", complete);
        (0, import_test.expect)(target.requests.map((request2) => request2.url)).toEqual(["/warm"]);
        (0, import_test.expect)(current.approvals).toEqual([]);
        (0, import_test.expect)(current.network.active).toBe(true);
        (0, import_test.expect)(current.logs).toEqual([]);
        (0, import_test.expect)((await current.page.reload())?.status()).toBe(200);
      }
    );
  }
  (0, import_node_test.test)(
    "expires pending broker approval without blaming the server or allowing a late response",
    { timeout: 45e3 },
    async () => {
      const target = await secure("approval", (_request, response) => {
        response.writeHead(200, { "content-type": "text/html" }).end("<title>Unapproved target</title>");
      });
      const source = await secure("source", (_request, response) => {
        response.writeHead(301, { location: target.url.href }).end();
      });
      const proxy = await transport([source.port, target.port]);
      proxies.push(proxy);
      const entered = Promise.withResolvers();
      const decision = Promise.withResolvers();
      const settled = Promise.withResolvers();
      const logs = [];
      const broker = new BrowserBroker({
        log: (...args) => logs.push(args),
        launch: async () => ({
          newContext: async (opts) => {
            const context = await browser.newContext({ ...opts, proxy: proxy.proxy });
            contexts.push(context);
            return context;
          },
          close: async () => void 0
        }),
        network: async (page, opts) => {
          const network = await BrowserNetwork.attach(page, {
            ...opts,
            proxy,
            approve: async (url) => {
              const allowed = await opts.approve(url);
              settled.resolve(allowed);
              return allowed;
            }
          });
          networks.push(network);
          return network;
        }
      });
      cleanup.push(() => broker.disposeAsync());
      broker.bind(
        (route2) => route2,
        async () => {
          entered.resolve();
          return decision.promise;
        }
      );
      const route = { projectId: "project", sessionId: "approval", directory: "/tmp/project" };
      const navigation = broker.open(route, source.url.href).then(
        () => "loaded",
        (error2) => error2.message
      );
      await entered.promise;
      (0, import_test.expect)(target.requests).toHaveLength(0);
      const error = await navigation;
      (0, import_test.expect)(error).toBe(
        "Browser navigation stopped while waiting for approval in VS Code. Dismiss the approval prompt and retry."
      );
      (0, import_test.expect)(broker.get(route.sessionId, route.projectId)).toMatchObject({ status: "error", error });
      (0, import_test.expect)(networks.at(-1)?.active).toBe(false);
      decision.resolve(true);
      (0, import_test.expect)(await settled.promise).toBe(false);
      (0, import_test.expect)(target.requests).toHaveLength(0);
      await (0, import_test.expect)(fetch(proxy.proxy.server)).rejects.toThrow();
      (0, import_test.expect)(logs).toEqual([]);
    }
  );
  (0, import_node_test.test)("retires routing and pending approvals without leaving cached proxy access", { timeout: 2e4 }, async () => {
    const target = await secure("retired", (_request, response) => {
      response.writeHead(200, { "content-type": "text/html" }).end("<title>Unapproved destination</title>");
    });
    const source = await secure("source", (_request, response) => {
      response.writeHead(200, { "content-type": "text/html" }).end("<title>Source</title>");
    });
    const entered = Promise.withResolvers();
    const decision = Promise.withResolvers();
    const current = await session(source.url, {
      proxy: await transport([source.port, target.port]),
      approve: async () => {
        entered.resolve();
        return decision.promise;
      }
    });
    const waiting2 = Promise.withResolvers();
    const permission = Promise.withResolvers();
    const other = await session(source.url, {
      proxy: await transport([source.port, target.port]),
      approve: async () => {
        waiting2.resolve();
        return permission.promise;
      }
    });
    (0, import_test.expect)((await current.page.goto(source.url.href))?.status()).toBe(200);
    (0, import_test.expect)((await other.page.goto(source.url.href))?.status()).toBe(200);
    const navigation = current.page.goto(target.url.href).then(
      () => "loaded",
      (error) => error.message
    );
    await Promise.race([
      entered.promise,
      navigation.then((result) => {
        throw new Error(`Navigation did not pause: ${result}`);
      })
    ]);
    const pending = other.page.goto(new URL("/survivor", target.url).href).then(
      (response) => response?.status(),
      (error) => error.message
    );
    await waiting2.promise;
    await current.network.close();
    (0, import_test.expect)(await navigation).toContain("ERR_BLOCKED_BY_CLIENT");
    (0, import_test.expect)(current.network.active).toBe(false);
    (0, import_test.expect)(target.requests).toHaveLength(0);
    permission.resolve(true);
    (0, import_test.expect)(await pending).toBe(200);
    decision.resolve(true);
    (0, import_test.expect)(target.requests.some((request2) => request2.url === "/")).toBe(false);
    const contacts = source.contacts();
    await (0, import_test.expect)(current.page.goto(new URL("/after-close", source.url).href)).rejects.toThrow();
    (0, import_test.expect)(source.requests.some((request2) => request2.url === "/after-close")).toBe(false);
    (0, import_test.expect)(source.contacts()).toBe(contacts);
    (0, import_test.expect)((await other.page.reload())?.status()).toBe(200);
    (0, import_test.expect)(other.network.active).toBe(true);
    (0, import_test.expect)(current.logs).toEqual([]);
  });
  (0, import_node_test.test)("certificate errors remain errors without the fixture-only certificate pin", { timeout: 2e4 }, async () => {
    const source = await secure("untrusted", (_request, response) => response.end("must not load"));
    const untrusted = await launch(false);
    cleanup.push(() => untrusted.close());
    const current = await session(source.url, { browser: untrusted, proxy: await transport([source.port]) });
    await (0, import_test.expect)(current.page.goto(source.url.href)).rejects.toThrow("ERR_CERT_");
    (0, import_test.expect)(source.requests).toHaveLength(0);
  });
  for (const host of ["google.com", "www.google.com"]) {
    (0, import_node_test.test)(
      `Google HTTPS manual probe: ${host}`,
      { skip: process.env.KILO_BROWSER_GOOGLE_SMOKE !== "1", timeout: 3e4 },
      async () => {
        const external = await launch(false);
        cleanup.push(() => external.close());
        const url = new URL(`https://${host}/`);
        const current = await session(url, {
          browser: external,
          approve: async (target) => ["https://www.google.com", "https://consent.google.com"].includes(target.origin)
        });
        const response = await current.page.goto(url.href, { waitUntil: "domcontentloaded", timeout: 2e4 }).then(
          (response2) => ({ status: response2?.status(), error: void 0 }),
          (error) => ({ status: void 0, error: error.message })
        );
        (0, import_test.expect)({
          ...response,
          approvals: current.approvals,
          blocked: current.blocked,
          logs: current.logs
        }).toMatchObject({
          status: 200,
          error: void 0,
          blocked: [],
          logs: []
        });
        if (host === "google.com") {
          (0, import_test.expect)(current.approvals.some((url2) => new URL(url2).origin === "https://www.google.com")).toBe(true);
        }
        (0, import_test.expect)(await current.page.title()).toContain("Google");
        (0, import_test.expect)(current.network.active).toBe(true);
      }
    );
  }
  (0, import_node_test.test)(
    "Google broker navigation probe",
    { skip: process.env.KILO_BROWSER_GOOGLE_SMOKE !== "1", timeout: 6e4 },
    async () => {
      const logs = [];
      const approvals = [];
      const broker = new BrowserBroker({
        log: (...args) => logs.push(args),
        useSystemChrome: () => false,
        launch: (config) => import_playwright_core2.chromium.launch({ ...config, executablePath: executable })
      });
      cleanup.push(() => broker.disposeAsync());
      const views = /* @__PURE__ */ new Set();
      const streaming = [];
      broker.subscribe((state) => {
        if (state.status !== "loading" || views.has(state.browserId)) return;
        views.add(state.browserId);
        streaming.push(
          broker.viewport(state.sessionId, state.projectId, state.browserId, state.navigation, {
            width: 640,
            height: 480,
            revision: 1,
            active: true
          })
        );
      });
      const route = { projectId: "project", sessionId: "google", directory: "/tmp/project" };
      broker.bind(
        (scope2) => scope2,
        async (_scope, url) => {
          approvals.push(url.origin);
          return ["https://www.google.com", "https://consent.google.com"].includes(url.origin);
        }
      );
      const local2 = await listen(
        (0, import_node_http4.createServer)((_request, response) => {
          response.writeHead(200, { "content-type": "text/html" }).end("<title>Local fixture</title>");
        })
      );
      (0, import_test.expect)((await broker.open(route, `http://127.0.0.1:${local2.port}/`)).status).toBe("ready");
      for (const url of ["https://google.com/", "https://www.google.com/", "https://google.com/"]) {
        const state = await broker.open(route, url);
        (0, import_test.expect)(state.status).toBe("ready");
        (0, import_test.expect)(state.title).toContain("Google");
        (0, import_test.expect)(state.screenshot).toMatch(/^data:image\/jpeg;base64,/);
        (0, import_test.expect)(state.error).toBeUndefined();
      }
      await Promise.all(streaming);
      (0, import_test.expect)(approvals).toContain("https://www.google.com");
      (0, import_test.expect)(logs).toEqual([]);
    }
  );
  (0, import_node_test.test)("remote pages and workers make no forbidden loopback TCP or UDP contact", { timeout: 2e4 }, async () => {
    const sentinel = await listen((0, import_node_net4.createServer)((socket) => socket.destroy()));
    const datagrams = (0, import_node_dgram.createSocket)("udp4");
    const traffic = { packets: 0 };
    datagrams.on("message", () => traffic.packets++);
    const ready = (0, import_node_events2.once)(datagrams, "listening");
    datagrams.bind(0, "127.0.0.1");
    await ready;
    const port = datagrams.address().port;
    cleanup.push(() => new Promise((resolve) => datagrams.close(() => resolve())));
    const source = await secure("source", (_request, response) => {
      response.writeHead(200, { "content-type": "text/html" }).end("<title>Remote source</title>");
    });
    const current = await session(source.url, { proxy: await transport([source.port]) });
    await current.page.goto(source.url.href);
    (0, import_test.expect)(await current.page.evaluate(() => isSecureContext)).toBe(true);
    for (const offline of [false, true]) {
      if (offline) await current.proxy.close();
      const result = await current.page.evaluate(
        async ({ tcp: tcp2, udp }) => {
          const bounded = async (promise) => {
            const expired = Promise.withResolvers();
            const timer = setTimeout(() => expired.resolve("timeout"), 1500);
            return Promise.race([promise, expired.promise]).finally(() => clearTimeout(timer));
          };
          const fetches = async (url) => {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 1500);
            return fetch(url, { mode: "no-cors", signal: controller.signal }).then(
              () => "loaded",
              () => "blocked"
            ).finally(() => clearTimeout(timer));
          };
          const socket = async (url) => {
            const result2 = Promise.withResolvers();
            const value = new WebSocket(url);
            value.onopen = () => result2.resolve("open");
            value.onerror = () => result2.resolve("blocked");
            return bounded(result2.promise).finally(() => value.close());
          };
          const worker = async () => {
            const url = URL.createObjectURL(
              new Blob(
                [
                  "onmessage = event => fetch(event.data, { mode: 'no-cors' }).then(() => postMessage('loaded'), () => postMessage('blocked'))"
                ],
                { type: "application/javascript" }
              )
            );
            const value = new Worker(url);
            const result2 = Promise.withResolvers();
            value.onmessage = (event) => result2.resolve(String(event.data));
            value.onerror = () => result2.resolve("blocked");
            value.postMessage(`https://loop.browser.test:${tcp2}/worker`);
            return bounded(result2.promise).finally(() => {
              value.terminate();
              URL.revokeObjectURL(url);
            });
          };
          const rtc = async () => {
            if (typeof RTCPeerConnection === "undefined") return "unavailable";
            const result2 = Promise.withResolvers();
            const peer = new RTCPeerConnection({
              iceServers: [
                { urls: `stun:127.0.0.1:${udp}` },
                {
                  urls: [`turn:127.0.0.1:${tcp2}?transport=tcp`, `turns:127.0.0.1:${tcp2}?transport=tcp`],
                  username: "fixture",
                  credential: "fixture"
                }
              ]
            });
            peer.onicegatheringstatechange = () => {
              if (peer.iceGatheringState === "complete") result2.resolve("complete");
            };
            peer.createDataChannel("probe");
            await peer.setLocalDescription(await peer.createOffer());
            return bounded(result2.promise).finally(() => peer.close());
          };
          const transport2 = async () => {
            if (typeof WebTransport === "undefined") return "unavailable";
            const value = new WebTransport(`https://127.0.0.1:${udp}/probe`);
            void value.closed.catch(() => "blocked");
            return bounded(
              value.ready.then(
                () => "open",
                () => "blocked"
              )
            ).finally(() => value.close());
          };
          return Promise.all([
            fetches(`http://127.0.0.1:${tcp2}/http`),
            fetches(`https://127.0.0.1:${tcp2}/https`),
            fetches(`https://loop.browser.test:${tcp2}/dns`),
            socket(`ws://127.0.0.1:${tcp2}/ws`),
            socket(`wss://127.0.0.1:${tcp2}/wss`),
            worker(),
            rtc(),
            transport2()
          ]);
        },
        { tcp: sentinel.port, udp: port }
      );
      await new Promise((resolve) => setImmediate(resolve));
      (0, import_test.expect)(result).not.toContain("loaded");
      (0, import_test.expect)(result).not.toContain("open");
      (0, import_test.expect)(result).not.toContain("unavailable");
      (0, import_test.expect)(sentinel.contacts()).toBe(0);
      (0, import_test.expect)(traffic.packets).toBe(0);
    }
  });
  (0, import_node_test.test)(
    "a failed proxy does not fall back to direct loopback HTTP or WebSocket connections",
    { timeout: 2e4 },
    async () => {
      const requests = [];
      const server = (0, import_node_http4.createServer)((request2, response) => {
        requests.push(request2.url ?? "");
        response.writeHead(200, { "content-type": "text/html" }).end("<title>Local fixture</title>");
      });
      const target = await listen(server);
      const sockets = websocket2(server);
      const url = new URL(`http://localhost:${target.port}/`);
      const current = await session(url);
      await current.page.goto(url.href);
      await current.proxy.close();
      const contacts = target.contacts();
      const outcome = await current.page.evaluate(
        (url2) => new Promise((resolve) => {
          const socket = new WebSocket(url2);
          socket.onopen = () => {
            socket.close();
            resolve("open");
          };
          socket.onerror = () => resolve("error");
        }),
        `ws://localhost:${target.port}/after-close`
      );
      (0, import_test.expect)(outcome).toBe("error");
      await (0, import_test.expect)(current.page.goto(new URL("/after-close", url).href)).rejects.toThrow();
      (0, import_test.expect)(requests).not.toContain("/after-close");
      (0, import_test.expect)(sockets).toHaveLength(0);
      (0, import_test.expect)(target.contacts()).toBe(contacts);
    }
  );
});

'use strict'
/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
var __awaiter =
    (this && this.__awaiter) ||
    function (thisArg, _arguments, P, generator) {
        function adopt(value) {
            return value instanceof P
                ? value
                : new P(function (resolve) {
                      resolve(value)
                  })
        }
        return new (P || (P = Promise))(function (resolve, reject) {
            function fulfilled(value) {
                try {
                    step(generator.next(value))
                } catch (e) {
                    reject(e)
                }
            }
            function rejected(value) {
                try {
                    step(generator['throw'](value))
                } catch (e) {
                    reject(e)
                }
            }
            function step(result) {
                result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected)
            }
            step((generator = generator.apply(thisArg, _arguments || [])).next())
        })
    }
var __generator =
    (this && this.__generator) ||
    function (thisArg, body) {
        var _ = {
                label: 0,
                sent: function () {
                    if (t[0] & 1) throw t[1]
                    return t[1]
                },
                trys: [],
                ops: [],
            },
            f,
            y,
            t,
            g
        return (
            (g = { next: verb(0), throw: verb(1), return: verb(2) }),
            typeof Symbol === 'function' &&
                (g[Symbol.iterator] = function () {
                    return this
                }),
            g
        )
        function verb(n) {
            return function (v) {
                return step([n, v])
            }
        }
        function step(op) {
            if (f) throw new TypeError('Generator is already executing.')
            while ((g && ((g = 0), op[0] && (_ = 0)), _))
                try {
                    if (
                        ((f = 1),
                        y &&
                            (t =
                                op[0] & 2
                                    ? y['return']
                                    : op[0]
                                    ? y['throw'] || ((t = y['return']) && t.call(y), 0)
                                    : y.next) &&
                            !(t = t.call(y, op[1])).done)
                    )
                        return t
                    if (((y = 0), t)) op = [op[0] & 2, t.value]
                    switch (op[0]) {
                        case 0:
                        case 1:
                            t = op
                            break
                        case 4:
                            _.label++
                            return { value: op[1], done: false }
                        case 5:
                            _.label++
                            y = op[1]
                            op = [0]
                            continue
                        case 7:
                            op = _.ops.pop()
                            _.trys.pop()
                            continue
                        default:
                            if (
                                !((t = _.trys), (t = t.length > 0 && t[t.length - 1])) &&
                                (op[0] === 6 || op[0] === 2)
                            ) {
                                _ = 0
                                continue
                            }
                            if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) {
                                _.label = op[1]
                                break
                            }
                            if (op[0] === 6 && _.label < t[1]) {
                                _.label = t[1]
                                t = op
                                break
                            }
                            if (t && _.label < t[2]) {
                                _.label = t[2]
                                _.ops.push(op)
                                break
                            }
                            if (t[2]) _.ops.pop()
                            _.trys.pop()
                            continue
                    }
                    op = body.call(thisArg, _)
                } catch (e) {
                    op = [6, e]
                    y = 0
                } finally {
                    f = t = 0
                }
            if (op[0] & 5) throw op[1]
            return { value: op[0] ? op[1] : void 0, done: true }
        }
    }
Object.defineProperty(exports, '__esModule', { value: true })
/*
 * This script removes the specified folders.
 * Used to perform a clean compile, which is useful for things like:
 *   - flushing out stale test files.
 *   - updating dependencies after changing branches
 */
var fs = require('fs')
var path = require('path')
var util = require('util')
var readFile = util.promisify(fs.readFile)
var readdir = util.promisify(fs.readdir)
var rmdir = util.promisify(fs.rmdir)
var stat = util.promisify(fs.stat)
var unlink = util.promisify(fs.unlink)
// Recursive delete without requiring a third-party library. This allows the script
// to be run before `npm install`.
function rdelete(p) {
    return __awaiter(this, void 0, void 0, function () {
        var stats, _a, promises
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    return [4 /*yield*/, stat(p)]
                case 1:
                    stats = _b.sent()
                    if (!stats.isFile() && !stats.isDirectory()) {
                        throw new Error("Could not delete '".concat(p, "' because it is neither a file nor directory"))
                    }
                    _b.label = 2
                case 2:
                    _b.trys.push([2, 4, , 8])
                    return [4 /*yield*/, unlink(p)]
                case 3:
                    _b.sent()
                    return [3 /*break*/, 8]
                case 4:
                    _a = _b.sent()
                    return [4 /*yield*/, readdir(p)]
                case 5:
                    promises = _b.sent().map(function (child) {
                        return rdelete(path.join(p, child))
                    })
                    return [4 /*yield*/, Promise.all(promises)]
                case 6:
                    _b.sent()
                    return [4 /*yield*/, rmdir(p)]
                case 7:
                    _b.sent()
                    return [3 /*break*/, 8]
                case 8:
                    return [2 /*return*/]
            }
        })
    })
}
function tryDeleteRelative(p) {
    return __awaiter(this, void 0, void 0, function () {
        var target, e_1
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3])
                    target = path.resolve(process.cwd(), p)
                    if (!exists(target)) {
                        console.log(
                            "Could not access '".concat(
                                target,
                                "', probably because it does not exist. Skipping clean for this path."
                            )
                        )
                        return [2 /*return*/]
                    }
                    return [4 /*yield*/, rdelete(target)]
                case 1:
                    _a.sent()
                    return [3 /*break*/, 3]
                case 2:
                    e_1 = _a.sent()
                    console.error("Could not clean '".concat(p, "': ").concat(String(e_1)))
                    return [3 /*break*/, 3]
                case 3:
                    return [2 /*return*/]
            }
        })
    })
}
function exists(p) {
    try {
        fs.accessSync(p)
        return true
    } catch (_a) {
        return false
    }
}
function getGenerated() {
    return __awaiter(this, void 0, void 0, function () {
        var p, data, _a, _b, e_2
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    if (!exists(path.join(process.cwd(), 'dist'))) {
                        return [2 /*return*/, []]
                    }
                    p = path.join(process.cwd(), 'dist', 'generated.buildinfo')
                    _c.label = 1
                case 1:
                    _c.trys.push([1, 3, , 4])
                    _b = (_a = JSON).parse
                    return [4 /*yield*/, readFile(p, 'utf-8')]
                case 2:
                    data = _b.apply(_a, [_c.sent()])
                    if (
                        !Array.isArray(data) ||
                        !data.every(function (d) {
                            return typeof d === 'string'
                        })
                    ) {
                        throw new Error('File manifest was not an array of strings')
                    }
                    return [2 /*return*/, data]
                case 3:
                    e_2 = _c.sent()
                    console.log('Failed to read "generated.buildinfo": '.concat(String(e_2)))
                    return [2 /*return*/, []]
                case 4:
                    return [2 /*return*/]
            }
        })
    })
}
void (function () {
    return __awaiter(void 0, void 0, void 0, function () {
        var args, _a, _b
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    _b = (_a = process.argv.slice(2)).concat
                    return [4 /*yield*/, getGenerated()]
                case 1:
                    args = _b.apply(_a, [_c.sent()])
                    return [4 /*yield*/, Promise.all(args.map(tryDeleteRelative))]
                case 2:
                    _c.sent()
                    return [2 /*return*/]
            }
        })
    })
})()

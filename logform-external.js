'use strict'

/*
 * @api public
 * @property {function} format
 * Both the construction method and set of exposed
 * formats.
 */
const format = (exports.format = require('logform/format'))

/*
 * @api public
 * @method {function} levels
 * Registers the specified levels with logform.
 */
exports.levels = require('logform/levels')

/*
 * @api private
 * method {function} exposeFormat
 * Exposes a sub-format on the main format object
 * as a lazy-loaded getter.
 */
function exposeFormat(name, requireFormat) {
    Object.defineProperty(format, name, {
        get() {
            return requireFormat()
        },
        configurable: true,
    })
}

//
// Setup all transports as lazy-loaded getters.
//
exposeFormat('align', function () {
    return require('logform/align')
})
exposeFormat('errors', function () {
    return require('logform/errors')
})
exposeFormat('cli', function () {
    return require('logform/cli')
})
exposeFormat('combine', function () {
    return require('logform/combine')
})
exposeFormat('colorize', function () {
    return require('logform/colorize')
})
exposeFormat('json', function () {
    return require('logform/json')
})
exposeFormat('label', function () {
    return require('logform/label')
})
exposeFormat('logstash', function () {
    return require('logform/logstash')
})
exposeFormat('metadata', function () {
    return require('logform/metadata')
})
exposeFormat('ms', function () {
    return require('logform/ms')
})
exposeFormat('padLevels', function () {
    return require('logform/pad-levels')
})
exposeFormat('prettyPrint', function () {
    return require('logform/pretty-print')
})
exposeFormat('printf', function () {
    return require('logform/printf')
})
exposeFormat('simple', function () {
    return require('logform/simple')
})
exposeFormat('splat', function () {
    return require('logform/splat')
})
exposeFormat('timestamp', function () {
    return require('logform/timestamp')
})
exposeFormat('uncolorize', function () {
    return require('logform/uncolorize')
})

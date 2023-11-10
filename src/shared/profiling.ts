/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getLogger } from './logger/logger'

const performance = globalThis.performance ?? require('perf_hooks').performance
const times: {
    [name: string]: {
        time: number
        parent: string | undefined
        children: string[]
    }
} = {}

let currentScope = 'toplevel'

/**
 * Executes function `fn` with the given arguments and records the elapsed time.
 *
 * Note: to pass a _class member_, bind `this` by passing an "arrow function" (yay javascript 💩):
 *
 *     const auth = timed('AuthUtil.instance', () => AuthUtil.instance)
 *
 * To pass an _async class member_, remember to _invoke_ the function so it returns a promise
 * (which `timed()` will invoke):
 *
 *     await timed('schemaService.start()', () => globals.schemaService.start())
 *
 * TODO: merge this into TelemetryTracer.run() or a new TelemetryTracer.runTimed() function.
 *
 */
export function timed<T>(name_: string | undefined, fn: (...args: any[]) => Promise<T>, ...args: any[]): Promise<T>
export function timed<T>(name_: string | undefined, fn: (...args: any[]) => T, ...args: any[]): T
export function timed<T>(
    name_: string | undefined,
    fn: ((...args: any[]) => T) | ((...args: any[]) => Promise<T>),
    ...args: any[]
): T | Promise<T> {
    const name = name_ ? name_ : fn.name
    if (performance.getEntriesByName(name).length) {
        throw Error(`name must be non-empty and unique: "${name}"`)
        // throw Error('name must be non-empty')
    }
    times[name] = times[name] ?? { time: 0, parent: undefined, children: [] }
    if (times[currentScope]) {
        times[name].parent = currentScope
        times[currentScope].children.push(name)
    }
    const oldScope = currentScope
    currentScope = name
    const start = performance.now()
    // performance.mark(name, { startTime: start })

    const after = () => {
        const m = performance.measure(name, { start: start, end: performance.now() })
        times[name].time = m.duration
        currentScope = oldScope // TODO: deal with concurrent async executions.
    }

    const rv = fn(...args)
    if (rv instanceof Promise) {
        return rv.then(r => {
            after()
            return r
        })
    }

    after()
    return rv
}

function fmtEntry(name: string, time: number, depth: number) {
    const indent = '    ' + '    '.repeat(depth)
    const padding = Math.max(0, 40 - 4 * depth)
    return `${indent}${name.padEnd(padding, ' ')}: ${time.toFixed(1)}\n`
}

function fmtChildren(name: string, depth: number) {
    let s = ''
    for (const childName of times[name].children ?? []) {
        const childEntry = times[childName]
        s += fmtEntry(childName, childEntry.time, depth)
        s += fmtChildren(childName, depth + 1)
    }
    return s
}

export function report() {
    try {
        let s = ''
        for (const t of performance.getEntries()) {
            if (times[t.name].parent) {
                continue
            }
            s += fmtEntry(t.name, t.duration, 0)
            s += fmtChildren(t.name, 1)
        }
        getLogger().verbose(`Toolkit startup performance\n<toolkit-startup>\n${s}</toolkit-startup>\n`)
    } catch (e) {
        getLogger().error('profiling.report() failed', e)
    }
}

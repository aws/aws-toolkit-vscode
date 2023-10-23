/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import TransportStream from 'winston-transport'
import globals from '../extensionGlobals'

export const MESSAGE = Symbol.for('message') // eslint-disable-line @typescript-eslint/naming-convention

interface LogEntry {
    level: string
    message: string
    [MESSAGE]: string
}

/**
 * Inspired from: https://github.com/MarcoMedrano/winston-transport-browserconsole/blob/master/src/lib/BrowserConsole.ts
 */
export class ConsoleLogTransport extends TransportStream {
    constructor(opts?: TransportStream.TransportStreamOptions, private readonly _console = console) {
        super(opts)
    }

    /**
     * Does the work of logging the message to the console.
     *
     * @returns a promise that resolves when the log entry is written to the console, this is useful
     *          for testing.
     */
    public override log(logEntry: LogEntry, next: () => void): Promise<void> {
        const promise = new Promise<void>(resolve => {
            // We use setImmediate to not block execution since
            // log order does not matter in this case
            globals.clock.setImmediate(() => {
                const level = logEntry.level
                const message = logEntry[MESSAGE]

                if (ConsoleLogTransport.isSupportedLogLevel(level)) {
                    this._console[level](message)
                } else {
                    this._console.log(message)
                }
                resolve()
            })
        })

        next()
        return promise
    }

    private static isSupportedLogLevel(method: string | undefined): method is Level {
        return method !== undefined && Object.keys(Levels).includes(method)
    }
}

// https://github.com/winstonjs/winston#logging-levels
export const Levels = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 5,
} as const

export type Level = keyof typeof Levels

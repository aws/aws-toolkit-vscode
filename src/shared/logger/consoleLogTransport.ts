/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as Transport from 'winston-transport'
import globals from '../extensionGlobals'

const MESSAGE = Symbol.for('message') // eslint-disable-line @typescript-eslint/naming-convention

interface LogEntry {
    level: string
    message: string
    [MESSAGE]: string
}

/**
 * This transport sends log statements to console.log
 * It is primarily intended for testing, where having the log output could assist in diagnosing issues.
 */
export class ConsoleLogTransport extends Transport {
    public constructor(options: Transport.TransportStreamOptions) {
        super(options)
    }

    public log(info: LogEntry, next: () => void): void {
        globals.clock.setImmediate(() => {
            this.emit('logged', info)
            console.log(info[MESSAGE])
        })

        next()
    }
}

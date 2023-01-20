/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as Transport from 'winston-transport'
import globals from '../extensionGlobals'

export const MESSAGE = Symbol.for('message') // eslint-disable-line @typescript-eslint/naming-convention

interface LogEntry {
    level: string
    message: string
    [MESSAGE]: string
}

export class DebugConsoleTransport extends Transport {
    public constructor(
        options: Transport.TransportStreamOptions & {
            name: string
        }
    ) {
        super(options)
    }

    public log(info: LogEntry, next: () => void): void {
        globals.clock.setImmediate(() => {
            vscode.debug.activeDebugConsole.append(info[MESSAGE])
            this.emit('logged', info)
        })

        next()
    }
}

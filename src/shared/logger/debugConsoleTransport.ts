/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as Transport from 'winston-transport'

export const MESSAGE = Symbol.for('message')

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
        setImmediate(() => {
            vscode.debug.activeDebugConsole.append(info[MESSAGE])
        })

        next()
    }
}

/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import Transport from 'winston-transport'
import globals from '../extensionGlobals'
import { removeAnsi } from '../utilities/textUtilities'

export const MESSAGE = Symbol.for('message') // eslint-disable-line @typescript-eslint/naming-convention

interface LogEntry {
    level: string
    message: string
    [MESSAGE]: string
    raw: boolean
}

export class OutputChannelTransport extends Transport {
    private readonly outputChannel: Pick<vscode.OutputChannel, 'append' | 'appendLine'>
    private readonly stripAnsi: boolean

    public constructor(
        options: Transport.TransportStreamOptions & {
            outputChannel: Pick<vscode.OutputChannel, 'append' | 'appendLine'>
            stripAnsi?: boolean
            name?: string
        }
    ) {
        super(options)

        this.outputChannel = options.outputChannel
        this.stripAnsi = options.stripAnsi ?? false
    }

    public override log(info: LogEntry, next: () => void): void {
        globals.clock.setImmediate(() => {
            const msg = this.stripAnsi ? removeAnsi(info[MESSAGE]) : info[MESSAGE]

            if (info.raw) {
                this.outputChannel.append(msg)
            } else {
                this.outputChannel.appendLine(msg)
            }

            this.emit('logged', info)
        })

        next()
    }
}

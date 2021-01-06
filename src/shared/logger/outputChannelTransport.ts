/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as Transport from 'winston-transport'
import { removeAnsi } from '../utilities/textUtilities'

export const MESSAGE = Symbol.for('message')

interface LogEntry {
    level: string
    message: string
    [MESSAGE]: string
}

export class OutputChannelTransport extends Transport {
    private readonly outputChannel: vscode.OutputChannel
    private readonly stripAnsi: boolean

    public constructor(
        options: Transport.TransportStreamOptions & {
            outputChannel: vscode.OutputChannel
            stripAnsi: boolean
            name?: string
        }
    ) {
        super(options)

        this.outputChannel = options.outputChannel
        this.stripAnsi = options.stripAnsi
    }

    public log(info: LogEntry, next: () => void): void {
        setImmediate(() => {
            if (this.stripAnsi) {
                this.outputChannel.appendLine(removeAnsi(info[MESSAGE]))
            } else {
                this.outputChannel.appendLine(info[MESSAGE])
            }
        })

        next()
    }
}

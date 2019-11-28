/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as Transport from 'winston-transport'

interface LogEntry {
    level: string
    message: string
}

export class OutputChannelTransport extends Transport {
    private readonly outputChannel: vscode.OutputChannel

    public constructor(
        options: Transport.TransportStreamOptions & {
            outputChannel: vscode.OutputChannel
        }
    ) {
        super(options)

        this.outputChannel = options.outputChannel
    }

    public log(info: LogEntry, next: () => void): void {
        setImmediate(() => {
            this.outputChannel.appendLine(info.message)
        })

        next()
    }
}

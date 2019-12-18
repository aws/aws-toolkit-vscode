/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as Transport from 'winston-transport'

interface LogEntry {
    level: string
    message: string
}

export class ConsoleLogTransport extends Transport {
    public constructor(options: Transport.TransportStreamOptions) {
        super(options)
    }

    public log(info: LogEntry, next: () => void): void {
        setImmediate(() => {
            console.log(info.message)
        })

        next()
    }
}

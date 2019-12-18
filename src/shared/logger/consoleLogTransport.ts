/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as Transport from 'winston-transport'

interface LogEntry {
    level: string
    message: string
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
        setImmediate(() => {
            console.log(info.message)
        })

        next()
    }
}

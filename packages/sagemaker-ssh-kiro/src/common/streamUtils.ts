/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as stream from 'stream'

/**
 * Returns a promise that resolves when the provided stream outputs data that satisfies the provided predicate function.
 */
export function waitForMatchingStreamOutput(
    stream: stream.Readable,
    predicate: (data: Buffer) => boolean
): Promise<void> {
    return new Promise((resolve, reject) => {
        const onData = (data: Buffer) => {
            if (predicate(data)) {
                cleanup()
                resolve()
            }
        }

        const cleanup = () => {
            stream.off('data', onData)
        }

        stream.on('data', onData)
        stream.on('error', (error) => {
            cleanup()
            reject(error)
        })
    })
}

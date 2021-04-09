/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as https from 'https'

/**
 * Wraps 'https.request' into a Promise.
 * Resolves into the HTTPS response.
 *
 * @param options See https.RequestOptions from Node.js
 * @param data Used for POST/PUT/DELETE requests
 */
export function httpsRequestPromise(options: https.RequestOptions, data: string = ''): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        const request = https.request(options, res => {
            let received: string = ''

            res.on('data', chunk => (received += chunk))
            res.on('end', () => resolve(received))
        })

        request.on('error', e => reject(e))
        request.write(data)
        request.end()
    })
}

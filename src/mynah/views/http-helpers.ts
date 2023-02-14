/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import https = require('https')

export async function httpGet(options: https.RequestOptions): Promise<string> {
    return await new Promise<string>((resolve, reject) => {
        options.method = 'GET'
        https
            .get(options, res => {
                res.setEncoding('utf8')
                let body = ''
                // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
                res.on('data', chunk => (body += chunk))
                res.on('end', () => resolve(body))
            })
            .on('error', reject)
    })
}

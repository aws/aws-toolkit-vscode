/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { appMap } from '../../awsService/appBuilder/walkthrough'
import assert from 'assert'

describe('Walkthrough pattern URL exists', function () {
    const serverlessLandOwner = 'aws-samples'
    const serverlessLandRepo = 'serverless-patterns'

    for (const [key, app] of appMap.entries()) {
        it(`Walkthrough pattern URL exists for ${key}`, async function () {
            const url = `https://github.com/${serverlessLandOwner}/${serverlessLandRepo}/releases/latest/download/${app.asset}`
            const response = await fetch(url, {
                method: 'HEAD',
            })
            // ignore if too frequent
            assert.ok(response.status === 200 || response.status === 429)
        })
    }
})

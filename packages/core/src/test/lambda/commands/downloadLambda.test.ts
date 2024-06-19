/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { openLambdaFile } from '../../../lambda/commands/downloadLambda'
import assert from 'assert'

describe('downloadLambda', async function () {
    describe('openLambdaFile', async function () {
        it('throws if a file does not exist', async function () {
            await assert.rejects(openLambdaFile('/asdfasdfasfdasdfasdf.js'))
        })
    })
})

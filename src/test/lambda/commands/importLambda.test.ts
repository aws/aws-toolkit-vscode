/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { openLambdaFile } from '../../../lambda/commands/importLambda'
import { assertThrowsError } from '../../shared/utilities/assertUtils'

describe('importLambda', async function () {
    describe('openLambdaFile', async function () {
        it('throws if a file does not exist', async function () {
            await assertThrowsError(async () => openLambdaFile('/asdfasdfasfdasdfasdf.js'))
        })
    })
})

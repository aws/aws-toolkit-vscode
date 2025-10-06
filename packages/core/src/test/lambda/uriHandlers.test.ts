/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { SearchParams } from '../../shared/vscode/uriHandler'
import { parseOpenParams } from '../../lambda/uriHandlers'
import { globals } from '../../shared'

describe('Lambda URI Handler', function () {
    describe('load-function', function () {
        it('registers for "/lambda/load-function"', function () {
            assert.throws(() => globals.uriHandler.onPath('/lambda/load-function', () => {}))
        })

        it('parses parameters', function () {
            let query = new SearchParams({
                functionName: 'example',
            })
            assert.throws(() => parseOpenParams(query), /A region must be provided/)
            query = new SearchParams({
                region: 'example',
            })
            assert.throws(() => parseOpenParams(query), /A function name must be provided/)

            const valid = {
                functionName: 'example',
                region: 'example',
                isCfn: 'false',
            }
            query = new SearchParams(valid)
            assert.deepEqual(parseOpenParams(query), valid)
        })
    })
})

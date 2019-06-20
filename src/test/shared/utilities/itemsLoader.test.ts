/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import assert = require('assert')
import { TestItemsLoader } from './testItemsLoader'

describe('BaseItemsLoader', async () => {

    let itemsLoader: TestItemsLoader<number>

    beforeEach(async () => {
        itemsLoader = new TestItemsLoader()
    })

    it('onLoadStart fires', async () => {
        await new Promise<void>(resolve => {
            itemsLoader.onLoadStart(() => {
                resolve()
            })

            itemsLoader.startLoad()
        })
    })

    it('onLoadEnd fires', async () => {
        await new Promise<void>(resolve => {
            itemsLoader.onLoadEnd(() => {
                resolve()
            })

            itemsLoader.endLoad()
        })
    })

    it('onItem fires', async () => {
        await new Promise<void>(resolve => {
            itemsLoader.onItem((itm) => {
                assert.strictEqual(itm, 5)
                resolve()
            })

            itemsLoader.emitItems(5)
        })
    })
})

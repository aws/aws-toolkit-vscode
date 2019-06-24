/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import assert = require('assert')
import { SUCCESS_ITEMSLOADER_END_EVENT } from '../../../shared/utilities/itemsLoader'
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
            itemsLoader.onLoadEnd((event) => {
                assert.strictEqual(event, SUCCESS_ITEMSLOADER_END_EVENT)
                resolve()
            })

            itemsLoader.endLoad(SUCCESS_ITEMSLOADER_END_EVENT)
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

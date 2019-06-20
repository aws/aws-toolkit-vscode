/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { BaseItemsLoader } from '../../../shared/utilities/itemsLoader'

export class TestItemsLoader<T> extends BaseItemsLoader<T> {
    public startLoad() {
        this.loadStartEmitter.fire()
    }

    public endLoad() {
        this.loadEndEmitter.fire()
    }

    public emitItems(...items: T[]) {
        items.forEach(item => this.itemEmitter.fire(item))
    }
}

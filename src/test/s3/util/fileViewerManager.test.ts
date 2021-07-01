/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { SingletonManager } from '../../../s3/util/fileViewerManager'

describe('FileViewerManager', function () {
    //TODOD:: Not big enought to test yet
})

describe('SingletonManager.getInstance()', function () {
    it('creates a new instance the first time it is used', function () {
        assert.strictEqual(SingletonManager.fileManager, undefined)
        const firstTime = SingletonManager.getInstance()
        assert.strictEqual(firstTime, SingletonManager.fileManager)
    })

    it('uses the same instance accross calls', function () {
        const firstInstance = SingletonManager.getInstance()
        const secondInstance = SingletonManager.getInstance()
        assert.strictEqual(firstInstance, secondInstance)
    })
})

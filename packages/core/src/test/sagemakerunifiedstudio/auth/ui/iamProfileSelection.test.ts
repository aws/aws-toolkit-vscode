/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { SmusIamProfileSelector } from '../../../../sagemakerunifiedstudio/auth/ui/iamProfileSelection'

describe('SmusIamProfileSelector', function () {
    describe('showRegionSelection', function () {
        it('should be a static method', function () {
            assert.strictEqual(typeof SmusIamProfileSelector.showRegionSelection, 'function')
        })
    })

    describe('showIamProfileSelection', function () {
        it('should be a static method', function () {
            assert.strictEqual(typeof SmusIamProfileSelector.showIamProfileSelection, 'function')
        })
    })
})

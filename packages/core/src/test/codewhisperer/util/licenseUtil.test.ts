/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { LicenseUtil } from '../../../codewhisperer/util/licenseUtil'

describe('licenseUtil', function () {
    describe('getLicenseHtml', async function () {
        it('Should return spdx URL if license name is undefined', function () {
            const actual = LicenseUtil.getLicenseHtml(undefined)
            assert.strictEqual(actual, `https://spdx.org/licenses`)
        })
        it('Should return spdx URL if license name is not known to spdx', function () {
            const actual = LicenseUtil.getLicenseHtml('unknown-license')
            assert.strictEqual(actual, `https://spdx.org/licenses`)
        })
        it('Should return spdx MIT license URL if license name is MIT', function () {
            const actual = LicenseUtil.getLicenseHtml('MIT')
            assert.strictEqual(actual, `https://spdx.org/licenses/MIT.html`)
        })
    })
})

/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { HoverConfigUtil } from '../../../codewhisperer/util/hoverConfigUtil'
import { FakeMemento } from '../../fakeExtensionContext'

describe('HoverConfigUtil', function () {
    after(async function () {
        // Restore the setting after running tests
        await new HoverConfigUtil().update('hover.enabled', true)
    })

    describe('overwriteHoverConfig', async function () {
        it('Should set hover enabled to false if it is currently true', async function () {
            const hoverConfigUtil = new HoverConfigUtil()
            await hoverConfigUtil.update('hover.enabled', true)
            await hoverConfigUtil.overwriteHoverConfig()
            const actual = hoverConfigUtil.get('hover.enabled', false)
            assert.strictEqual(actual, false)
        })

        it('Should not set hover enabled to false if it is currently false', async function () {
            const hoverConfigUtil = new HoverConfigUtil()
            await hoverConfigUtil.update('hover.enabled', false)
            await hoverConfigUtil.overwriteHoverConfig()
            const actual = hoverConfigUtil.get('hover.enabled', false)
            assert.strictEqual(actual, false)
        })
    })

    describe('restoreHoverConfig', async function () {
        it('Should restore hover config if it was previously overwritten', async function () {
            const hoverConfigUtil = new HoverConfigUtil()
            await hoverConfigUtil.update('hover.enabled', true)
            await hoverConfigUtil.overwriteHoverConfig()
            await hoverConfigUtil.restoreHoverConfig()
            const actual = hoverConfigUtil.get('hover.enabled', false)
            assert.strictEqual(actual, true)
        })

        it('Should not restore hover config it was not previously overwritten', async function () {
            const hoverConfigUtil = new HoverConfigUtil()
            await hoverConfigUtil.update('hover.enabled', false)
            await hoverConfigUtil.restoreHoverConfig()
            const actual = hoverConfigUtil.get('hover.enabled', false)
            assert.strictEqual(actual, false)
        })
    })

    it('stores the previous setting value in the provided memento', async function () {
        const memento = new FakeMemento()

        const util1 = new HoverConfigUtil(memento)
        await util1.update('hover.enabled', true)
        await util1.overwriteHoverConfig()

        const util2 = new HoverConfigUtil(memento)
        await util2.update('hover.enabled', false)
        await util2.restoreHoverConfig()

        const actual = util2.get('hover.enabled', false)
        assert.strictEqual(actual, true)
    })
})

/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon'
import { ext } from '../../../../shared/extensionGlobals'
import { Region } from '../../../../shared/regions/endpoints'
import { createRegionPrompter } from '../../../../shared/ui/common/region'
import { FakeExtensionContext } from '../../../fakeExtensionContext'
import { createQuickPickTester } from '../testUtils'

describe('createRegionPrompter', function () {
    const regions = [
        { id: 'us-west-2', name: 'PDX' },
        { id: 'us-east-1', name: 'IAD' },
        { id: 'foo-bar-1', name: 'FOO' },
    ]

    beforeEach(function () {
        sinon.stub(ext, 'context').value(new FakeExtensionContext())
    })

    afterEach(function () {
        sinon.restore()
    })

    it('can filter regions with a callback', async function () {
        const filter = (region: Region) => region.name === 'FOO'
        const p = createRegionPrompter({ regions, filter })
        const tester = createQuickPickTester(p)
        tester.assertItems(['FOO'])
        tester.hide()
        await tester.result()
    })

    it('can remember the last selected region and moves it to the top', async function () {
        const tester = createQuickPickTester(createRegionPrompter({ regions }))
        tester.acceptItem('IAD')
        await tester.result()

        const tester2 = createQuickPickTester(createRegionPrompter({ regions }))
        tester2.assertItems(['IAD', 'PDX', 'FOO'])
        tester2.hide()
        await tester2.result()
    })

    it('prompts for region', async function () {
        const p = createRegionPrompter({
            regions,
            title: 'Select regionnnn',
            defaultRegion: 'foo-bar-1',
        })
        const tester = createQuickPickTester(p)
        tester.assertItems(['FOO', 'PDX', 'IAD'])
        tester.acceptItem({
            label: regions[1].name,
            detail: regions[1].id,
            data: regions[1],
            description: '',
            recentlyUsed: false,
        })
        await tester.result(regions[1])
    })
})

/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { createRegionPrompter } from '../../../../shared/ui/common/region'
import { exposeEmitters } from '../../vscode/testUtils'
import { createCommonButtons } from '../../../../shared/ui/buttons'

describe('createRegionPrompter', function () {
    it('prompts for region', async function () {
        const regions = [
            { id: 'us-west-2', name: 'PDX' },
            { id: 'us-east-1', name: 'IAD' },
            { id: 'foo-bar-1', name: 'FOO' },
        ]
        const p = createRegionPrompter(regions, {
            title: 'Select regionnnn',
            buttons: createCommonButtons('https://aws.amazon.com/'),
            defaultRegion: 'foo-bar-1',
        })
        const exposed = exposeEmitters(p.quickPick, ['onDidTriggerButton'])
        p.quickPick.onDidChangeActive(items => {
            if (items.length > 0) {
                exposed.selectedItems = [items[0]]
            }
        })
        p.selectItems({ label: regions[1].name, data: regions[1] })
        const r = await p.prompt()

        assert.strictEqual(r, regions[1])
    })
})

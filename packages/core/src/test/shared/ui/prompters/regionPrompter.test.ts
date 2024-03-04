/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { createRegionPrompter } from '../../../../shared/ui/common/region'
import { createCommonButtons } from '../../../../shared/ui/buttons'
import { createQuickPickPrompterTester } from '../testUtils'

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
        const tester = createQuickPickPrompterTester(p)
        tester.assertItems(['FOO', 'PDX', 'IAD'])
        tester.acceptItem(regions[1].name)
        await tester.result(regions[1])
    })
})

/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { RegionSubmenu } from '../../../../shared/ui/common/regionSubmenu'
import { DataQuickPickItem, QuickPickPrompter } from '../../../../shared/ui/pickerPrompter'
import { createQuickPickPrompterTester } from '../../../shared/ui/testUtils'

describe('regionSubmenu', function () {
    let submenuPrompter: RegionSubmenu<string>

    const region1Groups = ['group1a', 'group1b', 'group1c']
    const region2Groups = ['group2a', 'group2b', 'group2c']

    before(async function () {
        const fakeGroupProvider = function (regionCode: string) {
            let groupNames: Array<string>
            switch (regionCode) {
                case 'us-west-1':
                    groupNames = region1Groups
                    break
                case 'us-west-2':
                    groupNames = region2Groups
                    break
                default:
                    groupNames = []
            }
            return groupNames.map<DataQuickPickItem<string>>(groupName => ({
                label: groupName,
                data: groupName,
            }))
        }
        submenuPrompter = new RegionSubmenu(fakeGroupProvider, {}, {}, 'us-west-1')
    })

    it('allow users to swap regions via escape hatch', async function () {
        type Inner<T> = T extends QuickPickPrompter<infer U> ? U : never
        type Combine<T> = QuickPickPrompter<Inner<T>>

        const resp = submenuPrompter.prompt()
        assert.ok(submenuPrompter.activePrompter)
        const logGroupTester = createQuickPickPrompterTester(
            submenuPrompter.activePrompter as Combine<typeof submenuPrompter.activePrompter>
        )
        logGroupTester.acceptItem('Switch region')
        await logGroupTester.result()

        const regionTester = createQuickPickPrompterTester(
            submenuPrompter.activePrompter as Combine<typeof submenuPrompter.activePrompter>
        )
        regionTester.acceptItem('US West (Oregon)')
        await regionTester.result()

        const logGroupTester2 = createQuickPickPrompterTester(
            submenuPrompter.activePrompter as Combine<typeof submenuPrompter.activePrompter>
        )
        logGroupTester2.acceptItem('group2c')
        await logGroupTester2.result()
        assert.deepStrictEqual(await resp, {
            region: 'us-west-2',
            data: 'group2c',
        })
    })
})

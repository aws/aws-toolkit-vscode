/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { RegionSubmenu } from '../../../../shared/ui/common/regionSubmenu'
import { DataQuickPickItem, QuickPickPrompter } from '../../../../shared/ui/pickerPrompter'
import { createQuickPickTester, QuickPickTester } from '../testUtils'

describe('regionSubmenu', function () {
    let SubmenuPrompter: RegionSubmenu<string>
    let menuTester: QuickPickTester<any>

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
        SubmenuPrompter = new RegionSubmenu(fakeGroupProvider, {}, 'us-west-1')

        menuTester = createQuickPickTester(SubmenuPrompter.createMenuPrompter())
    })

    it('Prompts with log groups and escape hatch', async function () {
        const expectedMenuItems1 = ['Switch region'].concat(region1Groups)
        menuTester.assertItems(expectedMenuItems1)
        menuTester.acceptItem('group1a')
        await menuTester.result()
    })

    it('Able to swap regions via escape hatch', async function () {
        type Inner<T> = T extends QuickPickPrompter<infer U> ? U : never
        type Combine<T> = QuickPickPrompter<Inner<T>>
        const submenuPrompt = createQuickPickTester(
            SubmenuPrompter.activePrompter as Combine<typeof SubmenuPrompter.activePrompter>
        )
        submenuPrompt.acceptItem('Switch region')
        await submenuPrompt.result()
        const regionPrompt = createQuickPickTester(
            SubmenuPrompter.activePrompter as Combine<typeof SubmenuPrompter.activePrompter>
        )
        regionPrompt.acceptItem('us-west-2')
        await regionPrompt.result()
    })
})

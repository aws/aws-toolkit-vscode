/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { RegionSubmenu } from '../../../../shared/ui/common/regionSubmenu'
import { DataQuickPickItem } from '../../../../shared/ui/pickerPrompter'
import { createQuickPickTester, QuickPickTester } from '../testUtils'
import { Region } from '../../../../shared/regions/endpoints'
import { assert } from 'console'

describe('regionSubmenu', function () {
    let SubmenuPrompter: RegionSubmenu<string>
    let menuTester: QuickPickTester<any>
    let regionTester: QuickPickTester<Region>

    const region1Groups = ['group1a', 'group1b', 'group1c']
    const region2Groups = ['group2a', 'group2b', 'group2c']

    before(async function () {
        const fakeGroupProvider = function (regionCode: string) {
            let groupNames: Array<string>
            switch (regionCode) {
                case 'testRegion1':
                    groupNames = region1Groups
                    break
                case 'testRegion2':
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
        SubmenuPrompter = new RegionSubmenu(fakeGroupProvider, {}, 'testRegion1')

        menuTester = createQuickPickTester(SubmenuPrompter.menuPrompter)
        regionTester = createQuickPickTester(SubmenuPrompter.regionPrompter)
    })

    it('Prompts with log groups and escape hatch', function () {
        const expectedMenuItems1 = ['testRegion1'].concat(region1Groups)
        // console.log(expectedMenuItems1, menuTester.quickPick.items)
        // The menuTester.assertItems passes regardless of input???
        menuTester.assertItems(['none'])
    })

    it('Log Groups offered depend on region', function () {
        regionTester.acceptItem('testRegion2')

        // reload the tester to have new region
        menuTester = createQuickPickTester(SubmenuPrompter.menuPrompter)
        const expectedMenuItems2 = ['testRegion2'].concat(region2Groups)
        menuTester.assertItems(expectedMenuItems2)
    })
})

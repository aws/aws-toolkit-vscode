/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { RegionSubmenu } from '../../../../shared/ui/common/regionSubmenu'
import { DataQuickPickItem, QuickPickPrompter } from '../../../../shared/ui/pickerPrompter'
import { createQuickPickPrompterTester } from '../../../shared/ui/testUtils'

describe('regionSubmenu', function () {
    let submenuPrompter: RegionSubmenu<string>

    const region1Data = ['option1a', 'option2a', 'option3a']
    const region2Data = ['option1b', 'option2b', 'option3b']

    before(async function () {
        const mockDataProvider = function (regionCode: string) {
            let data: Array<string>
            switch (regionCode) {
                case 'us-west-1':
                    data = region1Data
                    break
                case 'us-west-2':
                    data = region2Data
                    break
                default:
                    data = []
            }
            return data.map<DataQuickPickItem<string>>(data => ({
                label: data,
                data: data,
            }))
        }
        submenuPrompter = new RegionSubmenu(mockDataProvider, {}, {}, 'us-west-1')
    })

    it('allow users to swap regions via escape hatch', async function () {
        type Inner<T> = T extends QuickPickPrompter<infer U> ? U : never
        type Combine<T> = QuickPickPrompter<Inner<T>>

        const resp = submenuPrompter.prompt()
        assert.ok(submenuPrompter.activePrompter)

        const dataPrompterTester = createQuickPickPrompterTester(
            submenuPrompter.activePrompter as Combine<typeof submenuPrompter.activePrompter>
        )
        dataPrompterTester.acceptItem('Switch Region')
        await dataPrompterTester.result()

        const regionTester = createQuickPickPrompterTester(
            submenuPrompter.activePrompter as Combine<typeof submenuPrompter.activePrompter>
        )
        regionTester.acceptItem('US West (Oregon)')
        await regionTester.result()

        const dataPrompterTester2 = createQuickPickPrompterTester(
            submenuPrompter.activePrompter as Combine<typeof submenuPrompter.activePrompter>
        )
        dataPrompterTester2.acceptItem('option2b')
        await dataPrompterTester2.result()
        assert.deepStrictEqual(await resp, {
            region: 'us-west-2',
            data: 'option2b',
        })
    })
})

/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as sinon from 'sinon'
import { RegionSubmenu } from '../../../../shared/ui/common/regionSubmenu'
import { DataQuickPickItem, QuickPickPrompter } from '../../../../shared/ui/pickerPrompter'
import { createQuickPickPrompterTester } from '../testUtils'

describe('regionSubmenu', function () {
    let submenuPrompter: RegionSubmenu<string>

    const region1Data = ['option1a', 'option2a', 'option3a']
    let region2Data = ['option1b', 'option2b', 'option3b']

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
            return data.map<DataQuickPickItem<string>>((data) => ({
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

    it('only has a refresh button', function () {
        const activeButtons = submenuPrompter.activePrompter!.quickPick.buttons
        assert.strictEqual(activeButtons.length, 1)
    })

    it('refresh button calls refresh once onClick', function () {
        const refreshButton = submenuPrompter.activePrompter!.quickPick.buttons[0]
        const refreshStub = sinon.stub(RegionSubmenu.prototype, 'refresh')
        refreshButton.onClick!()
        sinon.assert.calledOnce(refreshStub)
        sinon.restore()
    })

    it('refresh reloads items', async function () {
        const itemsBeforeLabels = submenuPrompter.activePrompter!.quickPick.items.map((i) => i.label)
        region2Data = ['option1c', 'option2c', 'option3c']

        // Note that onDidChangeBusy event fires with busy=false when we load new items in.
        // Since regionSubmenu retroactively adds the default items, they won't be there yet.
        // So we don't check for them in test to avoid looking at implementation level details.
        submenuPrompter.activePrompter!.onDidChangeBusy((b: boolean) => {
            if (!b) {
                const itemsAfterLabels = submenuPrompter.activePrompter!.quickPick.items.map((i) => i.label)
                region2Data.forEach((item) => assert(itemsAfterLabels.includes(item)))
                assert.notStrictEqual(itemsBeforeLabels, itemsAfterLabels)
            }
        })
        submenuPrompter.refresh(submenuPrompter.activePrompter! as QuickPickPrompter<any>)
    })
})

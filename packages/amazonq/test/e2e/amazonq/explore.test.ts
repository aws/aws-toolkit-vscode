/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import sinon from 'sinon'
import { qTestingFramework } from './framework/framework'
import { Messenger } from './framework/messenger'

describe('Amazon Q Explore page', function () {
    let framework: qTestingFramework
    let tab: Messenger

    beforeEach(() => {
        framework = new qTestingFramework('agentWalkthrough', true, [], 0)
        const welcomeTab = framework.getTabs()[0]
        welcomeTab.clickInBodyButton('explore')

        // Find the new explore tab
        const exploreTab = framework.findTab('Explore')
        if (!exploreTab) {
            assert.fail('Explore tab not found')
        }
        tab = exploreTab
    })

    afterEach(() => {
        framework.removeTab(tab.tabID)
        framework.dispose()
        sinon.restore()
    })

    // TODO refactor page objects so we can associate clicking user guides with actual urls
    // TODO test that clicking quick start changes the tab title, etc
    it('should have correct button IDs', async () => {
        const features = ['featuredev', 'testgen', 'doc', 'review', 'gumby']

        for (const [index, feature] of features.entries()) {
            const buttons = (tab.getStore().chatItems ?? [])[index].buttons ?? []
            assert.deepStrictEqual(buttons[0].id, `user-guide-${feature}`)
            assert.deepStrictEqual(buttons[1].id, `quick-start-${feature}`)
        }
    })
})

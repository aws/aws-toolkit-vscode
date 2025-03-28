/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'assert'
import { TabDataGenerator } from '../../../../../amazonq/webview/ui/tabs/generator'
import { TabType } from '../../../../../amazonq/webview/ui/storages/tabsStorage'
import { qChatIntroMessageForSMUS } from '../../../../../amazonq/webview/ui/tabs/constants'

describe('TabDataGenerator', () => {
    let tabGenerator: TabDataGenerator

    const defaultProps = {
        isFeatureDevEnabled: false,
        isGumbyEnabled: false,
        isScanEnabled: false,
        isTestEnabled: false,
        isDocEnabled: false,
        isChatEnabled: true,
        isAuthEnabled: true,
    }

    beforeEach(() => {
        tabGenerator = new TabDataGenerator(defaultProps)
    })

    describe('getTabData tests', () => {
        it('returns empty object for welcome tab', () => {
            const result = tabGenerator.getTabData('welcome', true)
            assert.deepStrictEqual(result, {})
        })

        it('returns SMUS intro message when serviceName is SageMakerUnifiedStudio', () => {
            const result = tabGenerator.getTabData('cwc', true, 'TestTask', 'SageMakerUnifiedStudio')

            assert.strictEqual(result.chatItems?.length, 2)
            assert.strictEqual(result.chatItems?.[0].body, qChatIntroMessageForSMUS)
        })

        it('returns default intro message for non-SMUS service', () => {
            const result = tabGenerator.getTabData('cwc', true, 'TestTask', 'OtherService')

            assert.strictEqual(result.chatItems?.length, 2)
            assert.ok(result.chatItems?.[0].body)
            assert.ok(!result.chatItems?.[0].body.includes(qChatIntroMessageForSMUS))
        })

        it('returns no chat items when needWelcomeMessages is false', () => {
            const result = tabGenerator.getTabData('cwc', false, 'TestTask', 'SageMakerUnifiedStudio')

            assert.strictEqual(result.chatItems?.length, 0)
        })

        it('returns correct data structure for cwc tab type', () => {
            const tabType: TabType = 'cwc'
            const result = tabGenerator.getTabData(tabType, true)

            assert.ok(typeof result.tabTitle === 'string')
            assert.ok(result.promptInputInfo !== undefined)
            if (result.promptInputInfo) {
                assert.ok(result.promptInputInfo.includes('Amazon Q'))
            }
            assert.ok(Array.isArray(result.quickActionCommands))
            assert.ok(typeof result.promptInputPlaceholder === 'string')
            assert.ok(Array.isArray(result.contextCommands))
        })
    })
})

/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { qTestingFramework } from './framework/framework'
import sinon from 'sinon'
import { Messenger } from './framework/messenger'
import { JDKVersion } from 'aws-core-vscode/codewhisperer'
import { GumbyController, TabsStorage } from 'aws-core-vscode/amazonqGumby'

describe('Amazon Q Code Transformation', function () {
    let framework: qTestingFramework
    let tab: Messenger

    beforeEach(() => {
        framework = new qTestingFramework('gumby', true, [])
        tab = framework.createTab()
    })

    afterEach(() => {
        framework.removeTab(tab.tabID)
        framework.dispose()
        sinon.restore()
    })

    describe('Quick action availability', () => {
        it('Shows /transform when QCT is enabled', async () => {
            const command = tab.findCommand('/transform')
            if (!command) {
                assert.fail('Could not find command')
            }

            if (command.length > 1) {
                assert.fail('Found too many commands with the name /transform')
            }
        })

        it('Does NOT show /transform when QCT is NOT enabled', () => {
            framework.dispose()
            framework = new qTestingFramework('gumby', false, [])
            const tab = framework.createTab()
            const command = tab.findCommand('/transform')
            if (command.length > 0) {
                assert.fail('Found command when it should not have been found')
            }
        })
    })

    describe('Starting a transformation from chat', () => {
        it('Can click through all user input forms', async () => {
            tab.addChatMessage({ command: '/transform' })
            sinon.stub(GumbyController.prototype, 'validateLanguageUpgradeProjects' as keyof GumbyController).resolves([
                {
                    name: 'qct-sample-java-8-app-main',
                    path: '/Users/alias/Desktop/qct-sample-java-8-app-main',
                    JDKVersion: JDKVersion.JDK8,
                },
            ])

            // wait for /transform to respond with some intro messages and the first user input form
            await tab.waitForEvent(() => tab.getChatItems().length > 3, {
                waitTimeoutInMs: 5000,
                waitIntervalInMs: 1000,
            })
            const projectForm = tab.getChatItems().pop()
            assert.strictEqual(projectForm?.formItems?.[0]?.id ?? undefined, 'GumbyTransformLanguageUpgradeProjectForm')

            const projectFormItemValues = {
                GumbyTransformLanguageUpgradeProjectForm: '/Users/alias/Desktop/qct-sample-java-8-app-main',
                GumbyTransformJdkFromForm: '8',
                GumbyTransformJdkToForm: '17',
            }
            const projectFormValues: Record<string, string> = { ...projectFormItemValues }
            // TODO: instead of stubbing, can we create a tab in qTestingFramework with tabType passed in?
            // Mynah-UI updates tab type like this: this.tabsStorage.updateTabTypeFromUnknown(affectedTabId, 'gumby')
            sinon
                .stub(TabsStorage.prototype, 'getTab')
                .returns({ id: tab.tabID, status: 'free', type: 'gumby', isSelected: true })
            tab.clickCustomFormButton({
                id: 'gumbyLanguageUpgradeTransformFormConfirm',
                text: 'Confirm',
                formItemValues: projectFormValues,
            })

            // 3 additional chat messages (including message with 2nd form) get sent after 1st form submitted; wait for all of them
            await tab.waitForEvent(() => tab.getChatItems().length > 6, {
                waitTimeoutInMs: 5000,
                waitIntervalInMs: 1000,
            })
            const skipTestsForm = tab.getChatItems().pop()
            assert.strictEqual(skipTestsForm?.formItems?.[0]?.id ?? undefined, 'GumbyTransformSkipTestsForm')

            const skipTestsFormItemValues = {
                GumbyTransformSkipTestsForm: 'Run unit tests',
            }
            const skipTestsFormValues: Record<string, string> = { ...skipTestsFormItemValues }
            tab.clickCustomFormButton({
                id: 'gumbyTransformSkipTestsFormConfirm',
                text: 'Confirm',
                formItemValues: skipTestsFormValues,
            })

            // 3 additional chat messages (including message with 3rd form) get sent after 2nd form submitted; wait for all of them
            await tab.waitForEvent(() => tab.getChatItems().length > 9, {
                waitTimeoutInMs: 5000,
                waitIntervalInMs: 1000,
            })
            const multipleDiffsForm = tab.getChatItems().pop()
            assert.strictEqual(
                multipleDiffsForm?.formItems?.[0]?.id ?? undefined,
                'GumbyTransformOneOrMultipleDiffsForm'
            )

            const oneOrMultipleDiffsFormItemValues = {
                GumbyTransformOneOrMultipleDiffsForm: 'One diff',
            }
            const oneOrMultipleDiffsFormValues: Record<string, string> = { ...oneOrMultipleDiffsFormItemValues }
            tab.clickCustomFormButton({
                id: 'gumbyTransformOneOrMultipleDiffsFormConfirm',
                text: 'Confirm',
                formItemValues: oneOrMultipleDiffsFormValues,
            })

            // 2 additional chat messages (including message with 4th form) get sent after 3rd form submitted; wait for both of them
            await tab.waitForEvent(() => tab.getChatItems().length > 11, {
                waitTimeoutInMs: 5000,
                waitIntervalInMs: 1000,
            })
            const jdkPathPrompt = tab.getChatItems().pop()
            assert.strictEqual(jdkPathPrompt?.body?.includes('Enter the path to JDK'), true)

            // 2 additional chat messages get sent after 4th form submitted; wait for both of them
            tab.addChatMessage({ prompt: '/dummy/path/to/jdk8' })
            await tab.waitForEvent(() => tab.getChatItems().length > 13, {
                waitTimeoutInMs: 5000,
                waitIntervalInMs: 1000,
            })
            const jdkPathResponse = tab.getChatItems().pop()
            // this 'Sorry' message is OK - just making sure that the UI components are working correctly
            assert.strictEqual(jdkPathResponse?.body?.includes("Sorry, I couldn't locate your Java installation"), true)
        })
    })
})

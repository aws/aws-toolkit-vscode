/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { qTestingFramework } from './framework/framework'
import sinon from 'sinon'
import { registerAuthHook, using } from 'aws-core-vscode/test'
import { loginToIdC } from './utils/setup'
import { Messenger } from './framework/messenger'
import { FollowUpTypes } from 'aws-core-vscode/amazonq'
import { i18n } from 'aws-core-vscode/shared'
import { docGenerationProgressMessage, DocGenerationStep, Mode } from 'aws-core-vscode/amazonqDoc'

describe('Amazon Q Doc', async function () {
    let framework: qTestingFramework
    let tab: Messenger

    before(async function () {
        /**
         * The tests are getting throttled, only run them on stable for now
         *
         * TODO: Re-enable for all versions once the backend can handle them
         */
        const testVersion = process.env['VSCODE_TEST_VERSION']
        if (testVersion && testVersion !== 'stable') {
            this.skip()
        }

        await using(registerAuthHook('amazonq-test-account'), async () => {
            await loginToIdC()
        })
    })

    beforeEach(() => {
        registerAuthHook('amazonq-test-account')
        framework = new qTestingFramework('doc', true, [])
        tab = framework.createTab()
    })

    afterEach(() => {
        framework.removeTab(tab.tabID)
        framework.dispose()
        sinon.restore()
    })

    describe('Quick action availability', () => {
        it('Shows /doc when doc generation is enabled', async () => {
            const command = tab.findCommand('/doc')
            if (!command.length) {
                assert.fail('Could not find command')
            }

            if (command.length > 1) {
                assert.fail('Found too many commands with the name /doc')
            }
        })

        it('Does NOT show /doc when doc generation is NOT enabled', () => {
            // The beforeEach registers a framework which accepts requests. If we don't dispose before building a new one we have duplicate messages
            framework.dispose()
            framework = new qTestingFramework('doc', false, [])
            const tab = framework.createTab()
            const command = tab.findCommand('/doc')
            if (command.length > 0) {
                assert.fail('Found command when it should not have been found')
            }
        })
    })

    describe('/doc entry', () => {
        beforeEach(async function () {
            tab.addChatMessage({ command: '/doc' })
            await tab.waitForChatFinishesLoading()
        })

        it('Checks for initial follow ups', async () => {
            await tab.waitForButtons([FollowUpTypes.CreateDocumentation, FollowUpTypes.UpdateDocumentation])
        })
    })

    describe('Creates a README', () => {
        beforeEach(async function () {
            tab.addChatMessage({ command: '/doc' })
            await tab.waitForChatFinishesLoading()
        })

        it('Creates a README for root folder', async () => {
            await tab.waitForButtons([FollowUpTypes.CreateDocumentation])

            tab.clickButton(FollowUpTypes.CreateDocumentation)

            await tab.waitForText(i18n('AWS.amazonq.doc.answer.createReadme'))

            await tab.waitForButtons([FollowUpTypes.ProceedFolderSelection])

            tab.clickButton(FollowUpTypes.ProceedFolderSelection)

            await tab.waitForText(docGenerationProgressMessage(DocGenerationStep.SUMMARIZING_FILES, Mode.CREATE))

            await tab.waitForText(
                `${i18n('AWS.amazonq.doc.answer.readmeCreated')} ${i18n('AWS.amazonq.doc.answer.codeResult')}`
            )

            await tab.waitForButtons([
                FollowUpTypes.AcceptChanges,
                FollowUpTypes.MakeChanges,
                FollowUpTypes.RejectChanges,
            ])

            tab.clickButton(FollowUpTypes.AcceptChanges)

            await tab.waitForButtons([FollowUpTypes.NewTask, FollowUpTypes.CloseSession])
        })
    })

    describe('Edits a README', () => {
        beforeEach(async function () {
            tab.addChatMessage({ command: '/doc' })
            await tab.waitForChatFinishesLoading()
        })

        it('Make specific change in README', async () => {
            await tab.waitForButtons([FollowUpTypes.UpdateDocumentation])

            tab.clickButton(FollowUpTypes.UpdateDocumentation)

            await tab.waitForButtons([FollowUpTypes.SynchronizeDocumentation, FollowUpTypes.EditDocumentation])

            tab.clickButton(FollowUpTypes.EditDocumentation)

            await tab.waitForButtons([FollowUpTypes.ProceedFolderSelection])

            tab.clickButton(FollowUpTypes.ProceedFolderSelection)

            tab.addChatMessage({ prompt: 'remove the repository structure section' })

            await tab.waitForText(
                `${i18n('AWS.amazonq.doc.answer.readmeUpdated')} ${i18n('AWS.amazonq.doc.answer.codeResult')}`
            )

            await tab.waitForButtons([
                FollowUpTypes.AcceptChanges,
                FollowUpTypes.MakeChanges,
                FollowUpTypes.RejectChanges,
            ])
        })
    })
})

/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import vscode from 'vscode'
import { qTestingFramework } from './framework/framework'
import sinon from 'sinon'
import { Messenger } from './framework/messenger'
import { FollowUpTypes } from 'aws-core-vscode/amazonq'
import { registerAuthHook, using, TestFolder } from 'aws-core-vscode/test'
import { loginToIdC } from './utils/setup'
import { waitUntil, workspaceUtils } from 'aws-core-vscode/shared'

describe('Amazon Q Test Generation', function () {
    let framework: qTestingFramework
    let tab: Messenger

    const testFiles = [
        {
            language: 'python',
            filePath: 'python3.7-image-sam-app/hello_world/app.py',
        },
        {
            language: 'java',
            filePath: 'java17-gradle/HelloWorldFunction/src/main/java/helloworld/App.java',
        },
    ]

    const unsupportedLanguages = [
        // move these over to testFiles once these languages are supported
        // must be atleast one unsupported language here for testing
        {
            language: 'typescript',
            filePath: 'ts-plain-sam-app/src/app.ts',
        },
        {
            language: 'javascript',
            filePath: 'js-plain-sam-app/src/app.js',
        },
    ]

    async function setupTestDocument(filePath: string, language: string) {
        const document = await waitUntil(async () => {
            const doc = await workspaceUtils.openTextDocument(filePath)
            return doc
        }, {})

        if (!document) {
            assert.fail(`Failed to open ${language} file`)
        }

        await waitUntil(async () => await vscode.window.showTextDocument(document, { preview: false }), {})

        const activeEditor = vscode.window.activeTextEditor
        if (!activeEditor || activeEditor.document.uri.fsPath !== document.uri.fsPath) {
            assert.fail(`Failed to make temp file active`)
        }
    }

    async function waitForChatItems(index: number) {
        await tab.waitForEvent(() => tab.getChatItems().length > index, {
            waitTimeoutInMs: 5000,
            waitIntervalInMs: 1000,
        })
    }

    before(async function () {
        await using(registerAuthHook('amazonq-test-account'), async () => {
            await loginToIdC()
        })
    })

    beforeEach(async () => {
        registerAuthHook('amazonq-test-account')
        framework = new qTestingFramework('testgen', true, [])
        tab = framework.createTab()
    })

    afterEach(async () => {
        framework.removeTab(tab.tabID)
        framework.dispose()
        sinon.restore()
    })

    describe('Quick action availability', () => {
        it('Shows /test when test generation is enabled', async () => {
            const command = tab.findCommand('/test')
            if (!command.length) {
                assert.fail('Could not find command')
            }
            if (command.length > 1) {
                assert.fail('Found too many commands with the name /test')
            }
        })

        it('Does NOT show /test when test generation is NOT enabled', () => {
            // The beforeEach registers a framework which accepts requests. If we don't dispose before building a new one we have duplicate messages
            framework.dispose()
            framework = new qTestingFramework('testgen', false, [])
            const tab = framework.createTab()
            const command = tab.findCommand('/test')
            if (command.length > 0) {
                assert.fail('Found command when it should not have been found')
            }
        })
    })

    describe('/test entry', () => {
        describe('Unsupported language', () => {
            const { language, filePath } = unsupportedLanguages[0]

            beforeEach(async () => {
                await setupTestDocument(filePath, language)
            })

            it(`/test for unsupported language redirects to chat`, async () => {
                tab.addChatMessage({ command: '/test' })
                await tab.waitForChatFinishesLoading()

                await waitForChatItems(3)
                const unsupportedLanguageMessage = tab.getChatItems()[3]

                assert.deepStrictEqual(unsupportedLanguageMessage.type, 'answer')
                assert.deepStrictEqual(
                    unsupportedLanguageMessage.body,
                    `<span style="color: #EE9D28;">&#9888;<b>I'm sorry, but /test only supports Python and Java</b><br></span> While ${language.charAt(0).toUpperCase() + language.slice(1)} is not supported, I will generate a suggestion below.`
                )
            })
        })

        describe('External file', async () => {
            let testFolder: TestFolder
            let fileName: string

            beforeEach(async () => {
                testFolder = await TestFolder.create()
                fileName = 'test.py'
                const filePath = await testFolder.write(fileName, 'def add(a, b): return a + b')

                const document = await vscode.workspace.openTextDocument(filePath)
                await vscode.window.showTextDocument(document, { preview: false })
            })

            it('/test for external file redirects to chat', async () => {
                tab.addChatMessage({ command: '/test' })
                await tab.waitForChatFinishesLoading()

                await waitForChatItems(3)
                const externalFileMessage = tab.getChatItems()[3]

                assert.deepStrictEqual(externalFileMessage.type, 'answer')
                assert.deepStrictEqual(
                    externalFileMessage.body,
                    `<span style="color: #EE9D28;">&#9888;<b>I can't generate tests for ${fileName}</b> because the file is outside of workspace scope.<br></span> I can still provide examples, instructions and code suggestions.`
                )
            })
        })

        for (const { language, filePath } of testFiles) {
            describe(`${language} file`, () => {
                beforeEach(async () => {
                    await waitUntil(async () => await setupTestDocument(filePath, language), {})

                    tab.addChatMessage({ command: '/test' })
                    await tab.waitForChatFinishesLoading()

                    await tab.waitForButtons([FollowUpTypes.ViewDiff])
                    tab.clickButton(FollowUpTypes.ViewDiff)
                    await tab.waitForChatFinishesLoading()
                })

                describe('View diff', async () => {
                    it('Clicks on view diff', async () => {
                        const chatItems = tab.getChatItems()
                        const viewDiffMessage = chatItems[5]

                        assert.deepStrictEqual(viewDiffMessage.type, 'answer')
                        assert.deepStrictEqual(
                            viewDiffMessage.body,
                            'Please see the unit tests generated below. Click “View diff” to review the changes in the code editor.'
                        )
                    })
                })

                describe('Accept code', async () => {
                    it('Clicks on accept', async () => {
                        await tab.waitForButtons([FollowUpTypes.AcceptCode, FollowUpTypes.RejectCode])
                        tab.clickButton(FollowUpTypes.AcceptCode)
                        await tab.waitForChatFinishesLoading()

                        await waitForChatItems(7)
                        const acceptedMessage = tab.getChatItems()[7]

                        assert.deepStrictEqual(acceptedMessage?.type, 'answer-part')
                        assert.deepStrictEqual(acceptedMessage?.followUp?.options?.[0].pillText, 'Accepted')
                    })
                })

                describe('Reject code', async () => {
                    it('Clicks on reject', async () => {
                        await tab.waitForButtons([FollowUpTypes.AcceptCode, FollowUpTypes.RejectCode])
                        tab.clickButton(FollowUpTypes.RejectCode)
                        await tab.waitForChatFinishesLoading()

                        await waitForChatItems(7)
                        const rejectedMessage = tab.getChatItems()[7]

                        assert.deepStrictEqual(rejectedMessage?.type, 'answer-part')
                        assert.deepStrictEqual(rejectedMessage?.followUp?.options?.[0].pillText, 'Rejected')
                    })
                })
            })
        }
    })
})

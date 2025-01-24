/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// jscpd:ignore-start
import assert from 'assert'
import vscode from 'vscode'
import os from 'os'
import path from 'path'
import fs from 'fs' // eslint-disable-line no-restricted-imports
import { qTestingFramework } from './framework/framework'
import sinon from 'sinon'
import { Messenger } from './framework/messenger'
import { FollowUpTypes } from 'aws-core-vscode/amazonq'
import { registerAuthHook, using } from 'aws-core-vscode/test'
import { loginToIdC } from './utils/setup'
import { openDocument } from './utils/workspaceUtils'
import { globals } from 'aws-core-vscode/shared'

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
        // Close all editors to prevent conflicts with subsequent tests trying to open the same file
        await vscode.commands.executeCommand('workbench.action.closeAllEditors')
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

    describe('Unsupported language', () => {
        const { language, filePath } = unsupportedLanguages[0]

        beforeEach(async () => {
            const document = await openDocument(filePath)
            if (!document) {
                assert.fail(`Failed to open ${language} file`)
            }

            await vscode.window.showTextDocument(document, { preview: false })

            const activeEditor = vscode.window.activeTextEditor
            if (!activeEditor || activeEditor.document !== document) {
                assert.fail(`Failed to make ${language} file active`)
            }
        })

        it(`Does not generate tests for unsupported language`, async () => {
            tab.addChatMessage({ command: '/test' })
            await tab.waitForChatFinishesLoading()

            await tab.waitForEvent(() => tab.getChatItems().length > 3, {
                waitTimeoutInMs: 5000,
                waitIntervalInMs: 1000,
            })
            const message = tab.getChatItems()[3]
            assert.deepStrictEqual(message.type, 'answer')
            assert.deepStrictEqual(
                message.body,
                `<span style="color: #EE9D28;">&#9888;<b>I'm sorry, but /test only supports Python and Java</b><br></span> While ${language.charAt(0).toUpperCase() + language.slice(1)} is not supported, I will generate a suggestion below.`
            )
        })
    })

    describe('External file outside of project', async () => {
        let tempDir: string
        let tempFileName: string

        beforeEach(async () => {
            tempDir = path.join(os.tmpdir(), `testgen-test-${globals.clock.Date.now()}`)
            await fs.promises.mkdir(tempDir)
            tempFileName = `testfile-${globals.clock.Date.now()}.py`
            const tempFilePath = path.join(tempDir, tempFileName)
            await fs.promises.writeFile(tempFilePath, 'def add(a, b): return a + b')
            const uri = vscode.Uri.file(tempFilePath)

            if (!fs.existsSync(tempFilePath)) {
                throw new Error('Failed to create temporary file')
            }

            const document = await vscode.workspace.openTextDocument(uri)
            if (!document) {
                assert.fail(`Failed to open temp file`)
            }

            await vscode.window.showTextDocument(document, { preview: false })

            const activeEditor = vscode.window.activeTextEditor
            if (!activeEditor || activeEditor.document !== document) {
                assert.fail(`Failed to make temp file active`)
            }
        })

        afterEach(async () => {
            if (fs.existsSync(tempDir)) {
                await fs.promises.rm(tempDir, { recursive: true, force: true })
            }
        })

        it('Generate tests for external file redirects to chat', async () => {
            tab.addChatMessage({ command: '/test' })
            await tab.waitForChatFinishesLoading()

            await tab.waitForEvent(() => tab.getChatItems().length > 3, {
                waitTimeoutInMs: 5000,
                waitIntervalInMs: 1000,
            })
            const message = tab.getChatItems()[3]
            assert.deepStrictEqual(message.type, 'answer')
            assert.deepStrictEqual(
                message.body,
                `<span style="color: #EE9D28;">&#9888;<b>I can't generate tests for ${tempFileName}</b> because the file is outside of workspace scope.<br></span> I can still provide examples, instructions and code suggestions.`
            )
        })
    })

    for (const { language, filePath } of testFiles) {
        describe(`Test Generation for ${language}`, () => {
            beforeEach(async () => {
                // retry mechanism as loading active document can be sometimes flaky
                for (let attempt = 1; attempt < 3; attempt++) {
                    const document = await openDocument(filePath)
                    if (!document) {
                        if (attempt === 3) {
                            assert.fail(`Failed to open ${language} file`)
                        }
                        continue
                    }

                    await vscode.window.showTextDocument(document, { preview: false })

                    const activeEditor = vscode.window.activeTextEditor
                    if (!activeEditor || activeEditor.document !== document) {
                        if (attempt === 3) {
                            assert.fail(`Failed to make ${language} file active`)
                        }
                        continue
                    }
                    return
                }
            })

            describe('View diff', async () => {
                it('Clicks on view diff', async () => {
                    tab.addChatMessage({ command: '/test' })
                    await tab.waitForChatFinishesLoading()

                    await tab.waitForButtons([FollowUpTypes.ViewDiff])
                    tab.clickButton(FollowUpTypes.ViewDiff)
                    await tab.waitForChatFinishesLoading()

                    const chatItems = tab.getChatItems()
                    assert.deepStrictEqual(chatItems[5].type, 'answer')
                    assert.deepStrictEqual(
                        chatItems[5].body,
                        'Please see the unit tests generated below. Click “View diff” to review the changes in the code editor.'
                    )
                })
            })

            describe('Accept code', async () => {
                it('Clicks on accept', async () => {
                    tab.addChatMessage({ command: '/test' })
                    await tab.waitForChatFinishesLoading()

                    await tab.waitForButtons([FollowUpTypes.ViewDiff])
                    tab.clickButton(FollowUpTypes.ViewDiff)
                    await tab.waitForChatFinishesLoading()

                    await tab.waitForButtons([FollowUpTypes.AcceptCode, FollowUpTypes.RejectCode])
                    tab.clickButton(FollowUpTypes.AcceptCode)
                    await tab.waitForChatFinishesLoading()

                    await tab.waitForEvent(() => tab.getChatItems().length > 7, {
                        waitTimeoutInMs: 5000,
                        waitIntervalInMs: 1000,
                    })
                    const message = tab.getChatItems()[7]
                    assert.deepStrictEqual(message?.type, 'answer-part')
                    assert.deepStrictEqual(message?.followUp?.options?.[0].pillText, 'Accepted')
                })
            })

            describe('Reject code', async () => {
                it('Clicks on reject', async () => {
                    tab.addChatMessage({ command: '/test' })
                    await tab.waitForChatFinishesLoading()

                    await tab.waitForButtons([FollowUpTypes.ViewDiff])
                    tab.clickButton(FollowUpTypes.ViewDiff)
                    await tab.waitForChatFinishesLoading()

                    await tab.waitForButtons([FollowUpTypes.AcceptCode, FollowUpTypes.RejectCode])
                    tab.clickButton(FollowUpTypes.RejectCode)
                    await tab.waitForChatFinishesLoading()

                    await tab.waitForEvent(() => tab.getChatItems().length > 7, {
                        waitTimeoutInMs: 5000,
                        waitIntervalInMs: 1000,
                    })
                    const message = tab.getChatItems()[7]
                    assert.deepStrictEqual(message?.type, 'answer-part')
                    assert.deepStrictEqual(message?.followUp?.options?.[0].pillText, 'Rejected')
                })
            })
        })
    }
})

// jscpd:ignore-end

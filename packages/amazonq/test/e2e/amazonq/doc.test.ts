/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import vscode from 'vscode'
import assert from 'assert'
import { qTestingFramework } from './framework/framework'
import { getTestWindow, registerAuthHook, toTextEditor, using } from 'aws-core-vscode/test'
import { loginToIdC } from './utils/setup'
import { Messenger } from './framework/messenger'
import { FollowUpTypes } from 'aws-core-vscode/amazonq'
import { fs, i18n, sleep, workspaceUtils } from 'aws-core-vscode/shared'
import {
    docGenerationProgressMessage,
    DocGenerationStep,
    docGenerationSuccessMessage,
    docRejectConfirmation,
    Mode,
} from 'aws-core-vscode/amazonqDoc'

describe('Amazon Q Doc Generation', async function () {
    let framework: qTestingFramework
    let tab: Messenger
    let workspaceUri: vscode.Uri
    let rootReadmeFileUri: vscode.Uri

    type testProjectConfig = {
        path: string
        language: string
        mockFile: string
        mockContent: string
    }
    const testProjects: testProjectConfig[] = [
        {
            path: 'ts-plain-sam-app',
            language: 'TypeScript',
            mockFile: 'bubbleSort.ts',
            mockContent: `
    function bubbleSort(arr: number[]): number[] {
        const n = arr.length;
        for (let i = 0; i < n - 1; i++) {
            for (let j = 0; j < n - i - 1; j++) {
                if (arr[j] > arr[j + 1]) {
                    [arr[j], arr[j + 1]] = [arr[j + 1], arr[j]];
                }
            }
        }
        return arr;
    }`,
        },
        {
            path: 'ruby-plain-sam-app',
            language: 'Ruby',
            mockFile: 'bubble_sort.rb',
            mockContent: `
    def bubble_sort(arr)
        n = arr.length
        (n-1).times do |i|
            (0..n-i-2).each do |j|
                if arr[j] > arr[j+1]
                    arr[j], arr[j+1] = arr[j+1], arr[j]
                end
            end
        end
        arr
    end`,
        },
        {
            path: 'js-plain-sam-app',
            language: 'JavaScript',
            mockFile: 'bubbleSort.js',
            mockContent: `
    function bubbleSort(arr) {
        const n = arr.length;
        for (let i = 0; i < n - 1; i++) {
            for (let j = 0; j < n - i - 1; j++) {
                if (arr[j] > arr[j + 1]) {
                    [arr[j], arr[j + 1]] = [arr[j + 1], arr[j]];
                }
            }
        }
        return arr;
    }`,
        },
        {
            path: 'java11-plain-maven-sam-app',
            language: 'Java',
            mockFile: 'BubbleSort.java',
            mockContent: `
    public static void bubbleSort(int[] arr) {
        int n = arr.length;
        for (int i = 0; i < n - 1; i++) {
            for (int j = 0; j < n - i - 1; j++) {
                if (arr[j] > arr[j + 1]) {
                    int temp = arr[j];
                    arr[j] = arr[j + 1];
                    arr[j + 1] = temp;
                }
            }
        }
    }`,
        },
        {
            path: 'go1-plain-sam-app',
            language: 'Go',
            mockFile: 'bubble_sort.go',
            mockContent: `
    func bubbleSort(arr []int) []int {
        n := len(arr)
        for i := 0; i < n-1; i++ {
            for j := 0; j < n-i-1; j++ {
                if arr[j] > arr[j+1] {
                    arr[j], arr[j+1] = arr[j+1], arr[j]
                }
            }
        }
        return arr
    }`,
        },
        {
            path: 'python3.7-plain-sam-app',
            language: 'Python',
            mockFile: 'bubble_sort.py',
            mockContent: `
    def bubble_sort(arr):
        n = len(arr)
        for i in range(n-1):
            for j in range(0, n-i-1):
                if arr[j] > arr[j+1]:
                    arr[j], arr[j+1] = arr[j+1], arr[j]
        return arr`,
        },
    ]

    const docUtils = {
        async initializeDocOperation(operation: 'create' | 'update' | 'edit') {
            console.log(`Initializing documentation ${operation} operation`)

            switch (operation) {
                case 'create':
                    await tab.waitForButtons([FollowUpTypes.CreateDocumentation, FollowUpTypes.UpdateDocumentation])
                    tab.clickButton(FollowUpTypes.CreateDocumentation)
                    await tab.waitForText(i18n('AWS.amazonq.doc.answer.createReadme'))
                    break
                case 'update':
                    await tab.waitForButtons([FollowUpTypes.CreateDocumentation, FollowUpTypes.UpdateDocumentation])
                    tab.clickButton(FollowUpTypes.UpdateDocumentation)
                    await tab.waitForButtons([FollowUpTypes.SynchronizeDocumentation, FollowUpTypes.EditDocumentation])
                    tab.clickButton(FollowUpTypes.SynchronizeDocumentation)
                    await tab.waitForText(i18n('AWS.amazonq.doc.answer.updateReadme'))
                    break
                case 'edit':
                    await tab.waitForButtons([FollowUpTypes.UpdateDocumentation])
                    tab.clickButton(FollowUpTypes.UpdateDocumentation)
                    await tab.waitForButtons([FollowUpTypes.SynchronizeDocumentation, FollowUpTypes.EditDocumentation])
                    tab.clickButton(FollowUpTypes.EditDocumentation)
                    await tab.waitForText(i18n('AWS.amazonq.doc.answer.updateReadme'))
                    break
            }
        },

        async handleFolderSelection(testProject: testProjectConfig) {
            console.table({
                'Test in project': {
                    Path: testProject.path,
                    Language: testProject.language,
                },
            })

            const projectUri = vscode.Uri.joinPath(workspaceUri, testProject.path)
            const readmeFileUri = vscode.Uri.joinPath(projectUri, 'README.md')

            // Cleanup existing README
            await fs.delete(readmeFileUri, { force: true })

            await tab.waitForButtons([FollowUpTypes.ProceedFolderSelection, FollowUpTypes.ChooseFolder])
            tab.clickButton(FollowUpTypes.ChooseFolder)
            getTestWindow().onDidShowDialog((d) => d.selectItem(projectUri))

            return readmeFileUri
        },

        async executeDocumentationFlow(operation: 'create' | 'update' | 'edit', msg?: string) {
            const mode = operation === 'create' ? Mode.CREATE : operation === 'update' ? Mode.SYNC : Mode.EDIT
            console.log(`Executing documentation ${operation} flow`)

            await tab.waitForButtons([FollowUpTypes.ProceedFolderSelection])
            tab.clickButton(FollowUpTypes.ProceedFolderSelection)

            if (mode === Mode.EDIT && msg) {
                tab.addChatMessage({ prompt: msg })
            }
            await tab.waitForText(docGenerationProgressMessage(DocGenerationStep.SUMMARIZING_FILES, mode))
            await tab.waitForText(`${docGenerationSuccessMessage(mode)} ${i18n('AWS.amazonq.doc.answer.codeResult')}`)
            await tab.waitForButtons([
                FollowUpTypes.AcceptChanges,
                FollowUpTypes.MakeChanges,
                FollowUpTypes.RejectChanges,
            ])
        },

        async verifyResult(action: FollowUpTypes, readmeFileUri?: vscode.Uri, shouldExist = true) {
            tab.clickButton(action)

            if (action === FollowUpTypes.RejectChanges) {
                await tab.waitForText(docRejectConfirmation)
                assert.deepStrictEqual(tab.getChatItems().pop()?.body, docRejectConfirmation)
            }
            await tab.waitForButtons([FollowUpTypes.NewTask, FollowUpTypes.CloseSession])

            if (readmeFileUri) {
                const fileExists = await fs.exists(readmeFileUri)
                console.log(`README file exists: ${fileExists}, Expected: ${shouldExist}`)
                assert.strictEqual(
                    fileExists,
                    shouldExist,
                    shouldExist
                        ? 'README file was not saved to the appropriate folder'
                        : 'README file should not be saved to the folder'
                )
                if (fileExists) {
                    await fs.delete(readmeFileUri, { force: true })
                }
            }
        },

        async prepareMockFile(testProject: testProjectConfig) {
            const folderUri = vscode.Uri.joinPath(workspaceUri, testProject.path)
            const mockFileUri = vscode.Uri.joinPath(folderUri, testProject.mockFile)
            await toTextEditor(testProject.mockContent, testProject.mockFile, folderUri.path)
            return mockFileUri
        },

        getRandomTestProject() {
            const randomIndex = Math.floor(Math.random() * testProjects.length)
            return testProjects[randomIndex]
        },
        async setupTest() {
            tab = framework.createTab()
            tab.addChatMessage({ command: '/doc' })
            tab = framework.getSelectedTab()
            await tab.waitForChatFinishesLoading()
        },
    }
    /**
     * Executes a test method with automatic retry capability for retryable errors.
     * Uses Promise.race to detect errors during test execution without hanging.
     */
    async function retryIfRequired(testMethod: () => Promise<void>, maxAttempts: number = 3) {
        const errorMessages = {
            tooManyRequests: 'Too many requests',
            unexpectedError: 'Encountered an unexpected error when processing the request',
        }
        const hasRetryableError = () => {
            const lastTwoMessages = tab
                .getChatItems()
                .slice(-2)
                .map((item) => item.body)
            return lastTwoMessages.some(
                (body) => body?.includes(errorMessages.unexpectedError) || body?.includes(errorMessages.tooManyRequests)
            )
        }
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            console.log(`Attempt ${attempt}/${maxAttempts}`)
            const errorDetectionPromise = new Promise((_, reject) => {
                const errorCheckInterval = setInterval(() => {
                    if (hasRetryableError()) {
                        clearInterval(errorCheckInterval)
                        reject(new Error('Retryable error detected'))
                    }
                }, 1000)
            })
            try {
                await Promise.race([testMethod(), errorDetectionPromise])
                return
            } catch (error) {
                if (attempt === maxAttempts) {
                    assert.fail(`Test failed after ${maxAttempts} attempts`)
                }
                console.log(`Attempt ${attempt} failed, retrying...`)
                await sleep(1000 * attempt)
                await docUtils.setupTest()
            }
        }
    }
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
        workspaceUtils.hasWorkspace()
        const wsFolders = vscode.workspace.workspaceFolders
        if (!wsFolders?.length) {
            assert.fail('Workspace folder not found')
        }
        workspaceUri = wsFolders[0].uri
        rootReadmeFileUri = vscode.Uri.joinPath(workspaceUri, 'README.md')
    })

    afterEach(() => {
        framework.removeTab(tab.tabID)
        framework.dispose()
    })

    describe('Quick action availability', () => {
        it('Should shows /doc command when doc generation is enabled', async () => {
            const command = tab.findCommand('/doc')
            if (!command.length) {
                assert.fail('Could not find command')
            }

            if (command.length > 1) {
                assert.fail('Found too many commands with the name /doc')
            }
        })

        it('Should hide /doc command when doc generation is NOT enabled', () => {
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
            await docUtils.setupTest()
        })

        it('Should display create and update options on initial load', async () => {
            await tab.waitForButtons([FollowUpTypes.CreateDocumentation, FollowUpTypes.UpdateDocumentation])
        })
        it('Should return to the select create or update documentation state when cancel button clicked', async () => {
            await tab.waitForButtons([FollowUpTypes.CreateDocumentation, FollowUpTypes.UpdateDocumentation])
            tab.clickButton(FollowUpTypes.UpdateDocumentation)
            await tab.waitForButtons([FollowUpTypes.SynchronizeDocumentation, FollowUpTypes.EditDocumentation])
            tab.clickButton(FollowUpTypes.SynchronizeDocumentation)
            await tab.waitForButtons([
                FollowUpTypes.ProceedFolderSelection,
                FollowUpTypes.ChooseFolder,
                FollowUpTypes.CancelFolderSelection,
            ])
            tab.clickButton(FollowUpTypes.CancelFolderSelection)
            await tab.waitForChatFinishesLoading()
            const followupButton = tab.getFollowUpButton(FollowUpTypes.CreateDocumentation)
            if (!followupButton) {
                assert.fail('Could not find follow up button for create or update readme')
            }
        })
    })

    describe('README Creation', () => {
        let testProject: testProjectConfig
        beforeEach(async function () {
            await docUtils.setupTest()
            testProject = docUtils.getRandomTestProject()
        })

        it('Should create and save README in root folder when accepted', async () => {
            await retryIfRequired(async () => {
                await docUtils.initializeDocOperation('create')
                await docUtils.executeDocumentationFlow('create')
                await docUtils.verifyResult(FollowUpTypes.AcceptChanges, rootReadmeFileUri, true)
            })
        })
        it('Should create and save README in subfolder when accepted', async () => {
            await retryIfRequired(async () => {
                await docUtils.initializeDocOperation('create')
                const readmeFileUri = await docUtils.handleFolderSelection(testProject)
                await docUtils.executeDocumentationFlow('create')
                await docUtils.verifyResult(FollowUpTypes.AcceptChanges, readmeFileUri, true)
            })
        })

        it('Should discard README in subfolder when rejected', async () => {
            await retryIfRequired(async () => {
                await docUtils.initializeDocOperation('create')
                const readmeFileUri = await docUtils.handleFolderSelection(testProject)
                await docUtils.executeDocumentationFlow('create')
                await docUtils.verifyResult(FollowUpTypes.RejectChanges, readmeFileUri, false)
            })
        })
    })

    describe('README Editing', () => {
        beforeEach(async function () {
            await docUtils.setupTest()
        })

        it('Should apply specific content changes when requested', async () => {
            await retryIfRequired(async () => {
                await docUtils.initializeDocOperation('edit')
                await docUtils.executeDocumentationFlow('edit', 'remove the repository structure section')
                await docUtils.verifyResult(FollowUpTypes.AcceptChanges, rootReadmeFileUri, true)
            })
        })

        it('Should handle unrelated prompts with appropriate error message', async () => {
            await retryIfRequired(async () => {
                await docUtils.initializeDocOperation('edit')
                await tab.waitForButtons([FollowUpTypes.ProceedFolderSelection])
                tab.clickButton(FollowUpTypes.ProceedFolderSelection)
                tab.addChatMessage({ prompt: 'tell me about the weather' })
                await tab.waitForEvent(() =>
                    tab
                        .getChatItems()
                        .some(({ body }) => body?.startsWith(i18n('AWS.amazonq.doc.error.promptUnrelated')))
                )
                await tab.waitForEvent(() => {
                    const store = tab.getStore()
                    return (
                        !store.promptInputDisabledState &&
                        store.promptInputPlaceholder === i18n('AWS.amazonq.doc.placeholder.editReadme')
                    )
                })
            })
        })
    })
    describe('README Updates', () => {
        let testProject: testProjectConfig
        let mockFileUri: vscode.Uri

        beforeEach(async function () {
            await docUtils.setupTest()
            testProject = docUtils.getRandomTestProject()
        })
        afterEach(async function () {
            // Clean up mock file
            if (mockFileUri) {
                await fs.delete(mockFileUri, { force: true })
            }
        })

        it('Should update README with code change in subfolder', async () => {
            mockFileUri = await docUtils.prepareMockFile(testProject)
            await retryIfRequired(async () => {
                await docUtils.initializeDocOperation('update')
                const readmeFileUri = await docUtils.handleFolderSelection(testProject)
                await docUtils.executeDocumentationFlow('update')
                await docUtils.verifyResult(FollowUpTypes.AcceptChanges, readmeFileUri, true)
            })
        })
        it('Should update root README and incorporate additional changes', async () => {
            // Cleanup any existing README
            await fs.delete(rootReadmeFileUri, { force: true })
            mockFileUri = await docUtils.prepareMockFile(testProject)
            await retryIfRequired(async () => {
                await docUtils.initializeDocOperation('update')
                await docUtils.executeDocumentationFlow('update')
                tab.clickButton(FollowUpTypes.MakeChanges)
                tab.addChatMessage({ prompt: 'remove the repository structure section' })

                await tab.waitForText(docGenerationProgressMessage(DocGenerationStep.SUMMARIZING_FILES, Mode.SYNC))
                await tab.waitForText(
                    `${docGenerationSuccessMessage(Mode.SYNC)} ${i18n('AWS.amazonq.doc.answer.codeResult')}`
                )
                await tab.waitForButtons([
                    FollowUpTypes.AcceptChanges,
                    FollowUpTypes.MakeChanges,
                    FollowUpTypes.RejectChanges,
                ])

                await docUtils.verifyResult(FollowUpTypes.AcceptChanges, rootReadmeFileUri, true)
            })
        })
    })
})

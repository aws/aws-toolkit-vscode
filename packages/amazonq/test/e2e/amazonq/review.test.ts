/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 * Zuo
 */

import assert from 'assert'
import vscode from 'vscode'
import { qTestingFramework } from './framework/framework'
import sinon from 'sinon'
import { Messenger } from './framework/messenger'
import { registerAuthHook, using, closeAllEditors } from 'aws-core-vscode/test'
import { loginToIdC } from './utils/setup'
import {
    codewhispererDiagnosticSourceLabel,
    invalidFileTypeChatMessage,
    CodeAnalysisScope,
    SecurityScanStep,
} from 'aws-core-vscode/codewhisperer'
import path from 'path'
import { ScanAction, scanProgressMessage } from '../../../src/app/amazonqScan/models/constants'

function getWorkspaceFolder(): string {
    return vscode.workspace.workspaceFolders![0].uri.fsPath
}

describe('Amazon Q Code Review', function () {
    let framework: qTestingFramework
    let tab: Messenger

    function extractAndValidateIssues(reviewString: string): Record<string, number> {
        const issueRegex = /- (\w+): `(\d+) issues?`/g
        const issues: Record<string, number> = {
            Critical: 0,
            High: 0,
            Medium: 0,
            Low: 0,
            Info: 0,
        }
        const foundCategories = new Set<string>()

        let match
        while ((match = issueRegex.exec(reviewString)) !== null) {
            const [, severity, count] = match
            if (severity in issues) {
                issues[severity] = parseInt(count, 10)
                foundCategories.add(severity)
            }
        }

        const expectedCategories = Object.keys(issues)
        const missingCategories = expectedCategories.filter((category) => !foundCategories.has(category))

        assert.deepStrictEqual(
            missingCategories.length,
            0,
            `Output chat issue format is not correct or it does not have these categories: ${missingCategories.join(', ')}`
        )
        return issues
    }

    function hasExactlyMatchingSecurityDiagnostic(
        diagnostics: vscode.Diagnostic[],
        code: string,
        message: string,
        startLine: number,
        endLine: number,
        count: number = 1
    ) {
        const matchingDiagnostics = diagnostics.filter(
            (diagnostic) =>
                diagnostic.code === code &&
                diagnostic.message === message &&
                diagnostic.range.start.line === startLine &&
                diagnostic.range.end.line === endLine
        )

        assert.deepEqual(matchingDiagnostics.length, count)
    }

    async function waitForChatItems(index: number, waitTimeoutInMs: number = 5000, waitIntervalInMs: number = 1000) {
        await tab.waitForEvent(() => tab.getChatItems().length > index, {
            waitTimeoutInMs: waitTimeoutInMs,
            waitIntervalInMs: waitIntervalInMs,
        })
    }

    async function validateInitialChatMessage() {
        tab.addChatMessage({ command: '/review' })
        await waitForChatItems(4)
        const fileOrWorkspaceMessage = tab.getChatItems()[4]
        assert.deepStrictEqual(fileOrWorkspaceMessage.type, 'ai-prompt')
    }

    async function waitForReviewResults(tab: Messenger): Promise<string> {
        await waitForChatItems(7, 600_000, 10_000)
        const scanResultsMessage = tab.getChatItems()[7]
        assert.deepStrictEqual(scanResultsMessage.type, 'answer')

        const scanResultBody = scanResultsMessage.body ?? ''
        assert.notDeepStrictEqual(scanResultBody, '')
        return scanResultBody
    }

    before(async function () {
        await using(registerAuthHook('amazonq-test-account'), async () => {
            await loginToIdC()
        })
    })

    beforeEach(async () => {
        registerAuthHook('amazonq-test-account')
        framework = new qTestingFramework('review', true, [])
        tab = framework.createTab()
    })

    afterEach(async () => {
        await closeAllEditors()
        framework.removeTab(tab.tabID)
        framework.dispose()
        sinon.restore()
    })

    describe('Quick action availability', () => {
        it('Shows /review when code review is enabled', async () => {
            const command = tab.findCommand('/review')
            if (!command.length) {
                assert.fail('Could not find command')
            }
            if (command.length > 1) {
                assert.fail('Found too many commands with the name /review')
            }
        })

        it('Does NOT show /review when code review is NOT enabled', () => {
            framework.dispose()
            framework = new qTestingFramework('review', false, [])
            const tab = framework.createTab()
            const command = tab.findCommand('/review')
            if (command.length > 0) {
                assert.fail('Found command when it should not have been found')
            }
        })
    })

    describe('/review initial chat output', () => {
        it('Shows appropriate message when /review is entered', async () => {
            tab.addChatMessage({ command: '/review' })

            await waitForChatItems(4)
            const fileOrWorkspaceMessage = tab.getChatItems()[4]

            assert.deepStrictEqual(fileOrWorkspaceMessage.type, 'ai-prompt')
            assert.deepStrictEqual(
                fileOrWorkspaceMessage.body,
                'Would you like to review your active file or the workspace you have open?'
            )
        })
    })

    describe('/review entry', () => {
        describe('No file open when review active file', () => {
            it('Shows appropriate message when no file is open', async () => {
                await validateInitialChatMessage()

                tab.clickButton(ScanAction.RUN_FILE_SCAN)

                await waitForChatItems(5)
                const noFileMessage = tab.getChatItems()[5]
                assert.deepStrictEqual(noFileMessage.type, 'answer')
                assert.deepStrictEqual(noFileMessage.body, invalidFileTypeChatMessage)
            })
        })

        describe('review insecure file or project', async () => {
            const testFolder = path.join(getWorkspaceFolder(), 'QCAFolder')
            const fileName = 'ProblematicCode.java'
            const filePath = path.join(testFolder, fileName)

            beforeEach(async () => {
                await validateInitialChatMessage()
            })

            it.skip('/review file gives correct critical and high security issues', async () => {
                const document = await vscode.workspace.openTextDocument(filePath)
                await vscode.window.showTextDocument(document)

                tab.clickButton(ScanAction.RUN_FILE_SCAN)

                await waitForChatItems(6)
                const scanningInProgressMessage = tab.getChatItems()[6]
                assert.deepStrictEqual(
                    scanningInProgressMessage.body,
                    scanProgressMessage(SecurityScanStep.CREATE_SCAN_JOB, CodeAnalysisScope.FILE_ON_DEMAND, fileName)
                )

                const scanResultBody = await waitForReviewResults(tab)

                const issues = extractAndValidateIssues(scanResultBody)
                assert.deepStrictEqual(
                    issues.Critical >= 1,
                    true,
                    `critical issue ${issues.Critical} is not larger or equal to 1`
                )

                const uri = vscode.Uri.file(filePath)
                const securityDiagnostics: vscode.Diagnostic[] = vscode.languages
                    .getDiagnostics(uri)
                    .filter((diagnostic) => diagnostic.source === codewhispererDiagnosticSourceLabel)

                // 1 exact critical issue matches
                hasExactlyMatchingSecurityDiagnostic(
                    securityDiagnostics,
                    'java-do-not-hardcode-database-password',
                    'CWE-798 - Hardcoded credentials',
                    20,
                    21
                )
            })

            it('/review project gives findings', async () => {
                tab.clickButton(ScanAction.RUN_PROJECT_SCAN)

                const scanResultBody = await waitForReviewResults(tab)
                extractAndValidateIssues(scanResultBody)
            })
        })

        describe('/review file and project scans should respect ignored line findings', async () => {
            const testFolder = path.join(getWorkspaceFolder(), 'QCAFolder')
            const fileName = 'ProblematicCode.java'
            const filePath = path.join(testFolder, fileName)

            beforeEach(async () => {
                await validateInitialChatMessage()

                const document = await vscode.workspace.openTextDocument(filePath)
                await vscode.window.showTextDocument(document)

                const editor = vscode.window.activeTextEditor

                if (editor) {
                    const position = new vscode.Position(20, 0)
                    await editor.edit((editBuilder) => {
                        editBuilder.insert(position, '// amazonq-ignore-next-line\n')
                    })
                }
            })

            it('/review file respect ignored line findings', async () => {
                tab.clickButton(ScanAction.RUN_FILE_SCAN)
            })

            it('/review project respect ignored line findings', async () => {
                tab.clickButton(ScanAction.RUN_PROJECT_SCAN)
            })

            afterEach(async () => {
                await waitForReviewResults(tab)

                const uri = vscode.Uri.file(filePath)
                const securityDiagnostics: vscode.Diagnostic[] = vscode.languages
                    .getDiagnostics(uri)
                    .filter((diagnostic) => diagnostic.source === codewhispererDiagnosticSourceLabel)

                // cannot find this ignored issue
                hasExactlyMatchingSecurityDiagnostic(
                    securityDiagnostics,
                    'java-do-not-hardcode-database-password',
                    'CWE-798 - Hardcoded credentials',
                    21,
                    22,
                    0
                )

                const editor = vscode.window.activeTextEditor
                if (editor) {
                    await editor.edit((editBuilder) => {
                        const lineRange = editor.document.lineAt(20).rangeIncludingLineBreak
                        editBuilder.delete(lineRange)
                    })
                }
            })
        })
    })
})

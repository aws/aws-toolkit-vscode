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
import { codewhispererDiagnosticSourceLabel } from 'aws-core-vscode/codewhisperer'
import path from 'path'

function getWorkspaceFolder(): string {
    return (
        vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ??
        path.join(__dirname, '../../../../core/src/testFixtures/workspaceFolder')
    )
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
        console.log('running this test')
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

                tab.clickButton('runFileScan')

                await waitForChatItems(5)
                const noFileMessage = tab.getChatItems()[5]
                assert.deepStrictEqual(noFileMessage.type, 'answer')
                assert.deepStrictEqual(
                    noFileMessage.body,
                    'Sorry, your current active window is not a source code file. Make sure you select a source file as your primary context.'
                )
            })
        })

        describe('review insecure file or project', async () => {
            const testFolder = path.join(getWorkspaceFolder(), 'QCAFolder')
            const fileName = 'ProblematicCode.java'
            const filePath = path.join(testFolder, fileName)

            beforeEach(async () => {
                await validateInitialChatMessage()
            })

            it('/review file gives correct critical and high security issues', async () => {
                const document = await vscode.workspace.openTextDocument(filePath)
                await vscode.window.showTextDocument(document)

                tab.clickButton('runFileScan')

                await waitForChatItems(6)
                const scanningInProgressMessage = tab.getChatItems()[6]
                assert.deepStrictEqual(
                    scanningInProgressMessage.body,
                    "Okay, I'm reviewing `ProblematicCode.java` for code issues.\n\nThis may take a few minutes. I'll share my progress here.\n\n&#9744; Initiating code review\n\n&#9744; Reviewing your code \n\n&#9744; Processing review results \n"
                )

                const scanResultBody = await waitForReviewResults(tab)

                const issues = extractAndValidateIssues(scanResultBody)
                assert.deepStrictEqual(
                    issues.Critical >= 3,
                    true,
                    `critical issue ${issues.Critical} is not larger than 2`
                )
                assert.deepStrictEqual(issues.High >= 2, true, `high issue ${issues.High} is not larger than 1`)
                assert.deepStrictEqual(issues.Medium >= 8, true, `medium issue ${issues.Medium} is not larger than 7`)
                assert.deepStrictEqual(issues.Low, 0, `low issues ${issues.Low} should be 0`)
                assert.deepStrictEqual(issues.Info, 0, `info issues ${issues.Info} should be 0`)

                const uri = vscode.Uri.file(filePath)
                const securityDiagnostics: vscode.Diagnostic[] = vscode.languages
                    .getDiagnostics(uri)
                    .filter((diagnostic) => diagnostic.source === codewhispererDiagnosticSourceLabel)

                // 3 exact critical issue matches
                hasExactlyMatchingSecurityDiagnostic(
                    securityDiagnostics,
                    'multilanguage-password',
                    'CWE-798 - Hardcoded credentials',
                    10,
                    11
                )

                hasExactlyMatchingSecurityDiagnostic(
                    securityDiagnostics,
                    'java-do-not-hardcode-database-password',
                    'CWE-798 - Hardcoded credentials',
                    20,
                    21
                )

                hasExactlyMatchingSecurityDiagnostic(
                    securityDiagnostics,
                    'java-crypto-compliance',
                    'CWE-327,328,326,208,1240 - Insecure cryptography',
                    55,
                    56
                )
            })

            it('/review project gives findings', async () => {
                tab.clickButton('runProjectScan')

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
                    const position = new vscode.Position(55, 0)
                    await editor.edit((editBuilder) => {
                        editBuilder.insert(position, '// amazonq-ignore-next-line\n')
                    })
                }
            })

            it('/review file respect ignored line findings', async () => {
                tab.clickButton('runFileScan')
            })

            it('/review project respect ignored line findings', async () => {
                tab.clickButton('runProjectScan')
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
                    'java-crypto-compliance',
                    'CWE-327,328,326,208,1240 - Insecure cryptography',
                    55,
                    56,
                    0
                )

                const editor = vscode.window.activeTextEditor
                if (editor) {
                    await editor.edit((editBuilder) => {
                        const lineRange = editor.document.lineAt(55).rangeIncludingLineBreak
                        editBuilder.delete(lineRange)
                    })
                }
            })
        })
    })
})

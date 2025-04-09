/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 * Zuo
 */

import assert from 'assert'
import * as vscode from 'vscode'
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
    amazonqCodeIssueDetailsTabTitle,
    CodeWhispererConstants,
    // codeScanState,
} from 'aws-core-vscode/codewhisperer'
import path from 'path'
import { ScanAction, scanProgressMessage } from '../../../src/app/amazonqScan/models/constants'
import { CodeScanIssue } from 'aws-core-vscode/codewhisperer'
import { SecurityIssueProvider } from 'aws-core-vscode/codewhisperer'

/**
 * Generic polling function that waits for a condition to be met
 * @param conditionFn Function that returns the result when condition is met, or undefined when not met
 * @param timeoutMs Maximum time to wait in milliseconds
 * @param intervalMs Polling interval in milliseconds
 * @returns The result from the condition function or undefined if timeout occurs
 */
async function pollForResult<T>(
    conditionFn: () => T | undefined,
    timeoutMs: number = 60000,
    intervalMs: number = 500
): Promise<T | undefined> {
    const startTime = Date.now()

    while (Date.now() - startTime < timeoutMs) {
        const result = conditionFn()
        if (result !== undefined) {
            return result
        }
        await new Promise((resolve) => setTimeout(resolve, intervalMs))
    }

    return undefined
}

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

    function matchingSecurityDiagnosticCount(
        diagnostics: vscode.Diagnostic[],
        code: string,
        message: string,
        lineNumber?: number
    ) {
        const matchingDiagnostics = diagnostics.filter((diagnostic) => {
            let matches = diagnostic.code === code && diagnostic.message === message

            // Only filter by startLine if it's provided
            if (lineNumber !== undefined) {
                matches =
                    matches && diagnostic.range.start.line <= lineNumber && diagnostic.range.end.line >= lineNumber
            }

            return matches
        })

        return matchingDiagnostics.length
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
        // await vscode.commands.executeCommand('aws.codeWhisperer.toggleCodeScan')
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
                assert.equal(
                    matchingSecurityDiagnosticCount(
                        securityDiagnostics,
                        'java-do-not-hardcode-database-password',
                        'CWE-798 - Hardcoded credentials',
                        21
                    ),
                    1
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
                assert.equal(
                    matchingSecurityDiagnosticCount(
                        securityDiagnostics,
                        'java-do-not-hardcode-database-password',
                        'CWE-798 - Hardcoded credentials',
                        22
                    ),
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

    it.skip('Clicks on view details, generate fix, verify diff in webview, apply fix', async () => {
        const testFolder = path.join(getWorkspaceFolder(), 'QCAFolder')
        const fileName = 'ProblematicCode.java'
        const filePath = path.join(testFolder, fileName)

        await validateInitialChatMessage()

        const document = await vscode.workspace.openTextDocument(filePath)
        await vscode.window.showTextDocument(document)

        // Store original content for later comparison
        const originalContent = document.getText()

        tab.clickButton(ScanAction.RUN_FILE_SCAN)

        await waitForChatItems(6)
        const scanningInProgressMessage = tab.getChatItems()[6]
        assert.deepStrictEqual(
            scanningInProgressMessage.body,
            scanProgressMessage(SecurityScanStep.CREATE_SCAN_JOB, CodeAnalysisScope.FILE_ON_DEMAND, fileName)
        )

        // Wait for scan to complete
        const scanResultBody = await waitForReviewResults(tab)

        // Verify we have issues
        const issues = extractAndValidateIssues(scanResultBody)
        assert.deepStrictEqual(
            issues.Critical >= 1,
            true,
            `critical issue ${issues.Critical} is not larger or equal to 1`
        )

        // Get security diagnostics
        const uri = vscode.Uri.file(filePath)
        const securityDiagnostics: vscode.Diagnostic[] = vscode.languages
            .getDiagnostics(uri)
            .filter((diagnostic) => diagnostic.source === codewhispererDiagnosticSourceLabel)

        assert.ok(securityDiagnostics.length > 0, 'No security diagnostics found')

        // Find the critical issue diagnostic
        const sampleDiagnostic = securityDiagnostics[0]
        assert.ok(sampleDiagnostic, 'Could not find critical issue diagnostic')

        // Create a range from the diagnostic
        const range = new vscode.Range(sampleDiagnostic.range.start, sampleDiagnostic.range.end)

        // Get code actions for the diagnostic
        const codeActions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
            'vscode.executeCodeActionProvider',
            uri,
            range
        )

        // Find the "View details" code action
        const viewDetailsAction = codeActions?.find((action) => action.title.includes('View details'))
        assert.ok(viewDetailsAction, 'Could not find View details code action')

        // Execute the view details command
        if (viewDetailsAction?.command) {
            await vscode.commands.executeCommand(
                viewDetailsAction.command.command,
                ...viewDetailsAction.command.arguments!
            )
        }

        // Wait for the webview panel to open with polling
        const webviewPanel = await pollForResult<vscode.WebviewPanel>(
            () => {
                // Find the webview panel for code issue details
                const panels = vscode.window.tabGroups.all
                    .flatMap((group) => group.tabs)
                    .filter((tab) => tab.label === amazonqCodeIssueDetailsTabTitle)
                    .map((tab) => tab.input)
                    .filter((input): input is vscode.WebviewPanel => input !== undefined)

                return panels.length > 0 ? panels[0] : undefined
            },
            20_000,
            1000
        )

        assert.ok(webviewPanel, 'Security issue webview panel did not open after waiting')

        // Click the Explain button in the webview
        // Since we can't directly interact with the webview, we'll execute the command
        const issue = viewDetailsAction.command?.arguments?.[0] as CodeScanIssue
        await vscode.commands.executeCommand('aws.amazonq.explainIssue', issue)

        // Verify the explanation was generated appears in the new chat tab(not the old chat)

        const tabs = vscode.window.tabGroups.all
            .flatMap((group) => group.tabs)
            .filter((tab) => tab.label.includes('Amazon Q'))

        console.log(tabs)

        // Click the Generate Fix button in the webview
        // Since we can't directly interact with the webview, we'll execute the command
        await vscode.commands.executeCommand('aws.amazonq.security.generateFix', issue, filePath, 'webview')

        // Wait for the fix to be generated with polling
        const updatedIssue = await pollForResult<CodeScanIssue>(
            () => {
                const foundIssue = SecurityIssueProvider.instance.issues
                    .flatMap(({ issues }) => issues)
                    .find((i) => i.findingId === issue.findingId)

                return foundIssue?.suggestedFixes?.length !== undefined && foundIssue?.suggestedFixes?.length > 0
                    ? foundIssue
                    : undefined
            },
            CodeWhispererConstants.codeFixJobTimeoutMs,
            CodeWhispererConstants.codeFixJobPollingIntervalMs
        )

        // Verify the fix was generated by checking if the issue has suggestedFixes
        assert.ok(updatedIssue, 'Could not find updated issue')
        assert.ok(updatedIssue.suggestedFixes.length > 0, 'No suggested fixes were generated')

        assert.ok(webviewPanel, 'Security issue webview panel did not open after waiting')

        // Get the suggested fix and verify it contains diff markers
        const suggestedFix = updatedIssue.suggestedFixes[0]
        const suggestedFixDiff = suggestedFix.code
        assert.ok(suggestedFixDiff, 'No suggested fix code was found')
        assert.ok(
            suggestedFixDiff.includes('-') && suggestedFixDiff.includes('+'),
            'Suggested fix does not contain diff markers'
        )

        // Parse the diff to extract removed and added lines
        const diffLines = suggestedFixDiff.split('\n')
        const removedLines = diffLines
            .filter((line) => line.startsWith('-') && !line.startsWith('---'))
            .map((line) => line.substring(1).trim())
        const addedLines = diffLines
            .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
            .map((line) => line.substring(1).trim())

        // Make sure we found some changes in the diff
        assert.ok(addedLines.length + removedLines.length > 0, 'No added or deleted lines found in the diff')

        // Apply the fix
        await vscode.commands.executeCommand('aws.amazonq.applySecurityFix', updatedIssue, filePath, 'webview')

        // Wait for the fix to be applied
        await new Promise((resolve) => setTimeout(resolve, 1000))

        // Verify the fix was applied to the file
        const updatedDocument = await vscode.workspace.openTextDocument(filePath)
        const updatedContent = updatedDocument.getText()

        // Check that the content has changed
        assert.notStrictEqual(updatedContent, originalContent, 'File content did not change after applying the fix')

        // Count occurrences of each line in original and updated content
        const countOccurrences = (text: string, line: string): number => {
            const regex = new RegExp(`^\\s*${line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'gm')
            const matches = text.match(regex)
            return matches ? matches.length : 0
        }

        // Create a dictionary to track expected line count changes
        const lineCountChanges: Record<string, number> = {}

        // Process removed lines (decrement count)
        for (const removedLine of removedLines) {
            if (removedLine.trim()) {
                // Skip empty lines
                const trimmedLine = removedLine.trim()
                lineCountChanges[trimmedLine] = (lineCountChanges[trimmedLine] || 0) - 1
            }
        }

        // Process added lines (increment count)
        for (const addedLine of addedLines) {
            if (addedLine.trim()) {
                // Skip empty lines
                const trimmedLine = addedLine.trim()
                lineCountChanges[trimmedLine] = (lineCountChanges[trimmedLine] || 0) + 1
            }
        }

        // Verify all line count changes match expectations
        for (const [line, expectedChange] of Object.entries(lineCountChanges)) {
            const originalCount = countOccurrences(originalContent, line)
            const updatedCount = countOccurrences(updatedContent, line)
            const actualChange = updatedCount - originalCount

            assert.strictEqual(
                actualChange,
                expectedChange,
                `Line "${line}" count change mismatch: expected ${expectedChange}, got ${actualChange} (original: ${originalCount}, updated: ${updatedCount})`
            )
        }

        // Revert the changes
        await vscode.workspace.fs.writeFile(uri, Buffer.from(originalContent))

        // Wait a moment for the file system to update
        await new Promise((resolve) => setTimeout(resolve, 1000))

        // Verify the file was reverted
        const revertedDocument = await vscode.workspace.openTextDocument(filePath)
        const revertedContent = revertedDocument.getText()

        assert.deepStrictEqual(revertedContent, originalContent, 'File content was not properly reverted')
    })

    describe('Project and file scans should return at least 1 LLM findings', async () => {
        const testFolder = path.join(getWorkspaceFolder(), 'QCAFolder')
        const fileName = 'RLinker.java'
        const filePath = path.join(testFolder, fileName)
        let document: vscode.TextDocument

        function assertAtLeastOneLLMFindings(securityDiagnostics: vscode.Diagnostic[]) {
            const readabilityIssuesCount = matchingSecurityDiagnosticCount(
                securityDiagnostics,
                'java-code-quality-readability-maintainability',
                'Readability and maintainability issues detected.'
            )
            const performanceIssuesCount = matchingSecurityDiagnosticCount(
                securityDiagnostics,
                'java-code-quality-performance',
                'Performance inefficiencies detected in code.'
            )
            const errorHandlingIssuesCount = matchingSecurityDiagnosticCount(
                securityDiagnostics,
                'java-code-quality-error-handling',
                'Inadequate error handling detected.'
            )
            const namingIssuesCount = matchingSecurityDiagnosticCount(
                securityDiagnostics,
                'java-code-quality-naming',
                'Inconsistent or unclear naming detected.'
            )
            const loggingIssuesCount = matchingSecurityDiagnosticCount(
                securityDiagnostics,
                'java-code-quality-logging',
                'Insufficient or improper logging found.'
            )
            assert.ok(
                readabilityIssuesCount +
                    performanceIssuesCount +
                    errorHandlingIssuesCount +
                    namingIssuesCount +
                    loggingIssuesCount >
                    0,
                'No LLM findings were found'
            )
        }

        beforeEach(async () => {
            await validateInitialChatMessage()

            document = await vscode.workspace.openTextDocument(filePath)
            await vscode.window.showTextDocument(document)
        })

        // eslint-disable-next-line aws-toolkits/no-only-in-tests
        it('file scan returns at least 1 LLM findings', async () => {
            tab.clickButton(ScanAction.RUN_FILE_SCAN)

            await waitForChatItems(6)
            const scanningInProgressMessage = tab.getChatItems()[6]
            assert.deepStrictEqual(
                scanningInProgressMessage.body,
                scanProgressMessage(SecurityScanStep.CREATE_SCAN_JOB, CodeAnalysisScope.FILE_ON_DEMAND, fileName)
            )

            const scanResultBody = await waitForReviewResults(tab)

            extractAndValidateIssues(scanResultBody)

            const uri = vscode.Uri.file(filePath)
            const securityDiagnostics: vscode.Diagnostic[] = vscode.languages
                .getDiagnostics(uri)
                .filter((diagnostic) => diagnostic.source === codewhispererDiagnosticSourceLabel)

            assertAtLeastOneLLMFindings(securityDiagnostics)
        })

        // eslint-disable-next-line aws-toolkits/no-only-in-tests
        it('project scan returns at least 1 LLM findings', async () => {
            tab.clickButton(ScanAction.RUN_PROJECT_SCAN)

            await waitForChatItems(6)
            const scanningInProgressMessage = tab.getChatItems()[6]
            assert.deepStrictEqual(
                scanningInProgressMessage.body,
                scanProgressMessage(SecurityScanStep.CREATE_SCAN_JOB, CodeAnalysisScope.PROJECT)
            )

            console.log('waiting for project scan to finish')
            const scanResultBody = await waitForReviewResults(tab)
            console.log('done')

            extractAndValidateIssues(scanResultBody)

            const uri = vscode.Uri.file(filePath)
            const securityDiagnostics: vscode.Diagnostic[] = vscode.languages
                .getDiagnostics(uri)
                .filter((diagnostic) => diagnostic.source === codewhispererDiagnosticSourceLabel)

            assertAtLeastOneLLMFindings(securityDiagnostics)
        })
    })
})

/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import assert from 'assert'
import * as sinon from 'sinon'
import {
    CodeWhispererStatusBar,
    InlineCompletionService,
    refreshStatusBar,
} from '../../../codewhisperer/service/inlineCompletionService'
import { createMockTextEditor, resetCodeWhispererGlobalVariables, createMockDocument } from '../testUtil'
import { ReferenceInlineProvider } from '../../../codewhisperer/service/referenceInlineProvider'
import { RecommendationHandler } from '../../../codewhisperer/service/recommendationHandler'
import * as codewhispererSdkClient from '../../../codewhisperer/client/codewhisperer'
import { CodeSuggestionsState, ConfigurationEntry } from '../../../codewhisperer/models/model'
import { CWInlineCompletionItemProvider } from '../../../codewhisperer/service/inlineCompletionItemProvider'
import { session } from '../../../codewhisperer/util/codeWhispererSession'
import { AuthUtil } from '../../../codewhisperer/util/authUtil'
import { listCodeWhispererCommandsId } from '../../../codewhisperer/ui/statusBarMenu'
import { tryRegister } from '../../testUtil'

describe('inlineCompletionService', function () {
    beforeEach(async function () {
        await resetCodeWhispererGlobalVariables()
    })

    describe('getPaginatedRecommendation', function () {
        const config: ConfigurationEntry = {
            isShowMethodsEnabled: true,
            isManualTriggerEnabled: true,
            isAutomatedTriggerEnabled: true,
            isSuggestionsWithCodeReferencesEnabled: true,
        }

        let mockClient: codewhispererSdkClient.DefaultCodeWhispererClient

        beforeEach(async function () {
            mockClient = new codewhispererSdkClient.DefaultCodeWhispererClient()
            await resetCodeWhispererGlobalVariables()
        })

        afterEach(function () {
            sinon.restore()
        })

        it('should call checkAndResetCancellationTokens before showing inline and next token to be null', async function () {
            tryRegister(refreshStatusBar)

            const mockEditor = createMockTextEditor()
            sinon.stub(RecommendationHandler.instance, 'getRecommendations').resolves({
                result: 'Succeeded',
                errorMessage: undefined,
                recommendationCount: 1,
            })
            const checkAndResetCancellationTokensStub = sinon.stub(
                RecommendationHandler.instance,
                'checkAndResetCancellationTokens'
            )
            session.recommendations = [{ content: "\n\t\tconsole.log('Hello world!');\n\t}" }, { content: '' }]
            await InlineCompletionService.instance.getPaginatedRecommendation(
                mockClient,
                mockEditor,
                'OnDemand',
                config
            )
            assert.ok(checkAndResetCancellationTokensStub.called)
            assert.strictEqual(RecommendationHandler.instance.hasNextToken(), false)
        })
    })

    describe('clearInlineCompletionStates', function () {
        it('should remove inline reference and recommendations', async function () {
            const fakeReferences = [
                {
                    message: '',
                    licenseName: 'MIT',
                    repository: 'http://github.com/fake',
                    recommendationContentSpan: {
                        start: 0,
                        end: 10,
                    },
                },
            ]
            ReferenceInlineProvider.instance.setInlineReference(1, 'test', fakeReferences)
            session.recommendations = [{ content: "\n\t\tconsole.log('Hello world!');\n\t}" }, { content: '' }]
            session.language = 'python'

            assert.ok(session.recommendations.length > 0)
            await RecommendationHandler.instance.clearInlineCompletionStates()
            assert.strictEqual(ReferenceInlineProvider.instance.refs.length, 0)
            assert.strictEqual(session.recommendations.length, 0)
        })
    })

    describe('truncateOverlapWithRightContext', function () {
        const fileName = 'test.py'
        const language = 'python'
        const rightContext = 'return target\n'
        const doc = `import math\ndef two_sum(nums, target):\n`
        const provider = new CWInlineCompletionItemProvider(0, 0, [], '', new vscode.Position(0, 0), '')

        it('removes overlap with right context from suggestion', async function () {
            const mockSuggestion = 'return target\n'
            const mockEditor = createMockTextEditor(`${doc}${rightContext}`, fileName, language)
            const cursorPosition = new vscode.Position(2, 0)
            const result = provider.truncateOverlapWithRightContext(mockEditor.document, mockSuggestion, cursorPosition)
            assert.strictEqual(result, '')
        })

        it('only removes the overlap part from suggestion', async function () {
            const mockSuggestion = 'print(nums)\nreturn target\n'
            const mockEditor = createMockTextEditor(`${doc}${rightContext}`, fileName, language)
            const cursorPosition = new vscode.Position(2, 0)
            const result = provider.truncateOverlapWithRightContext(mockEditor.document, mockSuggestion, cursorPosition)
            assert.strictEqual(result, 'print(nums)\n')
        })

        it('only removes the last overlap pattern from suggestion', async function () {
            const mockSuggestion = 'return target\nprint(nums)\nreturn target\n'
            const mockEditor = createMockTextEditor(`${doc}${rightContext}`, fileName, language)
            const cursorPosition = new vscode.Position(2, 0)
            const result = provider.truncateOverlapWithRightContext(mockEditor.document, mockSuggestion, cursorPosition)
            assert.strictEqual(result, 'return target\nprint(nums)\n')
        })

        it('returns empty string if the remaining suggestion only contains white space', async function () {
            const mockSuggestion = 'return target\n     '
            const mockEditor = createMockTextEditor(`${doc}${rightContext}`, fileName, language)
            const cursorPosition = new vscode.Position(2, 0)
            const result = provider.truncateOverlapWithRightContext(mockEditor.document, mockSuggestion, cursorPosition)
            assert.strictEqual(result, '')
        })

        it('returns the original suggestion if no match found', async function () {
            const mockSuggestion = 'import numpy\n'
            const mockEditor = createMockTextEditor(`${doc}${rightContext}`, fileName, language)
            const cursorPosition = new vscode.Position(2, 0)
            const result = provider.truncateOverlapWithRightContext(mockEditor.document, mockSuggestion, cursorPosition)
            assert.strictEqual(result, 'import numpy\n')
        })

        it('ignores the space at the end of recommendation', async function () {
            const mockSuggestion = 'return target\n\n\n\n\n'
            const mockEditor = createMockTextEditor(`${doc}${rightContext}`, fileName, language)
            const cursorPosition = new vscode.Position(2, 0)
            const result = provider.truncateOverlapWithRightContext(mockEditor.document, mockSuggestion, cursorPosition)
            assert.strictEqual(result, '')
        })
    })
})

describe('CWInlineCompletionProvider', function () {
    beforeEach(async function () {
        await resetCodeWhispererGlobalVariables()
    })

    describe('provideInlineCompletionItems', function () {
        beforeEach(async function () {
            await resetCodeWhispererGlobalVariables()
        })

        afterEach(function () {
            sinon.restore()
        })

        it('should return undefined if position is before RecommendationHandler start pos', async function () {
            tryRegister(refreshStatusBar)

            const position = new vscode.Position(0, 0)
            const document = createMockDocument()
            const fakeContext = { triggerKind: 0, selectedCompletionInfo: undefined }
            const token = new vscode.CancellationTokenSource().token
            const provider = new CWInlineCompletionItemProvider(0, 0, [], '', new vscode.Position(1, 1), '')
            const result = await provider.provideInlineCompletionItems(document, position, fakeContext, token)

            assert.ok(result === undefined)
        })
    })
})

describe('codewhisperer status bar', function () {
    let sandbox: sinon.SinonSandbox
    let statusBar: TestStatusBar
    let service: InlineCompletionService

    class TestStatusBar extends CodeWhispererStatusBar {
        constructor() {
            super()
        }

        getStatusBar() {
            return this.statusBar
        }
    }

    before(async function () {
        tryRegister(refreshStatusBar)
    })

    beforeEach(async function () {
        await resetCodeWhispererGlobalVariables()
        sandbox = sinon.createSandbox()
        statusBar = new TestStatusBar()
        service = new InlineCompletionService(statusBar)
    })

    afterEach(function () {
        sandbox.restore()
    })

    it('shows correct status bar when auth is not connected', async function () {
        sandbox.stub(AuthUtil.instance, 'isConnectionValid').returns(false)
        sandbox.stub(AuthUtil.instance, 'isConnectionExpired').returns(false)

        await service.refreshStatusBar()

        const actualStatusBar = statusBar.getStatusBar()
        assert.strictEqual(actualStatusBar.text, '$(chrome-close) CodeWhisperer')
        assert.strictEqual(actualStatusBar.command, listCodeWhispererCommandsId)
        assert.deepStrictEqual(actualStatusBar.backgroundColor, undefined)
    })

    it('shows correct status bar when auth is connected', async function () {
        sandbox.stub(AuthUtil.instance, 'isConnectionValid').returns(true)
        sandbox.stub(CodeSuggestionsState.instance, 'isSuggestionsEnabled').returns(true)

        await service.refreshStatusBar()

        const actualStatusBar = statusBar.getStatusBar()
        assert.strictEqual(actualStatusBar.text, '$(debug-start) CodeWhisperer')
        assert.strictEqual(actualStatusBar.command, listCodeWhispererCommandsId)
        assert.deepStrictEqual(actualStatusBar.backgroundColor, undefined)
    })

    it('shows correct status bar when auth is connected but paused', async function () {
        sandbox.stub(AuthUtil.instance, 'isConnectionValid').returns(true)
        sandbox.stub(CodeSuggestionsState.instance, 'isSuggestionsEnabled').returns(false)

        await service.refreshStatusBar()

        const actualStatusBar = statusBar.getStatusBar()
        assert.strictEqual(actualStatusBar.text, '$(debug-pause) CodeWhisperer')
        assert.strictEqual(actualStatusBar.command, listCodeWhispererCommandsId)
        assert.deepStrictEqual(actualStatusBar.backgroundColor, undefined)
    })

    it('shows correct status bar when auth is expired', async function () {
        sandbox.stub(AuthUtil.instance, 'isConnectionValid').returns(false)
        sandbox.stub(AuthUtil.instance, 'isConnectionExpired').returns(true)

        await service.refreshStatusBar()

        const actualStatusBar = statusBar.getStatusBar()
        assert.strictEqual(actualStatusBar.text, '$(debug-disconnect) CodeWhisperer')
        assert.strictEqual(actualStatusBar.command, listCodeWhispererCommandsId)
        assert.deepStrictEqual(
            actualStatusBar.backgroundColor,
            new vscode.ThemeColor('statusBarItem.warningBackground')
        )
    })
})

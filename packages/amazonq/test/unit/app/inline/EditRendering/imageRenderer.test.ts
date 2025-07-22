/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as sinon from 'sinon'
import assert from 'assert'
// Remove static import - we'll use dynamic import instead
// import { showEdits } from '../../../../../src/app/inline/EditRendering/imageRenderer'
import { SvgGenerationService } from '../../../../../src/app/inline/EditRendering/svgGenerator'
import { InlineCompletionItemWithReferences } from '@aws/language-server-runtimes/protocol'

describe('showEdits', function () {
    let sandbox: sinon.SinonSandbox
    let editorStub: sinon.SinonStubbedInstance<vscode.TextEditor>
    let documentStub: sinon.SinonStubbedInstance<vscode.TextDocument>
    let svgGenerationServiceStub: sinon.SinonStubbedInstance<SvgGenerationService>
    let displaySvgDecorationStub: sinon.SinonStub
    let loggerStub: sinon.SinonStubbedInstance<any>
    let getLoggerStub: sinon.SinonStub
    let showEdits: any // Will be dynamically imported
    let languageClientStub: any
    let sessionStub: any
    let itemStub: InlineCompletionItemWithReferences

    // Helper function to create mock SVG result
    function createMockSvgResult(overrides: Partial<any> = {}) {
        return {
            svgImage: vscode.Uri.file('/path/to/generated.svg'),
            startLine: 5,
            newCode: 'console.log("Hello World");',
            origionalCodeHighlightRange: [{ line: 5, start: 0, end: 10 }],
            ...overrides,
        }
    }

    beforeEach(function () {
        sandbox = sinon.createSandbox()

        // Create logger stub
        loggerStub = {
            error: sandbox.stub(),
            info: sandbox.stub(),
            debug: sandbox.stub(),
            warn: sandbox.stub(),
        }

        // Clear all relevant module caches
        const moduleId = require.resolve('../../../../../src/app/inline/EditRendering/imageRenderer')
        const sharedModuleId = require.resolve('aws-core-vscode/shared')
        delete require.cache[moduleId]
        delete require.cache[sharedModuleId]

        // jscpd:ignore-start
        // Create getLogger stub and store reference for test verification
        getLoggerStub = sandbox.stub().returns(loggerStub)

        // Create a mock shared module with stubbed getLogger
        const mockSharedModule = {
            getLogger: getLoggerStub,
        }

        // Override the require cache with our mock
        require.cache[sharedModuleId] = {
            id: sharedModuleId,
            filename: sharedModuleId,
            loaded: true,
            parent: undefined,
            children: [],
            exports: mockSharedModule,
            paths: [],
        } as any

        // Now require the module - it should use our mocked getLogger
        // jscpd:ignore-end
        const imageRendererModule = require('../../../../../src/app/inline/EditRendering/imageRenderer')
        showEdits = imageRendererModule.showEdits

        // Create document stub
        documentStub = {
            uri: {
                fsPath: '/path/to/test/file.ts',
            },
            getText: sandbox.stub().returns('Original code content'),
            lineCount: 5,
        } as unknown as sinon.SinonStubbedInstance<vscode.TextDocument>

        // Create editor stub
        editorStub = {
            document: documentStub,
            setDecorations: sandbox.stub(),
            edit: sandbox.stub().resolves(true),
        } as unknown as sinon.SinonStubbedInstance<vscode.TextEditor>

        // Create SVG generation service stub
        svgGenerationServiceStub = {
            generateDiffSvg: sandbox.stub(),
        } as unknown as sinon.SinonStubbedInstance<SvgGenerationService>

        // Stub the SvgGenerationService constructor
        sandbox
            .stub(SvgGenerationService.prototype, 'generateDiffSvg')
            .callsFake(svgGenerationServiceStub.generateDiffSvg)

        // Create display SVG decoration stub
        displaySvgDecorationStub = sandbox.stub()
        sandbox.replace(
            require('../../../../../src/app/inline/EditRendering/displayImage'),
            'displaySvgDecoration',
            displaySvgDecorationStub
        )

        // Create language client stub
        languageClientStub = {} as any

        // Create session stub
        sessionStub = {
            sessionId: 'test-session-id',
            suggestions: [],
            isRequestInProgress: false,
            requestStartTime: Date.now(),
            startPosition: new vscode.Position(0, 0),
        } as any

        // Create item stub
        itemStub = {
            insertText: 'console.log("Hello World");',
            range: new vscode.Range(0, 0, 0, 0),
            itemId: 'test-item-id',
        } as any
    })

    afterEach(function () {
        sandbox.restore()
    })

    it('should return early when editor is undefined', async function () {
        await showEdits(itemStub, undefined, sessionStub, languageClientStub)

        // Verify that no SVG generation or display methods were called
        sinon.assert.notCalled(svgGenerationServiceStub.generateDiffSvg)
        sinon.assert.notCalled(displaySvgDecorationStub)
        sinon.assert.notCalled(loggerStub.error)
    })

    it('should successfully generate and display SVG when all parameters are valid', async function () {
        // Setup successful SVG generation
        const mockSvgResult = createMockSvgResult()
        svgGenerationServiceStub.generateDiffSvg.resolves(mockSvgResult)

        await showEdits(itemStub, editorStub as unknown as vscode.TextEditor, sessionStub, languageClientStub)

        // Verify SVG generation was called with correct parameters
        sinon.assert.calledOnce(svgGenerationServiceStub.generateDiffSvg)
        sinon.assert.calledWith(
            svgGenerationServiceStub.generateDiffSvg,
            '/path/to/test/file.ts',
            'console.log("Hello World");'
        )

        // Verify display decoration was called with correct parameters
        sinon.assert.calledOnce(displaySvgDecorationStub)
        sinon.assert.calledWith(
            displaySvgDecorationStub,
            editorStub,
            mockSvgResult.svgImage,
            mockSvgResult.startLine,
            mockSvgResult.newCode,
            mockSvgResult.origionalCodeHighlightRange,
            sessionStub,
            languageClientStub,
            itemStub
        )

        // Verify no errors were logged
        sinon.assert.notCalled(loggerStub.error)
    })

    it('should log error when SVG generation returns empty result', async function () {
        // Setup SVG generation to return undefined svgImage
        const mockSvgResult = createMockSvgResult({ svgImage: undefined as any })
        svgGenerationServiceStub.generateDiffSvg.resolves(mockSvgResult)

        await showEdits(itemStub, editorStub as unknown as vscode.TextEditor, sessionStub, languageClientStub)

        // Verify SVG generation was called
        sinon.assert.calledOnce(svgGenerationServiceStub.generateDiffSvg)

        // Verify display decoration was NOT called
        sinon.assert.notCalled(displaySvgDecorationStub)

        // Verify error was logged
        sinon.assert.calledOnce(loggerStub.error)
        sinon.assert.calledWith(loggerStub.error, 'SVG image generation returned an empty result.')
    })

    it('should catch and log error when SVG generation throws exception', async function () {
        // Setup SVG generation to throw an error
        const testError = new Error('SVG generation failed')
        svgGenerationServiceStub.generateDiffSvg.rejects(testError)

        await showEdits(itemStub, editorStub as unknown as vscode.TextEditor, sessionStub, languageClientStub)

        // Verify SVG generation was called
        sinon.assert.calledOnce(svgGenerationServiceStub.generateDiffSvg)

        // Verify display decoration was NOT called
        sinon.assert.notCalled(displaySvgDecorationStub)

        // Verify error was logged with correct message
        sinon.assert.calledOnce(loggerStub.error)
        const errorCall = loggerStub.error.getCall(0)
        assert.strictEqual(errorCall.args[0], `Error generating SVG image: ${testError}`)
    })

    it('should catch and log error when displaySvgDecoration throws exception', async function () {
        // Setup successful SVG generation
        const mockSvgResult = createMockSvgResult()
        svgGenerationServiceStub.generateDiffSvg.resolves(mockSvgResult)

        // Setup displaySvgDecoration to throw an error
        const testError = new Error('Display decoration failed')
        displaySvgDecorationStub.rejects(testError)

        await showEdits(itemStub, editorStub as unknown as vscode.TextEditor, sessionStub, languageClientStub)

        // Verify SVG generation was called
        sinon.assert.calledOnce(svgGenerationServiceStub.generateDiffSvg)

        // Verify display decoration was called
        sinon.assert.calledOnce(displaySvgDecorationStub)

        // Verify error was logged with correct message
        sinon.assert.calledOnce(loggerStub.error)
        const errorCall = loggerStub.error.getCall(0)
        assert.strictEqual(errorCall.args[0], `Error generating SVG image: ${testError}`)
    })

    it('should use correct logger name', async function () {
        await showEdits(itemStub, editorStub as unknown as vscode.TextEditor, sessionStub, languageClientStub)

        // Verify getLogger was called with correct name
        sinon.assert.calledWith(getLoggerStub, 'nextEditPrediction')
    })

    it('should handle item with undefined insertText', async function () {
        // Create item with undefined insertText
        const itemWithUndefinedText = {
            ...itemStub,
            insertText: undefined,
        } as any

        // Setup successful SVG generation
        const mockSvgResult = createMockSvgResult()
        svgGenerationServiceStub.generateDiffSvg.resolves(mockSvgResult)

        await showEdits(
            itemWithUndefinedText,
            editorStub as unknown as vscode.TextEditor,
            sessionStub,
            languageClientStub
        )

        // Verify SVG generation was called with undefined as string
        sinon.assert.calledOnce(svgGenerationServiceStub.generateDiffSvg)
        sinon.assert.calledWith(svgGenerationServiceStub.generateDiffSvg, '/path/to/test/file.ts', undefined)
    })
})

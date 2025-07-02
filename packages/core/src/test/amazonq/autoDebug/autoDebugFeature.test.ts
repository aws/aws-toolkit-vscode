/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as vscode from 'vscode'
import sinon from 'sinon'
import { AutoDebugFeature } from '../../../amazonq/autoDebug/index'
import { AutoDebugController, AutoDebugConfig } from '../../../amazonq/autoDebug/autoDebugController'
import { ContextMenuProvider } from '../../../amazonq/autoDebug/ide/contextMenuProvider'
import { AutoDebugCodeActionsProvider } from '../../../amazonq/autoDebug/ide/codeActionsProvider'
import { Commands } from '../../../shared/vscode/commands2'
import { focusAmazonQPanel } from '../../../codewhispererChat/commands/registerCommands'
import { getLogger } from '../../../shared/logger/logger'

describe('AutoDebugFeature', function () {
    let autoDebugFeature: AutoDebugFeature
    let mockContext: vscode.ExtensionContext
    let loggerStub: sinon.SinonStub
    let commandsRegisterStub: sinon.SinonStub
    let focusAmazonQPanelStub: sinon.SinonStub
    let vscodeWindowStubs: {
        showWarningMessage: sinon.SinonStub
        showInformationMessage: sinon.SinonStub
        showErrorMessage: sinon.SinonStub
        setStatusBarMessage: sinon.SinonStub
    }

    beforeEach(function () {
        // Mock VSCode APIs
        mockContext = {
            subscriptions: [],
            workspaceState: {
                get: sinon.stub(),
                update: sinon.stub(),
            },
            globalState: {
                get: sinon.stub(),
                update: sinon.stub(),
            },
        } as any

        // Mock VSCode window methods
        vscodeWindowStubs = {
            showWarningMessage: sinon.stub(vscode.window, 'showWarningMessage'),
            showInformationMessage: sinon.stub(vscode.window, 'showInformationMessage'),
            showErrorMessage: sinon.stub(vscode.window, 'showErrorMessage'),
            setStatusBarMessage: sinon.stub(vscode.window, 'setStatusBarMessage'),
        }

        // Mock Commands
        commandsRegisterStub = sinon.stub(Commands, 'register')

        // Mock focusAmazonQPanel
        focusAmazonQPanelStub = sinon.stub(focusAmazonQPanel, 'execute')

        // Mock logger to avoid noise in tests
        loggerStub = sinon.stub().returns({
            debug: sinon.stub(),
            info: sinon.stub(),
            warn: sinon.stub(),
            error: sinon.stub(),
        })
        sinon.stub(getLogger as any, 'default').returns(loggerStub())

        // Create fresh instance for each test
        autoDebugFeature = new AutoDebugFeature()
    })

    afterEach(function () {
        sinon.restore()
        if (autoDebugFeature) {
            autoDebugFeature.dispose()
        }
    })

    describe('constructor', function () {
        it('implements vscode.Disposable', function () {
            assert.strictEqual(typeof autoDebugFeature.dispose, 'function')
        })
    })

    describe('activate', function () {
        beforeEach(function () {
            // Mock the controller and providers that will be created during activation
            sinon.stub(AutoDebugController.prototype, 'constructor' as any)
            sinon.stub(AutoDebugController.prototype, 'getConfig').returns(createMockConfig())
            sinon.stub(AutoDebugController.prototype, 'startSession').resolves()

            sinon.stub(ContextMenuProvider.prototype, 'constructor' as any)
            sinon.stub(AutoDebugCodeActionsProvider.prototype, 'constructor' as any)
        })

        it('activates successfully with default config', async function () {
            await autoDebugFeature.activate(mockContext)

            const controller = autoDebugFeature.getController()
            assert.notStrictEqual(controller, undefined)
        })

        it('activates with custom config', async function () {
            const customConfig: Partial<AutoDebugConfig> = {
                enabled: false,
                autoReportThreshold: 5,
            }

            await autoDebugFeature.activate(mockContext, customConfig)

            const controller = autoDebugFeature.getController()
            assert.notStrictEqual(controller, undefined)
        })

        it('activates with client and encryption key', async function () {
            const mockClient = { test: 'client' }
            const mockEncryptionKey = Buffer.from('test-key')

            await autoDebugFeature.activate(mockContext, undefined, mockClient, mockEncryptionKey)

            const controller = autoDebugFeature.getController()
            assert.notStrictEqual(controller, undefined)
        })

        it('registers commands', async function () {
            await autoDebugFeature.activate(mockContext)

            assert.strictEqual(commandsRegisterStub.callCount, 3)
            assert.ok(commandsRegisterStub.calledWith('amazonq.autoDebug.detectProblems'))
            assert.ok(commandsRegisterStub.calledWith('amazonq.autoDebug.toggle'))
            assert.ok(commandsRegisterStub.calledWith('amazonq.autoDebug.showStatus'))
        })

        it('starts session when enabled', async function () {
            const startSessionStub = sinon.stub(AutoDebugController.prototype, 'startSession').resolves()

            await autoDebugFeature.activate(mockContext)

            assert.ok(startSessionStub.calledOnce)
        })

        it('does not start session when disabled', async function () {
            const mockConfig = createMockConfig({ enabled: false })
            sinon.stub(AutoDebugController.prototype, 'getConfig').returns(mockConfig)
            const startSessionStub = sinon.stub(AutoDebugController.prototype, 'startSession').resolves()

            await autoDebugFeature.activate(mockContext)

            assert.ok(startSessionStub.notCalled)
        })

        it('throws on activation failure', async function () {
            sinon.stub(AutoDebugController.prototype, 'constructor' as any).throws(new Error('Test error'))

            await assert.rejects(async () => autoDebugFeature.activate(mockContext), /Test error/)
        })
    })

    describe('updateConfig', function () {
        it('updates controller config', async function () {
            const updateConfigStub = sinon.stub(AutoDebugController.prototype, 'updateConfig')
            await autoDebugFeature.activate(mockContext)

            const newConfig = { enabled: false }
            autoDebugFeature.updateConfig(newConfig)

            assert.ok(updateConfigStub.calledOnceWith(newConfig))
        })

        it('handles no controller gracefully', function () {
            const newConfig = { enabled: false }
            assert.doesNotThrow(() => autoDebugFeature.updateConfig(newConfig))
        })
    })

    describe('isEnabled', function () {
        it('returns enabled state when controller exists', async function () {
            const mockConfig = createMockConfig({ enabled: true })
            sinon.stub(AutoDebugController.prototype, 'getConfig').returns(mockConfig)
            await autoDebugFeature.activate(mockContext)

            const result = autoDebugFeature.isEnabled()

            assert.strictEqual(result, true)
        })

        it('returns false when controller does not exist', function () {
            const result = autoDebugFeature.isEnabled()

            assert.strictEqual(result, false)
        })
    })

    describe('detectProblems', function () {
        it('detects problems successfully', async function () {
            const mockProblems = createMockProblems(2)
            const detectProblemsStub = sinon
                .stub(AutoDebugController.prototype, 'detectProblems')
                .resolves(mockProblems)
            await autoDebugFeature.activate(mockContext)

            await autoDebugFeature.detectProblems()

            assert.ok(detectProblemsStub.calledOnce)
            assert.ok(vscodeWindowStubs.showInformationMessage.calledWith('Found 2 problems in your code'))
        })

        it('shows correct message for single problem', async function () {
            const mockProblems = createMockProblems(1)
            sinon.stub(AutoDebugController.prototype, 'detectProblems').resolves(mockProblems)
            await autoDebugFeature.activate(mockContext)

            await autoDebugFeature.detectProblems()

            assert.ok(vscodeWindowStubs.showInformationMessage.calledWith('Found 1 problem in your code'))
        })

        it('shows no problems message', async function () {
            sinon.stub(AutoDebugController.prototype, 'detectProblems').resolves([])
            await autoDebugFeature.activate(mockContext)

            await autoDebugFeature.detectProblems()

            assert.ok(vscodeWindowStubs.showInformationMessage.calledWith('No new problems detected'))
        })

        it('handles controller not initialized', async function () {
            await autoDebugFeature.detectProblems()

            // Should not throw, should handle gracefully
            assert.ok(vscodeWindowStubs.showErrorMessage.notCalled)
        })

        it('handles detection errors', async function () {
            sinon.stub(AutoDebugController.prototype, 'detectProblems').rejects(new Error('Detection failed'))
            await autoDebugFeature.activate(mockContext)

            await autoDebugFeature.detectProblems()

            assert.ok(vscodeWindowStubs.showErrorMessage.calledWith('Failed to detect problems'))
        })
    })

    describe('triggerFixWithAmazonQ', function () {
        it('triggers fix successfully', async function () {
            const fixAllProblemsStub = sinon.stub(AutoDebugController.prototype, 'fixAllProblemsInFile').resolves()
            focusAmazonQPanelStub.resolves()
            await autoDebugFeature.activate(mockContext)

            // Access private method through any cast for testing
            await (autoDebugFeature as any).triggerFixWithAmazonQ()

            assert.ok(focusAmazonQPanelStub.calledOnce)
            assert.ok(fixAllProblemsStub.calledOnceWith(10))
        })

        it('handles controller not initialized', async function () {
            // Access private method through any cast for testing
            await (autoDebugFeature as any).triggerFixWithAmazonQ()

            // Should not throw, should handle gracefully
            assert.ok(focusAmazonQPanelStub.notCalled)
        })

        it('handles fix errors', async function () {
            sinon.stub(AutoDebugController.prototype, 'fixAllProblemsInFile').rejects(new Error('Fix failed'))
            focusAmazonQPanelStub.resolves()
            await autoDebugFeature.activate(mockContext)

            // Access private method through any cast for testing
            await (autoDebugFeature as any).triggerFixWithAmazonQ()

            assert.ok(vscodeWindowStubs.showErrorMessage.calledOnce)
            const errorCall = vscodeWindowStubs.showErrorMessage.getCall(0)
            assert.ok(errorCall.args[0].includes('Failed to start Fix with Amazon Q'))
        })
    })

    describe('setLanguageClient', function () {
        it('sets language client on controller', async function () {
            const setLanguageClientStub = sinon.stub(AutoDebugController.prototype, 'setLanguageClient')
            await autoDebugFeature.activate(mockContext)

            const mockClient = { test: 'client' }
            const mockEncryptionKey = Buffer.from('test-key')

            autoDebugFeature.setLanguageClient(mockClient, mockEncryptionKey)

            assert.ok(setLanguageClientStub.calledOnceWith(mockClient))
        })

        it('handles encryption key setting', async function () {
            const mockLspClient = {
                setEncryptionKey: sinon.stub(),
            }
            const controllerStub = sinon.stub(AutoDebugController.prototype, 'setLanguageClient')

            // Mock accessing the private lspClient property
            const getControllerStub = sinon.stub()
            getControllerStub.returns({ lspClient: mockLspClient })

            await autoDebugFeature.activate(mockContext)

            const mockClient = { test: 'client' }
            const mockEncryptionKey = Buffer.from('test-key')

            autoDebugFeature.setLanguageClient(mockClient, mockEncryptionKey)

            assert.ok(controllerStub.calledOnceWith(mockClient))
        })
    })

    describe('notification handling', function () {
        it('handles warning message success', async function () {
            const mockProblems = createMockProblems(1, 'error')
            const mockEventEmitter = createMockEventEmitter()

            sinon.stub(AutoDebugController.prototype, 'onProblemsDetected').value(mockEventEmitter)
            vscodeWindowStubs.showWarningMessage.resolves('Fix with Amazon Q')
            const triggerFixStub = sinon.stub(AutoDebugController.prototype, 'fixAllProblemsInFile').resolves()
            focusAmazonQPanelStub.resolves()

            await autoDebugFeature.activate(mockContext)

            // Simulate problems detected event
            await mockEventEmitter.fire(mockProblems)

            // Wait for async operations
            await new Promise((resolve) => setTimeout(resolve, 10))

            assert.ok(vscodeWindowStubs.showWarningMessage.calledOnce)
            assert.ok(focusAmazonQPanelStub.calledOnce)
            assert.ok(triggerFixStub.calledOnce)
        })

        it('handles warning message failure with fallback', async function () {
            const mockProblems = createMockProblems(1, 'error')
            const mockEventEmitter = createMockEventEmitter()

            sinon.stub(AutoDebugController.prototype, 'onProblemsDetected').value(mockEventEmitter)
            vscodeWindowStubs.showWarningMessage.rejects(new Error('Warning failed'))
            vscodeWindowStubs.showInformationMessage.resolves('Fix with Amazon Q')
            focusAmazonQPanelStub.resolves()

            await autoDebugFeature.activate(mockContext)

            // Simulate problems detected event
            await mockEventEmitter.fire(mockProblems)

            // Wait for async operations
            await new Promise((resolve) => setTimeout(resolve, 10))

            assert.ok(vscodeWindowStubs.showWarningMessage.calledOnce)
            assert.ok(vscodeWindowStubs.showInformationMessage.calledOnce)
        })

        it('handles all notification failures with status bar fallback', async function () {
            const mockProblems = createMockProblems(2, 'error')
            const mockEventEmitter = createMockEventEmitter()

            sinon.stub(AutoDebugController.prototype, 'onProblemsDetected').value(mockEventEmitter)
            vscodeWindowStubs.showWarningMessage.rejects(new Error('Warning failed'))
            vscodeWindowStubs.showInformationMessage.rejects(new Error('Info failed'))
            vscodeWindowStubs.showErrorMessage.rejects(new Error('Error failed'))

            await autoDebugFeature.activate(mockContext)

            // Simulate problems detected event
            await mockEventEmitter.fire(mockProblems)

            // Wait for async operations
            await new Promise((resolve) => setTimeout(resolve, 600))

            assert.ok(vscodeWindowStubs.setStatusBarMessage.calledOnce)
            const statusCall = vscodeWindowStubs.setStatusBarMessage.getCall(0)
            assert.ok(statusCall.args[0].includes('Amazon Q: 2 errors detected'))
        })

        it('filters non-error problems correctly', async function () {
            const mockWarningProblems = createMockProblems(2, 'warning')
            const mockEventEmitter = createMockEventEmitter()

            sinon.stub(AutoDebugController.prototype, 'onProblemsDetected').value(mockEventEmitter)

            await autoDebugFeature.activate(mockContext)

            // Simulate problems detected event with warnings (should not trigger notification)
            await mockEventEmitter.fire(mockWarningProblems)

            // Wait for async operations
            await new Promise((resolve) => setTimeout(resolve, 10))

            // Should show debug notification instead of main notification
            assert.ok(vscodeWindowStubs.showWarningMessage.calledOnce)
            const warningCall = vscodeWindowStubs.showWarningMessage.getCall(0)
            assert.ok(warningCall.args[0].includes('debug mode'))
        })
    })

    describe('command handlers', function () {
        it('registers and handles detectProblems command', async function () {
            const detectProblemsStub = sinon.stub(AutoDebugController.prototype, 'detectProblems').resolves([])
            await autoDebugFeature.activate(mockContext)

            // Get the registered command handler
            const detectProblemsCall = commandsRegisterStub
                .getCalls()
                .find((call) => call.args[0] === 'amazonq.autoDebug.detectProblems')
            assert.ok(detectProblemsCall)

            const commandHandler = detectProblemsCall.args[1]
            await commandHandler()

            assert.ok(detectProblemsStub.calledOnce)
        })

        it('registers and handles toggle command', async function () {
            const updateConfigStub = sinon.stub(AutoDebugController.prototype, 'updateConfig')
            await autoDebugFeature.activate(mockContext)

            // Get the registered command handler
            const toggleCall = commandsRegisterStub
                .getCalls()
                .find((call) => call.args[0] === 'amazonq.autoDebug.toggle')
            assert.ok(toggleCall)

            const commandHandler = toggleCall.args[1]
            await commandHandler()

            assert.ok(updateConfigStub.calledOnceWith({ enabled: false }))
            assert.ok(vscodeWindowStubs.showInformationMessage.calledWith('Amazon Q Auto Debug disabled'))
        })

        it('registers and handles showStatus command', async function () {
            const mockConfig = createMockConfig()
            sinon.stub(AutoDebugController.prototype, 'getConfig').returns(mockConfig)
            sinon.stub(AutoDebugController.prototype, 'getCurrentSession').returns(undefined)
            sinon.stub(AutoDebugController.prototype, 'getCategorizedProblems').returns(undefined)

            const mockDoc = { uri: vscode.Uri.file('/test/status.md') } as vscode.TextDocument
            const openTextDocumentStub = sinon.stub(vscode.workspace, 'openTextDocument').resolves(mockDoc)
            const showTextDocumentStub = sinon.stub(vscode.window, 'showTextDocument').resolves()

            await autoDebugFeature.activate(mockContext)

            // Get the registered command handler
            const statusCall = commandsRegisterStub
                .getCalls()
                .find((call) => call.args[0] === 'amazonq.autoDebug.showStatus')
            assert.ok(statusCall)

            const commandHandler = statusCall.args[1]
            await commandHandler()

            assert.ok(openTextDocumentStub.calledOnce)
            assert.ok(showTextDocumentStub.calledOnce)
        })
    })

    describe('dispose', function () {
        it('disposes cleanly', async function () {
            await autoDebugFeature.activate(mockContext)

            assert.doesNotThrow(() => autoDebugFeature.dispose())
        })

        it('can be called multiple times', async function () {
            await autoDebugFeature.activate(mockContext)

            assert.doesNotThrow(() => {
                autoDebugFeature.dispose()
                autoDebugFeature.dispose()
            })
        })
    })

    // Helper functions to reduce code duplication
    function createMockConfig(overrides: Partial<AutoDebugConfig> = {}): AutoDebugConfig {
        return {
            enabled: true,
            autoReportThreshold: 1,
            includedSources: [],
            excludedSources: ['spell-checker'],
            severityFilter: ['error'],
            debounceMs: 2000,
            ...overrides,
        }
    }

    function createMockProblems(count: number, severity: 'error' | 'warning' | 'info' | 'hint' = 'error'): any[] {
        const problems = []
        for (let i = 0; i < count; i++) {
            problems.push({
                uri: vscode.Uri.file(`/test/file${i}.ts`),
                diagnostic: {
                    message: `Test problem ${i + 1}`,
                    range: new vscode.Range(i, 0, i, 10),
                    severity:
                        severity === 'error' ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning,
                },
                severity,
                source: 'test-source',
                isNew: true,
            })
        }
        return problems
    }

    function createMockEventEmitter(): any {
        const listeners: any[] = []
        return {
            event: (listener: any) => {
                listeners.push(listener)
                return { dispose: () => {} }
            },
            fire: async (data: any) => {
                for (const listener of listeners) {
                    await listener(data)
                }
            },
            dispose: () => {},
        }
    }
})

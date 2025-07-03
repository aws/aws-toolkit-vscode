/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as vscode from 'vscode'
import sinon from 'sinon'
import { AutoDebugFeature } from '../../../amazonq/autoDebug/index'
import { AutoDebugController, AutoDebugConfig } from '../../../amazonq/autoDebug/autoDebugController'
import { Commands } from '../../../shared/vscode/commands2'
import { focusAmazonQPanel } from '../../../codewhispererChat/commands/registerCommands'
describe('AutoDebugFeature', function () {
    let autoDebugFeature: AutoDebugFeature
    let mockContext: vscode.ExtensionContext
    let commandsRegisterStub: sinon.SinonStub
    let focusAmazonQPanelStub: sinon.SinonStub

    beforeEach(function () {
        // Mock Commands
        commandsRegisterStub = sinon.stub(Commands, 'register')

        // Mock focusAmazonQPanel
        focusAmazonQPanelStub = sinon.stub(focusAmazonQPanel, 'execute')

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
        let getConfigStub: sinon.SinonStub
        let startSessionStub: sinon.SinonStub

        beforeEach(function () {
            // Mock the controller and providers that will be created during activation
            getConfigStub = sinon.stub(AutoDebugController.prototype, 'getConfig').returns(createMockConfig())
            startSessionStub = sinon.stub(AutoDebugController.prototype, 'startSession').resolves()
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
            // Reset the command register stub to count only calls from this test
            commandsRegisterStub.resetHistory()

            await autoDebugFeature.activate(mockContext)

            // Check that the specific AutoDebug commands were registered
            const autoDebugCalls = commandsRegisterStub
                .getCalls()
                .filter((call) => typeof call.args[0] === 'string' && call.args[0].includes('amazonq.autoDebug'))

            assert.strictEqual(autoDebugCalls.length, 3)
            assert.ok(commandsRegisterStub.calledWith('amazonq.autoDebug.detectProblems'))
            assert.ok(commandsRegisterStub.calledWith('amazonq.autoDebug.toggle'))
            assert.ok(commandsRegisterStub.calledWith('amazonq.autoDebug.showStatus'))
        })

        it('starts session when enabled', async function () {
            await autoDebugFeature.activate(mockContext)

            assert.ok(startSessionStub.calledOnce)
        })

        it('does not start session when disabled', async function () {
            const mockConfig = createMockConfig({ enabled: false })
            getConfigStub.returns(mockConfig)

            await autoDebugFeature.activate(mockContext)

            assert.ok(startSessionStub.notCalled)
        })

        it('throws on activation failure', async function () {
            // Stub the AutoDebugController constructor to throw during instantiation
            const originalConstructor = AutoDebugController
            const MockAutoDebugController = function (this: any) {
                throw new Error('Test error')
            }
            MockAutoDebugController.prototype = originalConstructor.prototype

            // Replace the constructor temporarily
            const constructorStub = sinon
                .stub(require('../../../amazonq/autoDebug/autoDebugController'), 'AutoDebugController')
                .value(MockAutoDebugController)

            await assert.rejects(async () => autoDebugFeature.activate(mockContext), /Test error/)

            constructorStub.restore()
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
        })

        it('handles controller not initialized', async function () {
            const result = await autoDebugFeature.detectProblems()

            // Should not throw, should handle gracefully
            assert.strictEqual(result, undefined)
        })

        it('handles detection errors gracefully', async function () {
            sinon.stub(AutoDebugController.prototype, 'detectProblems').rejects(new Error('Detection failed'))
            await autoDebugFeature.activate(mockContext)

            // Should not throw, should handle gracefully
            assert.doesNotThrow(async () => {
                await autoDebugFeature.detectProblems()
            })
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
            // Should not throw, should handle gracefully
            assert.doesNotThrow(async () => {
                await (autoDebugFeature as any).triggerFixWithAmazonQ()
            })
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
})

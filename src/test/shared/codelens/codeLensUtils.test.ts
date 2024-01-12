/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import * as path from 'path'
import * as codeLensUtils from '../../../shared/codelens/codeLensUtils'
import * as Picker from '../../../shared/ui/picker'
import {
    API_TARGET_TYPE,
    CODE_TARGET_TYPE,
    TEMPLATE_TARGET_TYPE,
} from '../../../shared/sam/debugger/awsSamDebugConfiguration'
import * as AddSamDebugConfiguration from '../../../shared/sam/debugger/commands/addSamDebugConfiguration'

describe('codeLensUtils', async function () {
    let sandbox: sinon.SinonSandbox

    beforeEach(function () {
        sandbox = sinon.createSandbox()
    })

    afterEach(function () {
        sandbox.restore()
    })

    describe('invokeCodeLensCommandPalette', async function () {
        const range1: vscode.Range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 1))
        const range2: vscode.Range = new vscode.Range(new vscode.Position(1, 0), new vscode.Position(1, 1))
        const doc: Pick<vscode.TextDocument, 'getText'> = {
            getText: (range: vscode.Range) => {
                if (range.start.line === 0) {
                    return 'one'
                } else if (range.start.line === 1) {
                    return 'two'
                }

                return 'other'
            },
        }

        it('filters out launch configs leading to the invoker UI', async function () {
            sandbox.stub(Picker, 'promptUser').resolves(undefined)
            const spy = sandbox.spy(Picker, 'createQuickPick')
            await codeLensUtils.invokeCodeLensCommandPalette(doc, [
                {
                    isResolved: true,
                    range: range1,
                    command: {
                        command: 'foo',
                        title: 'hasUI',
                        arguments: ['foo', 'bar', true],
                    },
                },
                {
                    isResolved: true,
                    range: range2,
                    command: {
                        command: 'foo',
                        title: 'noUI',
                        arguments: ['foo', 'bar', false],
                    },
                },
            ])
            assert.ok(spy.calledOnce, 'Spy called more than once')
            assert.strictEqual(spy.args[0][0].items?.length, 1, 'createQuickPick called with multiple items')
            assert.deepStrictEqual(
                spy.args[0][0].items![0],
                {
                    label: 'two',
                    detail: 'Function on line 2',
                    lens: {
                        command: {
                            title: 'noUI',
                            arguments: ['foo', 'bar', false],
                            command: 'foo',
                        },
                        range: range2,
                        isResolved: true,
                    },
                },
                'createQuickPick called with incorrect item'
            )
        })

        it('provides a single quick pick item with no codelens if no codelenses are provided', async function () {
            sandbox.stub(Picker, 'promptUser').resolves(undefined)
            const spy = sandbox.spy(Picker, 'createQuickPick')
            await codeLensUtils.invokeCodeLensCommandPalette(doc, [])
            assert.ok(spy.calledOnce, 'Spy called more than once')
            assert.strictEqual(spy.args[0][0].items?.length, 1, 'createQuickPick called with multiple items')
            assert.deepStrictEqual(
                spy.args[0][0].items![0],
                {
                    label: 'No handlers found in current file',
                    detail: 'Ensure your language extension is working',
                    description: 'Click here to go back',
                },
                'createQuickPick called with incorrect item'
            )
        })

        it('returns undefined if no value or an invalid value is chosen', async function () {
            sandbox
                .stub(Picker, 'promptUser')
                .onFirstCall()
                .resolves(undefined)
                .onSecondCall()
                .resolves([
                    {
                        label: 'noLens',
                        detail: 'noLens',
                    },
                ])
                .onThirdCall()
                .resolves([
                    {
                        label: 'noCommand',
                        detail: 'noCommand',
                    },
                ])
            const createSpy = sandbox.spy(Picker, 'createQuickPick')
            const finalSpy = sandbox.spy(codeLensUtils, 'pickAddSamDebugConfiguration')
            await codeLensUtils.invokeCodeLensCommandPalette(
                doc,
                [
                    /* stub handles all pick logic */
                ],
                finalSpy
            )
            await codeLensUtils.invokeCodeLensCommandPalette(
                doc,
                [
                    /* stub handles all pick logic */
                ],
                finalSpy
            )
            await codeLensUtils.invokeCodeLensCommandPalette(
                doc,
                [
                    /* stub handles all pick logic */
                ],
                finalSpy
            )

            assert.ok(createSpy.calledThrice, 'Not all test payloads run')
            assert.ok(finalSpy.notCalled, 'pickAddSamDebugConfiguration called; function did not return undefined')
        })

        it('can pass valid codelens contents to pickAddSamDebugConfiguration', async function () {
            const arg0: AddSamDebugConfiguration.AddSamDebugConfigurationInput = {
                resourceName: 'foo',
                rootUri: vscode.Uri.parse('file:///asdf'),
            }
            const arg1: AddSamDebugConfiguration.AddSamDebugConfigurationInput[] = []
            const arg2 = false
            const target = {
                label: 'two',
                detail: 'Function on line 2',
                lens: {
                    command: {
                        title: 'noUI',
                        arguments: [arg0, arg1, arg2],
                        command: 'foo',
                    },
                    range: range2,
                    isResolved: true,
                },
            }
            sandbox
                .stub(Picker, 'promptUser')
                .onFirstCall()
                .resolves([target as any])
            const finalStub = sandbox
                .stub(codeLensUtils, 'pickAddSamDebugConfiguration')
                .onFirstCall()
                .resolves(undefined)

            await codeLensUtils.invokeCodeLensCommandPalette(
                doc,
                [
                    /* stub handles all pick logic */
                ],
                finalStub
            )

            assert.ok(finalStub.calledOnce, 'pickAddSamDebugConfiguration not called once and only once')
            assert.ok(finalStub.calledWith(arg0, arg1, arg2), 'pickAddSamDebugConfiguration called with incorrect args')
        })
    })

    describe('pickAddSamDebugConfiguration', function () {
        it('should use CODE_TARGET_TYPE with no templateConfigs', async function () {
            const addSamStub = sandbox.stub(AddSamDebugConfiguration, 'addSamDebugConfiguration')
            const codeConfig: AddSamDebugConfiguration.AddSamDebugConfigurationInput = {
                resourceName: 'codeResource',
                rootUri: vscode.Uri.file('path'),
            }
            const templateConfigs: AddSamDebugConfiguration.AddSamDebugConfigurationInput[] = []

            await codeLensUtils.pickAddSamDebugConfiguration(codeConfig, templateConfigs, false)

            assert.strictEqual(addSamStub.calledOnceWith(codeConfig, CODE_TARGET_TYPE, false), true)
        })

        it('should use CODE_TARGET_TYPE when no template option is chosen', async function () {
            sandbox.stub(Picker, 'promptUser').resolves(undefined)
            sandbox.stub(Picker, 'verifySinglePickerOutput').returns({ label: 'No Template' })
            const addSamStub = sandbox.stub(AddSamDebugConfiguration, 'addSamDebugConfiguration').resolves()
            const codeConfig: AddSamDebugConfiguration.AddSamDebugConfigurationInput = {
                resourceName: 'codeResource',
                rootUri: vscode.Uri.file('path'),
            }
            const templateConfigs: AddSamDebugConfiguration.AddSamDebugConfigurationInput[] = [
                { resourceName: 'templateNoApi', rootUri: vscode.Uri.file('path') },
            ]

            await codeLensUtils.pickAddSamDebugConfiguration(codeConfig, templateConfigs, false)

            assert.strictEqual(addSamStub.calledOnceWith(codeConfig, CODE_TARGET_TYPE, false), true)
        })

        it('should use API_TARGET_TYPE when API template option is chosen', async function () {
            sandbox.stub(Picker, 'promptUser').resolves(undefined)
            sandbox
                .stub(Picker, 'verifySinglePickerOutput')
                .returns({ label: `${path.sep}path:templateWithApi (API Event: eventName)` })
            const addSamStub = sandbox.stub(AddSamDebugConfiguration, 'addSamDebugConfiguration').resolves()
            const codeConfig: AddSamDebugConfiguration.AddSamDebugConfigurationInput = {
                resourceName: 'codeResource',
                rootUri: vscode.Uri.file('path'),
            }
            const templateConfigs: AddSamDebugConfiguration.AddSamDebugConfigurationInput[] = [
                {
                    resourceName: 'templateWithApi',
                    rootUri: vscode.Uri.file('path'),
                    apiEvent: { name: 'eventName', event: { Type: 'Api' } },
                },
            ]

            await codeLensUtils.pickAddSamDebugConfiguration(codeConfig, templateConfigs, false)

            assert.strictEqual(addSamStub.args[0][1], API_TARGET_TYPE)
        })

        it('should use TEMPLATE_TARGET_TYPE when non API template option is chosen', async function () {
            sandbox.stub(Picker, 'promptUser').resolves(undefined)
            sandbox.stub(Picker, 'verifySinglePickerOutput').returns({ label: `${path.sep}path:templateNoApi` })
            const addSamStub = sandbox.stub(AddSamDebugConfiguration, 'addSamDebugConfiguration').resolves()
            const codeConfig: AddSamDebugConfiguration.AddSamDebugConfigurationInput = {
                resourceName: 'codeResource',
                rootUri: vscode.Uri.file('path'),
            }
            const templateConfigs: AddSamDebugConfiguration.AddSamDebugConfigurationInput[] = [
                { resourceName: 'templateNoApi', rootUri: vscode.Uri.file('path') },
            ]

            await codeLensUtils.pickAddSamDebugConfiguration(codeConfig, templateConfigs, false)

            assert.strictEqual(addSamStub.args[0][1], TEMPLATE_TARGET_TYPE)
        })
    })
})

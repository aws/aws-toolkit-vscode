/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as assert from 'assert'
import * as sinon from 'sinon'
import * as path from 'path'
import * as picker from '../../../shared/ui/picker'
import { finalizeConfig } from '../../../lambda/vue/samInvokeBackend'
import { AwsSamDebuggerConfiguration } from '../../../shared/sam/debugger/awsSamDebugConfiguration'
import { SamInvokeWebview } from '../../../lambda/vue/samInvokeBackend'
import { createTestWindow, TestWindow } from '../../shared/vscode/window'
import { FakeExtensionContext } from '../../fakeExtensionContext'
import { samLambdaCreatableRuntimes } from '../../../lambda/models/samLambdaRuntime'
import { ExtContext } from '../../../shared/extensions'
import globals from '../../../shared/extensionGlobals'
import { CloudFormationTemplateRegistry } from '../../../shared/cloudformation/templateRegistry'
import { makeTemporaryToolkitFolder, tryRemoveFolder } from '../../../shared/filesystemUtilities'
import { toFile } from '../../testUtil'
import { makeSampleSamTemplateYaml } from '../../shared/cloudformation/cloudformationTestUtils'

describe('Sam Invoke Vue Backend', () => {
    let context: ExtContext
    let window: TestWindow
    let tempFolder: string

    beforeEach(async function () {
        context = await FakeExtensionContext.getFakeExtContext()
        window = createTestWindow()
        tempFolder = await makeTemporaryToolkitFolder()
        sinon.stub(vscode, 'window').value(window)
    })

    afterEach(async function () {
        sinon.restore()
        await tryRemoveFolder(tempFolder)
    })

    it('can get runtimes', async function () {
        const server = new SamInvokeWebview(context)
        server.start()

        const panel = await window.waitForWebviewPanel<SamInvokeWebview>('SAM Debug Configuration')
        const runtimes = await panel.client.getRuntimes()

        assert.deepStrictEqual(runtimes, samLambdaCreatableRuntimes().toArray().sort())

        server.panel?.dispose()
    })

    it('can get a template from the user', async function () {
        // Setup some fake templates
        const template1 = vscode.Uri.file(path.join(tempFolder, 'test1.yaml'))
        const template2 = vscode.Uri.file(path.join(tempFolder, 'test2.yaml'))
        toFile(makeSampleSamTemplateYaml(true), template1.fsPath)
        toFile(makeSampleSamTemplateYaml(true), template2.fsPath)

        const registry = new CloudFormationTemplateRegistry()
        await registry.addItemToRegistry(template1)
        await registry.addItemToRegistry(template2)

        sinon.stub(globals, 'templateRegistry').value(registry)

        const server = new SamInvokeWebview(context)
        server.start()

        // Unfortunately we need to stub `picker` here
        sinon.stub(picker, 'promptUser').callsFake(async args => [args.picker.items[0]])

        const panel = await window.waitForWebviewPanel<SamInvokeWebview>('SAM Debug Configuration')
        const template = await panel.client.getTemplate()

        assert.strictEqual(vscode.Uri.file(template?.template ?? '').fsPath, template1.fsPath)

        server.panel?.dispose()
    })

    describe('finalizeConfig', () => {
        it('prunes configs correctly', () => {
            const configs: { input: AwsSamDebuggerConfiguration; output: AwsSamDebuggerConfiguration }[] = [
                {
                    input: {
                        invokeTarget: {
                            target: 'template',
                            logicalId: 'foobar',
                            templatePath: 'template.yaml',
                        },
                        name: 'noprune',
                        type: 'aws-sam',
                        request: 'direct-invoke',
                    },
                    output: {
                        invokeTarget: {
                            target: 'template',
                            logicalId: 'foobar',
                            templatePath: 'template.yaml',
                        },
                        name: 'noprune',
                        type: 'aws-sam',
                        request: 'direct-invoke',
                    },
                },
                {
                    input: {
                        invokeTarget: {
                            target: 'template',
                            logicalId: 'foobar',
                            templatePath: 'template.yaml',
                        },
                        lambda: {
                            payload: {
                                json: {},
                            },
                        },
                        name: 'prunejson',
                        type: 'aws-sam',
                        request: 'direct-invoke',
                    },
                    output: {
                        invokeTarget: {
                            target: 'template',
                            logicalId: 'foobar',
                            templatePath: 'template.yaml',
                        },
                        name: 'prunejson',
                        type: 'aws-sam',
                        request: 'direct-invoke',
                    },
                },
                {
                    input: {
                        invokeTarget: {
                            target: 'template',
                            logicalId: 'foobar',
                            templatePath: 'template.yaml',
                        },
                        name: 'prunestr',
                        type: 'aws-sam',
                        request: 'direct-invoke',
                        lambda: {
                            runtime: '',
                        },
                    },
                    output: {
                        invokeTarget: {
                            target: 'template',
                            logicalId: 'foobar',
                            templatePath: 'template.yaml',
                        },
                        name: 'prunestr',
                        type: 'aws-sam',
                        request: 'direct-invoke',
                    },
                },
                {
                    input: {
                        invokeTarget: {
                            target: 'template',
                            logicalId: 'foobar',
                            templatePath: 'template.yaml',
                        },
                        name: 'prunearr',
                        type: 'aws-sam',
                        request: 'direct-invoke',
                        lambda: {
                            pathMappings: [],
                        },
                    },
                    output: {
                        invokeTarget: {
                            target: 'template',
                            logicalId: 'foobar',
                            templatePath: 'template.yaml',
                        },
                        name: 'prunearr',
                        type: 'aws-sam',
                        request: 'direct-invoke',
                    },
                },
            ]

            for (const config of configs) {
                assert.deepStrictEqual(
                    finalizeConfig(config.input, config.input.name),
                    config.output,
                    `Test failed for input: ${config.input.name}`
                )
            }
        })
    })
})

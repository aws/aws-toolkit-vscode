/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
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

describe('codeLensUtils', function () {
    describe('pickAddSamDebugConfiguration', function () {
        let sandbox: sinon.SinonSandbox

        beforeEach(function () {
            sandbox = sinon.createSandbox()
        })

        afterEach(function () {
            sandbox.restore()
        })

        it('should use CODE_TARGET_TYPE with no templateConfigs', function () {
            const addSamStub = sandbox.stub(AddSamDebugConfiguration, 'addSamDebugConfiguration')
            const codeConfig: AddSamDebugConfiguration.AddSamDebugConfigurationInput = {
                resourceName: 'codeResource',
                rootUri: vscode.Uri.file('path'),
            }
            const templateConfigs: AddSamDebugConfiguration.AddSamDebugConfigurationInput[] = []

            codeLensUtils.pickAddSamDebugConfiguration(codeConfig, templateConfigs)

            assert.strictEqual(addSamStub.calledOnceWith(codeConfig, CODE_TARGET_TYPE), true)
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

            await codeLensUtils.pickAddSamDebugConfiguration(codeConfig, templateConfigs)

            assert.strictEqual(addSamStub.calledOnceWith(codeConfig, CODE_TARGET_TYPE), true)
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

            await codeLensUtils.pickAddSamDebugConfiguration(codeConfig, templateConfigs)

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

            await codeLensUtils.pickAddSamDebugConfiguration(codeConfig, templateConfigs)

            assert.strictEqual(addSamStub.args[0][1], TEMPLATE_TARGET_TYPE)
        })
    })
})

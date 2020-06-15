/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { instance, mock, when } from 'ts-mockito'
import * as vscode from 'vscode'
import { TemplateFunctionResource, TemplateSymbolResolver } from '../../../shared/cloudformation/templateSymbolResolver'
import { SamTemplateCodeLensProvider } from '../../../shared/codelens/samTemplateCodeLensProvider'
import { LaunchConfiguration } from '../../../shared/debug/launchConfiguration'
import {
    AwsSamDebuggerConfiguration,
    TEMPLATE_TARGET_TYPE,
} from '../../../shared/sam/debugger/awsSamDebugConfiguration'
import { AddSamDebugConfigurationInput } from '../../../shared/sam/debugger/commands/addSamDebugConfiguration'

const range = new vscode.Range(0, 0, 0, 0)
const functionResources: TemplateFunctionResource[] = [
    {
        name: 'existingResource',
        range: range,
    },
    {
        name: 'newResource',
        range: range,
    },
]
const debugConfigurations: AwsSamDebuggerConfiguration[] = [
    {
        type: 'type',
        name: 'name',
        request: 'request',
        invokeTarget: {
            target: 'template',
            templatePath: '/',
            logicalId: 'existingResource',
        },
    },
    {
        type: 'type',
        name: 'name',
        request: 'request',
        invokeTarget: {
            target: 'template',
            templatePath: '/some/other/template/with/the/same/resource/name',
            logicalId: 'newResource',
        },
    },
]
const templateUri = vscode.Uri.file('/')

describe('SamTemplateCodeLensProvider', async () => {
    const codeLensProvider = new SamTemplateCodeLensProvider()

    let mockDocument: vscode.TextDocument
    let mockCancellationToken: vscode.CancellationToken
    let mockSymbolResolver: TemplateSymbolResolver
    let mockLaunchConfig: LaunchConfiguration

    beforeEach(() => {
        mockDocument = mock()
        mockCancellationToken = mock()
        mockSymbolResolver = mock()
        mockLaunchConfig = mock()

        when(mockDocument.uri).thenReturn(templateUri)
        when(mockLaunchConfig.scopedResource).thenReturn(templateUri)
        when(mockLaunchConfig.workspaceFolder).thenReturn({
            uri: templateUri,
            name: 'notAWorkspaceFolder',
            index: 1,
        })
        when(mockLaunchConfig.getSamDebugConfigurations()).thenReturn(debugConfigurations)
    })

    it('provides a CodeLens for a file with a new resource', async () => {
        when(mockSymbolResolver.getFunctionResources()).thenResolve(functionResources)

        const codeLenses = await codeLensProvider.provideCodeLenses(
            instance(mockDocument),
            instance(mockCancellationToken),
            instance(mockSymbolResolver),
            instance(mockLaunchConfig)
        )

        const expectedInput: AddSamDebugConfigurationInput = {
            resourceName: 'newResource',
            rootUri: templateUri,
        }

        const expectedCodeLens: vscode.CodeLens = new vscode.CodeLens(range, {
            title: 'Add Debug Configuration',
            command: 'aws.addSamDebugConfiguration',
            arguments: [expectedInput, TEMPLATE_TARGET_TYPE],
        })

        assert.deepStrictEqual(codeLenses, [expectedCodeLens])
    })

    it('provides no code lenses for a file with no resources', async () => {
        when(mockSymbolResolver.getFunctionResources()).thenResolve([])

        const codeLenses = await codeLensProvider.provideCodeLenses(
            instance(mockDocument),
            instance(mockCancellationToken),
            instance(mockSymbolResolver),
            instance(mockLaunchConfig)
        )

        assert.deepStrictEqual(codeLenses, [])
    })
})

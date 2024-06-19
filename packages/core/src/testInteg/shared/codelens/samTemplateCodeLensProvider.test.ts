/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as vscode from 'vscode'
import * as semver from 'semver'
import { TemplateSymbolResolver } from '../../../shared/cloudformation/templateSymbolResolver'
import { SamTemplateCodeLensProvider } from '../../../shared/codelens/samTemplateCodeLensProvider'
import { LaunchConfiguration } from '../../../shared/debug/launchConfiguration'
import { API_TARGET_TYPE, TEMPLATE_TARGET_TYPE } from '../../../shared/sam/debugger/awsSamDebugConfiguration'
import * as workspaceUtils from '../../../shared/utilities/workspaceUtils'
import { VSCODE_EXTENSION_ID } from '../../../shared/extensions'
import { activateExtension } from '../../../shared/utilities/vsCodeUtils'
import { stub } from '../../../test/utilities/stubber'

describe('SamTemplateCodeLensProvider', async function () {
    let codeLensProvider: SamTemplateCodeLensProvider = new SamTemplateCodeLensProvider()
    let document: vscode.TextDocument
    let launchConfig: LaunchConfiguration
    let templateUri: vscode.Uri
    // not used in `provideCodeLenses`
    const mockCancellationToken: vscode.CancellationToken = {} as any as vscode.CancellationToken

    beforeEach(async function () {
        codeLensProvider = new SamTemplateCodeLensProvider()
        document = (await workspaceUtils.openTextDocument('python3.7-plain-sam-app/template.yaml'))!
        templateUri = document.uri
        launchConfig = new LaunchConfiguration(document.uri)
    })

    it('provides a CodeLens for a file with a new resource', async function () {
        // - redhat.vscode-yaml requires vscode 1.63: https://github.com/redhat-developer/vscode-yaml/blob/main/package.json
        // - the codelens behavior changed with the vscode 1.66 release
        if (semver.lt(vscode.version, '1.66.0')) {
            this.skip()
        }
        await activateExtension(VSCODE_EXTENSION_ID.yaml, false)

        const codeLenses = await codeLensProvider.provideCodeLenses(
            document,
            mockCancellationToken,
            new TemplateSymbolResolver(document),
            launchConfig,
            true
        )

        const expectedCodeLens = [
            new vscode.CodeLens(new vscode.Range(25, 4, 31, 0), {
                title: 'AWS: Add Debug Configuration',
                command: 'aws.addSamDebugConfiguration',
                arguments: [{ resourceName: 'Function2NotInLaunchJson', rootUri: templateUri }, TEMPLATE_TARGET_TYPE],
            }),
            new vscode.CodeLens(new vscode.Range(31, 4, 43, 0), {
                title: 'AWS: Add Debug Configuration',
                command: 'aws.addSamDebugConfiguration',
                arguments: [{ resourceName: 'Function3NotInLaunchJson', rootUri: templateUri }, TEMPLATE_TARGET_TYPE],
            }),
        ]

        expectedCodeLens.splice(
            0,
            0,
            new vscode.CodeLens(new vscode.Range(37, 12, 43, 0), {
                title: 'AWS: Add API Debug Configuration',
                command: 'aws.addSamDebugConfiguration',
                arguments: [{ resourceName: 'Function3NotInLaunchJson', rootUri: templateUri }, API_TARGET_TYPE],
            })
        )

        assert.deepStrictEqual(codeLenses, expectedCodeLens)
    })

    it('provides no code lenses for a file with no resources', async function () {
        const resolver = stub(TemplateSymbolResolver)
        resolver.getResourcesOfKind.resolves([])

        const codeLenses = await codeLensProvider.provideCodeLenses(
            document,
            mockCancellationToken,
            resolver,
            launchConfig
        )

        assert.deepStrictEqual(codeLenses, [])
    })
})

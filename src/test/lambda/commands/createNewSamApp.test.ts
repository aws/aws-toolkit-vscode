/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as path from 'path'
import * as pathutils from '../../../shared/utilities/pathUtils'
import * as testutil from '../../testUtil'
import * as vscode from 'vscode'
import { FakeExtensionContext } from '../../fakeExtensionContext'
import { addInitialLaunchConfiguration } from '../../../lambda/commands/createNewSamApp'
import { LaunchConfiguration } from '../../../shared/debug/launchConfiguration'
import { anything, capture, instance, mock, when } from 'ts-mockito'
import { makeSampleSamTemplateYaml } from '../../shared/cloudformation/cloudformationTestUtils'
import { makeTemporaryToolkitFolder } from '../../../shared/filesystemUtilities'
import { CloudFormationTemplateRegistry } from '../../../shared/cloudformation/templateRegistry'
import { rmrf } from '../../../shared/filesystem'
import { ExtContext } from '../../../shared/extensions'
import { TemplateTargetProperties } from '../../../shared/sam/debugger/awsSamDebugConfiguration'

describe('addInitialLaunchConfiguration', function() {
    let mockLaunchConfiguration: LaunchConfiguration
    let registry: CloudFormationTemplateRegistry
    let tempFolder: string
    let tempTemplate: vscode.Uri
    let fakeWorkspaceFolder: vscode.WorkspaceFolder
    let fakeContext: ExtContext

    beforeEach(async () => {
        mockLaunchConfiguration = mock()
        fakeContext = await FakeExtensionContext.getFakeExtContext()
        tempFolder = await makeTemporaryToolkitFolder()
        tempTemplate = vscode.Uri.file(path.join(tempFolder, 'test.yaml'))
        registry = CloudFormationTemplateRegistry.getRegistry()

        fakeWorkspaceFolder = {
            uri: vscode.Uri.file(tempFolder),
            name: 'It was me, fakeWorkspaceFolder!',
            index: 0,
        }

        when(mockLaunchConfiguration.getDebugConfigurations()).thenReturn([
            {
                type: 'aws-sam',
                name: 'name',
                request: 'direct-invoke',
                invokeTarget: {
                    target: 'template',
                    templatePath: '/test.yaml',
                    logicalId: 'resource',
                },
            },
        ])
    })

    afterEach(async () => {
        await rmrf(tempFolder)
    })

    it('produces an initial launch configuration', async () => {
        when(mockLaunchConfiguration.addDebugConfigurations(anything())).thenResolve()

        testutil.toFile(makeSampleSamTemplateYaml(true), tempTemplate.fsPath)

        await registry.addTemplateToRegistry(tempTemplate)
        await addInitialLaunchConfiguration(
            fakeContext,
            fakeWorkspaceFolder,
            tempTemplate,
            instance(mockLaunchConfiguration)
        )

        // eslint-disable-next-line @typescript-eslint/unbound-method
        const [arg] = capture(mockLaunchConfiguration.addDebugConfigurations).last()
        assert.ok(
            pathutils.areEqual(
                fakeWorkspaceFolder.uri.fsPath,
                (arg[0].invokeTarget as TemplateTargetProperties).templatePath,
                tempTemplate.fsPath
            )
        )
    })
})

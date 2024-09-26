/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { globals } from '../../../shared'
import { AppNode } from '../../../awsService/appBuilder/explorer/nodes/appNode'
import { BuildParams, BuildWizard } from '../../../shared/sam/build'
import { TreeNode } from '../../../shared/treeview/resourceTreeDataProvider'
import { createWizardTester } from '../wizards/wizardTestUtils'
import assert from 'assert'
import { createBaseTemplate } from '../cloudformation/cloudformationTestUtils'
import { getProjectRootUri } from '../../../shared/sam/utils'

describe('BuildWizard', async function () {
    const createTester = async (params?: Partial<BuildParams>, arg?: TreeNode | undefined) =>
        createWizardTester(new BuildWizard({ ...params }, await globals.templateRegistry, arg))

    it('shows steps in correct order when triggered from command palette', async function () {
        const tester = await createTester()
        tester.template.assertShowFirst()
        tester.paramsSource.assertShowSecond()
    })

    it('shows steps in correct order when triggered from appBuilder', async function () {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
        assert.ok(workspaceFolder)

        const templateUri = vscode.Uri.joinPath(workspaceFolder.uri, 'template.yaml')
        const projectRootUri = getProjectRootUri(templateUri)
        const samAppLocation = {
            samTemplateUri: templateUri,
            workspaceFolder: workspaceFolder,
            projectRoot: projectRootUri,
        }
        const appNode = new AppNode(samAppLocation)
        const tester = await createTester({}, appNode)
        tester.template.assertDoesNotShow()
        tester.paramsSource.assertShowFirst()
    })

    it('set the correct project root', async function () {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
        assert.ok(workspaceFolder)

        const templateUri = vscode.Uri.joinPath(workspaceFolder.uri, 'template.yaml')
        const template = { uri: templateUri, data: createBaseTemplate() }
        const tester = await createTester({ template })
        tester.projectRoot.path.assertValue(workspaceFolder.uri.path)
    })
})

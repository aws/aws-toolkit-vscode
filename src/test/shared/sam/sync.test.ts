/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as assert from 'assert'
import { prepareSyncParams, SyncParams, SyncWizard } from '../../../shared/sam/sync'
import {
    createBaseImageTemplate,
    createBaseTemplate,
    makeSampleSamTemplateYaml,
} from '../cloudformation/cloudformationTestUtils'
import { createWizardTester } from '../wizards/wizardTestUtils'
import { AWSTreeNodeBase } from '../../../shared/treeview/nodes/awsTreeNodeBase'
import { makeTemporaryToolkitFolder } from '../../../shared/filesystemUtilities'
import { SystemUtilities } from '../../../shared/systemUtilities'
import { ToolkitError } from '../../../shared/errors'

describe('SyncWizard', function () {
    const createTester = (params?: Partial<SyncParams>) =>
        createWizardTester(new SyncWizard({ deployType: 'code', ...params }))

    it('prompts for region -> template -> stackName -> bucketName', function () {
        const tester = createTester()
        tester.region.assertShowFirst()
        tester.template.assertShowSecond()
        tester.stackName.assertShowThird()
        tester.bucketName.assertShow(4)
    })

    it('prompts for ECR repo if template has image-based resource', function () {
        const template = { uri: vscode.Uri.file('/'), data: createBaseImageTemplate() }
        const tester = createTester({ template })
        tester.ecrRepoUri.assertShow()
    })

    it('skips prompt for ECR repo if template has no image-based resources', function () {
        const template = { uri: vscode.Uri.file('/'), data: createBaseTemplate() }
        const tester = createTester({ template })
        tester.ecrRepoUri.assertDoesNotShow()
    })

    it("uses the template's workspace as the project root is not set", function () {
        const workspaceUri = vscode.workspace.workspaceFolders?.[0]?.uri
        assert.ok(workspaceUri)

        const templateUri = vscode.Uri.joinPath(workspaceUri, 'my', 'template.yaml')
        const template = { uri: templateUri, data: createBaseTemplate() }
        const tester = createTester({ template })
        tester.projectRoot.assertValue(workspaceUri)
    })
})

describe('prepareSyncParams', function () {
    it('uses region if given a tree node', async function () {
        const params = await prepareSyncParams(
            new (class extends AWSTreeNodeBase {
                public readonly regionCode = 'foo'
            })('')
        )

        assert.strictEqual(params.region, 'foo')
    })

    async function makeTemplateItem(dir: vscode.Uri) {
        const uri = vscode.Uri.joinPath(dir, 'template.yaml')
        const data = makeSampleSamTemplateYaml(true)
        await SystemUtilities.writeFile(uri, JSON.stringify(data))

        return { uri, data }
    }

    it('loads template if given a URI', async function () {
        const tempDir = vscode.Uri.file(await makeTemporaryToolkitFolder())
        const template = await makeTemplateItem(tempDir)

        const params = await prepareSyncParams(template.uri)
        assert.strictEqual(params.template?.uri.fsPath, template.uri.fsPath)
        assert.deepStrictEqual(params.template?.data, template.data)
    })

    describe('samconfig.toml', function () {
        async function makeDefaultConfig(dir: vscode.Uri, body: string) {
            const uri = vscode.Uri.joinPath(dir, 'samconfig.toml')
            const data = `
            [default.sync.parameters]
            ${body}
`
            await SystemUtilities.writeFile(uri, data)

            return uri
        }

        async function getParams(body: string, dir?: vscode.Uri) {
            const tempDir = dir ?? vscode.Uri.file(await makeTemporaryToolkitFolder())
            const template = await makeTemplateItem(tempDir)
            await makeDefaultConfig(tempDir, body)

            return prepareSyncParams(template.uri)
        }

        it('throws on non-string values', async function () {
            await assert.rejects(() => getParams(`region = 0`), ToolkitError)
        })

        it('does not fail on missing values', async function () {
            const params = await getParams(`region = "bar"`)
            assert.strictEqual(params.region, 'bar')
        })

        it('sets the project root as the parent directory', async function () {
            const tempDir = vscode.Uri.file(await makeTemporaryToolkitFolder())
            const params = await getParams(`region = "bar"`, tempDir)
            assert.strictEqual(params.projectRoot?.fsPath, tempDir.fsPath)
        })

        it('can use global params', async function () {
            const params = await getParams(`
            region = "bar"
            [default.global.parameters]
            stack_name = "my-app"
            `)
            assert.strictEqual(params.stackName, 'my-app')
        })

        it('prefers using the sync section over globals', async function () {
            const params = await getParams(`
            stack_name = "my-sync-app"
            [default.global.parameters]
            stack_name = "my-app"
            `)
            assert.strictEqual(params.stackName, 'my-sync-app')
        })

        it('loads all values if found', async function () {
            const params = await getParams(`
            region = "bar"
            stack_name = "my-app"
            s3_bucket = "my-bucket"
            image_repository = "12345679010.dkr.ecr.bar.amazonaws.com/repo"
            `)
            assert.strictEqual(params.region, 'bar')
            assert.strictEqual(params.stackName, 'my-app')
            assert.strictEqual(params.bucketName, 'my-bucket')
            assert.strictEqual(params.ecrRepoUri, '12345679010.dkr.ecr.bar.amazonaws.com/repo')
        })
    })
})

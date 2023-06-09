/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as assert from 'assert'
import * as path from 'path'
import globals from '../../shared/extensionGlobals'
import * as sysutil from '../../shared/systemUtilities'
import * as testUtil from '../testUtil'
import * as workspaceUtils from '../../shared/utilities/workspaceUtils'
import { toArrayAsync } from '../../shared/utilities/collectionUtils'
import { waitUntil } from '../../shared/utilities/timeoutUtils'

describe('awsFiletypes', function () {
    let awsConfigUri: vscode.Uri | undefined
    let cfnUri: vscode.Uri | undefined

    beforeEach(async function () {
        testUtil.closeAllEditors()

        // Create a dummy file in ~/.aws on the system.
        // Note: We consider _any_ file in ~/.aws to be an "AWS config" file,
        // so this will trigger "file_editAwsFile" telemetry.
        const awsConfigFile = path.join(sysutil.SystemUtilities.getHomeDirectory(), '.aws/test_awstoolkit')
        awsConfigUri = vscode.Uri.file(awsConfigFile)
        testUtil.toFile('Test file from the aws-toolkit-vscode test suite.', awsConfigFile)

        const cfnFile = workspaceUtils.tryGetAbsolutePath(
            vscode.workspace.workspaceFolders?.[0],
            'python3.7-plain-sam-app/template.yaml'
        )
        cfnUri = vscode.Uri.file(cfnFile)
    })

    after(async function () {
        testUtil.closeAllEditors()
    })

    it('emit telemetry when opened by user', async function () {
        await globals.templateRegistry.addItemToRegistry(cfnUri!)
        await vscode.commands.executeCommand('vscode.open', cfnUri)
        await vscode.commands.executeCommand('vscode.open', awsConfigUri)
        await vscode.workspace.openTextDocument({
            content: 'test content for SSM JSON',
            language: 'ssm-json',
        })

        const r = await waitUntil(
            async () => {
                const metrics = await toArrayAsync(
                    globals.telemetry.findIter(m => {
                        return m.MetricName === 'file_editAwsFile'
                    })
                )
                return metrics.length >= 3 ? metrics : undefined
            },
            { interval: 200, timeout: 5000 }
        )

        assert(r, 'did not emit expected telemetry')
        assert(r.length === 3, 'emitted file_editAwsFile too many times')
        const m1filetype = r[0].Metadata?.find(o => o.Key === 'awsFiletype')?.Value
        const m2filetype = r[1].Metadata?.find(o => o.Key === 'awsFiletype')?.Value
        const m3filetype = r[2].Metadata?.find(o => o.Key === 'awsFiletype')?.Value
        assert.strictEqual(m1filetype, 'cloudformationSam')
        assert.strictEqual(m2filetype, 'awsCredentials')
        assert.strictEqual(m3filetype, 'ssmDocument')
    })

    it('emit telemetry exactly once per filetype in a given flush window', async function () {
        await globals.templateRegistry.addItemToRegistry(cfnUri!)
        await vscode.commands.executeCommand('vscode.open', cfnUri)
        async function getMetrics() {
            return await waitUntil(
                async () => {
                    const metrics = await toArrayAsync(
                        globals.telemetry.findIter(m => {
                            return m.MetricName === 'file_editAwsFile'
                        })
                    )
                    return metrics.length > 0 ? metrics : undefined
                },
                { interval: 200, timeout: 5000 }
            )
        }
        // Wait for metrics...
        await getMetrics()
        testUtil.closeAllEditors()
        await vscode.commands.executeCommand('vscode.open', cfnUri)
        await vscode.commands.executeCommand('vscode.open', cfnUri)

        // Get metrics again (result should be the same)...
        const r = await getMetrics()
        assert.notStrictEqual(r, undefined, 'did not emit expected telemetry')
        assert.strictEqual(r?.length, 1, 'emitted file_editAwsFile too many times')
    })
})

/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import assert from 'assert'
import {
    prepareRepoData,
    TelemetryHelper,
    ContentLengthError,
    maxRepoSizeBytes,
} from 'aws-core-vscode/amazonqFeatureDev'
import { assertTelemetry, getWorkspaceFolder, TestFolder } from 'aws-core-vscode/test'
import { fs, AmazonqCreateUpload } from 'aws-core-vscode/shared'
import { MetricName, Span } from 'aws-core-vscode/telemetry'
import sinon from 'sinon'
import { CodeWhispererSettings } from 'aws-core-vscode/codewhisperer'

const testDevfilePrepareRepo = async (expectedRepoSize: number, devfileEnabled: boolean) => {
    const folder = await TestFolder.create()
    await folder.write('devfile.yaml', 'test')
    await folder.write('file.md', 'test content')
    const workspace = getWorkspaceFolder(folder.path)
    sinon
        .stub(CodeWhispererSettings.instance, 'getDevCommandWorkspaceConfigurations')
        .returns(devfileEnabled ? { [workspace.uri.fsPath]: true } : {})

    await testPrepareRepoData(workspace, expectedRepoSize)
}

const testPrepareRepoData = async (
    workspace: vscode.WorkspaceFolder,
    expectedRepoSize: number,
    expectedTelemetryMetrics?: Array<{ metricName: MetricName; value: any }>
) => {
    const telemetry = new TelemetryHelper()
    const result = await prepareRepoData([workspace.uri.fsPath], [workspace], telemetry, {
        record: () => {},
    } as unknown as Span<AmazonqCreateUpload>)

    assert.strictEqual(Buffer.isBuffer(result.zipFileBuffer), true)
    // checksum is not the same across different test executions because some unique random folder names are generated
    assert.strictEqual(result.zipFileChecksum.length, 44)
    assert.strictEqual(telemetry.repositorySize, expectedRepoSize)

    if (expectedTelemetryMetrics) {
        expectedTelemetryMetrics.forEach((metric) => {
            assertTelemetry(metric.metricName, metric.value)
        })
    }
}

describe('file utils', () => {
    describe('prepareRepoData', function () {
        afterEach(() => {
            sinon.restore()
        })

        it('returns files in the workspace as a zip', async function () {
            const folder = await TestFolder.create()
            await folder.write('file1.md', 'test content')
            await folder.write('file2.md', 'test content')
            const workspace = getWorkspaceFolder(folder.path)

            await testPrepareRepoData(workspace, 24)
        })

        it('prepareRepoData ignores denied file extensions', async function () {
            const folder = await TestFolder.create()
            await folder.write('file.mp4', 'test content')
            const workspace = getWorkspaceFolder(folder.path)

            await testPrepareRepoData(workspace, 0, [
                { metricName: 'amazonq_bundleExtensionIgnored', value: { filenameExt: 'mp4', count: 1 } },
            ])
        })

        it('should ignore devfile.yaml when setting is disabled', async function () {
            await testDevfilePrepareRepo(12, false)
        })

        it('should include devfile.yaml when setting is enabled', async function () {
            await testDevfilePrepareRepo(16, true)
        })

        // Test the logic that allows the customer to modify root source folder
        it('prepareRepoData throws a ContentLengthError code when repo is too big', async function () {
            const folder = await TestFolder.create()
            await folder.write('file.md', 'test content')
            const workspace = getWorkspaceFolder(folder.path)
            const telemetry = new TelemetryHelper()

            sinon.stub(fs, 'stat').resolves({ size: 2 * maxRepoSizeBytes } as vscode.FileStat)
            await assert.rejects(
                () =>
                    prepareRepoData([workspace.uri.fsPath], [workspace], telemetry, {
                        record: () => {},
                    } as unknown as Span<AmazonqCreateUpload>),
                ContentLengthError
            )
        })
    })
})

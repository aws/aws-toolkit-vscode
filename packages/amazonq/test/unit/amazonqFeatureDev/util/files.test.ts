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
import { fs, AmazonqCreateUpload, ZipStream } from 'aws-core-vscode/shared'
import { MetricName, Span } from 'aws-core-vscode/telemetry'
import sinon from 'sinon'
import { CodeWhispererSettings } from 'aws-core-vscode/codewhisperer'

const testDevfilePrepareRepo = async (devfileEnabled: boolean) => {
    const files: Record<string, string> = {
        'file.md': 'test content',
        // only include when execution is enabled
        'devfile.yaml': 'test',
        // .git folder is always dropped (because of vscode global exclude rules)
        '.git/ref': '####',
        // .gitignore should always be included
        '.gitignore': 'node_models/*',
        // non code files only when dev execution is enabled
        'abc.jar': 'jar-content',
        'data/logo.ico': 'binary-content',
    }
    const folder = await TestFolder.create()

    for (const [fileName, content] of Object.entries(files)) {
        await folder.write(fileName, content)
    }

    const expectedFiles = !devfileEnabled
        ? ['file.md', '.gitignore']
        : ['devfile.yaml', 'file.md', '.gitignore', 'abc.jar', 'data/logo.ico']

    const workspace = getWorkspaceFolder(folder.path)
    sinon
        .stub(CodeWhispererSettings.instance, 'getAutoBuildSetting')
        .returns(devfileEnabled ? { [workspace.uri.fsPath]: true } : {})

    await testPrepareRepoData(workspace, expectedFiles)
}

const testPrepareRepoData = async (
    workspace: vscode.WorkspaceFolder,
    expectedFiles: string[],
    expectedTelemetryMetrics?: Array<{ metricName: MetricName; value: any }>
) => {
    expectedFiles.sort((a, b) => a.localeCompare(b))
    const telemetry = new TelemetryHelper()
    const result = await prepareRepoData([workspace.uri.fsPath], [workspace], telemetry, {
        record: () => {},
    } as unknown as Span<AmazonqCreateUpload>)

    assert.strictEqual(Buffer.isBuffer(result.zipFileBuffer), true)
    // checksum is not the same across different test executions because some unique random folder names are generated
    assert.strictEqual(result.zipFileChecksum.length, 44)

    if (expectedTelemetryMetrics) {
        for (const metric of expectedTelemetryMetrics) {
            assertTelemetry(metric.metricName, metric.value)
        }
    }

    // Unzip the buffer and compare the entry names
    const zipEntries = await ZipStream.unzip(result.zipFileBuffer)
    const actualZipEntries = zipEntries.map((entry) => entry.filename)
    actualZipEntries.sort((a, b) => a.localeCompare(b))
    assert.deepStrictEqual(actualZipEntries, expectedFiles)
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

            await testPrepareRepoData(workspace, ['file1.md', 'file2.md'])
        })

        it('prepareRepoData ignores denied file extensions', async function () {
            const folder = await TestFolder.create()
            await folder.write('file.mp4', 'test content')
            const workspace = getWorkspaceFolder(folder.path)

            await testPrepareRepoData(
                workspace,
                [],
                [{ metricName: 'amazonq_bundleExtensionIgnored', value: { filenameExt: 'mp4', count: 1 } }]
            )
        })

        it('should ignore devfile.yaml when setting is disabled', async function () {
            await testDevfilePrepareRepo(false)
        })

        it('should include devfile.yaml when setting is enabled', async function () {
            await testDevfilePrepareRepo(true)
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

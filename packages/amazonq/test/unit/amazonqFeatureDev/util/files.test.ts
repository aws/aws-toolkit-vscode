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
import { createTestWorkspace } from 'aws-core-vscode/test'
import { AmazonqCreateUpload, Metric } from 'aws-core-vscode/shared'
import sinon from 'sinon'
import { fsCommon } from 'aws-core-vscode/srcShared'

describe('file utils', () => {
    describe('prepareRepoData', function () {
        it('returns files in the workspace as a zip', async function () {
            // these variables are a manual selection of settings for the test in order to test the collectFiles function
            const fileAmount = 2
            const fileNamePrefix = 'file'
            const fileContent = 'test content'

            const workspace = await createTestWorkspace(fileAmount, { fileNamePrefix, fileContent })

            const telemetry = new TelemetryHelper()
            const result = await prepareRepoData([workspace.uri.fsPath], [workspace], telemetry, {
                record: () => {},
            } as unknown as Metric<AmazonqCreateUpload>)
            assert.strictEqual(Buffer.isBuffer(result.zipFileBuffer), true)
            // checksum is not the same across different test executions because some unique random folder names are generated
            assert.strictEqual(result.zipFileChecksum.length, 44)
            assert.strictEqual(telemetry.repositorySize, 24)
        })

        // Test the logic that allows the customer to modify root source folder
        it('prepareRepoData throws a ContentLengthError code when repo is too big', async function () {
            const workspace = await createTestWorkspace(1, {})
            const telemetry = new TelemetryHelper()

            sinon.stub(fsCommon, 'stat').resolves({ size: 2 * maxRepoSizeBytes } as vscode.FileStat)
            await assert.rejects(
                () =>
                    prepareRepoData([workspace.uri.fsPath], [workspace], telemetry, {
                        record: () => {},
                    } as unknown as Metric<AmazonqCreateUpload>),
                ContentLengthError
            )
        })
    })
})

/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { prepareRepoData } from '../../../amazonqFeatureDev/util/files'
import { createTestWorkspace } from '../../testUtil'
import { TelemetryHelper } from '../../../amazonqFeatureDev/util/telemetryHelper'
import { AmazonqCreateUpload, Metric } from '../../../shared/telemetry/telemetry'

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
    })
})

/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { getSha256, uploadArtifactToS3, zipCode } from '../../codewhisperer/service/transformByQHandler'
import fetch from '../../common/request'
import * as CodeWhispererConstants from '../../codewhisperer/models/constants'
import * as codeWhisperer from '../../codewhisperer/client/codewhisperer'
import * as os from 'os'
import * as path from 'path'
import * as fs from 'fs-extra'
import { setValidConnection, skipTestIfNoValidConn } from '../util/amazonQUtil'

describe('transformByQ', async function () {
    let tempDir = ''
    let tempFileName = ''
    let tempFilePath = ''
    let zippedCodePath = ''
    let validConnection: boolean

    before(async function () {
        validConnection = await setValidConnection()
        tempDir = path.join(os.tmpdir(), 'gumby-test')
        fs.mkdirSync(tempDir)
        tempFileName = `testfile-${Date.now()}.txt`
        tempFilePath = path.join(tempDir, tempFileName)
        fs.writeFileSync(tempFilePath, 'sample content for the test file')
        zippedCodePath = await zipCode(tempDir)
    })

    beforeEach(function () {
        skipTestIfNoValidConn(validConnection, this) // need valid IdC
    })

    after(async function () {
        if (tempDir !== '') {
            await fs.remove(tempDir)
        }
    })

    it('WHEN upload payload with missing sha256 in headers THEN fails to upload', async function () {
        const sha256 = getSha256(zippedCodePath)
        const response = await codeWhisperer.codeWhispererClient.createUploadUrl({
            contentChecksum: sha256,
            contentChecksumType: CodeWhispererConstants.contentChecksumType,
            uploadIntent: CodeWhispererConstants.uploadIntent,
        })
        const headersObj = {
            'x-amz-checksum-sha256': '',
            'Content-Type': 'application/zip',
        }
        await assert.rejects(
            () =>
                fetch('PUT', response.uploadUrl, { body: fs.readFileSync(zippedCodePath), headers: headersObj })
                    .response
        )
    })

    it('WHEN upload artifact to S3 with unsigned upload URL THEN fails to upload', async function () {
        await assert.rejects(() =>
            uploadArtifactToS3(zippedCodePath, {
                uploadId: 'dummyId',
                uploadUrl: 'https://aws-transform-artifacts-us-east-1.s3.amazonaws.com',
            })
        )
    })
})

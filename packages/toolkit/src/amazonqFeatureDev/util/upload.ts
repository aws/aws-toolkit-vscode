/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import request, { RequestError } from '../../common/request'
import { getLogger } from '../../shared/logger/logger'
import { featureName } from '../constants'

import { UploadCodeError } from '../errors'

/**
 * uploadCode
 *
 * uses a presigned url and files checksum to transfer data to s3 through http.
 */
export async function uploadCode(url: string, buffer: Buffer, checksumSha256: string, kmsKeyArn?: string) {
    try {
        await request.fetch('PUT', url, {
            body: buffer,
            headers: {
                'Content-Type': 'application/zip',
                'Content-Length': String(buffer.length),
                'x-amz-checksum-sha256': checksumSha256,
                ...(kmsKeyArn && {
                    'x-amz-server-side-encryption-aws-kms-key-id': kmsKeyArn,
                    'x-amz-server-side-encryption': 'aws:kms',
                }),
            },
        }).response
    } catch (e: any) {
        getLogger().error(`${featureName}: failed to upload code to s3: ${(e as Error).message}`)
        throw new UploadCodeError(
            e instanceof RequestError ? `${e.response.status}: ${e.response.statusText}` : 'Unknown'
        )
    }
}

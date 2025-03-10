/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { CodeWhispererUserClient } from '../indexNode'
import * as CodeWhispererConstants from '../models/constants'
import { codeFixState } from '../models/model'
import { ArtifactMap, CreateUploadUrlRequest, DefaultCodeWhispererClient } from '../client/codewhisperer'
import {
    CodeFixJobStoppedError,
    CodeFixJobTimedOutError,
    CreateCodeFixError,
    CreateUploadUrlError,
    MonthlyCodeFixLimitError,
} from '../models/errors'
import { uploadArtifactToS3 } from './securityScanHandler'
import { getLogger } from '../../shared/logger/logger'
import { isAwsError } from '../../shared/errors'
import { sleep } from '../../shared/utilities/timeoutUtils'

export async function getPresignedUrlAndUpload(
    client: DefaultCodeWhispererClient,
    zipFilePath: string,
    codeFixName: string
) {
    const srcReq: CreateUploadUrlRequest = {
        artifactType: 'SourceCode',
        uploadIntent: CodeWhispererConstants.codeFixUploadIntent,
        uploadContext: { codeFixUploadContext: { codeFixName } },
    }
    getLogger().verbose(`Prepare for uploading src context...`)
    const srcResp = await client.createUploadUrl(srcReq).catch((err) => {
        getLogger().error('Failed getting presigned url for uploading src context. %O', err)
        throw new CreateUploadUrlError(err.message)
    })
    getLogger().verbose(`CreateUploadUrlRequest requestId: ${srcResp.$response.requestId}`)
    getLogger().verbose(`Complete Getting presigned Url for uploading src context.`)
    getLogger().verbose(`Uploading src context...`)
    await uploadArtifactToS3(zipFilePath, srcResp, CodeWhispererConstants.FeatureUseCase.CODE_SCAN)
    getLogger().verbose(`Complete uploading src context.`)
    const artifactMap: ArtifactMap = {
        SourceCode: srcResp.uploadId,
    }
    return artifactMap
}

export async function createCodeFixJob(
    client: DefaultCodeWhispererClient,
    uploadId: string,
    snippetRange: CodeWhispererUserClient.Range,
    description: string,
    codeFixName?: string,
    ruleId?: string
) {
    getLogger().verbose(`Creating code fix job...`)
    const req: CodeWhispererUserClient.StartCodeFixJobRequest = {
        uploadId,
        snippetRange,
        codeFixName,
        ruleId,
        description,
    }

    const resp = await client.startCodeFixJob(req).catch((err) => {
        getLogger().error('Failed creating code fix job. %O', err)
        if (isAwsError(err) && err.code === 'ThrottlingException' && err.message.includes('reached for this month')) {
            throw new MonthlyCodeFixLimitError()
        }
        throw new CreateCodeFixError()
    })
    getLogger().info(`AmazonQ generate fix Request id: ${resp.$response.requestId}`)
    return resp
}

export async function pollCodeFixJobStatus(client: DefaultCodeWhispererClient, jobId: string) {
    const pollingStartTime = performance.now()
    await sleep(CodeWhispererConstants.codeFixJobPollingDelayMs)

    getLogger().verbose(`Polling code fix job status...`)
    let status: string | undefined = 'InProgress'
    while (true) {
        throwIfCancelled()
        const req: CodeWhispererUserClient.GetCodeFixJobRequest = {
            jobId,
        }
        const resp = await client.getCodeFixJob(req)
        getLogger().verbose(`GetCodeFixJobRequest requestId: ${resp.$response.requestId}`)
        if (resp.jobStatus !== 'InProgress') {
            status = resp.jobStatus
            getLogger().verbose(`Code fix job status: ${status}`)
            getLogger().verbose(`Complete polling code fix job status.`)
            break
        }
        throwIfCancelled()
        await sleep(CodeWhispererConstants.codeFixJobPollingIntervalMs)
        const elapsedTime = performance.now() - pollingStartTime
        if (elapsedTime > CodeWhispererConstants.codeFixJobTimeoutMs) {
            getLogger().verbose(`Code fix job status: ${status}`)
            getLogger().verbose(`Code fix job failed. Amazon Q timed out.`)
            throw new CodeFixJobTimedOutError()
        }
    }
    return status
}

export async function getCodeFixJob(client: DefaultCodeWhispererClient, jobId: string) {
    const req: CodeWhispererUserClient.GetCodeFixJobRequest = {
        jobId,
    }
    const resp = await client.getCodeFixJob(req)
    return resp
}

export function throwIfCancelled() {
    if (codeFixState.isCancelling()) {
        throw new CodeFixJobStoppedError()
    }
}

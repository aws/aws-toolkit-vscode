/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { DefaultConsolasClient } from '../client/consolas'
import { getLogger } from '../../../shared/logger'
import { AggregatedCodeScanIssue } from '../models/model'
import { sleep } from '../../../shared/utilities/timeoutUtils'
import { ConsolasConstants } from '../models/constants'
import { TruncPaths } from '../util/dependencyGraph/dependencyGraph'
import { existsSync, statSync, readFileSync } from 'fs'
import { RawCodeScanIssue } from '../models/model'
import got from 'got'
import * as consolasClient from '../client/consolas'
import * as crypto from 'crypto'
import * as uuid from 'uuid'
import path = require('path')
import { pageableToCollection } from '../../../shared/utilities/collectionUtils'

export async function listScanResults(client: DefaultConsolasClient, jobId: string, projectPath: string) {
    const codeScanIssueMap: Map<string, RawCodeScanIssue[]> = new Map()
    const aggregatedCodeScanIssueList: AggregatedCodeScanIssue[] = []
    const requester = (request: consolasClient.ListSecurityIssuesRequest) => client.listSecurityIssues(request)
    const collection = pageableToCollection(requester, { jobId }, 'nextToken')
    const issues = await collection
        .flatten()
        .map(resp => {
            getLogger().verbose(`Request id: ${resp.$response.requestId}`)
            return resp.securityIssues
        })
        .promise()
    issues.forEach(issue => {
        mapToAggregatedList(codeScanIssueMap, aggregatedCodeScanIssueList, issue, projectPath)
    })
    return aggregatedCodeScanIssueList
}

function mapToAggregatedList(
    codeScanIssueMap: Map<string, RawCodeScanIssue[]>,
    aggregatedCodeScanIssueList: AggregatedCodeScanIssue[],
    json: string,
    projectPath: string
) {
    const codeScanIssues: RawCodeScanIssue[] = JSON.parse(json)
    codeScanIssues.forEach(issue => {
        if (issue.recommendationType === 'POSITIVE') return
        if (codeScanIssueMap.has(issue.filePath)) {
            const list = codeScanIssueMap.get(issue.filePath)
            if (list === undefined) {
                codeScanIssueMap.set(issue.filePath, [issue])
            } else {
                list.push(issue)
                codeScanIssueMap.set(issue.filePath, list)
            }
        } else {
            codeScanIssueMap.set(issue.filePath, [issue])
        }
    })

    codeScanIssueMap.forEach((issues, key) => {
        const filePath = path.join(projectPath, '..', key)
        if (existsSync(filePath) && statSync(filePath).isFile()) {
            const aggregatedCodeScanIssue: AggregatedCodeScanIssue = {
                filePath: filePath,
                issues: issues.map(issue => {
                    return {
                        startLine:
                            issue.startLine === issue.endLine
                                ? issue.startLine - 1 >= 0
                                    ? issue.startLine - 1
                                    : 0
                                : issue.endLine,
                        endLine: issue.endLine,
                        comment: issue.comment.trim(),
                    }
                }),
            }
            aggregatedCodeScanIssueList.push(aggregatedCodeScanIssue)
        }
    })
    return aggregatedCodeScanIssueList
}

export async function pollScanJobStatus(client: DefaultConsolasClient, jobId: string) {
    getLogger().verbose(`Polling scan job status...`)
    let status: string = 'Pending'
    let timer: number = 0
    while (true) {
        const req: consolasClient.GetSecurityScanRequest = {
            jobId: jobId,
        }
        const resp = await client.getSecurityScan(req)
        getLogger().verbose(`Request id: ${resp.$response.requestId}`)
        if (resp.status !== 'Pending') {
            status = resp.status
            getLogger().verbose(`Scan job status: ${status}`)
            getLogger().verbose(`Complete Polling scan job status.`)
            break
        }
        await sleep(ConsolasConstants.codeScanJobPollingInterval * 1000)
        timer += ConsolasConstants.codeScanJobPollingInterval
        if (timer > ConsolasConstants.codeScanJobTimeout) {
            getLogger().verbose(`Scan job status: ${status}`)
            getLogger().verbose(`Scan job timeout.`)
            throw new Error('Scan job timeout.')
        }
    }
    return status
}

export async function createScanJob(
    client: DefaultConsolasClient,
    artifactMap: consolasClient.ArtifactMap,
    languageId: string
) {
    getLogger().verbose(`Creating scan job...`)
    const req: consolasClient.CreateSecurityScanRequest = {
        artifacts: artifactMap,
        language: languageId,
        clientToken: uuid.v1(),
    }
    const resp = await client.createSecurityScan(req)
    getLogger().verbose(`Request id: ${resp.$response.requestId}`)
    return resp
}

export async function getPresignedUrlAndUpload(client: DefaultConsolasClient, truncPaths: TruncPaths) {
    if (truncPaths.src.zip === '') throw new Error("Truncation failure: can't find valid source zip.")
    const srcReq: consolasClient.CreateUploadUrlRequest = {
        artifactType: ConsolasConstants.artifactTypeSource,
        contentMd5: getMd5(truncPaths.src.zip),
        clientToken: uuid.v1(),
    }
    getLogger().verbose(`Getting presigned Url for uploading src context...`)
    const srcResp = await client.createUploadUrl(srcReq)
    getLogger().verbose(`Request id: ${srcResp.$response.requestId}`)
    getLogger().verbose(`Complete Getting presigned Url for uploading src context.`)
    getLogger().verbose(`Uploading src context...`)
    await uploadArtifactToS3(srcResp.uploadUrl, truncPaths.src.zip)
    getLogger().verbose(`Complete uploading src context.`)
    let artifactMap: consolasClient.ArtifactMap = {
        SourceCode: srcResp.importId,
    }
    if (truncPaths.build.zip !== '') {
        const buildReq: consolasClient.CreateUploadUrlRequest = {
            artifactType: ConsolasConstants.artifactTypeBuild,
            contentMd5: getMd5(truncPaths.build.zip),
            clientToken: uuid.v1(),
        }
        getLogger().verbose(`Getting presigned Url for uploading build context...`)
        const buildResp = await client.createUploadUrl(buildReq)
        getLogger().verbose(`Request id: ${buildResp.$response.requestId}`)
        getLogger().verbose(`Complete Getting presigned Url for uploading build context.`)
        getLogger().verbose(`Uploading build context...`)
        await uploadArtifactToS3(buildResp.uploadUrl, truncPaths.build.zip)
        getLogger().verbose(`Complete uploading build context.`)
        artifactMap = {
            SourceCode: srcResp.importId,
            BuiltJars: buildResp.importId,
        }
    }
    return artifactMap
}

function getMd5(filePath: string) {
    const hasher = crypto.createHash('md5')
    hasher.update(readFileSync(filePath))
    return hasher.digest('base64')
}

export async function uploadArtifactToS3(presignedUrl: string, filePath: string) {
    const response = await got(presignedUrl, {
        method: 'PUT',
        body: readFileSync(filePath),
        headers: {
            'Content-MD5': getMd5(filePath),
            'x-amz-server-side-encryption': 'AES256',
            'Content-Type': 'application/zip',
        },
    })
    getLogger().debug(`StatusCode: ${response.statusCode}`)
}

/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ZipMetadata } from '../util/zipUtil'
import { getLogger } from '../../shared/logger'
import * as CodeWhispererConstants from '../models/constants'
import * as codewhispererClient from '../client/codewhisperer'
import * as codeWhisperer from '../client/codewhisperer'
import CodeWhispererUserClient, {
    ArtifactMap,
    CreateUploadUrlRequest,
    TargetCode,
} from '../client/codewhispereruserclient'
import { CreateUploadUrlError, InvalidSourceZipError, TestGenFailedError, TestGenTimedOutError } from '../models/errors'
import { getMd5, uploadArtifactToS3 } from './securityScanHandler'
import { fs, randomUUID, sleep, tempDirPath } from '../../shared'
import { ShortAnswer, TestGenerationJobStatus, testGenState } from '..'
import { ChatSessionManager } from '../../amazonqTest/chat/storages/chatSession'
import { createCodeWhispererChatStreamingClient } from '../../shared/clients/codewhispererChatClient'
import { downloadExportResultArchive } from '../../shared/utilities/download'
import AdmZip from 'adm-zip'
import path from 'path'
import { ExportIntent } from '@amzn/codewhisperer-streaming'
import { glob } from 'glob'

// TODO: Get TestFileName and Framework and to error message
export function throwIfCancelled() {
    // TODO: fileName will be '' if user gives propt without opening
    if (testGenState.isCancelling()) {
        throw Error(CodeWhispererConstants.unitTestGenerationCancelMessage)
    }
}

export async function getPresignedUrlAndUploadTestGen(zipMetadata: ZipMetadata) {
    const logger = getLogger()
    if (zipMetadata.zipFilePath === '') {
        getLogger().error('Failed to create valid source zip')
        throw new InvalidSourceZipError()
    }
    const srcReq: CreateUploadUrlRequest = {
        contentMd5: getMd5(zipMetadata.zipFilePath),
        artifactType: 'SourceCode',
        uploadIntent: CodeWhispererConstants.testGenUploadIntent,
    }
    logger.verbose(`Prepare for uploading src context...`)
    const srcResp = await codeWhisperer.codeWhispererClient.createUploadUrl(srcReq).catch((err) => {
        getLogger().error(`Failed getting presigned url for uploading src context. Request id: ${err.requestId}`)
        throw new CreateUploadUrlError(err)
    })
    logger.verbose(`CreateUploadUrlRequest requestId: ${srcResp.$response.requestId}`)
    logger.verbose(`Complete Getting presigned Url for uploading src context.`)
    logger.verbose(`Uploading src context...`)
    await uploadArtifactToS3(zipMetadata.zipFilePath, srcResp)
    logger.verbose(`Complete uploading src context.`)
    const artifactMap: ArtifactMap = {
        SourceCode: srcResp.uploadId,
    }
    return artifactMap
}

export async function createTestJob(
    artifactMap: codewhispererClient.ArtifactMap,
    relativeTargetPath: TargetCode[],
    userInputPrompt: string,
    clientToken?: string
) {
    const logger = getLogger()
    logger.verbose(`Creating test job and starting startTestGeneration...`)

    // JS will minify this input object - fix that
    const targetCodeList = relativeTargetPath.map((targetCode) => ({
        relativeTargetPath: targetCode.relativeTargetPath,
        targetLineRangeList: targetCode.targetLineRangeList?.map((range) => ({
            start: { line: range.start.line, character: range.start.character },
            end: { line: range.end.line, character: range.end.character },
        })),
    }))
    logger.debug('updated target code list: %O', targetCodeList)
    const req: CodeWhispererUserClient.StartTestGenerationRequest = {
        uploadId: artifactMap.SourceCode,
        targetCodeList,
        userInput: userInputPrompt,
        testGenerationJobGroupName: ChatSessionManager.Instance.getSession().testGenerationJobGroupName ?? randomUUID(), // TODO: remove fallback
        clientToken,
    }
    logger.debug('Unit test generation request body: %O', req)
    logger.debug('target code list: %O', req.targetCodeList[0])
    const firstTargetCodeList = req.targetCodeList?.[0]
    const firstTargetLineRangeList = firstTargetCodeList?.targetLineRangeList?.[0]
    logger.debug('target line range list: %O', firstTargetLineRangeList)
    logger.debug('target line range start: %O', firstTargetLineRangeList?.start)
    logger.debug('target line range end: %O', firstTargetLineRangeList?.end)

    const resp = await codewhispererClient.codeWhispererClient.startTestGeneration(req).catch((err) => {
        ChatSessionManager.Instance.getSession().startTestGenerationRequestId = err.requestId
        logger.error(`Failed creating test job. Request id: ${err.requestId}`)
        throw err
    })
    logger.info('Unit test generation request id: %s', resp.$response.requestId)
    logger.debug('Unit test generation data: %O', resp.$response.data)
    ChatSessionManager.Instance.getSession().startTestGenerationRequestId = resp.$response.requestId
    if (resp.$response.error) {
        logger.error('Unit test generation error: %O', resp.$response.error)
    }
    if (resp.testGenerationJob) {
        ChatSessionManager.Instance.getSession().listOfTestGenerationJobId.push(
            resp.testGenerationJob?.testGenerationJobId
        )
        ChatSessionManager.Instance.getSession().testGenerationJobGroupName =
            resp.testGenerationJob?.testGenerationJobGroupName
    }
    return resp
}

export async function pollTestJobStatus(
    jobId: string,
    jobGroupName: string,
    fileName: string,
    initialExecution: boolean
) {
    const session = ChatSessionManager.Instance.getSession()
    const pollingStartTime = performance.now()
    // We don't expect to get results immediately, so sleep for some time initially to not make unnecessary calls
    await sleep(CodeWhispererConstants.testGenPollingDelaySeconds)

    const logger = getLogger()
    logger.verbose(`Polling testgen job status...`)
    let status = CodeWhispererConstants.TestGenerationJobStatus.IN_PROGRESS
    while (true) {
        throwIfCancelled()
        const req: CodeWhispererUserClient.GetTestGenerationRequest = {
            testGenerationJobId: jobId,
            testGenerationJobGroupName: jobGroupName,
        }
        const resp = await codewhispererClient.codeWhispererClient.getTestGeneration(req)
        logger.verbose('pollTestJobStatus request id: %s', resp.$response.requestId)
        logger.debug('pollTestJobStatus testGenerationJob %O', resp.testGenerationJob)
        ChatSessionManager.Instance.getSession().testGenerationJob = resp.testGenerationJob
        const progressRate = resp.testGenerationJob?.progressRate ?? 0
        testGenState.getChatControllers()?.sendUpdatePromptProgress.fire({
            tabID: ChatSessionManager.Instance.getSession().tabID,
            status: 'InProgress',
            progressRate,
        })
        const shortAnswerString = resp.testGenerationJob?.shortAnswer
        if (shortAnswerString) {
            const parsedShortAnswer = JSON.parse(shortAnswerString)
            const shortAnswer: ShortAnswer = JSON.parse(parsedShortAnswer)
            // Stop the Unit test generation workflow if IDE receive stopIteration = true
            if (shortAnswer.stopIteration === 'true') {
                session.stopIteration = true
                throw new TestGenFailedError(shortAnswer.planSummary)
            }
            if (shortAnswer.numberOfTestMethods) {
                session.numberOfTestsGenerated = Number(shortAnswer.numberOfTestMethods)
            }
            if (shortAnswer.codeReferences) {
                session.references = shortAnswer.codeReferences
            }
            if (initialExecution) {
                session.generatedFilePath = shortAnswer?.testFilePath ?? ''
                const currentPlanSummary = session.shortAnswer?.planSummary
                const newPlanSummary = shortAnswer?.planSummary
                const status = shortAnswer.stopIteration

                if (currentPlanSummary !== newPlanSummary && newPlanSummary) {
                    const chatControllers = testGenState.getChatControllers()
                    if (chatControllers) {
                        const currentSession = ChatSessionManager.Instance.getSession()
                        chatControllers.updateShortAnswer.fire({
                            tabID: currentSession.tabID,
                            status,
                            shortAnswer,
                            testGenerationJobGroupName: resp.testGenerationJob?.testGenerationJobGroupName,
                            testGenerationJobId: resp.testGenerationJob?.testGenerationJobId,
                            fileName,
                        })
                    }
                }
            }
            ChatSessionManager.Instance.getSession().shortAnswer = shortAnswer
        }
        if (resp.testGenerationJob?.status !== TestGenerationJobStatus.IN_PROGRESS) {
            // This can be FAILED or COMPLETED
            status = resp.testGenerationJob?.status as TestGenerationJobStatus
            logger.verbose(`testgen job status: ${status}`)
            logger.verbose(`Complete polling test job status.`)
            break
        }
        throwIfCancelled()
        await sleep(CodeWhispererConstants.testGenJobPollingIntervalMilliseconds)
        const elapsedTime = performance.now() - pollingStartTime
        if (elapsedTime > CodeWhispererConstants.testGenJobTimeoutMilliseconds) {
            logger.verbose(`testgen job status: ${status}`)
            logger.verbose(`testgen job failed. Amazon Q timed out.`)
            throw new TestGenTimedOutError()
        }
    }
    return status
}

/**
 * Download the zip from exportResultsArchieve API and store in temp zip
 */
export async function exportResultsArchive(
    uploadId: string,
    groupName: string,
    jobId: string,
    projectName: string,
    projectPath: string,
    initialExecution: boolean
) {
    // TODO: Make a common Temp folder
    const pathToArchiveDir = path.join(tempDirPath, 'q-testgen')

    const archivePathExists = await fs.existsDir(pathToArchiveDir)
    if (archivePathExists) {
        await fs.delete(pathToArchiveDir, { recursive: true })
    }
    await fs.mkdir(pathToArchiveDir)

    let downloadErrorMessage = undefined
    try {
        const pathToArchive = path.join(pathToArchiveDir, 'QTestGeneration.zip')
        // Download and deserialize the zip
        await downloadResultArchive(uploadId, groupName, jobId, pathToArchive)
        const zip = new AdmZip(pathToArchive)
        zip.extractAllTo(pathToArchiveDir, true)

        const session = ChatSessionManager.Instance.getSession()
        const testFilePathFromResponse = session?.shortAnswer?.testFilePath
        const testFilePath = testFilePathFromResponse
            ? testFilePathFromResponse.split('/').slice(1).join('/') // remove the project name
            : await getTestFilePathFromZip(pathToArchiveDir)
        if (initialExecution) {
            testGenState.getChatControllers()?.showCodeGenerationResults.fire({
                tabID: session.tabID,
                filePath: testFilePath,
                projectName,
            })

            // If User accepts the diff
            testGenState.getChatControllers()?.sendUpdatePromptProgress.fire({
                tabID: ChatSessionManager.Instance.getSession().tabID,
                status: 'Completed',
            })
        }
    } catch (e) {
        downloadErrorMessage = (e as Error).message
        getLogger().error(`Unit Test Generation: ExportResultArchive error = ${downloadErrorMessage}`)
        throw new Error('Error downloading test generation result artifacts: ' + downloadErrorMessage)
    }
}

async function getTestFilePathFromZip(pathToArchiveDir: string) {
    const resultArtifactsDir = path.join(pathToArchiveDir, 'resultArtifacts')
    const paths = await glob([resultArtifactsDir + '/**/*', '!**/.DS_Store'], { nodir: true })
    const absolutePath = paths[0]
    const result = path.relative(resultArtifactsDir, absolutePath)
    return result
}

export async function downloadResultArchive(
    uploadId: string,
    testGenerationJobGroupName: string,
    testGenerationJobId: string,
    pathToArchive: string
) {
    let downloadErrorMessage = undefined
    const cwStreamingClient = await createCodeWhispererChatStreamingClient()

    try {
        await downloadExportResultArchive(
            cwStreamingClient,
            {
                exportId: uploadId,
                exportIntent: ExportIntent.UNIT_TESTS,
                exportContext: {
                    unitTestGenerationExportContext: {
                        testGenerationJobGroupName,
                        testGenerationJobId,
                    },
                },
            },
            pathToArchive
        )
    } catch (e: any) {
        downloadErrorMessage = (e as Error).message
        getLogger().error(`Unit Test Generation: ExportResultArchive error = ${downloadErrorMessage}`)
        throw e
    } finally {
        cwStreamingClient.destroy()
    }
}

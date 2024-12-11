/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getLogger } from '../../shared/logger'
import { ZipUtil } from '../util/zipUtil'
import { ArtifactMap } from '../client/codewhisperer'
import { testGenerationLogsDir } from '../../shared/filesystemUtilities'
import {
    createTestJob,
    exportResultsArchive,
    getPresignedUrlAndUploadTestGen,
    pollTestJobStatus,
    throwIfCancelled,
} from '../service/testGenHandler'
import path from 'path'
import { testGenState } from '..'
import { ChatSessionManager } from '../../amazonqTest/chat/storages/chatSession'
import { ChildProcess, spawn } from 'child_process'
import { BuildStatus } from '../../amazonqTest/chat/session/session'
import { fs } from '../../shared/fs/fs'
import { TestGenerationJobStatus } from '../models/constants'
import { TestGenFailedError } from '../models/errors'
import { Range } from '../client/codewhispereruserclient'

// eslint-disable-next-line unicorn/no-null
let spawnResult: ChildProcess | null = null
let isCancelled = false
export async function startTestGenerationProcess(
    fileName: string,
    filePath: string,
    userInputPrompt: string,
    tabID: string,
    initialExecution: boolean,
    selectionRange?: Range
) {
    const logger = getLogger()
    const session = ChatSessionManager.Instance.getSession()
    // TODO: Step 0: Initial Test Gen telemetry
    try {
        logger.verbose(`Starting Test Generation `)
        logger.verbose(`Tab ID: ${tabID} !== ${session.tabID}`)
        if (tabID !== session.tabID) {
            logger.verbose(`Tab ID mismatch: ${tabID} !== ${session.tabID}`)
            return
        }
        /**
         * Zip the project
         */

        const zipUtil = new ZipUtil()
        if (initialExecution) {
            const projectPath = zipUtil.getProjectPath(filePath) ?? ''
            const relativeTargetPath = path.relative(projectPath, filePath)
            session.listOfTestGenerationJobId = []
            session.shortAnswer = undefined
            session.sourceFilePath = relativeTargetPath
            session.projectRootPath = projectPath
            session.listOfTestGenerationJobId = []
        }
        const zipMetadata = await zipUtil.generateZipTestGen(session.projectRootPath, initialExecution)
        session.srcPayloadSize = zipMetadata.buildPayloadSizeInBytes
        session.srcZipFileSize = zipMetadata.zipFileSizeInBytes

        /**
         * Step 2: Get presigned Url, upload and clean up
         */
        throwIfCancelled()
        if (!shouldContinueRunning(tabID)) {
            return
        }
        let artifactMap: ArtifactMap = {}
        const uploadStartTime = performance.now()
        try {
            artifactMap = await getPresignedUrlAndUploadTestGen(zipMetadata)
        } finally {
            if (await fs.existsFile(path.join(testGenerationLogsDir, 'output.log'))) {
                await fs.delete(path.join(testGenerationLogsDir, 'output.log'))
            }
            await zipUtil.removeTmpFiles(zipMetadata)
            session.artifactsUploadDuration = performance.now() - uploadStartTime
        }

        /**
         * Step 3:  Create scan job with startTestGeneration
         */
        throwIfCancelled()
        if (!shouldContinueRunning(tabID)) {
            return
        }
        const sessionFilePath = session.sourceFilePath
        const testJob = await createTestJob(
            artifactMap,
            [
                {
                    relativeTargetPath: sessionFilePath,
                    targetLineRangeList: selectionRange ? [selectionRange] : [],
                },
            ],
            userInputPrompt
        )
        if (!testJob.testGenerationJob) {
            throw Error('Test job not found')
        }
        session.testGenerationJob = testJob.testGenerationJob

        /**
         * Step 4:  Polling mechanism on test job status with getTestGenStatus
         */
        throwIfCancelled()
        if (!shouldContinueRunning(tabID)) {
            return
        }
        const jobStatus = await pollTestJobStatus(
            testJob.testGenerationJob.testGenerationJobId,
            testJob.testGenerationJob.testGenerationJobGroupName,
            fileName,
            initialExecution
        )
        // TODO: Send status to test summary
        if (jobStatus === TestGenerationJobStatus.FAILED) {
            logger.verbose(`Test generation failed.`)
            throw new TestGenFailedError()
        }
        throwIfCancelled()
        if (!shouldContinueRunning(tabID)) {
            return
        }
        /**
         * Step 5: Process and show the view diff by getting the results from exportResultsArchive
         */
        // https://github.com/aws/aws-toolkit-vscode/blob/0164d4145e58ae036ddf3815455ea12a159d491d/packages/core/src/codewhisperer/service/transformByQ/transformationResultsViewProvider.ts#L314-L405
        await exportResultsArchive(
            artifactMap.SourceCode,
            testJob.testGenerationJob.testGenerationJobGroupName,
            testJob.testGenerationJob.testGenerationJobId,
            path.basename(session.projectRootPath),
            session.projectRootPath,
            initialExecution
        )
    } catch (error) {
        logger.error(`startTestGenerationProcess failed: %O`, error)
        // TODO: Send error message to Chat
        testGenState.getChatControllers()?.errorThrown.fire({
            tabID: session.tabID,
            error: error,
        })
    } finally {
        testGenState.setToNotStarted()
    }
}

export function shouldContinueRunning(tabID: string): boolean {
    if (tabID !== ChatSessionManager.Instance.getSession().tabID) {
        getLogger().verbose(`Tab ID mismatch: ${tabID} !== ${ChatSessionManager.Instance.getSession().tabID}`)
        return false
    }
    return true
}

/**
 * Run client side build with given build commands
 */
export async function runBuildCommand(listofBuildCommand: string[]): Promise<BuildStatus> {
    for (const buildCommand of listofBuildCommand) {
        try {
            await fs.mkdir(testGenerationLogsDir)
            const tmpFile = path.join(testGenerationLogsDir, 'output.log')
            const result = await runLocalBuild(buildCommand, tmpFile)
            if (result.isCancelled) {
                return BuildStatus.CANCELLED
            }
            if (result.code !== 0) {
                return BuildStatus.FAILURE
            }
        } catch (error) {
            getLogger().error(`Build process error`)
            return BuildStatus.FAILURE
        }
    }
    return BuildStatus.SUCCESS
}

function runLocalBuild(
    buildCommand: string,
    tmpFile: string
): Promise<{ code: number | null; isCancelled: boolean; message: string }> {
    return new Promise(async (resolve, reject) => {
        const environment = process.env
        const repositoryPath = ChatSessionManager.Instance.getSession().projectRootPath
        const [command, ...args] = buildCommand.split(' ')
        getLogger().info(`Build process started for command: ${buildCommand}, for path: ${repositoryPath}`)

        let buildLogs = ''

        spawnResult = spawn(command, args, {
            cwd: repositoryPath,
            shell: true,
            env: environment,
        })

        if (spawnResult.stdout) {
            spawnResult.stdout.on('data', async (data) => {
                const output = data.toString().trim()
                getLogger().info(`BUILD OUTPUT: ${output}`)
                buildLogs += output
            })
        }

        if (spawnResult.stderr) {
            spawnResult.stderr.on('data', async (data) => {
                const output = data.toString().trim()
                getLogger().warn(`BUILD ERROR: ${output}`)
                buildLogs += output
            })
        }

        spawnResult.on('close', async (code) => {
            let message = ''
            if (isCancelled) {
                message = 'Build cancelled'
                getLogger().info('BUILD CANCELLED')
            } else if (code === 0) {
                message = 'Build successful'
                getLogger().info('BUILD SUCCESSFUL')
            } else {
                message = `Build failed with exit code ${code}`
                getLogger().info(`BUILD FAILED with exit code ${code}`)
            }

            try {
                await fs.writeFile(tmpFile, buildLogs)
                getLogger().info(`Build logs written to ${tmpFile}`)
            } catch (error) {
                getLogger().error(`Failed to write build logs to ${tmpFile}: ${error}`)
            }

            resolve({ code, isCancelled, message })

            // eslint-disable-next-line unicorn/no-null
            spawnResult = null
            isCancelled = false
        })

        spawnResult.on('error', (error) => {
            reject(new Error(`Failed to start build process: ${error.message}`))
        })
    })
}

export function cancelBuild() {
    if (spawnResult) {
        isCancelled = true
        spawnResult.kill()
        getLogger().info('Build cancellation requested')
    } else {
        getLogger().info('No active build to cancel')
    }
}

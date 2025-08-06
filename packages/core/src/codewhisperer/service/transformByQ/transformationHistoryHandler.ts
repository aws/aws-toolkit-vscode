/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import fs from '../../../shared/fs/fs'
import path from 'path'
import os from 'os'
import * as CodeWhispererConstants from '../../models/constants'
import { JDKVersion, TransformationType, transformByQState } from '../../models/model'
import { getLogger } from '../../../shared/logger/logger'
import { codeWhispererClient } from '../../../codewhisperer/client/codewhisperer'
import { pollTransformationStatusUntilComplete } from '../../commands/startTransformByQ'
import { downloadAndExtractResultArchive } from './transformApiHandler'
import { ChatSessionManager } from '../../../amazonqGumby/chat/storages/chatSession'
import { AuthUtil } from '../../util/authUtil'
import { setMaven } from './transformFileHandler'
import { convertToTimeString, isWithin30Days } from '../../../shared/datetime'

export async function readHistoryFile(): Promise<CodeWhispererConstants.HistoryObject[]> {
    const history: CodeWhispererConstants.HistoryObject[] = []
    const jobHistoryFilePath = path.join(os.homedir(), '.aws', 'transform', 'transformation_history.tsv')

    if (!(await fs.existsFile(jobHistoryFilePath))) {
        return history
    }

    const historyFile = await fs.readFileText(jobHistoryFilePath)
    const jobs = historyFile.split('\n')
    jobs.shift() // removes headers

    // Process from end, stop at 10 valid entries
    for (let i = jobs.length - 1; i >= 0 && history.length < 10; i--) {
        const job = jobs[i]
        if (job && isWithin30Days(job.split('\t')[0])) {
            const jobInfo = job.split('\t')
            history.push({
                startTime: jobInfo[0],
                projectName: jobInfo[1],
                status: jobInfo[2],
                duration: jobInfo[3],
                diffPath: jobInfo[4],
                summaryPath: jobInfo[5],
                jobId: jobInfo[6],
            })
        }
    }
    return history
}

/* Job refresh-related functions */

export async function refreshJob(jobId: string, currentStatus: string, projectName: string) {
    // fetch status from server
    let status = ''
    let duration = ''
    if (currentStatus === 'COMPLETED' || currentStatus === 'PARTIALLY_COMPLETED') {
        // job is already completed, no need to fetch status
        status = currentStatus
    } else {
        try {
            const response = await codeWhispererClient.codeModernizerGetCodeTransformation({
                transformationJobId: jobId,
                profileArn: undefined,
            })
            status = response.transformationJob.status ?? currentStatus
            if (response.transformationJob.endExecutionTime && response.transformationJob.creationTime) {
                duration = convertToTimeString(
                    response.transformationJob.endExecutionTime.getTime() -
                        response.transformationJob.creationTime.getTime()
                )
            }

            getLogger().debug(
                'Code Transformation: Job refresh - Fetched status for job id: %s\n{Status: %s; Duration: %s}',
                jobId,
                status,
                duration
            )
        } catch (error) {
            getLogger().error(
                'Code Transformation: Error fetching status (job id: %s): %s',
                jobId,
                (error as Error).message
            )
            return
        }
    }

    // retrieve artifacts and updated duration if available
    let jobHistoryPath: string = ''
    if (status === 'COMPLETED' || status === 'PARTIALLY_COMPLETED') {
        // artifacts should be available to download
        jobHistoryPath = await retrieveArtifacts(jobId, projectName)

        // delete metadata and zipped code files, if they exist
        await fs.delete(path.join(os.homedir(), '.aws', 'transform', projectName, jobId, 'metadata.txt'), {
            force: true,
        })
        await fs.delete(path.join(os.homedir(), '.aws', 'transform', projectName, jobId, 'zipped-code.zip'), {
            force: true,
        })
    } else if (CodeWhispererConstants.validStatesForBuildSucceeded.includes(status)) {
        // still in progress on server side
        if (transformByQState.isRunning()) {
            getLogger().warn(
                'Code Transformation: There is a job currently running (id: %s). Cannot resume another job (id: %s)',
                transformByQState.getJobId(),
                jobId
            )
            return
        }
        transformByQState.setRefreshInProgress(true)
        const messenger = transformByQState.getChatMessenger()
        const tabID = ChatSessionManager.Instance.getSession().tabID
        messenger?.sendJobRefreshInProgressMessage(tabID!, jobId)
        await vscode.commands.executeCommand('aws.amazonq.transformationHub.updateContent', 'job history') // refreshing the table disables all jobs' refresh buttons while this one is resuming

        // resume job and bring to completion
        try {
            status = await resumeJob(jobId, projectName, status)
        } catch (e: any) {
            getLogger().error('Code Transformation: Error resuming job (id: %s): %s', jobId, (e as Error).message)
            transformByQState.setJobDefaults()
            messenger?.sendJobFinishedMessage(tabID!, CodeWhispererConstants.refreshErrorChatMessage)
            void vscode.window.showErrorMessage(CodeWhispererConstants.refreshErrorNotification(jobId))
            await vscode.commands.executeCommand('aws.amazonq.transformationHub.updateContent', 'job history')
            return
        }

        // download artifacts if available
        if (
            CodeWhispererConstants.validStatesForCheckingDownloadUrl.includes(status) &&
            !CodeWhispererConstants.failureStates.includes(status)
        ) {
            duration = convertToTimeString(Date.now() - new Date(transformByQState.getStartTime()).getTime())
            jobHistoryPath = await retrieveArtifacts(jobId, projectName)
        }

        // reset state
        transformByQState.setJobDefaults()
        messenger?.sendJobFinishedMessage(tabID!, CodeWhispererConstants.refreshCompletedChatMessage)
    } else {
        // FAILED or STOPPED job
        getLogger().info('Code Transformation: No artifacts available to download (job status = %s)', status)
        if (status === 'FAILED') {
            // if job failed on backend, mark it to disable the refresh button
            status = 'FAILED_BE' // this will be truncated to just 'FAILED' in the table
        }
        // delete metadata and zipped code files, if they exist
        await fs.delete(path.join(os.homedir(), '.aws', 'transform', projectName, jobId, 'metadata.txt'), {
            force: true,
        })
        await fs.delete(path.join(os.homedir(), '.aws', 'transform', projectName, jobId, 'zipped-code.zip'), {
            force: true,
        })
    }

    if (status === currentStatus && !jobHistoryPath) {
        // no changes, no need to update file/table
        void vscode.window.showInformationMessage(CodeWhispererConstants.refreshNoUpdatesNotification(jobId))
        return
    }

    void vscode.window.showInformationMessage(CodeWhispererConstants.refreshCompletedNotification(jobId))
    // update local file and history table

    await updateHistoryFile(status, duration, jobHistoryPath, jobId)
}

export async function retrieveArtifacts(jobId: string, projectName: string) {
    const resultsPath = path.join(os.homedir(), '.aws', 'transform', projectName, 'results') // temporary directory for extraction
    let jobHistoryPath = path.join(os.homedir(), '.aws', 'transform', projectName, jobId)

    if (await fs.existsFile(path.join(jobHistoryPath, 'diff.patch'))) {
        getLogger().info('Code Transformation: Diff patch already exists for job id: %s', jobId)
        jobHistoryPath = ''
    } else {
        try {
            await downloadAndExtractResultArchive(jobId, resultsPath)

            if (!(await fs.existsDir(path.join(jobHistoryPath, 'summary')))) {
                await fs.mkdir(path.join(jobHistoryPath, 'summary'))
            }
            await fs.copy(path.join(resultsPath, 'patch', 'diff.patch'), path.join(jobHistoryPath, 'diff.patch'))
            await fs.copy(
                path.join(resultsPath, 'summary', 'summary.md'),
                path.join(jobHistoryPath, 'summary', 'summary.md')
            )
            if (await fs.existsFile(path.join(resultsPath, 'summary', 'buildCommandOutput.log'))) {
                await fs.copy(
                    path.join(resultsPath, 'summary', 'buildCommandOutput.log'),
                    path.join(jobHistoryPath, 'summary', 'buildCommandOutput.log')
                )
            }
        } catch (error) {
            jobHistoryPath = ''
        } finally {
            // delete temporary extraction directory
            await fs.delete(resultsPath, { recursive: true, force: true })
        }
    }
    return jobHistoryPath
}

export async function updateHistoryFile(status: string, duration: string, jobHistoryPath: string, jobId: string) {
    const history: string[][] = []
    const historyLogFilePath = path.join(os.homedir(), '.aws', 'transform', 'transformation_history.tsv')
    if (await fs.existsFile(historyLogFilePath)) {
        const historyFile = await fs.readFileText(historyLogFilePath)
        const jobs = historyFile.split('\n')
        jobs.shift() // removes headers
        if (jobs.length > 0) {
            for (const job of jobs) {
                if (job) {
                    const jobInfo = job.split('\t')
                    // startTime: jobInfo[0], projectName: jobInfo[1], status: jobInfo[2], duration: jobInfo[3], diffPath: jobInfo[4], summaryPath: jobInfo[5], jobId: jobInfo[6]
                    if (jobInfo[6] === jobId) {
                        // update any values if applicable
                        jobInfo[2] = status
                        if (duration) {
                            jobInfo[3] = duration
                        }
                        if (jobHistoryPath) {
                            jobInfo[4] = path.join(jobHistoryPath, 'diff.patch')
                            jobInfo[5] = path.join(jobHistoryPath, 'summary', 'summary.md')
                        }
                    }
                    history.push(jobInfo)
                }
            }
        }
    }

    if (history.length === 0) {
        return
    }

    // rewrite file
    await fs.writeFile(historyLogFilePath, 'date\tproject_name\tstatus\tduration\tdiff_patch\tsummary\tjob_id\n')
    const tsvContent = history.map((row) => row.join('\t')).join('\n') + '\n'
    await fs.appendFile(historyLogFilePath, tsvContent)

    // update table content
    await vscode.commands.executeCommand('aws.amazonq.transformationHub.updateContent', 'job history', undefined, true)
}

async function resumeJob(jobId: string, projectName: string, status: string) {
    // set state to prepare to resume job
    await setupTransformationState(jobId, projectName, status)
    // resume polling the job
    return await pollAndCompleteTransformation(jobId)
}

async function setupTransformationState(jobId: string, projectName: string, status: string) {
    transformByQState.setJobId(jobId)
    transformByQState.setPolledJobStatus(status)
    transformByQState.setJobHistoryPath(path.join(os.homedir(), '.aws', 'transform', projectName, jobId))
    const metadataFile = await fs.readFileText(path.join(transformByQState.getJobHistoryPath(), 'metadata.txt'))
    const metadata = metadataFile.split('\t')
    transformByQState.setTransformationType(metadata[1] as TransformationType)
    transformByQState.setSourceJDKVersion(metadata[2] as JDKVersion)
    transformByQState.setTargetJDKVersion(metadata[3] as JDKVersion)
    transformByQState.setCustomDependencyVersionFilePath(metadata[4])
    transformByQState.setPayloadFilePath(
        path.join(os.homedir(), '.aws', 'transform', projectName, jobId, 'zipped-code.zip')
    )
    setMaven()
    transformByQState.setCustomBuildCommand(metadata[5])
    transformByQState.setTargetJavaHome(metadata[6])
    transformByQState.setProjectPath(metadata[7])
    transformByQState.setStartTime(metadata[8])
}

async function pollAndCompleteTransformation(jobId: string) {
    const status = await pollTransformationStatusUntilComplete(
        jobId,
        AuthUtil.instance.regionProfileManager.activeRegionProfile
    )
    // delete payload and metadata files
    await fs.delete(transformByQState.getPayloadFilePath(), { force: true })
    await fs.delete(path.join(transformByQState.getJobHistoryPath(), 'metadata.txt'), { force: true })
    // delete temporary build logs file
    const logFilePath = path.join(os.tmpdir(), 'build-logs.txt')
    await fs.delete(logFilePath, { force: true })
    return status
}

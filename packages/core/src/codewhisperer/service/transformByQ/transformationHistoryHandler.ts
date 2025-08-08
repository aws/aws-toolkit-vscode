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
import { downloadAndExtractResultArchive, pollTransformationJob } from './transformApiHandler'
import { ChatSessionManager } from '../../../amazonqGumby/chat/storages/chatSession'
import { AuthUtil } from '../../util/authUtil'
import { setMaven } from './transformFileHandler'
import { convertToTimeString, isWithin30Days } from '../../../shared/datetime'
import { copyArtifacts } from './transformFileHandler'

export interface HistoryObject {
    startTime: string
    projectName: string
    status: string
    duration: string
    diffPath: string
    summaryPath: string
    jobId: string
}

export interface JobMetadata {
    jobId: string
    projectName: string
    transformationType: TransformationType
    sourceJDKVersion: JDKVersion
    targetJDKVersion: JDKVersion
    customDependencyVersionFilePath: string
    customBuildCommand: string
    targetJavaHome: string
    projectPath: string
    startTime: string
}

/**
 * Reads 'transformation_history.tsv' (history) file
 *
 * @returns history array of 10 most recent jobs from within past 30 days
 */
export async function readHistoryFile(): Promise<HistoryObject[]> {
    const history: HistoryObject[] = []
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

/**
 * Creates temporary metadata JSON file with transformation config info and saves a copy of upload zip
 *
 * These files are used when a job is resumed after interruption
 *
 * @param payloadFilePath path to upload zip
 * @param metadata
 * @returns
 */
export async function createMetadataFile(payloadFilePath: string, metadata: JobMetadata): Promise<string> {
    const jobHistoryPath = path.join(os.homedir(), '.aws', 'transform', metadata.projectName, metadata.jobId)

    // create job history folders
    await fs.mkdir(jobHistoryPath)

    // save a copy of the upload zip
    try {
        await fs.copy(payloadFilePath, path.join(jobHistoryPath, 'zipped-code.zip'))
    } catch (error) {
        getLogger().error('Code Transformation: error saving copy of upload zip: %s', (error as Error).message)
    }

    // create metadata file with transformation config info
    try {
        await fs.writeFile(path.join(jobHistoryPath, 'metadata.json'), JSON.stringify(metadata))
    } catch (error) {
        getLogger().error('Code Transformation: error creating metadata file: %s', (error as Error).message)
    }

    return jobHistoryPath
}

/**
 * Writes job details to history file
 *
 * @param startTime job start timestamp (ex. "01/01/23, 12:00 AM")
 * @param projectName
 * @param status
 * @param duration job duration in hr / min / sec format (ex. "1 hr 15 min")
 * @param jobId
 * @param jobHistoryPath path to where job's history details are stored (ex. "~/.aws/transform/proj_name/job_id")
 */
export async function writeToHistoryFile(
    startTime: string,
    projectName: string,
    status: string,
    duration: string,
    jobId: string,
    jobHistoryPath: string
) {
    const historyLogFilePath = path.join(os.homedir(), '.aws', 'transform', 'transformation_history.tsv')
    // create transform folder if necessary
    if (!(await fs.existsFile(historyLogFilePath))) {
        await fs.mkdir(path.dirname(historyLogFilePath))
        // create headers of new transformation history file
        await fs.writeFile(historyLogFilePath, 'date\tproject_name\tstatus\tduration\tdiff_patch\tsummary\tjob_id\n')
    }
    const artifactsExist = status === 'COMPLETED' || status === 'PARTIALLY_COMPLETED'
    const fields = [
        startTime,
        projectName,
        status,
        duration,
        artifactsExist ? path.join(jobHistoryPath, 'diff.patch') : '',
        artifactsExist ? path.join(jobHistoryPath, 'summary', 'summary.md') : '',
        jobId,
    ]

    const jobDetails = fields.join('\t') + '\n'
    await fs.appendFile(historyLogFilePath, jobDetails)

    // update Transformation Hub table
    await vscode.commands.executeCommand('aws.amazonq.transformationHub.updateContent', 'job history', undefined, true)
}

/**
 * Delete temporary files at the end of a transformation
 *
 * @param jobHistoryPath path to history directory for this job
 * @param jobStatus final transformation status
 * @param payloadFilePath path to original upload zip; providing this param will also delete any temp build logs
 */
export async function cleanupTempJobFiles(jobHistoryPath: string, jobStatus: string, payloadFilePath?: string) {
    if (payloadFilePath) {
        // delete original upload ZIP
        await fs.delete(payloadFilePath, { force: true })
        // delete temporary build logs file
        const logFilePath = path.join(os.tmpdir(), 'build-logs.txt')
        await fs.delete(logFilePath, { force: true })
    }

    // delete metadata file and upload zip copy if no longer need them (i.e. will not be resuming)
    if (jobStatus !== 'FAILED') {
        await fs.delete(path.join(jobHistoryPath, 'metadata.json'), { force: true })
        await fs.delete(path.join(jobHistoryPath, 'zipped-code.zip'), { force: true })
    }
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
            const errorMessage = (error as Error).message
            getLogger().error('Code Transformation: Error fetching status (job id: %s): %s', jobId, errorMessage)
            if (errorMessage.includes('not authorized to make this call')) {
                // job not available on backend
                status = 'FAILED' // won't allow retries for this job
            } else {
                // some other error (e.g. network error)
                return
            }
        }
    }

    // retrieve artifacts and updated duration if available
    let jobHistoryPath: string = ''
    if (status === 'COMPLETED' || status === 'PARTIALLY_COMPLETED') {
        // artifacts should be available to download
        jobHistoryPath = await retrieveArtifacts(jobId, projectName)

        await cleanupTempJobFiles(path.join(os.homedir(), '.aws', 'transform', projectName, jobId), status)
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
        } catch (error) {
            getLogger().error('Code Transformation: Error resuming job (id: %s): %s', jobId, (error as Error).message)
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
        await cleanupTempJobFiles(path.join(os.homedir(), '.aws', 'transform', projectName, jobId), status)
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

async function retrieveArtifacts(jobId: string, projectName: string) {
    const resultsPath = path.join(os.homedir(), '.aws', 'transform', projectName, 'results') // temporary directory for extraction
    let jobHistoryPath = path.join(os.homedir(), '.aws', 'transform', projectName, jobId)

    if (await fs.existsFile(path.join(jobHistoryPath, 'diff.patch'))) {
        getLogger().info('Code Transformation: Diff patch already exists for job id: %s', jobId)
        jobHistoryPath = ''
    } else {
        try {
            await downloadAndExtractResultArchive(jobId, resultsPath)
            await copyArtifacts(resultsPath, jobHistoryPath)
        } catch (error) {
            jobHistoryPath = ''
        } finally {
            // delete temporary extraction directory
            await fs.delete(resultsPath, { recursive: true, force: true })
        }
    }
    return jobHistoryPath
}

async function updateHistoryFile(status: string, duration: string, jobHistoryPath: string, jobId: string) {
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

    const metadata: JobMetadata = JSON.parse(
        await fs.readFileText(path.join(transformByQState.getJobHistoryPath(), 'metadata.json'))
    )
    transformByQState.setTransformationType(metadata.transformationType)
    transformByQState.setSourceJDKVersion(metadata.sourceJDKVersion)
    transformByQState.setTargetJDKVersion(metadata.targetJDKVersion)
    transformByQState.setCustomDependencyVersionFilePath(metadata.customDependencyVersionFilePath)
    transformByQState.setPayloadFilePath(
        path.join(os.homedir(), '.aws', 'transform', projectName, jobId, 'zipped-code.zip')
    )
    setMaven()
    transformByQState.setCustomBuildCommand(metadata.customBuildCommand)
    transformByQState.setTargetJavaHome(metadata.targetJavaHome)
    transformByQState.setProjectPath(metadata.projectPath)
    transformByQState.setStartTime(metadata.startTime)
}

async function pollAndCompleteTransformation(jobId: string) {
    const status = await pollTransformationJob(
        jobId,
        CodeWhispererConstants.validStatesForCheckingDownloadUrl,
        AuthUtil.instance.regionProfileManager.activeRegionProfile
    )
    await cleanupTempJobFiles(transformByQState.getJobHistoryPath(), status, transformByQState.getPayloadFilePath())
    return status
}

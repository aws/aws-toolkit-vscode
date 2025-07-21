/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as sinon from 'sinon'
import * as CodeWhispererConstants from '../../codewhisperer/models/constants'
import { transformByQState, sessionJobHistory } from '../../codewhisperer/models/model'
import { codeWhispererClient } from '../../codewhisperer/client/codewhisperer'
import {
    TransformationHubViewProvider,
    readHistoryFile,
} from '../../codewhisperer/service/transformByQ/transformationHubViewProvider'
import fs from 'fs'
import { postTransformationJob } from '../../codewhisperer/commands/startTransformByQ'
import * as transformApiHandler from '../../codewhisperer/service/transformByQ/transformApiHandler'
import * as vscode from 'vscode'

describe('Transformation Job History', function () {
    let transformationHub: TransformationHubViewProvider

    interface HistoryObject {
        startTime: string
        projectName: string
        status: string
        duration: string
        diffPath: string
        summaryPath: string
        jobId: string
    }

    beforeEach(function () {
        transformationHub = TransformationHubViewProvider.instance
    })

    afterEach(function () {
        sinon.restore()
    })

    describe('Viewing job history in Transformation Hub', function () {
        it('Nothing to show message when no history', function () {
            transformationHub['transformationHistory'] = []
            sinon.stub(transformByQState, 'isRunning').returns(false)

            const result = transformationHub['showJobHistory']()

            assert(result.includes('Transformation History'))
            assert(result.includes(CodeWhispererConstants.nothingToShowMessage))
        })

        it('Can see previously run jobs', function () {
            const mockHistory: HistoryObject[] = [
                {
                    startTime: '07/14/25, 09:00 AM',
                    projectName: 'old-project',
                    status: 'COMPLETED',
                    duration: '3 min',
                    diffPath: '/path/to/diff.patch',
                    summaryPath: '/path/to/summary.md',
                    jobId: 'old-job-456',
                },
                {
                    startTime: '07/14/25, 10:00 AM',
                    projectName: 'incomplete-project',
                    status: 'TRANSFORMING',
                    duration: '3 min',
                    diffPath: '',
                    summaryPath: '',
                    jobId: 'inc-100',
                },
                {
                    startTime: '07/10/25, 10:00 AM',
                    projectName: 'failed-project',
                    status: 'FAILED_BE',
                    duration: '3 min',
                    diffPath: '',
                    summaryPath: '',
                    jobId: 'fail-300',
                },
            ]

            transformationHub['transformationHistory'] = mockHistory
            sinon.stub(transformByQState, 'isRunning').returns(false)

            const result = transformationHub['showJobHistory']()

            assert(result.includes('old-project'))
            assert(result.includes('COMPLETED'))
            assert(result.includes('old-job-456'))
            assert(result.includes('incomplete-project'))
            assert(result.includes('TRANSFORMING'))
            assert(result.includes('inc-100'))
            assert(!result.includes('<td>FAILED_BE</td>'), 'Table should only say FAILED in the status column')
            assert(result.includes('<table'))
        })

        it('Can see running job at top of table', function () {
            const mockHistory: HistoryObject[] = [
                {
                    startTime: '07/14/25, 09:00 AM',
                    projectName: 'old-project',
                    status: 'COMPLETED',
                    duration: '3 min',
                    diffPath: '/path/to/diff.patch',
                    summaryPath: '/path/to/summary.md',
                    jobId: 'old-job-456',
                },
            ]
            transformationHub['transformationHistory'] = mockHistory

            sinon.stub(transformByQState, 'isRunning').returns(true)
            sinon.stub(transformByQState, 'getJobId').returns('running-job-123')
            sessionJobHistory['running-job-123'] = {
                startTime: '07/14/25, 11:00 AM',
                projectName: 'running-project',
                status: 'TRANSFORMING',
                duration: '2 min',
            }

            const result = transformationHub['showJobHistory']()

            const runningIndex = result.indexOf('running-project')
            const oldIndex = result.indexOf('old-project')
            assert(runningIndex < oldIndex, 'Running job should appear before completed jobs')
            assert(result.includes('row-id="running-job-123"'))
            assert(result.includes('old-job-456'))
        })
    })

    describe('Job history file operations', function () {
        let fsExistsStub: sinon.SinonStub
        let fsReadStub: sinon.SinonStub
        let fsWriteStub: sinon.SinonStub

        beforeEach(function () {
            fsExistsStub = sinon.stub(fs, 'existsSync')
            fsReadStub = sinon.stub(fs, 'readFileSync')
            fsWriteStub = sinon.stub(fs, 'writeFileSync')
        })

        describe('Reading history file', function () {
            it('Returns empty array when history file does not exist', function () {
                fsExistsStub.returns(false)

                const result = (transformationHub['transformationHistory'] = readHistoryFile())

                assert.strictEqual(result.length, 0, 'Should return empty array when file does not exist')
                sinon.assert.calledOnce(fsExistsStub)
                sinon.assert.notCalled(fsReadStub)
            })

            it('Only includes jobs within 30 days', function () {
                fsExistsStub.returns(true)

                const recentDate = new Date()
                const oldDate = new Date(recentDate.getDate() - 40) // 40 days ago

                // Format dates
                const recentDateStr = recentDate.toLocaleDateString('en-US', {
                    month: '2-digit',
                    day: '2-digit',
                    year: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                })
                const oldDateStr = oldDate.toLocaleDateString('en-US', {
                    month: '2-digit',
                    day: '2-digit',
                    year: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                })

                const mockHistoryContent =
                    'date\tproject_name\tstatus\tduration\tdiff_patch\tsummary\tjob_id\n' +
                    `${recentDateStr}\trecent-project\tCOMPLETED\t3 min\t/path/diff.patch\t/path/summary.md\tjob-123\n` +
                    `${oldDateStr}\told-project\tCOMPLETED\t5 min\t/path/diff.patch\t/path/summary.md\tjob-456\n`

                fsReadStub.returns(mockHistoryContent)

                const result = readHistoryFile()
                assert.strictEqual(result.length, 1, 'Should only include jobs within 30 days')
                assert.strictEqual(result[0].projectName, 'recent-project')
            })

            it('Limits history to 10 most recent jobs', function () {
                fsExistsStub.returns(true)

                // Create 15 job entries
                let mockHistoryContent = 'date\tproject_name\tstatus\tduration\tdiff_patch\tsummary\tjob_id\n'
                for (let i = 1; i <= 15; i++) {
                    mockHistoryContent += `07/${i}/25, 09:00 AM\tproject-${i}\tCOMPLETED\t3 min\t/path/diff.patch\t/path/summary.md\tjob-${i}\n`
                }

                fsReadStub.returns(mockHistoryContent)

                const result = readHistoryFile()

                assert.strictEqual(result.length, 10, 'Should limit to 10 jobs')
                // Should have the most recent jobs (highest numbers)
                assert.strictEqual(result[0].jobId, 'job-15')
                assert.strictEqual(result[9].jobId, 'job-6')
            })
        })

        describe('Writing to history file', function () {
            it('Writes job details to history file after job completion', async function () {
                // Setup job state
                const jobId = 'completed-job-123'
                transformByQState.setJobId(jobId)
                transformByQState.setToSucceeded()
                transformByQState.setJobHistoryPath('/path/to/job/history')
                transformByQState.setProjectName('test-project')
                sessionJobHistory[jobId] = {
                    startTime: '07/15/25, 10:00 AM',
                    projectName: 'test-project',
                    status: 'COMPLETED',
                    duration: '4 min',
                }

                fsExistsStub.returns(false) // Assuming history file doesn't exist yet
                const updateContentStub = sinon.stub(transformationHub, 'updateContent').resolves()
                sinon.stub(transformApiHandler, 'updateJobHistory')
                sinon.stub(vscode.commands, 'executeCommand').resolves()

                await postTransformationJob()

                sinon.assert.calledWith(
                    fsWriteStub.firstCall,
                    sinon.match(/transformation-history\.tsv$/),
                    'date\tproject_name\tstatus\tduration\tdiff_patch\tsummary\tjob_id\n'
                )

                sinon.assert.calledWith(
                    fsWriteStub.secondCall,
                    sinon.match(/transformation-history\.tsv$/),
                    sinon.match(/test-project.*COMPLETED.*4 min.*diff\.patch.*summary\.md.*completed-job-123/),
                    { flag: 'a' }
                )

                sinon.assert.calledWith(updateContentStub, 'job history', undefined, true)
            })
        })
    })

    describe('Refresh button logic', function () {
        it('Cannot click refresh button when a job is running', function () {
            const mockHistory: HistoryObject[] = [
                {
                    startTime: '07/14/25, 09:00 AM',
                    projectName: 'old-project',
                    status: 'COMPLETED',
                    duration: '3 min',
                    diffPath: '/path/to/diff.patch',
                    summaryPath: '/path/to/summary.md',
                    jobId: 'old-job-456',
                },
                {
                    startTime: '07/14/25, 10:00 AM',
                    projectName: 'incomplete-project',
                    status: 'FAILED',
                    duration: '3 min',
                    diffPath: '',
                    summaryPath: '',
                    jobId: 'inc-100',
                },
            ]
            transformationHub['transformationHistory'] = mockHistory

            sinon.stub(transformByQState, 'isRunning').returns(true)
            sinon.stub(transformByQState, 'getJobId').returns('running-job-123')
            sessionJobHistory['running-job-123'] = {
                startTime: '07/14/25, 11:00 AM',
                projectName: 'running-project',
                status: 'TRANSFORMING',
                duration: '2 min',
            }

            const result = transformationHub['showJobHistory']()

            const runningJobButtonRegex = new RegExp(`row-id="running-job-123"[^>]*disabled`, 'i')
            const incompleteJobButtonRegex = new RegExp(`row-id="inc-100"[^>]*disabled`, 'i')
            const completedJobButtonRegex = new RegExp(`row-id="old-job-456"[^>]*disabled`, 'i')
            assert(
                runningJobButtonRegex.test(result) && incompleteJobButtonRegex && completedJobButtonRegex.test(result),
                "All jobs' refresh buttons should be disabled"
            )
        })

        it('Cannot click refresh button of STOPPED jobs', function () {
            const mockHistory: HistoryObject[] = [
                {
                    startTime: '07/14/25, 09:00 AM',
                    projectName: 'old-project',
                    status: 'COMPLETED',
                    duration: '3 min',
                    diffPath: '/path/to/diff.patch',
                    summaryPath: '/path/to/summary.md',
                    jobId: 'old-job-456',
                },
                {
                    startTime: '07/14/25, 10:00 AM',
                    projectName: 'cancelled-project',
                    status: 'STOPPED',
                    duration: '3 min',
                    diffPath: '',
                    summaryPath: '',
                    jobId: 'stop-200',
                },
            ]
            transformationHub['transformationHistory'] = mockHistory

            sinon.stub(transformByQState, 'isRunning').returns(false)

            const result = transformationHub['showJobHistory']()

            const runningJobButtonRegex = new RegExp(`row-id="stop-200"[^>]*disabled`, 'i')
            assert(runningJobButtonRegex.test(result), "STOPPED job's refresh button should be disabled")
        })

        it('Cannot click refresh button of jobs that failed on backend', function () {
            const mockHistory: HistoryObject[] = [
                {
                    startTime: '07/14/25, 09:00 AM',
                    projectName: 'old-project',
                    status: 'FAILED',
                    duration: '3 min',
                    diffPath: '/path/to/diff.patch',
                    summaryPath: '/path/to/summary.md',
                    jobId: 'old-job-456',
                },
                {
                    startTime: '07/14/25, 10:00 AM',
                    projectName: 'failed-project',
                    status: 'FAILED_BE',
                    duration: '3 min',
                    diffPath: '',
                    summaryPath: '',
                    jobId: 'fail-100',
                },
            ]
            transformationHub['transformationHistory'] = mockHistory

            sinon.stub(transformByQState, 'isRunning').returns(false)

            const result = transformationHub['showJobHistory']()

            const runningJobButtonRegex = new RegExp(`row-id="fail-100"[^>]*disabled`, 'i')
            assert(runningJobButtonRegex.test(result), "FAILED_BE job's refresh button should be disabled")
            const completedJobButtonRegex = new RegExp(`row-id="old-job-456"[^>]*disabled`, 'i')
            assert(!completedJobButtonRegex.test(result), "Incomplete (FAILED) job's refresh button should be enabled")
        })
    })

    describe('Refreshing jobs', function () {
        describe('Updating status', function () {
            let codeWhispererClientStub: sinon.SinonStub

            beforeEach(function () {
                codeWhispererClientStub = sinon.stub(codeWhispererClient, 'codeModernizerGetCodeTransformation')
            })

            it('Does not fetch status for already completed jobs', async function () {
                sinon.stub(transformationHub as any, 'retrieveArtifacts').resolves('')
                sinon.stub(transformationHub as any, 'updateHistoryFile').resolves()

                await transformationHub['refreshJob']('job-123', 'COMPLETED', 'test-project')
                sinon.assert.notCalled(codeWhispererClientStub)

                await transformationHub['refreshJob']('job-456', 'PARTIALLY_COMPLETED', 'test-project2')
                sinon.assert.notCalled(codeWhispererClientStub)
            })

            it('Fetches updated status', async function () {
                const mockResponse = {
                    transformationJob: {
                        status: 'COMPLETED',
                        endExecutionTime: new Date(),
                        creationTime: new Date(Date.now() - 60000), // 1 minute ago
                    },
                }
                codeWhispererClientStub.resolves(mockResponse)
                sinon.stub(transformationHub as any, 'retrieveArtifacts').resolves('')
                sinon.stub(transformationHub as any, 'updateHistoryFile').resolves()

                await transformationHub['refreshJob']('job-123', 'FAILED', 'test-project')
                sinon.assert.calledOnce(codeWhispererClientStub)
            })
        })

        describe('Downloading artifacts', function () {
            it('Does not download artifacts when diff patch already exists', async function () {
                const fsExistsStub = sinon.stub(fs, 'existsSync').returns(true)
                const jobHistoryPath = await transformationHub['retrieveArtifacts']('job-123', 'test-project')

                sinon.assert.called(fsExistsStub)
                assert.strictEqual(jobHistoryPath, '', 'Should return empty string when diff already exists')
            })

            it('Does not call attempt to download artifacts for FAILED/STOPPED jobs', async function () {
                const mockResponse = {
                    transformationJob: {
                        status: 'STOPPED',
                        endExecutionTime: new Date(),
                        creationTime: new Date(Date.now() - 60000),
                    },
                } as any
                const codeWhispererClientStub = sinon
                    .stub(codeWhispererClient, 'codeModernizerGetCodeTransformation')
                    .resolves(mockResponse)
                const retrieveArtifactsStub = sinon.stub(transformationHub as any, 'retrieveArtifacts')
                sinon.stub(transformationHub as any, 'updateHistoryFile').resolves()

                await transformationHub['refreshJob']('job-123', 'FAILED', 'test-project')

                sinon.assert.calledOnce(codeWhispererClientStub)
                sinon.assert.notCalled(retrieveArtifactsStub)
            })
        })

        describe('Updating history file', function () {
            let fsWriteStub: sinon.SinonStub
            let fsReadStub: sinon.SinonStub
            let fsExistsStub: sinon.SinonStub

            beforeEach(function () {
                fsWriteStub = sinon.stub(fs, 'writeFileSync')
                fsReadStub = sinon.stub(fs, 'readFileSync')
                fsExistsStub = sinon.stub(fs, 'existsSync')
            })

            it('Updates existing job entry in history file', async function () {
                const mockHistoryContent =
                    'date\tproject_name\tstatus\tduration\tdiff_patch\tsummary\tjob_id\n' +
                    '07/14/25, 09:00 AM\ttest-project\tFAILED\t5 min\t\t\tjob-123\n' +
                    '07/14/25, 10:00 AM\tother-project\tCOMPLETED\t3 min\t/path/diff.patch\t/path/summary.md\tjob-456\n'

                fsExistsStub.returns(true)
                fsReadStub.returns(mockHistoryContent)

                const mockResponse = {
                    transformationJob: {
                        status: 'STOPPED',
                        endExecutionTime: new Date(),
                        creationTime: new Date(Date.now() - 300000),
                    },
                } as any

                const codeWhispererClientStub = sinon
                    .stub(codeWhispererClient, 'codeModernizerGetCodeTransformation')
                    .resolves(mockResponse)
                const retrieveArtifactsStub = sinon.stub(transformationHub as any, 'retrieveArtifacts').resolves('')

                await transformationHub['refreshJob']('job-123', 'FAILED', 'test-project')

                sinon.assert.calledTwice(fsWriteStub)
                const writtenContent = fsWriteStub.args[1][1]
                const updatedJobLine = writtenContent.split('\n').find((line: string) => line.includes('job-123'))
                assert(updatedJobLine.includes('STOPPED'), 'Status should be updated to STOPPED')
                assert(updatedJobLine.includes('5 min'), 'Duration should remain 5 min')
                const unchangedJobLine = writtenContent.split('\n').find((line: string) => line.includes('job-456'))
                assert(unchangedJobLine)
                sinon.assert.calledOnce(codeWhispererClientStub)
                sinon.assert.notCalled(retrieveArtifactsStub)
            })

            it('Updates history file when job FAILED on backend', async function () {
                const mockHistoryContent =
                    'date\tproject_name\tstatus\tduration\tdiff_patch\tsummary\tjob_id\n' +
                    '07/14/25, 09:00 AM\ttest-project\tFAILED\t5 min\t\t\tjob-123\n' +
                    '07/14/25, 10:00 AM\tother-project\tCOMPLETED\t3 min\t/path/diff.patch\t/path/summary.md\tjob-456\n'

                fsExistsStub.returns(true)
                fsReadStub.returns(mockHistoryContent)

                const mockResponse = {
                    transformationJob: {
                        status: 'FAILED',
                        endExecutionTime: new Date(),
                        creationTime: new Date(Date.now() - 300000),
                    },
                } as any

                const codeWhispererClientStub = sinon
                    .stub(codeWhispererClient, 'codeModernizerGetCodeTransformation')
                    .resolves(mockResponse)
                const retrieveArtifactsStub = sinon.stub(transformationHub as any, 'retrieveArtifacts').resolves('')

                await transformationHub['refreshJob']('job-123', 'FAILED', 'test-project')

                sinon.assert.calledTwice(fsWriteStub)
                const writtenContent = fsWriteStub.args[1][1]
                const updatedJobLine = writtenContent.split('\n').find((line: string) => line.includes('job-123'))
                assert(updatedJobLine.includes('FAILED_BE'), 'Status should be updated to FAILED_BE')
                assert(updatedJobLine.includes('5 min'), 'Duration should remain 5 min')
                sinon.assert.calledOnce(codeWhispererClientStub)
                sinon.assert.notCalled(retrieveArtifactsStub)
            })

            it('Does not update history file when no changes are needed', async function () {
                const mockResponse = {
                    transformationJob: {
                        status: 'COMPLETED',
                        endExecutionTime: new Date(),
                        creationTime: new Date(Date.now() - 60000),
                    },
                } as any

                const codeWhispererClientStub = sinon
                    .stub(codeWhispererClient, 'codeModernizerGetCodeTransformation')
                    .resolves(mockResponse)
                sinon.stub(transformationHub as any, 'retrieveArtifacts').resolves('')
                const updateHistoryFileStub = sinon.stub(transformationHub as any, 'updateHistoryFile').resolves()

                await transformationHub['refreshJob']('job-123', 'COMPLETED', 'test-project')

                sinon.assert.notCalled(codeWhispererClientStub)
                sinon.assert.notCalled(updateHistoryFileStub)
            })

            it('Updates content in the UI after updating history file', async function () {
                const mockHistoryContent =
                    'date\tproject_name\tstatus\tduration\tdiff_patch\tsummary\tjob_id\n' +
                    '07/14/25, 09:00 AM\ttest-project\tPLANNING\t2 min\t\t\tjob-123\n'

                fsExistsStub.returns(true)
                fsReadStub.returns(mockHistoryContent)

                const updateContentStub = sinon.stub(transformationHub, 'updateContent').resolves()
                await transformationHub['updateHistoryFile']('COMPLETED', '5 min', '/new/path', 'job-123')
                sinon.assert.calledWith(updateContentStub, 'job history', undefined, true)
            })
        })
    })
})

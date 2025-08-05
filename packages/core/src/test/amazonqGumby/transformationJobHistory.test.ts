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
import fs from '../../shared/fs/fs'
import nodeFs from 'fs' // eslint-disable-line no-restricted-imports
import { postTransformationJob } from '../../codewhisperer/commands/startTransformByQ'
import * as transformApiHandler from '../../codewhisperer/service/transformByQ/transformApiHandler'
import * as vscode from 'vscode'

describe('Transformation Job History', function () {
    let transformationHub: TransformationHubViewProvider

    // Mock job objects
    const mockJobs = {
        completed: {
            startTime: '07/14/25, 09:00 AM',
            projectName: 'old-project',
            status: 'COMPLETED',
            duration: '3 min',
            diffPath: '/path/to/diff.patch',
            summaryPath: '/path/to/summary.md',
            jobId: 'old-job-456',
        } as CodeWhispererConstants.HistoryObject,

        transforming: {
            startTime: '07/14/25, 10:00 AM',
            projectName: 'incomplete-project',
            status: 'TRANSFORMING',
            duration: '3 min',
            diffPath: '',
            summaryPath: '',
            jobId: 'inc-100',
        } as CodeWhispererConstants.HistoryObject,

        failed: {
            startTime: '07/14/25, 09:00 AM',
            projectName: 'old-project',
            status: 'FAILED',
            duration: '3 min',
            diffPath: '',
            summaryPath: '',
            jobId: 'fail-100',
        } as CodeWhispererConstants.HistoryObject,

        failedBE: {
            startTime: '07/10/25, 10:00 AM',
            projectName: 'failed-project',
            status: 'FAILED_BE',
            duration: '3 min',
            diffPath: '',
            summaryPath: '',
            jobId: 'failbe-300',
        } as CodeWhispererConstants.HistoryObject,

        stopped: {
            startTime: '07/14/25, 10:00 AM',
            projectName: 'cancelled-project',
            status: 'STOPPED',
            duration: '3 min',
            diffPath: '',
            summaryPath: '',
            jobId: 'stop-200',
        } as CodeWhispererConstants.HistoryObject,
    }

    // setup function helpers
    function setupRunningJob(jobId = 'running-job-123') {
        sinon.stub(transformByQState, 'isRunning').returns(true)
        sinon.stub(transformByQState, 'getJobId').returns(jobId)
        sessionJobHistory[jobId] = {
            startTime: '07/14/25, 11:00 AM',
            projectName: 'running-project',
            status: 'TRANSFORMING',
            duration: '2 min',
        }
        return jobId
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
            transformationHub['transformationHistory'] = [mockJobs.completed, mockJobs.transforming, mockJobs.failedBE]
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
            transformationHub['transformationHistory'] = [mockJobs.completed]
            const runningJobId = setupRunningJob()

            const result = transformationHub['showJobHistory']()

            const runningIndex = result.indexOf('running-project')
            const oldIndex = result.indexOf('old-project')
            assert(runningIndex < oldIndex, 'Running job should appear before completed jobs')
            assert(result.includes(`row-id="${runningJobId}"`))
            assert(result.includes('old-job-456'))
        })
    })

    describe('Job history file operations', function () {
        let fsExistsStub: sinon.SinonStub
        let fsReadStub: sinon.SinonStub
        let nodeFsWriteStub: sinon.SinonStub

        beforeEach(function () {
            fsExistsStub = sinon.stub(fs, 'existsFile')
            fsReadStub = sinon.stub(fs, 'readFileText')
        })

        describe('Reading history file', function () {
            it('Returns empty array when history file does not exist', async function () {
                fsExistsStub.resolves(false)

                const result = (transformationHub['transformationHistory'] = await readHistoryFile())

                assert.strictEqual(result.length, 0, 'Should return empty array when file does not exist')
                sinon.assert.calledOnce(fsExistsStub)
                sinon.assert.notCalled(fsReadStub)
            })

            it('Only includes jobs within 30 days', async function () {
                fsExistsStub.resolves(true)

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

                fsReadStub.resolves(mockHistoryContent)

                const result = await readHistoryFile()
                assert.strictEqual(result.length, 1, 'Should only include jobs within 30 days')
                assert.strictEqual(result[0].projectName, 'recent-project')
            })

            it('Limits history to 10 most recent jobs', async function () {
                fsExistsStub.resolves(true)

                // Create 15 job entries
                let mockHistoryContent = 'date\tproject_name\tstatus\tduration\tdiff_patch\tsummary\tjob_id\n'
                for (let i = 1; i <= 15; i++) {
                    mockHistoryContent += `07/${i}/25, 09:00 AM\tproject-${i}\tCOMPLETED\t3 min\t/path/diff.patch\t/path/summary.md\tjob-${i}\n`
                }

                fsReadStub.resolves(mockHistoryContent)

                const result = await readHistoryFile()

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

                nodeFsWriteStub = sinon.stub(nodeFs, 'writeFileSync')
                sinon.stub(nodeFs, 'existsSync').returns(false) // Assuming history file doesn't exist yet
                const executeCommandStub = sinon.stub(vscode.commands, 'executeCommand').resolves()
                sinon.stub(transformApiHandler, 'updateJobHistory')

                await postTransformationJob()

                sinon.assert.calledWith(
                    nodeFsWriteStub.firstCall,
                    sinon.match(/transformation_history\.tsv$/),
                    'date\tproject_name\tstatus\tduration\tdiff_patch\tsummary\tjob_id\n'
                )

                sinon.assert.calledWith(
                    nodeFsWriteStub.secondCall,
                    sinon.match(/transformation_history\.tsv$/),
                    sinon.match(/test-project.*COMPLETED.*4 min.*diff\.patch.*summary\.md.*completed-job-123/),
                    { flag: 'a' }
                )

                sinon.assert.calledWith(
                    executeCommandStub,
                    'aws.amazonq.transformationHub.updateContent',
                    'job history',
                    undefined,
                    true
                )
            })
        })
    })

    describe('Refresh button logic', function () {
        it('Cannot click refresh button when a job is running', function () {
            transformationHub['transformationHistory'] = [mockJobs.completed, mockJobs.failed]
            const runningJobId = setupRunningJob()

            const result = transformationHub['showJobHistory']()

            const runningJobButtonRegex = new RegExp(`row-id="${runningJobId}"[^>]*disabled`, 'i')
            const incompleteJobButtonRegex = new RegExp(`row-id="fail-100"[^>]*disabled`, 'i')
            const completedJobButtonRegex = new RegExp(`row-id="old-job-456"[^>]*disabled`, 'i')
            assert(
                runningJobButtonRegex.test(result) &&
                    incompleteJobButtonRegex.test(result) &&
                    completedJobButtonRegex.test(result),
                "All jobs' refresh buttons should be disabled"
            )
        })

        it('Cannot click refresh button of STOPPED jobs', function () {
            transformationHub['transformationHistory'] = [mockJobs.completed, mockJobs.stopped]

            sinon.stub(transformByQState, 'isRunning').returns(false)

            const result = transformationHub['showJobHistory']()

            const runningJobButtonRegex = new RegExp(`row-id="stop-200"[^>]*disabled`, 'i')
            assert(runningJobButtonRegex.test(result), "STOPPED job's refresh button should be disabled")
        })

        it('Cannot click refresh button of jobs that failed on backend', function () {
            transformationHub['transformationHistory'] = [mockJobs.failed, mockJobs.failedBE]

            sinon.stub(transformByQState, 'isRunning').returns(false)

            const result = transformationHub['showJobHistory']()

            const runningJobButtonRegex = new RegExp(`row-id="failbe-300"[^>]*disabled`, 'i')
            assert(runningJobButtonRegex.test(result), "FAILED_BE job's refresh button should be disabled")
            const completedJobButtonRegex = new RegExp(`row-id="fail-100"[^>]*disabled`, 'i')
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
                sinon.stub(transformationHub as any, 'retrieveArtifacts').resolves('') // TODO: refactor TransformationHubViewProvider and extract private methods
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
                const fsExistsStub = sinon.stub(fs, 'existsFile').resolves(true)
                const jobHistoryPath = await transformationHub['retrieveArtifacts']('job-123', 'test-project')

                sinon.assert.called(fsExistsStub)
                assert.strictEqual(jobHistoryPath, '', 'Should return empty string when diff already exists')
            })

            it('Does not attempt to download artifacts for FAILED/STOPPED jobs', async function () {
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
            let fsAppendStub: sinon.SinonStub

            // mocks and setup
            const mockHistoryContent =
                'date\tproject_name\tstatus\tduration\tdiff_patch\tsummary\tjob_id\n' +
                '07/14/25, 09:00 AM\ttest-project\tFAILED\t5 min\t\t\tjob-123\n' +
                '07/14/25, 10:00 AM\tother-project\tCOMPLETED\t3 min\t/path/diff.patch\t/path/summary.md\tjob-456\n'

            function createMockTransformationResponse(status: string, timeOffset = 300000) {
                return {
                    transformationJob: {
                        status,
                        endExecutionTime: new Date(),
                        creationTime: new Date(Date.now() - timeOffset),
                    },
                } as any
            }

            function setupRefreshJobTest(mockResponse: any) {
                const codeWhispererClientStub = sinon
                    .stub(codeWhispererClient, 'codeModernizerGetCodeTransformation')
                    .resolves(mockResponse)
                const retrieveArtifactsStub = sinon.stub(transformationHub as any, 'retrieveArtifacts').resolves('')

                return { codeWhispererClientStub, retrieveArtifactsStub }
            }

            beforeEach(function () {
                fsWriteStub = sinon.stub(fs, 'writeFile').resolves()
                fsAppendStub = sinon.stub(fs, 'appendFile').resolves()
                sinon.stub(fs, 'readFileText').resolves(mockHistoryContent)
                sinon.stub(fs, 'existsFile').resolves(true)
            })

            it('Updates existing job entry in history file', async function () {
                const mockResponse = createMockTransformationResponse('STOPPED')
                const { codeWhispererClientStub, retrieveArtifactsStub } = setupRefreshJobTest(mockResponse)

                await transformationHub['refreshJob']('job-123', 'FAILED', 'test-project')

                sinon.assert.called(fsAppendStub)
                const writtenContent = fsAppendStub.args[0][1]
                const updatedJobLine = writtenContent.split('\n').find((line: string) => line.includes('job-123'))
                assert(updatedJobLine.includes('STOPPED'), 'Status should be updated to STOPPED')
                assert(updatedJobLine.includes('5 min'), 'Duration should remain 5 min')
                const unchangedJobLine = writtenContent.split('\n').find((line: string) => line.includes('job-456'))
                assert(unchangedJobLine)
                sinon.assert.calledOnce(codeWhispererClientStub)
                sinon.assert.notCalled(retrieveArtifactsStub)
            })

            it('Updates history file when job FAILED on backend', async function () {
                const mockResponse = createMockTransformationResponse('FAILED')
                const { codeWhispererClientStub, retrieveArtifactsStub } = setupRefreshJobTest(mockResponse)

                await transformationHub['refreshJob']('job-123', 'FAILED', 'test-project')

                sinon.assert.called(fsWriteStub)
                sinon.assert.called(fsAppendStub)
                const writtenContent = fsAppendStub.args[0][1]
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
                const updateContentStub = sinon.stub(transformationHub, 'updateContent').resolves()
                await transformationHub['updateHistoryFile']('COMPLETED', '5 min', '/new/path', 'job-123')
                sinon.assert.calledWith(updateContentStub, 'job history', undefined, true)
            })
        })
    })
})

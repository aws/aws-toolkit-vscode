/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as vscode from 'vscode'
import * as fs from 'fs-extra'
import * as sinon from 'sinon'
import { makeTemporaryToolkitFolder } from '../../../shared/filesystemUtilities'
import * as model from '../../../codewhisperer/models/model'
import * as startTransformByQ from '../../../codewhisperer/commands/startTransformByQ'
import { HttpResponse } from 'aws-sdk'
import * as codeWhisperer from '../../../codewhisperer/client/codewhisperer'
import * as CodeWhispererConstants from '../../../codewhisperer/models/constants'
import { convertToTimeString, convertDateToTimestamp } from '../../../shared/utilities/textUtilities'
import path from 'path'
import AdmZip from 'adm-zip'
import { createTestWorkspaceFolder, toFile } from '../../testUtil'
import {
    NoJavaProjectsFoundError,
    NoMavenJavaProjectsFoundError,
    NoOpenProjectsError,
} from '../../../amazonqGumby/errors'
import {
    stopJob,
    pollTransformationJob,
    getHeadersObj,
    throwIfCancelled,
    zipCode,
} from '../../../codewhisperer/service/transformByQ/transformApiHandler'
import {
    validateOpenProjects,
    getOpenProjects,
} from '../../../codewhisperer/service/transformByQ/transformProjectValidationHandler'
import { TransformationCandidateProject } from '../../../codewhisperer/models/model'
import { TransformationHubViewProvider } from '../../../codewhisperer/service/transformByQ/transformationHubViewProvider'
import { getPlanProgress } from '../../../codewhisperer/commands/startTransformByQ'

describe('transformByQ', function () {
    let tempDir: string

    beforeEach(async function () {
        tempDir = await makeTemporaryToolkitFolder()
    })

    afterEach(async function () {
        sinon.restore()
        await fs.remove(tempDir)
    })

    it('WHEN converting short duration in milliseconds THEN converts correctly', async function () {
        const durationTimeString = convertToTimeString(10 * 1000)
        assert.strictEqual(durationTimeString, '10 sec')
    })

    it('WHEN converting medium duration in milliseconds THEN converts correctly', async function () {
        const durationTimeString = convertToTimeString(65 * 1000)
        assert.strictEqual(durationTimeString, '1 min 5 sec')
    })

    it('WHEN converting long duration in milliseconds THEN converts correctly', async function () {
        const durationTimeString = convertToTimeString(3700 * 1000)
        assert.strictEqual(durationTimeString, '1 hr 1 min 40 sec')
    })

    it('WHEN converting date object to timestamp THEN converts correctly', async function () {
        const date = new Date(2023, 0, 1, 0, 0, 0, 0)
        const timestamp = convertDateToTimestamp(date)
        assert.strictEqual(timestamp, '01/01/23, 12:00 AM')
    })

    it('WHEN job status is cancelled THEN error is thrown', async function () {
        model.transformByQState.setToCancelled()
        assert.throws(() => {
            throwIfCancelled()
        }, new model.TransformByQStoppedError())
    })

    it('WHEN job is stopped THEN status is updated to cancelled', async function () {
        model.transformByQState.setToRunning()
        await startTransformByQ.stopTransformByQ('abc-123')
        assert.strictEqual(model.transformByQState.getStatus(), 'Cancelled')
    })

    it('WHEN validateProjectSelection called on non-Java project THEN throws error', async function () {
        const dummyCandidateProjects: TransformationCandidateProject[] = [
            {
                name: 'SampleProject',
                path: '/dummy/path/here',
            },
        ]
        await assert.rejects(async () => {
            await validateOpenProjects(dummyCandidateProjects)
        }, NoJavaProjectsFoundError)
    })

    it('WHEN validateProjectSelection called on Java project with no pom.xml THEN throws error', async function () {
        const folder = await createTestWorkspaceFolder()
        const dummyPath = path.join(folder.uri.fsPath, 'DummyFile.java')
        await toFile('', dummyPath)
        const findFilesStub = sinon.stub(vscode.workspace, 'findFiles')
        findFilesStub.onFirstCall().resolves([folder.uri])
        const dummyCandidateProjects: TransformationCandidateProject[] = [
            {
                name: 'SampleProject',
                path: folder.uri.fsPath,
            },
        ]

        await assert.rejects(async () => {
            await validateOpenProjects(dummyCandidateProjects)
        }, NoMavenJavaProjectsFoundError)
    })

    it('WHEN getOpenProjects called on non-empty workspace THEN returns open projects', async function () {
        sinon
            .stub(vscode.workspace, 'workspaceFolders')
            .get(() => [{ uri: vscode.Uri.file('/user/test/project/'), name: 'TestProject', index: 0 }])

        const openProjects = await getOpenProjects()
        assert.strictEqual(openProjects[0].name, 'TestProject')
    })

    it('WHEN getOpenProjects called on empty workspace THEN throws error', async function () {
        sinon.stub(vscode.workspace, 'workspaceFolders').get(() => undefined)

        await assert.rejects(async () => {
            await getOpenProjects()
        }, NoOpenProjectsError)
    })

    it('WHEN stop job called with valid jobId THEN stop API called', async function () {
        const stopJobStub = sinon.stub(codeWhisperer.codeWhispererClient, 'codeModernizerStopCodeTransformation')
        await stopJob('dummyId')
        sinon.assert.calledWithExactly(stopJobStub, { transformationJobId: 'dummyId' })
    })

    it('WHEN stop job that has not been started THEN stop API not called', async function () {
        const stopJobStub = sinon.stub(codeWhisperer.codeWhispererClient, 'codeModernizerStopCodeTransformation')
        await stopJob('')
        sinon.assert.notCalled(stopJobStub)
    })

    it('WHEN polling completed job THEN returns status as completed', async function () {
        const mockJobResponse = {
            $response: {
                data: {
                    transformationJob: { status: 'COMPLETED' },
                },
                requestId: 'requestId',
                hasNextPage: () => false,
                error: undefined,
                nextPage: () => undefined,
                redirectCount: 0,
                retryCount: 0,
                httpResponse: new HttpResponse(),
            },
            transformationJob: { status: 'COMPLETED' },
        }
        sinon.stub(codeWhisperer.codeWhispererClient, 'codeModernizerGetCodeTransformation').resolves(mockJobResponse)
        model.transformByQState.setToSucceeded()
        const status = await pollTransformationJob('dummyId', CodeWhispererConstants.validStatesForCheckingDownloadUrl)
        assert.strictEqual(status, 'COMPLETED')
    })

    it(`WHEN process history called THEN returns details of last run job`, async function () {
        const actual = startTransformByQ.processHistory(
            [],
            '01/01/23, 12:00 AM',
            'my-module',
            'Succeeded',
            '20 sec',
            '123'
        )
        const expected = [
            {
                timestamp: '01/01/23, 12:00 AM',
                module: 'my-module',
                status: 'Succeeded',
                duration: '20 sec',
                id: '123',
            },
        ]
        assert.deepStrictEqual(actual, expected)
    })

    it(`WHEN get headers for upload artifact to S3 THEN returns correct header with kms key arn`, function () {
        const actual = getHeadersObj('dummy-sha-256', 'dummy-kms-key-arn')
        const expected = {
            'x-amz-checksum-sha256': 'dummy-sha-256',
            'Content-Type': 'application/zip',
            'x-amz-server-side-encryption': 'aws:kms',
            'x-amz-server-side-encryption-aws-kms-key-id': 'dummy-kms-key-arn',
        }
        assert.deepStrictEqual(actual, expected)
    })

    it(`WHEN get headers for upload artifact to S3 THEN returns correct headers without kms key arn`, function () {
        const actual = getHeadersObj('dummy-sha-256', '')
        const expected = {
            'x-amz-checksum-sha256': 'dummy-sha-256',
            'Content-Type': 'application/zip',
        }
        assert.deepStrictEqual(actual, expected)
    })

    it(`WHEN zip created THEN dependencies contains no .sha1 or .repositories files`, async function () {
        const m2Folders = [
            'com/groupid1/artifactid1/version1',
            'com/groupid1/artifactid1/version2',
            'com/groupid1/artifactid2/version1',
            'com/groupid2/artifactid1/version1',
            'com/groupid2/artifactid1/version2',
        ]
        // List of files that exist in m2 artifact directory
        const filesToAdd = [
            '_remote.repositories',
            'test-0.0.1-20240315.145420-18.pom',
            'test-0.0.1-20240315.145420-18.pom.sha1',
            'test-0.0.1-SNAPSHOT.pom',
            'maven-metadata-test-repo.xml',
            'maven-metadata-test-repo.xml.sha1',
            'resolver-status.properties',
        ]
        const expectedFilesAfterClean = [
            'test-0.0.1-20240315.145420-18.pom',
            'test-0.0.1-SNAPSHOT.pom',
            'maven-metadata-test-repo.xml',
            'resolver-status.properties',
        ]

        m2Folders.forEach(folder => {
            const folderPath = path.join(tempDir, folder)
            fs.mkdirSync(folderPath, { recursive: true })
            filesToAdd.forEach(file => {
                fs.writeFileSync(path.join(folderPath, file), 'sample content for the test file')
            })
        })

        const tempFileName = `testfile-${Date.now()}.zip`
        model.transformByQState.setProjectPath(tempDir)
        return zipCode({
            path: tempDir,
            name: tempFileName,
        }).then(zipFile => {
            const zip = new AdmZip(zipFile)
            const dependenciesToUpload = zip.getEntries().filter(entry => entry.entryName.startsWith('dependencies'))
            // Each dependency version folder contains each expected file, thus we multiply
            const expectedNumberOfDependencyFiles = m2Folders.length * expectedFilesAfterClean.length
            assert.strictEqual(expectedNumberOfDependencyFiles, dependenciesToUpload.length)
            dependenciesToUpload.forEach(dependency => {
                assert(expectedFilesAfterClean.includes(dependency.name))
            })
        })
    })
    it.only(`Test split panel UI animated`, async function () {
        const hub = new TransformationHubViewProvider()
        const progress = getPlanProgress()
        const sequence = [
            {
                polledJobStatus: 'ACCEPTED',
                steps: [],
            },
            {
                polledJobStatus: 'ACCEPTED',
                steps: [],
            },
            {
                polledJobStatus: 'PREPARING',
                steps: [],
            },
            {
                polledJobStatus: 'PREPARING',
                steps: [],
            },
            {
                polledJobStatus: 'PLANNING',
                steps: [],
            },
            {
                polledJobStatus: 'PLANNING',
                steps: [],
            },
            {
                polledJobStatus: 'TRANSFORMING',
                steps: [],
            },
            {
                polledJobStatus: 'TRANSFORMING',
                steps: [],
            },
            {
                polledJobStatus: 'TRANSFORMING',
                steps: [
                    {
                        description:
                            'Q will update mandatory package dependencies and frameworks. Also, where required for compatability with Java 17, it will replace deprecated code with working code.',
                        name: 'Step 1 - Update dependencies and code',
                        status: 'CREATED',
                        progressUpdates: [
                            {
                                description: 'Migration step started',
                                name: 'Applying dependencies and code changes',
                                status: 'IN_PROGRESS',
                                startTime: '2024-04-22T11:00:16.192Z',
                            },
                        ],
                        startTime: '2024-04-22T11:00:15.999Z',
                    },
                    {
                        description:
                            'Q will build the upgraded code in Java 17 and iteratively fix any build errors encountered.',
                        name: 'Step 2 - Build in Java 17 and fix any issues',
                        status: 'CREATED',
                        progressUpdates: [],
                    },
                    {
                        description:
                            'Q will generate code changes for you to review and accept. It will also summarize the changes made, and will copy over build logs for future reference and troubleshooting.',
                        name: 'Step 3 - Finalize code changes and generate transformation summary',
                        status: 'CREATED',
                        progressUpdates: [],
                    },
                ],
            },
            {
                polledJobStatus: 'TRANSFORMING',
                steps: [
                    {
                        description:
                            'Q will update mandatory package dependencies and frameworks. Also, where required for compatability with Java 17, it will replace deprecated code with working code.',
                        name: 'Step 1 - Update dependencies and code',
                        status: 'CREATED',
                        progressUpdates: [
                            {
                                description: 'Migration step started',
                                name: 'Applying dependencies and code changes',
                                status: 'IN_PROGRESS',
                                startTime: '2024-04-22T11:00:16.192Z',
                            },
                        ],
                        startTime: '2024-04-22T11:00:15.999Z',
                    },
                    {
                        description:
                            'Q will build the upgraded code in Java 17 and iteratively fix any build errors encountered.',
                        name: 'Step 2 - Build in Java 17 and fix any issues',
                        status: 'CREATED',
                        progressUpdates: [],
                    },
                    {
                        description:
                            'Q will generate code changes for you to review and accept. It will also summarize the changes made, and will copy over build logs for future reference and troubleshooting.',
                        name: 'Step 3 - Finalize code changes and generate transformation summary',
                        status: 'CREATED',
                        progressUpdates: [],
                    },
                ],
            },
            {
                polledJobStatus: 'TRANSFORMING',
                steps: [
                    {
                        description:
                            'Q will update mandatory package dependencies and frameworks. Also, where required for compatability with Java 17, it will replace deprecated code with working code.',
                        name: 'Step 1 - Update dependencies and code',
                        status: 'CREATED',
                        progressUpdates: [
                            {
                                description: 'Migration step started',
                                name: 'Applying dependencies and code changes',
                                status: 'IN_PROGRESS',
                                startTime: '2024-04-22T11:00:16.192Z',
                            },
                        ],
                        startTime: '2024-04-22T11:00:15.999Z',
                    },
                    {
                        description:
                            'Q will build the upgraded code in Java 17 and iteratively fix any build errors encountered.',
                        name: 'Step 2 - Build in Java 17 and fix any issues',
                        status: 'CREATED',
                        progressUpdates: [],
                    },
                    {
                        description:
                            'Q will generate code changes for you to review and accept. It will also summarize the changes made, and will copy over build logs for future reference and troubleshooting.',
                        name: 'Step 3 - Finalize code changes and generate transformation summary',
                        status: 'CREATED',
                        progressUpdates: [],
                    },
                ],
            },
            {
                polledJobStatus: 'TRANSFORMING',
                steps: [
                    {
                        description:
                            'Q will update mandatory package dependencies and frameworks. Also, where required for compatability with Java 17, it will replace deprecated code with working code.',
                        name: 'Step 1 - Update dependencies and code',
                        status: 'CREATED',
                        progressUpdates: [
                            {
                                description: 'Migration step started',
                                name: 'Applying dependencies and code changes',
                                status: 'IN_PROGRESS',
                                startTime: '2024-04-22T11:00:16.192Z',
                            },
                        ],
                        startTime: '2024-04-22T11:00:15.999Z',
                    },
                    {
                        description:
                            'Q will build the upgraded code in Java 17 and iteratively fix any build errors encountered.',
                        name: 'Step 2 - Build in Java 17 and fix any issues',
                        status: 'CREATED',
                        progressUpdates: [],
                    },
                    {
                        description:
                            'Q will generate code changes for you to review and accept. It will also summarize the changes made, and will copy over build logs for future reference and troubleshooting.',
                        name: 'Step 3 - Finalize code changes and generate transformation summary',
                        status: 'CREATED',
                        progressUpdates: [],
                    },
                ],
            },
            {
                polledJobStatus: 'TRANSFORMING',
                steps: [
                    {
                        description:
                            'Q will update mandatory package dependencies and frameworks. Also, where required for compatability with Java 17, it will replace deprecated code with working code.',
                        name: 'Step 1 - Update dependencies and code',
                        status: 'CREATED',
                        progressUpdates: [
                            {
                                description: 'Migration step started',
                                name: 'Applying dependencies and code changes',
                                status: 'IN_PROGRESS',
                                startTime: '2024-04-22T11:00:16.192Z',
                            },
                        ],
                        startTime: '2024-04-22T11:00:15.999Z',
                    },
                    {
                        description:
                            'Q will build the upgraded code in Java 17 and iteratively fix any build errors encountered.',
                        name: 'Step 2 - Build in Java 17 and fix any issues',
                        status: 'CREATED',
                        progressUpdates: [],
                    },
                    {
                        description:
                            'Q will generate code changes for you to review and accept. It will also summarize the changes made, and will copy over build logs for future reference and troubleshooting.',
                        name: 'Step 3 - Finalize code changes and generate transformation summary',
                        status: 'CREATED',
                        progressUpdates: [],
                    },
                ],
            },
            {
                polledJobStatus: 'TRANSFORMING',
                steps: [
                    {
                        description:
                            'Q will update mandatory package dependencies and frameworks. Also, where required for compatability with Java 17, it will replace deprecated code with working code.',
                        name: 'Step 1 - Update dependencies and code',
                        status: 'CREATED',
                        progressUpdates: [
                            {
                                description: 'Migration step started',
                                name: 'Applying dependencies and code changes',
                                status: 'IN_PROGRESS',
                                startTime: '2024-04-22T11:00:16.192Z',
                            },
                        ],
                        startTime: '2024-04-22T11:00:15.999Z',
                    },
                    {
                        description:
                            'Q will build the upgraded code in Java 17 and iteratively fix any build errors encountered.',
                        name: 'Step 2 - Build in Java 17 and fix any issues',
                        status: 'CREATED',
                        progressUpdates: [],
                    },
                    {
                        description:
                            'Q will generate code changes for you to review and accept. It will also summarize the changes made, and will copy over build logs for future reference and troubleshooting.',
                        name: 'Step 3 - Finalize code changes and generate transformation summary',
                        status: 'CREATED',
                        progressUpdates: [],
                    },
                ],
            },
            {
                polledJobStatus: 'TRANSFORMING',
                steps: [
                    {
                        description:
                            'Q will update mandatory package dependencies and frameworks. Also, where required for compatability with Java 17, it will replace deprecated code with working code.',
                        name: 'Step 1 - Update dependencies and code',
                        status: 'CREATED',
                        progressUpdates: [
                            {
                                description: 'Migration step started',
                                name: 'Applying dependencies and code changes',
                                status: 'IN_PROGRESS',
                                startTime: '2024-04-22T11:00:16.192Z',
                            },
                        ],
                        startTime: '2024-04-22T11:00:15.999Z',
                    },
                    {
                        description:
                            'Q will build the upgraded code in Java 17 and iteratively fix any build errors encountered.',
                        name: 'Step 2 - Build in Java 17 and fix any issues',
                        status: 'CREATED',
                        progressUpdates: [],
                    },
                    {
                        description:
                            'Q will generate code changes for you to review and accept. It will also summarize the changes made, and will copy over build logs for future reference and troubleshooting.',
                        name: 'Step 3 - Finalize code changes and generate transformation summary',
                        status: 'CREATED',
                        progressUpdates: [],
                    },
                ],
            },
            {
                polledJobStatus: 'TRANSFORMING',
                steps: [
                    {
                        description:
                            'Q will update mandatory package dependencies and frameworks. Also, where required for compatability with Java 17, it will replace deprecated code with working code.',
                        name: 'Step 1 - Update dependencies and code',
                        status: 'CREATED',
                        progressUpdates: [
                            {
                                description: 'Step finished successfully',
                                name: 'Applying dependencies and code changes',
                                status: 'COMPLETED',
                                startTime: '2024-04-22T11:00:16.192Z',
                                endTime: '2024-04-22T11:00:53.003Z',
                            },
                            {
                                description: 'Migration step started',
                                name: 'Building in Java 17 environment',
                                status: 'IN_PROGRESS',
                                startTime: '2024-04-22T11:00:53.223Z',
                            },
                        ],
                        startTime: '2024-04-22T11:00:15.999Z',
                    },
                    {
                        description:
                            'Q will build the upgraded code in Java 17 and iteratively fix any build errors encountered.',
                        name: 'Step 2 - Build in Java 17 and fix any issues',
                        status: 'CREATED',
                        progressUpdates: [],
                    },
                    {
                        description:
                            'Q will generate code changes for you to review and accept. It will also summarize the changes made, and will copy over build logs for future reference and troubleshooting.',
                        name: 'Step 3 - Finalize code changes and generate transformation summary',
                        status: 'CREATED',
                        progressUpdates: [],
                    },
                ],
            },
            {
                polledJobStatus: 'TRANSFORMING',
                steps: [
                    {
                        description:
                            'Q will update mandatory package dependencies and frameworks. Also, where required for compatability with Java 17, it will replace deprecated code with working code.',
                        name: 'Step 1 - Update dependencies and code',
                        status: 'CREATED',
                        progressUpdates: [
                            {
                                description: 'Step finished successfully',
                                name: 'Applying dependencies and code changes',
                                status: 'COMPLETED',
                                startTime: '2024-04-22T11:00:16.192Z',
                                endTime: '2024-04-22T11:00:53.003Z',
                            },
                            {
                                description: 'Migration step started',
                                name: 'Building in Java 17 environment',
                                status: 'IN_PROGRESS',
                                startTime: '2024-04-22T11:00:53.223Z',
                            },
                        ],
                        startTime: '2024-04-22T11:00:15.999Z',
                    },
                    {
                        description:
                            'Q will build the upgraded code in Java 17 and iteratively fix any build errors encountered.',
                        name: 'Step 2 - Build in Java 17 and fix any issues',
                        status: 'CREATED',
                        progressUpdates: [],
                    },
                    {
                        description:
                            'Q will generate code changes for you to review and accept. It will also summarize the changes made, and will copy over build logs for future reference and troubleshooting.',
                        name: 'Step 3 - Finalize code changes and generate transformation summary',
                        status: 'CREATED',
                        progressUpdates: [],
                    },
                ],
            },
            {
                polledJobStatus: 'TRANSFORMING',
                steps: [
                    {
                        description:
                            'Q will update mandatory package dependencies and frameworks. Also, where required for compatability with Java 17, it will replace deprecated code with working code.',
                        name: 'Step 1 - Update dependencies and code',
                        status: 'CREATED',
                        progressUpdates: [
                            {
                                description: 'Step finished successfully',
                                name: 'Applying dependencies and code changes',
                                status: 'COMPLETED',
                                startTime: '2024-04-22T11:00:16.192Z',
                                endTime: '2024-04-22T11:00:53.003Z',
                            },
                            {
                                description: 'Migration step started',
                                name: 'Building in Java 17 environment',
                                status: 'IN_PROGRESS',
                                startTime: '2024-04-22T11:00:53.223Z',
                            },
                        ],
                        startTime: '2024-04-22T11:00:15.999Z',
                    },
                    {
                        description:
                            'Q will build the upgraded code in Java 17 and iteratively fix any build errors encountered.',
                        name: 'Step 2 - Build in Java 17 and fix any issues',
                        status: 'CREATED',
                        progressUpdates: [],
                    },
                    {
                        description:
                            'Q will generate code changes for you to review and accept. It will also summarize the changes made, and will copy over build logs for future reference and troubleshooting.',
                        name: 'Step 3 - Finalize code changes and generate transformation summary',
                        status: 'CREATED',
                        progressUpdates: [],
                    },
                ],
            },
            {
                polledJobStatus: 'TRANSFORMING',
                steps: [
                    {
                        description:
                            'Q will update mandatory package dependencies and frameworks. Also, where required for compatability with Java 17, it will replace deprecated code with working code.',
                        name: 'Step 1 - Update dependencies and code',
                        status: 'CREATED',
                        progressUpdates: [
                            {
                                description: 'Step finished successfully',
                                name: 'Applying dependencies and code changes',
                                status: 'COMPLETED',
                                startTime: '2024-04-22T11:00:16.192Z',
                                endTime: '2024-04-22T11:00:53.003Z',
                            },
                            {
                                description: 'Migration step started',
                                name: 'Building in Java 17 environment',
                                status: 'IN_PROGRESS',
                                startTime: '2024-04-22T11:00:53.223Z',
                            },
                        ],
                        startTime: '2024-04-22T11:00:15.999Z',
                    },
                    {
                        description:
                            'Q will build the upgraded code in Java 17 and iteratively fix any build errors encountered.',
                        name: 'Step 2 - Build in Java 17 and fix any issues',
                        status: 'CREATED',
                        progressUpdates: [],
                    },
                    {
                        description:
                            'Q will generate code changes for you to review and accept. It will also summarize the changes made, and will copy over build logs for future reference and troubleshooting.',
                        name: 'Step 3 - Finalize code changes and generate transformation summary',
                        status: 'CREATED',
                        progressUpdates: [],
                    },
                ],
            },
            {
                polledJobStatus: 'TRANSFORMING',
                steps: [
                    {
                        description:
                            'Q will update mandatory package dependencies and frameworks. Also, where required for compatability with Java 17, it will replace deprecated code with working code.',
                        name: 'Step 1 - Update dependencies and code',
                        status: 'COMPLETED',
                        progressUpdates: [
                            {
                                description: 'Step finished successfully',
                                name: 'Applying dependencies and code changes',
                                status: 'COMPLETED',
                                startTime: '2024-04-22T11:00:16.192Z',
                                endTime: '2024-04-22T11:00:53.003Z',
                            },
                            {
                                description: 'Successfully built code in Java 17',
                                name: 'Building in Java 17 environment',
                                status: 'COMPLETED',
                                startTime: '2024-04-22T11:00:53.223Z',
                                endTime: '2024-04-22T11:01:09.783Z',
                            },
                        ],
                        startTime: '2024-04-22T11:00:15.999Z',
                        endTime: '2024-04-22T11:01:09.797Z',
                    },
                    {
                        description:
                            'Q will build the upgraded code in Java 17 and iteratively fix any build errors encountered.',
                        name: 'Step 2 - Build in Java 17 and fix any issues',
                        status: 'CREATED',
                        progressUpdates: [
                            {
                                description: 'Migration step started',
                                name: 'Building in Java 17 environment',
                                status: 'IN_PROGRESS',
                                startTime: '2024-04-22T11:01:09.833Z',
                            },
                        ],
                        startTime: '2024-04-22T11:01:09.821Z',
                    },
                    {
                        description:
                            'Q will generate code changes for you to review and accept. It will also summarize the changes made, and will copy over build logs for future reference and troubleshooting.',
                        name: 'Step 3 - Finalize code changes and generate transformation summary',
                        status: 'CREATED',
                        progressUpdates: [],
                    },
                ],
            },
            {
                polledJobStatus: 'TRANSFORMING',
                steps: [
                    {
                        description:
                            'Q will update mandatory package dependencies and frameworks. Also, where required for compatability with Java 17, it will replace deprecated code with working code.',
                        name: 'Step 1 - Update dependencies and code',
                        status: 'COMPLETED',
                        progressUpdates: [
                            {
                                description: 'Step finished successfully',
                                name: 'Applying dependencies and code changes',
                                status: 'COMPLETED',
                                startTime: '2024-04-22T11:00:16.192Z',
                                endTime: '2024-04-22T11:00:53.003Z',
                            },
                            {
                                description: 'Successfully built code in Java 17',
                                name: 'Building in Java 17 environment',
                                status: 'COMPLETED',
                                startTime: '2024-04-22T11:00:53.223Z',
                                endTime: '2024-04-22T11:01:09.783Z',
                            },
                        ],
                        startTime: '2024-04-22T11:00:15.999Z',
                        endTime: '2024-04-22T11:01:09.797Z',
                    },
                    {
                        description:
                            'Q will build the upgraded code in Java 17 and iteratively fix any build errors encountered.',
                        name: 'Step 2 - Build in Java 17 and fix any issues',
                        status: 'CREATED',
                        progressUpdates: [
                            {
                                description: 'Migration step started',
                                name: 'Building in Java 17 environment',
                                status: 'IN_PROGRESS',
                                startTime: '2024-04-22T11:01:09.833Z',
                            },
                        ],
                        startTime: '2024-04-22T11:01:09.821Z',
                    },
                    {
                        description:
                            'Q will generate code changes for you to review and accept. It will also summarize the changes made, and will copy over build logs for future reference and troubleshooting.',
                        name: 'Step 3 - Finalize code changes and generate transformation summary',
                        status: 'CREATED',
                        progressUpdates: [],
                    },
                ],
            },
            {
                polledJobStatus: 'TRANSFORMING',
                steps: [
                    {
                        description:
                            'Q will update mandatory package dependencies and frameworks. Also, where required for compatability with Java 17, it will replace deprecated code with working code.',
                        name: 'Step 1 - Update dependencies and code',
                        status: 'COMPLETED',
                        progressUpdates: [
                            {
                                description: 'Step finished successfully',
                                name: 'Applying dependencies and code changes',
                                status: 'COMPLETED',
                                startTime: '2024-04-22T11:00:16.192Z',
                                endTime: '2024-04-22T11:00:53.003Z',
                            },
                            {
                                description: 'Successfully built code in Java 17',
                                name: 'Building in Java 17 environment',
                                status: 'COMPLETED',
                                startTime: '2024-04-22T11:00:53.223Z',
                                endTime: '2024-04-22T11:01:09.783Z',
                            },
                        ],
                        startTime: '2024-04-22T11:00:15.999Z',
                        endTime: '2024-04-22T11:01:09.797Z',
                    },
                    {
                        description:
                            'Q will build the upgraded code in Java 17 and iteratively fix any build errors encountered.',
                        name: 'Step 2 - Build in Java 17 and fix any issues',
                        status: 'CREATED',
                        progressUpdates: [
                            {
                                description: 'Migration step started',
                                name: 'Building in Java 17 environment',
                                status: 'IN_PROGRESS',
                                startTime: '2024-04-22T11:01:09.833Z',
                            },
                        ],
                        startTime: '2024-04-22T11:01:09.821Z',
                    },
                    {
                        description:
                            'Q will generate code changes for you to review and accept. It will also summarize the changes made, and will copy over build logs for future reference and troubleshooting.',
                        name: 'Step 3 - Finalize code changes and generate transformation summary',
                        status: 'CREATED',
                        progressUpdates: [],
                    },
                ],
            },
            {
                polledJobStatus: 'TRANSFORMING',
                steps: [
                    {
                        description:
                            'Q will update mandatory package dependencies and frameworks. Also, where required for compatability with Java 17, it will replace deprecated code with working code.',
                        name: 'Step 1 - Update dependencies and code',
                        status: 'COMPLETED',
                        progressUpdates: [
                            {
                                description: 'Step finished successfully',
                                name: 'Applying dependencies and code changes',
                                status: 'COMPLETED',
                                startTime: '2024-04-22T11:00:16.192Z',
                                endTime: '2024-04-22T11:00:53.003Z',
                            },
                            {
                                description: 'Successfully built code in Java 17',
                                name: 'Building in Java 17 environment',
                                status: 'COMPLETED',
                                startTime: '2024-04-22T11:00:53.223Z',
                                endTime: '2024-04-22T11:01:09.783Z',
                            },
                        ],
                        startTime: '2024-04-22T11:00:15.999Z',
                        endTime: '2024-04-22T11:01:09.797Z',
                    },
                    {
                        description:
                            'Q will build the upgraded code in Java 17 and iteratively fix any build errors encountered.',
                        name: 'Step 2 - Build in Java 17 and fix any issues',
                        status: 'COMPLETED',
                        progressUpdates: [
                            {
                                description: 'Successfully built code in Java 17',
                                name: 'Building in Java 17 environment',
                                status: 'COMPLETED',
                                startTime: '2024-04-22T11:01:09.833Z',
                                endTime: '2024-04-22T11:01:26.253Z',
                            },
                        ],
                        startTime: '2024-04-22T11:01:09.821Z',
                        endTime: '2024-04-22T11:01:26.269Z',
                    },
                    {
                        description:
                            'Q will generate code changes for you to review and accept. It will also summarize the changes made, and will copy over build logs for future reference and troubleshooting.',
                        name: 'Step 3 - Finalize code changes and generate transformation summary',
                        status: 'CREATED',
                        progressUpdates: [
                            {
                                description: 'Migration step started',
                                name: 'Building in Java 17 environment',
                                status: 'IN_PROGRESS',
                                startTime: '2024-04-22T11:01:26.340Z',
                            },
                        ],
                        startTime: '2024-04-22T11:01:26.283Z',
                    },
                ],
            },
            {
                polledJobStatus: 'TRANSFORMING',
                steps: [
                    {
                        description:
                            'Q will update mandatory package dependencies and frameworks. Also, where required for compatability with Java 17, it will replace deprecated code with working code.',
                        name: 'Step 1 - Update dependencies and code',
                        status: 'COMPLETED',
                        progressUpdates: [
                            {
                                description: 'Step finished successfully',
                                name: 'Applying dependencies and code changes',
                                status: 'COMPLETED',
                                startTime: '2024-04-22T11:00:16.192Z',
                                endTime: '2024-04-22T11:00:53.003Z',
                            },
                            {
                                description: 'Successfully built code in Java 17',
                                name: 'Building in Java 17 environment',
                                status: 'COMPLETED',
                                startTime: '2024-04-22T11:00:53.223Z',
                                endTime: '2024-04-22T11:01:09.783Z',
                            },
                        ],
                        startTime: '2024-04-22T11:00:15.999Z',
                        endTime: '2024-04-22T11:01:09.797Z',
                    },
                    {
                        description:
                            'Q will build the upgraded code in Java 17 and iteratively fix any build errors encountered.',
                        name: 'Step 2 - Build in Java 17 and fix any issues',
                        status: 'COMPLETED',
                        progressUpdates: [
                            {
                                description: 'Successfully built code in Java 17',
                                name: 'Building in Java 17 environment',
                                status: 'COMPLETED',
                                startTime: '2024-04-22T11:01:09.833Z',
                                endTime: '2024-04-22T11:01:26.253Z',
                            },
                        ],
                        startTime: '2024-04-22T11:01:09.821Z',
                        endTime: '2024-04-22T11:01:26.269Z',
                    },
                    {
                        description:
                            'Q will generate code changes for you to review and accept. It will also summarize the changes made, and will copy over build logs for future reference and troubleshooting.',
                        name: 'Step 3 - Finalize code changes and generate transformation summary',
                        status: 'CREATED',
                        progressUpdates: [
                            {
                                description: 'Migration step started',
                                name: 'Building in Java 17 environment',
                                status: 'IN_PROGRESS',
                                startTime: '2024-04-22T11:01:26.340Z',
                            },
                        ],
                        startTime: '2024-04-22T11:01:26.283Z',
                    },
                ],
            },
            {
                polledJobStatus: 'TRANSFORMING',
                steps: [
                    {
                        description:
                            'Q will update mandatory package dependencies and frameworks. Also, where required for compatability with Java 17, it will replace deprecated code with working code.',
                        name: 'Step 1 - Update dependencies and code',
                        status: 'COMPLETED',
                        progressUpdates: [
                            {
                                description: 'Step finished successfully',
                                name: 'Applying dependencies and code changes',
                                status: 'COMPLETED',
                                startTime: '2024-04-22T11:00:16.192Z',
                                endTime: '2024-04-22T11:00:53.003Z',
                            },
                            {
                                description: 'Successfully built code in Java 17',
                                name: 'Building in Java 17 environment',
                                status: 'COMPLETED',
                                startTime: '2024-04-22T11:00:53.223Z',
                                endTime: '2024-04-22T11:01:09.783Z',
                            },
                        ],
                        startTime: '2024-04-22T11:00:15.999Z',
                        endTime: '2024-04-22T11:01:09.797Z',
                    },
                    {
                        description:
                            'Q will build the upgraded code in Java 17 and iteratively fix any build errors encountered.',
                        name: 'Step 2 - Build in Java 17 and fix any issues',
                        status: 'COMPLETED',
                        progressUpdates: [
                            {
                                description: 'Successfully built code in Java 17',
                                name: 'Building in Java 17 environment',
                                status: 'COMPLETED',
                                startTime: '2024-04-22T11:01:09.833Z',
                                endTime: '2024-04-22T11:01:26.253Z',
                            },
                        ],
                        startTime: '2024-04-22T11:01:09.821Z',
                        endTime: '2024-04-22T11:01:26.269Z',
                    },
                    {
                        description:
                            'Q will generate code changes for you to review and accept. It will also summarize the changes made, and will copy over build logs for future reference and troubleshooting.',
                        name: 'Step 3 - Finalize code changes and generate transformation summary',
                        status: 'CREATED',
                        progressUpdates: [
                            {
                                description: 'Migration step started',
                                name: 'Building in Java 17 environment',
                                status: 'IN_PROGRESS',
                                startTime: '2024-04-22T11:01:26.340Z',
                            },
                        ],
                        startTime: '2024-04-22T11:01:26.283Z',
                    },
                ],
            },
            {
                polledJobStatus: 'TRANSFORMING',
                steps: [
                    {
                        description:
                            'Q will update mandatory package dependencies and frameworks. Also, where required for compatability with Java 17, it will replace deprecated code with working code.',
                        name: 'Step 1 - Update dependencies and code',
                        status: 'COMPLETED',
                        progressUpdates: [
                            {
                                description: 'Step finished successfully',
                                name: 'Applying dependencies and code changes',
                                status: 'COMPLETED',
                                startTime: '2024-04-22T11:00:16.192Z',
                                endTime: '2024-04-22T11:00:53.003Z',
                            },
                            {
                                description: 'Successfully built code in Java 17',
                                name: 'Building in Java 17 environment',
                                status: 'COMPLETED',
                                startTime: '2024-04-22T11:00:53.223Z',
                                endTime: '2024-04-22T11:01:09.783Z',
                            },
                        ],
                        startTime: '2024-04-22T11:00:15.999Z',
                        endTime: '2024-04-22T11:01:09.797Z',
                    },
                    {
                        description:
                            'Q will build the upgraded code in Java 17 and iteratively fix any build errors encountered.',
                        name: 'Step 2 - Build in Java 17 and fix any issues',
                        status: 'COMPLETED',
                        progressUpdates: [
                            {
                                description: 'Successfully built code in Java 17',
                                name: 'Building in Java 17 environment',
                                status: 'COMPLETED',
                                startTime: '2024-04-22T11:01:09.833Z',
                                endTime: '2024-04-22T11:01:26.253Z',
                            },
                        ],
                        startTime: '2024-04-22T11:01:09.821Z',
                        endTime: '2024-04-22T11:01:26.269Z',
                    },
                    {
                        description:
                            'Q will generate code changes for you to review and accept. It will also summarize the changes made, and will copy over build logs for future reference and troubleshooting.',
                        name: 'Step 3 - Finalize code changes and generate transformation summary',
                        status: 'CREATED',
                        progressUpdates: [
                            {
                                description: 'Successfully built code in Java 17',
                                name: 'Building in Java 17 environment',
                                status: 'FAILED',
                                startTime: '2024-04-22T11:01:26.340Z',
                                endTime: '2024-04-22T11:01:42.604Z',
                            },
                            {
                                description: 'Migration step started',
                                name: 'Building in Java 17 environment',
                                status: 'IN_PROGRESS',
                                startTime: '2024-04-22T11:01:42.619Z',
                            },
                        ],
                        startTime: '2024-04-22T11:01:26.283Z',
                    },
                ],
            },
            {
                polledJobStatus: 'TRANSFORMING',
                steps: [
                    {
                        description:
                            'Q will update mandatory package dependencies and frameworks. Also, where required for compatability with Java 17, it will replace deprecated code with working code.',
                        name: 'Step 1 - Update dependencies and code',
                        status: 'COMPLETED',
                        progressUpdates: [
                            {
                                description: 'Step finished successfully',
                                name: 'Applying dependencies and code changes',
                                status: 'COMPLETED',
                                startTime: '2024-04-22T11:00:16.192Z',
                                endTime: '2024-04-22T11:00:53.003Z',
                            },
                            {
                                description: 'Successfully built code in Java 17',
                                name: 'Building in Java 17 environment',
                                status: 'COMPLETED',
                                startTime: '2024-04-22T11:00:53.223Z',
                                endTime: '2024-04-22T11:01:09.783Z',
                            },
                        ],
                        startTime: '2024-04-22T11:00:15.999Z',
                        endTime: '2024-04-22T11:01:09.797Z',
                    },
                    {
                        description:
                            'Q will build the upgraded code in Java 17 and iteratively fix any build errors encountered.',
                        name: 'Step 2 - Build in Java 17 and fix any issues',
                        status: 'COMPLETED',
                        progressUpdates: [
                            {
                                description: 'Successfully built code in Java 17',
                                name: 'Building in Java 17 environment',
                                status: 'COMPLETED',
                                startTime: '2024-04-22T11:01:09.833Z',
                                endTime: '2024-04-22T11:01:26.253Z',
                            },
                        ],
                        startTime: '2024-04-22T11:01:09.821Z',
                        endTime: '2024-04-22T11:01:26.269Z',
                    },
                    {
                        description:
                            'Q will generate code changes for you to review and accept. It will also summarize the changes made, and will copy over build logs for future reference and troubleshooting.',
                        name: 'Step 3 - Finalize code changes and generate transformation summary',
                        status: 'CREATED',
                        progressUpdates: [
                            {
                                description: 'Successfully built code in Java 17',
                                name: 'Building in Java 17 environment',
                                status: 'FAILED',
                                startTime: '2024-04-22T11:01:26.340Z',
                                endTime: '2024-04-22T11:01:42.604Z',
                            },
                            {
                                description: 'Migration step started',
                                name: 'Building in Java 17 environment',
                                status: 'IN_PROGRESS',
                                startTime: '2024-04-22T11:01:42.619Z',
                            },
                        ],
                        startTime: '2024-04-22T11:01:26.283Z',
                    },
                ],
            },
            {
                polledJobStatus: '',
                steps: [
                    {
                        description:
                            'Q will update mandatory package dependencies and frameworks. Also, where required for compatability with Java 17, it will replace deprecated code with working code.',
                        name: 'Step 1 - Update dependencies and code',
                        status: 'COMPLETED',
                        progressUpdates: [
                            {
                                description: 'Step finished successfully',
                                name: 'Applying dependencies and code changes',
                                status: 'COMPLETED',
                                startTime: '2024-04-22T11:00:16.192Z',
                                endTime: '2024-04-22T11:00:53.003Z',
                            },
                            {
                                description: 'Successfully built code in Java 17',
                                name: 'Building in Java 17 environment',
                                status: 'COMPLETED',
                                startTime: '2024-04-22T11:00:53.223Z',
                                endTime: '2024-04-22T11:01:09.783Z',
                            },
                        ],
                        startTime: '2024-04-22T11:00:15.999Z',
                        endTime: '2024-04-22T11:01:09.797Z',
                    },
                    {
                        description:
                            'Q will build the upgraded code in Java 17 and iteratively fix any build errors encountered.',
                        name: 'Step 2 - Build in Java 17 and fix any issues',
                        status: 'COMPLETED',
                        progressUpdates: [
                            {
                                description: 'Successfully built code in Java 17',
                                name: 'Building in Java 17 environment',
                                status: 'COMPLETED',
                                startTime: '2024-04-22T11:01:09.833Z',
                                endTime: '2024-04-22T11:01:26.253Z',
                            },
                        ],
                        startTime: '2024-04-22T11:01:09.821Z',
                        endTime: '2024-04-22T11:01:26.269Z',
                    },
                    {
                        description:
                            'Q will generate code changes for you to review and accept. It will also summarize the changes made, and will copy over build logs for future reference and troubleshooting.',
                        name: 'Step 3 - Finalize code changes and generate transformation summary',
                        status: 'CREATED',
                        progressUpdates: [
                            {
                                description: 'Successfully built code in Java 17',
                                name: 'Building in Java 17 environment',
                                status: 'FAILED',
                                startTime: '2024-04-22T11:01:26.340Z',
                                endTime: '2024-04-22T11:01:42.604Z',
                            },
                            {
                                description: 'Migration step started',
                                name: 'Building in Java 17 environment',
                                status: 'IN_PROGRESS',
                                startTime: '2024-04-22T11:01:42.619Z',
                            },
                        ],
                        startTime: '2024-04-22T11:01:26.283Z',
                    },
                ],
            },
        ]

        for (const entry of sequence) {
            const entryAsTransformationSteps = entry.steps.map((step, index) => {
                return {
                    id: `${index}`,
                    name: step.name,
                    description: step.description,
                    status: step.status,
                    progressUpdates: step.progressUpdates.map((value, index) => {
                        return {
                            id: `${index}`,
                            name: value.name,
                            status: value.status,
                            description: value.description,
                        }
                    }),
                }
            })
            model.transformByQState.setPlanSteps(entryAsTransformationSteps)
            model.transformByQState.setPolledJobStatus(entry.polledJobStatus)

            progress['buildCode'] = model.StepProgress.Succeeded
            progress['generatePlan'] = model.StepProgress.Succeeded
            progress['startJob'] = model.StepProgress.Succeeded
            progress['transformCode'] = model.StepProgress.Pending

            const time = Date.now()
            const html = await hub.showPlanProgress(time)
            fs.writeFileSync('/Users/araneda/index.html', html)
            await new Promise(f => setTimeout(f, 1000))
        }
    })

    it(`Test split panel UI`, async function () {
        const hub = new TransformationHubViewProvider()
        const progress = getPlanProgress()
        model.transformByQState.setPolledJobStatus('STARTED')
        model.transformByQState.setPlanSteps([
            {
                id: '1',
                name: 'Step 1',
                description: 'try to make something happen',
                status: 'COMPLETED',
                progressUpdates: [
                    {
                        name: 'substep 1',
                        status: 'COMPLETED',
                        description: 'This is a completed substep description',
                    },
                    {
                        name: 'substep 1',
                        status: 'FAILED',
                        description: 'This is a failed substep description',
                    },
                    {
                        name: 'substep 1',
                        status: 'PENDING',
                        description: 'This is a unprocessed description',
                    },
                ],
            },
            {
                id: '2',
                name: 'Step 2 - partially completed',
                description: 'Very descriptive',
                status: 'PARTIALLY_COMPLETED',
                progressUpdates: [
                    {
                        name: 'substep 1',
                        status: 'COMPLETED',
                        description: 'This is a completed substep description',
                    },
                    {
                        name: 'substep 2',
                        status: 'FAILED',
                        description: 'This is a failed substep description',
                    },
                    {
                        name: 'substep 3',
                        status: 'PENDING',
                        description: 'This is a unprocessed description',
                    },
                ],
            },
            {
                id: '3',
                name: 'Step 3 - stopped',
                description: 'Decided to stop the transform',
                status: 'STOPPED',
                progressUpdates: [
                    {
                        name: 'substep 1',
                        status: 'COMPLETED',
                        description: 'This is a completed substep description',
                    },
                    {
                        name: 'substep 2',
                        status: 'FAILED',
                        description: 'This is a failed substep description',
                    },
                    {
                        name: 'substep 3',
                        status: 'PENDING',
                        description: 'This is a unprocessed description',
                    },
                ],
            },
            {
                id: '4',
                name: 'Step 4 - Failed',
                description: 'Well this did not work out...',
                status: 'FAILED',
                progressUpdates: [
                    {
                        name: 'substep 1',
                        status: 'COMPLETED',
                        description: 'This is a completed substep description',
                    },
                    {
                        name: 'substep 2',
                        status: 'FAILED',
                        description: 'This is a failed substep description',
                    },
                    {
                        name: 'substep 3',
                        status: 'PENDING',
                        description: 'This is a unprocessed description',
                    },
                ],
            },
            {
                id: '5',
                name: 'Step 5 - Created',
                description: 'Decided to stop the transform',
                status: 'CREATED',
                progressUpdates: [
                    {
                        name: 'substep 1',
                        status: 'COMPLETED',
                        description: 'This is a completed substep description for the first created entry',
                    },
                    {
                        name: 'substep 2',
                        status: 'FAILED',
                        description: 'This is a failed substep description for the first created entry',
                    },
                    {
                        name: 'substep 3',
                        status: 'PENDING',
                        description: 'This is a unprocessed description for the first created entry',
                    },
                ],
            },
            {
                id: '6',
                name: 'Step 6 - Created',
                description: 'Decided to stop the transform',
                status: 'CREATED',
                progressUpdates: [
                    {
                        name: 'substep 1',
                        status: 'COMPLETED',
                        description: 'This is a completed substep description',
                    },
                    {
                        name: 'substep 2',
                        status: 'FAILED',
                        description: 'This is a failed substep description',
                    },
                    {
                        name: 'substep 3',
                        status: 'PENDING',
                        description: 'This is a unprocessed description',
                    },
                ],
            },
        ])

        progress['buildCode'] = model.StepProgress.Succeeded
        progress['generatePlan'] = model.StepProgress.Succeeded
        progress['startJob'] = model.StepProgress.Succeeded
        progress['transformCode'] = model.StepProgress.Pending

        const time = Date.now()
        const html = await hub.showPlanProgress(time)
        fs.writeFileSync('/Users/araneda/index.html', html)
    })
})

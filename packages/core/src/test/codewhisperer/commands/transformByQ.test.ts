/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as vscode from 'vscode'
import * as fs from 'fs-extra'
import * as sinon from 'sinon'
import { makeTemporaryToolkitFolder } from '../../../shared/filesystemUtilities'
import { transformByQState, TransformByQStoppedError } from '../../../codewhisperer/models/model'
import { stopTransformByQ } from '../../../codewhisperer/commands/startTransformByQ'
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
    getTableMapping,
} from '../../../codewhisperer/service/transformByQ/transformApiHandler'
import {
    validateOpenProjects,
    getOpenProjects,
} from '../../../codewhisperer/service/transformByQ/transformProjectValidationHandler'
import { TransformationCandidateProject } from '../../../codewhisperer/models/model'

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
        transformByQState.setToCancelled()
        assert.throws(() => {
            throwIfCancelled()
        }, new TransformByQStoppedError())
    })

    it('WHEN job is stopped THEN status is updated to cancelled', async function () {
        transformByQState.setToRunning()
        await stopTransformByQ('abc-123')
        assert.strictEqual(transformByQState.getStatus(), 'Cancelled')
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
        transformByQState.setToSucceeded()
        const status = await pollTransformationJob('dummyId', CodeWhispererConstants.validStatesForCheckingDownloadUrl)
        assert.strictEqual(status, 'COMPLETED')
    })

    // it(`WHEN update job history called THEN returns details of last run job`, async function () {
    //     transformByQState.setJobId('abc-123')
    //     transformByQState.setProjectName('test-project')
    //     transformByQState.setPolledJobStatus('COMPLETED')
    //     transformByQState.setStartTime('05/03/24, 11:35 AM')

    //     const actual = SessionJobHistory()
    //     const expected = {
    //         'abc-123': {
    //             duration: '0 sec',
    //             projectName: 'test-project',
    //             startTime: '05/03/24, 11:35 AM',
    //             status: 'COMPLETED',
    //         },
    //     }
    //     assert.deepStrictEqual(actual, expected)
    // })

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
        transformByQState.setProjectPath(tempDir)
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

    it(`WHEN getTableMapping on complete step 0 progressUpdates THEN map IDs to tables`, async function () {
        const stepZeroProgressUpdates = [
            {
                name: '0',
                status: 'COMPLETED',
                description:
                    '{"columnNames":["name","value"],"rows":[{"name":"Lines of code in your application","value":"3000"},{"name":"Dependencies to be replaced","value":"5"},{"name":"Deprecated code instances to be replaced","value":"10"},{"name":"Files to be updated","value":"7"}]}',
            },
            {
                name: '1-dependency-change-abc',
                status: 'COMPLETED',
                description:
                    '{"columnNames":["dependencyName","action","currentVersion","targetVersion"],"rows":[{"dependencyName":"org.springboot.com","action":"Update","currentVersion":"2.1","targetVersion":"2.4"}, {"dependencyName":"com.lombok.java","action":"Remove","currentVersion":"1.7","targetVersion":"-"}]}',
            },
            {
                name: '2-deprecated-code-xyz',
                status: 'COMPLETED',
                description:
                    '{"columnNames":["apiFullyQualifiedName","numChangedFiles"],“rows”:[{"apiFullyQualifiedName":"java.lang.Thread.stop()","numChangedFiles":"6"}, {"apiFullyQualifiedName":"java.math.bad()","numChangedFiles":"3"}]}',
            },
            {
                name: '-1',
                status: 'COMPLETED',
                description:
                    '{"columnNames":["relativePath","action"],"rows":[{"relativePath":"pom.xml","action":"Update"}, {"relativePath":"src/main/java/com/bhoruka/bloodbank/BloodbankApplication.java","action":"Update"}]}',
            },
        ]

        const actual = getTableMapping(stepZeroProgressUpdates)
        const expected = {
            '0': '{"columnNames":["name","value"],"rows":[{"name":"Lines of code in your application","value":"3000"},{"name":"Dependencies to be replaced","value":"5"},{"name":"Deprecated code instances to be replaced","value":"10"},{"name":"Files to be updated","value":"7"}]}',
            '1-dependency-change-abc':
                '{"columnNames":["dependencyName","action","currentVersion","targetVersion"],"rows":[{"dependencyName":"org.springboot.com","action":"Update","currentVersion":"2.1","targetVersion":"2.4"}, {"dependencyName":"com.lombok.java","action":"Remove","currentVersion":"1.7","targetVersion":"-"}]}',
            '2-deprecated-code-xyz':
                '{"columnNames":["apiFullyQualifiedName","numChangedFiles"],“rows”:[{"apiFullyQualifiedName":"java.lang.Thread.stop()","numChangedFiles":"6"}, {"apiFullyQualifiedName":"java.math.bad()","numChangedFiles":"3"}]}',
            '-1': '{"columnNames":["relativePath","action"],"rows":[{"relativePath":"pom.xml","action":"Update"}, {"relativePath":"src/main/java/com/bhoruka/bloodbank/BloodbankApplication.java","action":"Update"}]}',
        }
        assert.deepStrictEqual(actual, expected)
    })
})

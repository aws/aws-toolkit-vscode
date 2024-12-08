/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert, { fail } from 'assert'
import * as vscode from 'vscode'
import * as sinon from 'sinon'
import { DB, transformByQState, TransformByQStoppedError } from '../../../codewhisperer/models/model'
import {
    finalizeTransformationJob,
    parseBuildFile,
    setMaven,
    stopTransformByQ,
    validateSQLMetadataFile,
} from '../../../codewhisperer/commands/startTransformByQ'
import { HttpResponse } from 'aws-sdk'
import * as codeWhisperer from '../../../codewhisperer/client/codewhisperer'
import * as CodeWhispererConstants from '../../../codewhisperer/models/constants'
import path from 'path'
import AdmZip from 'adm-zip'
import { createTestWorkspaceFolder, TestFolder, toFile } from '../../testUtil'
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
    updateJobHistory,
    zipCode,
    getTableMapping,
    getFilesRecursively,
} from '../../../codewhisperer/service/transformByQ/transformApiHandler'
import {
    validateOpenProjects,
    getOpenProjects,
} from '../../../codewhisperer/service/transformByQ/transformProjectValidationHandler'
import { TransformationCandidateProject, ZipManifest } from '../../../codewhisperer/models/model'
import globals from '../../../shared/extensionGlobals'
import { env, fs } from '../../../shared'
import { convertDateToTimestamp, convertToTimeString } from '../../../shared/datetime'

describe('transformByQ', function () {
    let tempDir: string

    beforeEach(async function () {
        tempDir = (await TestFolder.create()).path
        transformByQState.setToNotStarted()
    })

    afterEach(async function () {
        sinon.restore()
        await fs.delete(tempDir, { recursive: true })
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

    it('WHEN stop job called with invalid jobId THEN stop API not called', async function () {
        const stopJobStub = sinon.stub(codeWhisperer.codeWhispererClient, 'codeModernizerStopCodeTransformation')
        await stopJob('')
        sinon.assert.notCalled(stopJobStub)
    })

    it('WHEN stop job called with valid jobId THEN stop API called', async function () {
        const stopJobStub = sinon.stub(codeWhisperer.codeWhispererClient, 'codeModernizerStopCodeTransformation')
        await stopJob('dummyId')
        sinon.assert.calledWithExactly(stopJobStub, { transformationJobId: 'dummyId' })
    })

    it('WHEN stopTransformByQ called with job that has already terminated THEN stop API not called', async function () {
        const stopJobStub = sinon.stub(codeWhisperer.codeWhispererClient, 'codeModernizerStopCodeTransformation')
        transformByQState.setToSucceeded()
        await stopTransformByQ('abc-123')
        sinon.assert.notCalled(stopJobStub)
    })

    it('WHEN finalizeTransformationJob on failed job THEN error thrown and error message fields are set', async function () {
        await assert.rejects(async () => {
            await finalizeTransformationJob('FAILED')
        })
        assert.notStrictEqual(transformByQState.getJobFailureErrorChatMessage(), undefined)
        assert.notStrictEqual(transformByQState.getJobFailureErrorNotification(), undefined)
        transformByQState.setJobDefaults() // reset error messages to undefined
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

    it(`WHEN update job history called THEN returns details of last run job`, async function () {
        transformByQState.setJobId('abc-123')
        transformByQState.setProjectName('test-project')
        transformByQState.setPolledJobStatus('COMPLETED')
        transformByQState.setStartTime('05/03/24, 11:35 AM')
        const actual = updateJobHistory()
        const expected = {
            'abc-123': {
                duration: '0 sec',
                projectName: 'test-project',
                startTime: '05/03/24, 11:35 AM',
                status: 'COMPLETED',
            },
        }
        assert.equal(actual['abc-123'].projectName, expected['abc-123'].projectName)
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

    it(`WHEN transforming a project with a Windows Maven executable THEN mavenName set correctly`, async function () {
        sinon.stub(env, 'isWin').returns(true)
        const tempFileName = 'mvnw.cmd'
        const tempFilePath = path.join(tempDir, tempFileName)
        await toFile('', tempFilePath)
        transformByQState.setProjectPath(tempDir)
        await setMaven()
        assert.strictEqual(transformByQState.getMavenName(), '.\\mvnw.cmd')
    })

    it(`WHEN zip created THEN manifest.json contains test-compile custom build command`, async function () {
        const tempFileName = `testfile-${globals.clock.Date.now()}.zip`
        transformByQState.setProjectPath(tempDir)
        const transformManifest = new ZipManifest()
        transformManifest.customBuildCommand = CodeWhispererConstants.skipUnitTestsBuildCommand
        return zipCode({
            dependenciesFolder: {
                path: tempDir,
                name: tempFileName,
            },
            humanInTheLoopFlag: false,
            projectPath: tempDir,
            zipManifest: transformManifest,
        }).then((zipCodeResult) => {
            const zip = new AdmZip(zipCodeResult.tempFilePath)
            const manifestEntry = zip.getEntry('manifest.json')
            if (!manifestEntry) {
                fail('manifest.json not found in the zip')
            }
            const manifestBuffer = manifestEntry.getData()
            const manifestText = manifestBuffer.toString('utf8')
            const manifest = JSON.parse(manifestText)
            assert.strictEqual(manifest.customBuildCommand, CodeWhispererConstants.skipUnitTestsBuildCommand)
        })
    })

    it('WHEN zipCode THEN ZIP contains all expected files and no unexpected files', async function () {
        const zipFilePath = path.join(tempDir, 'test.zip')
        const zip = new AdmZip()
        await fs.writeFile(path.join(tempDir, 'pom.xml'), 'dummy pom.xml')
        zip.addLocalFile(path.join(tempDir, 'pom.xml'))
        zip.addFile('manifest.json', Buffer.from(JSON.stringify({ version: '1.0' })))
        zip.writeZip(zipFilePath)
        const zipFiles = new AdmZip(zipFilePath).getEntries()
        const zipFileNames = zipFiles.map((file) => file.name)
        assert.strictEqual(zipFileNames.length, 2) // expecting only pom.xml and manifest.json
        assert.strictEqual(zipFileNames.includes('pom.xml') && zipFileNames.includes('manifest.json'), true)
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

        for (const folder of m2Folders) {
            const folderPath = path.join(tempDir, folder)
            await fs.mkdir(folderPath)
            for (const file of filesToAdd) {
                await fs.writeFile(path.join(folderPath, file), 'sample content for the test file')
            }
        }

        const tempFileName = `testfile-${globals.clock.Date.now()}.zip`
        transformByQState.setProjectPath(tempDir)
        return zipCode({
            dependenciesFolder: {
                path: tempDir,
                name: tempFileName,
            },
            humanInTheLoopFlag: false,
            projectPath: tempDir,
            zipManifest: new ZipManifest(),
        }).then((zipCodeResult) => {
            const zip = new AdmZip(zipCodeResult.tempFilePath)
            const dependenciesToUpload = zip.getEntries().filter((entry) => entry.entryName.startsWith('dependencies'))
            // Each dependency version folder contains each expected file, thus we multiply
            const expectedNumberOfDependencyFiles = m2Folders.length * expectedFilesAfterClean.length
            assert.strictEqual(expectedNumberOfDependencyFiles, dependenciesToUpload.length)
            dependenciesToUpload.forEach((dependency) => {
                assert(expectedFilesAfterClean.includes(dependency.name))
            })
        })
    })

    it(`WHEN getFilesRecursively on source code THEN ignores excluded directories`, async function () {
        const sourceFolder = path.join(tempDir, 'src')
        await fs.mkdir(sourceFolder)
        await fs.writeFile(path.join(sourceFolder, 'HelloWorld.java'), 'sample content for the test file')

        const gitFolder = path.join(tempDir, '.git')
        await fs.mkdir(gitFolder)
        await fs.writeFile(path.join(gitFolder, 'config'), 'sample content for the test file')

        const zippedFiles = getFilesRecursively(tempDir, false)
        assert.strictEqual(zippedFiles.length, 1)
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

    it(`WHEN codeTransformBillingText on small project THEN correct string returned`, async function () {
        const expected =
            '<p>376 lines of code were submitted for transformation. If you reach the quota for lines of code included in your subscription, you will be charged $0.003 for each additional line of code. You might be charged up to $1.13 for this transformation. To avoid being charged, stop the transformation job before it completes. For more information on pricing and quotas, see [Amazon Q Developer pricing](https://aws.amazon.com/q/developer/pricing/).</p>'
        const actual = CodeWhispererConstants.codeTransformBillingText(376)
        assert.strictEqual(actual, expected)
    })

    it(`WHEN parseBuildFile on pom.xml with absolute path THEN absolute path detected`, async function () {
        const dirPath = await TestFolder.create()
        transformByQState.setProjectPath(dirPath.path)
        const pomPath = path.join(dirPath.path, 'pom.xml')
        await toFile('<project><properties><path>system/name/here</path></properties></project>', pomPath)
        const expectedWarning =
            'I detected 1 potential absolute file path(s) in your pom.xml file: **system/**. Absolute file paths might cause issues when I build your code. Any errors will show up in the build log.'
        const warningMessage = await parseBuildFile()
        assert.strictEqual(expectedWarning, warningMessage)
    })

    it(`WHEN validateMetadataFile on fully valid .sct file THEN passes validation`, async function () {
        const sampleFileContents = `<?xml version="1.0" encoding="UTF-8"?>
        <tree>
        <instances>
            <ProjectModel>
            <entities>
                <sources>
                <DbServer vendor="oracle" name="sample.rds.amazonaws.com">
                </DbServer>
                </sources>
                <targets>
                <DbServer vendor="aurora_postgresql" />
                </targets>
            </entities>
            <relations>
                <server-node-location>
                <FullNameNodeInfoList>
                    <nameParts>
                    <FullNameNodeInfo typeNode="schema" nameNode="schema1"/>
                    <FullNameNodeInfo typeNode="table" nameNode="table1"/>
                    </nameParts>
                </FullNameNodeInfoList>
                </server-node-location>
                <server-node-location>
                <FullNameNodeInfoList>
                    <nameParts>
                    <FullNameNodeInfo typeNode="schema" nameNode="schema2"/>
                    <FullNameNodeInfo typeNode="table" nameNode="table2"/>
                    </nameParts>
                </FullNameNodeInfoList>
                </server-node-location>
                <server-node-location>
                <FullNameNodeInfoList>
                    <nameParts>
                    <FullNameNodeInfo typeNode="schema" nameNode="schema3"/>
                    <FullNameNodeInfo typeNode="table" nameNode="table3"/>
                    </nameParts>
                </FullNameNodeInfoList>
                </server-node-location>
            </relations>
            </ProjectModel>
        </instances>
        </tree>`
        const isValidMetadata = await validateSQLMetadataFile(sampleFileContents, { tabID: 'abc123' })
        assert.strictEqual(isValidMetadata, true)
        assert.strictEqual(transformByQState.getSourceDB(), DB.ORACLE)
        assert.strictEqual(transformByQState.getTargetDB(), DB.AURORA_POSTGRESQL)
        assert.strictEqual(transformByQState.getSourceServerName(), 'sample.rds.amazonaws.com')
        const expectedSchemaOptions = ['SCHEMA1', 'SCHEMA2', 'SCHEMA3']
        expectedSchemaOptions.forEach((schema) => {
            assert(transformByQState.getSchemaOptions().has(schema))
        })
    })

    it(`WHEN validateMetadataFile on .sct file with unsupported source DB THEN fails validation`, async function () {
        const sampleFileContents = `<?xml version="1.0" encoding="UTF-8"?>
        <tree>
        <instances>
            <ProjectModel>
            <entities>
                <sources>
                <DbServer vendor="not-oracle" name="sample.rds.amazonaws.com">
                </DbServer>
                </sources>
                <targets>
                <DbServer vendor="aurora_postgresql" />
                </targets>
            </entities>
            <relations>
                <server-node-location>
                <FullNameNodeInfoList>
                    <nameParts>
                    <FullNameNodeInfo typeNode="schema" nameNode="schema1"/>
                    <FullNameNodeInfo typeNode="table" nameNode="table1"/>
                    </nameParts>
                </FullNameNodeInfoList>
                </server-node-location>
                <server-node-location>
                <FullNameNodeInfoList>
                    <nameParts>
                    <FullNameNodeInfo typeNode="schema" nameNode="schema2"/>
                    <FullNameNodeInfo typeNode="table" nameNode="table2"/>
                    </nameParts>
                </FullNameNodeInfoList>
                </server-node-location>
                <server-node-location>
                <FullNameNodeInfoList>
                    <nameParts>
                    <FullNameNodeInfo typeNode="schema" nameNode="schema3"/>
                    <FullNameNodeInfo typeNode="table" nameNode="table3"/>
                    </nameParts>
                </FullNameNodeInfoList>
                </server-node-location>
            </relations>
            </ProjectModel>
        </instances>
        </tree>`
        const isValidMetadata = await validateSQLMetadataFile(sampleFileContents, { tabID: 'abc123' })
        assert.strictEqual(isValidMetadata, false)
    })

    it(`WHEN validateMetadataFile on .sct file with unsupported target DB THEN fails validation`, async function () {
        const sampleFileContents = `<?xml version="1.0" encoding="UTF-8"?>
        <tree>
        <instances>
            <ProjectModel>
            <entities>
                <sources>
                <DbServer vendor="oracle" name="sample.rds.amazonaws.com">
                </DbServer>
                </sources>
                <targets>
                <DbServer vendor="not-postgresql" />
                </targets>
            </entities>
            <relations>
                <server-node-location>
                <FullNameNodeInfoList>
                    <nameParts>
                    <FullNameNodeInfo typeNode="schema" nameNode="schema1"/>
                    <FullNameNodeInfo typeNode="table" nameNode="table1"/>
                    </nameParts>
                </FullNameNodeInfoList>
                </server-node-location>
                <server-node-location>
                <FullNameNodeInfoList>
                    <nameParts>
                    <FullNameNodeInfo typeNode="schema" nameNode="schema2"/>
                    <FullNameNodeInfo typeNode="table" nameNode="table2"/>
                    </nameParts>
                </FullNameNodeInfoList>
                </server-node-location>
                <server-node-location>
                <FullNameNodeInfoList>
                    <nameParts>
                    <FullNameNodeInfo typeNode="schema" nameNode="schema3"/>
                    <FullNameNodeInfo typeNode="table" nameNode="table3"/>
                    </nameParts>
                </FullNameNodeInfoList>
                </server-node-location>
            </relations>
            </ProjectModel>
        </instances>
        </tree>`
        const isValidMetadata = await validateSQLMetadataFile(sampleFileContents, { tabID: 'abc123' })
        assert.strictEqual(isValidMetadata, false)
    })
})

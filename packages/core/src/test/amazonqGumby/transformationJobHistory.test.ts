/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import * as os from 'os'
import * as path from 'path'
import fs from '../../shared/fs/fs'
import * as datetime from '../../shared/datetime'
import { codeWhispererClient } from '../../codewhisperer/client/codewhisperer'
import {
    readHistoryFile,
    writeToHistoryFile,
    createMetadataFile,
    cleanupTempJobFiles,
    refreshJob,
    JobMetadata,
} from '../../codewhisperer/service/transformByQ/transformationHistoryHandler'
import { copyArtifacts } from '../../codewhisperer/service/transformByQ/transformFileHandler'
import * as transformApiHandler from '../../codewhisperer/service/transformByQ/transformApiHandler'
import { ExportResultArchiveStructure } from '../../shared/utilities/download'
import { JDKVersion, TransformationType } from '../../codewhisperer'

describe('Transformation History Handler', function () {
    function setupFileSystemMocks() {
        const createdFiles = new Map<string, string>()
        const createdDirs = new Set<string>()

        // Mock file operations to track what gets created
        sinon.stub(fs, 'mkdir').callsFake(async (dirPath: any) => {
            createdDirs.add(dirPath.toString())
        })
        sinon.stub(fs, 'copy').callsFake(async (src: any, dest: any) => {
            createdFiles.set(dest.toString(), `copied from ${src.toString()}`)
        })
        sinon.stub(fs, 'writeFile').callsFake(async (filePath: any, content: any) => {
            createdFiles.set(filePath.toString(), content.toString())
        })
        sinon.stub(fs, 'delete').callsFake(async (filePath: any) => {
            createdFiles.delete(filePath.toString())
        })

        return { createdFiles, createdDirs }
    }

    afterEach(function () {
        sinon.restore()
    })

    describe('Reading history file', function () {
        it('Returns empty array when history file does not exist', async function () {
            sinon.stub(fs, 'existsFile').resolves(false)

            const result = await readHistoryFile()

            assert.strictEqual(result.length, 0)
        })

        it('Limits results to 10 most recent jobs', async function () {
            sinon.stub(fs, 'existsFile').resolves(true)
            sinon.stub(datetime, 'isWithin30Days').returns(true)

            let historyContent = 'date\tproject_name\tstatus\tduration\tdiff_patch\tsummary\tjob_id\n'
            for (let i = 1; i <= 15; i++) {
                historyContent += `01/${i}/25, 10:00 AM\tproject-${i}\tCOMPLETED\t5 min\t\t\tjob-${i}\n`
            }

            sinon.stub(fs, 'readFileText').resolves(historyContent)

            const result = await readHistoryFile()

            assert.strictEqual(result.length, 10)
            assert.strictEqual(result[0].jobId, 'job-15') // most recent first
            assert.strictEqual(result[9].jobId, 'job-6')
        })
    })

    describe('Writing to history file', function () {
        let writtenFiles: Map<string, string>

        beforeEach(function () {
            writtenFiles = new Map()

            // Mock file operations to capture what gets written
            sinon.stub(fs, 'mkdir').resolves()
            sinon.stub(fs, 'writeFile').callsFake(async (filePath: any, content: any) => {
                writtenFiles.set(filePath.toString(), content.toString())
            })
            sinon.stub(fs, 'appendFile').callsFake(async (filePath: any, content: any) => {
                const existing = writtenFiles.get(filePath.toString()) || ''
                writtenFiles.set(filePath.toString(), existing + content.toString())
            })
            sinon.stub(vscode.commands, 'executeCommand').resolves()
        })

        it('Creates history file with headers when it does not exist', async function () {
            sinon.stub(fs, 'existsFile').resolves(false)
            await writeToHistoryFile(
                '01/01/25, 10:00 AM',
                'test-project',
                'COMPLETED',
                '5 min',
                'job-123',
                '/job/path',
                'LANGUAGE_UPGRADE',
                'JDK8',
                'JDK17',
                '/path/here',
                'clean test-compile'
            )

            const expectedPath = path.join(os.homedir(), '.aws', 'transform', 'transformation_history.tsv')
            const fileContent = writtenFiles.get(expectedPath)

            assert(fileContent)
            assert(
                fileContent.includes(
                    'date\tproject_name\tstatus\tduration\tdiff_patch\tsummary\tjob_id\ntransformation_type\tsource_jdk_version\ttarget_jdk_version\tcustom_dependency_version_file_path\tcustom_build_command\n'
                )
            )
            assert(
                fileContent.includes(
                    `01/01/25, 10:00 AM\ttest-project\tCOMPLETED\t5 min\t${path.join('/job/path', 'diff.patch')}\t${path.join('/job/path', 'summary', 'summary.md')}\tjob-123\tLANGUAGE_UPGRADE\tJDK8\tJDK17\t/path/here\tclean test-compile\n`
                )
            )
        })

        it('Excludes artifact paths for failed jobs', async function () {
            sinon.stub(fs, 'existsFile').resolves(false)
            await writeToHistoryFile(
                '01/01/25, 10:00 AM',
                'test-project',
                'FAILED',
                '5 min',
                'job-123',
                '/job/path',
                'LANGUAGE_UPGRADE',
                'JDK8',
                'JDK17',
                '/path/here',
                'clean test-compile'
            )

            const expectedPath = path.join(os.homedir(), '.aws', 'transform', 'transformation_history.tsv')
            const fileContent = writtenFiles.get(expectedPath)

            const lines = fileContent?.split('\n') || []
            const jobLine = lines.find((line) => line.includes('job-123'))
            const fields = jobLine?.split('\t') || []

            assert.strictEqual(fields[4], '') // diff path should be empty
            assert.strictEqual(fields[5], '') // summary path should be empty
        })

        it('Appends new job to existing history file', async function () {
            const existingContent =
                'date\tproject_name\tstatus\tduration\tdiff_patch\tsummary\tjob_id\n' +
                '12/31/24, 09:00 AM\told-project\tCOMPLETED\t3 min\t/old/diff.patch\t/old/summary.md\told-job-456\t/old/path\tLANGUAGE_UPGRADE\tJDK8\tJDK17\t/old/path2\tclean test-compile\n'

            writtenFiles.set(
                path.join(os.homedir(), '.aws', 'transform', 'transformation_history.tsv'),
                existingContent
            )

            sinon.stub(fs, 'existsFile').resolves(true)

            await writeToHistoryFile(
                '01/01/25, 10:00 AM',
                'new-project',
                'FAILED',
                '2 min',
                'new-job-789',
                '/new/path',
                'LANGUAGE_UPGRADE',
                'JDK8',
                'JDK17',
                '/path/here',
                'clean test-compile'
            )

            const expectedPath = path.join(os.homedir(), '.aws', 'transform', 'transformation_history.tsv')
            const fileContent = writtenFiles.get(expectedPath)

            // Verify old data is preserved
            assert(
                fileContent?.includes(
                    'old-project\tCOMPLETED\t3 min\t/old/diff.patch\t/old/summary.md\told-job-456\t/old/path\tLANGUAGE_UPGRADE\tJDK8\tJDK17\t/old/path2\tclean test-compile\n'
                )
            )

            // Verify new data is added
            assert(fileContent?.includes('new-project\tFAILED\t2 min\t\t\tnew-job-789'))

            // Verify both jobs are present and that new job is at bottom of file
            const lines = fileContent?.split('\n').filter((line) => line.trim()) || []
            assert.strictEqual(lines.length, 3) // header + 2 job lines
            assert(lines[1].includes('old-job-456'))
            assert(lines[2].includes('new-job-789'))
        })
    })

    describe('Metadata file operations', function () {
        let createdFiles: Map<string, string>
        let createdDirs: Set<string>

        const mockMetadata: JobMetadata = {
            jobId: 'test-job-123',
            projectName: 'test-project',
            transformationType: TransformationType.LANGUAGE_UPGRADE,
            sourceJDKVersion: JDKVersion.JDK8,
            targetJDKVersion: JDKVersion.JDK17,
            customDependencyVersionFilePath: '',
            customBuildCommand: '',
            targetJavaHome: '',
            projectPath: '/path/to/project',
            startTime: '01/01/24, 10:00 AM',
        }

        beforeEach(function () {
            const mocks = setupFileSystemMocks()
            createdFiles = mocks.createdFiles
            createdDirs = mocks.createdDirs
        })

        it('Creates job history directory and metadata files', async function () {
            const result = await createMetadataFile('/path/to/payload.zip', mockMetadata)

            const expectedPath = path.join(os.homedir(), '.aws', 'transform', 'test-project', 'test-job-123')
            assert.strictEqual(result, expectedPath)

            // Verify directory was created
            assert(createdDirs.has(expectedPath))

            // Verify zipped-code.zip was copied
            const zipPath = path.join(expectedPath, 'zipped-code.zip')
            assert(createdFiles.has(zipPath))
            assert.strictEqual(createdFiles.get(zipPath), 'copied from /path/to/payload.zip')

            // Verify metadata.json was created with correct content
            const metadataPath = path.join(expectedPath, 'metadata.json')
            assert(createdFiles.has(metadataPath))
            assert.strictEqual(createdFiles.get(metadataPath), JSON.stringify(mockMetadata))
        })

        it('Deletes payload, build logs, and metadata files', async function () {
            // Pre-populate files that would exist
            createdFiles.set('/payload.zip', 'payload content')
            createdFiles.set(path.join(os.tmpdir(), 'build-logs.txt'), 'build logs')
            createdFiles.set(path.join('/job/path', 'metadata.json'), 'metadata')
            createdFiles.set(path.join('/job/path', 'zipped-code.zip'), 'zip content')

            await cleanupTempJobFiles('/job/path', 'COMPLETED', '/payload.zip')

            // Verify files were deleted (no longer exist in createdFiles)
            assert(!createdFiles.has('/payload.zip'))
            assert(!createdFiles.has(path.join(os.tmpdir(), 'build-logs.txt')))
            assert(!createdFiles.has(path.join('/job/path', 'metadata.json')))
            assert(!createdFiles.has(path.join('/job/path', 'zipped-code.zip')))
        })

        it('Preserves metadata for failed jobs', async function () {
            // Pre-populate files that would exist
            createdFiles.set(path.join('/job/path', 'metadata.json'), 'metadata')
            createdFiles.set(path.join('/job/path', 'zipped-code.zip'), 'zip content')

            await cleanupTempJobFiles('/job/path', 'FAILED')

            // Verify metadata files still exist (were NOT deleted)
            assert(createdFiles.has(path.join('/job/path', 'metadata.json')))
            assert(createdFiles.has(path.join('/job/path', 'zipped-code.zip')))
        })
    })

    describe('Copying artifacts', function () {
        let createdFiles: Map<string, string>
        let createdDirs: Set<string>

        beforeEach(function () {
            const mocks = setupFileSystemMocks()
            createdFiles = mocks.createdFiles
            createdDirs = mocks.createdDirs
        })

        it('Copies diff patch and summary files to destination', async function () {
            await copyArtifacts(path.join('archive', 'path'), path.join('destination', 'path'))

            // Verify directories were created
            assert(createdDirs.has(path.join('destination', 'path')))
            assert(createdDirs.has(path.join('destination', 'path', 'summary')))

            // Verify files were copied to correct locations
            assert(createdFiles.has(path.join('destination', 'path', 'diff.patch')))
            assert(createdFiles.has(path.join('destination', 'path', 'summary', 'summary.md')))

            // Verify source paths are correct
            const diffSource = createdFiles.get(path.join('destination', 'path', 'diff.patch'))
            const summarySource = createdFiles.get(path.join('destination', 'path', 'summary', 'summary.md'))
            assert(diffSource?.includes(path.normalize(ExportResultArchiveStructure.PathToDiffPatch)))
            assert(summarySource?.includes(path.normalize(ExportResultArchiveStructure.PathToSummary)))
        })
    })

    describe('Refreshing jobs', function () {
        let createdFiles: Map<string, string>
        let createdDirs: Set<string>
        let writtenFiles: Map<string, string>

        beforeEach(function () {
            createdFiles = new Map()
            createdDirs = new Set()
            writtenFiles = new Map()

            // Mock file operations to track what gets created/written
            sinon.stub(vscode.commands, 'executeCommand').resolves()
            sinon.stub(fs, 'mkdir').callsFake(async (dirPath: any) => {
                createdDirs.add(dirPath.toString())
            })
            sinon.stub(fs, 'copy').callsFake(async (src: any, dest: any) => {
                createdFiles.set(dest.toString(), `copied from ${src.toString()}`)
            })
            sinon.stub(fs, 'delete').resolves()
            sinon.stub(fs, 'writeFile').callsFake(async (filePath: any, content: any) => {
                writtenFiles.set(filePath.toString(), content.toString())
            })
            sinon.stub(fs, 'appendFile').callsFake(async (filePath: any, content: any) => {
                const existing = writtenFiles.get(filePath.toString()) || ''
                writtenFiles.set(filePath.toString(), existing + content.toString())
            })
            sinon.stub(transformApiHandler, 'downloadAndExtractResultArchive').resolves()
        })

        it('Updates job status and downloads artifacts', async function () {
            const mockResponse = {
                transformationJob: {
                    status: 'COMPLETED',
                    endExecutionTime: new Date(),
                    creationTime: new Date(Date.now() - 300000),
                },
            } as any
            sinon.stub(codeWhispererClient, 'codeModernizerGetCodeTransformation').resolves(mockResponse)

            // Mock existsFile to return false for diff.patch but true for history file
            sinon.stub(fs, 'existsFile').callsFake(async (filePath: any) => {
                const pathStr = filePath.toString()
                if (pathStr.includes('diff.patch')) {
                    return false // Artifacts don't exist yet, need to download
                }
                return true // History file exists
            })

            // Mock history file content for update
            const historyContent =
                'date\tproject_name\tstatus\tduration\tdiff_patch\tsummary\tjob_id\n' +
                '01/01/24, 10:00 AM\ttest-project\tFAILED\t\t\t\tjob-123\n'
            sinon.stub(fs, 'readFileText').resolves(historyContent)

            await refreshJob('job-123', 'FAILED', 'test-project')

            // Verify artifacts were copied to job history path
            const jobHistoryPath = path.join(os.homedir(), '.aws', 'transform', 'test-project', 'job-123')
            assert(createdFiles.has(path.join(jobHistoryPath, 'diff.patch')))
            assert(createdFiles.has(path.join(jobHistoryPath, 'summary', 'summary.md')))

            // Verify history file was updated with new status and artifact paths
            const historyFilePath = path.join(os.homedir(), '.aws', 'transform', 'transformation_history.tsv')
            const updatedContent = writtenFiles.get(historyFilePath)
            assert(updatedContent?.includes('COMPLETED'))
            assert(updatedContent?.includes('diff.patch'))
            assert(updatedContent?.includes('summary.md'))
        })
    })
})

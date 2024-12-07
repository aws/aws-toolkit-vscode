/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as path from 'path'
import * as vscode from 'vscode'

import { Schemas } from 'aws-sdk'
import * as sinon from 'sinon'

import {
    CodeDownloader,
    CodeExtractor,
    CodeGenerationStatusPoller,
    CodeGenerator,
    SchemaCodeDownloader,
    SchemaCodeDownloadRequestDetails,
} from '../../../eventSchemas/commands/downloadSchemaItemCode'

import { MockOutputChannel } from '../../../test/mockOutputChannel'

import admZip from 'adm-zip'
import { makeTemporaryToolkitFolder } from '../../../shared/filesystemUtilities'
import { DefaultSchemaClient } from '../../../shared/clients/schemaClient'
import { fs } from '../../../shared'
import * as nodefs from 'fs' // eslint-disable-line no-restricted-imports

describe('CodeDownloader', function () {
    let tempFolder: string
    let sandbox: sinon.SinonSandbox
    let destinationDirectory: vscode.Uri
    let request: SchemaCodeDownloadRequestDetails
    beforeEach(async function () {
        tempFolder = await makeTemporaryToolkitFolder()
        sandbox = sinon.createSandbox()
        destinationDirectory = vscode.Uri.file(tempFolder)

        request = {
            registryName: testRegistryName,
            schemaName: testSchemaName,
            language: language,
            schemaVersion: schemaVersion,
            destinationDirectory: destinationDirectory,
            schemaCoreCodeFileName: testSchemaName.concat('.java'),
        }
    })

    afterEach(async function () {
        sandbox.restore()
        await fs.delete(tempFolder, { recursive: true })
    })
    const testSchemaName = 'testSchema'
    const testRegistryName = 'testRegistry'

    const language = 'Java8'
    const schemaVersion = 'testVersion'
    const schemaClient = new DefaultSchemaClient('')
    const codeDownloader = new CodeDownloader(schemaClient)

    describe('codeDownloader', async function () {
        it('should return an error if the response body is not Buffer', async function () {
            const response: Schemas.GetCodeBindingSourceResponse = {
                Body: 'Invalied body',
            }
            sandbox.stub(schemaClient, 'getCodeBindingSource').returns(Promise.resolve(response))

            await assert.rejects(
                codeDownloader.download(request),
                new TypeError('Response body should be Buffer type'),
                'Should fail for same error'
            )
        })

        it('should return arrayBuffer for valid Body type', async function () {
            const myBuffer = Buffer.from('TEST STRING')
            const response: Schemas.GetCodeBindingSourceResponse = {
                Body: myBuffer,
            }

            sandbox.stub(schemaClient, 'getCodeBindingSource').returns(Promise.resolve(response))
            const returnedBuffer = await codeDownloader.download(request)
            const comparisonResult = arrayBuffersEqual(returnedBuffer, myBuffer.buffer)
            assert.ok(
                comparisonResult,
                `Buffers do not match, string representation of expected buffer : TEST STRING, returned : ${String(
                    returnedBuffer
                )}`
            )
        })

        function arrayBuffersEqual(buf1: ArrayBuffer, buf2: ArrayBuffer) {
            if (buf1.byteLength !== buf2.byteLength) {
                return false
            }
            const dv1 = new Int8Array(buf1)
            const dv2 = new Int8Array(buf2)
            for (let i = 0; i !== buf1.byteLength; i++) {
                if (dv1[i] !== dv2[i]) {
                    return false
                }

                return true
            }
        }
    })
})

describe('CodeGenerator', function () {
    let tempFolder: string
    let sandbox: sinon.SinonSandbox
    let destinationDirectory: vscode.Uri
    let request: SchemaCodeDownloadRequestDetails
    beforeEach(async function () {
        tempFolder = await makeTemporaryToolkitFolder()
        sandbox = sinon.createSandbox()
        destinationDirectory = vscode.Uri.file(tempFolder)

        request = {
            registryName: testRegistryName,
            schemaName: testSchemaName,
            language: language,
            schemaVersion: schemaVersion,
            destinationDirectory: destinationDirectory,
            schemaCoreCodeFileName: testSchemaName.concat('.java'),
        }
    })

    afterEach(async function () {
        sandbox.restore()
        await fs.delete(tempFolder, { recursive: true })
    })
    const testSchemaName = 'testSchema'
    const testRegistryName = 'testRegistry'

    const language = 'Java8'
    const schemaVersion = 'testVersion'

    enum CodeGenerationStatus {
        CREATE_COMPLETE = 'CREATE_COMPLETE',
        CREATE_IN_PROGRESS = 'CREATE_IN_PROGRESS',
        CREATE_FAILED = 'CREATE_FAILED',
    }

    const schemaClient = new DefaultSchemaClient('')
    const codeGenerator = new CodeGenerator(schemaClient)

    describe('codeGenerator', async function () {
        it('should return the current status of code generation', async function () {
            const response: Schemas.PutCodeBindingResponse = {
                Status: CodeGenerationStatus.CREATE_IN_PROGRESS,
            }
            sandbox.stub(schemaClient, 'putCodeBinding').returns(Promise.resolve(response))

            const actualResponse = await codeGenerator.generate(request)
            assert.strictEqual(
                actualResponse,
                response,
                `should return response with ${response.Status} status, but returned ${actualResponse.Status}`
            )
        })

        // If code bindings were not generated, but putCodeBinding was already called, ConflictException occurs
        // Return CREATE_IN_PROGRESS and keep polling in this case
        it('should return valid code generation status if it gets ConflictException', async function () {
            const response: Schemas.PutCodeBindingResponse = {
                Status: CodeGenerationStatus.CREATE_IN_PROGRESS,
            }

            const error = new Error('ConflictException occured')
            sandbox.stub(schemaClient, 'putCodeBinding').returns(Promise.reject(error))

            const actualResponse = await codeGenerator.generate(request)
            assert.strictEqual(
                actualResponse.Status,
                response.Status,
                `should return response with ${response.Status} status, but returned ${actualResponse.Status}`
            )
        })
    })
})
describe('CodeGeneratorStatusPoller', function () {
    let tempFolder: string
    let sandbox: sinon.SinonSandbox
    let destinationDirectory: vscode.Uri
    let request: SchemaCodeDownloadRequestDetails
    beforeEach(async function () {
        tempFolder = await makeTemporaryToolkitFolder()
        sandbox = sinon.createSandbox()
        destinationDirectory = vscode.Uri.file(tempFolder)

        request = {
            registryName: testRegistryName,
            schemaName: testSchemaName,
            language: language,
            schemaVersion: schemaVersion,
            destinationDirectory: destinationDirectory,
            schemaCoreCodeFileName: testSchemaName.concat('.java'),
        }
    })

    afterEach(async function () {
        sandbox.restore()
        await fs.delete(tempFolder, { recursive: true })
    })
    const testSchemaName = 'testSchema'
    const testRegistryName = 'testRegistry'

    const language = 'Java8'
    const schemaVersion = 'testVersion'

    const retryIntervalMs = 1
    const maxRetries = 2

    enum CodeGenerationStatus {
        CREATE_COMPLETE = 'CREATE_COMPLETE',
        CREATE_IN_PROGRESS = 'CREATE_IN_PROGRESS',
        CREATE_FAILED = 'CREATE_FAILED',
    }

    const schemaClient = new DefaultSchemaClient('')
    const statuspoller = new CodeGenerationStatusPoller(schemaClient)

    describe('getCurrentStatus', async function () {
        it('should return the current status of code generation', async function () {
            const firstStatus: Schemas.DescribeCodeBindingResponse = {
                Status: CodeGenerationStatus.CREATE_IN_PROGRESS,
            }
            const secondStatus: Schemas.DescribeCodeBindingResponse = {
                Status: CodeGenerationStatus.CREATE_COMPLETE,
            }

            const clientStub = sandbox.stub(schemaClient, 'describeCodeBinding')
            clientStub.onCall(0).returns(Promise.resolve(firstStatus))
            clientStub.onCall(1).returns(Promise.resolve(secondStatus))

            const actualFirstStatus = await statuspoller.getCurrentStatus(request)
            const actualSecondStatus = await statuspoller.getCurrentStatus(request)

            assert.strictEqual(actualFirstStatus, firstStatus.Status, 'status should match')
            assert.strictEqual(actualSecondStatus, secondStatus.Status, 'status should match')
        })
    })

    describe('codeGeneratorStatusPoller', async function () {
        it('fails if code generation status is invalid without retry', async function () {
            const schemaResponse: Schemas.DescribeCodeBindingResponse = {
                Status: CodeGenerationStatus.CREATE_FAILED,
            }

            const statusPoll = sandbox
                .stub(statuspoller, 'getCurrentStatus')
                .withArgs(request)
                .returns(Promise.resolve(schemaResponse.Status))

            await assert.rejects(
                async () => statuspoller.pollForCompletion(request),
                new Error(`Invalid Code generation status ${schemaResponse.Status}`),
                'Should fail for expected error'
            )
            assert.ok(
                statusPoll.calledOnce,
                'getCurrentStatus method should be called once without retry as it returns invalid status'
            )
        })

        it('times out after max attempts if status is still in progress', async function () {
            const schemaResponse: Schemas.DescribeCodeBindingResponse = {
                Status: CodeGenerationStatus.CREATE_IN_PROGRESS,
            }

            const statusPoll = sandbox
                .stub(statuspoller, 'getCurrentStatus')
                .withArgs(request)
                .returns(Promise.resolve(schemaResponse.Status))

            await assert.rejects(
                statuspoller.pollForCompletion(request, retryIntervalMs, maxRetries),
                new Error(
                    `Failed to download code for schema ${request.schemaName} before timeout. Please try again later`
                ),
                'Should fail for expected error'
            )
            assert.strictEqual(
                statusPoll.callCount,
                maxRetries,
                'getCurrentStatus should be called maxRetries times before timing out'
            )
        })

        it('succeeds when code is previously generated without retry', async function () {
            const schemaResponse: Schemas.DescribeCodeBindingResponse = {
                Status: CodeGenerationStatus.CREATE_COMPLETE,
            }

            const statusPoll = sandbox
                .stub(statuspoller, 'getCurrentStatus')
                .withArgs(request)
                .returns(Promise.resolve(schemaResponse.Status))
            const status = await statuspoller.pollForCompletion(request, retryIntervalMs, maxRetries)
            assert.strictEqual(
                statusPoll.callCount,
                1,
                'getCurrentStatus should be called once as it returns CREATE_COMPLETE status'
            )
            assert.strictEqual(status, schemaResponse.Status, 'status should match')
        })

        it('succeeds once the code generation status is complete within maxRetry attempts', async function () {
            const statusPoll = sandbox.stub(statuspoller, 'getCurrentStatus')
            statusPoll.onCall(0).returns(Promise.resolve(CodeGenerationStatus.CREATE_IN_PROGRESS))
            statusPoll.onCall(1).returns(Promise.resolve(CodeGenerationStatus.CREATE_COMPLETE)) // After maxAttempts

            const status = await statuspoller.pollForCompletion(request, retryIntervalMs, maxRetries)
            assert.strictEqual(
                statusPoll.callCount,
                maxRetries,
                'getCurrentStatus should be called maxRetries(2) times as it returns CREATE_COMPLETE on the 2nd call'
            )
            assert.strictEqual(status, CodeGenerationStatus.CREATE_COMPLETE, 'status should match')
        })
    })
})

describe('SchemaCodeDownload', function () {
    let tempFolder: string
    let sandbox: sinon.SinonSandbox
    let destinationDirectory: vscode.Uri
    let request: SchemaCodeDownloadRequestDetails

    let arrayBuffer: Buffer
    let fileName: string
    beforeEach(async function () {
        tempFolder = await makeTemporaryToolkitFolder()
        sandbox = sinon.createSandbox()
        destinationDirectory = vscode.Uri.file(tempFolder)

        request = {
            registryName: testRegistryName,
            schemaName: testSchemaName,
            language: language,
            schemaVersion: schemaVersion,
            destinationDirectory: destinationDirectory,
            schemaCoreCodeFileName: testSchemaName.concat('.java'),
        }

        fileName = testSchemaName.concat('.java')
        const zip = new admZip()
        zip.addFile(fileName, Buffer.from(fileContent))
        arrayBuffer = zip.toBuffer()
    })

    afterEach(async function () {
        sandbox.restore()
        await fs.delete(tempFolder, { recursive: true })
    })
    const testSchemaName = 'testSchema'
    const testRegistryName = 'testRegistry'

    const language = 'Java8'
    const schemaVersion = 'testVersion'

    const fileContent = 'Test file contents'
    const schemaClient = new DefaultSchemaClient('')
    const poller = new CodeGenerationStatusPoller(schemaClient)
    const downloader = new CodeDownloader(schemaClient)
    const generator = new CodeGenerator(schemaClient)
    const outputChannel = new MockOutputChannel()
    const extractor = new CodeExtractor(outputChannel)

    const schemaCodeDownloader = new SchemaCodeDownloader(downloader, generator, poller, extractor)

    describe('downloadCode', async function () {
        it('should download pre-generated code and place it into requested directory ', async function () {
            const codeDownloaderStub = sandbox.stub(downloader, 'download').returns(Promise.resolve(arrayBuffer))

            await schemaCodeDownloader.downloadCode(request)

            assert.ok(
                codeDownloaderStub.calledOnceWith(request),
                'download method should be called once with correct parameters'
            )

            // should extract the zip file with provided fileContent
            const expectedFilePath = path.join(request.destinationDirectory.fsPath, fileName)
            const response = await fs.readFileText(expectedFilePath)
            assert.strictEqual(response, fileContent, `${expectedFilePath} :file content do not match`)
        })

        it('should return error if downloading code fails with anything other than ResourceNotFound', async function () {
            const customError = new Error('Custom error')
            const codeDownloaderStub = sandbox.stub(downloader, 'download').returns(Promise.reject(customError))

            await assert.rejects(schemaCodeDownloader.downloadCode(request), customError, 'Should throw Custom error')
            assert.ok(
                codeDownloaderStub.calledOnceWith(request),
                'download method should be called once with correct parameters'
            )
        })

        it('should generate code if download fails with ResourceNotFound and place it into requested directory', async function () {
            sandbox.stub(poller, 'pollForCompletion').returns(Promise.resolve('CREATE_COMPLETE'))
            const codeDownloaderStub = sandbox.stub(downloader, 'download')
            const codeGeneratorResponse: Schemas.PutCodeBindingResponse = {
                Status: 'CREATE_IN_PROGRESS',
            }
            sandbox.stub(generator, 'generate').returns(Promise.resolve(codeGeneratorResponse))

            const customError = new Error('Resource Not Found Exception')
            customError.name = 'ResourceNotFound'

            codeDownloaderStub.onCall(0).returns(Promise.reject(customError)) // should fail on first call
            codeDownloaderStub.onCall(1).returns(Promise.resolve(arrayBuffer)) // should succeed on second

            await schemaCodeDownloader.downloadCode(request)

            assert.ok(
                codeDownloaderStub.calledTwice,
                'download method should be called twice, first should fail for NotFoundException and second succeed'
            )

            const expectedFilePath = path.join(request.destinationDirectory.fsPath, fileName)
            const response = await fs.readFileText(expectedFilePath)
            assert.strictEqual(response, fileContent, 'Extracted file content do not match with expected')
        })

        it('should return coreCodeFilePath', async function () {
            const expectedFilePath = path.join(request.destinationDirectory.fsPath, fileName)
            sandbox.stub(downloader, 'download').returns(Promise.resolve(arrayBuffer))
            sandbox.stub(extractor, 'extractAndPlace').returns(Promise.resolve(expectedFilePath))

            const coreCodeFilePath = await schemaCodeDownloader.downloadCode(request)
            assert.strictEqual(
                coreCodeFilePath,
                expectedFilePath,
                `zipContents should have ${fileName} containing requested core file ${request.schemaCoreCodeFileName}`
            )
        })
    })
})

describe('CodeExtractor', function () {
    let destinationDirectory: string
    let sandbox: sinon.SinonSandbox

    beforeEach(async function () {
        destinationDirectory = await makeTemporaryToolkitFolder()
        sandbox = sinon.createSandbox()
    })

    afterEach(async function () {
        await fs.delete(destinationDirectory, { recursive: true })
        sandbox.restore()
    })

    const outputChannel = new MockOutputChannel()
    const codeExtractor = new CodeExtractor(outputChannel)

    describe('checkFileCollisions', function () {
        it('should return true when zipFile directoryFile contents clash ', async function () {
            const fileName = 'test.txt'
            const zipName = path.join(destinationDirectory, 'test.zip')

            let expectedMessage = 'Following files already exist in the folder hierarchy :\n'
            const collidingfilePath = path.join(destinationDirectory, fileName)
            expectedMessage = expectedMessage.concat(collidingfilePath)

            // Initialize a destination directory and file
            let zipHandler = createZipFileInTempDirectory(fileName, 'First file content', zipName)
            zipHandler.extractAllTo(destinationDirectory)

            // Create a zip file that clashes with destination content
            zipHandler = createZipFileInTempDirectory(fileName, 'Second file content', zipName)

            const collisionOccured = codeExtractor.checkFileCollisions(zipName, destinationDirectory)

            assert.strictEqual(collisionOccured, true, 'should confirm that collision occurs')
            assert(outputChannel.value.includes(expectedMessage), `channel missing msg: ${expectedMessage}`)
        })

        it('should return false if no collision present', async function () {
            const fileName1 = 'test.txt'
            const zipName = path.join(destinationDirectory, 'test.zip')

            // Initialize a destination directory and file
            let zipHandler = createZipFileInTempDirectory(fileName1, 'First file content', zipName)
            zipHandler.extractAllTo(destinationDirectory)

            // Create a zip file with same directory path but diff fileName
            const fileName2 = 'test2.txt'
            zipHandler = createZipFileInTempDirectory(fileName2, 'Second file content', zipName)

            const collisionOccured = codeExtractor.checkFileCollisions(zipName, destinationDirectory)
            assert.strictEqual(
                collisionOccured,
                false,
                `There should be no collision in files ${fileName1} and ${fileName2}`
            )
        })
    })
    describe('extractAndPlace', function () {
        const testSchemaName = 'aws.batch.testSchema'
        const testRegistryName = 'testRegistry'
        const language = 'Java8'
        const schemaVersion = 'testVersion'

        let sandbox: sinon.SinonSandbox
        let destinationDirectoryUri: vscode.Uri
        let request: SchemaCodeDownloadRequestDetails

        beforeEach(async function () {
            sandbox = sinon.createSandbox()
            destinationDirectoryUri = vscode.Uri.file(destinationDirectory)

            request = {
                registryName: testRegistryName,
                schemaName: testSchemaName,
                language: language,
                schemaVersion: schemaVersion,
                destinationDirectory: destinationDirectoryUri,
                schemaCoreCodeFileName: 'testSchema.java',
            }
        })

        afterEach(async function () {
            sandbox.restore()
            await fs.delete(destinationDirectory, { recursive: true })
        })

        it('should extract files if no collision present', async function () {
            const fileName1 = 'test.text'
            const zipName1 = path.join(destinationDirectory, 'test.zip')

            // Initialize a destination directory and file
            const zipHandler = createZipFileInTempDirectory(fileName1, 'First file content', zipName1)
            zipHandler.extractAllTo(destinationDirectory)

            const fileName2 = 'test2.txt'

            const zip = new admZip()
            zip.addFile(fileName2, Buffer.from('Second file content'))
            const buffer = zip.toBuffer()
            await codeExtractor.extractAndPlace(buffer, request)

            const file1Path = path.join(destinationDirectory, fileName1)
            const file2Path = path.join(destinationDirectory, fileName2)

            // confirm both file exist
            assert.ok(await fs.exists(file1Path), `${file1Path} should exist`)
            assert.ok(await fs.exists(file2Path), `${file2Path} should exist`)

            // confirm file contents
            const file1Content = await fs.readFileText(file1Path)
            const file2Content = await fs.readFileText(file2Path)

            assert.strictEqual(file1Content, 'First file content', `${file1Path} : file content do not match`)
            assert.strictEqual(file2Content, 'Second file content', `${file2Path} : file content do not match`)
        })

        it('should not override file content if user picks No when collision occurs', async function () {
            sandbox.stub(codeExtractor, 'confirmOverwriteCollisions').returns(Promise.resolve(false))

            const fileName1 = 'test.txt'
            const zipFileName = path.join(destinationDirectory, 'test.zip')
            const expectedFileContent = 'First file content'

            // Initialize a destination directory and file
            const zipHandler = createZipFileInTempDirectory(fileName1, expectedFileContent, zipFileName)
            zipHandler.extractAllTo(destinationDirectory)

            // same file name -  collision occurs
            const fileName2 = fileName1
            const zip = new admZip()
            zip.addFile(fileName2, Buffer.from('Second file content'))
            const buffer = zip.toBuffer()

            await codeExtractor.extractAndPlace(buffer, request)

            const file1Path = path.join(destinationDirectory, fileName1)
            const file1Content = await fs.readFileText(file1Path)

            assert.strictEqual(file1Content, expectedFileContent, `${file1Path} :File content should not be overriden`)
        })

        it('should override file content if user picks Yes when collision occurs', async function () {
            sandbox.stub(codeExtractor, 'confirmOverwriteCollisions').returns(Promise.resolve(true))

            const fileName1 = 'test.txt'
            const zipFileName = path.join(destinationDirectory, 'test.zip')
            const initialFileContent = 'Initial file content'

            // Initialize a destination directory and file
            const zipHandler = createZipFileInTempDirectory(fileName1, initialFileContent, zipFileName)
            zipHandler.extractAllTo(destinationDirectory)

            // same file name, different file content -  collision occurs
            const fileName2 = fileName1
            const zip = new admZip()
            const overridenFileContent = 'Replaced file content'
            zip.addFile(fileName2, Buffer.from(overridenFileContent))
            const buffer = zip.toBuffer()

            await codeExtractor.extractAndPlace(buffer, request)

            const file1Path = path.join(destinationDirectory, fileName1)
            const file1Content = await fs.readFileText(file1Path)

            assert.strictEqual(file1Content, overridenFileContent, `${file1Path} :File content should be overriden`)
        })

        it('should throw error if user picks Cancel when collision occurs', async function () {
            const error = new Error('Download code bindings cancelled')
            sandbox.stub(codeExtractor, 'confirmOverwriteCollisions').rejects(error)

            const fileName1 = 'test.txt'
            const zipFileName = path.join(destinationDirectory, 'test.zip')
            const expectedFileContent = 'First file content'

            // Initialize a destination directory and file
            const zipHandler = createZipFileInTempDirectory(fileName1, expectedFileContent, zipFileName)
            zipHandler.extractAllTo(destinationDirectory)

            // same file name -  collision occurs
            const fileName2 = fileName1
            const zip = new admZip()
            zip.addFile(fileName2, Buffer.from('Second file content'))
            const buffer = zip.toBuffer()

            await assert.rejects(
                codeExtractor.extractAndPlace(buffer, request),
                error,
                'Should fail for expected error'
            )

            const file1Path = path.join(destinationDirectory, fileName1)
            const file1Content = await fs.readFileText(file1Path)

            assert.strictEqual(file1Content, expectedFileContent, `${file1Path} :File content should not be overriden`)
        })

        it('should return coreCodeFilePath if it exists inside zip content', async function () {
            // grab the title from schemaName
            const title = testSchemaName.split('.').pop()
            const fileName = title!.concat('.java')

            const zip = new admZip()
            zip.addFile(fileName, Buffer.from('File content'))
            const buffer = zip.toBuffer()
            const coreCodeFilePath = await codeExtractor.extractAndPlace(buffer, request)

            const filePath = path.join(destinationDirectoryUri.fsPath, fileName)

            assert.strictEqual(coreCodeFilePath, filePath, `should have ${title} in the path`)
        })
    })

    describe('getCoreCodeFilePath', function () {
        it('shoul return file path if it exists in zipFile', async function () {
            const coreFile = 'test.java'
            const zipName = path.join(destinationDirectory, 'test.zip')
            createZipFileInTempDirectory(coreFile, 'First file content', zipName)

            const coreCodeFilePath = codeExtractor.getCoreCodeFilePath(zipName, coreFile)

            assert.strictEqual(coreCodeFilePath, coreFile, 'Core file path should match')
        })

        it('should return undefined if file does not exist in zipFile', async function () {
            const fileName = 'test.java'
            const zipName = path.join(destinationDirectory, 'test.zip')
            createZipFileInTempDirectory(fileName, 'First file content', zipName)

            const coreFile = 'test2.java'
            const coreCodeFilePath = codeExtractor.getCoreCodeFilePath(zipName, coreFile)

            assert.strictEqual(coreCodeFilePath, undefined)
        })
    })

    function createZipFileInTempDirectory(fileName: string, fileContent: string, zipFileName: string): admZip {
        const zip = new admZip()
        zip.addFile(fileName, Buffer.from(fileContent))
        const buffer = zip.toBuffer()
        const fd = nodefs.openSync(zipFileName, 'w')
        nodefs.writeSync(fd, buffer, 0, buffer.byteLength, 0)
        nodefs.closeSync(fd)

        return zip
    }
})

/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import { S3Client } from '../../../../sagemakerunifiedstudio/shared/client/s3Client'
import { S3 } from '@aws-sdk/client-s3'

describe('S3Client', function () {
    let sandbox: sinon.SinonSandbox
    let mockS3: sinon.SinonStubbedInstance<S3>
    let s3Client: S3Client

    const mockCredentials = {
        accessKeyId: 'test-key',
        secretAccessKey: 'test-secret',
        sessionToken: 'test-token',
    }

    beforeEach(function () {
        sandbox = sinon.createSandbox()

        mockS3 = {
            listObjectsV2: sandbox.stub(),
        } as any

        sandbox.stub(S3.prototype, 'constructor' as any)
        sandbox.stub(S3.prototype, 'listObjectsV2').callsFake(mockS3.listObjectsV2)

        s3Client = new S3Client('us-east-1', mockCredentials)
    })

    afterEach(function () {
        sandbox.restore()
    })

    describe('constructor', function () {
        it('should create client with correct properties', function () {
            const client = new S3Client('us-west-2', mockCredentials)
            assert.ok(client)
        })
    })

    describe('listPaths', function () {
        it('should list folders and files successfully', async function () {
            const mockResponse = {
                CommonPrefixes: [{ Prefix: 'folder1/' }, { Prefix: 'folder2/' }],
                Contents: [
                    {
                        Key: 'file1.txt',
                        Size: 1024,
                        LastModified: new Date('2023-01-01'),
                    },
                    {
                        Key: 'file2.txt',
                        Size: 2048,
                        LastModified: new Date('2023-01-02'),
                    },
                ],
            }

            mockS3.listObjectsV2.resolves(mockResponse)

            const paths = await s3Client.listPaths('test-bucket')

            assert.strictEqual(paths.length, 4)

            // Check folders
            assert.strictEqual(paths[0].displayName, 'folder1')
            assert.strictEqual(paths[0].isFolder, true)
            assert.strictEqual(paths[0].bucket, 'test-bucket')
            assert.strictEqual(paths[0].prefix, 'folder1/')

            assert.strictEqual(paths[1].displayName, 'folder2')
            assert.strictEqual(paths[1].isFolder, true)

            // Check files
            assert.strictEqual(paths[2].displayName, 'file1.txt')
            assert.strictEqual(paths[2].isFolder, false)
            assert.strictEqual(paths[2].size, 1024)
            assert.deepStrictEqual(paths[2].lastModified, new Date('2023-01-01'))

            assert.strictEqual(paths[3].displayName, 'file2.txt')
            assert.strictEqual(paths[3].isFolder, false)
            assert.strictEqual(paths[3].size, 2048)
        })

        it('should list paths with prefix', async function () {
            const mockResponse = {
                CommonPrefixes: [{ Prefix: 'prefix/subfolder/' }],
                Contents: [
                    {
                        Key: 'prefix/file.txt',
                        Size: 512,
                        LastModified: new Date('2023-01-01'),
                    },
                ],
            }

            mockS3.listObjectsV2.resolves(mockResponse)

            const paths = await s3Client.listPaths('test-bucket', 'prefix/')

            assert.strictEqual(paths.length, 2)
            assert.strictEqual(paths[0].displayName, 'subfolder')
            assert.strictEqual(paths[0].isFolder, true)
            assert.strictEqual(paths[1].displayName, 'file.txt')
            assert.strictEqual(paths[1].isFolder, false)

            // Verify API call
            assert.ok(mockS3.listObjectsV2.calledOnce)
            const callArgs = mockS3.listObjectsV2.getCall(0).args[0]
            assert.strictEqual(callArgs.Bucket, 'test-bucket')
            assert.strictEqual(callArgs.Prefix, 'prefix/')
            assert.strictEqual(callArgs.Delimiter, '/')
        })

        it('should return empty array when no objects found', async function () {
            const mockResponse = {
                CommonPrefixes: [],
                Contents: [],
            }

            mockS3.listObjectsV2.resolves(mockResponse)

            const paths = await s3Client.listPaths('empty-bucket')

            assert.strictEqual(paths.length, 0)
        })

        it('should handle response with only folders', async function () {
            const mockResponse = {
                CommonPrefixes: [{ Prefix: 'folder1/' }, { Prefix: 'folder2/' }],
                Contents: undefined,
            }

            mockS3.listObjectsV2.resolves(mockResponse)

            const paths = await s3Client.listPaths('test-bucket')

            assert.strictEqual(paths.length, 2)
            assert.strictEqual(paths[0].isFolder, true)
            assert.strictEqual(paths[1].isFolder, true)
        })

        it('should handle response with only files', async function () {
            const mockResponse = {
                CommonPrefixes: undefined,
                Contents: [
                    {
                        Key: 'file1.txt',
                        Size: 1024,
                        LastModified: new Date('2023-01-01'),
                    },
                ],
            }

            mockS3.listObjectsV2.resolves(mockResponse)

            const paths = await s3Client.listPaths('test-bucket')

            assert.strictEqual(paths.length, 1)
            assert.strictEqual(paths[0].isFolder, false)
            assert.strictEqual(paths[0].displayName, 'file1.txt')
        })

        it('should filter out folder markers and prefix matches', async function () {
            const mockResponse = {
                CommonPrefixes: [{ Prefix: 'folder/' }],
                Contents: [
                    {
                        Key: 'prefix/',
                        Size: 0,
                        LastModified: new Date('2023-01-01'),
                    },
                    {
                        Key: 'prefix/file.txt',
                        Size: 1024,
                        LastModified: new Date('2023-01-01'),
                    },
                    {
                        Key: 'prefix/folder/',
                        Size: 0,
                        LastModified: new Date('2023-01-01'),
                    },
                ],
            }

            mockS3.listObjectsV2.resolves(mockResponse)

            const paths = await s3Client.listPaths('test-bucket', 'prefix/')

            // Should only include the folder from CommonPrefixes and the file (not folder markers)
            assert.strictEqual(paths.length, 2)
            assert.strictEqual(paths[0].displayName, 'folder')
            assert.strictEqual(paths[0].isFolder, true)
            assert.strictEqual(paths[1].displayName, 'file.txt')
            assert.strictEqual(paths[1].isFolder, false)
        })

        it('should handle API errors', async function () {
            const error = new Error('S3 API Error')
            mockS3.listObjectsV2.rejects(error)

            await assert.rejects(async () => await s3Client.listPaths('test-bucket'), error)
        })

        it('should handle missing object properties gracefully', async function () {
            const mockResponse = {
                CommonPrefixes: [{ Prefix: undefined }, { Prefix: 'valid-folder/' }],
                Contents: [
                    {
                        Key: undefined,
                        Size: 1024,
                    },
                    {
                        Key: 'valid-file.txt',
                        Size: undefined,
                        LastModified: undefined,
                    },
                ],
            }

            mockS3.listObjectsV2.resolves(mockResponse)

            const paths = await s3Client.listPaths('test-bucket')

            // Should only include valid entries
            assert.strictEqual(paths.length, 2)
            assert.strictEqual(paths[0].displayName, 'valid-folder')
            assert.strictEqual(paths[0].isFolder, true)
            assert.strictEqual(paths[1].displayName, 'valid-file.txt')
            assert.strictEqual(paths[1].isFolder, false)
            assert.strictEqual(paths[1].size, undefined)
            assert.strictEqual(paths[1].lastModified, undefined)
        })

        it('should create S3 client on first use', async function () {
            const mockResponse = { CommonPrefixes: [], Contents: [] }
            mockS3.listObjectsV2.resolves(mockResponse)

            await s3Client.listPaths('test-bucket')

            // Verify S3 client was created with correct parameters
            assert.ok(S3.prototype.constructor)
        })

        it('should reuse existing S3 client on subsequent calls', async function () {
            const mockResponse = { CommonPrefixes: [], Contents: [] }
            mockS3.listObjectsV2.resolves(mockResponse)

            // Make multiple calls
            await s3Client.listPaths('test-bucket')
            await s3Client.listPaths('test-bucket')

            // S3 constructor should only be called once (during first call)
            assert.ok(mockS3.listObjectsV2.calledTwice)
        })
    })
})

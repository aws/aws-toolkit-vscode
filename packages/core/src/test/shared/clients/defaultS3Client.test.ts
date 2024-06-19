/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { AWSError, Request, S3 } from 'aws-sdk'
import { DeleteObjectsRequest, ListObjectVersionsOutput, ListObjectVersionsRequest } from 'aws-sdk/clients/s3'
import { FileStreams } from '../../../shared/utilities/streamUtilities'
import * as vscode from 'vscode'
import { DefaultBucket, DefaultFolder, DefaultS3Client, toFile } from '../../../shared/clients/s3Client'
import { DEFAULT_DELIMITER, DEFAULT_MAX_KEYS } from '../../../shared/clients/s3Client'
import { FakeFileStreams } from './fakeFileStreams'
import globals from '../../../shared/extensionGlobals'
import sinon from 'sinon'
import { Stub, stub } from '../../utilities/stubber'

class FakeProgressCaptor {
    public progress = 0

    public listener(): (loadedBytes: number) => void {
        return loadedBytes => {
            this.progress += loadedBytes
        }
    }
}

class FakeAwsError extends Error {
    public region: string = 'us-west-2'

    public constructor(message: string) {
        super(message)
    }
}

describe('DefaultS3Client', function () {
    const partition = 'aws'
    const region = 'us-west-2'
    const bucketName = 'bucketName'
    const outOfRegionBucketName = 'outOfRegionBucketName'
    const folderPath = 'foo/bar/'
    const folderVersionId = 'folderVersionId'
    const subFolderPath = 'foo/bar/subFolder/'
    const emptySubFolderPath = 'foo/bar//'
    const fileKey = 'foo/bar/file.jpg'
    const fileVersionId = 'fileVersionId'
    const fileSizeBytes = 5
    const fileLastModified = new Date(2020, 5, 4)
    const fileData = 'fileData'
    const fileLocation = vscode.Uri.file('/file.jpg')
    const continuationToken = 'continuationToken'
    const nextContinuationToken = 'nextContinuationToken'
    const maxResults = 20
    const nextKeyMarker = 'nextKeyMarker'
    const nextVersionIdMarker = 'nextVersionIdMarker'
    const error: AWSError = new FakeAwsError('Expected failure') as AWSError
    const bucket = new DefaultBucket({ partitionId: partition, name: bucketName, region })

    let mockS3: S3

    class ListObjectVersionsFixtures {
        public readonly firstPageRequest: ListObjectVersionsRequest = {
            Bucket: bucketName,
            MaxKeys: DEFAULT_MAX_KEYS,
            KeyMarker: undefined,
            VersionIdMarker: undefined,
        }

        public readonly firstPageResponse: ListObjectVersionsOutput = {
            Versions: [
                { Key: folderPath, VersionId: folderVersionId },
                { Key: fileKey, VersionId: fileVersionId },
            ],
            IsTruncated: true,
            NextKeyMarker: nextKeyMarker,
            NextVersionIdMarker: nextVersionIdMarker,
        }

        public readonly secondPageRequest: ListObjectVersionsRequest = {
            Bucket: bucketName,
            MaxKeys: DEFAULT_MAX_KEYS,
            KeyMarker: nextKeyMarker,
            VersionIdMarker: nextVersionIdMarker,
        }

        public readonly secondPageResponse: ListObjectVersionsOutput = {
            Versions: [{ Key: fileKey, VersionId: undefined }],
            IsTruncated: false,
        }
    }

    class DeleteObjectsFixtures {
        public readonly firstRequest: DeleteObjectsRequest = {
            Bucket: bucketName,
            Delete: {
                Objects: [
                    { Key: folderPath, VersionId: folderVersionId },
                    { Key: fileKey, VersionId: fileVersionId },
                ],
                Quiet: true,
            },
        }

        public readonly secondRequest: DeleteObjectsRequest = {
            Bucket: bucketName,
            Delete: {
                Objects: [{ Key: fileKey, VersionId: undefined }],
                Quiet: true,
            },
        }
    }

    beforeEach(function () {
        mockS3 = {} as any as S3
    })

    function success<T>(output?: T): Request<T, AWSError> {
        return {
            promise: () => Promise.resolve(output),
            createReadStream() {
                return FakeFileStreams.readStreamFrom(fileData)
            },
        } as Request<any, AWSError>
    }

    function failure(): Request<any, AWSError> {
        return {
            promise: () => Promise.reject(error),
            createReadStream() {
                const readStream = FakeFileStreams.readStreamFrom(fileData)
                readStream.destroy(error)
                return readStream
            },
        } as Request<any, AWSError>
    }

    function createClient({
        regionCode = region,
        partitionId = partition,
        fileStreams = new FakeFileStreams(),
    }: { regionCode?: string; partitionId?: string; fileStreams?: FileStreams } = {}): DefaultS3Client {
        return new DefaultS3Client(regionCode, partitionId, () => Promise.resolve(mockS3), fileStreams)
    }

    describe('createBucket', function () {
        it('creates a bucket', async function () {
            const createBucketSpy = sinon.stub().returns(success())
            mockS3.createBucket = createBucketSpy

            const response = await createClient().createBucket({ bucketName })

            assert(
                createBucketSpy.calledOnceWith({
                    Bucket: bucketName,
                    CreateBucketConfiguration: { LocationConstraint: region },
                })
            )
            assert.deepStrictEqual(response, {
                bucket: new DefaultBucket({ partitionId: partition, region, name: bucketName }),
            })
        })

        it('removes the region code for us-east-1', async function () {
            const createBucketSpy = sinon.stub().returns(success())
            mockS3.createBucket = createBucketSpy

            const response = await createClient({ regionCode: 'us-east-1' }).createBucket({ bucketName })

            assert(
                createBucketSpy.calledOnceWith({
                    Bucket: bucketName,
                    CreateBucketConfiguration: undefined,
                })
            )
            assert.deepStrictEqual(response, {
                bucket: new DefaultBucket({ partitionId: partition, region: 'us-east-1', name: bucketName }),
            })
        })

        it('throws an Error on failure', async function () {
            const createBucketSpy = sinon.stub().returns(failure())
            mockS3.createBucket = createBucketSpy

            await assert.rejects(createClient().createBucket({ bucketName }), error)
        })
    })

    describe('deleteBucket', function () {
        const {
            firstPageRequest: firstList,
            secondPageRequest: secondList,
            firstPageResponse: firstListResponse,
            secondPageResponse: secondListResponse,
        } = new ListObjectVersionsFixtures()
        const anyListResponse = secondListResponse
        const { firstRequest: firstDelete, secondRequest: secondDelete } = new DeleteObjectsFixtures()
        let listStub: sinon.SinonStub
        let deleteObjStub: sinon.SinonStub
        let deleteBucketStub: sinon.SinonStub

        beforeEach(function () {
            listStub = sinon.stub()
            deleteObjStub = sinon.stub()
            deleteBucketStub = sinon.stub()

            mockS3.listObjectVersions = listStub
            mockS3.deleteObjects = deleteObjStub
            mockS3.deleteBucket = deleteBucketStub
        })

        it('empties a bucket and deletes it', async function () {
            listStub
                .onFirstCall()
                .returns(success(firstListResponse))
                .onSecondCall()
                .returns(success(secondListResponse))
            deleteObjStub.returns(success({}))
            deleteBucketStub.returns(success({}))
            await createClient().deleteBucket({ bucketName })

            assert(listStub.calledTwice)
            assert(listStub.firstCall.calledWith(firstList))
            assert(listStub.secondCall.calledWith(secondList))
            assert(deleteObjStub.calledTwice)
            assert(deleteObjStub.firstCall.calledWith(firstDelete))
            assert(deleteObjStub.secondCall.calledWith(secondDelete))
            assert(deleteBucketStub.calledOnceWith({ Bucket: bucketName }))
        })

        it('throws an Error on listObjectVersions failure', async function () {
            listStub.returns(failure())

            await assert.rejects(createClient().deleteBucket({ bucketName }), error)

            assert(deleteObjStub.notCalled)
            assert(deleteBucketStub.notCalled)
        })

        it('throws an Error on deleteObjects failure', async function () {
            listStub.returns(success(anyListResponse))
            deleteObjStub.returns(failure())

            await assert.rejects(createClient().deleteBucket({ bucketName }), error)

            assert(deleteBucketStub.notCalled)
        })

        it('throws an Error on deleteBucket failure', async function () {
            listStub.returns(success(anyListResponse))
            deleteObjStub.returns(success({}))
            deleteBucketStub.returns(failure())

            await assert.rejects(createClient().deleteBucket({ bucketName }), error)
        })
    })

    describe('createFolder', function () {
        it('creates a folder', async function () {
            const s = sinon.stub().returns(success())
            mockS3.upload = s

            const response = await createClient().createFolder({ bucketName, path: folderPath })

            assert(s.calledOnceWith({ Bucket: bucketName, Key: folderPath, Body: '' }))
            assert.deepStrictEqual(response, {
                folder: new DefaultFolder({ partitionId: partition, bucketName, path: folderPath }),
            })
        })

        it('throws an Error on failure', async function () {
            const s = sinon.stub().returns(failure())
            mockS3.upload = s

            await assert.rejects(createClient().createFolder({ bucketName, path: folderPath }), error)
        })
    })

    describe('downloadFile', function () {
        it('downloads a file', async function () {
            const s = sinon.stub().returns(success())
            mockS3.getObject = s

            const fileStreams = new FakeFileStreams({ readData: fileData })
            const progressCaptor = new FakeProgressCaptor()

            await createClient({ fileStreams }).downloadFile({
                bucketName,
                key: fileKey,
                saveLocation: fileLocation,
                progressListener: progressCaptor.listener(),
            })

            assert(s.calledOnce)
            assert.deepStrictEqual(fileStreams.writtenLocation, fileLocation)
            assert.strictEqual(fileStreams.writtenData, fileData)
            assert.ok(progressCaptor.progress > 0)
        })

        it('throws an Error on failure', async function () {
            const s = sinon.stub().returns(failure())
            mockS3.getObject = s

            await assert.rejects(
                createClient().downloadFile({
                    bucketName,
                    key: fileKey,
                    saveLocation: fileLocation,
                }),
                error
            )
        })
    })

    describe('uploadFile', function () {
        it('uploads a file', async function () {
            const mockManagedUpload = stub(S3.ManagedUpload)
            mockManagedUpload.promise.resolves({ Location: '', ETag: '', Bucket: '', Key: '' })
            mockManagedUpload.on.returns(undefined)

            const uploadStub = sinon.stub().returns(mockManagedUpload)
            mockS3.upload = uploadStub

            const fileStreams = new FakeFileStreams({ readData: fileData, readAutomatically: true })
            const progressCaptor = new FakeProgressCaptor()

            await createClient({ fileStreams }).uploadFile({
                bucketName,
                key: fileKey,
                content: fileLocation,
                progressListener: progressCaptor.listener(),
                contentType: 'image/jpeg',
            })

            assert(uploadStub.calledOnce)
            assert(mockManagedUpload.on.calledOnceWith('httpUploadProgress', sinon.match.any))
            // eslint-disable-next-line @typescript-eslint/unbound-method
            const uploadArgs: S3.PutObjectRequest = uploadStub.firstCall.args[0]
            assert.strictEqual(uploadArgs.Bucket, bucketName)
            assert.strictEqual(uploadArgs.Key, fileKey)
            assert.strictEqual(uploadArgs.ContentType, 'image/jpeg')
            assert.strictEqual(uploadArgs.Body, fileStreams.readStream)

            // eslint-disable-next-line @typescript-eslint/unbound-method
            const listener = mockManagedUpload.on.firstCall.args[1]
            listener({ loaded: 1, total: 100 })
            listener({ loaded: 2, total: 100 })
            assert.strictEqual(progressCaptor.progress, 2)
        })

        it('throws an Error on failure', async function () {
            // TODO: rejected promise here since the impl. does not await the upload anymore

            const expectedError = new Error('Expected an error')
            const mockManagedUpload = stub(S3.ManagedUpload)
            mockManagedUpload.promise.rejects(expectedError)
            mockManagedUpload.on.returns(undefined)

            const uploadStub = sinon.stub().returns(mockManagedUpload)
            mockS3.upload = uploadStub

            const managedUpload = await createClient().uploadFile({
                bucketName,
                key: fileKey,
                content: fileLocation,
            })
            try {
                await managedUpload.promise()
            } catch (e) {
                assert.strictEqual(e, expectedError)
            }
        })
    })

    describe('listBuckets', function () {
        it('lists a bucket', async function () {
            const listStub = sinon
                .stub()
                .returns(success({ Buckets: [{ Name: bucketName }, { Name: outOfRegionBucketName }] }))
            const locationStub = sinon
                .stub()
                .onFirstCall()
                .returns(success({ LocationConstraint: region }))
                .onSecondCall()
                .returns(success({ LocationConstraint: 'outOfRegion' }))
            mockS3.listBuckets = listStub
            mockS3.getBucketLocation = locationStub
            const response = await createClient().listBuckets()
            assert.deepStrictEqual(response, {
                buckets: [
                    new DefaultBucket({
                        partitionId: partition,
                        region,
                        name: bucketName,
                    }),
                ],
            })
            assert(listStub.calledOnce)
            assert(locationStub.calledTwice)
            assert(locationStub.firstCall.calledWith({ Bucket: bucketName }))
            assert(locationStub.secondCall.calledWith({ Bucket: outOfRegionBucketName }))
        })

        it('Filters buckets with no name', async function () {
            const listStub = sinon.stub().returns(success({ Buckets: [{ Name: undefined }] }))
            const locationStub = sinon
                .stub()
                .onFirstCall()
                .returns(success({ LocationConstraint: region }))
            mockS3.listBuckets = listStub
            mockS3.getBucketLocation = locationStub

            const response = await createClient().listBuckets()
            assert.deepStrictEqual(response, {
                buckets: [],
            })
            assert(listStub.calledOnce)
            assert(locationStub.notCalled)
        })

        it(`Filters buckets when it can't get region`, async () => {
            const mockResponse = stub(Request<any, AWSError>) as any as Stub<Request<any, AWSError>>
            mockResponse.promise.rejects(undefined)
            const listStub = sinon.stub().returns(success({ Buckets: [{ Name: bucketName }] }))
            mockS3.listBuckets = listStub
            const locationStub = sinon.stub().returns(mockResponse)
            mockS3.getBucketLocation = locationStub

            const response = await createClient().listBuckets()
            assert.deepStrictEqual(response, {
                buckets: [],
            })
        })

        it('throws an Error on listBuckets failure', async function () {
            const listStub = sinon.stub().returns(failure())
            mockS3.listBuckets = listStub
            const locationStub = sinon.stub()
            mockS3.getBucketLocation = locationStub

            await assert.rejects(createClient().listBuckets(), error)

            assert(locationStub.notCalled)
        })

        it('returns region from exception on getBucketLocation failure', async function () {
            const listStub = sinon.stub().returns(success({ Buckets: [{ Name: bucketName }] }))
            mockS3.listBuckets = listStub
            const locationStub = sinon.stub().returns(failure())
            mockS3.getBucketLocation = locationStub

            const response = await createClient().listBuckets()
            assert.deepStrictEqual(response, {
                buckets: [
                    new DefaultBucket({
                        partitionId: partition,
                        region,
                        name: bucketName,
                    }),
                ],
            })
        })

        it('maps empty string getBucketLocation response to us-east-1', async function () {
            const listStub = sinon
                .stub()
                .returns(success({ Buckets: [{ Name: bucketName }, { Name: outOfRegionBucketName }] }))
            mockS3.listBuckets = listStub
            const locationStub = sinon.stub().callsFake((param: { Bucket: string }) => {
                if (param.Bucket && param.Bucket === bucketName) {
                    return success({ LocationConstraint: '' })
                }
            })
            mockS3.getBucketLocation = locationStub

            const response = await createClient({ regionCode: 'us-east-1' }).listBuckets()
            assert.deepStrictEqual(response, {
                buckets: [
                    new DefaultBucket({
                        partitionId: partition,
                        region: 'us-east-1',
                        name: bucketName,
                    }),
                ],
            })
        })
    })

    describe('listFiles', function () {
        it('lists files and folders', async function () {
            const folder = { Key: folderPath, Size: fileSizeBytes, LastModified: fileLastModified }
            const file = { Key: fileKey, Size: fileSizeBytes, LastModified: fileLastModified }
            const listStub = sinon.stub().returns(
                success({
                    Contents: [folder, file],
                    CommonPrefixes: [{ Prefix: subFolderPath }, { Prefix: emptySubFolderPath }],
                    NextContinuationToken: nextContinuationToken,
                })
            )
            mockS3.listObjectsV2 = listStub

            const response = await createClient().listFiles({ bucketName, folderPath, continuationToken, maxResults })
            assert.deepStrictEqual(response, {
                files: [toFile(bucket, file)],
                folders: [
                    new DefaultFolder({ partitionId: partition, bucketName, path: subFolderPath }),
                    new DefaultFolder({ partitionId: partition, bucketName, path: emptySubFolderPath }),
                ],
                continuationToken: nextContinuationToken,
            })
            assert(
                listStub.calledOnceWith({
                    Bucket: bucketName,
                    Delimiter: DEFAULT_DELIMITER,
                    MaxKeys: maxResults,
                    Prefix: folderPath,
                    ContinuationToken: continuationToken,
                })
            )
        })

        it('throws an Error on listFiles failure', async function () {
            mockS3.listObjectsV2 = sinon.stub().returns(failure())

            await assert.rejects(createClient().listFiles({ bucketName, folderPath, continuationToken }), error)
        })
    })

    describe('listObjectVersions', function () {
        const { firstPageRequest, secondPageRequest, firstPageResponse, secondPageResponse } =
            new ListObjectVersionsFixtures()

        it('lists objects and their versions with a continuation token for the next page of results', async function () {
            const listStub = sinon.stub().returns(success(firstPageResponse))
            mockS3.listObjectVersions = listStub

            const response = await createClient().listObjectVersions({ bucketName })

            assert.deepStrictEqual(response, {
                objects: [
                    { key: folderPath, versionId: folderVersionId },
                    { key: fileKey, versionId: fileVersionId },
                ],
                continuationToken: { keyMarker: nextKeyMarker, versionIdMarker: nextVersionIdMarker },
            })
            assert(listStub.calledOnceWith(firstPageRequest))
        })

        it('throws an Error on listObjectVersions failure', async function () {
            mockS3.listObjectVersions = sinon.stub().returns(failure())

            await assert.rejects(createClient().listObjectVersions({ bucketName }), error)
        })

        it('returns pages from listObjectVersionsIterable', async function () {
            const listStub = sinon
                .stub()
                .onFirstCall()
                .returns(success(firstPageResponse))
                .onSecondCall()
                .returns(success(secondPageResponse))
            mockS3.listObjectVersions = listStub

            const iterable = createClient().listObjectVersionsIterable({ bucketName })

            const responses = []
            for await (const response of iterable) {
                responses.push(response)
            }
            const [firstPage, secondPage, ...otherPages] = responses

            assert.deepStrictEqual(firstPage.objects, [
                { key: folderPath, versionId: folderVersionId },
                { key: fileKey, versionId: fileVersionId },
            ])
            assert.deepStrictEqual(secondPage.objects, [{ key: fileKey, versionId: undefined }])
            assert.deepStrictEqual(otherPages, [])
            assert(listStub.firstCall.calledWith(firstPageRequest))
            assert(listStub.secondCall.calledWith(secondPageRequest))
        })

        it('throws an Error on listObjectVersionsIterable iterate failure', async function () {
            mockS3.listObjectVersions = sinon.stub().returns(failure())

            const iterable = createClient().listObjectVersionsIterable({ bucketName })
            await assert.rejects(iterable.next(), error)
        })
    })

    describe('deleteObject', function () {
        it('deletes an object', async function () {
            const deleteStub = sinon.stub().returns(success({}))
            mockS3.deleteObject = deleteStub

            await createClient().deleteObject({ bucketName, key: fileKey })

            assert(deleteStub.calledOnce)
        })

        it('throws an Error on failure', async function () {
            mockS3.deleteObject = sinon.stub().returns(failure())

            await assert.rejects(createClient().deleteObject({ bucketName, key: fileKey }), error)
        })
    })

    describe('deleteObjects', function () {
        it('deletes objects', async function () {
            const deleteStub = sinon.stub().returns(success({}))
            mockS3.deleteObjects = deleteStub

            const response = await createClient().deleteObjects({
                bucketName,
                objects: [{ key: folderPath, versionId: folderVersionId }, { key: fileKey }],
            })

            assert(
                deleteStub.calledOnceWith({
                    Bucket: bucketName,
                    Delete: {
                        Objects: [
                            {
                                Key: folderPath,
                                VersionId: folderVersionId,
                            },
                            {
                                Key: fileKey,
                                VersionId: undefined,
                            },
                        ],
                        Quiet: true,
                    },
                })
            )

            assert.deepStrictEqual(response, { errors: [] })
        })

        it('returns a list of errors on partial failure', async function () {
            const error: S3.Error = {
                Key: folderPath,
                VersionId: folderVersionId,
                Code: '404',
                Message: 'Expected failure',
            }
            const deleteStub = sinon.stub().returns(success({ Errors: [error] }))
            mockS3.deleteObjects = deleteStub

            const response = await createClient().deleteObjects({
                bucketName,
                objects: [{ key: folderPath, versionId: folderVersionId }, { key: fileKey }],
            })

            assert(deleteStub.calledOnce)
            assert.deepStrictEqual(response, { errors: [error] })
        })

        it('throws an Error on failure', async function () {
            mockS3.deleteObjects = sinon.stub().returns(failure())

            await assert.rejects(createClient().deleteObjects({ bucketName, objects: [{ key: fileKey }] }), error)
        })
    })
})

describe('DefaultBucket', function () {
    it('properly constructs an instance', function () {
        const bucket = new DefaultBucket({ partitionId: 'partitionId', region: 'region', name: 'name' })
        assert.strictEqual(bucket.name, 'name')
        assert.strictEqual(bucket.region, 'region')
        assert.strictEqual(bucket.arn, 'arn:partitionId:s3:::name')
    })
})

describe('DefaultFolder', function () {
    it('properly constructs an instance', function () {
        const folder = new DefaultFolder({
            partitionId: 'partitionId',
            bucketName: 'bucketName',
            path: 'path/to/folder/',
        })
        assert.strictEqual(folder.name, 'folder')
        assert.strictEqual(folder.path, 'path/to/folder/')
        assert.strictEqual(folder.arn, 'arn:partitionId:s3:::bucketName/path/to/folder/')
    })
})

describe('toFile', function () {
    it('properly constructs an instance', function () {
        const bucket = new DefaultBucket({
            name: 'bucketName',
            region: 'us-west-2',
            partitionId: 'partitionId',
        })
        const file = toFile(bucket, {
            Size: 1337,
            Key: 'key/for/file.jpg',
            LastModified: new globals.clock.Date(2020, 5, 4),
        })
        assert.strictEqual(file.name, 'file.jpg')
        assert.strictEqual(file.key, 'key/for/file.jpg')
        assert.strictEqual(file.arn, 'arn:partitionId:s3:::bucketName/key/for/file.jpg')
        assert.strictEqual(file.lastModified?.toString(), new globals.clock.Date(2020, 5, 4).toString())
        assert.strictEqual(file.sizeBytes, 1337)
    })
})

/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { AWSError, Request, S3 } from 'aws-sdk'
import { DeleteObjectsRequest, ListObjectVersionsOutput, ListObjectVersionsRequest } from 'aws-sdk/clients/s3'
import { ManagedUpload } from 'aws-sdk/lib/s3/managed_upload'
import { FileStreams } from '../../../shared/utilities/streamUtilities'
import { anyFunction, anything, capture, deepEqual, instance, mock, verify, when } from '../../utilities/mockito'
import * as vscode from 'vscode'
import { DefaultBucket, DefaultFile, DefaultFolder, DefaultS3Client } from '../../../shared/clients/s3Client'
import { DEFAULT_DELIMITER, DEFAULT_MAX_KEYS } from '../../../shared/clients/s3Client'
import { FakeFileStreams } from './fakeFileStreams'

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
        mockS3 = mock()
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
        return new DefaultS3Client(partitionId, regionCode, () => Promise.resolve(instance(mockS3)), fileStreams)
    }

    describe('createBucket', function () {
        it('creates a bucket', async function () {
            when(
                mockS3.createBucket(
                    deepEqual({
                        Bucket: bucketName,
                        CreateBucketConfiguration: { LocationConstraint: region },
                    })
                )
            ).thenReturn(success())

            const response = await createClient().createBucket({ bucketName })

            assert.deepStrictEqual(response, {
                bucket: new DefaultBucket({ partitionId: partition, region, name: bucketName }),
            })
        })

        it('removes the region code for us-east-1', async function () {
            when(
                mockS3.createBucket(
                    deepEqual({
                        Bucket: bucketName,
                        CreateBucketConfiguration: undefined,
                    })
                )
            ).thenReturn(success())

            const response = await createClient({ regionCode: 'us-east-1' }).createBucket({ bucketName })

            assert.deepStrictEqual(response, {
                bucket: new DefaultBucket({ partitionId: partition, region: 'us-east-1', name: bucketName }),
            })
        })

        it('throws an Error on failure', async function () {
            when(mockS3.createBucket(anything())).thenReturn(failure())

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

        it('empties a bucket and deletes it', async function () {
            when(mockS3.listObjectVersions(deepEqual(firstList))).thenReturn(success(firstListResponse))
            when(mockS3.deleteObjects(deepEqual(firstDelete))).thenReturn(success({}))

            when(mockS3.listObjectVersions(deepEqual(secondList))).thenReturn(success(secondListResponse))
            when(mockS3.deleteObjects(deepEqual(secondDelete))).thenReturn(success({}))

            when(mockS3.deleteBucket(deepEqual({ Bucket: bucketName }))).thenReturn(success({}))

            await createClient().deleteBucket({ bucketName })

            verify(mockS3.listObjectVersions(anything())).twice()
            verify(mockS3.deleteObjects(anything())).twice()
            verify(mockS3.deleteBucket(anything())).once()
        })

        it('throws an Error on listObjectVersions failure', async function () {
            when(mockS3.listObjectVersions(anything())).thenReturn(failure())

            await assert.rejects(createClient().deleteBucket({ bucketName }), error)

            verify(mockS3.deleteObjects(anything())).never()
            verify(mockS3.deleteBucket(anything())).never()
        })

        it('throws an Error on deleteObjects failure', async function () {
            when(mockS3.listObjectVersions(anything())).thenReturn(success(anyListResponse))
            when(mockS3.deleteObjects(anything())).thenReturn(failure())

            await assert.rejects(createClient().deleteBucket({ bucketName }), error)

            verify(mockS3.deleteBucket(anything())).never()
        })

        it('throws an Error on deleteBucket failure', async function () {
            when(mockS3.listObjectVersions(anything())).thenReturn(success(anyListResponse))
            when(mockS3.deleteObjects(anything())).thenReturn(success({}))
            when(mockS3.deleteBucket(anything())).thenReturn(failure())

            await assert.rejects(createClient().deleteBucket({ bucketName }), error)
        })
    })

    describe('createFolder', function () {
        it('creates a folder', async function () {
            when(mockS3.upload(deepEqual({ Bucket: bucketName, Key: folderPath, Body: '' }))).thenReturn(success())

            const response = await createClient().createFolder({ bucketName, path: folderPath })

            assert.deepStrictEqual(response, {
                folder: new DefaultFolder({ partitionId: partition, bucketName, path: folderPath }),
            })
        })

        it('throws an Error on failure', async function () {
            when(mockS3.upload(anything())).thenReturn(failure())

            await assert.rejects(createClient().createFolder({ bucketName, path: folderPath }), error)
        })
    })

    describe('downloadFile', function () {
        it('downloads a file', async function () {
            when(mockS3.getObject(deepEqual({ Bucket: bucketName, Key: fileKey }))).thenReturn(success())

            const fileStreams = new FakeFileStreams({ readData: fileData })
            const progressCaptor = new FakeProgressCaptor()

            await createClient({ fileStreams }).downloadFile({
                bucketName,
                key: fileKey,
                saveLocation: fileLocation,
                progressListener: progressCaptor.listener(),
            })

            assert.deepStrictEqual(fileStreams.writtenLocation, fileLocation)
            assert.strictEqual(fileStreams.writtenData, fileData)
            assert.ok(progressCaptor.progress > 0)
        })

        it('throws an Error on failure', async function () {
            when(mockS3.getObject(anything())).thenReturn(failure())

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
            const mockManagedUpload: ManagedUpload = mock()
            when(mockManagedUpload.promise()).thenReturn(
                Promise.resolve({ Location: '', ETag: '', Bucket: '', Key: '' })
            )
            when(mockManagedUpload.on('httpUploadProgress', anyFunction())).thenReturn(undefined)
            when(mockS3.upload(anything())).thenReturn(instance(mockManagedUpload))

            const fileStreams = new FakeFileStreams({ readData: fileData, readAutomatically: true })
            const progressCaptor = new FakeProgressCaptor()

            await createClient({ fileStreams }).uploadFile({
                bucketName,
                key: fileKey,
                fileLocation: fileLocation,
                progressListener: progressCaptor.listener(),
            })

            verify(mockS3.upload(anything())).once()
            // eslint-disable-next-line @typescript-eslint/unbound-method
            const [{ Bucket, Key, Body, ContentType }] = capture(mockS3.upload).last()
            assert.strictEqual(Bucket, bucketName)
            assert.strictEqual(Key, fileKey)
            assert.strictEqual(ContentType, 'image/jpeg')
            assert.strictEqual(Body, fileStreams.readStream)

            // eslint-disable-next-line @typescript-eslint/unbound-method
            const [, listener] = capture(mockManagedUpload.on).last()
            listener({ loaded: 1, total: 100 })
            listener({ loaded: 2, total: 100 })
            assert.strictEqual(progressCaptor.progress, 3)
        })

        it('throws an Error on failure', async function () {
            when(mockS3.upload(anything())).thenReturn(failure())

            await assert.rejects(
                createClient().uploadFile({
                    bucketName,
                    key: fileKey,
                    fileLocation: fileLocation,
                }),
                error
            )
        })
    })

    describe('listBuckets', function () {
        it('lists a bucket', async function () {
            when(mockS3.listBuckets()).thenReturn(
                success({ Buckets: [{ Name: bucketName }, { Name: outOfRegionBucketName }] })
            )
            when(mockS3.getBucketLocation(deepEqual({ Bucket: bucketName }))).thenReturn(
                success({ LocationConstraint: region })
            )
            when(mockS3.getBucketLocation(deepEqual({ Bucket: outOfRegionBucketName }))).thenReturn(
                success({ LocationConstraint: 'outOfRegion' })
            )

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

        it('Filters buckets with no name', async function () {
            when(mockS3.listBuckets()).thenReturn(
                success({ Buckets: [{ Name: undefined }, { Name: outOfRegionBucketName }] })
            )
            when(mockS3.getBucketLocation(deepEqual({ Bucket: bucketName }))).thenReturn(
                success({ LocationConstraint: region })
            )

            const response = await createClient().listBuckets()
            assert.deepStrictEqual(response, {
                buckets: [],
            })
        })

        it(`Filters buckets when it can't get region`, async () => {
            const mockResponse: Request<any, AWSError> = mock()
            when(mockS3.listBuckets()).thenReturn(success({ Buckets: [{ Name: bucketName }] }))
            // eslint-disable-next-line @typescript-eslint/unbound-method
            when(mockResponse.promise).thenReject(undefined as any as Error)
            when(mockS3.getBucketLocation(anything())).thenReturn(mockResponse)

            const response = await createClient().listBuckets()
            assert.deepStrictEqual(response, {
                buckets: [],
            })
        })

        it('throws an Error on listBuckets failure', async function () {
            when(mockS3.listBuckets()).thenReturn(failure())

            await assert.rejects(createClient().listBuckets(), error)

            verify(mockS3.getBucketLocation(anything())).never()
        })

        it('returns region from exception on getBucketLocation failure', async function () {
            when(mockS3.listBuckets()).thenReturn(success({ Buckets: [{ Name: bucketName }] }))
            when(mockS3.getBucketLocation(anything())).thenReturn(failure())

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
            when(mockS3.listBuckets()).thenReturn(
                success({ Buckets: [{ Name: bucketName }, { Name: outOfRegionBucketName }] })
            )
            when(mockS3.getBucketLocation(deepEqual({ Bucket: bucketName }))).thenReturn(
                success({ LocationConstraint: '' })
            )

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
            when(
                mockS3.listObjectsV2(
                    deepEqual({
                        Bucket: bucketName,
                        Delimiter: DEFAULT_DELIMITER,
                        MaxKeys: maxResults,
                        Prefix: folderPath,
                        ContinuationToken: continuationToken,
                    })
                )
            ).thenReturn(
                success({
                    Contents: [
                        { Key: folderPath, Size: fileSizeBytes, LastModified: fileLastModified },
                        { Key: fileKey, Size: fileSizeBytes, LastModified: fileLastModified },
                    ],
                    CommonPrefixes: [{ Prefix: subFolderPath }, { Prefix: emptySubFolderPath }],
                    NextContinuationToken: nextContinuationToken,
                })
            )

            const response = await createClient().listFiles({ bucketName, folderPath, continuationToken, maxResults })

            assert.deepStrictEqual(response, {
                files: [
                    new DefaultFile({
                        partitionId: partition,
                        bucketName,
                        key: fileKey,
                        lastModified: fileLastModified,
                        sizeBytes: fileSizeBytes,
                    }),
                ],
                folders: [
                    new DefaultFolder({ partitionId: partition, bucketName, path: subFolderPath }),
                    new DefaultFolder({ partitionId: partition, bucketName, path: emptySubFolderPath }),
                ],
                continuationToken: nextContinuationToken,
            })
        })

        it('throws an Error on listFiles failure', async function () {
            when(mockS3.listObjectsV2(anything())).thenReturn(failure())

            await assert.rejects(createClient().listFiles({ bucketName, folderPath, continuationToken }), error)
        })
    })

    describe('listObjectVersions', function () {
        const { firstPageRequest, secondPageRequest, firstPageResponse, secondPageResponse } =
            new ListObjectVersionsFixtures()

        it('lists objects and their versions with a continuation token for the next page of results', async function () {
            when(mockS3.listObjectVersions(deepEqual(firstPageRequest))).thenReturn(success(firstPageResponse))

            const response = await createClient().listObjectVersions({ bucketName })

            assert.deepStrictEqual(response, {
                objects: [
                    { key: folderPath, versionId: folderVersionId },
                    { key: fileKey, versionId: fileVersionId },
                ],
                continuationToken: { keyMarker: nextKeyMarker, versionIdMarker: nextVersionIdMarker },
            })
        })

        it('throws an Error on listObjectVersions failure', async function () {
            when(mockS3.listObjectVersions(anything())).thenReturn(failure())

            await assert.rejects(createClient().listObjectVersions({ bucketName }), error)
        })

        it('returns pages from listObjectVersionsIterable', async function () {
            when(mockS3.listObjectVersions(deepEqual(firstPageRequest))).thenReturn(success(firstPageResponse))
            when(mockS3.listObjectVersions(deepEqual(secondPageRequest))).thenReturn(success(secondPageResponse))

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
        })

        it('throws an Error on listObjectVersionsIterable iterate failure', async function () {
            when(mockS3.listObjectVersions(anything())).thenReturn(failure())

            const iterable = createClient().listObjectVersionsIterable({ bucketName })
            await assert.rejects(iterable.next(), error)
        })
    })

    describe('deleteObject', function () {
        it('deletes an object', async function () {
            when(mockS3.deleteObject(deepEqual({ Bucket: bucketName, Key: fileKey }))).thenReturn(success({}))

            await createClient().deleteObject({ bucketName, key: fileKey })

            verify(mockS3.deleteObject(anything())).once()
        })

        it('throws an Error on failure', async function () {
            when(mockS3.deleteObject(anything())).thenReturn(failure())

            await assert.rejects(createClient().deleteObject({ bucketName, key: fileKey }), error)
        })
    })

    describe('deleteObjects', function () {
        it('deletes objects', async function () {
            when(
                mockS3.deleteObjects(
                    deepEqual({
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
            ).thenReturn(success({}))

            const response = await createClient().deleteObjects({
                bucketName,
                objects: [{ key: folderPath, versionId: folderVersionId }, { key: fileKey }],
            })

            verify(mockS3.deleteObjects(anything())).once()

            assert.deepStrictEqual(response, { errors: [] })
        })

        it('returns a list of errors on partial failure', async function () {
            const error: S3.Error = {
                Key: folderPath,
                VersionId: folderVersionId,
                Code: '404',
                Message: 'Expected failure',
            }

            when(mockS3.deleteObjects(anything())).thenReturn(success({ Errors: [error] }))

            const response = await createClient().deleteObjects({
                bucketName,
                objects: [{ key: folderPath, versionId: folderVersionId }, { key: fileKey }],
            })

            verify(mockS3.deleteObjects(anything())).once()
            assert.deepStrictEqual(response, { errors: [error] })
        })

        it('throws an Error on failure', async function () {
            when(mockS3.deleteObjects(anything())).thenReturn(failure())

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

describe('DefaultFile', function () {
    it('properly constructs an instance', function () {
        const file = new DefaultFile({
            partitionId: 'partitionId',
            bucketName: 'bucketName',
            key: 'key/for/file.jpg',
            lastModified: new Date(2020, 5, 4),
            sizeBytes: 1337,
        })
        assert.strictEqual(file.name, 'file.jpg')
        assert.strictEqual(file.key, 'key/for/file.jpg')
        assert.strictEqual(file.arn, 'arn:partitionId:s3:::bucketName/key/for/file.jpg')
        assert.strictEqual(file.lastModified?.toString(), new Date(2020, 5, 4).toString())
        assert.strictEqual(file.sizeBytes, 1337)
    })
})

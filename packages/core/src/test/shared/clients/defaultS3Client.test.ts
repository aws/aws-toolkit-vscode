/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { S3 } from 'aws-sdk'
import { FileStreams } from '../../../shared/utilities/streamUtilities'
import {
    DefaultBucket,
    DefaultFolder,
    ListObjectVersionsResponse,
    ListObjectVersionsRequest,
    S3Client,
    toFile,
} from '../../../shared/clients/s3'
import { DEFAULT_MAX_KEYS } from '../../../shared/clients/s3'
import { FakeFileStreams } from './fakeFileStreams'
import globals from '../../../shared/extensionGlobals'
import {
    Bucket,
    ListObjectsV2Output,
    ListObjectVersionsCommandInput,
    ListObjectVersionsOutput,
} from '@aws-sdk/client-s3'
import { Progress } from '@aws-sdk/lib-storage'
import { intoCollection } from '../../../shared/utilities/collectionUtils'
import { AsyncCollection } from '../../../shared/utilities/asyncCollection'

class FakeProgressCaptor {
    public progress = 0
    public lastUpdateAmount = 0

    public listener(): (loadedBytes: number) => void {
        return (loadedBytes) => {
            this.progress += loadedBytes
            this.lastUpdateAmount = loadedBytes
        }
    }
}

class FakeUploader {
    private progressListeners: ((progress: Progress) => void)[] = []

    emitProgress(p: Progress) {
        for (const listener of this.progressListeners) {
            listener(p)
        }
    }

    on(_event: 'httpUploadProgress', listener: (progress: Progress) => void) {
        this.progressListeners.push(listener)
    }
}

describe('DefaultS3Client', function () {
    const partition = 'aws'
    const region = 'us-west-2'
    const bucketName = 'bucketName'
    const folderPath = 'foo/bar/'
    const folderVersionId = 'folderVersionId'
    const subFolderPath = 'foo/bar/subFolder/'
    const emptySubFolderPath = 'foo/bar//'
    const fileKey = 'foo/bar/file.jpg'
    const fileVersionId = 'fileVersionId'
    const fileSizeBytes = 5
    const fileLastModified = new Date(2020, 5, 4)
    const nextContinuationToken = 'nextContinuationToken'
    const nextKeyMarker = 'nextKeyMarker'
    const nextVersionIdMarker = 'nextVersionIdMarker'
    const bucket = new DefaultBucket({ partitionId: partition, name: bucketName, region })

    let mockS3: S3

    class ListObjectVersionsFixtures {
        public readonly firstPageRequest: ListObjectVersionsCommandInput = {
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

        public readonly secondPageRequest: ListObjectVersionsCommandInput = {
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

    beforeEach(function () {
        mockS3 = {} as any as S3
    })

    function createClient({
        regionCode = region,
        partitionId = partition,
        fileStreams = new FakeFileStreams(),
    }: { regionCode?: string; partitionId?: string; fileStreams?: FileStreams } = {}): S3Client {
        return new S3Client(regionCode, partitionId, () => Promise.resolve(mockS3), fileStreams)
    }

    describe('createBucket', function () {
        it('removes the region code for us-east-1', async function () {
            class TestS3 extends S3Client {
                public testGetCreateBucketConfiguration() {
                    return this.getCreateBucketConfiguration()
                }
            }
            const testS3 = new TestS3('us-east-1', 'partition')
            assert.ok(testS3.testGetCreateBucketConfiguration() === undefined)
        })
    })

    describe('uploadFile', function () {
        it('links the progress listener to the upload', async function () {
            const progressCaptor = new FakeProgressCaptor()

            const upload = new FakeUploader()
            createClient().linkProgressListenerToUpload(upload, progressCaptor.listener())

            upload.emitProgress({ loaded: 10 })
            assert.strictEqual(progressCaptor.progress, 10)
            upload.emitProgress({ loaded: 20 })
            assert.strictEqual(progressCaptor.progress, 20)
            assert.strictEqual(progressCaptor.lastUpdateAmount, 10)
            upload.emitProgress({ loaded: 40 })
            assert.strictEqual(progressCaptor.progress, 40)
            assert.strictEqual(progressCaptor.lastUpdateAmount, 20)
        })
    })

    describe('listBuckets', function () {
        it('Filters buckets with no name', async function () {
            const getBucketCollection = () =>
                intoCollection([
                    [{ Name: 'bucket1', BucketRegion: 'test-region' }],
                    [{ BucketRegion: 'test-region' }],
                ]) satisfies AsyncCollection<Bucket[]>
            const output = await createClient().listBuckets(getBucketCollection)

            assert.deepStrictEqual(output.buckets, [
                new DefaultBucket({ region: 'test-region', name: 'bucket1', partitionId: 'aws' }),
            ])
        })

        it('Filters buckets with no region', async function () {
            const getBucketCollection = () =>
                intoCollection([
                    [{ Name: 'bucket1' }],
                    [{ Name: 'bucket2', BucketRegion: 'test-region' }],
                ]) satisfies AsyncCollection<Bucket[]>
            const output = await createClient().listBuckets(getBucketCollection)

            assert.deepStrictEqual(output.buckets, [
                new DefaultBucket({ region: 'test-region', name: 'bucket2', partitionId: 'aws' }),
            ])
        })
    })

    describe('listFilesFromResponse', function () {
        it('parses response for list of files and folders', async function () {
            const folder = { Key: folderPath, Size: fileSizeBytes, LastModified: fileLastModified }
            const file = { Key: fileKey, Size: fileSizeBytes, LastModified: fileLastModified }
            const sdkResponse: ListObjectsV2Output = {
                Contents: [folder, file],
                CommonPrefixes: [{ Prefix: subFolderPath }, { Prefix: emptySubFolderPath }],
                NextContinuationToken: nextContinuationToken,
            }

            const processedResponse = createClient().listFilesFromResponse(sdkResponse, bucketName, folderPath)

            assert.deepStrictEqual(processedResponse, {
                files: [toFile(bucket, file)],
                folders: [
                    new DefaultFolder({ partitionId: partition, bucketName, path: subFolderPath }),
                    new DefaultFolder({ partitionId: partition, bucketName, path: emptySubFolderPath }),
                ],
                continuationToken: nextContinuationToken,
            })
        })
    })

    describe('listObjectVersions', function () {
        const { firstPageResponse, secondPageResponse } = new ListObjectVersionsFixtures()

        it('lists objects and their versions with a continuation token for the next page of results', async function () {
            const response = createClient().processListObjectVersionsResponse(firstPageResponse)
            assert.deepStrictEqual(response, {
                objects: [
                    { key: folderPath, versionId: folderVersionId },
                    { key: fileKey, versionId: fileVersionId },
                ],
                continuationToken: { keyMarker: nextKeyMarker, versionIdMarker: nextVersionIdMarker },
            })
        })

        it('returns pages from listObjectVersionsIterable', async function () {
            const firstRsp = createClient().processListObjectVersionsResponse(firstPageResponse)
            const secondRsp = createClient().processListObjectVersionsResponse(secondPageResponse)

            const getObjectVersions: (
                request: ListObjectVersionsRequest
            ) => Promise<ListObjectVersionsResponse> = async (req) => {
                return req.continuationToken === firstRsp.continuationToken ? secondRsp : firstRsp
            }

            const iterable = createClient().listObjectVersionsIterable({ bucketName }, getObjectVersions)

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

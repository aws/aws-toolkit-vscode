/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { AWSError, Request, S3 } from 'aws-sdk'
import { ManagedUpload } from 'aws-sdk/lib/s3/managed_upload'
import { anyFunction, anything, capture, deepEqual, instance, mock, verify, when } from '../../utilities/mockito'
import * as vscode from 'vscode'
import {
    DefaultBucket,
    DefaultFile,
    DefaultFolder,
    DefaultS3Client,
    FileStreams,
} from '../../../shared/clients/defaultS3Client'
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

describe('DefaultS3Client', () => {
    const partition = 'aws'
    const region = 'us-west-2'
    const bucketName = 'bucketName'
    const outOfRegionBucketName = 'outOfRegionBucketName'
    const folderPath = 'foo/bar/'
    const subFolderPath = 'foo/bar/subFolder/'
    const emptySubFolderPath = 'foo/bar//'
    const fileKey = 'foo/bar/file.jpg'
    const fileSizeBytes = 5
    const fileLastModified = new Date(2020, 5, 4)
    const fileData = 'fileData'
    const fileLocation = vscode.Uri.file('/file.jpg')
    const continuationToken = 'continuationToken'
    const nextContinuationToken = 'nextContinuationToken'

    let mockS3: S3

    beforeEach(() => {
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
            promise: () => Promise.reject(new Error('Expected failure')),
            createReadStream() {
                const readStream = FakeFileStreams.readStreamFrom(fileData)
                readStream.destroy(new Error('Expected failure'))
                return readStream
            },
        } as Request<any, AWSError>
    }

    function createClient({
        regionCode = region,
        partitionId = partition,
        fileStreams = new FakeFileStreams(),
    }: { regionCode?: string; partitionId?: string; fileStreams?: FileStreams } = {}): DefaultS3Client {
        return new DefaultS3Client(regionCode, partitionId, () => Promise.resolve(instance(mockS3)), fileStreams)
    }

    describe('createBucket', () => {
        it('creates a bucket', async () => {
            when(mockS3.createBucket(deepEqual({ Bucket: bucketName }))).thenReturn(success())

            const response = await createClient().createBucket({ bucketName })

            assert.deepStrictEqual(response, {
                bucket: new DefaultBucket({ partitionId: partition, region, name: bucketName }),
            })
        })

        it('throws an S3Error on failure', async () => {
            when(mockS3.createBucket(anything())).thenReturn(failure())

            await assert.rejects(createClient().createBucket({ bucketName }), /Expected failure/)
        })
    })

    describe('createFolder', () => {
        it('creates a folder', async () => {
            when(mockS3.upload(deepEqual({ Bucket: bucketName, Key: folderPath, Body: '' }))).thenReturn(success())

            const response = await createClient().createFolder({ bucketName, path: folderPath })

            assert.deepStrictEqual(response, {
                folder: new DefaultFolder({ partitionId: partition, bucketName, path: folderPath }),
            })
        })

        it('throws an S3Error on failure', async () => {
            when(mockS3.upload(anything())).thenReturn(failure())

            await assert.rejects(createClient().createFolder({ bucketName, path: folderPath }), /Expected failure/)
        })
    })

    describe('downloadFile', () => {
        it('downloads a file', async () => {
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

        it('throws an S3Error on failure', async () => {
            when(mockS3.getObject(anything())).thenReturn(failure())

            await assert.rejects(
                createClient().downloadFile({
                    bucketName,
                    key: fileKey,
                    saveLocation: fileLocation,
                }),
                /Expected failure/
            )
        })
    })

    describe('uploadFile', () => {
        it('uploads a file', async () => {
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
            const [{ Bucket, Key, Body, ContentType }] = capture(mockS3.upload).last()
            assert.strictEqual(Bucket, bucketName)
            assert.strictEqual(Key, fileKey)
            assert.strictEqual(ContentType, 'image/jpeg')
            assert.strictEqual(Body, fileStreams.readStream)

            const [, listener] = capture(mockManagedUpload.on).last()
            listener({ loaded: 1, total: 100 })
            listener({ loaded: 2, total: 100 })
            assert.strictEqual(progressCaptor.progress, 3)
        })

        it('throws an S3Error on failure', async () => {
            when(mockS3.upload(anything())).thenReturn(failure())

            await assert.rejects(
                createClient().uploadFile({
                    bucketName,
                    key: fileKey,
                    fileLocation: fileLocation,
                }),
                /Expected failure/
            )
        })
    })

    describe('listBuckets', () => {
        it('lists a bucket', async () => {
            when(mockS3.listBuckets()).thenReturn(
                success({ Buckets: [{ Name: bucketName }, { Name: outOfRegionBucketName }] })
            )
            when(mockS3.headBucket(deepEqual({ Bucket: bucketName }))).thenReturn(
                success({ $response: { httpResponse: { headers: { 'x-amz-bucket-region': region } } } })
            )
            when(mockS3.headBucket(deepEqual({ Bucket: outOfRegionBucketName }))).thenReturn(
                success({ $response: { httpResponse: { headers: { 'x-amz-bucket-region': 'outOfRegion' } } } })
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

        it('throws an S3Error on listBuckets failure', async () => {
            when(mockS3.listBuckets()).thenReturn(failure())

            await assert.rejects(createClient().listBuckets(), /Expected failure/)
        })

        it('throws an S3Error on headBucket failure', async () => {
            when(mockS3.listBuckets()).thenReturn(success({ Buckets: [{ Name: bucketName }] }))
            when(mockS3.headBucket(anything())).thenReturn(failure())

            await assert.rejects(createClient().listBuckets(), /Expected failure/)
        })
    })

    describe('listObjects', () => {
        it('lists objects', async () => {
            when(
                mockS3.listObjectsV2(
                    deepEqual({
                        Bucket: bucketName,
                        Delimiter: DEFAULT_DELIMITER,
                        MaxKeys: DEFAULT_MAX_KEYS,
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

            const response = await createClient().listObjects({ bucketName, folderPath, continuationToken })

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

        it('throws an S3Error on listObjects failure', async () => {
            when(mockS3.listObjectsV2(anything())).thenReturn(failure())

            await assert.rejects(
                createClient().listObjects({ bucketName, folderPath, continuationToken }),
                /Expected failure/
            )
        })
    })
})

describe('DefaultBucket', () => {
    it('creates a Bucket', () => {
        const bucket = new DefaultBucket({ partitionId: 'partitionId', region: 'region', name: 'name' })
        assert.strictEqual(bucket.name, 'name')
        assert.strictEqual(bucket.region, 'region')
        assert.strictEqual(bucket.arn, 'arn:partitionId:s3:::name')
    })
})

describe('DefaultFolder', () => {
    it('creates a Folder', () => {
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

describe('DefaultFile', () => {
    it('creates a File', () => {
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

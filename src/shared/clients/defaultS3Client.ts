/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { S3 } from 'aws-sdk'
import { ListObjectsV2Output } from 'aws-sdk/clients/s3'
import * as _ from 'lodash'
import * as vscode from 'vscode'
import * as fs from 'fs'
import { basename } from 'path'
import * as stream from 'stream'
import { ext } from '../extensionGlobals'
import { promisifyReadStream, promisifyWriteStream } from '../streamUtilities'
import {
    Bucket,
    CreateBucketRequest,
    CreateFolderRequest,
    DEFAULT_DELIMITER,
    DEFAULT_MAX_KEYS,
    Folder,
    DownloadFileRequest,
    ListBucketsResponse,
    ListObjectsRequest,
    ListObjectsResponse,
    File,
    S3Client,
    S3Error,
    UploadFileRequest,
    CreateFolderResponse,
    CreateBucketResponse,
} from './s3Client'
import * as mime from 'mime-types'

const DEFAULT_CONTENT_TYPE = 'application/octet-stream'
const BUCKET_REGION_HEADER = 'x-amz-bucket-region'

export class DefaultS3Client implements S3Client {
    public constructor(
        private readonly regionCode: string,
        private readonly partitionId: string,
        private readonly s3Provider: (regionCode: string) => Promise<S3> = createSdkClient,
        private readonly fileStreams: FileStreams = new DefaultFileStreams()
    ) {}

    public async createS3(): Promise<S3> {
        return this.s3Provider(this.regionCode)
    }

    /**
     * Creates a bucket in the region of the client.
     *
     * @throws S3Error if there is an error calling S3.
     */
    public async createBucket(request: CreateBucketRequest): Promise<CreateBucketResponse> {
        const s3 = await this.createS3()

        try {
            // The docs incorrectly state that you must always specify the LocationConstraint or it will default to us-east-1
            // https://docs.aws.amazon.com/AmazonS3/latest/API/API_CreateBucket.html
            await s3.createBucket({ Bucket: request.bucketName }).promise()
        } catch (e) {
            throw new S3Error(`Failed to create bucket ${request.bucketName}: ${e}`)
        }

        return {
            bucket: new DefaultBucket({
                partitionId: this.partitionId,
                region: this.regionCode,
                name: request.bucketName,
            }),
        }
    }

    /**
     * Creates a folder.
     *
     * The folder's bucket should reside in the same region as the one configured for the client.
     *
     * Note that folders don't actually exist in S3.
     * Everything in S3 is an object with a key residing in a bucket.
     * However, S3 allows you to emulate folders by providing a key with delimiters (slashes) in its name.
     *
     * To creating empty "folders", you upload an empty object with a trailing slash.
     *
     * Creation of folders isn't strictly necessary, as you can just upload keys with delimiters.
     * However, empty folders make it easier to work with S3 as if it were a filesystem like in the UI.
     *
     * @throws S3Error if there is an error calling S3.
     */
    public async createFolder(request: CreateFolderRequest): Promise<CreateFolderResponse> {
        const s3 = await this.createS3()

        const folder = new DefaultFolder({
            path: request.path,
            partitionId: this.partitionId,
            bucketName: request.bucketName,
        })

        try {
            await s3
                .upload({
                    Bucket: request.bucketName,
                    Key: request.path,
                    Body: '',
                })
                .promise()
        } catch (e) {
            throw new S3Error(`Failed to create folder ${folder.name}: ${e}`)
        }

        return { folder }
    }

    /**
     * Downloads a file to disk.
     *
     * The file's bucket should reside in the same region as the one configured for the client.
     *
     * Pipes the response (read) stream into the file (write) stream.
     *
     * @throws S3Error if there is an error calling S3 or piping between streams.
     */
    public async downloadFile(request: DownloadFileRequest): Promise<void> {
        const s3 = await this.createS3()

        // https://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/requests-using-stream-objects.html
        const readStream = s3.getObject({ Bucket: request.bucketName, Key: request.key }).createReadStream()
        const writeStream = this.fileStreams.createWriteStream(request.saveLocation)

        try {
            await pipe(readStream, writeStream, request.progressListener)
        } catch (e) {
            throw new S3Error(`Failed to download ${request.key} from bucket ${request.bucketName}: ${e}`)
        }
    }

    /**
     * Uploads a file from disk.
     *
     * The destination bucket should reside in the same region as the one configured for the client.
     *
     * Pipes the file (read) stream into the request (write) stream.
     * Assigns the target content type based on the mime type of the file.
     * If content type cannot be determined, defaults to {@link DEFAULT_CONTENT_TYPE}.
     *
     * @throws S3Error if there is an error calling S3 or piping between streams.
     */
    public async uploadFile(request: UploadFileRequest): Promise<void> {
        const s3 = await this.createS3()

        // https://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/s3-example-creating-buckets.html#s3-example-creating-buckets-upload-file
        const readStream = this.fileStreams.createReadStream(request.fileLocation)
        const contentType = mime.lookup(basename(request.fileLocation.fsPath)) || DEFAULT_CONTENT_TYPE

        let managedUploaded = s3.upload({
            Bucket: request.bucketName,
            Key: request.key,
            Body: readStream,
            ContentType: contentType,
        })

        const progressListener = request.progressListener
        if (progressListener) {
            managedUploaded.on('httpUploadProgress', progress => {
                progressListener(progress.loaded)
            })
        }

        try {
            await Promise.all([promisifyReadStream(readStream), managedUploaded.promise()])
        } catch (e) {
            throw new S3Error(`Failed to upload ${request.key} to bucket ${request.bucketName}: ${e}`)
        }
    }

    /**
     * Lists buckets in the region of the client.
     *
     * Note that S3 returns all buckets in all regions,
     * so this incurs the cost of additional S3#HeadBucket requests for each bucket
     * to filter out buckets residing outside of the client's region.
     *
     * @throws S3Error if there is an error calling S3.
     */
    public async listBuckets(): Promise<ListBucketsResponse> {
        const s3 = await this.createS3()

        let s3Buckets: S3.Bucket[]
        try {
            const output = await s3.listBuckets().promise()
            s3Buckets = output.Buckets ?? []
        } catch (e) {
            throw new S3Error(`Failed to list buckets: ${e}`)
        }

        // S3#ListBuckets returns buckets across all regions
        const allBucketPromises: Promise<Bucket>[] = s3Buckets.map(
            async s3Bucket =>
                new DefaultBucket({
                    partitionId: this.partitionId,
                    region: await this.lookupRegion(s3Bucket.Name!, s3),
                    name: s3Bucket.Name!,
                })
        )

        const allBuckets = await Promise.all(allBucketPromises)
        const bucketsInRegion = _(allBuckets)
            .reject(bucket => bucket.region !== this.regionCode)
            .value()

        return { buckets: bucketsInRegion }
    }

    /**
     * Lists files and folders in a folder or inside the root bucket.
     *
     * The bucket should reside in the same region as the one configured for the client.
     *
     * Returns the first {@link DEFAULT_MAX_KEYS} objects (the first "page").
     * If there are more results, returns a continuation token that can be passed in a subsequent call
     * to get the next "page" of results.
     *
     * Note that folders don't actually exist in S3.
     * Everything in S3 is an object with a key residing in a bucket.
     * However, S3 lets you limit results to those residing at a specific "path" specified by delimiters (slashes).
     * The list of sub-paths is returned in the result set and can be used in subsequent calls.
     *
     * A consequence of the fact that folders don't exist is that folders and files are intermingled across all
     * of the pages.
     * It's not possible to retrieve an exhaustive list of all folders without traversing all of the pages.
     *
     * @throws S3Error if there is an error calling S3.
     */
    public async listObjects(request: ListObjectsRequest): Promise<ListObjectsResponse> {
        const s3 = await this.createS3()

        let response: ListObjectsV2Output
        try {
            response = await s3
                .listObjectsV2({
                    Bucket: request.bucketName,
                    Delimiter: DEFAULT_DELIMITER,
                    MaxKeys: DEFAULT_MAX_KEYS,
                    Prefix: request.folderPath,
                    ContinuationToken: request.continuationToken,
                })
                .promise()
        } catch (e) {
            throw new S3Error(`Failed to list objects for bucket ${request.bucketName}: ${e}`)
        }

        const files: File[] = _(response.Contents)
            .reject(file => file.Key === request.folderPath)
            .map(
                file =>
                    new DefaultFile({
                        key: file.Key!,
                        partitionId: this.partitionId,
                        bucketName: request.bucketName,
                        lastModified: file.LastModified,
                        sizeBytes: file.Size,
                    })
            )
            .value()

        const folders: Folder[] = _(response.CommonPrefixes)
            .map(prefix => prefix.Prefix)
            .compact()
            .map(path => new DefaultFolder({ path, partitionId: this.partitionId, bucketName: request.bucketName }))
            .value()

        return {
            files,
            folders,
            continuationToken: response.NextContinuationToken,
        }
    }

    /**
     * Looks up the region for the given bucket
     *
     * Note that although there is an S3#GetBucketLocation API,
     * this is the suggested method of obtaining the region.
     *
     * @throws S3Error if there is an error calling S3.
     */
    private async lookupRegion(bucketName: string, s3: S3): Promise<string> {
        try {
            const response = await s3.headBucket({ Bucket: bucketName }).promise()
            return response.$response.httpResponse.headers[BUCKET_REGION_HEADER]
        } catch (e) {
            throw new S3Error(`Failed to find region for bucket ${bucketName}: ${e}`)
        }
    }
}

export interface FileStreams {
    createReadStream(uri: vscode.Uri): stream.Readable
    createWriteStream(uri: vscode.Uri): stream.Writable
}

export class DefaultBucket implements Bucket {
    public readonly name: string
    public readonly region: string
    public readonly arn: string

    public constructor({ partitionId, region, name }: { partitionId: string; region: string; name: string }) {
        this.name = name
        this.region = region
        this.arn = `arn:${partitionId}:s3:::${name}`
    }

    public toString(): string {
        return `Bucket (name=${this.name}, region=${this.region}, arn=${this.arn})`
    }
}

export class DefaultFolder implements Folder {
    public readonly name: string
    public readonly path: string
    public readonly arn: string

    public constructor({ partitionId, bucketName, path }: { partitionId: string; bucketName: string; path: string }) {
        this.path = path
        this.arn = `arn:${partitionId}:s3:::${bucketName}/${path}`
        this.name = _(this.path)
            .split(DEFAULT_DELIMITER)
            .dropRight()!
            .last()!
    }

    public toString(): string {
        return `Folder (name=${this.name}, path=${this.path}, arn=${this.arn})`
    }
}

export class DefaultFile implements File {
    public readonly name: string
    public readonly key: string
    public readonly arn: string
    public readonly lastModified: Date | undefined
    public readonly sizeBytes: number | undefined

    public constructor({
        partitionId,
        bucketName,
        key,
        lastModified,
        sizeBytes,
    }: {
        partitionId: string
        bucketName: string
        key: string
        lastModified: Date | undefined
        sizeBytes: number | undefined
    }) {
        this.name = _(key)
            .split(DEFAULT_DELIMITER)
            .last()!
        this.key = key
        this.arn = `arn:${partitionId}:s3:::${bucketName}/${key}`
        this.lastModified = lastModified
        this.sizeBytes = sizeBytes
    }

    public toString(): string {
        return `File (name=${this.name}, key=${this.key}, arn=${this.arn}, lastModified=${this.lastModified}, sizeBytes=${this.sizeBytes})`
    }
}

class DefaultFileStreams implements FileStreams {
    public createReadStream(uri: vscode.Uri): stream.Readable {
        return fs.createReadStream(uri.fsPath)
    }

    public createWriteStream(uri: vscode.Uri): stream.Writable {
        return fs.createWriteStream(uri.fsPath)
    }
}

async function createSdkClient(regionCode: string): Promise<S3> {
    return await ext.sdkClientBuilder.createAndConfigureServiceClient(
        options => new S3(options),
        { computeChecksums: true },
        regionCode
    )
}

async function pipe(
    readStream: stream.Readable,
    writeStream: stream.Writable,
    progressListener?: (loadedBytes: number) => void
): Promise<void> {
    try {
        readStream.pipe(writeStream)

        let dataListener: ((chunk: any) => void) | undefined
        if (progressListener) {
            let loadedBytes = 0
            dataListener = (chunk: any) => {
                loadedBytes += chunk.length
                progressListener(loadedBytes)
            }
        }

        await Promise.all([promisifyReadStream(readStream, dataListener), promisifyWriteStream(writeStream)])
    } finally {
        writeStream.end()
    }
}

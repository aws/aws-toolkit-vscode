/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { S3, AWSError } from 'aws-sdk'
import * as _ from 'lodash'
import * as mime from 'mime-types'
import * as path from 'path'
import { ext } from '../extensionGlobals'
import { inspect } from 'util'
import { getLogger } from '../logger'
import { DefaultFileStreams, FileStreams, pipe, promisifyReadStream } from '../utilities/streamUtilities'
import {
    Bucket,
    CreateBucketRequest,
    CreateBucketResponse,
    CreateFolderRequest,
    CreateFolderResponse,
    DEFAULT_DELIMITER,
    DEFAULT_MAX_KEYS,
    DownloadFileRequest,
    File,
    Folder,
    ListBucketsResponse,
    ListObjectsRequest,
    ListObjectsResponse,
    S3Client,
    UploadFileRequest,
} from './s3Client'

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
     * @inheritDoc
     */
    public async createBucket(request: CreateBucketRequest): Promise<CreateBucketResponse> {
        getLogger().debug('CreateBucket called with request: %O', request)
        const s3 = await this.createS3()

        try {
            await s3
                .createBucket({
                    Bucket: request.bucketName,
                    CreateBucketConfiguration: { LocationConstraint: this.regionCode },
                })
                .promise()
        } catch (e) {
            getLogger().error('Failed to create bucket %s: %O', request.bucketName, e)
            throw e
        }

        const response = {
            bucket: new DefaultBucket({
                partitionId: this.partitionId,
                region: this.regionCode,
                name: request.bucketName,
            }),
        }
        getLogger().debug('CreateBucket returned response: %O', response)
        return response
    }

    /**
     * @inheritDoc
     */
    public async createFolder(request: CreateFolderRequest): Promise<CreateFolderResponse> {
        getLogger().debug('CreateFolder called with request: %O', request)
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
            getLogger().error('Failed to create folder %s: %O', folder.name, e)
            throw e
        }

        const response = { folder }
        getLogger().debug('CreateFolder returned response: %O', response)
        return response
    }

    /**
     * @inheritDoc
     */
    public async downloadFile(request: DownloadFileRequest): Promise<void> {
        getLogger().debug(
            'DownloadFile called for bucketName: %s, key: %s, saveLocation: %s',
            request.bucketName,
            request.key,
            request.saveLocation
        )
        const s3 = await this.createS3()

        // https://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/requests-using-stream-objects.html
        const readStream = s3.getObject({ Bucket: request.bucketName, Key: request.key }).createReadStream()
        const writeStream = this.fileStreams.createWriteStream(request.saveLocation)

        try {
            await pipe(readStream, writeStream, request.progressListener)
        } catch (e) {
            getLogger().error(`Failed to download %s from bucket %s: %O`, request.key, request.bucketName, e)
            throw e
        }
        getLogger().debug('DownloadFile succeeded')
    }

    /**
     * @inheritDoc
     */
    public async uploadFile(request: UploadFileRequest): Promise<void> {
        getLogger().debug(
            'UploadFile called for bucketName: %s, key: %s, fileLocation: %s',
            request.bucketName,
            request.key,
            request.fileLocation
        )
        const s3 = await this.createS3()

        // https://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/s3-example-creating-buckets.html#s3-example-creating-buckets-upload-file
        const readStream = this.fileStreams.createReadStream(request.fileLocation)
        const contentType = mime.lookup(path.basename(request.fileLocation.fsPath)) || DEFAULT_CONTENT_TYPE

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
            getLogger().error('Failed to upload %s to bucket %s: %O', request.key, request.bucketName, e)
            throw e
        }
        getLogger().debug('UploadFile succeeded')
    }

    /**
     * @inheritDoc
     */
    public async listBuckets(): Promise<ListBucketsResponse> {
        getLogger().debug('ListBuckets called')
        const s3 = await this.createS3()

        let s3Buckets: S3.Bucket[]
        try {
            const output = await s3.listBuckets().promise()
            s3Buckets = output.Buckets ?? []
        } catch (e) {
            getLogger().error('Failed to list buckets: %O', e)
            throw e
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

        const response = { buckets: bucketsInRegion }
        getLogger().debug('ListBuckets returned response: %O', response)
        return { buckets: bucketsInRegion }
    }

    /**
     * @inheritDoc
     */
    public async listObjects(request: ListObjectsRequest): Promise<ListObjectsResponse> {
        getLogger().debug('ListObjects called with request: %O', request)

        const s3 = await this.createS3()

        let output: S3.ListObjectsV2Output
        try {
            output = await s3
                .listObjectsV2({
                    Bucket: request.bucketName,
                    Delimiter: DEFAULT_DELIMITER,
                    MaxKeys: request.maxResults ?? DEFAULT_MAX_KEYS,
                    Prefix: request.folderPath,
                    ContinuationToken: request.continuationToken,
                })
                .promise()
        } catch (e) {
            getLogger().error('Failed to list objects for bucket %s: %O', request.bucketName, e)
            throw e
        }

        const files: File[] = _(output.Contents)
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

        const folders: Folder[] = _(output.CommonPrefixes)
            .map(prefix => prefix.Prefix)
            .compact()
            .map(path => new DefaultFolder({ path, partitionId: this.partitionId, bucketName: request.bucketName }))
            .value()

        const response = {
            files,
            folders,
            continuationToken: output.NextContinuationToken,
        }
        getLogger().debug('ListObjects returned response: %O', response)
        return response
    }

    /**
     * Looks up the region for the given bucket
     *
     * Note that although there is an S3#GetBucketLocation API,
     * this is the suggested method of obtaining the region.
     */
    private async lookupRegion(bucketName: string, s3: S3): Promise<string> {
        getLogger().debug('LookupRegion called for bucketName: %s', bucketName)

        try {
            const response = await s3.headBucket({ Bucket: bucketName }).promise()
            const region = response.$response.httpResponse.headers[BUCKET_REGION_HEADER]
            getLogger().debug('LookupRegion returned region: %s', region)
            return region
        } catch (e) {
            return (e as AWSError).region
        }
    }
}

export class DefaultBucket implements Bucket {
    public readonly name: string
    public readonly region: string
    public readonly arn: string

    public constructor({ partitionId, region, name }: { partitionId: string; region: string; name: string }) {
        this.name = name
        this.region = region
        this.arn = buildArn({ partitionId, bucketName: name })
    }

    public [inspect.custom](): string {
        return `Bucket (name=${this.name}, region=${this.region}, arn=${this.arn})`
    }
}

export class DefaultFolder implements Folder {
    public readonly name: string
    public readonly path: string
    public readonly arn: string

    public constructor({ partitionId, bucketName, path }: { partitionId: string; bucketName: string; path: string }) {
        this.path = path
        this.arn = buildArn({ partitionId, bucketName, key: path })
        this.name = _(this.path)
            .split(DEFAULT_DELIMITER)
            .dropRight()!
            .last()!
    }

    public [inspect.custom](): string {
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
        this.arn = buildArn({ partitionId, bucketName, key })
        this.lastModified = lastModified
        this.sizeBytes = sizeBytes
    }

    public [inspect.custom](): string {
        return `File (name=${this.name}, key=${this.key}, arn=${this.arn}, lastModified=${this.lastModified}, sizeBytes=${this.sizeBytes})`
    }
}

function buildArn({ partitionId, bucketName, key }: { partitionId: string; bucketName: string; key?: string }) {
    if (key === undefined) {
        return `arn:${partitionId}:s3:::${bucketName}`
    }

    return `arn:${partitionId}:s3:::${bucketName}/${key}`
}

async function createSdkClient(regionCode: string): Promise<S3> {
    clearInternalBucketCache()

    return await ext.sdkClientBuilder.createAndConfigureServiceClient(
        options => new S3(options),
        { computeChecksums: true },
        regionCode
    )
}

/**
 * Bucket region is cached across invocations without regard to partition
 * If partition changes with same bucket name in both partitions, cache is incorrect
 * @see https://github.com/aws/aws-sdk-js/blob/16a799c0681c01dcafa7b30be5f16894861b3a32/lib/services/s3.js#L919-L924
 */
function clearInternalBucketCache(): void {
    ;(S3.prototype as any).bucketRegionCache = {}
}

/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as _ from 'lodash'
import * as mime from 'mime-types'
import * as path from 'path'
import { AWSError, S3 } from 'aws-sdk'
import { inspect } from 'util'
import { ext } from '../extensionGlobals'
import { getLogger } from '../logger'
import { DefaultFileStreams, FileStreams, pipe, promisifyReadStream } from '../utilities/streamUtilities'
import { InterfaceNoSymbol } from '../utilities/tsUtils'

export const DEFAULT_MAX_KEYS = 300
export const DEFAULT_DELIMITER = '/'

export type Bucket = InterfaceNoSymbol<DefaultBucket>
export type Folder = InterfaceNoSymbol<DefaultFolder>
export type File = InterfaceNoSymbol<DefaultFile>
export type S3Client = InterfaceNoSymbol<DefaultS3Client>

interface S3Object {
    readonly key: string
    readonly versionId?: string
}

export interface ContinuationToken {
    readonly keyMarker: string
    readonly versionIdMarker?: string
}

export interface CreateBucketRequest {
    readonly bucketName: string
}

export interface CreateBucketResponse {
    readonly bucket: Bucket
}

export interface ListBucketsResponse {
    readonly buckets: Bucket[]
}

export interface ListFilesRequest {
    readonly bucketName: string
    readonly folderPath?: string
    readonly continuationToken?: string
    readonly maxResults?: number // Defaults to DEFAULT_MAX_KEYS
}

export interface ListFilesResponse {
    readonly files: File[]
    readonly folders: Folder[]
    readonly continuationToken?: string
}

export interface CreateFolderRequest {
    readonly bucketName: string
    readonly path: string
}

export interface CreateFolderResponse {
    readonly folder: Folder
}

export interface DownloadFileRequest {
    readonly bucketName: string
    readonly key: string
    readonly progressListener?: (loadedBytes: number) => void
    readonly saveLocation: vscode.Uri
}

export interface UploadFileRequest {
    readonly bucketName: string
    readonly key: string
    readonly progressListener?: (loadedBytes: number) => void
    readonly fileLocation: vscode.Uri
}

export interface ListObjectVersionsRequest {
    readonly bucketName: string
    readonly continuationToken?: ContinuationToken
    readonly maxResults?: number // Defaults to DEFAULT_MAX_KEYS
}

export interface ListObjectVersionsResponse {
    readonly objects: S3Object[]
    readonly continuationToken?: ContinuationToken
}

export interface DeleteObjectRequest {
    readonly bucketName: string
    readonly key: string
}

export interface DeleteObjectsRequest {
    readonly bucketName: string
    readonly objects: { key: string; versionId?: string }[]
}

export interface DeleteObjectsResponse {
    readonly errors: S3.Error[]
}

export interface DeleteBucketRequest {
    readonly bucketName: string
}

const DEFAULT_CONTENT_TYPE = 'application/octet-stream'

export class DefaultS3Client {
    public constructor(
        private readonly partitionId: string,
        private readonly regionCode: string,
        private readonly s3Provider: (regionCode: string) => Promise<S3> = createSdkClient,
        private readonly fileStreams: FileStreams = new DefaultFileStreams()
    ) {}

    private async createS3(): Promise<S3> {
        return this.s3Provider(this.regionCode)
    }

    /**
     * Creates a bucket in the region of the client.
     *
     * @throws Error if there is an error calling S3.
     */
    public async createBucket(request: CreateBucketRequest): Promise<CreateBucketResponse> {
        getLogger().debug('CreateBucket called with request: %O', request)
        const s3 = await this.createS3()

        try {
            await s3
                .createBucket({
                    Bucket: request.bucketName,
                    // Passing us-east-1 for LocationConstraint breaks creating bucket. To make a bucket in us-east-1, you need to
                    // not pass a region, so check for this case.
                    CreateBucketConfiguration:
                        this.regionCode == 'us-east-1' ? undefined : { LocationConstraint: this.regionCode },
                })
                .promise()
        } catch (e) {
            getLogger().error('Failed to create bucket %s: %O', request.bucketName, e)
            throw e
        }

        const response: CreateBucketResponse = {
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
     * Empties and deletes a bucket.
     *
     * Note that this just repeatedly calls list and delete to empty the bucket before deletion.
     * Failures during the emptying or deleting step can leave the bucket in a state where
     * some (or all) objects are deleted, but the bucket remains.
     *
     * @throws Error if there is an error calling S3 to empty or delete the bucket.
     */
    public async deleteBucket(request: DeleteBucketRequest): Promise<void> {
        getLogger().debug('DeleteBucket called with request: %O', request)
        const { bucketName } = request
        const s3 = await this.createS3()

        try {
            await this.emptyBucket(bucketName)
        } catch (e) {
            getLogger().error('Failed to empty bucket %s before deleting: %O', bucketName, e)
            throw e
        }

        try {
            await s3.deleteBucket({ Bucket: bucketName }).promise()
        } catch (e) {
            getLogger().error('Failed to delete bucket %s: %O', bucketName, e)
            throw e
        }

        getLogger().debug('DeleteBucket succeeded')
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
     * @throws Error if there is an error calling S3.
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

        const response: CreateFolderResponse = { folder }
        getLogger().debug('CreateFolder returned response: %O', response)
        return response
    }

    /**
     * Downloads a file to disk.
     *
     * The file's bucket should reside in the same region as the one configured for the client.
     *
     * Pipes the response (read) stream into the file (write) stream.
     *
     * @throws Error if there is an error calling S3 or piping between streams.
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
     * Uploads a file from disk.
     *
     * The destination bucket should reside in the same region as the one configured for the client.
     *
     * Pipes the file (read) stream into the request (write) stream.
     * Assigns the target content type based on the mime type of the file.
     * If content type cannot be determined, defaults to {@link DEFAULT_CONTENT_TYPE}.
     *
     * @throws Error if there is an error calling S3 or piping between streams.
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

        const managedUploaded = s3.upload({
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
     * Lists all buckets owned by the client.
     *
     *
     * @throws Error if there is an error calling S3.
     */
    public async listAllBuckets(): Promise<S3.Bucket[]> {
        const s3 = await this.createS3()

        let s3Buckets: S3.Bucket[]
        try {
            const output = await s3.listBuckets().promise()
            s3Buckets = output.Buckets ?? []
        } catch (e) {
            getLogger().error('Failed to list buckets: %O', e)
            throw e
        }
        return s3Buckets
    }

    /**
     * Lists buckets in the region of the client.
     *
     * Note that S3 returns all buckets in all regions,
     * so this incurs the cost of additional S3#getBucketLocation requests for each bucket
     * to filter out buckets residing outside of the client's region.
     *
     * @throws Error if there is an error calling S3.
     */
    public async listBuckets(): Promise<ListBucketsResponse> {
        getLogger().debug('ListBuckets called')
        const s3 = await this.createS3()

        const s3Buckets: S3.Bucket[] = await this.listAllBuckets()

        // S3#ListBuckets returns buckets across all regions
        const allBucketPromises: Promise<Bucket | undefined>[] = s3Buckets.map(async s3Bucket => {
            const bucketName = s3Bucket.Name
            if (!bucketName) {
                return undefined
            }
            const region = await this.lookupRegion(bucketName, s3)
            if (!region) {
                return undefined
            }
            return new DefaultBucket({
                partitionId: this.partitionId,
                region: region,
                name: bucketName,
            })
        })

        const allBuckets = await Promise.all(allBucketPromises)
        const bucketsInRegion = _(allBuckets)
            .reject(bucket => bucket === undefined)
            // we don't have a filerNotNull so we can filter then cast
            .map(bucket => bucket as Bucket)
            .reject(bucket => bucket.region !== this.regionCode)
            .value()

        const response: ListBucketsResponse = { buckets: bucketsInRegion }
        getLogger().debug('ListBuckets returned response: %O', response)
        return { buckets: bucketsInRegion }
    }

    /**
     * Lists files and folders in a folder or inside the bucket root.
     *
     * The bucket should reside in the same region as the one configured for the client.
     *
     * Returns the first {@link ListFilesRequest#maxResults} objects (the first "page").
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
     * @throws Error if there is an error calling S3.
     */
    public async listFiles(request: ListFilesRequest): Promise<ListFilesResponse> {
        getLogger().debug('ListFiles called with request: %O', request)

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
            getLogger().error('Failed to list files for bucket %s: %O', request.bucketName, e)
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

        const response: ListFilesResponse = {
            files,
            folders,
            continuationToken: output.NextContinuationToken,
        }
        getLogger().debug('ListFiles returned response: %O', response)
        return response
    }

    /**
     * Lists versions of all objects inside a bucket.
     *
     * The bucket should reside in the same region as the one configured for the client.
     *
     * Returns the first {@link ListObjectVersionsRequest#maxResults} versions (the first "page").
     * If there are more results, returns a continuation token that can be passed in a subsequent call
     * to get the next "page" of results.
     *
     * @throws Error if there is an error calling S3.
     */
    public async listObjectVersions(request: ListObjectVersionsRequest): Promise<ListObjectVersionsResponse> {
        getLogger().debug('ListObjectVersions called with request: %O', request)
        const s3 = await this.createS3()

        let output: S3.ListObjectVersionsOutput
        try {
            output = await s3
                .listObjectVersions({
                    Bucket: request.bucketName,
                    MaxKeys: request.maxResults ?? DEFAULT_MAX_KEYS,
                    KeyMarker: request.continuationToken?.keyMarker,
                    VersionIdMarker: request.continuationToken?.versionIdMarker,
                })
                .promise()
        } catch (e) {
            getLogger().error('Failed to list object versions: %O', e)
            throw e
        }

        const response: ListObjectVersionsResponse = {
            objects: (output.Versions ?? []).map(version => ({
                key: version.Key!,
                versionId: version.VersionId,
            })),
            continuationToken: output.IsTruncated
                ? { keyMarker: output.NextKeyMarker!, versionIdMarker: output.NextVersionIdMarker }
                : undefined,
        }
        getLogger().debug('ListObjectVersions returned response: %O', response)
        return response
    }

    /**
     * Returns an async iterable over all pages of {@link listObjectVersions}.
     *
     * @throws Error from the iterable if there is an error calling S3.
     */
    public async *listObjectVersionsIterable(
        request: ListObjectVersionsRequest
    ): AsyncIterableIterator<ListObjectVersionsResponse> {
        let continuationToken: ContinuationToken | undefined = request.continuationToken
        do {
            const listObjectVersionsResponse: ListObjectVersionsResponse = await this.listObjectVersions({
                bucketName: request.bucketName,
                maxResults: request.maxResults,
                continuationToken,
            })
            continuationToken = listObjectVersionsResponse.continuationToken

            yield listObjectVersionsResponse
        } while (continuationToken)
    }

    /**
     * Deletes an object from a bucket.
     *
     * The bucket should reside in the same region as the one configured for the client.
     *
     * @throws Error if there is an error calling S3.
     */
    public async deleteObject(request: DeleteObjectRequest): Promise<void> {
        getLogger().debug('DeleteObject called with request: %O', request)
        const s3 = await this.createS3()

        try {
            await s3
                .deleteObject({
                    Bucket: request.bucketName,
                    Key: request.key,
                })
                .promise()
        } catch (e) {
            getLogger().error('Failed to delete object: %O', e)
            throw e
        }

        getLogger().debug('DeleteObject succeeded')
    }

    /**
     * Deletes objects from a bucket.
     *
     * The bucket should reside in the same region as the one configured for the client.
     *
     * Returns a list of Errors that occurred if the delete was only partially completed.
     *
     * @throws Error if there is an error calling S3, beyond the partial errors mentioned above.
     */
    public async deleteObjects(request: DeleteObjectsRequest): Promise<DeleteObjectsResponse> {
        getLogger().debug('DeleteObjects called with request: %O', request)
        const s3 = await this.createS3()

        let errors: S3.Error[]
        try {
            const output = await s3
                .deleteObjects({
                    Bucket: request.bucketName,
                    Delete: {
                        Objects: request.objects.map(({ key: Key, versionId: VersionId }) => ({ Key, VersionId })),
                        Quiet: true,
                    },
                })
                .promise()

            errors = output.Errors ?? []
        } catch (e) {
            getLogger().error('Failed to delete objects: %O', e)
            throw e
        }

        const response: DeleteObjectsResponse = { errors }
        getLogger().debug('DeleteObjects returned response: %O', response)
        return response
    }

    /**
     * Looks up the region for the given bucket
     *
     * Use the getBucketLocation API to avoid cross region lookups.
     */
    private async lookupRegion(bucketName: string, s3: S3): Promise<string | undefined> {
        getLogger().debug('LookupRegion called for bucketName: %s', bucketName)

        try {
            const response = await s3.getBucketLocation({ Bucket: bucketName }).promise()
            // getBucketLocation returns an explicit empty string location contraint for us-east-1
            const region = response.LocationConstraint === '' ? 'us-east-1' : response.LocationConstraint
            getLogger().debug('LookupRegion returned region: %s', region)
            return region
        } catch (e) {
            // Try to recover region from the error
            return (e as AWSError).region
        }
    }

    /**
     * Empties a bucket by repeatedly listing and deleting all versions of all objects inside.
     *
     * Note that this just repeatedly calls list object versions and delete objects to empty the bucket.
     * Failures can leave the bucket in a state where only some objects are deleted.
     *
     * @throws Error if there is an error listing or deleting.
     */
    private async emptyBucket(bucketName: string): Promise<void> {
        try {
            for await (const { objects } of this.listObjectVersionsIterable({ bucketName })) {
                if (_(objects).isEmpty()) {
                    continue
                }

                const deleteObjectsResponse = await this.deleteObjects({ bucketName, objects })
                if (!_(deleteObjectsResponse.errors).isEmpty()) {
                    const e = new Error(inspect(deleteObjectsResponse.errors[0]))
                    getLogger().error('Failed to delete %d objects: %O...', deleteObjectsResponse.errors.length, e)
                    throw e
                }
            }
        } catch (e) {
            getLogger().error('Failed to empty bucket %s: %O', bucketName, e)
            throw e
        }
    }
}

export class DefaultBucket {
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

export class DefaultFolder {
    public readonly name: string
    public readonly path: string
    public readonly arn: string

    public constructor({ partitionId, bucketName, path }: { partitionId: string; bucketName: string; path: string }) {
        this.path = path
        this.arn = buildArn({ partitionId, bucketName, key: path })
        this.name = _(this.path).split(DEFAULT_DELIMITER).dropRight()!.last()!
    }

    public [inspect.custom](): string {
        return `Folder (name=${this.name}, path=${this.path}, arn=${this.arn})`
    }
}

export class DefaultFile {
    public readonly name: string
    public readonly key: string
    public readonly arn: string
    public readonly lastModified?: Date
    public readonly sizeBytes?: number

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
        lastModified?: Date
        sizeBytes?: number
    }) {
        this.name = _(key).split(DEFAULT_DELIMITER).last()!
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

    return await ext.sdkClientBuilder.createAwsService(S3, { computeChecksums: true }, regionCode)
}

/**
 * Bucket region is cached across invocations without regard to partition
 * If partition changes with same bucket name in both partitions, cache is incorrect
 * @see https://github.com/aws/aws-sdk-js/blob/16a799c0681c01dcafa7b30be5f16894861b3a32/lib/services/s3.js#L919-L924
 */
function clearInternalBucketCache(): void {
    ;(S3.prototype as any).bucketRegionCache = {}
}

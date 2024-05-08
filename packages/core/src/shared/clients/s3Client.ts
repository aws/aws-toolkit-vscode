/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as url from 'url'
import _ from 'lodash'
import { AWSError, S3 } from 'aws-sdk'
import { inspect } from 'util'
import { getLogger } from '../logger'
import { bufferToStream, DefaultFileStreams, FileStreams, pipe } from '../utilities/streamUtilities'
import { assertHasProps, InterfaceNoSymbol, isNonNullable, RequiredProps } from '../utilities/tsUtils'
import { Readable } from 'stream'
import globals from '../extensionGlobals'
import { defaultPartition } from '../regions/regionProvider'
import { AsyncCollection, toCollection } from '../utilities/asyncCollection'
import { toStream } from '../utilities/collectionUtils'

export const DEFAULT_MAX_KEYS = 300 // eslint-disable-line @typescript-eslint/naming-convention
export const DEFAULT_DELIMITER = '/' // eslint-disable-line @typescript-eslint/naming-convention

export type Bucket = InterfaceNoSymbol<DefaultBucket>
export type Folder = InterfaceNoSymbol<DefaultFolder>
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

export interface SignedUrlRequest {
    readonly bucketName: string
    readonly key: string
    readonly time: number
    readonly operation?: string
    readonly body?: string
}

export interface UploadFileRequest {
    readonly bucketName: string
    readonly key: string
    readonly content: vscode.Uri | Uint8Array
    readonly contentType?: string
    readonly progressListener?: (loadedBytes: number) => void
}

export interface HeadObjectRequest {
    readonly bucketName: string
    readonly key: string
}

export interface CharsetRequest {
    readonly key: string
    readonly bucketName: string
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

export interface GetObjectRequest {
    readonly bucketName: string
    readonly key: string
}

export interface GetObjectResponse {
    readonly objectBody: S3.Body
}

export class DefaultS3Client {
    public constructor(
        public readonly regionCode: string,
        private readonly partitionId = globals.regionProvider.getPartitionId(regionCode) ?? defaultPartition,
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

        await s3
            .createBucket({
                Bucket: request.bucketName,
                // Passing us-east-1 for LocationConstraint breaks creating bucket. To make a bucket in us-east-1, you need to
                // not pass a region, so check for this case.
                CreateBucketConfiguration:
                    this.regionCode === 'us-east-1' ? undefined : { LocationConstraint: this.regionCode },
            })
            .promise()

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

        await this.emptyBucket(bucketName)
        await s3.deleteBucket({ Bucket: bucketName }).promise()

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

        await s3
            .upload({
                Bucket: request.bucketName,
                Key: request.path,
                Body: '',
            })
            .promise()

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
        await pipe(readStream, writeStream, request.progressListener)

        getLogger().debug('DownloadFile succeeded')
    }

    /**
     * Lighter version of {@link downloadFile} that just returns the stream.
     */
    public async downloadFileStream(bucketName: string, key: string): Promise<Readable> {
        const s3 = await this.createS3()
        return s3.getObject({ Bucket: bucketName, Key: key }).createReadStream()
    }

    public async headObject(request: HeadObjectRequest): Promise<S3.HeadObjectOutput> {
        const s3 = await this.createS3()
        getLogger().debug('HeadObject called with request: %O', request)
        return s3.headObject({ Bucket: request.bucketName, Key: request.key }).promise()
    }

    /**
     * Generates a presigned URL for the given file in S3.
     * Takes a valid time option, which must be in seconds. This is the time the URL will be valid for
     *
     * @returns the string of the link to the presigned URL
     */
    public async getSignedUrl(request: SignedUrlRequest): Promise<string> {
        const time = request.time
        const operation = request.operation ? request.operation : 'getObject'
        const s3 = await this.createS3()

        const url = await s3.getSignedUrlPromise(operation, {
            Bucket: request.bucketName,
            Key: request.key,
            Body: request.body,
            Expires: time,
        })
        return url
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
     * @returns The S3.ManagedUpload stream
     * @throws Error if there is an error calling S3 or piping between streams.
     */
    public async uploadFile(request: UploadFileRequest): Promise<S3.ManagedUpload> {
        getLogger().debug('UploadFile called for bucketName: %s, key: %s', request.bucketName, request.key)
        const s3 = await this.createS3()

        // https://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/s3-example-creating-buckets.html#s3-example-creating-buckets-upload-file
        const readStream =
            request.content instanceof vscode.Uri
                ? this.fileStreams.createReadStream(request.content)
                : bufferToStream(request.content)

        const managedUploaded = s3.upload({
            Bucket: request.bucketName,
            Key: request.key,
            Body: readStream,
            ContentType: request.contentType,
        })

        const progressListener = request.progressListener
        if (progressListener) {
            let lastLoaded = 0
            managedUploaded.on('httpUploadProgress', progress => {
                progressListener(progress.loaded - lastLoaded)
                lastLoaded = progress.loaded
            })
        }

        return managedUploaded
    }

    /**
     * Lists all buckets owned by the client.
     *
     *
     * @throws Error if there is an error calling S3.
     */
    public async listAllBuckets(): Promise<S3.Bucket[]> {
        const s3 = await this.createS3()
        const output = await s3.listBuckets().promise()

        return output.Buckets ?? []
    }

    public listAllBucketsIterable(): AsyncCollection<RequiredProps<S3.Bucket, 'Name'> & { readonly region: string }> {
        async function* fn(this: DefaultS3Client) {
            const s3 = await this.createS3()
            const buckets = await this.listAllBuckets()

            yield* toStream(
                buckets.map(async bucket => {
                    assertHasProps(bucket, 'Name')
                    const region = await this.lookupRegion(bucket.Name, s3)
                    if (region) {
                        return { ...bucket, region }
                    }
                })
            )
        }

        return toCollection(fn.bind(this)).filter(isNonNullable)
    }

    /**
     * Filters the results of {@link listAllBucketsIterable} to the region of the client
     */
    public listBucketsIterable(): AsyncCollection<RequiredProps<S3.Bucket, 'Name'> & { readonly region: string }> {
        return this.listAllBucketsIterable().filter(b => b.region === this.regionCode)
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
        const bucket = new DefaultBucket({
            partitionId: this.partitionId,
            region: this.regionCode,
            name: request.bucketName,
        })
        const output = await s3
            .listObjectsV2({
                Bucket: bucket.name,
                Delimiter: DEFAULT_DELIMITER,
                MaxKeys: request.maxResults ?? DEFAULT_MAX_KEYS,
                Prefix: request.folderPath,
                ContinuationToken: request.continuationToken,
            })
            .promise()

        const files: File[] = _(output.Contents)
            .reject(file => file.Key === request.folderPath)
            .map(file => {
                assertHasProps(file, 'Key')
                return toFile(bucket, file)
            })
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

        const output = await s3
            .listObjectVersions({
                Bucket: request.bucketName,
                MaxKeys: request.maxResults ?? DEFAULT_MAX_KEYS,
                KeyMarker: request.continuationToken?.keyMarker,
                VersionIdMarker: request.continuationToken?.versionIdMarker,
            })
            .promise()

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

        await s3
            .deleteObject({
                Bucket: request.bucketName,
                Key: request.key,
            })
            .promise()

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

        const output = await s3
            .deleteObjects({
                Bucket: request.bucketName,
                Delete: {
                    Objects: request.objects.map(({ key: Key, versionId: VersionId }) => ({ Key, VersionId })),
                    Quiet: true,
                },
            })
            .promise()

        const response: DeleteObjectsResponse = { errors: output.Errors ?? [] }
        getLogger().debug('DeleteObjects returned response: %O', response)
        return response
    }

    /**
     * Looks up the region for the given bucket
     *
     * Use the getBucketLocation API to avoid cross region lookups. #1806
     */
    private async lookupRegion(bucketName: string, s3: S3): Promise<string | undefined> {
        try {
            const response = await s3.getBucketLocation({ Bucket: bucketName }).promise()
            // getBucketLocation returns an explicit empty string location contraint for us-east-1
            const region = response.LocationConstraint === '' ? 'us-east-1' : response.LocationConstraint
            getLogger().debug('LookupRegion(%s) returned: %s', bucketName, region)
            return region
        } catch (e) {
            getLogger().error('LookupRegion(%s) failed: %s', bucketName, (e as Error).message ?? '?')
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
    }

    /**
     * Gets an object from a bucket.
     *
     * The bucket should reside in the same region as the one configured for the client.
     *
     * @throws Error if there is an error calling S3.
     */
    public async getObject(request: GetObjectRequest): Promise<GetObjectResponse> {
        getLogger().debug('GetObject called with request: %O', request)
        const s3 = await this.createS3()

        const output = await s3
            .getObject({
                Bucket: request.bucketName,
                Key: request.key,
            })
            .promise()
        const response: GetObjectResponse = { objectBody: output.Body! }
        getLogger().debug('GetObject returned response: %O', response)
        return response
    }
}

/**
 * @deprecated This should be refactored the same way as {@link toFile}
 */
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

/**
 * @deprecated This should be refactored the same way as {@link toFile}
 */
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

export interface File extends S3.Object, S3.HeadObjectOutput {
    readonly name: string
    readonly key: string
    readonly arn: string
    readonly lastModified?: Date
    readonly sizeBytes?: number
    readonly eTag?: string
}

export function toFile(bucket: Bucket, resp: RequiredProps<S3.Object, 'Key'>, delimiter = DEFAULT_DELIMITER): File {
    return {
        key: resp.Key,
        arn: `${bucket.arn}/${resp.Key}`,
        name: resp.Key.split(delimiter).pop()!,
        eTag: resp.ETag,
        lastModified: resp.LastModified,
        sizeBytes: resp.Size,
        ...resp,
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

    return await globals.sdkClientBuilder.createAwsService(S3, { computeChecksums: true }, regionCode)
}

/**
 * Bucket region is cached across invocations without regard to partition
 * If partition changes with same bucket name in both partitions, cache is incorrect
 * @see https://github.com/aws/aws-sdk-js/blob/16a799c0681c01dcafa7b30be5f16894861b3a32/lib/services/s3.js#L919-L924
 */
function clearInternalBucketCache(): void {
    ;(S3.prototype as any).bucketRegionCache = {}
}

/**
 * A URI parser that can parse out information about an S3 URI
 * Adapted from
 * @see https://github.com/frantz/amazon-s3-uri/
 */
export function parseS3Uri(uri: string): [region: string, bucket: string, key: string] {
    const endpointPattern = /^(.+\.)?s3[.-]([a-z0-9-]+)\./
    const defaultRegion = 'us-east-1' // Default region for URI parsing, if region is not found
    const parsedUri = url.parse(uri)
    let bucket: string | undefined = undefined
    let region: string = defaultRegion
    let key: string | undefined = undefined

    if (parsedUri.protocol === 's3:') {
        bucket = parsedUri.host ?? undefined
        if (!bucket) {
            throw new Error(`Invalid S3 URI: no bucket: ${uri}`)
        }
        if (!parsedUri.pathname || parsedUri.pathname.length <= 1) {
            // s3://bucket or s3://bucket/
            key = undefined
        } else {
            // s3://bucket/key
            // Remove the leading '/'.
            key = parsedUri.pathname.substring(1)
        }
        if (key !== undefined) {
            key = decodeURIComponent(key)
        }
        return [region, bucket, key!]
    }

    if (!parsedUri.host) {
        throw new Error(`Invalid S3 URI: no hostname: ${uri}`)
    }

    const matches = parsedUri.host.match(endpointPattern)
    if (!matches) {
        throw new Error(`Invalid S3 URI: hostname does not appear to be a valid S3 endpoint: ${uri}`)
    }

    const prefix = matches[1]
    if (!prefix) {
        if (parsedUri.pathname === '/') {
            bucket = undefined
            key = undefined
        } else {
            const index = parsedUri.pathname!.indexOf('/', 1)
            if (index === -1) {
                // https://s3.amazonaws.com/bucket
                bucket = parsedUri.pathname!.substring(1) ?? undefined
                key = undefined
            } else if (index === parsedUri.pathname!.length - 1) {
                // https://s3.amazonaws.com/bucket/
                bucket = parsedUri.pathname!.substring(1, index)
                key = undefined
            } else {
                // https://s3.amazonaws.com/bucket/key
                bucket = parsedUri.pathname!.substring(1, index)
                key = parsedUri.pathname!.substring(index + 1)
            }
        }
    } else {
        // Remove the trailing '.' from the prefix to get the bucket.
        bucket = prefix.substring(0, prefix.length - 1)

        if (!parsedUri.pathname || parsedUri.pathname === '/') {
            key = undefined
        } else {
            // Remove the leading '/'.
            key = parsedUri.pathname.substring(1)
        }
    }

    if (matches[2] !== 'amazonaws') {
        region = matches[2]
    } else {
        region = defaultRegion
    }

    if (key !== undefined) {
        key = decodeURIComponent(key)
    }
    return [region, bucket!, key!]
}

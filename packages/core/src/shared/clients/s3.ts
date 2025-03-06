/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as url from 'url'
import _ from 'lodash'
import { inspect } from 'util'
import { getLogger } from '../logger/logger'
import { bufferToStream, DefaultFileStreams, FileStreams, pipe } from '../utilities/streamUtilities'
import { assertHasProps, InterfaceNoSymbol, RequiredProps } from '../utilities/tsUtils'
import { Readable } from 'stream'
import globals, { isWeb } from '../extensionGlobals'
import { defaultPartition } from '../regions/regionProvider'
import { AsyncCollection } from '../utilities/asyncCollection'
import { StreamingBlobTypes } from '@smithy/types'
import {
    _Object,
    BucketLocationConstraint,
    CreateBucketCommand,
    DeleteBucketCommand,
    GetObjectCommand,
    GetObjectCommandInput,
    GetObjectCommandOutput,
    HeadObjectCommand,
    HeadObjectOutput,
    ListObjectsV2Command,
    ListObjectsV2Output,
    PutObjectCommand,
    S3Client as S3ClientSDK,
    Bucket,
    paginateListBuckets,
    ListObjectVersionsCommand,
    ListObjectVersionsOutput,
    DeleteObjectCommand,
    DeleteObjectsCommand,
    DeleteObjectsOutput,
    GetObjectOutput,
    _Error,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { Progress, Upload } from '@aws-sdk/lib-storage'
import { ClientWrapper } from './clientWrapper'
import { ToolkitError } from '../errors'

export const DEFAULT_MAX_KEYS = 300 // eslint-disable-line @typescript-eslint/naming-convention
export const DEFAULT_DELIMITER = '/' // eslint-disable-line @typescript-eslint/naming-convention
export const defaultPrefix = ''

export type Folder = InterfaceNoSymbol<DefaultFolder>
export type S3Bucket = Bucket & { Name: string; BucketRegion: string; Arn: string }

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
    readonly bucket: S3Bucket
}

export interface ListBucketsResponse {
    readonly buckets: S3Bucket[]
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
    readonly errors: _Error[]
}

export interface DeleteBucketRequest {
    readonly bucketName: string
}

export interface GetObjectRequest {
    readonly bucketName: string
    readonly key: string
}

export interface GetObjectResponse {
    readonly objectBody: StreamingBlobTypes
}

export class S3Client extends ClientWrapper<S3ClientSDK> {
    public constructor(
        regionCode: string,
        private readonly partitionId = globals.regionProvider.getPartitionId(regionCode) ?? defaultPartition,
        private readonly fileStreams: FileStreams = new DefaultFileStreams()
    ) {
        super(regionCode, S3ClientSDK)
    }

    protected getCreateBucketConfiguration() {
        return this.regionCode === 'us-east-1'
            ? undefined
            : { LocationConstraint: this.regionCode as BucketLocationConstraint }
    }

    /**
     * Creates a bucket in the region of the client.
     *
     * @throws Error if there is an error calling S3.
     */
    public async createBucket(request: CreateBucketRequest): Promise<CreateBucketResponse> {
        getLogger().debug('CreateBucket called with request: %O', request)
        await this.makeRequest(CreateBucketCommand, {
            Bucket: request.bucketName,
            CreateBucketConfiguration: this.getCreateBucketConfiguration(),
        })

        const response: CreateBucketResponse = {
            bucket: toBucket(request.bucketName, this.regionCode, this.partitionId),
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

        await this.emptyBucket(bucketName)
        await this.makeRequest(DeleteBucketCommand, { Bucket: bucketName })

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
        await this.makeRequest(PutObjectCommand, { Bucket: request.bucketName, Key: request.path, Body: '' })

        const folder = new DefaultFolder({
            path: request.path,
            partitionId: this.partitionId,
            bucketName: request.bucketName,
        })

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

        const readStream = await this.downloadFileStream(request.bucketName, request.key)
        const writeStream = this.fileStreams.createWriteStream(request.saveLocation)

        await pipe(readStream, writeStream, request.progressListener)

        getLogger().debug('DownloadFile succeeded')
    }

    /**
     * Lighter version of {@link downloadFile} that just returns the stream.
     */
    public async downloadFileStream(bucketName: string, key: string): Promise<Readable> {
        // GetObject response body is now a `StreamingBlobPayloadOutputTypes` from @smithy/types.
        // this is a general type for web/node streams, therefore we must cast to nodes streaming type.
        const response = await this.makeRequest<GetObjectCommandInput, GetObjectCommandOutput, GetObjectCommand>(
            GetObjectCommand,
            {
                Bucket: bucketName,
                Key: key,
            }
        )

        if (isWeb()) {
            throw new ToolkitError('S3: downloading files is not supported in web.')
        }

        return (response.Body as Readable) ?? new Readable()
    }

    public async headObject(request: HeadObjectRequest): Promise<HeadObjectOutput> {
        getLogger().debug('HeadObject called with request: %O', request)
        return this.makeRequest(HeadObjectCommand, { Bucket: request.bucketName, Key: request.key })
    }

    /**
     * Generates a presigned URL for the given file in S3.
     * Takes a valid time option, which must be in seconds. This is the time the URL will be valid for
     *
     * @returns the string of the link to the presigned URL
     */
    public async getSignedUrlForObject(request: SignedUrlRequest): Promise<string> {
        return await getSignedUrl(
            this.getClient(),
            new GetObjectCommand({ Bucket: request.bucketName, Key: request.key }),
            {
                expiresIn: request.time,
            }
        )
    }

    public linkProgressListenerToUpload(
        upload: { on: (event: 'httpUploadProgress', listener: (progress: Progress) => void) => void },
        progressListener: (loadedBytes: number) => void
    ) {
        let lastLoaded = 0
        upload.on('httpUploadProgress', (progress) => {
            if (progress.loaded) {
                progressListener(progress.loaded - lastLoaded)
                lastLoaded = progress.loaded
            }
        })
    }

    /**
     * Uploads a file from disk.
     *
     * The destination bucket should reside in the same region as the one configured for the client.
     *
     * Pipes the file (read) stream into the request (write) stream.
     * Assigns the target content type based on the mime type of the file.
     *
     * @returns The Upload stream
     * @throws Error if there is an error calling S3 or piping between streams.
     */
    public async uploadFile(request: UploadFileRequest): Promise<Upload> {
        getLogger().debug('UploadFile called for bucketName: %s, key: %s', request.bucketName, request.key)
        // Upload example from: https://docs.aws.amazon.com/code-library/latest/ug/s3_example_s3_Scenario_UsingLargeFiles_section.html
        const readStream =
            request.content instanceof vscode.Uri
                ? this.fileStreams.createReadStream(request.content)
                : bufferToStream(request.content)

        const managedUpload = new Upload({
            client: this.getClient(),
            params: {
                Bucket: request.bucketName,
                Key: request.key,
                Body: readStream,
                ContentType: request.contentType,
            },
        })

        const progressListener = request.progressListener
        if (progressListener) {
            this.linkProgressListenerToUpload(managedUpload, progressListener)
        }

        return managedUpload
    }

    /**
     * Lists all buckets owned by the client.
     *
     *
     * @throws Error if there is an error calling S3.
     */
    private paginateBuckets(filterRegion: boolean = true): AsyncCollection<Bucket[]> {
        return this.makePaginatedRequest(
            paginateListBuckets,
            filterRegion ? { BucketRegion: this.regionCode } : {},
            (page) => page.Buckets
        )
    }

    // TODO: replace calls to listBucketsIterable and listBuckets with calls to this function once "Bucket" type is unified.
    private listValidBuckets(
        paginateBuckets: () => AsyncCollection<Bucket[]> = this.paginateBuckets.bind(this)
    ): AsyncCollection<S3Bucket[]> {
        const partitionId = this.partitionId
        return paginateBuckets().map(async (page) => page.filter(hasName).filter(hasRegion).map(addArn))

        function hasName<B extends Bucket>(b: B): b is B & { Name: string } {
            return b.Name !== undefined
        }

        function hasRegion<B extends Bucket>(b: B): b is B & { BucketRegion: string } {
            return b.BucketRegion !== undefined
        }

        function addArn<B extends Bucket & { Name: string; BucketRegion: string }>(b: B): S3Bucket {
            return toBucket(b.Name, b.BucketRegion, partitionId)
        }
    }

    public listBucketsIterable(): AsyncCollection<RequiredProps<Bucket, 'Name'> & { readonly region: string }> {
        return this.listValidBuckets()
            .flatten()
            .map((b) => {
                return {
                    region: b.BucketRegion,
                    ...b,
                }
            })
    }

    public async listBuckets(
        paginateBuckets: () => AsyncCollection<Bucket[]> = this.paginateBuckets.bind(this)
    ): Promise<ListBucketsResponse> {
        getLogger().debug('ListBuckets called')

        const toDefaultBucket = (b: Bucket & { Name: string; BucketRegion: string }) =>
            toBucket(b.Name, this.regionCode, this.partitionId)
        const buckets = await this.listValidBuckets(paginateBuckets).flatten().map(toDefaultBucket).promise()
        const response = { buckets }
        getLogger().debug('ListBuckets returned response: %O', response)
        return response
    }

    private async listObjectsV2(request: ListFilesRequest): Promise<ListObjectsV2Output> {
        return await this.makeRequest(ListObjectsV2Command, {
            Bucket: request.bucketName,
            Delimiter: DEFAULT_DELIMITER,
            MaxKeys: request.maxResults ?? DEFAULT_MAX_KEYS,
            /**
             * Set '' as the default prefix to ensure that the bucket's content will be displayed
             * when the user has at least list access to the root of the bucket
             * https://github.com/aws/aws-toolkit-vscode/issues/4643
             * @default ''
             */
            Prefix: request.folderPath ?? defaultPrefix,
            ContinuationToken: request.continuationToken,
        })
    }

    private extractFilesFromResponse(
        listObjectsRsp: ListObjectsV2Output,
        bucketName: string,
        folderPath: string | undefined
    ): File[] {
        const bucket = toBucket(bucketName, this.regionCode, this.partitionId)
        return _(listObjectsRsp.Contents)
            .reject((file) => file.Key === folderPath)
            .map((file) => {
                assertHasProps(file, 'Key')
                return toFile(bucket, file)
            })
            .value()
    }

    private extractFoldersFromResponse(listObjectsRsp: ListObjectsV2Output, bucketName: string): Folder[] {
        return _(listObjectsRsp.CommonPrefixes)
            .map((prefix) => prefix.Prefix)
            .compact()
            .map((path) => new DefaultFolder({ path, partitionId: this.partitionId, bucketName }))
            .value()
    }

    public listFilesFromResponse(
        listObjectsRsp: ListObjectsV2Output,
        bucketName: string,
        folderPath: string | undefined
    ) {
        const files = this.extractFilesFromResponse(listObjectsRsp, bucketName, folderPath)
        const folders = this.extractFoldersFromResponse(listObjectsRsp, bucketName)
        return {
            files,
            folders,
            continuationToken: listObjectsRsp.NextContinuationToken,
        }
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
        const output = await this.listObjectsV2(request)
        const response = this.listFilesFromResponse(output, request.bucketName, request.folderPath)

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

        const output: ListObjectVersionsOutput = await this.makeRequest(ListObjectVersionsCommand, {
            Bucket: request.bucketName,
            MaxKeys: request.maxResults ?? DEFAULT_MAX_KEYS,
            KeyMarker: request.continuationToken?.keyMarker,
            VersionIdMarker: request.continuationToken?.versionIdMarker,
        })
        const response = this.processListObjectVersionsResponse(output)
        getLogger().debug('ListObjectVersions returned response: %O', response)
        return response
    }

    public processListObjectVersionsResponse(output: ListObjectVersionsOutput) {
        return {
            objects: (output.Versions ?? []).map((version) => ({
                key: version.Key!,
                versionId: version.VersionId,
            })),
            continuationToken: output.IsTruncated
                ? { keyMarker: output.NextKeyMarker!, versionIdMarker: output.NextVersionIdMarker }
                : undefined,
        }
    }

    /**
     * Returns an async iterable over all pages of {@link listObjectVersions}.
     *
     * @throws Error from the iterable if there is an error calling S3.
     */
    public async *listObjectVersionsIterable(
        request: ListObjectVersionsRequest,
        listObjectVersions: (
            request: ListObjectVersionsRequest
        ) => Promise<ListObjectVersionsResponse> = this.listObjectVersions.bind(this)
    ): AsyncIterableIterator<ListObjectVersionsResponse> {
        let continuationToken: ContinuationToken | undefined = request.continuationToken
        do {
            const listObjectVersionsResponse: ListObjectVersionsResponse = await listObjectVersions({
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
        await this.makeRequest(DeleteObjectCommand, { Bucket: request.bucketName, Key: request.key })
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

        const output: DeleteObjectsOutput = await this.makeRequest(DeleteObjectsCommand, {
            Bucket: request.bucketName,
            Delete: {
                Objects: request.objects.map(({ key: Key, versionId: VersionId }) => ({ Key, VersionId })),
                Quiet: true,
            },
        })

        const response: DeleteObjectsResponse = { errors: output.Errors ?? [] }
        getLogger().debug('DeleteObjects returned response: %O', response)
        return response
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
     * Gets an object's body from a bucket.
     *
     * @throws Error if there is an error calling S3.
     */
    public async getObject(request: GetObjectRequest): Promise<GetObjectResponse> {
        getLogger().debug('GetObject called with request: %O', request)
        const output: GetObjectOutput = await this.makeRequest(GetObjectCommand, {
            Bucket: request.bucketName,
            Key: request.key,
        })

        const response: GetObjectResponse = { objectBody: output.Body! }
        getLogger().debug('GetObject returned response: %O', response)
        return response
    }
}

/**
 * @deprecated This should be refactored the same way as {@link toFile}
 */
// export class DefaultBucket {
//     public readonly name: string
//     public readonly region: string
//     public readonly arn: string

//     public constructor({ partitionId, region, name }: { partitionId: string; region: string; name: string }) {
//         this.name = name
//         this.region = region
//         this.arn = buildArn({ partitionId, bucketName: name })
//     }

//     public [inspect.custom](): string {
//         return `Bucket (name=${this.name}, region=${this.region}, arn=${this.arn})`
//     }
// }

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

export interface File extends _Object, HeadObjectOutput {
    readonly name: string
    readonly key: string
    readonly arn: string
    readonly lastModified?: Date
    readonly sizeBytes?: number
    readonly eTag?: string
}

export function toFile(bucket: S3Bucket, resp: RequiredProps<_Object, 'Key'>, delimiter = DEFAULT_DELIMITER): File {
    return {
        key: resp.Key,
        arn: `${bucket.Arn}/${resp.Key}`,
        name: resp.Key.split(delimiter).pop()!,
        eTag: resp.ETag,
        lastModified: resp.LastModified,
        sizeBytes: resp.Size,
        ...resp,
    }
}

export function toBucket(bucketName: string, region: string, partitionId: string): S3Bucket {
    return {
        Name: bucketName,
        BucketRegion: region,
        Arn: buildArn({ partitionId, bucketName }),
    }
}

function buildArn({ partitionId, bucketName, key }: { partitionId: string; bucketName: string; key?: string }) {
    if (key === undefined) {
        return `arn:${partitionId}:s3:::${bucketName}`
    }

    return `arn:${partitionId}:s3:::${bucketName}/${key}`
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

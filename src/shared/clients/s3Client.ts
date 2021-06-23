/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { S3 } from 'aws-sdk'
import * as vscode from 'vscode'

export const DEFAULT_MAX_KEYS = 300
export const DEFAULT_DELIMITER = '/'

export interface S3Client {
    /**
     * Creates a bucket in the region of the client.
     *
     * @throws Error if there is an error calling S3.
     */
    createBucket(request: CreateBucketRequest): Promise<CreateBucketResponse>

    /**
     * Lists all buckets owned by the client.
     *
     *
     * @throws Error if there is an error calling S3.
     */
    listAllBuckets(): Promise<S3.Bucket[]>

    /**
     * Lists buckets in the region of the client.
     *
     * Note that S3 returns all buckets in all regions,
     * so this incurs the cost of additional S3#getBucketLocation requests for each bucket
     * to filter out buckets residing outside of the client's region.
     *
     * @throws Error if there is an error calling S3.
     */
    listBuckets(): Promise<ListBucketsResponse>

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
    listFiles(request: ListFilesRequest): Promise<ListFilesResponse>

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
    createFolder(request: CreateFolderRequest): Promise<CreateFolderResponse>

    /**
     * Downloads a file to disk.
     *
     * The file's bucket should reside in the same region as the one configured for the client.
     *
     * Pipes the response (read) stream into the file (write) stream.
     *
     * @throws Error if there is an error calling S3 or piping between streams.
     */
    downloadFile(request: DownloadFileRequest): Promise<void>

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
    uploadFile(request: UploadFileRequest): Promise<void>

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
    listObjectVersions(request: ListObjectVersionsRequest): Promise<ListObjectVersionsResponse>

    /**
     * Returns an async iterable over all pages of {@link listObjectVersions}.
     *
     * @throws Error from the iterable if there is an error calling S3.
     */
    listObjectVersionsIterable(request: ListObjectVersionsRequest): AsyncIterableIterator<ListObjectVersionsResponse>

    /**
     * Deletes an object from a bucket.
     *
     * The bucket should reside in the same region as the one configured for the client.
     *
     * @throws Error if there is an error calling S3.
     */
    deleteObject(request: DeleteObjectRequest): Promise<void>

    /**
     * Deletes objects from a bucket.
     *
     * The bucket should reside in the same region as the one configured for the client.
     *
     * Returns a list of Errors that occurred if the delete was only partially completed.
     *
     * @throws Error if there is an error calling S3, beyond the partial errors mentioned above.
     */
    deleteObjects(request: DeleteObjectsRequest): Promise<DeleteObjectsResponse>

    /**
     * Empties and deletes a bucket.
     *
     * Note that this just repeatedly calls list and delete to empty the bucket before deletion.
     * Failures during the emptying or deleting step can leave the bucket in a state where
     * some (or all) objects are deleted, but the bucket remains.
     *
     * @throws Error if there is an error calling S3 to empty or delete the bucket.
     */
    deleteBucket(request: DeleteBucketRequest): Promise<void>
}

export interface Bucket {
    readonly name: string
    readonly region: string
    readonly arn: string
}

export interface Folder {
    readonly name: string // e.g. MyFolder (no trailing slash)
    readonly path: string // e.g. path/to/MyFolder/ (no bucket name)
    readonly arn: string
}

export interface File {
    readonly name: string // e.g. MyFile.jpg
    readonly key: string // e.g. path/to/myFile (no bucket name)
    readonly arn: string
    readonly lastModified?: Date
    readonly sizeBytes?: number
}

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

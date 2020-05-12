/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'

export const DEFAULT_MAX_KEYS = 300
export const DEFAULT_DELIMITER = '/'

export interface S3Client {
    /**
     * Creates a bucket in the region of the client.
     *
     * @throws S3Error if there is an error calling S3.
     */
    createBucket(request: CreateBucketRequest): Promise<CreateBucketResponse>

    /**
     * Lists buckets in the region of the client.
     *
     * Note that S3 returns all buckets in all regions,
     * so this incurs the cost of additional S3#HeadBucket requests for each bucket
     * to filter out buckets residing outside of the client's region.
     *
     * @throws S3Error if there is an error calling S3.
     */
    listBuckets(): Promise<ListBucketsResponse>

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
    listObjects(request: ListObjectsRequest): Promise<ListObjectsResponse>

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
    createFolder(request: CreateFolderRequest): Promise<CreateFolderResponse>

    /**
     * Downloads a file to disk.
     *
     * The file's bucket should reside in the same region as the one configured for the client.
     *
     * Pipes the response (read) stream into the file (write) stream.
     *
     * @throws S3Error if there is an error calling S3 or piping between streams.
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
     * @throws S3Error if there is an error calling S3 or piping between streams.
     */
    uploadFile(request: UploadFileRequest): Promise<void>
}

export interface Bucket {
    readonly name: string
    readonly region: string
    readonly arn: string
}

export interface Folder {
    readonly name: string // e.g. MyFolder (no trailing slash)
    readonly path: string // e.g. path/to/MyFolder (no bucket)
    readonly arn: string
}

export interface File {
    readonly name: string // e.g. MyFile.jpg
    readonly key: string // e.g. path/to/myFile (no bucket)
    readonly arn: string
    readonly lastModified?: Date
    readonly sizeBytes?: number
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

export interface ListObjectsRequest {
    readonly bucketName: string
    readonly folderPath?: string
    readonly continuationToken?: string
    readonly maxResults?: number
}

export interface ListObjectsResponse {
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

export class S3Error extends Error {}

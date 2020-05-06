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
     */
    createBucket(request: CreateBucketRequest): Promise<CreateBucketResponse>

    listBuckets(): Promise<ListBucketsResponse>

    listObjects(request: ListObjectsRequest): Promise<ListObjectsResponse>

    createFolder(request: CreateFolderRequest): Promise<CreateFolderResponse>

    downloadFile(request: DownloadFileRequest): Promise<void>
    uploadFile(request: UploadFileRequest): Promise<void>
}

export interface Bucket {
    readonly name: string
    readonly region: string
    readonly arn: string
}

export interface Folder {
    readonly name: string
    readonly path: string
    readonly arn: string
}

export interface File {
    readonly name: string
    readonly key: string
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

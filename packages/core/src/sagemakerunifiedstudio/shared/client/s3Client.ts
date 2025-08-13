/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { S3 } from '@aws-sdk/client-s3'
import { getLogger } from '../../../shared/logger/logger'

/**
 * Represents an S3 path (bucket or prefix)
 */
export interface S3Path {
    bucket: string
    prefix?: string
    displayName: string
    isFolder: boolean
    size?: number
    lastModified?: Date
}

/**
 * Client for interacting with AWS S3 API using project credentials
 */
export class S3Client {
    private s3Client: S3 | undefined
    private readonly logger = getLogger()

    constructor(
        private readonly region: string,
        private readonly credentials: {
            accessKeyId: string
            secretAccessKey: string
            sessionToken?: string
        }
    ) {}

    /**
     * Lists S3 paths (folders and objects) using prefix-based navigation
     * Uses S3's hierarchical folder-like structure by leveraging prefixes and delimiters
     * @param bucket S3 bucket name to list objects from
     * @param prefix Optional prefix to filter objects (acts like a folder path)
     * @param continuationToken Optional continuation token for pagination
     * @returns Object containing paths and nextToken for pagination
     */
    public async listPaths(
        bucket: string,
        prefix?: string,
        continuationToken?: string
    ): Promise<{ paths: S3Path[]; nextToken?: string }> {
        try {
            this.logger.info(`S3Client: Listing paths in bucket ${bucket} with prefix ${prefix || 'root'}`)

            const s3Client = await this.getS3Client()

            // Call S3 ListObjectsV2 API with delimiter to simulate folder structure
            // Delimiter '/' treats forward slashes as folder separators
            // This returns both CommonPrefixes (folders) and Contents (files)
            const response = await s3Client.listObjectsV2({
                Bucket: bucket,
                Prefix: prefix, // Filter objects that start with this prefix
                Delimiter: '/', // Treat '/' as folder separator for hierarchical listing
                ContinuationToken: continuationToken, // For pagination
            })

            const paths: S3Path[] = []

            // Process CommonPrefixes - these represent "folders" in S3
            // CommonPrefixes are object keys that share a common prefix up to the delimiter
            if (response.CommonPrefixes) {
                for (const commonPrefix of response.CommonPrefixes) {
                    if (commonPrefix.Prefix) {
                        // Extract folder name by removing the parent prefix and trailing slash
                        // Example: if prefix="folder1/" and commonPrefix="folder1/subfolder/"
                        // folderName becomes "subfolder"
                        const folderName = commonPrefix.Prefix.replace(prefix || '', '').replace('/', '')
                        paths.push({
                            bucket,
                            prefix: commonPrefix.Prefix, // Full S3 prefix for this folder
                            displayName: folderName, // Human-readable folder name
                            isFolder: true, // Mark as folder for UI rendering
                        })
                    }
                }
            }

            // Process Contents - these represent actual S3 objects (files)
            if (response.Contents) {
                for (const object of response.Contents) {
                    // Skip if no key or if key matches the prefix exactly (folder itself)
                    if (object.Key && object.Key !== prefix) {
                        // Extract file name by removing the parent prefix
                        // Example: if prefix="folder1/" and object.Key="folder1/file.txt"
                        // fileName becomes "file.txt"
                        const fileName = object.Key.replace(prefix || '', '')

                        // Only include actual files (not folder markers ending with '/')
                        if (fileName && !fileName.endsWith('/')) {
                            paths.push({
                                bucket,
                                prefix: object.Key, // Full S3 object key
                                displayName: fileName, // Human-readable file name
                                isFolder: false, // Mark as file for UI rendering
                                size: object.Size, // File size in bytes
                                lastModified: object.LastModified, // Last modification timestamp
                            })
                        }
                    }
                }
            }

            this.logger.info(`S3Client: Found ${paths.length} paths in bucket ${bucket}`)
            return {
                paths,
                nextToken: response.NextContinuationToken,
            }
        } catch (err) {
            this.logger.error('S3Client: Failed to list paths: %s', err as Error)
            throw err
        }
    }

    /**
     * Gets the S3 client, initializing it if necessary
     */
    private async getS3Client(): Promise<S3> {
        if (!this.s3Client) {
            try {
                this.s3Client = new S3({
                    region: this.region,
                    credentials: this.credentials,
                })
                this.logger.debug('S3Client: Successfully created S3 client')
            } catch (err) {
                this.logger.error('S3Client: Failed to create S3 client: %s', err as Error)
                throw err
            }
        }
        return this.s3Client
    }
}

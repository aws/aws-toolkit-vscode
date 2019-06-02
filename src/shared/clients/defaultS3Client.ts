/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { S3 } from 'aws-sdk'
import { ext } from '../extensionGlobals'
import { S3Client } from './s3Client'

export class DefaultS3Client implements S3Client {

    public constructor (
        private readonly regionCode: string
    ) { }

    public async getBucketLocation(bucket: string): Promise<S3.GetBucketLocationOutput> {
        const sdkClient = await this.createSdkClient()

        const response = await sdkClient.getBucketLocation({
            Bucket: bucket
        }).promise()

        return response
    }

    public async listBuckets(): Promise<S3.ListBucketsOutput> {
        const sdkClient = await this.createSdkClient()

        const response = await sdkClient.listBuckets().promise()

        return response
    }

    private async createSdkClient(): Promise<S3> {
        return await ext.sdkClientBuilder.createAndConfigureServiceClient(
            (options) => new S3(options),
            undefined,
            this.regionCode
        )
    }
}

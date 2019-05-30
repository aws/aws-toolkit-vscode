/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { S3 } from 'aws-sdk'

export interface S3Client {

    regionCode: string,

    getBucketLocation(bucket: string): Promise<S3.GetBucketLocationOutput>

    listBuckets(): Promise<S3.ListBucketsOutput>

}

'use strict';

import S3 = require('aws-sdk/clients/s3');
import { ext } from '../shared/extensionGlobals';
import { BucketNode } from './explorer/bucketNode';

export async function listBuckets() : Promise<BucketNode[]> {
    const s3Client = await ext.sdkClientBuilder.createAndConfigureSdkClient(S3, undefined);

    let arr: BucketNode[] = [];
    try {
        await s3Client.listBuckets()
        .promise()
        .then((r:S3.ListBucketsOutput) => {
            if (r && r.Buckets) {
                r.Buckets.forEach((b: S3.Bucket) => {
                    arr.push(new BucketNode(b, s3Client));
                });
            }
        });

    } catch (error) {
        // todo
    }

    return arr;
}
/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { localize } from '../shared/utilities/vsCodeUtils'
/**
 * Creates a readable path to an s3 bucket or object (e.g. s3://...).
 *
 * This is the format used by AWS CLI.
 * @see https://docs.aws.amazon.com/cli/latest/reference/s3/#path-argument-type
 *
 * @param bucket contains the name of the bucket.
 * @param path to the object, or an empty string if this is the root of the bucket.
 * @returns the readable path to the s3 bucket or object (e.g. s3://...).
 */
export function readablePath({ bucket, path }: { bucket: { name: string }; path: string }): string {
    return path ? `s3://${bucket.name}/${path}` : `s3://${bucket.name}`
}

/**
 * Validates an S3 bucket name.
 *
 * @see https://docs.aws.amazon.com/AmazonS3/latest/dev/BucketRestrictions.html#bucketnamingrules
 * @returns undefined if the name passes validation. Otherwise, an error message is returned.
 */
export function validateBucketName(name: string): string | undefined {
    if (name.length < 3 || name.length > 63) {
        return localize(
            'AWS.s3.validateBucketName.error.invalidLength',
            'Bucket name must be between 3 and 63 characters long'
        )
    }

    if (!/^[a-z0-9]/.test(name)) {
        return localize(
            'AWS.s3.validateBucketName.error.invalidStart',
            'Bucket name must start with a lowercase letter or number'
        )
    }

    if (!/[a-z0-9]$/.test(name)) {
        return localize(
            'AWS.s3.validateBucketName.error.invalidEnd',
            'Bucket name must end with a lowercase letter or number'
        )
    }

    if (!/^[a-z0-9\-.]+$/.test(name)) {
        return localize(
            'AWS.s3.validateBucketName.error.invalidCharacters',
            'Bucket name must only contain lowercase letters, numbers, hyphens, and periods'
        )
    }

    if (name.includes('..') || name.includes('.-') || name.includes('-.')) {
        return localize(
            'AWS.s3.validateBucketName.error.misusedPeriods',
            'Periods in bucket name must be surrounded by a lowercase letter or number'
        )
    }

    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}.\d{1,3}$/.test(name)) {
        return localize(
            'AWS.s3.validateBucketName.error.resemblesIpAddress',
            'Bucket name must not resemble an IP address'
        )
    }

    return undefined
}

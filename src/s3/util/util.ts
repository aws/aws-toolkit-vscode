/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

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

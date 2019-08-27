/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Converts ARNs into friendly names.
 * Friendly name = text following the final slash in the ARN
 * Returns undefined if the ARN doesn't contain slashes.
 *
 * @param arn ARN to pull the resource name from
 */
export function convertArnToResourceName(arn: string): string | undefined {
    const splitString = arn.split('/')
    if (splitString.length > 1) {
        // always return last capture group
        return (splitString[splitString.length - 1])
    }

    // resource name not found
    return undefined
}

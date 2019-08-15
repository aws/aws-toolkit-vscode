/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Converts ECS ARNs into friendly names. All ECS ARNs have the same naming requirement:
 * Up to 255 letters (uppercase and lowercase), numbers, hyphens, and underscores are allowed.
 *
 * @param arn ARN to pull the resource name from
 * @param excluded Resource-level text to omit from the resource name.
 * Some ARNs are nested under another resource name (e.g. services and tasks can incorporate the parent cluster name)
 * See https://docs.aws.amazon.com/general/latest/gr/aws-arns-and-namespaces.html#arn-syntax-ecs for details
 */
export function convertEcsArnToResourceName(arn: string, excluded?: string): string | undefined {
    const regex = excluded ?
        new RegExp(`\/(?:${excluded}\/){0,1}([a-zA-Z0-9-_]{1,255})`) : new RegExp('\/([a-zA-Z0-9-_]{1,255})')

    const regexedString = regex.exec(arn)
    if (regexedString) {
        // always return last capture group
        return (regexedString[1])
    }

    // resource name not found
    return undefined
}

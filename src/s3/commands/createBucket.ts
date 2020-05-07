/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getLogger } from '../../shared/logger'
import { S3Node } from '../explorer/s3Nodes'
import { DefaultCommands, Commands } from '../../shared/vscode/commands'
import { DefaultWindow, Window } from '../../shared/vscode/window'
import * as telemetry from '../../shared/telemetry/telemetry'
import { localize } from '../../shared/utilities/vsCodeUtils'

/**
 * Creates a bucket in the s3 region represented by the given node.
 *
 * Prompts the user for the bucket name, applying basic validations.
 * Creates the bucket.
 * Refreshes the node.
 */
export async function createBucketCommand(
    node: S3Node,
    window: Window = new DefaultWindow(),
    commands: Commands = new DefaultCommands()
): Promise<void> {
    getLogger().debug(`CreateBucket called for ${node}`)

    const bucketName = await window.showInputBox({
        prompt: localize('AWS.s3.createBucket.prompt', 'Create Bucket'),
        placeHolder: localize('AWS.s3.createBucket.placeHolder', 'Bucket Name'),
        validateInput: validateBucketName,
    })

    if (!bucketName) {
        getLogger().info('CreateBucket cancelled')
        telemetry.recordS3CreateBucket({ result: 'Cancelled' })
        return
    }

    getLogger().info(`Creating bucket ${bucketName}`)
    try {
        const bucket = await node.createBucket({ bucketName })

        getLogger().info(`Successfully created bucket ${bucket}`)
        telemetry.recordS3CreateBucket({ result: 'Succeeded' })
    } catch (e) {
        getLogger().error(`Failed to create bucket ${bucketName}`, e)
        window.showErrorMessage(
            localize('AWS.s3.createBucket.error.general', 'Failed to create bucket {0}', bucketName)
        )
        telemetry.recordS3CreateBucket({ result: 'Failed' })
    }

    await refreshNode(node, commands)
}

/**
 * https://docs.aws.amazon.com/AmazonS3/latest/dev/BucketRestrictions.html#bucketnamingrules
 */
function validateBucketName(name: string): string | undefined {
    if (name.length < 3 || name.length > 63) {
        return localize(
            'AWS.s3.createBucket.error.invalidLength',
            'Bucket name must be between 3 and 63 characters long'
        )
    }

    if (!name.match(/^[a-z0-9]/)) {
        return localize(
            'AWS.s3.createBucket.error.invalidStart',
            'Bucket name must start with a lowercase letter or number'
        )
    }

    if (!name.match(/[a-z0-9]$/)) {
        return localize(
            'AWS.s3.createBucket.error.invalidEnd',
            'Bucket name must end with a lowercase letter or number'
        )
    }

    if (!name.match(/^[a-z0-9\-.]+$/)) {
        return localize(
            'AWS.s3.createBucket.error.illegalCharacters',
            'Bucket name must only contain lowercase letters, numbers, hyphens, and periods'
        )
    }

    if (name.includes('..') || name.includes('.-') || name.includes('-.')) {
        return localize(
            'AWS.s3.createBucket.error.misusedPeriods',
            'Periods in bucket name must be surrounded by a lowercase letter or number'
        )
    }

    if (name.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}.\d{1,3}$/)) {
        return localize('AWS.s3.createBucket.error.resemblesIpAddress', 'Bucket name must not resemble an IP address')
    }

    return undefined
}

async function refreshNode(node: S3Node, commands: Commands): Promise<void> {
    return commands.execute('aws.refreshAwsExplorerNode', node)
}

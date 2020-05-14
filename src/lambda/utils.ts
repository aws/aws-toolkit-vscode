/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import { CloudFormation, CloudWatchLogs, Lambda } from 'aws-sdk'
import * as vscode from 'vscode'
import { CloudFormationClient } from '../shared/clients/cloudFormationClient'
import { CloudWatchLogsClient } from '../shared/clients/cloudWatchLogsClient'
import { LambdaClient } from '../shared/clients/lambdaClient'

export async function* listCloudFormationStacks(
    client: CloudFormationClient
): AsyncIterableIterator<CloudFormation.StackSummary> {
    // TODO: this 'loading' message needs to go under each regional entry
    // in the explorer, and be removed when that region's query completes
    const status = vscode.window.setStatusBarMessage(
        localize('AWS.message.statusBar.loading.cloudFormation', 'Loading CloudFormation Stacks...')
    )

    try {
        yield* client.listStacks()
    } finally {
        status.dispose()
    }
}

export async function* listLambdaFunctions(client: LambdaClient): AsyncIterableIterator<Lambda.FunctionConfiguration> {
    const status = vscode.window.setStatusBarMessage(
        localize('AWS.message.statusBar.loading.lambda', 'Loading Lambdas...')
    )

    try {
        yield* client.listFunctions()
    } finally {
        if (!!status) {
            status.dispose()
        }
    }
}

export async function* listCloudWatchLogGroups(
    client: CloudWatchLogsClient
): AsyncIterableIterator<CloudWatchLogs.LogGroup> {
    const status = vscode.window.setStatusBarMessage(
        localize('AWS.message.statusBar.loading.logGroups', 'Loading Log Groups...')
    )

    try {
        yield* client.describeLogGroups()
    } finally {
        if (!!status) {
            status.dispose()
        }
    }
}

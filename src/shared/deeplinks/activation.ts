/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import * as telemetry from '../../shared/telemetry/telemetry'
import { Arn, isArn, parse } from './arn'
import { Commands } from '../vscode/commands2'
import { ExtContext } from '../extensions'
import { ArnScanner } from './scanner'
import { AWSResourceNode, isAwsResourceNode } from '../treeview/nodes/awsResourceNode'
import { ConsoleLinkBuilder } from './builder'
import { AWSTreeNodeBase } from '../treeview/nodes/awsTreeNodeBase'
import { getLogger } from '../logger'
import { showViewLogsMessage } from '../utilities/messages'

// known bugs:
// * S3 directory links are unreliable. Looks like their link format needs updates.
// * API gateway ARNs need to specify a 'resource' to work correctly

// TODO: remove S3Folder and APIG from nodes for now

export function activate(context: ExtContext): void {
    const scanner = new ArnScanner(target => openArnCommand.build(target).asUri())

    context.extensionContext.subscriptions.push(
        vscode.languages.registerDocumentLinkProvider({ pattern: '**/*' }, scanner),
        openArnCommand.register()
    )
}

function openResourceCommand(target?: AWSResourceNode | Arn | string | unknown) {
    if (target instanceof AWSTreeNodeBase && isAwsResourceNode(target)) {
        return openArn(target.arn, 'Explorer')
    } else if (typeof target === 'string' || isArn(target)) {
        return openArn(target, 'Editor')
    } else {
        getLogger().error('Links: unknown object was not an ARN or did not have an ARN: %O', target)
        showViewLogsMessage(localize('aws.deepLinks.unknownResource', 'Unable to open a resource without an ARN'))
    }
}

async function openArn(input: string | Arn, source: 'Editor' | 'Explorer'): Promise<void> {
    let result: telemetry.Result = 'Failed'

    // TODO: show status bar + optional cancel if it takes too long to open the link
    try {
        const arn = typeof input === 'string' ? parse(input) : input
        const builder = new ConsoleLinkBuilder(arn.region)
        const link = await builder.getLinkFromArn(arn)

        await vscode.env.openExternal(link)
    } catch (error) {
        result = 'Failed'
        const message = localize(
            'aws.deepLinks.genericError',
            `Failed to open resource: {0}`,
            error instanceof Error ? error.message : String(error)
        )

        getLogger().error(`Links: failed to open resource: %O`, error)
        await vscode.window.showErrorMessage(message)
    } finally {
        telemetry.recordDeeplinkOpen({ result, source, passive: false })
    }
}

const openArnCommand = Commands.declare('aws.deepLinks.openResource', () => openResourceCommand)

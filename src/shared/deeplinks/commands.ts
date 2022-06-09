/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as telemetry from '../../shared/telemetry/telemetry'
import * as vscode from 'vscode'
import { AWSResourceNode, isAwsResourceNode } from '../treeview/nodes/awsResourceNode'
import { AWSTreeNodeBase } from '../treeview/nodes/awsTreeNodeBase'
import { showMessageWithCancel, showViewLogsMessage } from '../utilities/messages'
import { Arn, isArn, parseFirst, toString } from './arn'
import { getLogger } from '../logger'
import { ConsoleLinkBuilder } from './builder'
import { Commands } from '../vscode/commands2'
import { UnknownError } from '../toolkitError'
import { CancellationError, Timeout } from '../utilities/timeoutUtils'

export async function openArn(
    builder: ConsoleLinkBuilder,
    input: string | Arn,
    source: 'Explorer' | 'Editor'
): Promise<void> {
    const timeout = new Timeout(60000)
    let result: telemetry.Result = 'Succeeded'

    try {
        const arn = typeof input === 'string' ? parseFirst(input) : input
        const linkPromise = builder.getLinkFromArn(arn, timeout.token)

        const statusMessage = localize('aws.deepLinks.opening', 'Opening ARN...')
        const status = vscode.window.setStatusBarMessage(statusMessage, linkPromise)
        const timer = setTimeout(() => {
            const detailedMessage = localize('aws.deepLinks.openingDetailed', 'Opening link for {0}...', toString(arn))
            showMessageWithCancel(detailedMessage, timeout, vscode.window)
            status.dispose()
        }, 2500)

        timeout.onCompletion(() => {
            clearTimeout(timer)
            status.dispose()
        })

        const link = await linkPromise.finally(() => timeout.dispose())
        if (!timeout.token.isCancellationRequested) {
            await vscode.env.openExternal(link)
        }
    } catch (e) {
        if (CancellationError.isUserCancelled(e)) {
            result = 'Cancelled'
            return
        }

        result = 'Failed'
        const error = UnknownError.cast(e)
        const message = localize('aws.deepLinks.genericError', `Failed to open resource: {0}`, error.message)

        getLogger().error(`deeplinks: failed to open resource: ${error.message}`)
        showViewLogsMessage(message)
    } finally {
        telemetry.recordDeeplinkOpen({ result, source, passive: false })
    }
}

export class DeepLinkCommands {
    private readonly pending = new Map<string, Promise<void>>()

    public constructor(private readonly builder: ConsoleLinkBuilder) {}

    public async openArn(target?: AWSResourceNode | Arn | string | unknown): Promise<void> {
        if (target instanceof AWSTreeNodeBase && isAwsResourceNode(target)) {
            return this.openArnDebounced(target.arn, 'Explorer')
        } else if (typeof target === 'string' || isArn(target)) {
            return this.openArnDebounced(target, 'Editor')
        } else {
            // This is marked as passive as we aren't sure what called this command
            telemetry.recordDeeplinkOpen({ result: 'Failed', source: 'Unknown', passive: true })
            getLogger().error('deeplinks: unknown object was not an ARN or did not have an ARN: %O', target)
            await showViewLogsMessage(
                localize('aws.deepLinks.unknownResource', 'Unable to open a resource without an ARN')
            )
        }
    }

    private async openArnDebounced(target: string | Arn, source: 'Explorer' | 'Editor'): Promise<void> {
        const key = typeof target === 'string' ? target : toString(target)
        const promise = this.pending.get(key) ?? openArn(this.builder, target, source)

        if (!this.pending.has(key)) {
            this.pending.set(
                key,
                promise.finally(() => this.pending.delete(key))
            )
        }

        return promise
    }
}

export const openArnCommand = Commands.from(DeepLinkCommands).declareOpenArn('aws.deepLinks.openResource')

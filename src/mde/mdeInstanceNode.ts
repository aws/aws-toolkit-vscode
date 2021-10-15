/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
import * as mde from '../shared/clients/mdeClient'
import { AWSResourceNode } from '../shared/treeview/nodes/awsResourceNode'
import { AWSTreeNodeBase } from '../shared/treeview/nodes/awsTreeNodeBase'
import { getStatusIcon } from './mdeModel'
import { MdeRootNode } from './mdeRootNode'

const localize = nls.loadMessageBundle()

export class MdeInstanceNode extends AWSTreeNodeBase implements AWSResourceNode {
    name: string
    arn: string

    public constructor(public readonly parent: MdeRootNode, public readonly env: mde.MdeEnvironment) {
        super('')
        this.arn = env.arn
        this.name = env.id
        this.contextValue = 'awsMdeInstanceNode'
        this.label = this.getFriendlyName()
        this.iconPath = getStatusIcon(env.status ?? '')
        this.tooltip = this.makeTooltip(env)
        this.command = {
            command: 'aws.mdeConnect',
            title: localize('AWS.mde.connect', 'Connect to {0}', env.id),
            arguments: [parent],
        }
    }

    private makeTooltip(env: mde.MdeEnvironment): string {
        let tags = ''
        for (const t of Object.entries(env.tags ?? {})) {
            tags += `  ${t[0]}: ${t[1]}\n`
        }
        return `Id: ${env.id}
Status: ${env.status}
IDEs: ${env.ides ?? ''}
Tags: ${tags}
Created: ${env.createdAt ?? '?'}
Started: ${env.lastStartedAt}
Created by: ${env.userArn}`
    }

    private getFriendlyName(): string {
        const status = this.env.status === 'RUNNING' ? '' : this.env.status
        const label = `${this.env.id.substring(0, 7)}… ${status}`
        return label
    }
}

/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
import * as mde from '../shared/clients/mdeClient'
import { AWSResourceNode } from '../shared/treeview/nodes/awsResourceNode'
import { AWSTreeNodeBase } from '../shared/treeview/nodes/awsTreeNodeBase'
import { getRelativeDate } from '../shared/utilities/textUtilities'
import { makeLabelsString, getStatusIcon } from './mdeModel'
import { MdeRootNode } from './mdeRootNode'

const localize = nls.loadMessageBundle()

export class MdeInstanceNode extends AWSTreeNodeBase implements AWSResourceNode {
    public readonly name: string
    public readonly arn: string
    private readonly NODE_BASENAME = 'awsMdeInstanceNode'

    public constructor(public readonly parent: MdeRootNode, private _env: mde.MdeEnvironment) {
        super('')
        this.arn = _env.arn
        this.name = _env.id
        this.command = {
            command: 'aws.mde.configure',
            title: localize('AWS.command.mde.configure', 'Configure', _env.id),
            arguments: [this],
        }
        this.update(_env)
    }

    public update(env: mde.MdeEnvironment): void {
        this._env = env
        this.label = makeLabelsString(env) || this.getFriendlyName(env)
        this.contextValue = `${this.NODE_BASENAME}${env.status ? `.${env.status}` : ''}`
        this.iconPath = getStatusIcon(env.status ?? '')
        this.tooltip = this.makeTooltip(env)
        this.description = env.lastStartedAt ? getRelativeDate(env.lastStartedAt) : undefined
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

    // TODO: If a user adds a friendly name via label, show here instead?
    private getFriendlyName(env: mde.MdeEnvironment): string {
        return `${env.id.substring(0, 7)}… ${localize('aws.mde.noLabels', '(no labels)')}`
    }

    public get env(): mde.MdeEnvironment {
        return this._env
    }
}

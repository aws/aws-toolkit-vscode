/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
import * as mde from '../shared/clients/mdeClient'
import { AWSTreeNodeBase } from '../shared/treeview/nodes/awsTreeNodeBase'
import { MdeRootNode } from './mdeRootNode'

const localize = nls.loadMessageBundle()

export class MdeInstanceNode extends AWSTreeNodeBase {
    public constructor(public readonly parent: MdeRootNode, public readonly env: mde.MdeEnvironment) {
        super('')
        this.contextValue = 'awsMdeInstanceNode'
        this.label = this.getFriendlyName()
        this.tooltip = this.makeTooltip(env)
        this.command = {
            command: 'aws.mdeConnect',
            title: localize('AWS.mde.connect', 'Connect to {0}', env.environmentId),
            arguments: [parent],
        }
    }

    private makeTooltip(env: mde.MdeEnvironment): string {
        let tags = ''
        for (const t of Object.entries(env.tags ?? {})) {
            tags += `${t[0]}: ${t[1]}`
        }
        return `Id: ${env.environmentId}\nStatus: ${env.status}\nCreated: ${env.createTime ?? '?'}\nType: ${
            env.instanceType
        }\nUser: ${env.userId}\nRuntimes: ${env.ideRuntimes ?? ''}\nTags: ${tags}`
    }

    private getFriendlyName(): string {
        const status = this.env.status === 'RUNNING' ? '' : this.env.status
        const label = `${this.env.environmentId.substring(0, 7)}… ${this.env.userId} ${status}`
        // return validate(identifier) ? parse(identifier).resource : identifier
        return label
    }
}

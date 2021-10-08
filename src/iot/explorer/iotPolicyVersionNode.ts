/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as moment from 'moment'
import { Iot } from 'aws-sdk'
import { IotClient, IotPolicy } from '../../shared/clients/iotClient'
import { AWSResourceNode } from '../../shared/treeview/nodes/awsResourceNode'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { Workspace } from '../../shared/vscode/workspace'
import { inspect } from 'util'
import { IotPolicyWithVersionsNode } from './iotPolicyNode'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { LOCALIZED_DATE_FORMAT } from '../../shared/constants'

/**
 * Represents an IoT Policy that may have either a Certificate Node or the
 * Policy Folder Node as a parent.
 */
export class IotPolicyVersionNode extends AWSTreeNodeBase implements AWSResourceNode {
    public constructor(
        public policy: IotPolicy,
        public version: Iot.PolicyVersion,
        public isDefault: boolean,
        public readonly parent: IotPolicyWithVersionsNode,
        public readonly iot: IotClient,
        protected readonly workspace = Workspace.vscode()
    ) {
        super(`Version ${version.versionId}` + (version.isDefaultVersion ? '*' : ''))
        this.update(version)
    }

    public update(version: Iot.PolicyVersion): void {
        this.version = version
        this.isDefault = version.isDefaultVersion ?? false
        this.tooltip = localize(
            'AWS.explorerNode.iot.versionTooltip',
            'Policy: {0}\nVersion: {1}\n{2}Created: {3}',
            this.policy.name,
            this.version.versionId,
            this.isDefault ? 'DEFAULT\n' : '',
            moment(this.version.createDate).format(LOCALIZED_DATE_FORMAT)
        )
        this.contextValue = 'awsIotPolicyVersionNode.' + (this.isDefault ? 'DEFAULT' : 'NONDEFAULT')
    }

    public get arn(): string {
        return this.parent.arn
    }

    public get name(): string {
        return this.parent.name
    }

    public [inspect.custom](): string {
        return `IotPolicyNode (policy=${this.policy.name})`
    }
}

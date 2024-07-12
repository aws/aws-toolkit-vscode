/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { inspect } from 'util'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { DBInstance } from '../../shared/clients/docdbClient'
import { DocDBContext, DocDBNodeContext } from './docdbNode'
import { DBClusterNode } from './dbClusterNode'
import { ModifyDBInstanceMessage } from '@aws-sdk/client-docdb'

/**
 * An AWS Explorer node representing a DocumentDB instance.
 */
export class DBInstanceNode extends AWSTreeNodeBase {
    public name: string = this.instance.DBInstanceIdentifier ?? ''

    constructor(public readonly parent: DBClusterNode, readonly instance: DBInstance) {
        super(instance.DBInstanceIdentifier ?? '[Instance]', vscode.TreeItemCollapsibleState.None)
        this.description = this.makeDescription()
        this.contextValue = this.getContext()
        this.tooltip = `${this.name}\nClass: ${this.instance.DBInstanceClass}\nStatus: ${this.status}`
    }

    private makeDescription(): string {
        if (this.getContext() !== DocDBContext.InstanceAvailable) {
            return `${this.status} • ${this.instance.DBInstanceClass}`
        }
        const type = this.instance.IsClusterWriter ? 'primary' : 'replica'
        return `${type} • ${this.instance.DBInstanceClass}`
    }

    private getContext(): DocDBNodeContext {
        if (this.status === 'available') {
            return DocDBContext.InstanceAvailable
        }
        return DocDBContext.Instance
    }

    public async renameInstance(instanceName: string): Promise<DBInstance | undefined> {
        const request: ModifyDBInstanceMessage = {
            DBInstanceIdentifier: this.instance.DBInstanceIdentifier,
            NewDBInstanceIdentifier: instanceName,
            ApplyImmediately: true,
        }
        return await this.parent.client.modifyInstance(request)
    }

    public get status(): string | undefined {
        return this.instance.DBInstanceStatus
    }

    public [inspect.custom](): string {
        return 'DBInstanceNode'
    }
}

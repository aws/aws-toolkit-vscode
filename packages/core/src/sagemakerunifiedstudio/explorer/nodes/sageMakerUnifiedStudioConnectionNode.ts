/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from '../../../shared/logger/logger'
import { TreeNode } from '../../../shared/treeview/resourceTreeDataProvider'
import { SageMakerUnifiedStudioConnectionParentNode } from './sageMakerUnifiedStudioConnectionParentNode'
import { ConnectionSummary, ConnectionType } from '@aws-sdk/client-datazone'

export class SageMakerUnifiedStudioConnectionNode implements TreeNode {
    public resource: SageMakerUnifiedStudioConnectionNode
    contextValue: string
    private readonly logger = getLogger()
    id: string
    public constructor(
        private readonly parent: SageMakerUnifiedStudioConnectionParentNode,
        private readonly connection: ConnectionSummary
    ) {
        this.id = connection.name ?? ''
        this.resource = this
        this.contextValue = this.getContext()
        this.logger.debug(`SageMaker Space Node created: ${this.id}`)
    }

    public async getTreeItem(): Promise<vscode.TreeItem> {
        const item = new vscode.TreeItem(this.id, vscode.TreeItemCollapsibleState.None)
        item.contextValue = this.getContext()
        item.tooltip = new vscode.MarkdownString(this.buildTooltip())
        return item
    }
    private buildTooltip(): string {
        if (this.connection.type === ConnectionType.REDSHIFT) {
            const tooltip = ''.concat(
                '### Compute Details\n\n',
                `**Type**  \n${this.connection.type}\n\n`,
                `**Environment ID**  \n${this.connection.environmentId}\n\n`,
                `**JDBC URL**  \n${this.connection.props?.redshiftProperties?.jdbcUrl}`
            )
            return tooltip
        } else if (this.connection.type === ConnectionType.SPARK) {
            const tooltip = ''.concat(
                '### Compute Details\n\n',
                `**Type**  \n${this.connection.type}\n\n`,
                `**Glue version**  \n${this.connection.props?.sparkGlueProperties?.glueVersion}\n\n`,
                `**Worker type**  \n${this.connection.props?.sparkGlueProperties?.workerType}\n\n`,
                `**Number of workers**  \n${this.connection.props?.sparkGlueProperties?.numberOfWorkers}\n\n`,
                `**Idle timeout (minutes)**  \n${this.connection.props?.sparkGlueProperties?.idleTimeout}\n\n`
            )
            return tooltip
        } else {
            return ''
        }
    }
    private getContext(): string {
        return 'SageMakerUnifiedStudioConnectionNode'
    }

    public getParent(): TreeNode | undefined {
        return this.parent
    }
}

/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { AWSTreeNodeBase } from '../../../shared/treeview/nodes/awsTreeNodeBase'
import { cdk } from '../../globals'
import { CfnResourceKeys, ConstructTreeEntity } from '../tree/types'

/**
 * Represents a CDK construct
 */
export class ConstructNode extends AWSTreeNodeBase {
    private readonly type: string

    get tooltip(): string {
        return this.type || this.construct.path
    }

    get id(): string {
        return this.construct.path
    }

    get iconPath(): string | vscode.Uri | { light: string | vscode.Uri; dark: string | vscode.Uri } | vscode.ThemeIcon {
        if (this.type) {
            return {
                light: cdk.iconPaths.light.cloudFormation,
                dark: cdk.iconPaths.dark.cloudFormation
            }
        }

        return {
            light: cdk.iconPaths.light.cdk,
            dark: cdk.iconPaths.dark.cdk
        }
    }

    public constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly construct: ConstructTreeEntity
    ) {
        super(construct.id, collapsibleState)
        this.contextValue = 'awsCdkNode'

        this.type = construct.attributes ? (construct.attributes[CfnResourceKeys.TYPE] as string) : ''
    }

    public async getChildren(): Promise<(ConstructNode)[]> {
        const entities = []

        if (!this.construct.children) {
            return []
        }

        for (const key of Object.keys(this.construct.children)) {
            const child = this.construct.children[key] as ConstructTreeEntity

            // TODO tree should not be encoded in the CDK tree spec and should be removed
            if (child.id !== 'Tree' && child.path !== 'Tree') {
                const cfnResourceType = child.attributes && (child.attributes[CfnResourceKeys.TYPE] as string)
                entities.push(
                    new ConstructNode(
                        child.id === 'Resource' && cfnResourceType ? `${child.id} (${cfnResourceType})` : child.id,
                        child.children || child.attributes
                            ? vscode.TreeItemCollapsibleState.Collapsed
                            : vscode.TreeItemCollapsibleState.None,
                        child
                    )
                )
            }
        }

        return entities
    }
}

/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { AWSTreeNodeBase } from '../../../shared/treeview/nodes/awsTreeNodeBase'
import { cdk } from '../../globals'
import { CfnResourceKeys, ConstructTreeEntity } from '../tree/types'
import { PropertyNode } from './propertyNode'

/**
 * Represents a CDK construct
 */
export class ConstructNode extends AWSTreeNodeBase {
    private readonly type: string
    private readonly properties: { [key: string]: any } | undefined

    get tooltip(): string {
        return this.type || this.treePath
    }

    get id(): string {
        return this.treePath
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
        public readonly treePath: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly children?: { [key: string]: any },
        public readonly attributes?: { [key: string]: any }
    ) {
        super(label, collapsibleState)
        this.contextValue = 'awsCdkNode'

        this.type = attributes ? <string>attributes[CfnResourceKeys.TYPE] : ''
        this.properties = attributes ? <{ [key: string]: any }>attributes[CfnResourceKeys.PROPS] : undefined
    }

    public async getChildren(): Promise<(ConstructNode | PropertyNode)[]> {
        const entities = []

        if (this.properties) {
            const propertyNodes: PropertyNode[] = PropertyNode.extractProps(this.properties)
            for (const node of propertyNodes) {
                entities.push(node)
            }

            return entities
        }

        if (!this.children) {
            return []
        }

        for (const key of Object.keys(this.children)) {
            const child = <ConstructTreeEntity>this.children[key]

            entities.push(
                new ConstructNode(
                    child.id,
                    child.path,
                    child.children || child.attributes
                        ? vscode.TreeItemCollapsibleState.Collapsed
                        : vscode.TreeItemCollapsibleState.None,
                    child.children,
                    child.attributes
                )
            )
        }

        return entities
    }
}

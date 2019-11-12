/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { AWSTreeNodeBase } from '../../../shared/treeview/nodes/awsTreeNodeBase'
import { cdk } from '../../globals'

/*
 * Represents a property of a CDK construct. Properties can be simple key-value pairs, Arrays,
 * or objects that are nested deeply
 */
export class PropertyNode extends AWSTreeNodeBase {
    get iconPath(): string | vscode.Uri | { light: string | vscode.Uri; dark: string | vscode.Uri } | vscode.ThemeIcon {
        return {
            light: cdk.iconPaths.light.settings,
            dark: cdk.iconPaths.dark.settings
        }
    }

    public constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly children?: { [key: string]: any }
    ) {
        super(label, collapsibleState)
        this.contextValue = 'awsCdkNode'
    }

    public async getChildren(): Promise<PropertyNode[]> {
        if (!this.children) {
            return []
        }

        return PropertyNode.extractProps(this.children)
    }

    public static extractProps(properties: { [key: string]: any }): PropertyNode[] {
        const propertyNodes: PropertyNode[] = []

        for (const property of Object.keys(properties)) {
            const value = properties[property]

            if (value instanceof Array || value instanceof Object) {
                // tslint:disable-next-line: no-unsafe-any
                propertyNodes.push(new PropertyNode(property, vscode.TreeItemCollapsibleState.Collapsed, value))
            } else {
                propertyNodes.push(new PropertyNode(`${property}: ${value}`, vscode.TreeItemCollapsibleState.None))
            }
        }

        return propertyNodes
    }
}

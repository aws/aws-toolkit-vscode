/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import globals from '../../../shared/extensionGlobals'
import * as vscode from 'vscode'
import { AWSTreeNodeBase } from '../../../shared/treeview/nodes/awsTreeNodeBase'

/*
 * Represents a property of a CDK construct. Properties can be simple key-value pairs, Arrays,
 * or objects that are nested deeply
 */
export class PropertyNode extends AWSTreeNodeBase {
    public constructor(
        label: string,
        collapsibleState: vscode.TreeItemCollapsibleState,
        private readonly subProperties?: { [key: string]: any }
    ) {
        super(label, collapsibleState)
        this.contextValue = 'awsCdkPropertyNode'
        this.iconPath = {
            dark: vscode.Uri.file(globals.iconPaths.dark.settings),
            light: vscode.Uri.file(globals.iconPaths.light.settings),
        }
    }

    public async getChildren(): Promise<PropertyNode[]> {
        if (!this.subProperties) {
            return []
        }

        return generatePropertyNodes(this.subProperties)
    }
}

export function generatePropertyNodes(properties: { [key: string]: any }): PropertyNode[] {
    const propertyNodes: PropertyNode[] = []

    for (const property of Object.keys(properties)) {
        const value = properties[property]

        if (value instanceof Array || value instanceof Object) {
            propertyNodes.push(new PropertyNode(property, vscode.TreeItemCollapsibleState.Collapsed, value))
        } else {
            propertyNodes.push(new PropertyNode(`${property}: ${value}`, vscode.TreeItemCollapsibleState.None))
        }
    }

    return propertyNodes
}

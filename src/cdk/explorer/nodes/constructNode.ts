/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { AWSTreeNodeBase } from '../../../shared/treeview/nodes/awsTreeNodeBase'
import { cdk } from '../../globals'
import * as treeInspector from '../tree/treeInspector'
import { ConstructProps, ConstructTreeEntity } from '../tree/types'
import { generatePropertyNodes, PropertyNode } from './propertyNode'

/**
 * Represents a CDK construct
 */
export class ConstructNode extends AWSTreeNodeBase {
    private readonly type: string
    private readonly properties: ConstructProps | undefined

    get tooltip(): string {
        return this.type || this.construct.path
    }

    get id(): string {
        return `${this.parent.id}/${this.label}`
    }

    public constructor(
        public readonly parent: AWSTreeNodeBase,
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly construct: ConstructTreeEntity
    ) {
        super(construct.id, collapsibleState)
        this.contextValue = 'awsCdkConstructNode'

        this.type = treeInspector.getTypeAttributeOrDefault(construct, '')
        this.properties = treeInspector.getProperties(construct)
        // TODO move icon logic to global utility
        if (this.type) {
            this.iconPath = {
                dark: vscode.Uri.file(cdk.iconPaths.dark.cloudFormation),
                light: vscode.Uri.file(cdk.iconPaths.light.cloudFormation)
            }
        } else {
            this.iconPath = {
                dark: vscode.Uri.file(cdk.iconPaths.dark.cdk),
                light: vscode.Uri.file(cdk.iconPaths.light.cdk)
            }
        }
    }

    public async getChildren(): Promise<(ConstructNode | PropertyNode)[]> {
        const entities: (ConstructNode | PropertyNode)[] = []

        // add all properties
        if (this.properties) {
            const propertyNodes: PropertyNode[] = generatePropertyNodes(this.properties)
            entities.push(...propertyNodes)
        }

        if (!this.construct.children) {
            return entities
        }

        // add all children
        for (const key of Object.keys(this.construct.children)) {
            const child = this.construct.children[key] as ConstructTreeEntity

            if (treeInspector.includeConstructInTree(child)) {
                entities.push(
                    new ConstructNode(
                        this,
                        treeInspector.getDisplayLabel(child),
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

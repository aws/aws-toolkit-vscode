/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { TreeNode } from '../../../shared/treeview/resourceTreeDataProvider'
import { cdk } from '../../globals'
import { CdkAppLocation } from '../cdkProject'
import * as treeInspector from '../tree/treeInspector'
import { ConstructTreeEntity } from '../tree/types'
import { generatePropertyNodes } from './propertyNode'

export class ConstructNode implements TreeNode {
    public readonly id = this.construct.id
    public readonly treeItem: vscode.TreeItem
    private readonly type = treeInspector.getTypeAttributeOrDefault(this.construct, '')
    private readonly properties = treeInspector.getProperties(this.construct)

    public constructor(private readonly location: CdkAppLocation, private readonly construct: ConstructTreeEntity) {
        this.treeItem = this.createTreeItem()
    }

    public get resource() {
        return {
            construct: this.construct,
            location: this.location.treeUri.with({ fragment: this.construct.path }),
        }
    }

    public getChildren() {
        const propertyNodes = this.properties !== undefined ? generatePropertyNodes(this.properties) : []
        const constructNodes =
            this.construct.children !== undefined ? generateConstructNodes(this.location, this.construct.children) : []

        return [...propertyNodes, ...constructNodes]
    }

    private createTreeItem() {
        const collapsibleState =
            this.construct.children || this.construct.attributes
                ? vscode.TreeItemCollapsibleState.Collapsed
                : vscode.TreeItemCollapsibleState.None

        const item = new vscode.TreeItem(treeInspector.getDisplayLabel(this.construct), collapsibleState)
        item.contextValue = isStateMachine(this.construct) ? 'awsCdkStateMachineNode' : 'awsCdkConstructNode'
        item.tooltip = this.type || this.construct.path

        if (this.type) {
            item.iconPath = {
                dark: vscode.Uri.file(cdk.iconPaths.dark.cloudFormation),
                light: vscode.Uri.file(cdk.iconPaths.light.cloudFormation),
            }
        } else {
            item.iconPath = {
                dark: vscode.Uri.file(cdk.iconPaths.dark.cdk),
                light: vscode.Uri.file(cdk.iconPaths.light.cdk),
            }
        }

        return item
    }
}

export function generateConstructNodes(app: CdkAppLocation, children: NonNullable<ConstructTreeEntity['children']>) {
    return Object.values(children)
        .filter(c => treeInspector.includeConstructInTree(c))
        .map(c => new ConstructNode(app, c))
}

/**
 * Determines if a CDK construct is of type state machine
 *
 * @param {ConstructTreeEntity} construct - CDK construct
 */
export function isStateMachine(construct: ConstructTreeEntity): boolean {
    const resource = construct.children?.Resource
    if (!resource) {
        return false
    }
    const type: string = treeInspector.getTypeAttributeOrDefault(resource, '')
    return type === 'AWS::StepFunctions::StateMachine'
}

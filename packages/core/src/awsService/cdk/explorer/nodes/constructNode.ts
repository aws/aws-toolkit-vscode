/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import { getIcon } from '../../../../shared/icons'
import { TreeNode } from '../../../../shared/treeview/resourceTreeDataProvider'
import { CdkAppLocation } from '../cdkProject'
import { ConstructSourceInfo } from '../sourceLinks'
import * as treeInspector from '../tree/treeInspector'
import { ConstructTreeEntity } from '../tree/types'
import { generatePropertyNodes } from './propertyNode'

export class ConstructNode implements TreeNode {
    public readonly id = this.construct.id
    private readonly type = treeInspector.getTypeAttributeOrDefault(this.construct, '')
    private readonly properties = treeInspector.getProperties(this.construct)

    public constructor(
        private readonly location: CdkAppLocation,
        private readonly construct: ConstructTreeEntity,
        private readonly sourceMap?: ReadonlyMap<string, ConstructSourceInfo>
    ) {}

    public get resource() {
        const info = this.sourceMap?.get(this.construct.path)
        return {
            construct: this.construct,
            location: this.location.treeUri.with({ fragment: this.construct.path }),
            templateFile: info?.templateFile,
            templateOffset: info?.templateOffset,
        }
    }

    public getChildren() {
        const propertyNodes = this.properties !== undefined ? generatePropertyNodes(this.properties) : []
        const constructNodes =
            this.construct.children !== undefined
                ? generateConstructNodes(this.location, this.construct.children, this.sourceMap)
                : []

        return [...propertyNodes, ...constructNodes]
    }

    public getTreeItem() {
        const collapsibleState =
            this.construct.children || this.construct.attributes
                ? vscode.TreeItemCollapsibleState.Collapsed
                : vscode.TreeItemCollapsibleState.None

        const item = new vscode.TreeItem(treeInspector.getDisplayLabel(this.construct), collapsibleState)
        // What the CDK language server resolved for this construct (source
        // location and/or template target); absent when the server is unavailable.
        const info = this.sourceMap?.get(this.construct.path)
        const baseContext = isStateMachine(this.construct) ? 'awsCdkStateMachineNode' : 'awsCdkConstructNode'
        // Mark nodes that map to a template resource so the inline "open template"
        // icon (contributed for viewItem =~ /WithTemplate$/) shows only where it applies.
        item.contextValue = info?.templateFile ? `${baseContext}WithTemplate` : baseContext
        item.tooltip = this.type || this.construct.path
        item.iconPath = this.type ? getIcon('aws-cloudformation-stack') : getIcon('aws-cdk-logo')

        // Source link: when the CDK language server resolved this construct to a
        // source location, open it on click. Nodes with no resolved location (or
        // when the server is unavailable) keep their original click behavior.
        const source = info?.sourceLocation
        if (source) {
            // SourceLocation is 1-based; vscode.Position is 0-based.
            const position = new vscode.Position(Math.max(0, source.line - 1), Math.max(0, source.column - 1))
            item.command = {
                command: 'vscode.open',
                title: localize('AWS.cdk.explorerNode.openSource', 'Open Source'),
                arguments: [vscode.Uri.file(source.file), { selection: new vscode.Range(position, position) }],
            }
        }

        return item
    }
}

export function generateConstructNodes(
    app: CdkAppLocation,
    children: NonNullable<ConstructTreeEntity['children']>,
    sourceMap?: ReadonlyMap<string, ConstructSourceInfo>
) {
    return Object.values(children)
        .filter((c) => treeInspector.includeConstructInTree(c))
        .map((c) => new ConstructNode(app, c, sourceMap))
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

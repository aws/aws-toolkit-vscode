/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as path from 'path'
import * as vscode from 'vscode'
import { getLogger } from '../../../shared/logger'
import { AWSTreeNodeBase } from '../../../shared/treeview/nodes/awsTreeNodeBase'
import { PlaceholderNode } from '../../../shared/treeview/nodes/placeholderNode'
import { cdk } from '../../globals'
import { CdkAppLocation, getApp } from '../cdkProject'
import { includeConstructInTree } from '../tree/treeInspector'
import { ConstructNode } from './constructNode'

/**
 * Represents a CDK App
 * Existence of apps is determined by the presence of `cdk.json` in a workspace folder
 */
export class AppNode extends AWSTreeNodeBase {
    public expandMetricRecorded: boolean = false

    public constructor(public readonly app: CdkAppLocation) {
        super(app.cdkJsonPath, vscode.TreeItemCollapsibleState.Collapsed)
        this.contextValue = 'awsCdkAppNode'
        this.label = path.relative(path.dirname(app.workspaceFolder.uri.fsPath), path.dirname(app.cdkJsonPath))

        this.iconPath = {
            dark: vscode.Uri.file(cdk.iconPaths.dark.cdk),
            light: vscode.Uri.file(cdk.iconPaths.light.cdk),
        }

        this.id = app.treePath
        this.tooltip = app.cdkJsonPath
    }

    public async getChildren(): Promise<(ConstructNode | PlaceholderNode)[]> {
        const constructs = []
        try {
            const successfulApp = await getApp(this.app)

            const constructsInTree = successfulApp.metadata.tree.children
            if (constructsInTree) {
                for (const construct of Object.keys(constructsInTree)) {
                    const entity = constructsInTree[construct]
                    if (includeConstructInTree(entity)) {
                        constructs.push(
                            new ConstructNode(
                                this,
                                entity.id,
                                entity.children
                                    ? vscode.TreeItemCollapsibleState.Collapsed
                                    : vscode.TreeItemCollapsibleState.None,
                                entity
                            )
                        )
                    }
                }
            }

            // indicate that App exists, but it is empty
            if (constructs.length === 0) {
                return [
                    new PlaceholderNode(
                        this,
                        localize('AWS.cdk.explorerNode.app.noStacks', '[No stacks in this CDK App]')
                    ),
                ]
            }

            return constructs
        } catch (error) {
            getLogger().error(`Could not load the construct tree located at '${this.id}': %O`, error as Error)

            return [
                new PlaceholderNode(
                    this,
                    localize(
                        'AWS.cdk.explorerNode.app.noConstructTree',
                        '[Unable to load construct tree for this App. Run `cdk synth`]'
                    )
                ),
            ]
        }
    }
}

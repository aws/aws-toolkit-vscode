/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import { getLogger } from '../../../../shared/logger/logger'
import { ResourceTreeEntity, SamAppLocation, getApp, getStackName } from '../samProject'
import { ResourceNode, generateResourceNodes } from './resourceNode'
import { TreeNode } from '../../../../shared/treeview/resourceTreeDataProvider'
import { createPlaceholderItem } from '../../../../shared/treeview/utils'
import { getIcon } from '../../../../shared/icons'
import { getSamCliContext } from '../../../../shared/sam/cli/samCliContext'
import { SamCliListResourcesParameters } from '../../../../shared/sam/cli/samCliListResources'
import { getDeployedResources, StackResource } from '../../../../lambda/commands/listSamResources'
import * as path from 'path'
import { generateStackNode } from './deployedStack'

export class AppNode implements TreeNode {
    public readonly id = this.location.samTemplateUri.toString()
    public readonly resource = this.location
    public readonly label = path.join(
        this.location.workspaceFolder.name,
        path.relative(this.location.workspaceFolder.uri.fsPath, path.dirname(this.location.samTemplateUri.fsPath))
    )
    private stackName: string = ''
    public constructor(private readonly location: SamAppLocation) {}

    public async getChildren(): Promise<(ResourceNode | TreeNode)[]> {
        const resources = []
        try {
            const successfulApp = await getApp(this.location)
            const templateResources: ResourceTreeEntity[] = successfulApp.resourceTree
            const { stackName, region } = await getStackName(this.location.projectRoot)
            this.stackName = stackName

            const listStackResourcesArguments: SamCliListResourcesParameters = {
                stackName: this.stackName,
                templateFile: this.location.samTemplateUri.fsPath,
                region: region,
                projectRoot: this.location.projectRoot,
            }

            const deployedResources: StackResource[] | undefined = this.stackName
                ? await getDeployedResources({
                      listResourcesParams: listStackResourcesArguments,
                      invoker: getSamCliContext().invoker,
                  })
                : undefined
            // Skip generating stack node if stack does not exist in region or other errors
            if (deployedResources && deployedResources.length > 0) {
                resources.push(...(await generateStackNode(this.stackName, region)))
            }
            resources.push(
                ...generateResourceNodes(this.location, templateResources, this.stackName, region, deployedResources)
            )

            // indicate that App exists, but it is empty
            if (resources.length === 0) {
                return [
                    createPlaceholderItem(
                        localize('AWS.appBuilder.explorerNode.app.noResource', '[No resource found in SAM template]')
                    ),
                ]
            }
            return resources
        } catch (error) {
            getLogger().error(`Could not load the construct tree located at '${this.id}': %O`, error as Error)
            return [
                createPlaceholderItem(
                    localize(
                        'AWS.appBuilder.explorerNode.app.noResourceTree',
                        '[Unable to load resource tree for this app. Ensure SAM template is correct.]'
                    )
                ),
            ]
        }
    }

    public getTreeItem() {
        const item = new vscode.TreeItem(this.label, vscode.TreeItemCollapsibleState.Collapsed)

        item.contextValue = 'awsAppBuilderAppNode'
        item.iconPath = getIcon('vscode-folder')
        item.resourceUri = this.location.samTemplateUri
        item.tooltip = this.location.samTemplateUri.path

        return item
    }
}

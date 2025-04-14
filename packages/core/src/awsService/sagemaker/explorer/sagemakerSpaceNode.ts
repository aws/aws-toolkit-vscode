/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { AppType } from '@aws-sdk/client-sagemaker'
import { SagemakerClient, SagemakerSpaceApp } from '../../../shared/clients/sagemaker'
import { AWSResourceNode } from '../../../shared/treeview/nodes/awsResourceNode'
import { AWSTreeNodeBase } from '../../../shared/treeview/nodes/awsTreeNodeBase'
import { SagemakerParentNode } from './sagemakerParentNode'
import { generateSpaceStatus } from '../utils'
import { getIcon } from '../../../shared/icons'

export class SagemakerSpaceNode extends AWSTreeNodeBase implements AWSResourceNode {
    public constructor(
        public readonly parent: SagemakerParentNode,
        public readonly client: SagemakerClient,
        public override readonly regionCode: string,
        public readonly spaceApp: SagemakerSpaceApp
    ) {
        super('')
        this.updateSpace(spaceApp)
        this.contextValue = 'awsSagemakerSpaceRunningNode'
    }

    public updateSpace(spaceApp: SagemakerSpaceApp) {
        this.label = this.buildLabel()
        this.description = this.buildDescription()
        this.tooltip = new vscode.MarkdownString(this.buildTooltip())
        this.iconPath = this.getAppIcon()
    }

    public get name(): string {
        return this.spaceApp.SpaceName ?? `(no name)`
    }

    public get arn(): string {
        return 'placeholder-arn'
    }

    public async getAppArn() {
        const appDetails = await this.client.describeApp({
            DomainId: this.spaceApp.DomainId,
            AppName: this.spaceApp.App?.AppName,
            AppType: this.spaceApp.SpaceSettingsSummary?.AppType,
            SpaceName: this.spaceApp.SpaceName,
        })

        return appDetails.AppArn
    }

    private buildLabel(): string {
        const status = generateSpaceStatus(this.spaceApp.Status, this.spaceApp.App?.Status)
        return `${this.name} (${status})`
    }

    private buildDescription(): string {
        return `${this.spaceApp.SpaceSharingSettingsSummary?.SharingType ?? 'Unknown'} space`
    }
    private buildTooltip() {
        const spaceName = this.spaceApp?.SpaceName ?? '-'
        const appType = this.spaceApp?.SpaceSettingsSummary?.AppType ?? '-'
        const domainId = this.spaceApp?.DomainId ?? '-'
        const owner = this.spaceApp?.OwnershipSettingsSummary?.OwnerUserProfileName ?? '-'

        return `**Space:** ${spaceName} \n\n**Application:** ${appType} \n\n**Domain ID:** ${domainId} \n\n**User Profile:** ${owner}`
    }

    private getAppIcon() {
        if (this.spaceApp.SpaceSettingsSummary?.AppType === AppType.CodeEditor) {
            return getIcon('aws-sagemaker-code-editor')
        }

        if (this.spaceApp.SpaceSettingsSummary?.AppType === AppType.JupyterLab) {
            return getIcon('aws-sagemaker-jupyter-lab')
        }
    }
}

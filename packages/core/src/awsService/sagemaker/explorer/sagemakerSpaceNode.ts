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
import { getLogger } from '../../../shared/logger/logger'

export class SagemakerSpaceNode extends AWSTreeNodeBase implements AWSResourceNode {
    public constructor(
        public readonly parent: SagemakerParentNode,
        public readonly client: SagemakerClient,
        public override readonly regionCode: string,
        public readonly spaceApp: SagemakerSpaceApp
    ) {
        super('')
        this.updateSpace(spaceApp)
        this.contextValue = this.getContext()
    }

    public updateSpace(spaceApp: SagemakerSpaceApp) {
        this.setSpaceStatus(spaceApp.Status ?? '', spaceApp.App?.Status ?? '')
        this.label = this.buildLabel()
        this.description = this.buildDescription()
        this.tooltip = new vscode.MarkdownString(this.buildTooltip())
        this.iconPath = this.getAppIcon()

        if (this.isPending()) {
            this.parent.trackPendingNode(this.DomainSpaceKey)
        }
    }

    public setSpaceStatus(spaceStatus: string, appStatus: string) {
        this.spaceApp.Status = spaceStatus
        if (this.spaceApp.App) {
            this.spaceApp.App.Status = appStatus
        }
    }

    public isPending(): boolean {
        return this.getStatus() !== 'Running' && this.getStatus() !== 'Stopped'
    }

    public getStatus(): string {
        return generateSpaceStatus(this.spaceApp.Status, this.spaceApp.App?.Status)
    }

    public async getAppStatus() {
        const app = await this.client.describeApp({
            DomainId: this.spaceApp.DomainId,
            AppName: this.spaceApp.App?.AppName,
            AppType: this.spaceApp.SpaceSettingsSummary?.AppType,
            SpaceName: this.spaceApp.SpaceName,
        })

        return app.Status ?? 'Unknown'
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

    public async getSpaceArn() {
        const appDetails = await this.client.describeSpace({
            DomainId: this.spaceApp.DomainId,
            SpaceName: this.spaceApp.SpaceName,
        })

        return appDetails.SpaceArn
    }

    public async updateSpaceAppStatus() {
        const space = await this.client.describeSpace({
            DomainId: this.spaceApp.DomainId,
            SpaceName: this.spaceApp.SpaceName,
        })

        const app = await this.client.describeApp({
            DomainId: this.spaceApp.DomainId,
            AppName: this.spaceApp.App?.AppName,
            AppType: this.spaceApp.SpaceSettingsSummary?.AppType,
            SpaceName: this.spaceApp.SpaceName,
        })

        this.updateSpace({
            ...space,
            App: app,
            DomainSpaceKey: this.spaceApp.DomainSpaceKey,
        })
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

    private getContext() {
        const status = this.getStatus()
        if (status === 'Running' && this.spaceApp.SpaceSettingsSummary?.RemoteAccess === 'ENABLED') {
            return 'awsSagemakerSpaceRunningRemoteEnabledNode'
        } else if (status === 'Running' && this.spaceApp.SpaceSettingsSummary?.RemoteAccess === 'DISABLED') {
            return 'awsSagemakerSpaceRunningRemoteDisabledNode'
        } else if (status === 'Stopped' && this.spaceApp.SpaceSettingsSummary?.RemoteAccess === 'ENABLED') {
            return 'awsSagemakerSpaceStoppedRemoteEnabledNode'
        } else if (
            status === 'Stopped' &&
            (!this.spaceApp.SpaceSettingsSummary?.RemoteAccess ||
                this.spaceApp.SpaceSettingsSummary?.RemoteAccess === 'DISABLED')
        ) {
            return 'awsSagemakerSpaceStoppedRemoteDisabledNode'
        }
        return 'awsSagemakerSpaceNode'
    }

    public get DomainSpaceKey(): string {
        return this.spaceApp.DomainSpaceKey!
    }

    public async refreshNode(): Promise<void> {
        await this.updateSpaceAppStatus()
        await tryRefreshNode(this)
    }
}

export async function tryRefreshNode(node?: SagemakerSpaceNode) {
    if (node) {
        const n = node instanceof SagemakerSpaceNode ? node.parent : node
        try {
            await n.refreshNode()
        } catch (e) {
            getLogger().error('refreshNode failed: %s', (e as Error).message)
        }
    }
}

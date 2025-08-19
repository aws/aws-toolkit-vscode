/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as path from 'path'
import { AppType } from '@aws-sdk/client-sagemaker'
import { SagemakerClient, SagemakerSpaceApp } from '../../shared/clients/sagemaker'
import { getIcon, IconPath } from '../../shared/icons'
import { generateSpaceStatus, updateIdleFile, startMonitoringTerminalActivity, ActivityCheckInterval } from './utils'
import { UserActivity } from '../../shared/extensionUtilities'

export class SagemakerSpace {
    public label: string = ''
    public contextValue: string = ''
    public description?: string
    private spaceApp: SagemakerSpaceApp
    public tooltip?: vscode.MarkdownString
    public iconPath?: IconPath
    public refreshCallback?: () => Promise<void>

    public constructor(
        private readonly client: SagemakerClient,
        public readonly regionCode: string,
        spaceApp: SagemakerSpaceApp,
        private readonly isSMUSSpace: boolean = false
    ) {
        this.spaceApp = spaceApp
        this.updateSpace(spaceApp)
        this.contextValue = this.getContext()
    }

    public updateSpace(spaceApp: SagemakerSpaceApp) {
        this.setSpaceStatus(spaceApp.Status ?? '', spaceApp.App?.Status ?? '')
        this.label = this.buildLabel()
        this.description = this.isSMUSSpace ? undefined : this.buildDescription()
        this.tooltip = new vscode.MarkdownString(this.buildTooltip())
        this.iconPath = this.getAppIcon()
        this.contextValue = this.getContext()
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

    // TODO: Verify this method is still needed to retrieve the app ARN or build based on provided details
    public async getAppArn() {
        const appDetails = await this.client.describeApp({
            DomainId: this.spaceApp.DomainId,
            AppName: this.spaceApp.App?.AppName,
            AppType: this.spaceApp?.SpaceSettingsSummary?.AppType,
            SpaceName: this.spaceApp.SpaceName,
        })

        return appDetails.AppArn
    }

    // TODO: Verify this method is still needed to retrieve the app ARN or build based on provided details
    public async getSpaceArn() {
        const spaceDetails = await this.client.describeSpace({
            DomainId: this.spaceApp.DomainId,
            SpaceName: this.spaceApp.SpaceName,
        })

        return spaceDetails.SpaceArn
    }

    public async updateSpaceAppStatus() {
        const space = await this.client.describeSpace({
            DomainId: this.spaceApp.DomainId,
            SpaceName: this.spaceApp.SpaceName,
        })

        const app = await this.client.describeApp({
            DomainId: this.spaceApp.DomainId,
            AppName: this.spaceApp.App?.AppName,
            AppType: this.spaceApp?.SpaceSettingsSummary?.AppType,
            SpaceName: this.spaceApp.SpaceName,
        })

        this.updateSpace({
            ...space,
            App: app,
            DomainSpaceKey: this.spaceApp.DomainSpaceKey,
        })
    }

    public buildLabel(): string {
        const status = generateSpaceStatus(this.spaceApp.Status, this.spaceApp.App?.Status)
        return `${this.name} (${status})`
    }

    public buildDescription(): string {
        return `${this.spaceApp.SpaceSharingSettingsSummary?.SharingType ?? 'Unknown'} space`
    }

    public buildTooltip() {
        const spaceName = this.spaceApp?.SpaceName ?? '-'
        const appType = this.spaceApp?.SpaceSettingsSummary?.AppType || '-'
        const domainId = this.spaceApp?.DomainId ?? '-'
        const owner = this.spaceApp?.OwnershipSettingsSummary?.OwnerUserProfileName || '-'
        const instanceType = this.spaceApp?.App?.ResourceSpec?.InstanceType ?? '-'
        if (this.isSMUSSpace) {
            return `**Space:** ${spaceName} \n\n**Application:** ${appType} \n\n**Instance Type:** ${instanceType}`
        }
        return `**Space:** ${spaceName} \n\n**Application:** ${appType} \n\n**Domain ID:** ${domainId} \n\n**User Profile:** ${owner}`
    }

    public getAppIcon() {
        const appType = this.spaceApp.SpaceSettingsSummary?.AppType
        if (appType === AppType.JupyterLab) {
            return getIcon('aws-sagemaker-jupyter-lab')
        }
        if (appType === AppType.CodeEditor) {
            return getIcon('aws-sagemaker-code-editor')
        }
    }

    public getContext(): string {
        const status = this.getStatus()
        if (status === 'Running' && this.spaceApp.SpaceSettingsSummary?.RemoteAccess === 'ENABLED') {
            return 'awsSagemakerSpaceRunningRemoteEnabledNode'
        } else if (status === 'Running' && this.spaceApp.SpaceSettingsSummary?.RemoteAccess === 'DISABLED') {
            return 'awsSagemakerSpaceRunningRemoteDisabledNode'
        } else if (status === 'Running' && this.isSMUSSpace) {
            return 'awsSagemakerSpaceRunningNode'
        } else if (status === 'Stopped' && this.spaceApp.SpaceSettingsSummary?.RemoteAccess === 'ENABLED') {
            return 'awsSagemakerSpaceStoppedRemoteEnabledNode'
        } else if (
            (status === 'Stopped' && !this.spaceApp.SpaceSettingsSummary?.RemoteAccess) ||
            this.spaceApp.SpaceSettingsSummary?.RemoteAccess === 'DISABLED'
        ) {
            return 'awsSagemakerSpaceStoppedRemoteDisabledNode'
        }
        return this.isSMUSSpace ? 'smusSpaceNode' : 'awsSagemakerSpaceNode'
    }

    public get DomainSpaceKey(): string {
        return this.spaceApp.DomainSpaceKey!
    }
}

/**
 * Sets up user activity monitoring for SageMaker spaces
 */
export async function setupUserActivityMonitoring(extensionContext: vscode.ExtensionContext): Promise<void> {
    const tmpDirectory = '/tmp/'
    const idleFilePath = path.join(tmpDirectory, '.sagemaker-last-active-timestamp')

    const userActivity = new UserActivity(ActivityCheckInterval)
    userActivity.onUserActivity(() => updateIdleFile(idleFilePath))

    let terminalActivityInterval: NodeJS.Timeout | undefined = startMonitoringTerminalActivity(idleFilePath)

    // Write initial timestamp
    await updateIdleFile(idleFilePath)

    extensionContext.subscriptions.push(userActivity, {
        dispose: () => {
            if (terminalActivityInterval) {
                clearInterval(terminalActivityInterval)
                terminalActivityInterval = undefined
            }
        },
    })
}

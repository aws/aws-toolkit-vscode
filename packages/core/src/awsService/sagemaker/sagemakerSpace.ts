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
import { getLogger } from '../../shared/logger/logger'
import { ToolkitError } from '../../shared/errors'
import { SpaceStatus, RemoteAccess } from './constants'

const logger = getLogger('sagemaker')

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
        // Edge case when this.spaceApp.App is null, returned by ListApp API for a Space that is not connected to for over 24 hours
        if (!this.spaceApp.App) {
            this.spaceApp.App = spaceApp.App
        }
        this.setSpaceStatus(spaceApp.Status ?? '', spaceApp.App?.Status ?? '')
        // Only update RemoteAccess property to minimize impact due to minor structural differences between variables
        if (this.spaceApp.SpaceSettingsSummary && spaceApp.SpaceSettingsSummary?.RemoteAccess) {
            this.spaceApp.SpaceSettingsSummary.RemoteAccess = spaceApp.SpaceSettingsSummary.RemoteAccess
        }
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
        return this.getStatus() !== SpaceStatus.RUNNING && this.getStatus() !== SpaceStatus.STOPPED
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
        // get app using ListApps API, with given DomainId and SpaceName
        const app =
            this.spaceApp.DomainId && this.spaceApp.SpaceName
                ? await this.client.listAppsForDomainMatchSpaceIgnoreCase(
                      this.spaceApp.DomainId,
                      this.spaceApp.SpaceName
                  )
                : undefined
        if (!app) {
            logger.error(
                `updateSpaceAppStatus: unable to get app, [DomainId: ${this.spaceApp.DomainId}], [SpaceName: ${this.spaceApp.SpaceName}]`
            )
            throw new ToolkitError(
                `Cannot update app status without [DomainId: ${this.spaceApp.DomainId} and SpaceName: ${this.spaceApp.SpaceName}]`
            )
        }

        // AWS DescribeSpace API returns full details with property names like 'SpaceSettings'
        // but our internal SagemakerSpaceApp type expects 'SpaceSettingsSummary' (from ListSpaces API)
        // We destructure and rename properties to maintain type compatibility
        const {
            SpaceSettings: spaceSettingsSummary,
            OwnershipSettings: ownershipSettingsSummary,
            SpaceSharingSettings: spaceSharingSettingsSummary,
            ...spaceDetails
        } = space
        this.updateSpace({
            SpaceSettingsSummary: spaceSettingsSummary,
            OwnershipSettingsSummary: ownershipSettingsSummary,
            SpaceSharingSettingsSummary: spaceSharingSettingsSummary,
            ...spaceDetails,
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
        const remoteAccess = this.spaceApp?.SpaceSettingsSummary?.RemoteAccess

        let baseTooltip = ''
        if (this.isSMUSSpace) {
            baseTooltip = `**Space:** ${spaceName} \n\n**Application:** ${appType} \n\n**Instance Type:** ${instanceType}`
            if (remoteAccess === RemoteAccess.ENABLED) {
                baseTooltip += `\n\n**Remote Access:** Enabled`
            } else if (remoteAccess === RemoteAccess.DISABLED) {
                baseTooltip += `\n\n**Remote Access:** Disabled`
            }

            return baseTooltip
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

        if (status === SpaceStatus.RUNNING) {
            return 'awsSagemakerSpaceRunningNode'
        }

        if (status === SpaceStatus.STOPPED) {
            return 'awsSagemakerSpaceStoppedNode'
        }

        // For all other states (STARTING, STOPPING, etc.), return base context
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
    logger.info('setupUserActivityMonitoring: Starting user activity monitoring setup')

    const tmpDirectory = '/tmp/'
    const idleFilePath = path.join(tmpDirectory, '.sagemaker-last-active-timestamp')
    logger.debug(`setupUserActivityMonitoring: Using idle file path: ${idleFilePath}`)

    try {
        const userActivity = new UserActivity(ActivityCheckInterval)
        userActivity.onUserActivity(() => {
            logger.debug('setupUserActivityMonitoring: User activity detected, updating idle file')
            void updateIdleFile(idleFilePath)
        })

        let terminalActivityInterval: NodeJS.Timeout | undefined = startMonitoringTerminalActivity(idleFilePath)
        logger.debug('setupUserActivityMonitoring: Started terminal activity monitoring')
        // Write initial timestamp
        await updateIdleFile(idleFilePath)
        logger.info('setupUserActivityMonitoring: Initial timestamp written successfully')
        extensionContext.subscriptions.push(userActivity, {
            dispose: () => {
                logger.info('setupUserActivityMonitoring: Disposing user activity monitoring')
                if (terminalActivityInterval) {
                    clearInterval(terminalActivityInterval)
                    terminalActivityInterval = undefined
                }
            },
        })

        logger.info('setupUserActivityMonitoring: User activity monitoring setup completed successfully')
    } catch (error) {
        logger.error(`setupUserActivityMonitoring: Error during setup: ${error}`)
        throw error
    }
}

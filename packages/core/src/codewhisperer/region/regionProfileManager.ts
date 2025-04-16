/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getIcon } from '../../shared/icons'
import { DataQuickPickItem } from '../../shared/ui/pickerPrompter'
import { CodeWhispererConfig, RegionProfile } from '../models/model'
import { showConfirmationMessage } from '../../shared/utilities/messages'
import globals from '../../shared/extensionGlobals'
import { once } from '../../shared/utilities/functionUtils'
import CodeWhispererUserClient from '../client/codewhispereruserclient'
import { Credentials, Service } from 'aws-sdk'
import { ServiceOptions } from '../../shared/awsClientBuilder'
import userApiConfig = require('../client/user-service-2.json')
import { createConstantMap } from '../../shared/utilities/tsUtils'
import { getLogger } from '../../shared/logger/logger'
import { pageableToCollection } from '../../shared/utilities/collectionUtils'
import { parse } from '@aws-sdk/util-arn-parser'
import { isAwsError, ToolkitError } from '../../shared/errors'
import { telemetry } from '../../shared/telemetry/telemetry'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { IAuthProvider } from '../util/authUtil'

// TODO: is there a better way to manage all endpoint strings in one place?
export const defaultServiceConfig: CodeWhispererConfig = {
    region: 'us-east-1',
    endpoint: 'https://codewhisperer.us-east-1.amazonaws.com/',
}

// Hack until we have a single discovery endpoint. We will call each endpoint one by one to fetch profile before then.
// TODO: update correct endpoint and region
const endpoints = createConstantMap({
    'us-east-1': 'https://q.us-east-1.amazonaws.com/',
    'eu-central-1': 'https://q.eu-central-1.amazonaws.com/',
})

/**
 * 'user' -> users change the profile through Q menu
 * 'auth' -> users change the profile through webview profile selector page
 * 'update' -> plugin auto select the profile on users' behalf as there is only 1 profile
 * 'reload' -> on plugin restart, plugin will try to reload previous selected profile
 */
export type ProfileSwitchIntent = 'user' | 'auth' | 'update' | 'reload'

export class RegionProfileManager {
    private static logger = getLogger()
    private _activeRegionProfile: RegionProfile | undefined
    private _onDidChangeRegionProfile = new vscode.EventEmitter<RegionProfile | undefined>()
    public readonly onDidChangeRegionProfile = this._onDidChangeRegionProfile.event
    // Store the last API results (for UI propuse) so we don't need to call service again if doesn't require "latest" result
    private _profiles: RegionProfile[] = []

    constructor(private readonly authProvider: IAuthProvider) {}

    get activeRegionProfile() {
        if (this.authProvider.isBuilderIdConnection()) {
            return undefined
        }
        return this._activeRegionProfile
    }

    get clientConfig(): CodeWhispererConfig {
        if (!this.authProvider.isConnected()) {
            throw new ToolkitError('trying to get client configuration without credential')
        }

        // builder id should simply use default IAD
        if (this.authProvider.isBuilderIdConnection()) {
            return defaultServiceConfig
        }

        // idc
        const p = this.activeRegionProfile
        if (p) {
            const region = p.region
            const endpoint = endpoints.get(p.region)
            if (endpoint === undefined) {
                RegionProfileManager.logger.error(
                    `Not found endpoint for region ${region}, not able to initialize a codewhisperer client`
                )
                throw new ToolkitError(`Q client configuration error, endpoint not found for region ${region}`)
            }
            return {
                region: region,
                endpoint: endpoint,
            }
        }

        return defaultServiceConfig
    }

    get profiles(): RegionProfile[] {
        return this._profiles
    }

    async listRegionProfiles(): Promise<RegionProfile[]> {
        this._profiles = []

        if (!this.authProvider.isConnected() || !this.authProvider.isSsoSession()) {
            return []
        }
        const availableProfiles: RegionProfile[] = []
        for (const [region, endpoint] of endpoints.entries()) {
            const client = await this.createQClient(region, endpoint)
            const requester = async (request: CodeWhispererUserClient.ListAvailableProfilesRequest) =>
                client.listAvailableProfiles(request).promise()
            const request: CodeWhispererUserClient.ListAvailableProfilesRequest = {}
            try {
                const profiles = await pageableToCollection(requester, request, 'nextToken', 'profiles')
                    .flatten()
                    .promise()
                const mappedPfs = profiles.map((it) => {
                    let accntId = ''
                    try {
                        accntId = parse(it.arn).accountId
                    } catch (e) {}

                    return {
                        name: it.profileName,
                        region: region,
                        arn: it.arn,
                        description: accntId,
                    }
                })

                availableProfiles.push(...mappedPfs)
            } catch (e) {
                const logMsg = isAwsError(e) ? `requestId=${e.requestId}; message=${e.message}` : (e as Error).message
                RegionProfileManager.logger.error(`failed to listRegionProfiles: ${logMsg}`)
                throw e
            }

            RegionProfileManager.logger.info(`available amazonq profiles: ${availableProfiles.length}`)
        }

        this._profiles = availableProfiles
        return availableProfiles
    }

    async switchRegionProfile(regionProfile: RegionProfile | undefined, source: ProfileSwitchIntent) {
        if (!this.authProvider.isConnected() || !this.authProvider.isIdcConnection()) {
            return
        }

        if (regionProfile && this.activeRegionProfile && regionProfile.arn === this.activeRegionProfile.arn) {
            return
        }

        // only prompt to users when users switch from A profile to B profile
        if (this.activeRegionProfile !== undefined && regionProfile !== undefined) {
            const response = await showConfirmationMessage({
                prompt: localize(
                    'AWS.amazonq.profile.confirmation',
                    "Do you want to change your Q Developer profile to '{0}'?\n When you change profiles, you will no longer have access to your current customizations, chats, code reviews, or any other code or content being generated by Amazon Q",
                    regionProfile?.name
                ),
                confirm: 'Switch profiles',
                cancel: 'Cancel',
                type: 'info',
            })

            if (!response) {
                telemetry.amazonq_didSelectProfile.emit({
                    source: source,
                    amazonQProfileRegion: this.activeRegionProfile?.region ?? 'not-set',
                    ssoRegion: this.authProvider.connection?.region,
                    result: 'Cancelled',
                    credentialStartUrl: this.authProvider.connection?.startUrl,
                    profileCount: this.profiles.length,
                })
                return
            }
        }

        if (source === 'reload' || source === 'update') {
            telemetry.amazonq_profileState.emit({
                source: source,
                amazonQProfileRegion: regionProfile?.region ?? 'not-set',
                result: 'Succeeded',
            })
        } else {
            telemetry.amazonq_didSelectProfile.emit({
                source: source,
                amazonQProfileRegion: regionProfile?.region ?? 'not-set',
                ssoRegion: this.authProvider.connection?.region,
                result: 'Succeeded',
                credentialStartUrl: this.authProvider.connection?.startUrl,
                profileCount: this.profiles.length,
            })
        }

        await this._switchRegionProfile(regionProfile)
    }

    private async _switchRegionProfile(regionProfile: RegionProfile | undefined) {
        this._activeRegionProfile = regionProfile

        this._onDidChangeRegionProfile.fire(regionProfile)
        // dont show if it's a default (fallback)
        if (regionProfile && this.profiles.length > 1) {
            void vscode.window.showInformationMessage(`You are using the ${regionProfile.name} profile for Q.`).then()
        }

        // persist to state
        await this.persistSelectRegionProfile()
    }

    restoreProfileSelection = once(async () => {
        if (this.authProvider.isConnected()) {
            await this.restoreRegionProfile()
        }
    })

    // Note: should be called after [this.authProvider.isConnected()] returns non null
    async restoreRegionProfile() {
        const previousSelected = this.loadPersistedRegionProfle()[this.authProvider.profileName] || undefined
        if (!previousSelected) {
            return
        }
        // cross-validation
        this.listRegionProfiles()
            .then(async (profiles) => {
                const r = profiles.find((it) => it.arn === previousSelected.arn)
                if (!r) {
                    telemetry.amazonq_profileState.emit({
                        source: 'reload',
                        amazonQProfileRegion: 'not-set',
                        reason: 'profile could not be selected',
                        result: 'Failed',
                    })

                    await this.invalidateProfile(previousSelected.arn)
                    RegionProfileManager.logger.warn(
                        `invlaidating ${previousSelected.name} profile, arn=${previousSelected.arn}`
                    )
                }
            })
            .catch((e) => {
                telemetry.amazonq_profileState.emit({
                    source: 'reload',
                    amazonQProfileRegion: 'not-set',
                    reason: (e as Error).message,
                    result: 'Failed',
                })
            })

        await this.switchRegionProfile(previousSelected, 'reload')
    }

    private loadPersistedRegionProfle(): { [label: string]: RegionProfile } {
        const previousPersistedState = globals.globalState.tryGet<{ [label: string]: RegionProfile }>(
            'aws.amazonq.regionProfiles',
            Object,
            {}
        )

        return previousPersistedState
    }

    async persistSelectRegionProfile() {
        // default has empty arn and shouldn't be persisted because it's just a fallback
        if (!this.authProvider.isConnected() || this.activeRegionProfile === undefined) {
            return
        }

        // persist connectionId to profileArn
        const previousPersistedState = globals.globalState.tryGet<{ [label: string]: RegionProfile }>(
            'aws.amazonq.regionProfiles',
            Object,
            {}
        )

        previousPersistedState[this.authProvider.profileName] = this.activeRegionProfile
        await globals.globalState.update('aws.amazonq.regionProfiles', previousPersistedState)
    }

    async generateQuickPickItem(): Promise<DataQuickPickItem<string>[]> {
        const selected = this.activeRegionProfile
        let profiles: RegionProfile[] = []
        try {
            profiles = await this.listRegionProfiles()
        } catch (e) {
            return [
                {
                    label: '[Failed to list available profiles]',
                    detail: `${(e as Error).message}`,
                    data: '',
                },
            ]
        }
        const icon = getIcon('vscode-account')
        const quickPickItems: DataQuickPickItem<string>[] = profiles.map((it) => {
            const label = it.name
            const onClick = async () => {
                await this.switchRegionProfile(it, 'user')
            }
            const data = it.arn
            const description = it.region
            const isRecentlyUsed = selected ? selected.arn === it.arn : false

            return {
                label: `${icon} ${label}`,
                onClick: onClick,
                data: data,
                description: description,
                recentlyUsed: isRecentlyUsed,
                detail: it.description,
            }
        })

        return quickPickItems
    }

    async invalidateProfile(arn: string | undefined) {
        if (arn) {
            if (this.activeRegionProfile && this.activeRegionProfile.arn === arn) {
                this._activeRegionProfile = undefined
            }

            const profiles = this.loadPersistedRegionProfle()
            const updatedProfiles = Object.fromEntries(
                Object.entries(profiles).filter(([connId, profile]) => profile.arn !== arn)
            )
            await globals.globalState.update('aws.amazonq.regionProfiles', updatedProfiles)
        }
    }

    requireProfileSelection(): boolean {
        if (this.authProvider.isBuilderIdConnection()) {
            return false
        }
        return this.authProvider.isIdcConnection() && this.activeRegionProfile === undefined
    }

    async createQClient(region: string, endpoint: string): Promise<CodeWhispererUserClient> {
        const token = await this.authProvider.getToken()
        const serviceOption: ServiceOptions = {
            apiConfig: userApiConfig,
            region: region,
            endpoint: endpoint,
            credentials: new Credentials({ accessKeyId: 'xxx', secretAccessKey: 'xxx' }),
            onRequestSetup: [
                (req) => {
                    req.on('build', ({ httpRequest }) => {
                        httpRequest.headers['Authorization'] = `Bearer ${token}`
                    })
                },
            ],
        } as ServiceOptions

        const c = (await globals.sdkClientBuilder.createAwsService(
            Service,
            serviceOption,
            undefined
        )) as CodeWhispererUserClient

        return c
    }
}

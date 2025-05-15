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
import { Commands } from '../../shared/vscode/commands2'
import { CachedResource } from '../../shared/utilities/resourceCache'
import { fs } from '../../shared/fs/fs'
import path from 'path'
import { globalKey } from '../../shared/globalState'

// TODO: is there a better way to manage all endpoint strings in one place?
export const defaultServiceConfig: CodeWhispererConfig = {
    region: 'us-east-1',
    endpoint: 'https://codewhisperer.us-east-1.amazonaws.com/',
}

// Hack until we have a single discovery endpoint. We will call each endpoint one by one to fetch profile before then.
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
export type ProfileSwitchIntent = 'user' | 'auth' | 'update' | 'reload' | 'customization'

export type ProfileChangedEvent = {
    profile: RegionProfile | undefined
    intent: ProfileSwitchIntent
}

export class RegionProfileManager {
    private static logger = getLogger()
    private _activeRegionProfile: RegionProfile | undefined
    private _onDidChangeRegionProfile = new vscode.EventEmitter<ProfileChangedEvent>()
    public readonly onDidChangeRegionProfile = this._onDidChangeRegionProfile.event
    // Store the last API results (for UI propuse) so we don't need to call service again if doesn't require "latest" result
    private _profiles: RegionProfile[] = []
    //private sharedState: SharedState

    private readonly cache = new (class extends CachedResource<RegionProfile[]> {
        constructor(private readonly profileProvider: () => Promise<RegionProfile[]>) {
            super(
                'aws.amazonq.regionProfiles.cache',
                60000,
                {
                    resource: {
                        locked: false,
                        timestamp: 0,
                        result: undefined,
                    },
                },
                { timeout: 15000, interval: 1500, truthy: true }
            )
        }

        override resourceProvider(): Promise<RegionProfile[]> {
            return this.profileProvider()
        }
    })(this.listRegionProfile.bind(this))

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

    constructor(private readonly authProvider: IAuthProvider) {
        const getProfileFunction = () =>
            globals.globalState.tryGet<{ [label: string]: RegionProfile }>('aws.amazonq.regionProfiles', Object, {})

        const profileChangedHandler = async () => {
            const profile = await this.loadPersistedRegionProfle()
            void this._switchRegionProfile(profile[this.authProvider.profileName], 'reload')
        }

        GlobalStatePoller.create(getProfileFunction, profileChangedHandler)

        //     , async () => {
        //     void this._switchRegionProfile((await this.loadPersistedRegionProfle())[this.authProvider.profileName], 'user')
        // })
        //this.sharedState = new SharedState('aws.amazonq.regionProfiles')
    }

    async getProfiles(): Promise<RegionProfile[]> {
        return this.cache.getResource()
    }

    async listRegionProfile(): Promise<RegionProfile[]> {
        this._profiles = []

        if (!this.authProvider.isConnected() || !this.authProvider.isSsoSession()) {
            return []
        }
        const availableProfiles: RegionProfile[] = []
        const failedRegions: string[] = []

        for (const [region, endpoint] of endpoints.entries()) {
            const client = await this._createQClient(region, endpoint)
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
                RegionProfileManager.logger.debug(`Found ${mappedPfs.length} profiles in region ${region}`)
            } catch (e) {
                const logMsg = isAwsError(e) ? `requestId=${e.requestId}; message=${e.message}` : (e as Error).message
                RegionProfileManager.logger.error(`Failed to list profiles for region ${region}: ${logMsg}`)
                failedRegions.push(region)
            }
        }

        // Only throw error if all regions fail
        if (failedRegions.length === endpoints.size) {
            throw new Error(`Failed to list profiles for all regions: ${failedRegions.join(', ')}`)
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
        if (source !== 'customization' && this.activeRegionProfile !== undefined && regionProfile !== undefined) {
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

        await this._switchRegionProfile(regionProfile, source)
    }

    private async _switchRegionProfile(regionProfile: RegionProfile | undefined, source: ProfileSwitchIntent) {
        if (this._activeRegionProfile?.arn === regionProfile?.arn) {
            return
        }

        this._activeRegionProfile = regionProfile

        this._onDidChangeRegionProfile.fire({
            profile: regionProfile,
            intent: source,
        })
        // dont show if it's a default (fallback)
        if (regionProfile && this.profiles.length > 1) {
            void vscode.window.showInformationMessage(`You are using the ${regionProfile.name} profile for Q.`).then()
        }

        // persist to state
        await this.persistSelectRegionProfile()

        //this.sharedState.updateSharedState(this._activeRegionProfile)

        // Force status bar to reflect this change in state
        await Commands.tryExecute('aws.amazonq.refreshStatusBar')
    }

    restoreProfileSelection = once(async () => {
        if (this.authProvider.isConnected()) {
            await this.restoreRegionProfile()
        }
    })

    // Note: should be called after [this.authProvider.isConnected()] returns non null
    async restoreRegionProfile() {
        const previousSelected = (await this.loadPersistedRegionProfle())[this.authProvider.profileName] || undefined
        if (!previousSelected) {
            return
        }
        // cross-validation
        this.getProfiles()
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

    private async loadPersistedRegionProfle(): Promise<{ [label: string]: RegionProfile }> {
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

        const persistedState = globals.globalState.tryGet<{ [label: string]: RegionProfile }>(
            'aws.amazonq.regionProfiles',
            Object,
            {}
        )
        console.log(persistedState)
    }

    async generateQuickPickItem(): Promise<DataQuickPickItem<string>[]> {
        const selected = this.activeRegionProfile
        let profiles: RegionProfile[] = []
        try {
            profiles = await this.getProfiles()
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
                //this.sharedState.updateSharedState(this._activeRegionProfile)
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

    async clearCache() {
        await this.cache.clearCache()
    }

    // TODO: Should maintain sdk client in a better way
    async createQClient(profile: RegionProfile): Promise<CodeWhispererUserClient> {
        if (!this.authProvider.isConnected() || !this.authProvider.isSsoSession()) {
            throw new Error('No valid SSO connection')
        }
        const endpoint = endpoints.get(profile.region)
        if (!endpoint) {
            throw new Error(`trying to initiatize Q client with unrecognizable region ${profile.region}`)
        }
        return this._createQClient(profile.region, endpoint)
    }

    // Visible for testing only, do not use this directly, please use createQClient(profile)
    async _createQClient(region: string, endpoint: string): Promise<CodeWhispererUserClient> {
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

export class GlobalStatePoller {
    protected oldValue: any
    protected getState: Function
    protected changeHandler: Function

    constructor(getState: Function, changeHandler: Function) {
        this.getState = getState
        this.changeHandler = changeHandler
        this.oldValue = getState()
    }

    static create(getState: Function, changeHandler: () => void) {
        const instance = new GlobalStatePoller(getState, changeHandler)
        instance.poll()
        return instance
    }

    poll() {
        const interval = 1000 // ms
        setInterval(() => {
            const newValue = this.getState()
            if (this.oldValue !== newValue) {
                this.oldValue = newValue
                this.changeHandler()
            }
        }, interval)
    }
}

export class SharedState {
    readonly key: globalKey
    protected value: any
    readonly filePath: string

    constructor(key: globalKey) {
        this.key = key
        this.filePath = path.join(globals.context.globalStorageUri.fsPath, `${key}.json`)
    }

    static async create(key: globalKey, changeHandler: () => void) {
        const instance = new SharedState(key)
        await instance.createGlobalStateFile()
        const fileWatcher = instance.getSharedStateFileWatcher()
        fileWatcher.onDidChange(changeHandler)
    }

    protected async createGlobalStateFile() {
        if (!(await fs.existsFile(this.filePath))) {
            await this.updateFile()
        }
    }

    protected async updateFile() {
        await fs.writeFile(this.filePath, `${new Date().toISOString()}`, { encoding: 'utf8' })
    }

    protected getSharedStateFileWatcher() {
        const watcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(globals.context.globalStorageUri, `${this.key}.json`)
        )
        globals.context.subscriptions.push(watcher)
        return watcher
    }

    async updateSharedState(value: any) {
        const persistedState = globals.globalState.tryGet<{ [label: string]: RegionProfile }>(
            'aws.amazonq.regionProfiles',
            Object,
            {}
        )
        console.log(persistedState)
        if (value === this.value && value !== undefined) {
            return
        }
        this.value = value
        await this.updateFile()
    }
}

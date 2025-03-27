/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getIcon } from '../../shared/icons'
import { DataQuickPickItem } from '../../shared/ui/pickerPrompter'
import { CodeWhispererConfig, RegionProfile } from '../models/model'
import { showConfirmationMessage } from '../../shared/utilities/messages'
import {
    Connection,
    isBuilderIdConnection,
    isIdcSsoConnection,
    isSsoConnection,
    SsoConnection,
} from '../../auth/connection'
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
import { localize } from '../../shared/utilities/vsCodeUtils'

const defaultProfile: RegionProfile = {
    name: 'default',
    region: 'us-east-1',
    arn: '',
    description: 'defaultProfile when listAvailableProfiles fails',
}

// TODO: is there a better way to manage all endpoint strings in one place?
export const defaultServiceConfig: CodeWhispererConfig = {
    region: 'us-east-1',
    endpoint: 'https://codewhisperer.us-east-1.amazonaws.com/',
}

// Hack until we have a single discovery endpoint. We will call each endpoint one by one to fetch profile before then.
// TODO: update correct endpoint and region
const endpoints = createConstantMap({
    'us-east-1': 'https://codewhisperer.us-east-1.amazonaws.com/',
    'eu-central-1': 'https://rts.prod-eu-central-1.codewhisperer.ai.aws.dev/',
})

export class RegionProfileManager {
    private static logger = getLogger()
    private _activeRegionProfile: RegionProfile | undefined
    private _onDidChangeRegionProfile = new vscode.EventEmitter<RegionProfile | undefined>()
    public readonly onDidChangeRegionProfile = this._onDidChangeRegionProfile.event

    // Store the last API results (for UI propuse) so we don't need to call service again if doesn't require "latest" result
    private _profiles: RegionProfile[] = []

    get activeRegionProfile() {
        const conn = this.connectionProvider()
        if (isBuilderIdConnection(conn)) {
            return undefined
        }
        return this._activeRegionProfile
    }

    get clientConfig(): CodeWhispererConfig {
        const conn = this.connectionProvider()
        if (!conn) {
            throw new ToolkitError('trying to get client configuration without credential')
        }

        // builder id should simply use default IAD
        if (isBuilderIdConnection(conn)) {
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

    constructor(private readonly connectionProvider: () => Connection | undefined) {}

    async listRegionProfile(): Promise<RegionProfile[]> {
        const conn = this.connectionProvider()
        if (conn === undefined || !isSsoConnection(conn)) {
            return []
        }
        const availableProfiles: RegionProfile[] = []
        for (const [region, endpoint] of endpoints.entries()) {
            const client = await this.createQClient(region, endpoint, conn as SsoConnection)
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
                RegionProfileManager.logger.error(`failed to listRegionProfile: ${logMsg}`)
                throw e
            }

            RegionProfileManager.logger.info(`available amazonq profiles: ${availableProfiles.length}`)
        }

        this._profiles = availableProfiles
        return availableProfiles
    }

    async switchRegionProfile(regionProfile: RegionProfile | undefined) {
        const conn = this.connectionProvider()
        if (conn === undefined || !isIdcSsoConnection(conn)) {
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
                return
            }
        }

        await this._switchRegionProfile(regionProfile)
    }

    private async _switchRegionProfile(regionProfile: RegionProfile | undefined) {
        this._activeRegionProfile = regionProfile

        this._onDidChangeRegionProfile.fire(regionProfile)
        // dont show if it's a default (fallback)
        if (regionProfile && !this.isDefault(regionProfile) && this.profiles.length > 1) {
            void vscode.window.showInformationMessage(`You are using the ${regionProfile.name} profile for Q.`).then()
        }

        // persist to state
        await this.persistSelectRegionProfile()
    }

    restoreProfileSelection = once(async () => {
        const conn = this.connectionProvider()
        if (conn) {
            await this.restoreRegionProfile(conn)
        }
    })

    // Note: should be called after [AuthUtil.instance.conn] returns non null
    async restoreRegionProfile(conn: Connection) {
        const previousSelected = this.loadPersistedRegionProfle()[conn.id] || undefined
        if (!previousSelected) {
            return
        }
        // cross-validation
        const profiles = this.listRegionProfile()
        const r = (await profiles).find((it) => it.arn === previousSelected)

        await this.switchRegionProfile(r)
    }

    private loadPersistedRegionProfle(): { [label: string]: string } {
        const previousPersistedState = globals.globalState.tryGet<{ [label: string]: string }>(
            'aws.amazonq.regionProfiles',
            Object,
            {}
        )

        return previousPersistedState
    }

    async persistSelectRegionProfile() {
        const conn = this.connectionProvider()

        // default has empty arn and shouldn't be persisted because it's just a fallback
        if (!conn || this.activeRegionProfile === undefined || this.isDefault(this.activeRegionProfile)) {
            return
        }

        // persist connectionId to profileArn
        const previousPersistedState = globals.globalState.tryGet<{ [label: string]: string }>(
            'aws.amazonq.regionProfiles',
            Object,
            {}
        )

        previousPersistedState[conn.id] = this.activeRegionProfile.arn
        await globals.globalState.update('aws.amazonq.regionProfiles', previousPersistedState)
    }

    isDefault(profile: RegionProfile): boolean {
        return (
            profile.arn === defaultProfile.arn &&
            profile.name === defaultProfile.name &&
            profile.region === defaultProfile.region
        )
    }

    async generateQuickPickItem(): Promise<DataQuickPickItem<string>[]> {
        const selected = this.activeRegionProfile
        let profiles: RegionProfile[] = []
        try {
            profiles = await this.listRegionProfile()
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
                await this.switchRegionProfile(it)
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
                Object.entries(profiles).filter(([connId, profileArn]) => profileArn !== arn)
            )
            await globals.globalState.update('aws.amazonq.regionProfiles', updatedProfiles)
        }
    }

    async createQClient(region: string, endpoint: string, conn: SsoConnection): Promise<CodeWhispererUserClient> {
        const token = (await conn.getToken()).accessToken
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

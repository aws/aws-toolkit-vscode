/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { GetCallerIdentityResponse } from 'aws-sdk/clients/sts'
import { DescribeDomainResponse, SharingType } from '@amzn/sagemaker-client'
import { SagemakerClient, SagemakerSpaceApp } from '../../../shared/clients/sagemaker'
import { DefaultStsClient } from '../../../shared/clients/stsClient'
import globals from '../../../shared/extensionGlobals'
import { AWSTreeNodeBase } from '../../../shared/treeview/nodes/awsTreeNodeBase'
import { PlaceholderNode } from '../../../shared/treeview/nodes/placeholderNode'
import { makeChildrenNodes } from '../../../shared/treeview/utils'
import { updateInPlace } from '../../../shared/utilities/collectionUtils'
import { isRemoteWorkspace } from '../../../shared/vscode/env'
import { SagemakerConstants } from './constants'
import { SagemakerSpaceNode } from './sagemakerSpaceNode'
import { getDomainUserProfileKey, getSpaceAppsForUserProfile } from '../utils'
import { PollingSet } from '../../../shared/utilities/pollingSet'
import { getRemoteAppMetadata } from '../remoteUtils'

export type SelectedDomainUsers = [string, string[]][]
export type SelectedDomainUsersByRegion = [string, SelectedDomainUsers][]

export interface UserProfileMetadata {
    domain: DescribeDomainResponse
}

export const studioContextValue = 'awsSagemakerStudioNode'

export class SagemakerStudioNode extends AWSTreeNodeBase {
    protected sagemakerSpaceNodes: Map<string, SagemakerSpaceNode>
    protected stsClient: DefaultStsClient
    public override readonly contextValue: string = studioContextValue
    domainUserProfiles: Map<string, UserProfileMetadata> = new Map()
    spaceApps: Map<string, SagemakerSpaceApp> = new Map()
    callerIdentity: GetCallerIdentityResponse = {}
    /** Whether the IdC caller's Studio user profile was successfully resolved on the last refresh. */
    private idcProfileResolved: boolean = false
    /**
     * Number of space apps returned by the API before filtering. `updateChildren` prunes
     * `this.spaceApps` in place, so its post-filter size cannot distinguish "domain has no spaces"
     * from "all spaces were filtered out".
     */
    private spaceAppCountBeforeFilter: number = 0
    /**
     * Owned domain-user-profile keys for an IdC caller, resolved once per tree refresh.
     * Resolution costs a DescribeUserProfile per distinct space owner, so it must not re-run for
     * every consumer (the tree build and the filter picker both need it). Invalidated at the start
     * of {@link updateChildren}.
     */
    private idcOwnedKeysCache: string[] | undefined
    public readonly pollingSet: PollingSet<string> = new PollingSet(5000, this.updatePendingNodes.bind(this))

    public constructor(
        public override readonly regionCode: string,
        protected readonly sagemakerClient: SagemakerClient
    ) {
        super('Studio', vscode.TreeItemCollapsibleState.Collapsed)
        this.sagemakerSpaceNodes = new Map<string, SagemakerSpaceNode>()
        this.stsClient = new DefaultStsClient(regionCode)
    }

    public override async getChildren(): Promise<AWSTreeNodeBase[]> {
        const result = await makeChildrenNodes({
            getChildNodes: async () => {
                await this.updateChildren()
                return [...this.sagemakerSpaceNodes.values()]
            },
            getNoChildrenPlaceholderNode: async () => new PlaceholderNode(this, this.getPlaceholderMessage()),
            sort: (nodeA, nodeB) => nodeA.name.localeCompare(nodeB.name),
        })

        return result
    }

    /**
     * Distinguishes "the domain has no spaces" from "this IdC user owns none of them" from "we
     * could not resolve this IdC user's Studio user profile". All three render an empty tree, but
     * they need very different follow-up actions, so they must not share one message.
     */
    private getPlaceholderMessage(): string {
        if (!this.isIdcCaller() || this.spaceAppCountBeforeFilter === 0) {
            return SagemakerConstants.PlaceHolderMessage
        }
        return this.idcProfileResolved
            ? SagemakerConstants.IdcNoOwnedSpacesMessage
            : SagemakerConstants.IdcUnresolvedProfileMessage
    }

    public trackPendingNode(domainSpaceKey: string) {
        this.pollingSet.add(domainSpaceKey)
    }

    private async updatePendingNodes() {
        for (const spaceKey of this.pollingSet.values()) {
            const childNode = this.getSpaceNodes(spaceKey)
            await this.updatePendingSpaceNode(childNode)
        }
    }

    private async updatePendingSpaceNode(node: SagemakerSpaceNode) {
        await node.updateSpaceAppStatus()
        if (!node.isPending()) {
            this.pollingSet.delete(node.DomainSpaceKey)
            await node.refreshNode()
        }
    }

    public getSpaceNodes(spaceKey: string): SagemakerSpaceNode {
        const childNode = this.sagemakerSpaceNodes.get(spaceKey)
        if (childNode) {
            return childNode
        } else {
            throw new Error(`Node with id ${spaceKey} from polling set not found`)
        }
    }

    /**
     * True when the signed-in connection is an IAM Identity Center (SSO) identity.
     *
     * IdC connections are scoped to the caller's own Studio user profile: the Jorus remote-connect
     * flow authorizes on the browser's IdC session, so surfacing spaces owned by other user
     * profiles invites connect attempts the user has no legitimate claim to. IAM connections keep
     * their historical behavior, gated by EnableIdentityFilteringSetting.
     */
    public isIdcCaller(): boolean {
        return !!this.callerIdentity.Arn?.match(SagemakerConstants.IdentityCenterArnRegex)
    }

    /**
     * The IdC user name captured from the caller's assumed-role session ARN
     * (`.../AWSReservedSSO_<permission-set>_<id>/<idc-user-name>`), or undefined for non-IdC callers.
     */
    private getIdcUserName(): string | undefined {
        const match = this.callerIdentity.Arn?.match(SagemakerConstants.IdentityCenterArnRegex)
        return match && match.length >= 2 ? match[1] : undefined
    }

    /**
     * Resolves the domain-user-profile keys this IdC caller owns, using the authoritative
     * SingleSignOnUserValue binding on each user profile rather than guessing a user profile name
     * from the caller ARN.
     *
     * Fails CLOSED: if the caller's user profile cannot be resolved in a domain, that domain's
     * spaces are excluded. Returning an empty list here hides everything, which is the intended
     * outcome -- an unresolvable identity must not fall back to showing the whole domain.
     */
    private async getIdcOwnedDomainUsers(): Promise<string[]> {
        if (this.idcOwnedKeysCache) {
            return this.idcOwnedKeysCache
        }

        const ssoUserName = this.getIdcUserName()
        if (!ssoUserName) {
            this.idcOwnedKeysCache = []
            return this.idcOwnedKeysCache
        }

        const userProfilesByDomain = new Map<string, Set<string>>()
        for (const app of this.spaceApps.values()) {
            const domainId = app.DomainId
            const userProfileName = app.OwnershipSettingsSummary?.OwnerUserProfileName
            if (!domainId || !userProfileName || app.SpaceSharingSettingsSummary?.SharingType === SharingType.Shared) {
                continue
            }

            const profileNames = userProfilesByDomain.get(domainId) ?? new Set<string>()
            profileNames.add(userProfileName)
            userProfilesByDomain.set(domainId, profileNames)
        }
        if (userProfilesByDomain.size === 0) {
            this.idcOwnedKeysCache = []
            return this.idcOwnedKeysCache
        }

        const ownedByDomain = await this.sagemakerClient.resolveUserProfilesForSsoUser(
            userProfilesByDomain,
            ssoUserName
        )

        const keys: string[] = []
        for (const [domainId, profileNames] of ownedByDomain) {
            for (const profileName of profileNames) {
                keys.push(getDomainUserProfileKey(domainId, profileName))
            }
        }
        this.idcProfileResolved = keys.length > 0
        this.idcOwnedKeysCache = keys
        return keys
    }

    public async getLocalSelectedDomainUsers(): Promise<string[]> {
        // IdC callers are always scoped to the user profiles actually bound to their IdC identity.
        if (this.isIdcCaller()) {
            return this.getIdcOwnedDomainUsers()
        }

        const iamMatches =
            this.callerIdentity.Arn?.match(SagemakerConstants.IamUserArnRegex) ||
            this.callerIdentity.Arn?.match(SagemakerConstants.IamSessionArnRegex)

        const matches =
            iamMatches && vscode.workspace.getConfiguration().get(SagemakerConstants.EnableIdentityFilteringSetting)
                ? iamMatches
                : undefined

        const userProfilePrefix =
            matches && matches.length >= 2
                ? `${matches[1].replaceAll(SagemakerConstants.SpecialCharacterRegex, '-')}-`
                : ''

        return getSpaceAppsForUserProfile([...this.spaceApps.values()], userProfilePrefix)
    }

    public async getRemoteSelectedDomainUsers(): Promise<string[]> {
        const remoteAppMetadata = await getRemoteAppMetadata()
        return getSpaceAppsForUserProfile(
            [...this.spaceApps.values()],
            remoteAppMetadata.UserProfileName,
            remoteAppMetadata.DomainId
        )
    }

    public async getDefaultSelectedDomainUsers(): Promise<string[]> {
        if (isRemoteWorkspace()) {
            return this.getRemoteSelectedDomainUsers()
        } else {
            return this.getLocalSelectedDomainUsers()
        }
    }

    public async getSelectedDomainUsers(): Promise<Set<string>> {
        const selectedDomainUsersByRegionMap = new Map(
            globals.globalState.get<SelectedDomainUsersByRegion>(SagemakerConstants.SelectedDomainUsersState, [])
        )

        const selectedDomainUsersMap = new Map(selectedDomainUsersByRegionMap.get(this.regionCode))
        const defaultSelectedDomainUsers = await this.getDefaultSelectedDomainUsers()
        const cachedDomainUsers = selectedDomainUsersMap.get(this.callerIdentity.Arn || '')

        if (cachedDomainUsers && cachedDomainUsers.length > 0) {
            // For IdC callers the manual filter may only narrow, never widen: intersect any saved
            // selection with what the IdC identity actually owns. Without this, a selection saved
            // before this scoping existed (or made via the filter picker) would resurrect spaces
            // belonging to other user profiles.
            if (this.isIdcCaller()) {
                const allowed = new Set(defaultSelectedDomainUsers)
                return new Set(cachedDomainUsers.filter((key) => allowed.has(key)))
            }
            return new Set(cachedDomainUsers)
        } else {
            return new Set(defaultSelectedDomainUsers)
        }
    }

    public saveSelectedDomainUsers(selectedDomainUsers: string[]) {
        const selectedDomainUsersByRegionMap = new Map(
            globals.globalState.get<SelectedDomainUsersByRegion>(SagemakerConstants.SelectedDomainUsersState, [])
        )

        const selectedDomainUsersMap = new Map(selectedDomainUsersByRegionMap.get(this.regionCode))

        if (this.callerIdentity.Arn) {
            selectedDomainUsersMap?.set(this.callerIdentity.Arn, selectedDomainUsers)
            selectedDomainUsersByRegionMap?.set(this.regionCode, [...selectedDomainUsersMap])

            globals.globalState.tryUpdate(SagemakerConstants.SelectedDomainUsersState, [
                ...selectedDomainUsersByRegionMap,
            ])
        }
    }

    public async updateChildren(): Promise<void> {
        const [spaceApps, domains] = await this.sagemakerClient.fetchSpaceAppsAndDomains()
        this.spaceApps = spaceApps
        this.spaceAppCountBeforeFilter = spaceApps.size
        this.idcProfileResolved = false
        this.idcOwnedKeysCache = undefined

        this.callerIdentity = await this.stsClient.getCallerIdentity()
        const selectedDomainUsers = await this.getSelectedDomainUsers()
        const isIdcCaller = this.isIdcCaller()
        this.domainUserProfiles.clear()

        for (const [domainSpaceKey, app] of spaceApps) {
            const domainId = app.DomainId
            const userProfile = app.OwnershipSettingsSummary?.OwnerUserProfileName
            if (!domainId) {
                if (isIdcCaller) {
                    spaceApps.delete(domainSpaceKey)
                }
                continue
            }

            if (isIdcCaller && app.SpaceSharingSettingsSummary?.SharingType === SharingType.Shared) {
                continue
            }

            if (!userProfile) {
                if (isIdcCaller) {
                    spaceApps.delete(domainSpaceKey)
                }
                continue
            }

            const domainUserProfileKey = getDomainUserProfileKey(domainId, userProfile)

            this.domainUserProfiles.set(domainUserProfileKey, {
                domain: domains.get(domainId) as DescribeDomainResponse,
            })

            if (!selectedDomainUsers.has(domainUserProfileKey) && app.SpaceName) {
                spaceApps.delete(domainSpaceKey)
                continue
            }
        }

        updateInPlace(
            this.sagemakerSpaceNodes,
            spaceApps.keys(),
            (key) => this.sagemakerSpaceNodes.get(key)!.updateSpace(spaceApps.get(key)!),
            (key) => new SagemakerSpaceNode(this as any, this.sagemakerClient, this.regionCode, spaceApps.get(key)!)
        )
    }

    public async clearChildren() {
        this.sagemakerSpaceNodes = new Map<string, SagemakerSpaceNode>()
    }

    public async refreshNode(): Promise<void> {
        await this.clearChildren()
        await vscode.commands.executeCommand('aws.refreshAwsExplorerNode', this)
    }
}

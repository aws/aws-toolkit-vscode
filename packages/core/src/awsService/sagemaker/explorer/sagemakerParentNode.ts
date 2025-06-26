/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { GetCallerIdentityResponse } from 'aws-sdk/clients/sts'
import { DescribeDomainResponse } from '@amzn/sagemaker-client'
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
import { getDomainSpaceKey, getDomainUserProfileKey, getRemoteAppMetadata, getSpaceAppsForUserProfile } from '../utils'

export const parentContextValue = 'awsSagemakerParentNode'

export type SelectedDomainUsers = [string, string[]][]

export interface UserProfileMetadata {
    domain: DescribeDomainResponse
}
export class SagemakerParentNode extends AWSTreeNodeBase {
    protected sagemakerSpaceNodes: Map<string, SagemakerSpaceNode>
    protected stsClient: DefaultStsClient
    public override readonly contextValue: string = parentContextValue
    domainUserProfiles: Map<string, UserProfileMetadata> = new Map()
    spaceApps: Map<string, SagemakerSpaceApp> = new Map()
    callerIdentity: GetCallerIdentityResponse = {}

    public constructor(
        public override readonly regionCode: string,
        protected readonly sagemakerClient: SagemakerClient
    ) {
        super('SageMaker', vscode.TreeItemCollapsibleState.Collapsed)
        this.sagemakerSpaceNodes = new Map<string, SagemakerSpaceNode>()
        this.stsClient = new DefaultStsClient(regionCode)
    }

    public override async getChildren(): Promise<AWSTreeNodeBase[]> {
        const result = await makeChildrenNodes({
            getChildNodes: async () => {
                await this.updateChildren()
                return [...this.sagemakerSpaceNodes.values()]
            },
            getNoChildrenPlaceholderNode: async () => new PlaceholderNode(this, SagemakerConstants.PlaceHolderMessage),
            sort: (nodeA, nodeB) => nodeA.name.localeCompare(nodeB.name),
        })

        return result
    }

    public async getLocalSelectedDomainUsers(): Promise<string[]> {
        /**
         * By default, filter userProfileNames that match the detected IAM user, IAM assumed role
         * session name, or Identity Center username
         * */
        const iamMatches =
            this.callerIdentity.Arn?.match(SagemakerConstants.IamUserArnRegex) ||
            this.callerIdentity.Arn?.match(SagemakerConstants.IamSessionArnRegex)
        const idcMatches = this.callerIdentity.Arn?.match(SagemakerConstants.IdentityCenterArnRegex)

        const matches =
            /**
             *  Only filter IAM users / assumed-role sessions if the user has enabled this option
             *  Or filter Identity Center username if user is authenticated via IdC
             * */
            iamMatches && vscode.workspace.getConfiguration().get(SagemakerConstants.EnableIdentityFilteringSetting)
                ? iamMatches
                : idcMatches
                  ? idcMatches
                  : undefined

        const userProfilePrefix =
            matches && matches.length >= 2
                ? `${matches[1].replaceAll(SagemakerConstants.SpecialCharacterRegex, '-')}-`
                : ''

        return getSpaceAppsForUserProfile([...this.spaceApps.values()], userProfilePrefix)
    }

    public async getRemoteSelectedDomainUsers(): Promise<string[]> {
        const remoteAppMetadata = getRemoteAppMetadata()
        const userProfilePrefix = `${remoteAppMetadata.UserProfileName}-`

        return getSpaceAppsForUserProfile([...this.spaceApps.values()], userProfilePrefix)
    }

    public async getDefaultSelectedDomainUsers(): Promise<string[]> {
        if (isRemoteWorkspace()) {
            return this.getRemoteSelectedDomainUsers()
        } else {
            return this.getLocalSelectedDomainUsers()
        }
    }

    public async getSelectedDomainUsers(): Promise<Set<string>> {
        const selectedDomainUsersMap = new Map(
            globals.globalState.get<SelectedDomainUsers>(SagemakerConstants.SelectedDomainUsersState, [])
        )

        const defaultSelectedDomainUsers = await this.getDefaultSelectedDomainUsers()

        // Get selectedDomainUsers from globalState.  If it doesn't exist, then default to defaultSelectedDomainUsers
        const selectedDomainUsers = new Set(
            selectedDomainUsersMap?.get(this.callerIdentity?.Arn || '') || defaultSelectedDomainUsers
        )

        return selectedDomainUsers
    }

    public saveSelectedDomainUsers(selectedDomainUsers: string[]) {
        const selectedDomainUsersMap = new Map(
            globals.globalState.get<SelectedDomainUsers>(SagemakerConstants.SelectedDomainUsersState, [])
        )

        if (this.callerIdentity.Arn) {
            selectedDomainUsersMap?.set(this.callerIdentity.Arn, selectedDomainUsers)
            globals.globalState.tryUpdate(SagemakerConstants.SelectedDomainUsersState, [...selectedDomainUsersMap])
        }
    }

    public async updateChildren(): Promise<void> {
        const [spaceApps, domains] = await this.sagemakerClient.fetchSpaceAppsAndDomains()
        this.spaceApps = spaceApps

        this.callerIdentity = await this.stsClient.getCallerIdentity()
        const selectedDomainUsers = await this.getSelectedDomainUsers()
        this.domainUserProfiles.clear()

        for (const app of spaceApps.values()) {
            const domainId = app.DomainId
            const userProfile = app.OwnershipSettingsSummary?.OwnerUserProfileName
            if (!domainId || !userProfile) {
                continue
            }

            // populate domainUserProfiles for filtering
            const domainUserProfileKey = getDomainUserProfileKey(domainId, userProfile)
            const domainSpaceKey = getDomainSpaceKey(domainId, app.SpaceName || '')

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
            (key) => new SagemakerSpaceNode(this, this.sagemakerClient, this.regionCode, spaceApps.get(key)!)
        )
    }
}

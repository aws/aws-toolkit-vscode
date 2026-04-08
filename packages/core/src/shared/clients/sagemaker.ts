/*! * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import {
    AppDetails,
    AppType,
    CreateAppCommand,
    CreateAppCommandInput,
    CreateAppCommandOutput,
    DeleteAppCommand,
    DeleteAppCommandInput,
    DeleteAppCommandOutput,
    DescribeAppCommand,
    DescribeAppCommandInput,
    DescribeAppCommandOutput,
    DescribeDomainCommand,
    DescribeDomainCommandInput,
    DescribeDomainCommandOutput,
    DescribeDomainResponse,
    DescribeSpaceCommand,
    DescribeSpaceCommandInput,
    DescribeSpaceCommandOutput,
    ListAppsCommandInput,
    ListSpacesCommandInput,
    ResourceSpec,
    SageMakerClient,
    SpaceDetails,
    UpdateSpaceCommand,
    UpdateSpaceCommandInput,
    UpdateSpaceCommandOutput,
    paginateListApps,
    paginateListSpaces,
    ListClustersCommandInput,
    DescribeClusterCommand,
    DescribeClusterCommandInput,
    DescribeClusterCommandOutput,
    ClusterSummary,
    paginateListClusters,
} from '@amzn/sagemaker-client'
import { isEmpty } from 'lodash'
import { sleep } from '../utilities/timeoutUtils'
import { ClientWrapper } from './clientWrapper'
import { AsyncCollection } from '../utilities/asyncCollection'
import {
    InstanceTypeError,
    InstanceTypeMinimum,
    InstanceTypeInsufficientMemory,
    InstanceTypeInsufficientMemoryMessage,
    InstanceTypeNotSelectedMessage,
    RemoteAccess,
} from '../../awsService/sagemaker/constants'
import { getDomainSpaceKey } from '../../awsService/sagemaker/utils'
import { getLogger } from '../logger/logger'
import { ToolkitError } from '../errors'
import { continueText, cancel } from '../localizedText'
import { showConfirmationMessage } from '../utilities/messages'
import { AwsCredentialIdentity } from '@aws-sdk/types'
import globals from '../extensionGlobals'
import { HyperpodCluster } from './kubectlClient'
import { EKSClient } from '@aws-sdk/client-eks'
import { DevSettings } from '../settings'

const appTypeSettingsMap: Record<string, string> = {
    [AppType.JupyterLab as string]: 'JupyterLabAppSettings',
    [AppType.CodeEditor as string]: 'CodeEditorAppSettings',
} as const

export const waitForAppConfig = {
    softTimeoutRetries: 12,
    hardTimeoutRetries: 120,
    intervalMs: 5000,
}

export interface SagemakerSpaceApp extends SpaceDetails {
    App?: AppDetails
    DomainSpaceKey: string
}

export class SagemakerClient extends ClientWrapper<SageMakerClient> {
    public constructor(
        public override readonly regionCode: string,
        private readonly credentialsProvider?: () => Promise<AwsCredentialIdentity>
    ) {
        super(regionCode, SageMakerClient)
    }

    protected override getClient(ignoreCache: boolean = false) {
        if (!this.client || ignoreCache) {
            const devSettings = DevSettings.instance
            const customEndpoint = devSettings.get('endpoints', {})['sagemaker']
            const endpoint = customEndpoint || `https://sagemaker.${this.regionCode}.amazonaws.com`
            const args = {
                serviceClient: SageMakerClient,
                region: this.regionCode,
                clientOptions: {
                    endpoint: endpoint,
                    region: this.regionCode,
                    ...(this.credentialsProvider && { credentials: this.credentialsProvider }),
                },
            }
            this.client = globals.sdkClientBuilderV3.createAwsService(args)
        }
        return this.client
    }

    public override dispose() {
        getLogger().debug('SagemakerClient: Disposing client %O', this.client)
        this.client?.destroy()
        this.client = undefined
    }

    public listSpaces(request: ListSpacesCommandInput = {}): AsyncCollection<SpaceDetails[]> {
        // @ts-ignore: Suppressing type mismatch on paginator return type
        return this.makePaginatedRequest(paginateListSpaces, request, (page) => page.Spaces)
    }

    public listApps(request: ListAppsCommandInput = {}): AsyncCollection<AppDetails[]> {
        // @ts-ignore: Suppressing type mismatch on paginator return type
        return this.makePaginatedRequest(paginateListApps, request, (page) => page.Apps)
    }

    public describeApp(request: DescribeAppCommandInput): Promise<DescribeAppCommandOutput> {
        return this.makeRequest(DescribeAppCommand, request)
    }

    public describeDomain(request: DescribeDomainCommandInput): Promise<DescribeDomainCommandOutput> {
        return this.makeRequest(DescribeDomainCommand, request)
    }

    public describeSpace(request: DescribeSpaceCommandInput): Promise<DescribeSpaceCommandOutput> {
        return this.makeRequest(DescribeSpaceCommand, request)
    }

    public updateSpace(request: UpdateSpaceCommandInput): Promise<UpdateSpaceCommandOutput> {
        return this.makeRequest(UpdateSpaceCommand, request)
    }

    public createApp(request: CreateAppCommandInput): Promise<CreateAppCommandOutput> {
        return this.makeRequest(CreateAppCommand, request)
    }

    public deleteApp(request: DeleteAppCommandInput): Promise<DeleteAppCommandOutput> {
        return this.makeRequest(DeleteAppCommand, request)
    }

    public async listAppForSpace(domainId: string, spaceName: string): Promise<AppDetails | undefined> {
        const appsList = await this.listApps({ DomainIdEquals: domainId, SpaceNameEquals: spaceName })
            .flatten()
            .promise()
        return appsList[0] // At most one App for one SagemakerSpace
    }

    public async listAppsForDomain(domainId: string): Promise<AppDetails[]> {
        return this.listApps({ DomainIdEquals: domainId }).flatten().promise()
    }

    /**
     * Search for an app by space name from the domain's app list (case-insensitive).
     * If space name is all lowercase, uses the more efficient SpaceNameEquals filter.
     * Otherwise, fetches all apps in the domain and performs case-insensitive matching.
     */
    public async listAppsForDomainMatchSpaceIgnoreCase(
        domainId: string,
        spaceName: string
    ): Promise<AppDetails | undefined> {
        // If space name is all lowercase, use the efficient SpaceNameEquals filter
        if (spaceName === spaceName.toLowerCase()) {
            return this.listAppForSpace(domainId, spaceName)
        }
        // Otherwise, fetch all apps and do case-insensitive matching
        const apps = await this.listAppsForDomain(domainId)
        return apps.find((app) => app.SpaceName?.toLowerCase() === spaceName.toLowerCase())
    }

    public async startSpace(spaceName: string, domainId: string, skipInstanceTypePrompts: boolean = false) {
        let spaceDetails: DescribeSpaceCommandOutput

        // Get existing space details
        try {
            spaceDetails = await this.describeSpace({
                DomainId: domainId,
                SpaceName: spaceName,
            })
        } catch (err) {
            throw this.handleStartSpaceError(err)
        }

        // Get app type
        const appType = spaceDetails.SpaceSettings?.AppType
        if (!appType || !(appType in appTypeSettingsMap)) {
            throw new ToolkitError(`Unsupported AppType "${appType}" for space "${spaceName}"`)
        }

        // Get app resource spec
        const requestedResourceSpec =
            appType === AppType.JupyterLab
                ? spaceDetails.SpaceSettings?.JupyterLabAppSettings?.DefaultResourceSpec
                : spaceDetails.SpaceSettings?.CodeEditorAppSettings?.DefaultResourceSpec

        let instanceType = requestedResourceSpec?.InstanceType

        // Is InstanceType defined and has enough memory?
        if (instanceType && instanceType in InstanceTypeInsufficientMemory) {
            if (skipInstanceTypePrompts) {
                // User already consented, upgrade automatically
                instanceType = InstanceTypeInsufficientMemory[instanceType]
            } else {
                // Prompt user to select one with sufficient memory (1 level up from their chosen one)
                const confirmed = await showConfirmationMessage({
                    prompt: InstanceTypeInsufficientMemoryMessage(
                        spaceDetails.SpaceName || '',
                        instanceType,
                        InstanceTypeInsufficientMemory[instanceType]
                    ),
                    confirm: 'Restart Space and Connect',
                    cancel: 'Cancel',
                    type: 'warning',
                })

                if (!confirmed) {
                    throw new ToolkitError('InstanceType has insufficient memory.', { code: InstanceTypeError })
                }

                instanceType = InstanceTypeInsufficientMemory[instanceType]
            }
        } else if (!instanceType) {
            if (skipInstanceTypePrompts) {
                // User already consented, use minimum
                instanceType = InstanceTypeMinimum
            } else {
                // Prompt user to select the minimum supported instance type
                const confirmed = await showConfirmationMessage({
                    prompt: InstanceTypeNotSelectedMessage(spaceDetails.SpaceName || ''),
                    confirm: continueText,
                    cancel: cancel,
                    type: 'warning',
                })

                if (!confirmed) {
                    throw new ToolkitError('InstanceType not defined.', { code: InstanceTypeError })
                }

                instanceType = InstanceTypeMinimum
            }
        }

        // First, update the space if needed
        const needsRemoteAccess =
            !spaceDetails.SpaceSettings?.RemoteAccess ||
            spaceDetails.SpaceSettings?.RemoteAccess === RemoteAccess.DISABLED
        const instanceTypeChanged = requestedResourceSpec?.InstanceType !== instanceType

        if (needsRemoteAccess || instanceTypeChanged) {
            const updateSpaceRequest: UpdateSpaceCommandInput = {
                DomainId: domainId,
                SpaceName: spaceName,
                SpaceSettings: {
                    ...(needsRemoteAccess && { RemoteAccess: RemoteAccess.ENABLED }),
                    ...(instanceTypeChanged && {
                        [appTypeSettingsMap[appType]]: {
                            DefaultResourceSpec: {
                                InstanceType: instanceType,
                            },
                        },
                    }),
                },
            }

            try {
                getLogger().debug('SagemakerClient: Updating space: domainId=%s, spaceName=%s', domainId, spaceName)
                await this.updateSpace(updateSpaceRequest)
                await this.waitForSpaceInService(spaceName, domainId)
            } catch (err) {
                throw this.handleStartSpaceError(err)
            }
        }

        const resourceSpec: ResourceSpec = {
            // Default values
            SageMakerImageArn: 'arn:aws:sagemaker:us-west-2:542918446943:image/sagemaker-distribution-cpu',
            SageMakerImageVersionAlias: '3.2.0',

            // The existing resource spec
            ...requestedResourceSpec,

            // The instance type user has chosen
            InstanceType: instanceType,
        }

        const cleanedResourceSpec =
            resourceSpec && 'EnvironmentArn' in resourceSpec
                ? { ...resourceSpec, EnvironmentArn: undefined, EnvironmentVersionArn: undefined }
                : resourceSpec

        // Second, create the App
        const createAppRequest: CreateAppCommandInput = {
            DomainId: domainId,
            SpaceName: spaceName,
            AppType: appType,
            AppName: 'default',
            ResourceSpec: cleanedResourceSpec,
        }

        try {
            getLogger().debug('SagemakerClient: Creating app: domainId=%s, spaceName=%s', domainId, spaceName)
            await this.createApp(createAppRequest)
        } catch (err) {
            throw this.handleStartSpaceError(err)
        }
    }

    public async listSpaceApps(domainId?: string): Promise<Map<string, SagemakerSpaceApp>> {
        // Create options object conditionally if domainId is provided
        const options = domainId ? { DomainIdEquals: domainId } : undefined

        const appMap: Map<string, AppDetails> = await this.listApps(options)
            .flatten()
            .filter((app) => !!app.DomainId && !!app.SpaceName)
            .filter((app) => app.AppType === AppType.JupyterLab || app.AppType === AppType.CodeEditor)
            .toMap((app) => getDomainSpaceKey(app.DomainId || '', app.SpaceName || ''))

        const spaceApps: Map<string, SagemakerSpaceApp> = await this.listSpaces(options)
            .flatten()
            .filter((space) => !!space.DomainId && !!space.SpaceName)
            .map((space) => {
                const key = getDomainSpaceKey(space.DomainId || '', space.SpaceName || '')
                return { ...space, App: appMap.get(key), DomainSpaceKey: key }
            })
            .toMap((space) => getDomainSpaceKey(space.DomainId || '', space.SpaceName || ''))
        return spaceApps
    }

    public async fetchSpaceAppsAndDomains(
        domainId?: string,
        filterSmusDomains: boolean = true
    ): Promise<[Map<string, SagemakerSpaceApp>, Map<string, DescribeDomainResponse>]> {
        try {
            const spaceApps = await this.listSpaceApps(domainId)
            // Get de-duped list of domain IDs for all of the spaces
            const domainIds: string[] = domainId
                ? [domainId]
                : [...new Set([...spaceApps].map(([_, spaceApp]) => spaceApp.DomainId || ''))]

            // Get details for each domain
            const domains: [string, DescribeDomainResponse][] = await Promise.all(
                domainIds.map(async (domainId, index) => {
                    await sleep(index * 100)
                    const response = await this.describeDomain({ DomainId: domainId })
                    return [domainId, response]
                })
            )

            const domainsMap = new Map<string, DescribeDomainResponse>(domains)

            const filteredSpaceApps = new Map(
                [...spaceApps]
                    // Filter out SageMaker Unified Studio domains only if filterSmusDomains is true
                    .filter(
                        ([_, spaceApp]) =>
                            !filterSmusDomains ||
                            isEmpty(domainsMap.get(spaceApp.DomainId || '')?.DomainSettings?.UnifiedStudioSettings)
                    )
            )

            return [filteredSpaceApps, domainsMap]
        } catch (err) {
            const error = err as Error
            getLogger().error('Failed to fetch space apps: %s', err)
            if (error.name === 'AccessDeniedException') {
                void vscode.window.showErrorMessage(
                    'AccessDeniedException: You do not have permission to view spaces. Please contact your administrator',
                    { modal: false, detail: 'AWS Toolkit' }
                )
            }
            throw err
        }
    }

    private async waitForSpaceInService(
        spaceName: string,
        domainId: string,
        maxRetries = 30,
        intervalMs = 5000
    ): Promise<void> {
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            const result = await this.describeSpace({ SpaceName: spaceName, DomainId: domainId })

            if (result.Status === 'InService') {
                return
            }

            await sleep(intervalMs)
        }

        throw new ToolkitError(
            `Timed out waiting for space "${spaceName}" in domain "${domainId}" to reach "InService" status.`
        )
    }

    public async waitForAppInService(
        domainId: string,
        spaceName: string,
        appType: string,
        progress?: vscode.Progress<{ message?: string; increment?: number }>
    ): Promise<void> {
        for (let attempt = 0; attempt < waitForAppConfig.hardTimeoutRetries; attempt++) {
            const { Status } = await this.describeApp({
                DomainId: domainId,
                SpaceName: spaceName,
                AppType: appType as any,
                AppName: 'default',
            })

            if (Status === 'InService') {
                return
            }

            if (['Failed', 'DeleteFailed'].includes(Status ?? '')) {
                throw new ToolkitError(`App failed to start. Status: ${Status}`)
            }

            if (attempt === waitForAppConfig.softTimeoutRetries) {
                progress?.report({
                    message: `Starting the space is taking longer than usual. The space will connect when ready`,
                })
            }

            await sleep(waitForAppConfig.intervalMs)
        }

        throw new ToolkitError(`Timed out waiting for app "${spaceName}" to reach "InService" status.`)
    }

    private handleStartSpaceError(err: unknown) {
        const error = err as Error
        if (error.name === 'AccessDeniedException') {
            throw new ToolkitError('You do not have permission to start spaces. Please contact your administrator', {
                cause: error,
            })
        } else {
            throw err
        }
    }

    public listClusters(request: ListClustersCommandInput = {}): AsyncCollection<ClusterSummary[]> {
        // @ts-ignore: Suppressing type mismatch on paginator return type
        return this.makePaginatedRequest(paginateListClusters, request, (page) => page.ClusterSummaries)
    }

    public describeCluster(request: DescribeClusterCommandInput): Promise<DescribeClusterCommandOutput> {
        return this.makeRequest(DescribeClusterCommand, request)
    }

    public async listHyperpodClusters(): Promise<HyperpodCluster[]> {
        const clusterSummaries = await this.listClusters().flatten().promise()
        const clusters: HyperpodCluster[] = []

        for (const summary of clusterSummaries) {
            clusters.push(await this.getHyperpodCluster(summary.ClusterName!))
        }
        return clusters
    }

    async getHyperpodCluster(clusterName: string): Promise<HyperpodCluster> {
        const response = await this.describeCluster({ ClusterName: clusterName })

        if (!response.ClusterArn) {
            throw new Error(`Cluster ${clusterName} not found`)
        }

        const orchestrator = response.Orchestrator
        let eksClusterName: string | undefined
        let eksClusterArn: string | undefined

        if (orchestrator?.Eks) {
            eksClusterName = orchestrator.Eks.ClusterArn?.split('/').pop()
            eksClusterArn = orchestrator.Eks.ClusterArn
        }

        return {
            clusterName: response.ClusterName!,
            clusterArn: response.ClusterArn,
            status: response.ClusterStatus!,
            eksClusterName,
            eksClusterArn,
            regionCode: this.regionCode,
        }
    }

    public getEKSClient(ignoreCache: boolean = false) {
        const args = {
            serviceClient: EKSClient as any,
            region: this.regionCode,
            clientOptions: {
                region: this.regionCode,
                ...(this.credentialsProvider && { credentials: this.credentialsProvider }),
            },
        }
        return globals.sdkClientBuilderV3.createAwsService(args) as EKSClient
    }
}

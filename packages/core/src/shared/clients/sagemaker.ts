/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import {
    AppDetails,
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
} from '@amzn/sagemaker-client'
import { isEmpty } from 'lodash'
import { sleep } from '../utilities/timeoutUtils'
import { ClientWrapper } from './clientWrapper'
import { AsyncCollection } from '../utilities/asyncCollection'
import { getDomainSpaceKey } from '../../awsService/sagemaker/utils'
import { getLogger } from '../logger/logger'
import { ToolkitError } from '../errors'

export interface SagemakerSpaceApp extends SpaceDetails {
    App?: AppDetails
    DomainSpaceKey: string
}
export class SagemakerClient extends ClientWrapper<SageMakerClient> {
    public constructor(public override readonly regionCode: string) {
        super(regionCode, SageMakerClient, true)
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

    public async startSpace(spaceName: string, domainId: string) {
        let spaceDetails
        try {
            spaceDetails = await this.describeSpace({
                DomainId: domainId,
                SpaceName: spaceName,
            })
        } catch (err) {
            throw this.handleStartSpaceError(err)
        }

        if (!spaceDetails.SpaceSettings?.RemoteAccess || spaceDetails.SpaceSettings?.RemoteAccess === 'DISABLED') {
            try {
                await this.updateSpace({
                    DomainId: domainId,
                    SpaceName: spaceName,
                    SpaceSettings: {
                        RemoteAccess: 'ENABLED',
                    },
                })
                await this.waitForSpaceInService(spaceName, domainId)
            } catch (err) {
                throw this.handleStartSpaceError(err)
            }
        }

        const appType = spaceDetails.SpaceSettings?.AppType
        if (appType !== 'JupyterLab' && appType !== 'CodeEditor') {
            throw new ToolkitError(`Unsupported AppType "${appType}" for space "${spaceName}"`)
        }

        const requestedResourceSpec =
            appType === 'JupyterLab'
                ? spaceDetails.SpaceSettings?.JupyterLabAppSettings?.DefaultResourceSpec
                : spaceDetails.SpaceSettings?.CodeEditorAppSettings?.DefaultResourceSpec

        const fallbackResourceSpec: ResourceSpec = {
            InstanceType: 'ml.t3.medium',
            SageMakerImageArn: 'arn:aws:sagemaker:us-west-2:542918446943:image/sagemaker-distribution-cpu',
            SageMakerImageVersionAlias: '3.2.0',
        }

        const resourceSpec = requestedResourceSpec?.InstanceType ? requestedResourceSpec : fallbackResourceSpec

        const cleanedResourceSpec =
            resourceSpec && 'EnvironmentArn' in resourceSpec
                ? { ...resourceSpec, EnvironmentArn: undefined, EnvironmentVersionArn: undefined }
                : resourceSpec

        const createAppRequest: CreateAppCommandInput = {
            DomainId: domainId,
            SpaceName: spaceName,
            AppType: appType,
            AppName: 'default',
            ResourceSpec: cleanedResourceSpec,
        }

        try {
            await this.createApp(createAppRequest)
        } catch (err) {
            throw this.handleStartSpaceError(err)
        }
    }

    public async fetchSpaceAppsAndDomains(): Promise<
        [Map<string, SagemakerSpaceApp>, Map<string, DescribeDomainResponse>]
    > {
        try {
            const appMap: Map<string, AppDetails> = await this.listApps()
                .flatten()
                .filter((app) => !!app.DomainId && !!app.SpaceName)
                .filter((app) => app.AppType === 'JupyterLab' || app.AppType === 'CodeEditor')
                .toMap((app) => getDomainSpaceKey(app.DomainId || '', app.SpaceName || ''))

            const spaceApps: Map<string, SagemakerSpaceApp> = await this.listSpaces()
                .flatten()
                .filter((space) => !!space.DomainId && !!space.SpaceName)
                .map((space) => {
                    const key = getDomainSpaceKey(space.DomainId || '', space.SpaceName || '')
                    return { ...space, App: appMap.get(key), DomainSpaceKey: key }
                })
                .toMap((space) => getDomainSpaceKey(space.DomainId || '', space.SpaceName || ''))

            // Get de-duped list of domain IDs for all of the spaces
            const domainIds: string[] = [...new Set([...spaceApps].map(([_, spaceApp]) => spaceApp.DomainId || ''))]

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
                    // Filter out SageMaker Unified Studio domains
                    .filter(([_, spaceApp]) =>
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
        maxRetries = 30,
        intervalMs = 5000
    ): Promise<void> {
        for (let attempt = 0; attempt < maxRetries; attempt++) {
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

            await sleep(intervalMs)
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
}

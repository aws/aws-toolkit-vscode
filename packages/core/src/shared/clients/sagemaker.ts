/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    AppDetails,
    DescribeAppCommand,
    DescribeAppCommandInput,
    DescribeAppCommandOutput,
    DescribeDomainCommand,
    DescribeDomainCommandInput,
    DescribeDomainCommandOutput,
    DescribeDomainResponse,
    ListAppsCommandInput,
    ListSpacesCommandInput,
    SageMakerClient,
    SpaceDetails,
    paginateListApps,
    paginateListSpaces,
} from '@amzn/sagemaker-client'
import { isEmpty } from 'lodash'
import { sleep } from '../utilities/timeoutUtils'
import { ClientWrapper } from './clientWrapper'
import { AsyncCollection } from '../utilities/asyncCollection'
import { getDomainSpaceKey } from '../../awsService/sagemaker/utils'
import { getLogger } from '../logger/logger'

export interface SagemakerSpaceApp extends SpaceDetails {
    App?: AppDetails
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

    public async fetchSpaceAppsAndDomains(): Promise<
        [Map<string, SagemakerSpaceApp>, Map<string, DescribeDomainResponse>]
    > {
        try {
            const appMap: Map<string, AppDetails> = await this.listApps()
                .flatten()
                .filter((app) => !!app.DomainId && !!app.SpaceName)
                .toMap((app) => getDomainSpaceKey(app.DomainId || '', app.SpaceName || ''))

            const spaceApps: Map<string, SagemakerSpaceApp> = await this.listSpaces()
                .flatten()
                .filter((space) => !!space.DomainId && !!space.SpaceName)
                .map((space) => {
                    const key = getDomainSpaceKey(space.DomainId || '', space.SpaceName || '')
                    return { ...space, App: appMap.get(key) }
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
        } catch (err: any) {
            getLogger().error('Failed to fetch space apps: %s', err)
            throw err
        }
    }
}

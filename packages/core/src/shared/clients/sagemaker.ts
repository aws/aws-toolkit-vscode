/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    AppDetails,
    DescribeAppCommand,
    DescribeAppCommandInput,
    DescribeAppCommandOutput,
    ListAppsCommandInput,
    ListSpacesCommandInput,
    SageMakerClient,
    SpaceDetails,
    paginateListApps,
    paginateListSpaces,
} from '@aws-sdk/client-sagemaker'
import { ClientWrapper } from './clientWrapper'
import { AsyncCollection } from '../utilities/asyncCollection'

export interface SagemakerSpaceApp extends SpaceDetails {
    App?: AppDetails
}
export class SagemakerClient extends ClientWrapper<SageMakerClient> {
    public constructor(public override readonly regionCode: string) {
        super(regionCode, SageMakerClient)
    }

    public listSpaces(request: ListSpacesCommandInput = {}): AsyncCollection<SpaceDetails[]> {
        return this.makePaginatedRequest(paginateListSpaces, request, (page) => page.Spaces)
    }

    public listApps(request: ListAppsCommandInput = {}): AsyncCollection<AppDetails[]> {
        return this.makePaginatedRequest(paginateListApps, request, (page) => page.Apps)
    }

    public describeApp(request: DescribeAppCommandInput): Promise<DescribeAppCommandOutput> {
        return this.makeRequest(DescribeAppCommand, request)
    }

    public async fetchSpaceApps(): Promise<Map<string, SagemakerSpaceApp>> {
        const appMap = await this.listApps()
            .flatten()
            .toMap((app) => `${app.DomainId}-${app.SpaceName}` as string)

        const spaceApps = await this.listSpaces()
            .flatten()
            .map((space) => {
                const key = `${space.DomainId}-${space.SpaceName}` as string
                return { ...space, App: appMap.get(key) }
            })
            .toMap((space) => `${space.DomainId}-${space.SpaceName}` as string)
        return spaceApps
    }
}

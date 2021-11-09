/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
import { Uri } from 'vscode'
import { ext } from '../../extensionGlobals'
import { getLogger } from '../../logger/logger'
import { Region } from '../../regions/endpoints'
import { getRegionsForActiveCredentials } from '../../regions/regionUtilities'
import { createCommonButtons } from '../buttons'
import { createQuickPick, QuickPickPrompter } from '../pickerPrompter'

const localize = nls.loadMessageBundle()

/**
 * Filter can be a service ID, an array of service IDs (all must be available in a region), or a callback
 */
type RegionFilter = string | [string, ...string[]] | ((region: Region) => boolean)

type RegionPrompterOptions = {
    regions?: Region[]
    defaultRegion?: string
    title?: string
    helpUri?: string | Uri
    filter?: RegionFilter
}

const serviceFilter = (service: string) => (region: Region) => ext.regionProvider.isServiceInRegion(service, region.id)

function resolveRegionFilter(filter: RegionFilter): (region: Region) => boolean {
    return typeof filter === 'function'
        ? filter
        : typeof filter === 'string'
        ? serviceFilter(filter)
        : filter.map(serviceFilter).reduce((a, b) => (region: Region) => a(region) && b(region))
}

export function createRegionPrompter(options: RegionPrompterOptions = {}): QuickPickPrompter<Region> {
    const lastRegionKey = 'lastSelectedRegion'
    const regions = options.regions ?? getRegionsForActiveCredentials(ext.awsContext, ext.regionProvider)
    const filteredRegions = options.filter ? regions.filter(resolveRegionFilter(options.filter)) : regions
    const lastRegion = ext.context.globalState.get<Region>(lastRegionKey)

    const items = filteredRegions.map(region => ({
        label: region.name,
        detail: region.id,
        data: region,
        description: '',
        recentlyUsed: region.id === lastRegion?.id,
    }))

    const defaultRegionItem = items.find(item => item.detail === options.defaultRegion)

    if (defaultRegionItem !== undefined) {
        defaultRegionItem.description = localize('AWS.generic.defaultRegion', 'default region')
    }

    const prompter = createQuickPick(items, {
        title: options.title ?? localize('AWS.generic.selectRegion', 'Select a region'),
        matchOnDetail: true,
        buttons: createCommonButtons(options.helpUri),
        compare: (a, b) => (a === defaultRegionItem ? -1 : b === defaultRegionItem ? 1 : 0),
    })

    return prompter.onResponse(item => {
        getLogger().debug('createRegionPrompter: selected %O', item)
        ext.context.globalState.update(lastRegionKey, item)
        return item
    })
}

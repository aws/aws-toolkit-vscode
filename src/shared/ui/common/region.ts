/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
import globals from '../../extensionGlobals'
import { getLogger } from '../../logger/logger'
import { Region } from '../../regions/endpoints'
import { getRegionsForActiveCredentials } from '../../regions/regionUtilities'
import { createCommonButtons, PrompterButtons } from '../buttons'
import { createQuickPick, QuickPickPrompter } from '../pickerPrompter'

const localize = nls.loadMessageBundle()

interface RegionPrompterOptions {
    readonly defaultRegion?: string
    readonly title?: string
    readonly buttons?: PrompterButtons<Region>
    readonly serviceFilter?: string
}

export function createRegionPrompter(
    regions = getRegionsForActiveCredentials(globals.awsContext, globals.regionProvider),
    options: RegionPrompterOptions = {}
): QuickPickPrompter<Region> {
    const lastRegionKey = 'lastSelectedRegion'
    const defaultRegion = options.defaultRegion ?? globals.awsContext.getCredentialDefaultRegion()
    const filteredRegions = regions.filter(
        r => !options.serviceFilter || globals.regionProvider.isServiceInRegion(options.serviceFilter, r.id)
    )

    const items = filteredRegions.map(region => ({
        label: region.name,
        detail: region.id,
        data: region,
        skipEstimate: true,
        description: '',
    }))

    const defaultRegionItem = items.find(item => item.detail === defaultRegion)

    if (defaultRegionItem !== undefined) {
        defaultRegionItem.description = localize('AWS.generic.defaultRegion', '(default region)')
    }

    const prompter = createQuickPick(items, {
        title: options.title ?? localize('AWS.generic.selectRegion', 'Select a region'),
        buttons: options.buttons ?? createCommonButtons(),
        matchOnDetail: true,
        compare: (a, b) => {
            return a.detail === defaultRegion ? -1 : b.detail === defaultRegion ? 1 : 0
        },
    })

    const lastRegion = globals.context.globalState.get<Region>(lastRegionKey)
    if (lastRegion !== undefined && (lastRegion as any).id) {
        const found = filteredRegions.find(val => val.id === lastRegion.id)
        if (found) {
            prompter.recentItem = lastRegion
        }
    }
    return prompter.transform(item => {
        getLogger().debug('createRegionPrompter: selected %O', item)
        globals.context.globalState.update(lastRegionKey, item)
        return item
    })
}

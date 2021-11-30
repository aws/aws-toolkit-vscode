/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
import globals from '../../extensionGlobals'
import { getLogger } from '../../logger/logger'
import { Region } from '../../regions/endpoints'
import { getRegionsForActiveCredentials } from '../../regions/regionUtilities'
import { PrompterButtons } from '../buttons'
import { createQuickPick, QuickPickPrompter } from '../pickerPrompter'

const localize = nls.loadMessageBundle()

type RegionPrompterOptions = {
    defaultRegion?: string
    title?: string
    buttons?: PrompterButtons<Region>
}

export function createRegionPrompter(
    regions?: Region[],
    options: RegionPrompterOptions = {}
): QuickPickPrompter<Region> {
    const lastRegionKey = 'lastSelectedRegion'
    if (!regions) {
        regions = getRegionsForActiveCredentials(globals.awsContext, globals.regionProvider)
    }

    const items = regions.map(region => ({
        label: region.name,
        detail: region.id,
        data: region,
        description: '',
    }))

    const defaultRegionItem = items.find(item => item.label === options.defaultRegion)

    if (defaultRegionItem !== undefined) {
        defaultRegionItem.description = localize('AWS.generic.defaultRegion', 'Default region')
    }

    const prompter = createQuickPick(items, {
        title: options.title ?? localize('AWS.generic.selectRegion', 'Select a region'),
        buttons: options.buttons,
        matchOnDetail: true,
        compare: (a, b) => {
            return a.detail === options.defaultRegion ? -1 : b.detail === options.defaultRegion ? 1 : 0
        },
    })

    const lastRegion = globals.context.globalState.get<Region>(lastRegionKey)
    if (lastRegion !== undefined && (lastRegion as any).id) {
        const found = regions.find(val => val.id === lastRegion.id)
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

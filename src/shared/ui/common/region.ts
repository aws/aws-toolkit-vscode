/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
import { ext } from '../../extensionGlobals'
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
        const lastRegion = ext.context.globalState.get<string>(lastRegionKey)
        regions = getRegionsForActiveCredentials(ext.awsContext, ext.regionProvider)
        for (let i = 0; lastRegion !== undefined && i < regions.length; i++) {
            if (regions[i].id === lastRegion) {
                regions.splice(0, 0, regions[i]) // prepend
                regions.splice(i + 1, 1) // delete
                break
            }
        }
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
        onDidSelect: item => {
            getLogger().debug('createRegionPrompter: onDidSelect: selected %O', item)
            const region = typeof item === 'string' ? item : (item as Region).id
            ext.context.globalState.update(lastRegionKey, region)
        },
    })

    return prompter
}

/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import globals from '../../extensionGlobals'

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import { getLogger } from '../../logger/logger'
import { Region } from '../../regions/endpoints'
import { createCommonButtons, PrompterButtons } from '../buttons'
import { createQuickPick, QuickPickPrompter } from '../pickerPrompter'

interface RegionPrompterOptions {
    readonly defaultRegion?: string
    readonly title?: string
    readonly buttons?: PrompterButtons<Region>
    readonly serviceFilter?: string
    readonly helpUrl?: string | vscode.Uri
    readonly placeholder?: string
}

export function createRegionPrompter(
    regions = globals.regionProvider.getRegions(),
    options: RegionPrompterOptions = {}
): QuickPickPrompter<Region> {
    const lastRegionKey = 'lastSelectedRegion'
    const defaultRegion = options.defaultRegion ?? globals.regionProvider.defaultRegionId
    const filteredRegions = regions.filter(
        r => !options.serviceFilter || globals.regionProvider.isServiceInRegion(options.serviceFilter, r.id)
    )

    const lastRegion = globals.context.globalState.get<Region>(lastRegionKey)
    const items = filteredRegions.map(region => ({
        label: region.name,
        detail: region.id,
        data: region,
        skipEstimate: true,
        description: '',
        recentlyUsed: region.id === lastRegion?.id,
    }))

    const defaultRegionItem = items.find(item => item.detail === defaultRegion)

    if (defaultRegionItem !== undefined && !defaultRegionItem.recentlyUsed) {
        defaultRegionItem.description = localize('AWS.generic.defaultRegion', '(default region)')
    }

    const prompter = createQuickPick(items, {
        title: options.title ?? localize('AWS.generic.selectRegion', 'Select a region'),
        buttons: options.buttons ?? createCommonButtons(options.helpUrl),
        matchOnDetail: true,
        compare: (a, b) => {
            return a.detail === defaultRegion ? -1 : b.detail === defaultRegion ? 1 : 0
        },
    })

    return prompter.transform(item => {
        getLogger().debug('createRegionPrompter: selected %O', item)
        globals.context.globalState.update(lastRegionKey, item).then(undefined, e => {
            getLogger().error('globalState.update() failed: %s', (e as Error).message)
        })
        return item
    })
}

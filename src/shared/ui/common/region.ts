/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
import { Region } from '../../regions/endpoints'
import { PrompterButtons } from '../buttons'
import { createQuickPick, QuickPickPrompter } from '../pickerPrompter'

const localize = nls.loadMessageBundle()

type RegionPrompterOptions = {
    defaultRegion?: string
    title?: string
    buttons?: PrompterButtons<Region>
}

export function createRegionPrompter(
    regions: Region[],
    options: RegionPrompterOptions = {}
): QuickPickPrompter<Region> {
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

    return prompter
}

/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
import { ExtContext } from '../../extensions'
import { Region } from '../../regions/endpoints'
import { getRegionsForActiveCredentials } from '../../regions/regionUtilities'
import { PrompterButtons } from '../buttons'
import { createQuickPick, QuickPickPrompter } from '../pickerPrompter'

const localize = nls.loadMessageBundle()

type RegionContext = Pick<ExtContext, 'regionProvider' | 'awsContext'>
type RegionPrompterOptions = {
    currentRegion?: Region | string
    title?: string
    buttons?: PrompterButtons<Region>
    /** Filter regions based off service availability */
    serviceId?: string
}

export function createRegionPrompter(regions: Region[], options: RegionPrompterOptions): QuickPickPrompter<Region>
export function createRegionPrompter(context: RegionContext, options: RegionPrompterOptions): QuickPickPrompter<Region>
export function createRegionPrompter(
    regions: Region[] | RegionContext,
    options: RegionPrompterOptions = {}
): QuickPickPrompter<Region> {
    if (!Array.isArray(regions)) {
        const { awsContext, regionProvider } = regions
        regions = getRegionsForActiveCredentials(awsContext, regionProvider)
        options.currentRegion = options.currentRegion ?? awsContext.getCredentialDefaultRegion()

        if (options.serviceId !== undefined) {
            regions = regions.filter(r => regionProvider.isServiceInRegion(options.serviceId!, r.id))
        }
    }

    const items = regions.map(region => ({
        label: region.name,
        detail: region.id,
        data: region,
    }))

    const prompter = createQuickPick(items, {
        title: options.title ?? localize('AWS.generic.selectRegion', 'Select a region'),
        buttons: options.buttons,
        matchOnDetail: true,
        compare: (a, b) => {
            return a.detail === options.currentRegion ? -1 : b.detail === options.currentRegion ? 1 : 0
        },
    })

    return prompter
}

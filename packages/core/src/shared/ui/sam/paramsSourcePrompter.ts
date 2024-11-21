/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { samDeployUrl, samSyncUrl } from '../../constants'
import { createCommonButtons } from '../buttons'
import { DataQuickPickItem, createQuickPick } from '../pickerPrompter'

export enum ParamsSource {
    SpecifyAndSave,
    Specify,
    SamConfig,
}

function loadParamsSourcePrompterItems(existValidSamconfig: boolean | undefined) {
    const items: DataQuickPickItem<ParamsSource>[] = [
        {
            label: 'Specify required parameters and save as defaults',
            data: ParamsSource.SpecifyAndSave,
        },
        {
            label: 'Specify required parameters',
            data: ParamsSource.Specify,
        },
    ]

    if (existValidSamconfig) {
        items.push({
            label: 'Use default values from samconfig',
            data: ParamsSource.SamConfig,
        })
    }

    return items
}

/**
 * Creates a quick pick prompter for SAM deploy parameter source selection
 *
 * @param existValidSamconfig Whether a valid samconfig.toml file exist and contain necessary flag for SAM sync operation
 * @returns A quick pick prompter
 */
export function createDeployParamsSourcePrompter(existValidSamconfig: boolean | undefined) {
    const items = loadParamsSourcePrompterItems(existValidSamconfig)

    return createQuickPick(items, {
        title: 'Specify parameter source for deploy',
        placeholder: 'Press enter to proceed with highlighted option',
        buttons: createCommonButtons(samDeployUrl),
    })
}

/**
 * Creates a quick pick prompter for SAM sync parameter source selection
 *
 * @param existValidSamconfig Whether a valid samconfig.toml file exist and contain necessary flag for SAM sync operation
 * @returns A quick pick prompter
 */

export function createSyncParamsSourcePrompter(existValidSamconfig: boolean | undefined) {
    const items = loadParamsSourcePrompterItems(existValidSamconfig)

    return createQuickPick(items, {
        title: 'Specify parameter source for sync',
        placeholder: 'Press enter to proceed with highlighted option',
        buttons: createCommonButtons(samSyncUrl),
    })
}

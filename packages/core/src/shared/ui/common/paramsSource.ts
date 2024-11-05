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

export function createDeployParamsSourcePrompter(existValidSamconfig: boolean | undefined) {
    const items = loadParamsSourcePrompterItems(existValidSamconfig)

    return createQuickPick(items, {
        title: 'Specify parameters for deploy',
        placeholder: 'Press enter to proceed with highlighted option',
        buttons: createCommonButtons(samDeployUrl),
    })
}

export function createSyncParamsSourcePrompter(existValidSamconfig: boolean | undefined) {
    const items = loadParamsSourcePrompterItems(existValidSamconfig)

    return createQuickPick(items, {
        title: 'Specify parameters for sync',
        placeholder: 'Press enter to proceed with highlighted option',
        buttons: createCommonButtons(samSyncUrl),
    })
}

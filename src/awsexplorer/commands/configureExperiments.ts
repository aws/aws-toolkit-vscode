/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { getExperiments, Experiment, updateExperiments } from '../../shared/experiments/experiments'

export async function configureExperiments(): Promise<boolean> {
    const window = vscode.window
    const experiments = getExperiments()

    const items: Map<vscode.QuickPickItem, Experiment> = new Map()
    for (const experiment of experiments.values()) {
        items.set(
            {
                label: experiment.description,
                detail: experiment.id,
                picked: experiment.enabled,
            },
            experiment
        )
    }

    const result = await window.showQuickPick(Array.from(items.keys()), {
        placeHolder: localize('aws.experiments.configure', 'Select Toolkit experiments to enable'),
        canPickMany: true,
    })

    if (result) {
        const experiments = result.map(res => {
            const experiment = items.get(res)!
            experiment.enabled = true
            return experiment
        })
        await updateExperiments(experiments)
        return true
    }

    return false
}

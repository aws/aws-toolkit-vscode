/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import experimentMetadata = require('./experiments.json')
import { localize } from '../utilities/vsCodeUtils'

export function getExperiments(
    metadata = experimentMetadata.experiments as ExperimentMetadata[]
): Map<string, Experiment> {
    const config = vscode.workspace.getConfiguration('aws').get<ExperimentConfig>('experiments') ?? {}
    const experiments: Map<string, Experiment> = new Map()

    metadata.forEach(experiment =>
        experiments.set(experiment.id, {
            ...experiment,
            description: localize(`aws.experiments.${experiment.id}`, experiment.description),
            enabled: config[experiment.id] ?? false,
        })
    )

    return experiments
}

export async function updateExperiments(experiments: Experiment[]) {
    const updatedConfig: ExperimentConfig = {}
    for (const experiment of experiments) {
        updatedConfig[experiment.id] = experiment.enabled
    }
    await vscode.workspace
        .getConfiguration()
        .update('aws.experiments', updatedConfig, vscode.ConfigurationTarget.Global)
}

export interface ExperimentConfig {
    [x: string]: boolean
}

export interface ExperimentMetadata {
    id: string
    description: string
}

export type Experiment = ExperimentMetadata & { enabled: boolean }

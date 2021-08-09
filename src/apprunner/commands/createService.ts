/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as telemetry from '../../shared/telemetry/telemetry'
import { AppRunnerNode } from '../explorer/apprunnerNode'
import { CreateAppRunnerServiceWizard } from '../wizards/apprunnerCreateServiceWizard'

export async function createAppRunnerService(node: AppRunnerNode): Promise<void> {
    let telemetryResult: telemetry.Result = 'Failed'
    let source: telemetry.AppRunnerServiceSource | undefined = undefined

    try {
        const wizard = new CreateAppRunnerServiceWizard(node.region)
        const result = await wizard.run()
        if (result === undefined) {
            telemetryResult = 'Cancelled'
            return
        }

        await node.createService(result)
        source =
            result.SourceConfiguration.CodeRepository !== undefined
                ? 'repository'
                : result.SourceConfiguration.ImageRepository !== undefined
                ? result.SourceConfiguration.ImageRepository.ImageRepositoryType === 'ECR_PUBLIC'
                    ? 'ecrPublic'
                    : 'ecr'
                : undefined
        telemetryResult = 'Succeeded'
    } finally {
        telemetry.recordApprunnerCreateService({
            result: telemetryResult,
            // If we cancel there is no source type (so this should be optional)
            appRunnerServiceSource: source as any,
            passive: false,
        })
    }
}

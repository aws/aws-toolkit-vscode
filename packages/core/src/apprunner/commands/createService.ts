/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { telemetry } from '../../shared/telemetry/telemetry'
import { AppRunnerServiceSource, Result } from '../../shared/telemetry/telemetry'
import { AppRunnerNode } from '../explorer/apprunnerNode'
import { CreateAppRunnerServiceWizard } from '../wizards/apprunnerCreateServiceWizard'

export async function createAppRunnerService(node: AppRunnerNode): Promise<void> {
    let telemetryResult: Result = 'Failed'
    let source: AppRunnerServiceSource | undefined = undefined

    try {
        const wizard = new CreateAppRunnerServiceWizard(node.regionCode)
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
        telemetry.apprunner_createService.emit({
            result: telemetryResult,
            // If we cancel there is no source type (so this should be optional)
            appRunnerServiceSource: source as any,
            passive: false,
        })
    }
}

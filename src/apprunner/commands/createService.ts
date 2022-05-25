/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getTelemetryLogger } from '../../shared/telemetry/recorder'
import { AppRunnerNode } from '../explorer/apprunnerNode'
import { CreateAppRunnerServiceWizard } from '../wizards/apprunnerCreateServiceWizard'

export async function createAppRunnerService(node: AppRunnerNode): Promise<void> {
    const wizard = new CreateAppRunnerServiceWizard(node.region)
    const result = await wizard.run()
    if (result === undefined) {
        getTelemetryLogger('ApprunnerCreateService').recordResult('Cancelled')
        return
    }

    await node.createService(result)
    const source =
        result.SourceConfiguration.CodeRepository !== undefined
            ? 'repository'
            : result.SourceConfiguration.ImageRepository !== undefined
            ? result.SourceConfiguration.ImageRepository.ImageRepositoryType === 'ECR_PUBLIC'
                ? 'ecrPublic'
                : 'ecr'
            : undefined

    getTelemetryLogger('ApprunnerCreateService').recordAppRunnerServiceSource(source as any)
}

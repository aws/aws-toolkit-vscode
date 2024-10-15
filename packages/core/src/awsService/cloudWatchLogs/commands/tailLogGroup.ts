/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { TailLogGroupWizard } from '../wizard/tailLogGroupWizard'
import { getLogger } from '../../../shared'
import { CancellationError } from '../../../shared/utilities/timeoutUtils'

export async function tailLogGroup(logData?: { regionName: string; groupName: string }): Promise<void> {
    const wizard = new TailLogGroupWizard(logData)
    const wizardResponse = await wizard.run()
    if (!wizardResponse) {
        throw new CancellationError('user')
    }

    //TODO: Remove Log. For testing while we aren't yet consuming the wizardResponse.
    getLogger().info(JSON.stringify(wizardResponse))
}

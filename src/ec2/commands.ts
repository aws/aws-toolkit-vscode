/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { createEc2ConnectPrompter, handleEc2ConnectPrompterResponse } from './prompter'
import { isValidResponse } from '../shared/wizards/wizard'
import { Ec2ConnectionManager } from './model'
import { Ec2Selection } from './utils'
import { RegionSubmenuResponse } from '../shared/ui/common/regionSubmenu'
import { PromptResult } from '../shared/ui/prompter'
import { CancellationError } from '../shared/utilities/timeoutUtils'
import { copyToClipboard } from '../shared/utilities/messages'

function getSelectionFromResponse(response: PromptResult<RegionSubmenuResponse<string>>): Ec2Selection {
    if (isValidResponse(response)) {
        return handleEc2ConnectPrompterResponse(response)
    } else {
        throw new CancellationError('user')
    }
}

export async function tryConnect(selection?: Ec2Selection): Promise<void> {
    if (!selection) {
        const prompter = createEc2ConnectPrompter()
        const response = await prompter.prompt()

        selection = getSelectionFromResponse(response)
    }

    const ec2Client = new Ec2ConnectionManager(selection.region)
    await ec2Client.attemptEc2Connection(selection)
}

export async function copyInstanceId(instanceId: string): Promise<void> {
    await copyToClipboard(instanceId, 'Id')
}

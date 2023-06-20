/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { createEc2ConnectPrompter, handleEc2ConnectPrompterResponse } from './prompter'
import { isValidResponse } from '../shared/wizards/wizard'
import { Ec2ConnectionManager } from './model'

export async function tryConnect(): Promise<void> {
    const prompter = createEc2ConnectPrompter()
    const response = await prompter.prompt()

    if (isValidResponse(response)) {
        const selection = handleEc2ConnectPrompterResponse(response)
        const ec2Client = new Ec2ConnectionManager(selection.region)
        await ec2Client.attemptEc2Connection(selection)
    }
}

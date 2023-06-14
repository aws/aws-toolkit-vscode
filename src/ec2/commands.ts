/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { createEC2ConnectPrompter, handleEc2ConnectPrompterResponse } from './prompter'
import { isValidResponse } from '../shared/wizards/wizard'

export async function tryConnect(): Promise<void> {
    const prompter = createEC2ConnectPrompter()
    const response = await prompter.prompt()

    if (isValidResponse(response)) {
        const selection = handleEc2ConnectPrompterResponse(response)
        console.log(selection)
    }
}

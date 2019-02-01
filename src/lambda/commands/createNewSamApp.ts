/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { SamCliInitInvocation } from '../../shared/sam/cli/samCliInit'
import { CreateNewSamAppWizard } from '../wizards/samInitWizard'

export async function createNewSamApp() {
    const config = await new CreateNewSamAppWizard().run()
    if (config) {
        const invocation = new SamCliInitInvocation(config)
        await invocation.execute()
        // TODO: If the user selected a location outside of the current workspace,
        // should we add it as an additional workspace folder?
    }
}

/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as path from 'path'
import * as vscode from 'vscode'
import { SamCliInitInvocation } from '../../shared/sam/cli/samCliInit'
import { CreateNewSamAppWizard } from '../wizards/samInitWizard'

export async function createNewSamApp() {
    const config = await new CreateNewSamAppWizard().run()
    if (config) {
        const invocation = new SamCliInitInvocation(config)
        await invocation.execute()

        vscode.workspace.updateWorkspaceFolders(
            vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders.length : 0,
            0,
            {
                uri: config.location,
                name: path.basename(config.location.fsPath)
            }
        )
    }
}

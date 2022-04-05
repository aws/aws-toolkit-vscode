/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Commands } from '../../../shared/vscode/commands'

export async function OpenConsolasSettings(commands = Commands.vscode()): Promise<void> {
    commands.execute('workbench.action.openSettings')
}

/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Window } from '../../shared/vscode/window'
import { copyToClipboard, Env } from '../../shared/vscode/env'
import { recordDynamicresourceCopyIdentifier } from '../../shared/telemetry/telemetry'

export async function copyIdentifier(
    typeName: string,
    identifier: string,
    window = Window.vscode(),
    env = Env.vscode()
) {
    copyToClipboard(identifier, 'identifier', window, env)
    recordDynamicresourceCopyIdentifier({ resourceType: typeName })
}

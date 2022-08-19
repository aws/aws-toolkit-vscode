/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Window } from '../../shared/vscode/window'
import { Env } from '../../shared/vscode/env'
import { copyToClipboard } from '../../shared/utilities/messages'
import { telemetry } from '../../shared/telemetry/spans'

export async function copyIdentifier(
    typeName: string,
    identifier: string,
    window = Window.vscode(),
    env = Env.vscode()
) {
    copyToClipboard(identifier, 'identifier', window, env)
    telemetry.dynamicresource_copyIdentifier.emit({ resourceType: typeName })
}

/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Env } from '../../shared/vscode/env'
import { copyToClipboard } from '../../shared/utilities/messages'
import { telemetry } from '../../shared/telemetry/telemetry'

export async function copyIdentifier(typeName: string, identifier: string, env = Env.vscode()) {
    copyToClipboard(identifier, 'identifier', env)
    telemetry.dynamicresource_copyIdentifier.emit({ resourceType: typeName })
}

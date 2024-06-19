/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { telemetry } from '../../shared/telemetry/telemetry'
import { copyToClipboard } from '../../shared/utilities/messages'

export async function copyIdentifier(typeName: string, identifier: string) {
    await copyToClipboard(identifier, 'identifier')
    telemetry.dynamicresource_copyIdentifier.emit({ resourceType: typeName })
}

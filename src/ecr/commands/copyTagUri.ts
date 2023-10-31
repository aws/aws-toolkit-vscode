/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { EcrTagNode } from '../explorer/ecrTagNode'
import { copyToClipboard } from '../../shared/utilities/messages'
import { telemetry } from '../../shared/telemetry/telemetry'

export async function copyTagUri(node: EcrTagNode): Promise<void> {
    const uri = `${node.repository.repositoryUri}:${node.tag}`
    await copyToClipboard(uri, 'URI')
    telemetry.ecr_copyTagUri.emit()
}

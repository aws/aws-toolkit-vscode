/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Window } from '../../shared/vscode/window'
import { Env } from '../../shared/vscode/env'
import { addCodiconToString } from '../../shared/utilities/textUtilities'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { COPY_TO_CLIPBOARD_INFO_TIMEOUT_MS } from '../../shared/constants'
import { recordDynamicresourceCopyIdentifier } from '../../shared/telemetry/telemetry'

export async function copyIdentifier(
    typeName: string,
    identifier: string,
    window = Window.vscode(),
    env = Env.vscode()
) {
    await env.clipboard.writeText(identifier)
    window.setStatusBarMessage(
        addCodiconToString(
            'clippy',
            `${localize('AWS.explorerNode.copiedToClipboard', 'Copied {0} to clipboard', 'Identifier')}: ${identifier}`
        ),
        COPY_TO_CLIPBOARD_INFO_TIMEOUT_MS
    )

    recordDynamicresourceCopyIdentifier({ resourceType: typeName })
}

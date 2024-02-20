/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { window } from 'vscode'
import { CodeReference } from '../connector/connector'
import { ReferenceLogViewProvider } from '../../../codewhisperer/service/referenceLogViewProvider'

export class ReferenceLogController {
    public addReferenceLog(codeReference: CodeReference[] | undefined, code: string) {
        const editor = window.activeTextEditor
        if (codeReference !== undefined && editor !== undefined) {
            const referenceLog = ReferenceLogViewProvider.getReferenceLog(code, codeReference, editor)
            ReferenceLogViewProvider.instance.addReferenceLog(referenceLog)
        }
    }
}

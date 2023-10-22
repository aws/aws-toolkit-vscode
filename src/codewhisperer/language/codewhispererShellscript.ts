/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { CodewhispererLanguage } from '../../shared/telemetry/telemetry'
import { CodeWhispererProgrammingLanguage } from './codewhispererProgrammingLanguage'

export class CodeWhispererShellscript extends CodeWhispererProgrammingLanguage {
    id: CodewhispererLanguage = 'shell'

    toCodeWhispererRuntimeLanguage(): CodeWhispererProgrammingLanguage {
        return this
    }

    isCodeCompletionSupported(): boolean {
        return true
    }

    isCodeScanSupported(): boolean {
        return false
    }
}

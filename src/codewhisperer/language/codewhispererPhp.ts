/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { CodewhispererLanguage } from '../../shared/telemetry/telemetry'
import { CodeWhispererProgrammingLanguage } from './codewhispererProgrammingLanguage'

export class CodeWhispererPhp extends CodeWhispererProgrammingLanguage {
    id: CodewhispererLanguage = 'php'

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

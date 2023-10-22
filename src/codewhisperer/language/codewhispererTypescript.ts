/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { CodewhispererLanguage } from '../../shared/telemetry/telemetry'
import { CodeWhispererProgrammingLanguage } from './codewhispererProgrammingLanguage'

export class CodeWhispererTypescript extends CodeWhispererProgrammingLanguage {
    id: CodewhispererLanguage = 'typescript'

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

export class CodeWhispererTsx extends CodeWhispererProgrammingLanguage {
    id: CodewhispererLanguage = 'tsx'

    toCodeWhispererRuntimeLanguage(): CodeWhispererProgrammingLanguage {
        return new CodeWhispererTypescript()
    }

    isCodeCompletionSupported(): boolean {
        return true
    }

    isCodeScanSupported(): boolean {
        return false
    }
}

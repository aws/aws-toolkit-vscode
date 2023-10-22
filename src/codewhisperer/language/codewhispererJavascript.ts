/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { CodewhispererLanguage } from '../../shared/telemetry/telemetry.gen'
import { CodeWhispererProgrammingLanguage } from './codewhispererProgrammingLanguage'

export class CodeWhispererJavascript extends CodeWhispererProgrammingLanguage {
    id: CodewhispererLanguage = 'javascript'

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

export class CodeWhispererJsx extends CodeWhispererProgrammingLanguage {
    id: CodewhispererLanguage = 'jsx'

    toCodeWhispererRuntimeLanguage(): CodeWhispererProgrammingLanguage {
        return new CodeWhispererJavascript()
    }

    isCodeCompletionSupported(): boolean {
        return true
    }

    isCodeScanSupported(): boolean {
        return false
    }
}

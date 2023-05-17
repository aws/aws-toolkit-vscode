// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.language.languages

import software.aws.toolkits.jetbrains.services.codewhisperer.language.CodeWhispererProgrammingLanguage
import software.aws.toolkits.telemetry.CodewhispererLanguage

class CodeWhispererJavaScript private constructor() : CodeWhispererProgrammingLanguage() {
    override val languageId: String = ID

    override fun toTelemetryType(): CodewhispererLanguage = CodewhispererLanguage.Javascript

    override fun isCodeCompletionSupported(): Boolean = true

    override fun isImportAdderSupported(): Boolean = true

    override fun isClassifierSupported(): Boolean = true

    companion object {
        const val ID = "javascript"

        val INSTANCE = CodeWhispererJavaScript()
    }
}

// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.language.languages

import software.aws.toolkits.jetbrains.services.codewhisperer.language.CodeWhispererProgrammingLanguage
import software.aws.toolkits.telemetry.CodewhispererLanguage

class CodeWhispererGo private constructor() : CodeWhispererProgrammingLanguage() {
    override val languageId: String = ID

    override fun toTelemetryType(): CodewhispererLanguage = CodewhispererLanguage.Go

    override fun isCodeCompletionSupported(): Boolean = true

    override fun isCodeScanSupported(): Boolean = true

    override fun isAutoFileScanSupported(): Boolean = true

    companion object {
        const val ID = "go"

        val INSTANCE = CodeWhispererGo()
    }
}

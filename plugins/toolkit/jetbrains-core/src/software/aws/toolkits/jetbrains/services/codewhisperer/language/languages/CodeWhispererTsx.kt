// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.language.languages

import software.aws.toolkits.jetbrains.services.codewhisperer.language.CodeWhispererProgrammingLanguage
import software.aws.toolkits.jetbrains.services.codewhisperer.util.FileCrawler
import software.aws.toolkits.jetbrains.services.codewhisperer.util.TypescriptCodeWhispererFileCrawler
import software.aws.toolkits.telemetry.CodewhispererLanguage

class CodeWhispererTsx private constructor() : CodeWhispererProgrammingLanguage() {
    override val languageId: String = ID
    override val fileCrawler: FileCrawler = TypescriptCodeWhispererFileCrawler

    override fun toTelemetryType(): CodewhispererLanguage = CodewhispererLanguage.Tsx

    override fun isCodeCompletionSupported(): Boolean = true

    override fun toCodeWhispererRuntimeLanguage(): CodeWhispererProgrammingLanguage = CodeWhispererTypeScript.INSTANCE

    override fun isSupplementalContextSupported() = true

    companion object {
        const val ID = "tsx"

        val INSTANCE = CodeWhispererTsx()
    }
}

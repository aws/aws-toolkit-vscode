// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.language.languages

import software.aws.toolkits.jetbrains.services.codewhisperer.language.CodeWhispererProgrammingLanguage
import software.aws.toolkits.jetbrains.services.codewhisperer.util.FileCrawler
import software.aws.toolkits.jetbrains.services.codewhisperer.util.TypescriptCodeWhispererFileCrawler
import software.aws.toolkits.telemetry.CodewhispererLanguage

class CodeWhispererTypeScript private constructor() : CodeWhispererProgrammingLanguage() {
    override val languageId: String = ID
    override val fileCrawler: FileCrawler = TypescriptCodeWhispererFileCrawler

    override fun toTelemetryType(): CodewhispererLanguage = CodewhispererLanguage.Typescript

    override fun isCodeCompletionSupported(): Boolean = true

    override fun isSupplementalContextSupported() = true

    companion object {
        const val ID = "typescript"

        val INSTANCE = CodeWhispererTypeScript()
    }
}

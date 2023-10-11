// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.language.languages

import software.aws.toolkits.jetbrains.services.codewhisperer.language.CodeWhispererProgrammingLanguage
import software.aws.toolkits.jetbrains.services.codewhisperer.util.FileCrawler
import software.aws.toolkits.jetbrains.services.codewhisperer.util.JavaCodeWhispererFileCrawler
import software.aws.toolkits.telemetry.CodewhispererLanguage

class CodeWhispererJava private constructor() : CodeWhispererProgrammingLanguage() {
    override val languageId: String = ID
    override val fileCrawler: FileCrawler = JavaCodeWhispererFileCrawler

    override fun toTelemetryType(): CodewhispererLanguage = CodewhispererLanguage.Java

    override fun isCodeCompletionSupported(): Boolean = true

    override fun isCodeScanSupported(): Boolean = true

    override fun isImportAdderSupported(): Boolean = true

    override fun isSupplementalContextSupported() = true

    override fun isUTGSupported() = true

    companion object {
        const val ID = "java"

        val INSTANCE = CodeWhispererJava()
    }
}

// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.language.languages

import software.aws.toolkits.jetbrains.services.codewhisperer.language.CodeWhispererProgrammingLanguage
import software.aws.toolkits.jetbrains.services.codewhisperer.util.FileCrawler
import software.aws.toolkits.jetbrains.services.codewhisperer.util.PythonCodeWhispererFileCrawler
import software.aws.toolkits.telemetry.CodewhispererLanguage

class CodeWhispererPython private constructor() : CodeWhispererProgrammingLanguage() {
    override val languageId = ID
    override val fileCrawler: FileCrawler = PythonCodeWhispererFileCrawler

    override fun toTelemetryType(): CodewhispererLanguage = CodewhispererLanguage.Python

    override fun isCodeCompletionSupported(): Boolean = true

    override fun isCodeScanSupported(): Boolean = true

    override fun isAutoFileScanSupported(): Boolean = true

    override fun isImportAdderSupported(): Boolean = true

    override fun isUTGSupported() = true

    override fun isSupplementalContextSupported() = true

    companion object {
        const val ID = "python"

        val INSTANCE = CodeWhispererPython()
    }
}

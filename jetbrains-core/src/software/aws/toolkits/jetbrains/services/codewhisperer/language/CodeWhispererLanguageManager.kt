// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.language

import com.intellij.openapi.components.service
import software.aws.toolkits.telemetry.CodewhispererLanguage

class CodeWhispererLanguageManager {
    fun isLanguageSupported(language: String): Boolean =
        language == CodewhispererLanguage.Java.toString() ||
            language == CodewhispererLanguage.Python.toString() ||
            language == CodewhispererLanguage.Javascript.toString()

    companion object {
        fun getInstance(): CodeWhispererLanguageManager = service()
    }
}

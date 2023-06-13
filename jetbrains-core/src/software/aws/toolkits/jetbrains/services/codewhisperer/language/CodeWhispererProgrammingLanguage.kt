// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.language

import software.aws.toolkits.telemetry.CodewhispererLanguage

/**
 * Any subclass of CodeWhispererProgrammingLanguage should have private constructor
 */
abstract class CodeWhispererProgrammingLanguage {
    abstract val languageId: String

    abstract fun toTelemetryType(): CodewhispererLanguage

    open fun isCodeCompletionSupported(): Boolean = false

    open fun isCodeScanSupported(): Boolean = false

    open fun isImportAdderSupported(): Boolean = false

    open fun isClassifierSupported(): Boolean = false

    open fun isAllClassifier(): Boolean = false

    open fun isSupplementalContextSupported(): Boolean = false

    open fun isUTGSupported(): Boolean = false

    open fun toCodeWhispererRuntimeLanguage(): CodeWhispererProgrammingLanguage = this

    final override fun equals(other: Any?): Boolean {
        if (other !is CodeWhispererProgrammingLanguage) return false
        return this.languageId == other.languageId
    }

    /**
     * we want to force CodeWhispererProgrammingLanguage(any language implement it) be singleton,
     * override hashCode is the backup plan if another object is being created
     */
    final override fun hashCode(): Int = this.languageId.hashCode()
}

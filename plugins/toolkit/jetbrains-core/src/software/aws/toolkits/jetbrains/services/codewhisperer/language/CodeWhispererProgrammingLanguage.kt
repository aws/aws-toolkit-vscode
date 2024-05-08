// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.language

import software.aws.toolkits.jetbrains.services.codewhisperer.util.FileCrawler
import software.aws.toolkits.jetbrains.services.codewhisperer.util.NoOpFileCrawler
import software.aws.toolkits.telemetry.CodewhispererLanguage

/**
 * Interface defining CodeWhisperer's feature support on language levels, note that the expectation is not aligning with the IDE's behavior. That being said,
 * on Intellij Community, users are still able to trigger CodeWhisperer service on .js .ts files whereas the IDE doesn't recognize the .js .ts file type.
 * Specifically, any implementation leveraging JetBrains' language support, for example [PyFile], [ClassOwner] should live in their corresponding module or
 * extension point otherwise it will result in dependency problem at runtime. For example, JS/TS is only supported in Intellij Ultimate thus it should live in
 * "Ultimate" module if the implementation is utilizing JetBrains JS/TS APIs.
 *
 * Any subclass of CodeWhispererProgrammingLanguage should have private constructor
 */
abstract class CodeWhispererProgrammingLanguage {
    abstract val languageId: String
    open val fileCrawler: FileCrawler = NoOpFileCrawler()

    abstract fun toTelemetryType(): CodewhispererLanguage

    open fun isCodeCompletionSupported(): Boolean = false

    open fun isCodeScanSupported(): Boolean = false

    open fun isAutoFileScanSupported(): Boolean = false

    open fun isImportAdderSupported(): Boolean = false

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

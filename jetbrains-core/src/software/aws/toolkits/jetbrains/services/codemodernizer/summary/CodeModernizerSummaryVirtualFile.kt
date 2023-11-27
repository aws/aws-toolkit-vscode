// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer.summary

import com.intellij.testFramework.LightVirtualFile
import software.aws.toolkits.resources.message

class CodeModernizerSummaryVirtualFile : LightVirtualFile(message("codemodernizer.migration_summary.header.title")) {
    override fun getPresentableName(): String = message("codemodernizer.migration_summary.header.title")

    override fun getPath(): String = "transformationSummary"

    override fun isWritable(): Boolean = false

    // This along with hashCode() is to make sure only one editor for this is opened at a time
    override fun equals(other: Any?) = other is CodeModernizerSummaryVirtualFile && this.hashCode() == other.hashCode()

    override fun hashCode(): Int = presentableName.hashCode()
}

// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.learn

import com.intellij.openapi.fileTypes.FileType
import com.intellij.testFramework.LightVirtualFile
import icons.AwsIcons

/**
 * Light virtual file to represent a Learn CodeWhisperer tutorial file, used to open the custom editor
 */
class LearnCodeWhispererVirtualFile : LightVirtualFile("Examples: Amazon Q inline code suggestions") {
    override fun getPresentableName(): String = "Examples: Amazon Q inline code suggestions"

    override fun getPath(): String = "learnCodeWhisperer"

    override fun isWritable(): Boolean = false

    // This along with hashCode() is to make sure only one editor for this is opened at a time
    override fun equals(other: Any?) = other is LearnCodeWhispererVirtualFile && this.hashCode() == other.hashCode()

    override fun hashCode(): Int = presentableName.hashCode()

    override fun getFileType() = QFileType()
}

class QFileType : FileType {
    override fun getName() = "Learn Q Inline Suggestions"
    override fun getDescription() = "Learn Q inline suggestions"

    override fun getDefaultExtension() = ""
    override fun getIcon() = AwsIcons.Logos.AWS_Q_GRADIENT_SMALL

    override fun isBinary() = false
}

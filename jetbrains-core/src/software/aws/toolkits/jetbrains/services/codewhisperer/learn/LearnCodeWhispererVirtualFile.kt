// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.learn

import com.intellij.testFramework.LightVirtualFile

/**
 * Light virtual file to represent a Learn CodeWhisperer tutorial file, used to open the custom editor
 */
class LearnCodeWhispererVirtualFile : LightVirtualFile("Learn CodeWhisperer") {
    override fun getPresentableName(): String = "Learn CodeWhisperer"

    override fun getPath(): String = "learnCodeWhisperer"

    override fun isWritable(): Boolean = false

    // This along with hashCode() is to make sure only one editor for this is opened at a time
    override fun equals(other: Any?) = other is LearnCodeWhispererVirtualFile && this.hashCode() == other.hashCode()

    override fun hashCode(): Int = presentableName.hashCode()
}

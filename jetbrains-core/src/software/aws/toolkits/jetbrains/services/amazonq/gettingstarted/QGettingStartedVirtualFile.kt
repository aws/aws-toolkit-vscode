// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonq.gettingstarted

import com.intellij.testFramework.LightVirtualFile
import software.aws.toolkits.resources.message

class QGettingStartedVirtualFile : LightVirtualFile(
    message("q.onboarding.title")
) {
    override fun toString() = "QGettingStartedVirtualFile[${getName()}]"
    override fun getPath() = getName()
    override fun isWritable() = false
    override fun isDirectory() = false

    override fun hashCode() = toString().hashCode()
    override fun equals(other: Any?) = other is QGettingStartedVirtualFile && name == other.name
}

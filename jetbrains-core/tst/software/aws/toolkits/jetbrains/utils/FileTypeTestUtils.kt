// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.runWriteActionAndWait
import com.intellij.openapi.fileTypes.FileType
import com.intellij.openapi.fileTypes.FileTypeManager
import com.intellij.openapi.util.Disposer

fun associateFilePattern(fileType: FileType, pattern: String, parentDisposable: Disposable) {
    val fileTypeManager = FileTypeManager.getInstance()
    runWriteActionAndWait {
        fileTypeManager.associatePattern(fileType, pattern)
    }
    Disposer.register(parentDisposable) {
        runWriteActionAndWait {
            fileTypeManager.removeAssociation(fileType, FileTypeManager.parseFromString(pattern))
        }
    }
}

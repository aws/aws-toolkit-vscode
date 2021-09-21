// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.progress.ProgressManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.ThrowableComputable

// There is a new/experimental API in IJ SDK, but replicate a simpler one here till we can use it
fun assertIsNonDispatchThread() {
    if (!ApplicationManager.getApplication().isDispatchThread) return
    throw RuntimeException("Access from event dispatch thread is not allowed.")
}

fun <T> runUnderProgressIfNeeded(project: Project?, title: String, cancelable: Boolean, task: () -> T): T =
    if (ApplicationManager.getApplication().isDispatchThread) {
        ProgressManager.getInstance().runProcessWithProgressSynchronously(ThrowableComputable { task.invoke() }, title, cancelable, project)
    } else {
        task.invoke()
    }

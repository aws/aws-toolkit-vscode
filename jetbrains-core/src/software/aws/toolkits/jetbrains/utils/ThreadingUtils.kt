// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.progress.ProgressManager
import com.intellij.openapi.progress.util.ProgressIndicatorUtils
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Ref
import com.intellij.openapi.util.ThrowableComputable
import com.intellij.util.ExceptionUtil
import com.intellij.util.concurrency.AppExecutorUtil
import com.intellij.util.concurrency.Semaphore
import java.time.Duration
import java.util.concurrent.TimeUnit

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

fun <T> computeOnEdt(modalityState: ModalityState = ModalityState.any(), supplier: () -> T): T {
    val application = ApplicationManager.getApplication()
    if (application.isDispatchThread) {
        return supplier.invoke()
    }
    val indicator = ProgressManager.getInstance().progressIndicator
    val semaphore = Semaphore(1)
    val result = Ref.create<T>()
    val error = Ref.create<Throwable>()
    val runnable = Runnable {
        try {
            if (indicator == null || !indicator.isCanceled) {
                result.set(supplier.invoke())
            }
        } catch (ex: Throwable) {
            error.set(ex)
        } finally {
            semaphore.up()
        }
    }

    ApplicationManager.getApplication().invokeLater(runnable, modalityState)

    ProgressIndicatorUtils.awaitWithCheckCanceled(semaphore, indicator)
    ExceptionUtil.rethrowAllAsUnchecked(error.get())

    return result.get()
}

fun sleepWithCancellation(sleepAmount: Duration, indicator: ProgressIndicator?) {
    val semaphore = Semaphore(1)
    val future = AppExecutorUtil.getAppScheduledExecutorService().schedule(
        { semaphore.up() },
        sleepAmount.toMillis(),
        TimeUnit.MILLISECONDS
    )
    try {
        ProgressIndicatorUtils.awaitWithCheckCanceled(semaphore, indicator)
    } finally {
        future.cancel(true)
    }
}

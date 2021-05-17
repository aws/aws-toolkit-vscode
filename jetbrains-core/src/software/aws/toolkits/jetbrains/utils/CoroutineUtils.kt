// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.AppUIExecutor
import com.intellij.openapi.application.ExpirableExecutor
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.application.impl.coroutineDispatchingContext
import com.intellij.util.concurrency.AppExecutorUtil

fun getCoroutineUiContext(
    modalityState: ModalityState = ModalityState.defaultModalityState(),
    disposable: Disposable? = null
) = AppUIExecutor.onUiThread(modalityState).also { exec ->
    disposable?.let {
        exec.expireWith(disposable)
    }
}.coroutineDispatchingContext()

fun getCoroutineBgContext(
    disposable: Disposable? = null
) = ExpirableExecutor.on(AppExecutorUtil.getAppExecutorService()).also { exec ->
    disposable?.let {
        exec.expireWith(disposable)
    }
}.coroutineDispatchingContext()

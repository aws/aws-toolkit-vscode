// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils

import com.intellij.openapi.application.AppUIExecutor
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.application.impl.coroutineDispatchingContext
import com.intellij.util.concurrency.AppExecutorUtil
import kotlinx.coroutines.asCoroutineDispatcher
import kotlin.coroutines.CoroutineContext

fun getCoroutineUiContext(modalityState: ModalityState = ModalityState.defaultModalityState()): CoroutineContext =
    AppUIExecutor.onUiThread(modalityState).coroutineDispatchingContext()

fun getCoroutineBgContext(): CoroutineContext = AppExecutorUtil.getAppExecutorService().asCoroutineDispatcher()

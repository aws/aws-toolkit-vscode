// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.coroutines

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.ModalityState
import com.intellij.util.concurrency.AppExecutorUtil
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.asCoroutineDispatcher
import kotlin.coroutines.AbstractCoroutineContextElement
import kotlin.coroutines.CoroutineContext

// https://github.com/JetBrains/intellij-community/blob/375a130e119e5550972f65fafea2335dfffa28e3/platform/core-api/src/com/intellij/openapi/application/coroutines.kt#L134-L151
fun ModalityState.asContextElement(): CoroutineContext.Element = ModalityStateElement(this)

private class ModalityStateElement(val modalityState: ModalityState) : AbstractCoroutineContextElement(ModalityStateElementKey)

private object ModalityStateElementKey : CoroutineContext.Key<ModalityStateElement>

fun getCoroutineUiContext(): CoroutineContext = EdtCoroutineDispatcher
private object EdtCoroutineDispatcher : CoroutineDispatcher() {
    override fun dispatch(context: CoroutineContext, block: Runnable) {
        val state = context[ModalityStateElementKey]?.modalityState ?: ModalityState.any()
        ApplicationManager.getApplication().invokeLater(block, state)
    }
}

fun getCoroutineBgContext(): CoroutineContext = AppExecutorUtil.getAppExecutorService().asCoroutineDispatcher()

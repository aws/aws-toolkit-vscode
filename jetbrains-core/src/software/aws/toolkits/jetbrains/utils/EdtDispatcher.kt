// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.ModalityState
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.MainCoroutineDispatcher
import kotlin.coroutines.AbstractCoroutineContextElement
import kotlin.coroutines.CoroutineContext

val Dispatchers.Edt: EdtDispatcher
    get() = software.aws.toolkits.jetbrains.utils.Edt

/**
 * Same as Dispatchers.Swing, but uses IDE's EDT invoker instead and supports modality state
 */
sealed class EdtDispatcher : MainCoroutineDispatcher() {
    override fun dispatch(context: CoroutineContext, block: Runnable) {
        val modalityState = context[ModalityStateElement.Key]?.modalityState ?: ModalityState.defaultModalityState()
        ApplicationManager.getApplication().invokeLater(block, modalityState)
    }

    class ModalityStateElement(val modalityState: ModalityState) : AbstractCoroutineContextElement(Key) {
        companion object Key : CoroutineContext.Key<ModalityStateElement>
    }
}

private object EdtImmediate : EdtDispatcher() {
    override val immediate: MainCoroutineDispatcher
        get() = this

    @ExperimentalCoroutinesApi
    override fun isDispatchNeeded(context: CoroutineContext): Boolean = !ApplicationManager.getApplication().isDispatchThread

    override fun toString() = "Edt [immediate]"
}

private object Edt : EdtDispatcher() {
    override val immediate: MainCoroutineDispatcher
        get() = EdtImmediate

    override fun toString() = "Edt"
}

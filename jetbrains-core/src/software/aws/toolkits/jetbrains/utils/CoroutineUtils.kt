// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.AppUIExecutor
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.application.impl.coroutineDispatchingContext

fun getCoroutineUiContext(
    modalityState: ModalityState = ModalityState.defaultModalityState(),
    disposable: Disposable? = null
) = AppUIExecutor.onUiThread(modalityState).let {
        if (disposable == null) {
            it
        } else {
            it.expireWith(disposable)
        }
    }.coroutineDispatchingContext()

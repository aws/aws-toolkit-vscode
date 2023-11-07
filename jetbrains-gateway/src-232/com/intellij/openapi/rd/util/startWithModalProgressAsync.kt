// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
@file:Suppress("Filename")
package com.intellij.openapi.rd.util

import com.intellij.platform.ide.progress.ModalTaskOwner
import com.intellij.platform.ide.progress.TaskCancellation

@Suppress("UnusedParameter")
public fun <T> com.jetbrains.rd.util.lifetime.Lifetime.startWithModalProgressAsync(
    owner: ModalTaskOwner,
    title: String,
    cancellation: TaskCancellation,
    action: suspend com.intellij.openapi.rd.util.ProgressCoroutineScope.() -> T
) = startUnderModalProgressAsync(
    title = title,
    isIndeterminate = false,
    canBeCancelled = cancellation is com.intellij.openapi.progress.TaskCancellation.Cancellable,
    action = action
)

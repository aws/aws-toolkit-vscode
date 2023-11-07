// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
@file:Suppress("Filename")
package com.intellij.platform.util.progress

public suspend fun <T> indeterminateStep(
    text: @com.intellij.openapi.util.NlsContexts.ProgressText kotlin.String?,
    action: suspend kotlinx.coroutines.CoroutineScope.() -> T
) = com.intellij.openapi.progress.indeterminateStep(text, action)

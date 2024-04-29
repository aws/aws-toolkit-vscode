// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package com.intellij.platform.ide.progress

import com.intellij.openapi.project.Project
import com.intellij.openapi.util.NlsContexts.ProgressTitle
import kotlinx.coroutines.CoroutineScope

suspend fun <T> withBackgroundProgress(
    project: Project,
    title: @ProgressTitle String,
    action: suspend CoroutineScope.() -> T
): T = com.intellij.openapi.progress.withBackgroundProgress(project, title, action)

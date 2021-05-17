// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils

import com.intellij.openapi.Disposable
import kotlinx.coroutines.CoroutineName
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob

/**
 * A supervisor coroutine scope that runs everything on the application thread pool.
 *
 * see: [com.intellij.openapi.application.Application.executeOnPooledThread]
 */
class ApplicationThreadPoolScope(coroutineName: String, disposable: Disposable? = null) : CoroutineScope {
    override val coroutineContext = SupervisorJob() + getCoroutineBgContext(disposable) + CoroutineName(coroutineName)
}

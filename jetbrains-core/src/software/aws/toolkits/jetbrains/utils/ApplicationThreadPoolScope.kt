// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils

import com.intellij.openapi.Disposable
import com.intellij.openapi.util.Disposer
import kotlinx.coroutines.CoroutineName
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlin.coroutines.CoroutineContext

/**
 * A supervisor coroutine scope that runs everything on the application thread pool.
 *
 * see: [com.intellij.openapi.application.Application.executeOnPooledThread]
 */
class ApplicationThreadPoolScope : CoroutineScope {
    @Deprecated("Always pass Disposable")
    constructor(coroutineName: String) {
        this.coroutineContext = SupervisorJob() + getCoroutineBgContext() + CoroutineName(coroutineName)
    }

    constructor(coroutineName: String, disposable: Disposable) {
        this.coroutineContext = SupervisorJob() + getCoroutineBgContext() + CoroutineName(coroutineName)
        Disposer.register(disposable) { cancel("Parent disposable was disposed") }
    }

    override val coroutineContext: CoroutineContext
}

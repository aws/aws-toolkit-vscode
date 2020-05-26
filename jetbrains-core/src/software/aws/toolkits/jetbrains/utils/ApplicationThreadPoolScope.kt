// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils

import com.intellij.application.ApplicationThreadPool
import kotlinx.coroutines.CoroutineName
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob

/**
 * A supervisor coroutine scope that runs everything on the application thread pool.
 *
 * see: [com.intellij.openapi.application.Application.executeOnPooledThread]
 */
class ApplicationThreadPoolScope(coroutineName: String) : CoroutineScope {
    // Dispatchers.ApplicationThreadPool Requires MIN 193.1822. However we cannot set our IDE min to that because not all JB IDEs use the same build numbers
    override val coroutineContext = SupervisorJob() + Dispatchers.ApplicationThreadPool + CoroutineName(coroutineName)
}

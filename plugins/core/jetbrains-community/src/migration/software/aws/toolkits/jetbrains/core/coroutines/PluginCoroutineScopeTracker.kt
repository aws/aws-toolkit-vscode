// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package migration.software.aws.toolkits.jetbrains.core.coroutines

import com.intellij.openapi.Disposable
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import kotlinx.coroutines.CoroutineName
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.ThreadContextElement
import kotlinx.coroutines.cancel
import software.aws.toolkits.jetbrains.core.coroutines.getCoroutineBgContext
import software.aws.toolkits.jetbrains.services.telemetry.PluginResolver
import java.util.concurrent.CancellationException
import kotlin.coroutines.CoroutineContext

class PluginCoroutineScopeTracker : Disposable {
    @PublishedApi
    internal fun applicationThreadPoolScope(coroutineName: String): CoroutineScope = BackgroundThreadPoolScope(coroutineName, this)

    override fun dispose() {}

    companion object {
        fun getInstance() = service<PluginCoroutineScopeTracker>()
        fun getInstance(project: Project) = project.service<PluginCoroutineScopeTracker>()
    }
}

private class BackgroundThreadPoolScope(coroutineName: String, disposable: Disposable) : CoroutineScope {
    override val coroutineContext = SupervisorJob() +
        CoroutineName(coroutineName) +
        getCoroutineBgContext() +
        PluginResolverThreadContextElement(PluginResolver.fromCurrentThread())

    init {
        Disposer.register(disposable) {
            coroutineContext.cancel(CancellationException("Parent disposable was disposed"))
        }
    }
}

private class PluginResolverThreadContextElement(val pluginResolver: PluginResolver) : ThreadContextElement<PluginResolver> {
    companion object Key : CoroutineContext.Key<PluginResolverThreadContextElement>

    override val key = Key

    override fun updateThreadContext(context: CoroutineContext): PluginResolver {
        val oldPluginResolver = PluginResolver.fromCurrentThread()
        PluginResolver.setThreadLocal(pluginResolver)
        return oldPluginResolver
    }

    override fun restoreThreadContext(context: CoroutineContext, oldState: PluginResolver) {
        PluginResolver.setThreadLocal(oldState)
    }
}

// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core

import com.intellij.openapi.Disposable
import com.intellij.openapi.components.ServiceManager
import com.intellij.openapi.project.Project
import com.intellij.util.containers.ContainerUtil
import software.aws.toolkits.jetbrains.utils.ApplicationThreadPoolScope

class ProjectLevelCoroutineScopeTracker(
    @Suppress("unused")
    private val project: Project
) : Disposable {
    private val scopes: MutableMap<String, ApplicationThreadPoolScope> = ContainerUtil.createConcurrentWeakValueMap()
    fun applicationThreadPoolScope(coroutineName: String): ApplicationThreadPoolScope =
        scopes.computeIfAbsent(coroutineName) { ApplicationThreadPoolScope(coroutineName, this) }

    override fun dispose() { }

    companion object {
        fun getInstance(project: Project) = ServiceManager.getService(project, ProjectLevelCoroutineScopeTracker::class.java)
    }
}

fun Project.applicationThreadPoolScope(coroutineName: String) = ProjectLevelCoroutineScopeTracker.getInstance(this).applicationThreadPoolScope(coroutineName)

@Suppress("unused") // T receiver needed to infer type
inline fun <reified T : Any> T.applicationThreadPoolScope(project: Project) = project.applicationThreadPoolScope(T::class.java.name)

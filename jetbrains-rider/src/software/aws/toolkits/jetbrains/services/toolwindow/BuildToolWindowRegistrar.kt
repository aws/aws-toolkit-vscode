// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.toolwindow

import com.intellij.build.BuildViewManager
import com.intellij.openapi.components.ServiceManager
import com.intellij.openapi.project.Project
import com.jetbrains.rdclient.util.idea.LifetimedProjectComponent

/**
 * This component is used to force IDEA Build toolwindow to be registered first since
 * Rider get a tool window if it was already registered.
 */
@Suppress("ComponentNotRegistered")
class BuildToolWindowRegistrar(project: Project) : LifetimedProjectComponent(project) {

    init {
        ServiceManager.getService(project, BuildViewManager::class.java)
    }
}

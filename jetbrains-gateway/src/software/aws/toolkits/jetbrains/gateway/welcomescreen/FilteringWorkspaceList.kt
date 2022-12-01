// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.gateway.welcomescreen

import software.aws.toolkits.jetbrains.gateway.Workspace
import software.aws.toolkits.jetbrains.services.caws.CawsProject

class FilteringWorkspaceList(private val delegate: WorkspaceList, private val predicate: (Workspace) -> Boolean) : WorkspaceList by delegate {
    private val listeners = mutableListOf<Runnable>()
    private var data = emptyMap<CawsProject, List<Workspace>>()

    init {
        delegate.addChangeListener { filterList() }

        filterList()
    }

    private fun filterList() {
        data = delegate.workspaces().entries.mapNotNull { (project, workspaces) ->
            project to workspaces.filter(predicate).toList()
        }.toMap()
        listeners.forEach { it.run() }
    }

    override fun workspaces(): Map<CawsProject, List<Workspace>> = data

    override fun addChangeListener(listener: Runnable) {
        listeners.add(listener)
    }
}

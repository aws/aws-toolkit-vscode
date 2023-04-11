// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.gateway.welcomescreen

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.application.runInEdt
import com.intellij.util.Alarm
import com.intellij.util.AlarmFactory
import software.amazon.awssdk.services.codecatalyst.CodeCatalystClient
import software.amazon.awssdk.services.codecatalyst.model.DevEnvironmentStatus
import software.aws.toolkits.jetbrains.gateway.SourceRepository
import software.aws.toolkits.jetbrains.gateway.Workspace
import software.aws.toolkits.jetbrains.gateway.WorkspaceIdentifier
import software.aws.toolkits.jetbrains.gateway.inProgress
import software.aws.toolkits.jetbrains.gateway.toSourceRepository
import software.aws.toolkits.jetbrains.gateway.toWorkspace
import software.aws.toolkits.jetbrains.services.caws.CawsProject
import software.aws.toolkits.jetbrains.services.caws.listAccessibleProjectsPaginator
import software.aws.toolkits.jetbrains.settings.CawsSpaceTracker
import java.time.Duration
import java.util.concurrent.locks.ReentrantReadWriteLock
import kotlin.concurrent.read
import kotlin.concurrent.write

class WorkspaceDataRetriever(
    private val client: CodeCatalystClient,
    private val spaceName: String
) : WorkspaceList, WorkspaceListStateChangeListener, Disposable {
    private val listeners = mutableListOf<Runnable>()

    private val updateAlarm = AlarmFactory.getInstance().create(Alarm.ThreadToUse.POOLED_THREAD, this)
    private val workspaces = mutableMapOf<CawsProject, MutableMap<WorkspaceIdentifier, Workspace>>()
    private val repositories = mutableMapOf<CawsProject, List<SourceRepository>>()
    private val lock = ReentrantReadWriteLock()
    private val dirtyWorkspaces = mutableSetOf<WorkspaceIdentifier>()

    init {
        ApplicationManager.getApplication().messageBus.connect(this).subscribe(WorkspaceNotifications.TOPIC, this)
    }

    private fun getCachedWorkspace(identifier: WorkspaceIdentifier) =
        workspaces[identifier.project]?.get(identifier)

    private fun updateCachedWorkspace(ws: Workspace) =
        workspaces.computeIfAbsent(ws.identifier.project) { mutableMapOf() }.put(ws.identifier, ws)

    private fun removeCachedWorkspace(ws: Workspace) =
        workspaces[ws.identifier.project]?.remove(ws.identifier)

    private fun loadData() {
        val initialDirty = mutableSetOf<WorkspaceIdentifier>()
        client.listAccessibleProjectsPaginator { it.spaceName(spaceName) }.items()
            .forEach { project ->
                val cawsProject = CawsProject(spaceName, project.name())
                val result = client.listDevEnvironmentsPaginator { it.projectName(project.name()).spaceName(spaceName) }.items()
                    .map { it.toWorkspace(WorkspaceIdentifier(cawsProject, it.id())) }
                    .filterNot { it.status == DevEnvironmentStatus.DELETED || it.status == DevEnvironmentStatus.DELETING }
                    .onEach {
                        if (it.status.inProgress()) {
                            initialDirty.add(it.identifier)
                        }
                    }
                    .associateBy { it.identifier }
                    .toMutableMap()
                workspaces.put(cawsProject, result)

                val repos = client.listSourceRepositoriesPaginator {
                    it.spaceName(spaceName)
                    it.projectName(project.name())
                }.items()
                    .map { it.toSourceRepository() }
                repositories[cawsProject] = repos
            }

        lock.write {
            if (initialDirty.isNotEmpty()) {
                dirtyWorkspaces.addAll(initialDirty)
                scheduleUpdate()
            }
        }
    }

    private fun pollForUpdate() {
        val dirtyWorkspacesSnapshot = dirtyWorkspaces.toList()
        if (dirtyWorkspacesSnapshot.isEmpty()) return

        val updatedWorkspaces = mutableSetOf<Workspace>()
        dirtyWorkspacesSnapshot.forEach { dirtyWorkspace ->
            try {
                val ws = client.getDevEnvironment {
                    it.spaceName(dirtyWorkspace.project.space)
                    it.projectName(dirtyWorkspace.project.project)
                    it.id(dirtyWorkspace.id)
                }.toWorkspace(dirtyWorkspace)
                if (ws == getCachedWorkspace(dirtyWorkspace)) {
                    return@forEach
                }

                updatedWorkspaces.add(ws)
            } catch (e: Exception) {
                dirtyWorkspaces.remove(dirtyWorkspace)
            }
        }

        if (updatedWorkspaces.isNotEmpty()) {
            lock.write {
                updatedWorkspaces.forEach { ws ->
                    if (!ws.status.inProgress()) {
                        dirtyWorkspaces.remove(ws.identifier)
                    }

                    updateCachedWorkspace(ws)
                }
            }

            runInEdt(ModalityState.any()) {
                listeners.forEach { it.run() }
            }
        }

        if (dirtyWorkspaces.isNotEmpty()) {
            scheduleUpdate()
        }
    }

    private fun scheduleUpdate() {
        updateAlarm.addRequest(::pollForUpdate, POLL_INTERVAL_MS, false)
    }

    override fun workspaces() = lock.read {
        workspaces.mapValues { (_, value) ->
            value.values.toList()
        }
    }

    override fun codeRepos() = lock.read {
        repositories
    }

    override fun removeWorkspace(ws: Workspace) {
        lock.write {
            removeCachedWorkspace(ws)
        }
        listeners.forEach { it.run() }
    }

    fun markWorkspaceAsDirty(identifer: WorkspaceIdentifier) {
        if (CawsSpaceTracker.getInstance().lastSpaceName() != identifer.project.space) {
            return
        }
        dirtyWorkspaces.add(identifer)
        updateAlarm.cancelAllRequests()
        pollForUpdate()
    }

    override fun markWorkspaceAsDirty(ws: Workspace) {
        markWorkspaceAsDirty(ws.identifier)
    }

    override fun addChangeListener(listener: Runnable) {
        listeners.add(listener)
    }

    override fun environmentStarted(context: WorkspaceListStateChangeContext) {
        markWorkspaceAsDirty(context.wsId)
    }

    override fun dispose() {
        listeners.clear()
        lock.write {
            workspaces.clear()
            repositories.clear()
        }
    }

    companion object {
        fun createWorkspaceDataRetriever(client: CodeCatalystClient, spaceName: String): WorkspaceDataRetriever =
            WorkspaceDataRetriever(client, spaceName).also {
                it.loadData()
            }

        private val POLL_INTERVAL_MS = Duration.ofSeconds(5).toMillis().toInt()
    }
}

// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.ecr.actions

import com.intellij.docker.agent.OngoingProcess
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.progress.Task
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.ui.SimpleListCellRenderer
import com.intellij.ui.dsl.builder.panel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import software.amazon.awssdk.services.ecr.EcrClient
import software.aws.toolkits.jetbrains.core.awsClient
import software.aws.toolkits.jetbrains.core.coroutines.getCoroutineBgContext
import software.aws.toolkits.jetbrains.core.coroutines.projectCoroutineScope
import software.aws.toolkits.jetbrains.core.docker.DockerRuntimeFacade
import software.aws.toolkits.jetbrains.core.docker.ToolkitDockerAdapter
import software.aws.toolkits.jetbrains.services.ecr.EcrLogin
import software.aws.toolkits.jetbrains.services.ecr.EcrRepositoryNode
import software.aws.toolkits.jetbrains.services.ecr.EcrUtils
import software.aws.toolkits.jetbrains.services.ecr.getDockerLogin
import software.aws.toolkits.jetbrains.services.ecr.resources.EcrResources
import software.aws.toolkits.jetbrains.services.ecr.resources.Repository
import software.aws.toolkits.jetbrains.ui.ResourceSelector
import software.aws.toolkits.resources.message

class PullFromRepositoryAction : EcrDockerAction() {
    override fun actionPerformed(selected: EcrRepositoryNode, e: AnActionEvent) {
        val project = selected.nodeProject
        val dialog = PullFromRepositoryDialog(selected.repository, project)
        val result = dialog.showAndGet()
        if (!result) {
            return
        }

        val (repo, image) = dialog.getPullRequest()
        val client: EcrClient = project.awsClient()
        val scope = projectCoroutineScope(project)
        scope.launch {
            val runtime = scope.dockerServerRuntimeAsync(project).await()
            val authData = withContext(getCoroutineBgContext()) {
                client.authorizationToken.authorizationData().first()
            }
            PullFromEcrTask(project, authData.getDockerLogin(), repo, image, runtime).queue()
        }
    }
}

private class PullFromRepositoryDialog(selectedRepository: Repository, project: Project) : DialogWrapper(project) {
    private val repoSelector = ResourceSelector.builder()
        .resource(EcrResources.LIST_REPOS)
        .customRenderer(SimpleListCellRenderer.create("") { it.repositoryName })
        .awsConnection(project)
        .build()

    private val imageSelector = ResourceSelector.builder()
        .resource {
            repoSelector.selected()?.repositoryName?.let { EcrResources.listTags(it) }
        }
        .disableAutomaticLoading()
        .customRenderer(SimpleListCellRenderer.create("") { it })
        .awsConnection(project)
        .build()

    init {
        repoSelector.addActionListener { imageSelector.reload() }
        repoSelector.selectedItem { it == selectedRepository }
        title = message("ecr.pull.title")
        setOKButtonText(message("ecr.pull.confirm"))

        init()
    }

    override fun createCenterPanel() = panel {
        val widthGroup = "repoTag"
        row(message("ecr.repo.label")) {
            cell(repoSelector).widthGroup(widthGroup).apply {
            }.errorOnApply(message("loading_resource.still_loading")) { it.isLoading }.errorOnApply(message("ecr.repo.not_selected")) { it.selected() == null }
        }

        row(message("ecr.push.remoteTag")) {
            cell(imageSelector).widthGroup(widthGroup).apply {
            }.errorOnApply(message("loading_resource.still_loading")) { it.isLoading }.errorOnApply(message("ecr.image.not_selected")) { it.selected() == null }
        }
    }

    fun getPullRequest() = repoSelector.selected()!! to imageSelector.selected()!!
}

private class PullFromEcrTask(
    project: Project,
    private val ecrLogin: EcrLogin,
    private val repository: Repository,
    private val image: String,
    private val dockerRuntime: DockerRuntimeFacade
) : Task.Backgroundable(project, message("ecr.pull.progress", repository.repositoryUri, image)) {
    private var task: OngoingProcess? = null

    override fun onCancel() {
        super.onCancel()
        task?.cancel()
    }

    override fun run(indicator: ProgressIndicator) {
        indicator.isIndeterminate = true
        val config = EcrUtils.buildDockerRepositoryModel(ecrLogin, repository, image)
        task = ToolkitDockerAdapter(project, dockerRuntime).pullImage(config, indicator).also {
            // don't return until docker process exits
            it.await()
        }
    }
}

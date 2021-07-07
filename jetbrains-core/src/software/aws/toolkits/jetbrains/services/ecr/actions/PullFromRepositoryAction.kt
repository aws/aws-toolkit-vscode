// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.ecr.actions

import com.intellij.docker.DockerServerRuntimeInstance
import com.intellij.docker.agent.OngoingProcess
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.progress.Task
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.ui.SimpleListCellRenderer
import com.intellij.ui.layout.panel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import software.amazon.awssdk.services.ecr.EcrClient
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.core.awsClient
import software.aws.toolkits.jetbrains.services.ecr.EcrLogin
import software.aws.toolkits.jetbrains.services.ecr.EcrRepositoryNode
import software.aws.toolkits.jetbrains.services.ecr.EcrUtils
import software.aws.toolkits.jetbrains.services.ecr.getDockerLogin
import software.aws.toolkits.jetbrains.services.ecr.resources.EcrResources
import software.aws.toolkits.jetbrains.services.ecr.resources.Repository
import software.aws.toolkits.jetbrains.ui.ResourceSelector
import software.aws.toolkits.jetbrains.utils.ApplicationThreadPoolScope
import software.aws.toolkits.jetbrains.utils.getCoroutineBgContext
import software.aws.toolkits.resources.message

class PullFromRepositoryAction : EcrDockerAction() {
    override val coroutineScope = ApplicationThreadPoolScope("PullFromRepositoryAction")

    override fun actionPerformed(selected: EcrRepositoryNode, e: AnActionEvent) {
        val project = selected.nodeProject
        val dialog = PullFromRepositoryDialog(selected.repository, project)
        val result = dialog.showAndGet()
        if (!result) {
            return
        }

        val (repo, image) = dialog.getPullRequest()
        val client: EcrClient = project.awsClient()
        coroutineScope.launch {
            val runtime = dockerServerRuntime.await()
            val authData = withContext(getCoroutineBgContext()) {
                client.authorizationToken.authorizationData().first()
            }
            PullFromEcrTask(project, authData.getDockerLogin(), repo, image, runtime).queue()
        }
    }

    private companion object {
        val LOG = getLogger<PullFromRepositoryAction>()
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
        val sizeGroup = "repoTag"
        row(message("ecr.repo.label")) {
            repoSelector()
                .sizeGroup(sizeGroup)
                .constraints(grow)
                .withErrorOnApplyIf(message("loading_resource.still_loading")) { it.isLoading }
                .withErrorOnApplyIf(message("ecr.repo.not_selected")) { it.selected() == null }
        }

        row(message("ecr.push.remoteTag")) {
            imageSelector()
                .sizeGroup(sizeGroup)
                .constraints(grow)
                .withErrorOnApplyIf(message("loading_resource.still_loading")) { it.isLoading }
                .withErrorOnApplyIf(message("ecr.image.not_selected")) { it.selected() == null }
        }
    }

    fun getPullRequest() = repoSelector.selected()!! to imageSelector.selected()!!
}

private class PullFromEcrTask(
    project: Project,
    private val ecrLogin: EcrLogin,
    private val repository: Repository,
    private val image: String,
    private val runtime: DockerServerRuntimeInstance
) : Task.Backgroundable(project, message("ecr.pull.progress", repository.repositoryUri, image)) {
    private var task: OngoingProcess? = null

    override fun onCancel() {
        super.onCancel()
        task?.cancel()
    }

    override fun run(indicator: ProgressIndicator) {
        indicator.isIndeterminate = true
        val config = EcrUtils.buildDockerRepositoryModel(ecrLogin, repository, image)
        task = EcrUtils.pullImage(project, runtime, config, indicator).also {
            // don't return until docker process exits
            it.await()
        }
    }
}

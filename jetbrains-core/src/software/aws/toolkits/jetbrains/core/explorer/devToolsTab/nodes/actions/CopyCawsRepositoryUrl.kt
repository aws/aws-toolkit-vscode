// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer.devToolsTab.nodes.actions

import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.actionSystem.ComputableActionGroup
import com.intellij.openapi.ide.CopyPasteManager
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.progress.Task
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.popup.JBPopupFactory
import kotlinx.coroutines.future.await
import kotlinx.coroutines.runBlocking
import software.aws.toolkits.core.ClientConnectionSettings
import software.aws.toolkits.jetbrains.core.AwsResourceCache
import software.aws.toolkits.jetbrains.core.credentials.sono.CodeCatalystCredentialManager
import software.aws.toolkits.jetbrains.services.caws.CawsCodeRepository
import software.aws.toolkits.jetbrains.services.caws.CawsResources
import software.aws.toolkits.jetbrains.utils.notifyInfo
import software.aws.toolkits.resources.message
import java.awt.datatransfer.StringSelection

class CopyCawsRepositoryUrl : DumbAwareAction(AllIcons.Actions.Copy) {
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.getRequiredData(CommonDataKeys.PROJECT)
        val cawsConnectionSettings = CodeCatalystCredentialManager.getInstance(project).getConnectionSettings() ?: return

        JBPopupFactory.getInstance().createActionGroupPopup(
            message("caws.copy.url.select_repository"),
            object : ComputableActionGroup.Simple() {
                override fun computeChildren(manager: ActionManager): Array<AnAction> {
                    val cache = AwsResourceCache.getInstance()
                    return runBlocking {
                        val projects = cache.getResource(CawsResources.ALL_PROJECTS, cawsConnectionSettings).await()

                        projects.flatMap { cawsProject ->
                            cache.getResource(CawsResources.codeRepositories(cawsProject), cawsConnectionSettings).await()
                        }.map {
                            object : DumbAwareAction(it.presentableString) {
                                override fun actionPerformed(e: AnActionEvent) {
                                    copyUrl(project, cawsConnectionSettings, it)
                                }
                            }
                        }.toTypedArray()
                    }
                }
            },
            e.dataContext,
            false,
            null,
            5
        )
            .showInBestPositionFor(e.dataContext)
    }

    private fun copyUrl(project: Project, cawsConnectionSettings: ClientConnectionSettings<*>, repository: CawsCodeRepository) {
        object : Task.Backgroundable(project, message("caws.devtoolPanel.fetch.git.url", repository.presentableString)) {
            override fun run(indicator: ProgressIndicator) {
                val url = AwsResourceCache.getInstance()
                    .getResource(CawsResources.cloneUrls(repository), cawsConnectionSettings)
                    .toCompletableFuture()
                    .get()
                CopyPasteManager.getInstance().setContents(StringSelection(url))

                notifyInfo(
                    title = message("action.aws.caws.devtools.actions.copyCloneUrl.text"),
                    content = message("caws.devtoolPanel.git_url_copied"),
                    project = project
                )
            }
        }.queue()
    }
}

// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.gateway.welcomescreen

import com.intellij.ide.DataManager
import com.intellij.ide.browsers.BrowserLauncher
import com.intellij.openapi.actionSystem.DataProvider
import com.intellij.openapi.progress.ProcessCanceledException
import com.intellij.openapi.rd.createNestedDisposable
import com.intellij.openapi.rd.util.launchOnUi
import com.intellij.openapi.util.Disposer
import com.jetbrains.rd.util.lifetime.Lifetime
import software.amazon.awssdk.services.codecatalyst.CodeCatalystClient
import software.aws.toolkits.core.ClientConnectionSettings
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.core.AwsClientManager
import software.aws.toolkits.jetbrains.core.AwsResourceCache
import software.aws.toolkits.jetbrains.core.credentials.AwsBearerTokenConnection
import software.aws.toolkits.jetbrains.core.credentials.ToolkitAuthManager
import software.aws.toolkits.jetbrains.gateway.CawsLoadingPanel
import software.aws.toolkits.jetbrains.gateway.SsoSettings
import software.aws.toolkits.jetbrains.gateway.welcomescreen.WorkspaceDataRetriever.Companion.createWorkspaceDataRetriever
import software.aws.toolkits.jetbrains.services.caws.CawsEndpoints
import software.aws.toolkits.jetbrains.services.caws.CawsResources
import software.aws.toolkits.jetbrains.settings.CawsSpaceTracker
import software.aws.toolkits.resources.message
import java.awt.Component
import javax.swing.JComponent

class ExistingWorkspaces(
    private val setContentCallback: (Component) -> Unit,
    lifetime: Lifetime
) : CawsLoadingPanel(lifetime, setContentCallback), DataProvider {
    private val disposable = lifetime.createNestedDisposable()
    override val title = message("code.aws.workspaces.short")
    override val showSpaceSelector = true

    override fun getComponent() = super.getComponent().also {
        DataManager.registerDataProvider(it, this@ExistingWorkspaces)
    }

    override fun getContent(connectionSettings: ClientConnectionSettings<*>): JComponent {
        val spaces = try {
            AwsResourceCache.getInstance().getResourceNow(CawsResources.ALL_SPACES, connectionSettings)
        } catch (e: Exception) {
            return buildLoadError(e)
        }

        val space = CawsSpaceTracker.getInstance().lastSpaceName()
        if (space == null || space !in spaces) {
            return infoPanel()
                .addLine(message("caws.workspace.details.select_org"))
                .addAction(message("general.get_started")) {
                    BrowserLauncher.instance.browse(CawsEndpoints.ConsoleFactory.baseUrl())
                }
        }

        val ssoSettings: SsoSettings? = ToolkitAuthManager.getInstance().getConnection(connectionSettings.providerId)?.let {
            if (it is AwsBearerTokenConnection) {
                SsoSettings(it.startUrl, it.region)
            } else {
                null
            }
        }

        return try {
            val client = AwsClientManager.getInstance().getClient<CodeCatalystClient>(connectionSettings)
            val workspaces = createWorkspaceDataRetriever(client, space)
            Disposer.register(disposable, workspaces)

            if (workspaces.workspaces().isNotEmpty() || workspaces.codeRepos().isNotEmpty()) {
                WorkspaceListPanel(workspaces, client, ssoSettings, setContentCallback, { startLoading() }, lifetime)
            } else {
                infoPanel()
                    .addLine(message("caws.information_panel"))
                    .addLine(message("caws.information.panel"))
                    .addAction(message("general.refresh")) { lifetime.launchOnUi { startLoading() } }
                    .addDefaultActionButton(message("caws.workspace.new")) { noRepoWizard(setContentCallback) }
            }
        } catch (e: Exception) {
            if (e is ProcessCanceledException) {
                throw e
            }

            LOG.warn(e) { "Failed to list Dev Environments" }

            buildLoadError(e)
        }
    }

    override fun getData(dataId: String): Any? = when {
        else -> null
    }

    private companion object {
        private val LOG = getLogger<ExistingWorkspaces>()
    }
}

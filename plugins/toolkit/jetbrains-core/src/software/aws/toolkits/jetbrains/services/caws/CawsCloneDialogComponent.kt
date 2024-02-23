// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.caws

import com.intellij.collaboration.ui.CollaborationToolsUIUtil
import com.intellij.dvcs.repo.ClonePathProvider
import com.intellij.dvcs.ui.CloneDvcsValidationUtils
import com.intellij.dvcs.ui.SelectChildTextFieldWithBrowseButton
import com.intellij.icons.AllIcons
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.fileChooser.FileChooserDescriptorFactory
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.ValidationInfo
import com.intellij.openapi.vcs.CheckoutProvider
import com.intellij.openapi.vcs.ui.cloneDialog.VcsCloneDialogExtensionComponent
import com.intellij.openapi.vfs.VfsUtil
import com.intellij.ui.CollectionComboBoxModel
import com.intellij.ui.IdeBorderFactory
import com.intellij.ui.SearchTextField
import com.intellij.ui.SimpleTextAttributes
import com.intellij.ui.components.JBList
import com.intellij.ui.dsl.builder.Align
import com.intellij.ui.dsl.builder.AlignX
import com.intellij.ui.dsl.builder.panel
import com.intellij.ui.layout.listCellRenderer
import com.intellij.util.ui.StatusText
import com.intellij.util.ui.UIUtil
import git4idea.checkout.GitCheckoutProvider
import git4idea.commands.Git
import git4idea.remote.GitRememberedInputs
import kotlinx.coroutines.future.await
import kotlinx.coroutines.launch
import software.amazon.awssdk.services.codecatalyst.CodeCatalystClient
import software.aws.toolkits.core.ClientConnectionSettings
import software.aws.toolkits.core.utils.createParentDirectories
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.core.AwsClientManager
import software.aws.toolkits.jetbrains.core.AwsResourceCache
import software.aws.toolkits.jetbrains.core.coroutines.disposableCoroutineScope
import software.aws.toolkits.jetbrains.core.coroutines.getCoroutineUiContext
import software.aws.toolkits.jetbrains.core.credentials.sono.lazilyGetUserId
import software.aws.toolkits.jetbrains.services.caws.pat.generateAndStorePat
import software.aws.toolkits.jetbrains.services.caws.pat.patExists
import software.aws.toolkits.jetbrains.ui.connection.CawsLoginOverlay
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.CodecatalystTelemetry
import java.net.URI
import java.nio.file.Paths
import javax.swing.JComponent
import software.aws.toolkits.telemetry.Result as TelemetryResult

class CawsCloneDialogComponent(
    private val project: Project,
    private val modalityState: ModalityState
) : VcsCloneDialogExtensionComponent() {
    private lateinit var client: CodeCatalystClient
    private lateinit var cawsConnectionSettings: ClientConnectionSettings<*>

    private val repoListModel = CollectionComboBoxModel<CawsCodeRepository>()
    private val repoList = JBList(repoListModel).apply {
        setPaintBusy(true)
        setEmptyText(message("loading_resource.loading"))
        cellRenderer = listCellRenderer { value, _, _ -> text = value.presentableString }

        addListSelectionListener { _ ->
            selectedValue?.let {
                browseButton.trySetChildPath(it.name)
                dialogStateListener.onOkActionEnabled(true)
            }
        }
    }

    private val browseButton = SelectChildTextFieldWithBrowseButton(
        ClonePathProvider.defaultParentDirectoryPath(project, GitRememberedInputs.getInstance())
    ).apply {
        val chooserDescriptor = FileChooserDescriptorFactory.createSingleFolderDescriptor()
        addBrowseFolderListener(message("caws.clone_dialog_title"), message("caws.clone_dialog_description"), project, chooserDescriptor)
    }

    override fun doClone(checkoutListener: CheckoutProvider.Listener) {
        val repository = repoList.selectedValue ?: throw RuntimeException("Repository was not selected")
        ApplicationManager.getApplication().executeOnPooledThread {
            val userId = lazilyGetUserId()
            try {
                // TODO: show progress bar here so it doesn't look like we're stuck
                val url = AwsResourceCache.getInstance().getResource(CawsResources.cloneUrls(repository), cawsConnectionSettings).toCompletableFuture().get()

                val user = URI(url).userInfo.trim('@')
                if (!patExists(user)) {
                    // TODO: prompt if this is OK before generating and storing
                    // TODO: we should check that the current client's "identity" matches the desired user, but the REST client doesn't return
                    //       that information like the graphql endpoint does
                    generateAndStorePat(client, user)
                }

                val destination = Paths.get(browseButton.text).toAbsolutePath()
                destination.createParentDirectories()
                val parentDirectory = destination.parent
                val parentDirectoryVfs = VfsUtil.findFile(parentDirectory, true)
                    ?: throw RuntimeException("VFS could not find specified directory: $parentDirectory")
                val directoryName = destination.fileName.toString()
                runInEdt {
                    GitCheckoutProvider.clone(project, Git.getInstance(), checkoutListener, parentDirectoryVfs, url, directoryName, parentDirectory.toString())
                }
                // GitCheckoutProvider.clone is async, but assume any issues is with JB instead of us
                CodecatalystTelemetry.localClone(project = null, userId = userId, result = TelemetryResult.Succeeded)
            } catch (e: Exception) {
                CodecatalystTelemetry.localClone(project = null, userId = userId, result = TelemetryResult.Failed)
                throw e
            }
        }
    }

    override fun doValidateAll(): List<ValidationInfo> {
        if (repoList.selectedValue == null) {
            return listOf(ValidationInfo(message("caws.workspace.details.repository_validation"), repoList))
        }

        val directoryValidation = CloneDvcsValidationUtils.checkDirectory(browseButton.text, browseButton.textField)
        if (directoryValidation != null) {
            return listOf(directoryValidation)
        }

        return emptyList()
    }

    private fun drawPanel(connectionSettings: ClientConnectionSettings<*>): JComponent {
        cawsConnectionSettings = connectionSettings
        client = AwsClientManager.getInstance().getClient<CodeCatalystClient>(cawsConnectionSettings)

        val panel = panel {
            row {
                val searchField = SearchTextField(false)
                CollaborationToolsUIUtil.attachSearch(repoList, searchField) {
                    it.presentableString
                }
                val label = CawsLetterBadge(connectionSettings)
                cell(searchField.textEditor).resizableColumn().align(Align.FILL)
                cell(label).align(AlignX.RIGHT)
            }

            row {
                scrollCell(repoList).resizableColumn().align(Align.FILL)
            }.resizableRow()

            row(message("caws.clone_dialog_directory")) {
                cell(browseButton).align(Align.FILL)
            }
        }

        disposableCoroutineScope(this).launch {
            try {
                val cache = AwsResourceCache.getInstance()
                val projects = cache.getResource(CawsResources.ALL_PROJECTS, cawsConnectionSettings).await()
                projects.forEach { cawsProject ->
                    repoListModel.add(cache.getResource(CawsResources.codeRepositories(cawsProject), cawsConnectionSettings).await())
                }

                with(getCoroutineUiContext()) {
                    repoList.setEmptyText(StatusText.getDefaultEmptyText())
                }
            } catch (e: Exception) {
                LOG.warn(e) { "Failed to load repositories" }
                with(getCoroutineUiContext()) {
                    val emptyText = repoList.emptyText
                    emptyText.clear()
                    emptyText.appendLine(
                        AllIcons.General.Error,
                        message("caws.clone_dialog_repository_loading_error"),
                        SimpleTextAttributes.REGULAR_ATTRIBUTES,
                        null
                    )
                }
            } finally {
                with(getCoroutineUiContext()) {
                    repoList.setPaintBusy(false)
                }
            }
        }

        return panel
    }

    override fun getView(): JComponent =
        CawsLoginOverlay(project, this) { drawPanel(it) }
            .apply {
                border = IdeBorderFactory.createEmptyBorder(UIUtil.PANEL_REGULAR_INSETS)
            }

    override fun onComponentSelected() {
    }

    companion object {
        val LOG = getLogger<CawsCloneDialogComponent>()
    }
}

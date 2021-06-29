// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.ecr.actions

import com.intellij.docker.DockerCloudType
import com.intellij.docker.DockerServerRuntimeInstance
import com.intellij.docker.deploymentSource.DockerFileDeploymentSourceType
import com.intellij.docker.dockerFile.DockerFileType
import com.intellij.execution.ExecutionBundle
import com.intellij.execution.RunManager
import com.intellij.execution.impl.RunDialog
import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.LangDataKeys
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.fileChooser.FileChooserDescriptorFactory
import com.intellij.openapi.project.Project
import com.intellij.openapi.project.guessProjectDir
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.openapi.ui.TextBrowseFolderListener
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.ui.CollectionComboBoxModel
import com.intellij.ui.ComboboxSpeedSearch
import com.intellij.ui.SimpleListCellRenderer
import com.intellij.ui.components.JBRadioButton
import com.intellij.ui.components.fields.ExtendableTextComponent
import com.intellij.ui.components.fields.ExtendableTextField
import com.intellij.ui.layout.GrowPolicy
import com.intellij.ui.layout.applyToComponent
import com.intellij.ui.layout.buttonGroup
import com.intellij.ui.layout.listCellRenderer
import com.intellij.ui.layout.panel
import com.intellij.ui.layout.selected
import com.intellij.util.text.nullize
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import software.amazon.awssdk.core.exception.SdkException
import software.amazon.awssdk.services.ecr.EcrClient
import software.aws.toolkits.core.utils.error
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.core.awsClient
import software.aws.toolkits.jetbrains.services.ecr.DockerRunConfiguration
import software.aws.toolkits.jetbrains.services.ecr.DockerfileEcrPushRequest
import software.aws.toolkits.jetbrains.services.ecr.EcrPushRequest
import software.aws.toolkits.jetbrains.services.ecr.EcrRepositoryNode
import software.aws.toolkits.jetbrains.services.ecr.EcrUtils
import software.aws.toolkits.jetbrains.services.ecr.ImageEcrPushRequest
import software.aws.toolkits.jetbrains.services.ecr.getDockerLogin
import software.aws.toolkits.jetbrains.services.ecr.resources.EcrResources
import software.aws.toolkits.jetbrains.services.ecr.resources.Repository
import software.aws.toolkits.jetbrains.services.ecr.toLocalImageList
import software.aws.toolkits.jetbrains.ui.ResourceSelector
import software.aws.toolkits.jetbrains.utils.ApplicationThreadPoolScope
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.jetbrains.utils.ui.installOnParent
import software.aws.toolkits.jetbrains.utils.ui.selected
import software.aws.toolkits.jetbrains.utils.ui.visibleIf
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.EcrDeploySource
import software.aws.toolkits.telemetry.EcrTelemetry
import software.aws.toolkits.telemetry.Result
import javax.swing.JTextField
import javax.swing.plaf.basic.BasicComboBoxEditor

class PushToRepositoryAction : EcrDockerAction() {
    override val coroutineScope = ApplicationThreadPoolScope("PushRepositoryAction")

    override fun actionPerformed(selected: EcrRepositoryNode, e: AnActionEvent) {
        val project = e.getRequiredData(LangDataKeys.PROJECT)
        val client: EcrClient = project.awsClient()

        val dialog = PushToEcrDialog(project, selected.repository, dockerServerRuntime)
        if (!dialog.showAndGet()) {
            // user cancelled; noop
            EcrTelemetry.deployImage(project, Result.Cancelled)
            return
        }

        coroutineScope.launch {
            val pushRequest = dialog.getPushRequest()
            var result = Result.Failed
            try {
                val authData = withContext(Dispatchers.IO) {
                    client.authorizationToken.authorizationData().first()
                }

                val ecrLogin = authData.getDockerLogin()
                EcrUtils.pushImage(project, ecrLogin, pushRequest)
                result = Result.Succeeded
            } catch (e: SdkException) {
                val message = message("ecr.push.credential_fetch_failed")

                LOG.error(e) { message }
                notifyError(message("ecr.push.title"), message)
            } catch (e: Exception) {
                val message = message("ecr.push.unknown_exception")

                LOG.error(e) { message }
                notifyError(message("ecr.push.title"), message)
            } finally {
                val type = when (pushRequest) {
                    is ImageEcrPushRequest -> EcrDeploySource.Tag
                    is DockerfileEcrPushRequest -> EcrDeploySource.Dockerfile
                }
                EcrTelemetry.deployImage(
                    project,
                    result,
                    ecrDeploySource = type
                )
            }
        }
    }

    companion object {
        private val LOG = getLogger<PushToRepositoryAction>()
    }
}

internal data class LocalImage(
    val imageId: String,
    val tag: String?
)

internal class PushToEcrDialog(
    private val project: Project,
    selectedRepository: Repository,
    private val dockerServerRuntime: Deferred<DockerServerRuntimeInstance>
) : DialogWrapper(project, null, false, IdeModalityType.PROJECT) {
    private val coroutineScope = ApplicationThreadPoolScope("PushRepositoryDialog")
    private val defaultTag = "latest"
    private var type = BuildType.LocalImage
    private var remoteTag = ""
    private val localImageRepoTags = CollectionComboBoxModel<LocalImage>()

    private var localImage: LocalImage? = null
    private var runConfiguration: DockerRunConfiguration? = null

    private val remoteRepos = ResourceSelector.builder()
        .resource(EcrResources.LIST_REPOS)
        .customRenderer(SimpleListCellRenderer.create("") { it.repositoryName })
        .awsConnection(project)
        .build()

    init {
        remoteRepos.selectedItem { it == selectedRepository }

        title = message("ecr.push.title")
        setOKButtonText(message("ecr.push.confirm"))

        init()

        coroutineScope.launch {
            val serverRuntime = dockerServerRuntime.await()
            val images = serverRuntime.agent.getImages(null)
            localImageRepoTags.add(images.toLocalImageList())
            localImageRepoTags.update()
        }
    }

    override fun createCenterPanel() = panel {
        // valid tag is ascii letters, numbers, underscores, periods, or dashes
        // https://docs.docker.com/engine/reference/commandline/tag/#extended-description
        val validTagRegex = "[a-zA-Z0-9_.-]{1,128}".toRegex()

        lateinit var fromLocalImageButton: JBRadioButton
        lateinit var fromDockerfileButton: JBRadioButton

        buttonGroup(::type) {
            row {
                fromLocalImageButton = this@row.radioButton(message("ecr.push.type.local_image.label"), BuildType.LocalImage).component
                fromDockerfileButton = this@row.radioButton(message("ecr.push.type.dockerfile.label"), BuildType.Dockerfile).component
            }
        }

        val imageSelectorPanel = localImageSelectorPanel()
        val dockerfilePanel = dockerfileConfigurationSelectorPanel()

        row {
            cell(isFullWidth = true) {
                imageSelectorPanel(grow)
                    .installOnParent { fromLocalImageButton.isSelected }
                    .visibleIf(fromLocalImageButton.selected)
                dockerfilePanel(grow)
                    .installOnParent { fromDockerfileButton.isSelected }
                    .visibleIf(fromDockerfileButton.selected)
            }
        }

        row(message("ecr.repo.label")) {
            component(remoteRepos)
                .growPolicy(GrowPolicy.MEDIUM_TEXT)
                .withErrorOnApplyIf(message("loading_resource.still_loading")) { it.isLoading }
                .withErrorOnApplyIf(message("ecr.repo.not_selected")) { it.selected() == null }
        }

        row(message("ecr.push.remoteTag")) {
            textField(::remoteTag)
                .constraints(grow)
                .also {
                    it.component.emptyText.text = defaultTag
                }
                .withErrorOnApplyIf(message("ecr.tag.invalid")) { it.text.isNotEmpty() && !it.text.matches(validTagRegex) }
        }
    }

    private fun localImageSelectorPanel() = panel {
        row(message("ecr.push.source")) {
            // property binding syntax causes kotlin compiler error for some reason
            comboBox(
                localImageRepoTags,
                { localImage },
                { ::localImage.set(it) },
                listCellRenderer { value, _, _ ->
                    text = value.tag ?: value.imageId.take(15)
                }
            )
                .applyToComponent { ComboboxSpeedSearch(this) }
                .growPolicy(GrowPolicy.MEDIUM_TEXT)
                .withErrorOnApplyIf(message("ecr.image.not_selected")) { it.selected() == null }
        }
    }

    private fun dockerfileConfigurationSelectorPanel() = panel {
        row(message("ecr.dockerfile.configuration.label")) {
            cell {
                val model = CollectionComboBoxModel<DockerRunConfiguration>()
                rebuildRunConfigurationComboBoxModel(model)
                comboBox(
                    model,
                    { runConfiguration },
                    { ::runConfiguration.set(it) },
                    listCellRenderer { value, _, _ ->
                        icon = value.icon
                        text = value.name
                    }
                )
                    .applyToComponent {
                        // TODO: how do we render both the Docker icon and action items correctly?
                        isEditable = true
                        editor = object : BasicComboBoxEditor.UIResource() {
                            override fun createEditorComponent(): JTextField {
                                val textField = ExtendableTextField()
                                textField.isEditable = false

                                buildDockerfileActions(model, textField)
                                textField.border = null

                                return textField
                            }
                        }
                    }
                    .growPolicy(GrowPolicy.MEDIUM_TEXT)
                    .withErrorOnApplyIf(message("ecr.dockerfile.configuration.invalid")) { it.selected() == null }
                    .withErrorOnApplyIf(message("ecr.dockerfile.configuration.invalid_server")) { it.selected()?.serverName == null }
            }
        }
    }

    private fun buildDockerfileActions(runConfigModel: CollectionComboBoxModel<DockerRunConfiguration>, textComponent: ExtendableTextField) {
        val editExtension = ExtendableTextComponent.Extension.create(
            AllIcons.General.Inline_edit, AllIcons.General.Inline_edit_hovered,
            message("ecr.dockerfile.configuration.edit")
        ) {
            runConfigModel.selected?.let {
                RunManager.getInstance(project).findSettings(it)?.let { settings ->
                    RunDialog.editConfiguration(
                        project, settings,
                        ExecutionBundle.message("run.dashboard.edit.configuration.dialog.title")
                    )
                }
            }
        }

        val browseExtension = ExtendableTextComponent.Extension.create(
            AllIcons.General.OpenDisk, AllIcons.General.OpenDiskHover,
            message("ecr.dockerfile.configuration.add")
        ) {
            val listener = object : TextBrowseFolderListener(
                FileChooserDescriptorFactory.createSingleFileDescriptor(DockerFileType.DOCKER_FILE_TYPE),
                project
            ) {
                init {
                    myTextComponent = textComponent
                }

                override fun getInitialFile() = this@PushToEcrDialog.project.guessProjectDir()

                override fun onFileChosen(chosenFile: VirtualFile) {
                    val settings = EcrUtils.dockerRunConfigurationFromPath(this@PushToEcrDialog.project, chosenFile.presentableName, chosenFile.path)
                    // open dialog for user
                    RunDialog.editConfiguration(
                        project, settings,
                        ExecutionBundle.message("run.dashboard.edit.configuration.dialog.title")
                    )
                    rebuildRunConfigurationComboBoxModel(runConfigModel)
                }
            }

            runInEdt(ModalityState.any()) {
                listener.run()
            }
        }

        // extensions from right to left
        textComponent.setExtensions(browseExtension, editExtension)
    }

    private fun rebuildRunConfigurationComboBoxModel(model: CollectionComboBoxModel<DockerRunConfiguration>) {
        val configs = RunManager.getInstance(project).getConfigurationsList(DockerCloudType.getRunConfigurationType())
            .filterIsInstance<DockerRunConfiguration>()
            .filter {
                // there are multiple types of Docker run configurations. only accept Dockerfile for now
                // "image" and "compose" both seem like they only make sense as run-only configurations
                it.deploymentSource.type == DockerFileDeploymentSourceType.getInstance()
            }

        model.replaceAll(configs)
        model.selectedItem = configs.firstOrNull()
    }

    private fun selectedRepo() = remoteRepos.selected() ?: throw IllegalStateException("repository uri was null")

    suspend fun getPushRequest(): EcrPushRequest {
        val tag = remoteTag.nullize() ?: defaultTag

        return when (type.ordinal) {
            BuildType.LocalImage.ordinal -> ImageEcrPushRequest(
                dockerServerRuntime.await(),
                localImage?.imageId ?: throw IllegalStateException("image id was null"),
                selectedRepo(),
                tag
            )

            BuildType.Dockerfile.ordinal -> DockerfileEcrPushRequest(
                runConfiguration ?: throw IllegalStateException("run configuration was null"),
                selectedRepo(),
                tag
            )

            else -> throw IllegalStateException()
        }
    }

    private enum class BuildType {
        LocalImage, Dockerfile
    }
}

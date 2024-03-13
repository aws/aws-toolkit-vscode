// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.ecr.actions

import com.intellij.docker.DockerCloudType
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
import com.intellij.ui.dsl.builder.COLUMNS_MEDIUM
import com.intellij.ui.dsl.builder.bindItem
import com.intellij.ui.dsl.builder.bindText
import com.intellij.ui.dsl.builder.columns
import com.intellij.ui.dsl.builder.panel
import com.intellij.ui.dsl.builder.toMutableProperty
import com.intellij.ui.dsl.builder.toNullableProperty
import com.intellij.ui.layout.listCellRenderer
import com.intellij.ui.layout.selected
import com.intellij.util.text.nullize
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import software.amazon.awssdk.core.exception.SdkException
import software.amazon.awssdk.services.ecr.EcrClient
import software.aws.toolkits.core.utils.error
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.core.awsClient
import software.aws.toolkits.jetbrains.core.coroutines.getCoroutineBgContext
import software.aws.toolkits.jetbrains.core.coroutines.projectCoroutineScope
import software.aws.toolkits.jetbrains.core.docker.DockerRuntimeFacade
import software.aws.toolkits.jetbrains.core.docker.LocalImage
import software.aws.toolkits.jetbrains.core.docker.ToolkitDockerAdapter
import software.aws.toolkits.jetbrains.services.ecr.DockerRunConfiguration
import software.aws.toolkits.jetbrains.services.ecr.DockerfileEcrPushRequest
import software.aws.toolkits.jetbrains.services.ecr.EcrPushRequest
import software.aws.toolkits.jetbrains.services.ecr.EcrRepositoryNode
import software.aws.toolkits.jetbrains.services.ecr.EcrUtils
import software.aws.toolkits.jetbrains.services.ecr.ImageEcrPushRequest
import software.aws.toolkits.jetbrains.services.ecr.getDockerLogin
import software.aws.toolkits.jetbrains.services.ecr.resources.EcrResources
import software.aws.toolkits.jetbrains.services.ecr.resources.Repository
import software.aws.toolkits.jetbrains.ui.ResourceSelector
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.jetbrains.utils.ui.installOnParent
import software.aws.toolkits.jetbrains.utils.ui.selected
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.EcrDeploySource
import software.aws.toolkits.telemetry.EcrTelemetry
import software.aws.toolkits.telemetry.Result
import javax.swing.JTextField
import javax.swing.plaf.basic.BasicComboBoxEditor

class PushToRepositoryAction : EcrDockerAction() {
    override fun actionPerformed(selected: EcrRepositoryNode, e: AnActionEvent) {
        val project = e.getRequiredData(LangDataKeys.PROJECT)
        val client: EcrClient = project.awsClient()
        val scope = projectCoroutineScope(project)
        val dialog = PushToEcrDialog(project, selected.repository, scope.dockerServerRuntimeAsync(project))
        if (!dialog.showAndGet()) {
            // user cancelled; noop
            EcrTelemetry.deployImage(project = project, result = Result.Cancelled)
            return
        }

        scope.launch {
            val pushRequest = dialog.getPushRequest()
            var result = Result.Failed
            try {
                val authData = withContext(getCoroutineBgContext()) {
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
                    project = project,
                    result = result,
                    ecrDeploySource = type
                )
            }
        }
    }

    companion object {
        private val LOG = getLogger<PushToRepositoryAction>()
    }
}

internal class PushToEcrDialog(
    private val project: Project,
    selectedRepository: Repository,
    private val dockerRuntime: Deferred<DockerRuntimeFacade>
) : DialogWrapper(project, null, false, IdeModalityType.IDE) {
    private val coroutineScope = projectCoroutineScope(project)
    private val defaultTag = "latest"
    private val localImageRepoTags = CollectionComboBoxModel<LocalImage>()

    var type = BuildType.LocalImage
    var remoteTag = ""
    var localImage: LocalImage? = null
    var runConfiguration: DockerRunConfiguration? = null

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
            val dockerAdapter = ToolkitDockerAdapter(project, dockerRuntime.await())
            localImageRepoTags.add(dockerAdapter.getLocalImages())
            localImageRepoTags.update()
        }
    }

    override fun createCenterPanel() = panel {
        // valid tag is ascii letters, numbers, underscores, periods, or dashes
        // https://docs.docker.com/engine/reference/commandline/tag/#extended-description
        val validTagRegex = "[a-zA-Z0-9_.-]{1,128}".toRegex()

        lateinit var fromLocalImageButton: JBRadioButton
        lateinit var fromDockerfileButton: JBRadioButton

        buttonsGroup {
            row {
                fromLocalImageButton = radioButton(message("ecr.push.type.local_image.label"), BuildType.LocalImage).component
                fromDockerfileButton = radioButton(message("ecr.push.type.dockerfile.label"), BuildType.Dockerfile).component
            }
        }.bind(::type.toMutableProperty(), type = BuildType::class.java)

        val imageSelectorPanel = localImageSelectorPanel()
        val dockerfilePanel = dockerfileConfigurationSelectorPanel()

        row {
            cell(imageSelectorPanel)
                .visibleIf(fromLocalImageButton.selected)
                .installOnParent { fromLocalImageButton.isSelected }
            cell(dockerfilePanel)
                .visibleIf(fromDockerfileButton.selected)
                .installOnParent { fromDockerfileButton.isSelected }
        }

        row(message("ecr.repo.label")) {
            cell(remoteRepos)
                .columns(COLUMNS_MEDIUM)
                .errorOnApply(message("loading_resource.still_loading")) { it.isLoading }
                .errorOnApply(message("ecr.repo.not_selected")) { it.selected() == null }
        }

        row(message("ecr.push.remoteTag")) {
            textField()
                .bindText(::remoteTag)
                .also {
                    it.component.emptyText.text = defaultTag
                }
                .errorOnApply(message("ecr.tag.invalid")) { it.text.isNotEmpty() && !it.text.matches(validTagRegex) }
        }
    }

    private fun localImageSelectorPanel() = panel {
        row(message("ecr.push.source")) {
            comboBox(
                localImageRepoTags,
                listCellRenderer { value, _, _ ->
                    text = value.tag ?: value.imageId.take(15)
                }
            ).bindItem(::localImage.toNullableProperty())
                .applyToComponent { ComboboxSpeedSearch(this) }
                .errorOnApply(message("ecr.image.not_selected")) { it.selected() == null }
                .columns(30) // The size of the entire dialog is doubling if specific columns are not set for this component
        }
    }

    private fun dockerfileConfigurationSelectorPanel() = panel {
        row(message("ecr.dockerfile.configuration.label")) {
            val model = CollectionComboBoxModel<DockerRunConfiguration>()
            rebuildRunConfigurationComboBoxModel(model)
            comboBox(
                model,
                listCellRenderer { value, _, _ ->
                    icon = value.icon
                    text = value.name
                }
            ).bindItem(::runConfiguration.toNullableProperty())
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
                .errorOnApply(message("ecr.dockerfile.configuration.invalid")) { it.selected() == null }
                .errorOnApply(message("ecr.dockerfile.configuration.invalid_server")) { it.selected()?.serverName == null }
        }
    }

    private fun buildDockerfileActions(runConfigModel: CollectionComboBoxModel<DockerRunConfiguration>, textComponent: ExtendableTextField) {
        val editExtension = ExtendableTextComponent.Extension.create(
            AllIcons.General.Inline_edit,
            AllIcons.General.Inline_edit_hovered,
            message("ecr.dockerfile.configuration.edit")
        ) {
            runConfigModel.selected?.let {
                RunManager.getInstance(project).findSettings(it)?.let { settings ->
                    RunDialog.editConfiguration(
                        project,
                        settings,
                        ExecutionBundle.message("run.dashboard.edit.configuration.dialog.title")
                    )
                }
            }
        }

        val browseExtension = ExtendableTextComponent.Extension.create(
            AllIcons.General.OpenDisk,
            AllIcons.General.OpenDiskHover,
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
                        project,
                        settings,
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
                dockerRuntime.await(),
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

    enum class BuildType {
        LocalImage, Dockerfile
    }
}

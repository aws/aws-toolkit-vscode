// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.sam.sync

import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.module.ModuleUtilCore
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogPanel
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.ui.MutableCollectionComboBoxModel
import com.intellij.ui.SimpleListCellRenderer
import com.intellij.ui.components.JBTextField
import com.intellij.ui.dsl.builder.actionListener
import com.intellij.ui.dsl.builder.bind
import com.intellij.ui.dsl.builder.bindSelected
import com.intellij.ui.dsl.builder.bindText
import com.intellij.ui.dsl.builder.panel
import com.intellij.ui.dsl.builder.toMutableProperty
import com.intellij.ui.dsl.gridLayout.HorizontalAlign
import com.intellij.ui.layout.selected
import com.intellij.util.text.nullize
import org.jetbrains.annotations.TestOnly
import software.amazon.awssdk.services.cloudformation.CloudFormationClient
import software.amazon.awssdk.services.cloudformation.model.StackSummary
import software.amazon.awssdk.services.cloudformation.model.Tag
import software.amazon.awssdk.services.ecr.EcrClient
import software.amazon.awssdk.services.lambda.model.PackageType
import software.amazon.awssdk.services.s3.S3Client
import software.aws.toolkits.jetbrains.core.awsClient
import software.aws.toolkits.jetbrains.core.map
import software.aws.toolkits.jetbrains.services.cloudformation.CloudFormationTemplate
import software.aws.toolkits.jetbrains.services.cloudformation.Parameter
import software.aws.toolkits.jetbrains.services.cloudformation.SamFunction
import software.aws.toolkits.jetbrains.services.cloudformation.describeStackForSync
import software.aws.toolkits.jetbrains.services.cloudformation.mergeRemoteParameters
import software.aws.toolkits.jetbrains.services.cloudformation.resources.CloudFormationResources
import software.aws.toolkits.jetbrains.services.ecr.CreateEcrRepoDialog
import software.aws.toolkits.jetbrains.services.ecr.resources.EcrResources
import software.aws.toolkits.jetbrains.services.ecr.resources.Repository
import software.aws.toolkits.jetbrains.services.lambda.deploy.CreateCapabilities
import software.aws.toolkits.jetbrains.services.lambda.sam.SamTemplateUtils
import software.aws.toolkits.jetbrains.services.lambda.sam.ValidateSamParameters.validateParameters
import software.aws.toolkits.jetbrains.services.lambda.sam.ValidateSamParameters.validateStackName
import software.aws.toolkits.jetbrains.services.s3.CreateS3BucketDialog
import software.aws.toolkits.jetbrains.services.s3.resources.S3Resources
import software.aws.toolkits.jetbrains.settings.SyncSettings
import software.aws.toolkits.jetbrains.settings.relativeSamPath
import software.aws.toolkits.jetbrains.ui.KeyValueTextField
import software.aws.toolkits.jetbrains.ui.ResourceSelector
import software.aws.toolkits.jetbrains.utils.ui.validationInfo
import software.aws.toolkits.jetbrains.utils.ui.withBinding
import software.aws.toolkits.resources.message
import java.awt.Component

data class SyncServerlessApplicationSettings(
    val stackName: String,
    val bucket: String,
    val ecrRepo: String?,
    val parameters: Map<String, String>,
    val tags: Map<String, String>,
    val useContainer: Boolean,
    val capabilities: List<CreateCapabilities>
)

class SyncServerlessApplicationDialog(
    private val project: Project,
    private val templateFile: VirtualFile,
    private val activeStacks: List<StackSummary>,
    private val loadResourcesOnCreate: Boolean = true
) : DialogWrapper(project) {
    var useContainer: Boolean = false
    var newStackName: String = ""
    var templateParameters: Map<String, String> = emptyMap()
    var tags: Map<String, String> = emptyMap()
    var showImageOptions: Boolean = false

    private val stackNameField = JBTextField().apply {
        this.isEnabled = false
    }

    private val stackSelector = ResourceSelector.builder()
        .resource(CloudFormationResources.ACTIVE_STACKS)
        .awsConnection(project)
        .customRenderer(SimpleListCellRenderer.create("", StackSummary::stackName))
        .apply {
            if (!loadResourcesOnCreate) {
                disableAutomaticLoading()
            }
        }
        .build()

    private val s3BucketSelector = ResourceSelector.builder()
        .resource(S3Resources.LIST_BUCKETS.map { it.name() })
        .awsConnection(project)
        .apply {
            if (!loadResourcesOnCreate) {
                disableAutomaticLoading()
            }
        }
        .build()

    private val ecrRepoSelector = ResourceSelector.builder()
        .resource(EcrResources.LIST_REPOS)
        .awsConnection(project)
        .customRenderer(SimpleListCellRenderer.create("", Repository::repositoryName))
        .apply {
            if (!loadResourcesOnCreate) {
                disableAutomaticLoading()
            }
        }
        .build()

    private val parametersField = KeyValueTextField(message("serverless.application.sync.template.parameters"))
    private val tagsField = KeyValueTextField(message("tags.title"))
    private var templateFileParameters = CloudFormationTemplate.parse(project, templateFile).parameters().toList()
    private val module = ModuleUtilCore.findModuleForFile(templateFile, project)
    private val settings: SyncSettings? = module?.let { SyncSettings.getInstance(it) }
    private val samPath: String = module?.let { relativeSamPath(it, templateFile) } ?: templateFile.name
    private val templateFunctions = SamTemplateUtils.findFunctionsFromTemplate(project, templateFile)
    private val hasImageFunctions: Boolean = templateFunctions.any { (it as? SamFunction)?.packageType() == PackageType.IMAGE }
    private val checkStack = checkIfStackInSettingsExists()

    private var syncType: SyncType = if (checkStack) SyncType.CREATE else SyncType.UPDATE
    private var createNewStack = checkStack
    private val capabilitiesList = settings?.enabledCapabilities(samPath)?.toMutableList()
        ?: mutableListOf(CreateCapabilities.NAMED_IAM, CreateCapabilities.AUTO_EXPAND)

    private val s3Client: S3Client = project.awsClient()
    private val ecrClient: EcrClient = project.awsClient()
    private val cloudFormationClient: CloudFormationClient = project.awsClient()
    private fun checkIfStackInSettingsExists(): Boolean = if (!settings?.samStackName(samPath).isNullOrEmpty()) {
        !activeStacks.map { it.stackName() }.contains(settings?.samStackName(samPath))
    } else {
        true
    }

    fun settings() = SyncServerlessApplicationSettings(
        stackName = if (createNewStack) {
            newStackName.nullize()
        } else {
            stackSelector.selected()?.stackName()
        } ?: throw RuntimeException(message("serverless.application.sync.validation.stack.missing")),
        bucket = s3BucketSelector.selected() ?: throw RuntimeException("s3 bucket selected was null"),
        ecrRepo = if (hasImageFunctions) {
            ecrRepoSelector.selected()?.repositoryUri
        } else {
            null
        },
        parameters = templateParameters,
        tags = tags,
        useContainer = useContainer,
        capabilities = capabilitiesList
    )

    // TODO: Add Help for Dialog

    private val component by lazy {
        panel {
            buttonsGroup {
                row {
                    // TODO: Find a better way to bind the radio buttons
                    val createStackButton = radioButton(message("serverless.application.sync.label.stack.new"), true).applyToComponent {
                        this.isSelected = createNewStack
                        this.toolTipText = (message("serverless.application.sync.tooltip.createStack"))
                    }.bindSelected(
                        { createNewStack },
                        {
                            if (it) {
                                createNewStack = true
                                syncType = SyncType.CREATE
                            }
                        }
                    )
                        .actionListener { event, component ->
                            if (syncType != SyncType.CREATE) {
                                syncType = SyncType.CREATE
                                refreshTemplateParametersAndTags()
                                createNewStack = true
                            }
                        }
                    cell(stackNameField)
                        .horizontalAlign(HorizontalAlign.FILL)
                        .enabledIf(createStackButton.component.selected)
                        .bindText(::newStackName)
                        .validationOnApply { field ->
                            if (!field.isEnabled) {
                                null
                            } else {
                                validateStackName(field.text, stackSelector)?.let { field.validationInfo(it) }
                            }
                        }.component.toolTipText = message("serverless.application.sync.tooltip.createStack")
                }

                row {
                    val updateStackButton = radioButton(message("serverless.application.sync.label.stack.select"), false).applyToComponent {
                        isSelected = !createNewStack
                        this.toolTipText = (message("serverless.application.sync.tooltip.createStack"))
                    }.bindSelected(
                        { !createNewStack },
                        {
                            if (it) {
                                createNewStack = false
                                syncType = SyncType.UPDATE
                            }
                        }
                    ).actionListener { event, component ->
                        if (syncType != SyncType.UPDATE) {
                            syncType = SyncType.UPDATE
                            refreshTemplateParametersAndTags()
                            createNewStack = false
                        }
                    }
                    stackSelector.reload(forceFetch = true)
                    cell(stackSelector)
                        .horizontalAlign(HorizontalAlign.FILL)
                        .enabledIf(updateStackButton.component.selected)
                        .errorOnApply(message("serverless.application.sync.validation.stack.missing")) {
                            it.isEnabled && (it.isLoading || it.selected() == null)
                        }.component.toolTipText = message("serverless.application.sync.tooltip.updateStack")
                }
            }.bind({ createNewStack }, { createNewStack = it })

            row(message("serverless.application.sync.template.parameters")) {
                cell(parametersField)
                    .withBinding(::templateParameters.toMutableProperty())
                    .validationOnApply {
                        validateParameters(it, templateFileParameters)
                    }.horizontalAlign(HorizontalAlign.FILL)
                    .component.toolTipText = message("serverless.application.sync.tooltip.template.parameters")
            }
            val tagsString = message("tags.title")
            row(tagsString) {
                cell(tagsField)
                    .horizontalAlign(HorizontalAlign.FILL)
                    .withBinding(::tags.toMutableProperty())
            }

            row(message("serverless.application.sync.label.bucket")) {
                cell(s3BucketSelector)
                    .horizontalAlign(HorizontalAlign.FILL)
                    .errorOnApply(message("serverless.application.sync.validation.s3.bucket.empty")) { it.isLoading || it.selected() == null }
                    .component.toolTipText = message("serverless.application.sync.tooltip.s3Bucket")

                button(message("general.create")) { actionEvent ->
                    val bucketDialog = CreateS3BucketDialog(
                        project = project,
                        s3Client = s3Client,
                        parent = actionEvent.source as? Component
                    )

                    if (bucketDialog.showAndGet()) {
                        bucketDialog.bucketName().let {
                            s3BucketSelector.reload(forceFetch = true)
                            s3BucketSelector.selectedItem = it
                        }
                    }
                }
            }

            row(message("serverless.application.sync.label.repo")) {
                cell(ecrRepoSelector)
                    .horizontalAlign(HorizontalAlign.FILL)
                    .errorOnApply(message("serverless.application.sync.validation.ecr.repo.empty")) {
                        it.isVisible && (it.isLoading || it.selected() == null)
                    }.component.toolTipText = message("serverless.application.sync.tooltip.ecrRepo")

                button(message("general.create")) { actionEvent ->
                    val ecrDialog = CreateEcrRepoDialog(
                        project = project,
                        ecrClient = ecrClient,
                        parent = actionEvent.source as? Component
                    )

                    if (ecrDialog.showAndGet()) {
                        ecrRepoSelector.reload(forceFetch = true)
                        ecrRepoSelector.selectedItem { it.repositoryName == ecrDialog.repoName }
                    }
                }
            }.visible(showImageOptions)

            row {
                label(message("cloudformation.capabilities"))
                    .component.toolTipText = message("cloudformation.capabilities.toolTipText")
                CreateCapabilities.values().forEach {
                    checkBox(it.text).actionListener { event, component ->
                        if (component.isSelected) capabilitiesList.add(it) else capabilitiesList.remove(it)
                    }.applyToComponent {
                        this.isSelected = it in capabilitiesList
                        this.toolTipText = it.toolTipText
                    }
                }
            }

            row {
                checkBox(message("serverless.application.sync.use_container"))
                    .bindSelected(::useContainer)
                    .component.toolTipText = message("lambda.sam.buildInContainer.tooltip")
            }
        }
    }

    override fun createCenterPanel() = component

    init {
        title = message("serverless.application.sync")
        setOKButtonText(message("serverless.application.sync.action.name"))
        setOKButtonTooltip(message("serverless.application.sync.action.description"))
        showImageOptions = hasImageFunctions

        settings?.samStackName(samPath)?.let { stackName ->
            if (activeStacks.map { it.stackName() }.contains(stackName)) {
                syncType = SyncType.UPDATE
                createNewStack = false
                stackSelector.selectedItem { it.stackName() == stackName }
                refreshTemplateParametersAndTags(stackName)
            }
        } ?: refreshTemplateParametersAndTags()

        if (showImageOptions) {
            ecrRepoSelector.selectedItem = settings?.samEcrRepoUri(samPath)
        }

        s3BucketSelector.selectedItem = settings?.samBucketName(samPath)
        useContainer = (settings?.samUseContainer(samPath) ?: false)
        tagsField.envVars = settings?.samTags(samPath).orEmpty()
        parametersField.envVars = settings?.samTempParameterOverrides(samPath).orEmpty()

        init()
    }

    private fun refreshTemplateParametersAndTags(stackName: String? = null) {
        when (createNewStack) {
            true -> {
                populateParameters(templateFileParameters)
            }

            false -> {
                val selectedStackName = stackName ?: stackSelector.selected()?.stackName()
                if (selectedStackName == null) {
                    populateParameters(emptyList())
                } else {
                    cloudFormationClient.describeStackForSync(selectedStackName, ::enableParamsAndTags) {
                        it?.let {
                            runInEdt(ModalityState.any()) {
                                // This check is here in-case createStack was selected before we got this update back
                                // TODO: should really create a queuing pattern here so we can cancel on user-action
                                if (!createNewStack) {
                                    populateParameters(templateFileParameters.mergeRemoteParameters(it.parameters()))
                                    populateTags(it.tags())
                                }
                            }
                        } ?: populateParameters(templateFileParameters)
                    }
                }
            }
        }
    }

    private fun enableParamsAndTags(enabled: Boolean) {
        runInEdt(ModalityState.any()) {
            tagsField.isEnabled = enabled
            parametersField.isEnabled = enabled
        }
    }

    @TestOnly
    fun getParameterDialog(): DialogPanel = component

    @TestOnly
    fun forceUi(
        panel: DialogPanel,
        isCreateStack: Boolean? = null,
        hasImageFunctions: Boolean? = null,
        stacks: List<StackSummary>? = null,
        buckets: List<String>? = null,
        ecrRepos: List<Repository>? = null,
        forceStackName: Boolean = false,
        stackName: String? = null,
        forceBucket: Boolean = false,
        bucket: String? = null,
        forceEcrRepo: Boolean = false,
        ecrRepo: String? = null,
        useContainer: Boolean? = null
    ) {
        if (stacks != null) {
            stackSelector.model = MutableCollectionComboBoxModel(stacks)
            stackSelector.forceLoaded()
        }

        if (isCreateStack == true) {
            syncType = SyncType.CREATE
            stackNameField.isEnabled = true
            stackSelector.isEnabled = false
        } else if (isCreateStack == false) {
            syncType = SyncType.UPDATE
            stackNameField.isEnabled = false
            stackSelector.isEnabled = true
        }

        if (forceStackName || stackName != null) {
            if (syncType == SyncType.CREATE) {
                newStackName = stackName.orEmpty()
            } else {
                stackSelector.selectedItem = stacks?.first { it.stackName() == stackName }
            }
        }

        if (buckets != null) {
            s3BucketSelector.model = MutableCollectionComboBoxModel(buckets)
            s3BucketSelector.forceLoaded()
        }

        if (forceBucket || bucket != null) {
            s3BucketSelector.selectedItem = bucket
        }

        if (ecrRepos != null) {
            ecrRepoSelector.model = MutableCollectionComboBoxModel(ecrRepos)
            ecrRepoSelector.forceLoaded()
        }

        if (hasImageFunctions != null) {
            showImageOptions = hasImageFunctions
        }

        if (forceEcrRepo || ecrRepo != null) {
            ecrRepoSelector.selectedItem = ecrRepo
        }

        if (useContainer != null) {
            this.useContainer = useContainer
        }

        panel.reset()
    }

    // visible for testing
    internal fun populateParameters(parameters: List<Parameter>, templateFileDeclarationOverrides: List<Parameter>? = null) {
        // TODO: would be nice to be able to pipe through the description
        parametersField.envVars = parameters.associate { it.logicalName to (it.defaultValue().orEmpty()) }
        templateFileParameters = templateFileDeclarationOverrides ?: CloudFormationTemplate.parse(project, templateFile).parameters().toList()
    }

    private fun populateTags(tags: List<Tag>) {
        tagsField.envVars = tags.associate { it.key() to it.value() }
    }

    enum class SyncType {
        CREATE,
        UPDATE
    }
}

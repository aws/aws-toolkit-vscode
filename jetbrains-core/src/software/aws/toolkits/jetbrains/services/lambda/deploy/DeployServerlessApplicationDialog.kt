// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.deploy

import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.module.ModuleUtilCore
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogPanel
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.openapi.ui.ValidationInfo
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.ui.MutableCollectionComboBoxModel
import com.intellij.ui.SimpleListCellRenderer
import com.intellij.ui.layout.applyToComponent
import com.intellij.ui.layout.panel
import com.intellij.ui.layout.selected
import com.intellij.ui.layout.toBinding
import com.intellij.util.text.nullize
import org.jetbrains.annotations.TestOnly
import software.amazon.awssdk.services.cloudformation.CloudFormationClient
import software.amazon.awssdk.services.cloudformation.model.StackSummary
import software.amazon.awssdk.services.cloudformation.model.Tag
import software.amazon.awssdk.services.ecr.EcrClient
import software.amazon.awssdk.services.lambda.model.PackageType
import software.amazon.awssdk.services.s3.S3Client
import software.aws.toolkits.jetbrains.core.awsClient
import software.aws.toolkits.jetbrains.core.help.HelpIds
import software.aws.toolkits.jetbrains.core.map
import software.aws.toolkits.jetbrains.services.cloudformation.CloudFormationTemplate
import software.aws.toolkits.jetbrains.services.cloudformation.Parameter
import software.aws.toolkits.jetbrains.services.cloudformation.SamFunction
import software.aws.toolkits.jetbrains.services.cloudformation.describeStack
import software.aws.toolkits.jetbrains.services.cloudformation.mergeRemoteParameters
import software.aws.toolkits.jetbrains.services.cloudformation.resources.CloudFormationResources
import software.aws.toolkits.jetbrains.services.ecr.CreateEcrRepoDialog
import software.aws.toolkits.jetbrains.services.ecr.resources.EcrResources
import software.aws.toolkits.jetbrains.services.ecr.resources.Repository
import software.aws.toolkits.jetbrains.services.lambda.sam.SamTemplateUtils
import software.aws.toolkits.jetbrains.services.s3.CreateS3BucketDialog
import software.aws.toolkits.jetbrains.services.s3.resources.S3Resources
import software.aws.toolkits.jetbrains.settings.DeploySettings
import software.aws.toolkits.jetbrains.settings.relativeSamPath
import software.aws.toolkits.jetbrains.ui.KeyValueTextField
import software.aws.toolkits.jetbrains.ui.ResourceSelector
import software.aws.toolkits.jetbrains.utils.ui.bindValueToProperty
import software.aws.toolkits.jetbrains.utils.ui.find
import software.aws.toolkits.jetbrains.utils.ui.installOnParent
import software.aws.toolkits.jetbrains.utils.ui.toolTipText
import software.aws.toolkits.jetbrains.utils.ui.validationInfo
import software.aws.toolkits.jetbrains.utils.ui.withBinding
import software.aws.toolkits.resources.message
import java.awt.Component
import java.util.regex.PatternSyntaxException

data class DeployServerlessApplicationSettings(
    val stackName: String,
    val bucket: String,
    val ecrRepo: String?,
    val autoExecute: Boolean,
    val parameters: Map<String, String>,
    val tags: Map<String, String>,
    val useContainer: Boolean,
    val capabilities: List<CreateCapabilities>
)

class DeployServerlessApplicationDialog(
    private val project: Project,
    private val templateFile: VirtualFile,
    private val loadResourcesOnCreate: Boolean = true
) : DialogWrapper(project) {
    var useContainer: Boolean = false
    var newStackName: String = ""
    var requireReview: Boolean = false
    var deployType: DeployType = DeployType.CREATE
    var templateParameters: Map<String, String> = emptyMap()
    var tags: Map<String, String> = emptyMap()
    var showImageOptions: Boolean = false

    // non-dsl components
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

    private val parametersField = KeyValueTextField()
    private val tagsField = KeyValueTextField(message("tags.title"))
    private val capabilitiesSelector = CapabilitiesEnumCheckBoxes()

    private var templateFileParameters = CloudFormationTemplate.parse(project, templateFile).parameters().toList()
    private val module = ModuleUtilCore.findModuleForFile(templateFile, project)
    private val settings: DeploySettings? = module?.let { DeploySettings.getInstance(it) }
    private val samPath: String = module?.let { relativeSamPath(it, templateFile) } ?: templateFile.name
    private val templateFunctions = SamTemplateUtils.findFunctionsFromTemplate(project, templateFile)
    private val hasImageFunctions: Boolean = templateFunctions.any { (it as? SamFunction)?.packageType() == PackageType.IMAGE }

    private val s3Client: S3Client = project.awsClient()
    private val ecrClient: EcrClient = project.awsClient()
    private val cloudFormationClient: CloudFormationClient = project.awsClient()

    init {
        title = message("serverless.application.deploy.title")
        setOKButtonText(message("serverless.application.deploy.action.name"))
        setOKButtonTooltip(message("serverless.application.deploy.action.description"))

        // populate dialog before init
        showImageOptions = hasImageFunctions
        settings?.samStackName(samPath)?.let { stackName ->
            // If the module has been deployed once, select updateStack
            deployType = DeployType.UPDATE
            stackSelector.selectedItem { it.stackName() == stackName }
            // async populate parameters from remote
            refreshTemplateParametersAndTags(stackName)
        } ?: refreshTemplateParametersAndTags()

        s3BucketSelector.selectedItem = settings?.samBucketName(samPath)
        requireReview = !(settings?.samAutoExecute(samPath) ?: true)
        useContainer = (settings?.samUseContainer(samPath) ?: false)
        capabilitiesSelector.selected = settings?.enabledCapabilities(samPath)
            ?: CreateCapabilities.values().filter { it.defaultEnabled }

        init()
    }

    fun settings() = DeployServerlessApplicationSettings(
        // fields should have been validated at this point
        stackName = if (deployType == DeployType.CREATE) {
            newStackName.nullize()
        } else {
            stackSelector.selected()?.stackName()
        } ?: throw RuntimeException(message("serverless.application.deploy.validation.stack.missing")),
        bucket = s3BucketSelector.selected() ?: throw RuntimeException("s3 bucket selected was null"),
        ecrRepo = if (hasImageFunctions) {
            ecrRepoSelector.selected()?.repositoryUri
        } else {
            null
        },
        autoExecute = !requireReview,
        parameters = templateParameters,
        tags = tags,
        useContainer = useContainer,
        capabilities = capabilitiesSelector.selected
    )

    override fun getHelpId(): String = HelpIds.DEPLOY_SERVERLESS_APPLICATION_DIALOG.id

    override fun createCenterPanel() = buildPanel()

    internal fun buildPanel() =
        panel {
            val wideInputSizeGroup = "wideInputSizeGroup"
            // create stack
            buttonGroup {
                row {
                    val createStackButton = radioButton(
                        message("serverless.application.deploy.label.stack.new")
                    )
                        .bindValueToProperty(::deployType.toBinding(), DeployType.CREATE)
                        .toolTipText(message("serverless.application.deploy.tooltip.createStack"))

                    createStackButton.selected.addListener {
                        if (it && deployType != DeployType.CREATE) {
                            deployType = DeployType.CREATE
                            refreshTemplateParametersAndTags()
                        }
                    }

                    textField(::newStackName)
                        .sizeGroup(wideInputSizeGroup)
                        .constraints(growX)
                        .enableIf(createStackButton.selected)
                        .toolTipText(message("serverless.application.deploy.tooltip.createStack"))
                        .withValidationOnApply { field ->
                            if (!field.isEnabled) {
                                null
                            } else {
                                validateStackName(field.text)?.let { field.validationInfo(it) }
                            }
                        }
                }

                // update stack
                row {
                    val updateStackButton = radioButton(
                        message("serverless.application.deploy.label.stack.select"),
                    )
                        .bindValueToProperty(::deployType.toBinding(), DeployType.UPDATE)
                        .toolTipText(message("serverless.application.deploy.tooltip.updateStack"))

                    updateStackButton.selected.addListener {
                        if (it && deployType != DeployType.UPDATE) {
                            deployType = DeployType.UPDATE
                            refreshTemplateParametersAndTags()
                        }
                    }

                    stackSelector()
                        .sizeGroup(wideInputSizeGroup)
                        .constraints(growX)
                        .enableIf(updateStackButton.selected)
                        .withErrorOnApplyIf(message("serverless.application.deploy.validation.stack.missing")) {
                            it.isEnabled && (it.isLoading || it.selected() == null)
                        }
                        .toolTipText(message("serverless.application.deploy.tooltip.updateStack"))
                }.largeGapAfter()
            }

            // stack parameters
            row(message("serverless.application.deploy.template.parameters")) {
                parametersField()
                    .withBinding(::templateParameters.toBinding())
                    .toolTipText(message("serverless.application.deploy.tooltip.template.parameters"))
                    .withValidationOnApply { validateParameters(it) }
            }

            // deploy tags
            val tagsString = message("tags.title")
            row(tagsString) {
                tagsField()
                    .withBinding(::tags.toBinding())
            }

            // s3 bucket
            row(message("serverless.application.deploy.label.bucket")) {
                s3BucketSelector()
                    .constraints(growX)
                    .withErrorOnApplyIf(message("serverless.application.deploy.validation.s3.bucket.empty")) { it.isLoading || it.selected() == null }
                    .toolTipText(message("serverless.application.deploy.tooltip.s3Bucket"))

                button(message("serverless.application.deploy.button.bucket.create")) {
                    val bucketDialog = CreateS3BucketDialog(
                        project = project,
                        s3Client = s3Client,
                        parent = it.source as? Component
                    )

                    if (bucketDialog.showAndGet()) {
                        bucketDialog.bucketName().let {
                            s3BucketSelector.reload(forceFetch = true)
                            s3BucketSelector.selectedItem = it
                        }
                    }
                }
            }

            // ecr repo
            val ecrSelectorPanel = panel {
                row(message("serverless.application.deploy.label.repo")) {
                    ecrRepoSelector()
                        .constraints(growX)
                        .withErrorOnApplyIf(message("serverless.application.deploy.validation.ecr.repo.empty")) {
                            it.isLoading || it.selected() == null
                        }
                        .toolTipText(message("serverless.application.deploy.tooltip.ecrRepo"))

                    button(message("serverless.application.deploy.button.bucket.create")) {
                        val ecrDialog = CreateEcrRepoDialog(
                            project = project,
                            ecrClient = ecrClient,
                            parent = it.source as? Component
                        )

                        if (ecrDialog.showAndGet()) {
                            ecrRepoSelector.reload(forceFetch = true)
                            ecrRepoSelector.selectedItem { it.repositoryName == ecrDialog.repoName }
                        }
                    }
                }
            }
            row {
                ecrSelectorPanel(grow)
                    .installOnParent { showImageOptions }
                    .applyToComponent {
                        isVisible = showImageOptions
                    }
            }

            // cfn caps
            row {
                label(message("cloudformation.capabilities"))
                    .toolTipText(message("cloudformation.capabilities.toolTipText"))

                cell(isFullWidth = true) {
                    capabilitiesSelector.checkboxes.forEach {
                        it()
                    }
                }
            }

            // confirmation
            row {
                cell(isFullWidth = true) {
                    checkBox(message("serverless.application.deploy.review_required"), ::requireReview)
                        .toolTipText(message("serverless.application.deploy.tooltip.deploymentConfirmation"))
                }
            }

            // in container
            row {
                cell(isFullWidth = true) {
                    checkBox(message("serverless.application.deploy.use_container"), ::useContainer)
                        .toolTipText(message("lambda.sam.buildInContainer.tooltip"))
                }
            }
        }

    private fun refreshTemplateParametersAndTags(stackName: String? = null) {
        when (deployType.name) {
            DeployType.CREATE.name -> {
                populateParameters(templateFileParameters)
            }

            DeployType.UPDATE.name -> {
                val selectedStackName = stackName ?: stackSelector.selected()?.stackName()
                if (selectedStackName == null) {
                    populateParameters(emptyList())
                } else {
                    cloudFormationClient.describeStack(selectedStackName) {
                        it?.let {
                            runInEdt(ModalityState.any()) {
                                // This check is here in-case createStack was selected before we got this update back
                                // TODO: should really create a queuing pattern here so we can cancel on user-action
                                if (deployType == DeployType.UPDATE) {
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

    private fun validateStackName(name: String?): String? {
        if (name == null || name.isEmpty()) {
            return message("serverless.application.deploy.validation.new.stack.name.missing")
        }
        if (!STACK_NAME_PATTERN.matches(name)) {
            return message("serverless.application.deploy.validation.new.stack.name.invalid")
        }
        if (name.length > MAX_STACK_NAME_LENGTH) {
            return message("serverless.application.deploy.validation.new.stack.name.too.long", MAX_STACK_NAME_LENGTH)
        }
        // Check if the new stack name is same as an existing stack name
        stackSelector.model.find { it.stackName() == name }?.let {
            return message("serverless.application.deploy.validation.new.stack.name.duplicate")
        }
        return null
    }

    private fun validateParameters(parametersComponent: KeyValueTextField): ValidationInfo? {
        // validate on ui element because value hasn't been committed yet
        val parameters = parametersComponent.envVars
        val parameterDeclarations = templateFileParameters.associateBy { it.logicalName }

        val invalidParameters = parameters.entries.mapNotNull { (name, value) ->
            val cfnParameterDeclaration = parameterDeclarations[name] ?: return ValidationInfo("parameter declared but not in template")
            when (cfnParameterDeclaration.getOptionalScalarProperty("Type")) {
                "String" -> validateStringParameter(name, value, cfnParameterDeclaration)
                "Number" -> validateNumberParameter(name, value, cfnParameterDeclaration)
                // not implemented: List<Number>, CommaDelimitedList, AWS-specific parameters, SSM parameters
                else -> null
            }
        }

        return invalidParameters.firstOrNull()
    }

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
        autoExecute: Boolean? = null,
        useContainer: Boolean? = null
    ) {
        if (stacks != null) {
            stackSelector.model = MutableCollectionComboBoxModel(stacks)
            stackSelector.forceLoaded()
        }

        if (isCreateStack == true) {
            deployType = DeployType.CREATE
        } else if (isCreateStack == false) {
            deployType = DeployType.UPDATE
        }

        if (forceStackName || stackName != null) {
            if (deployType == DeployType.CREATE) {
                newStackName = stackName ?: ""
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

        if (forceEcrRepo || ecrRepo != null) {
            ecrRepoSelector.selectedItem = ecrRepo
        }

        if (hasImageFunctions != null) {
            showImageOptions = hasImageFunctions
        }

        if (autoExecute != null) {
            requireReview = autoExecute
        }

        if (useContainer != null) {
            this.useContainer = useContainer
        }

        panel.reset()
    }

    // visible for testing
    internal fun populateParameters(parameters: List<Parameter>, templateFileDeclarationOverrides: List<Parameter>? = null) {
        // TODO: would be nice to be able to pipe through the description
        parametersField.envVars = parameters.associate { it.logicalName to (it.defaultValue() ?: "") }
        templateFileParameters = templateFileDeclarationOverrides ?: CloudFormationTemplate.parse(project, templateFile).parameters().toList()
    }

    private fun populateTags(tags: List<Tag>) {
        tagsField.envVars = tags.associate { it.key() to it.value() }
    }

    companion object {
        // https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/cfn-using-console-create-stack-parameters.html
        //  A stack name can contain only alphanumeric characters (case-sensitive) and hyphens. It must start with an alphabetic character and can't be longer than 128 characters.
        private val STACK_NAME_PATTERN = "[a-zA-Z][a-zA-Z0-9-]*".toRegex()
        const val MAX_STACK_NAME_LENGTH = 128

        private fun validateStringParameter(name: String, providedValue: String?, parameterDeclaration: Parameter): ValidationInfo? {
            val value = providedValue ?: ""
            val minValue = parameterDeclaration.getOptionalScalarProperty("MinLength")
            val maxValue = parameterDeclaration.getOptionalScalarProperty("MaxLength")
            val allowedPattern = parameterDeclaration.getOptionalScalarProperty("AllowedPattern")

            minValue?.toIntOrNull()?.let {
                if (value.length < it) {
                    return ValidationInfo(message("serverless.application.deploy.validation.template.values.tooShort", name, minValue))
                }
            }

            maxValue?.toIntOrNull()?.let {
                if (value.length > it) {
                    return ValidationInfo(message("serverless.application.deploy.validation.template.values.tooLong", name, maxValue))
                }
            }

            allowedPattern?.let {
                try {
                    val regex = it.toRegex()
                    if (!regex.matches(value)) {
                        return ValidationInfo(message("serverless.application.deploy.validation.template.values.failsRegex", name, regex))
                    }
                } catch (e: PatternSyntaxException) {
                    return ValidationInfo(message("serverless.application.deploy.validation.template.values.badRegex", name, e.message ?: it))
                }
            }

            return null
        }

        private fun validateNumberParameter(name: String, value: String?, parameterDeclaration: Parameter): ValidationInfo? {
            // cfn numbers can be integer or float. assume real implementation refers to java floats
            val number = value?.toFloatOrNull()
                ?: return ValidationInfo(message("serverless.application.deploy.validation.template.values.notANumber", name, value ?: ""))
            val minValue = parameterDeclaration.getOptionalScalarProperty("MinValue")
            val maxValue = parameterDeclaration.getOptionalScalarProperty("MaxValue")

            minValue?.toFloatOrNull()?.let {
                if (number < it) {
                    return ValidationInfo(message("serverless.application.deploy.validation.template.values.tooSmall", name, minValue))
                }
            }

            maxValue?.toFloatOrNull()?.let {
                if (number > it) {
                    return ValidationInfo(message("serverless.application.deploy.validation.template.values.tooBig", name, maxValue))
                }
            }

            return null
        }
    }

    enum class DeployType {
        CREATE,
        UPDATE
    }
}

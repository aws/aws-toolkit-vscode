// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.gateway

import com.intellij.ide.browsers.BrowserLauncher
import com.intellij.openapi.fileChooser.FileChooserDescriptorFactory
import com.intellij.openapi.observable.properties.PropertyGraph
import com.intellij.openapi.rd.createNestedDisposable
import com.intellij.openapi.rd.util.launchOnUi
import com.intellij.openapi.rd.util.startChildIOBackgroundAsync
import com.intellij.openapi.rd.util.startUnderModalProgressAsync
import com.intellij.openapi.rd.util.withUiContext
import com.intellij.openapi.ui.DialogPanel
import com.intellij.openapi.ui.Messages
import com.intellij.openapi.ui.setEmptyState
import com.intellij.openapi.util.Disposer
import com.intellij.ui.CollectionComboBoxModel
import com.intellij.ui.DocumentAdapter
import com.intellij.ui.ScrollPaneFactory
import com.intellij.ui.SimpleListCellRenderer
import com.intellij.ui.components.JBCheckBox
import com.intellij.ui.components.JBLoadingPanel
import com.intellij.ui.components.JBTextField
import com.intellij.ui.components.panels.Wrapper
import com.intellij.ui.dsl.builder.BottomGap
import com.intellij.ui.dsl.builder.COLUMNS_MEDIUM
import com.intellij.ui.dsl.builder.Cell
import com.intellij.ui.dsl.builder.Row
import com.intellij.ui.dsl.builder.TopGap
import com.intellij.ui.dsl.builder.actionListener
import com.intellij.ui.dsl.builder.bind
import com.intellij.ui.dsl.builder.bindItem
import com.intellij.ui.dsl.builder.bindSelected
import com.intellij.ui.dsl.builder.bindText
import com.intellij.ui.dsl.builder.columns
import com.intellij.ui.dsl.builder.panel
import com.intellij.ui.dsl.builder.selected
import com.intellij.ui.dsl.builder.toMutableProperty
import com.intellij.ui.layout.not
import com.intellij.ui.layout.selected
import com.intellij.util.text.nullize
import com.jetbrains.gateway.api.GatewayUI
import com.jetbrains.gateway.welcomeScreen.MultistagePanel
import com.jetbrains.gateway.welcomeScreen.MultistagePanelContainer
import com.jetbrains.gateway.welcomeScreen.MultistagePanelDelegate
import com.jetbrains.rd.util.lifetime.Lifetime
import software.amazon.awssdk.services.codecatalyst.CodeCatalystClient
import software.amazon.awssdk.services.codecatalyst.model.InstanceType
import software.aws.toolkits.core.ClientConnectionSettings
import software.aws.toolkits.core.utils.error
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.tryOrNull
import software.aws.toolkits.jetbrains.AwsToolkit
import software.aws.toolkits.jetbrains.core.AwsClientManager
import software.aws.toolkits.jetbrains.core.awsClient
import software.aws.toolkits.jetbrains.core.credentials.sono.lazilyGetUserId
import software.aws.toolkits.jetbrains.core.utils.buildMap
import software.aws.toolkits.jetbrains.gateway.connection.IdeBackendActions
import software.aws.toolkits.jetbrains.gateway.connection.extractRepoName
import software.aws.toolkits.jetbrains.gateway.connection.normalizeRepoUrl
import software.aws.toolkits.jetbrains.gateway.welcomescreen.recursivelySetBackground
import software.aws.toolkits.jetbrains.gateway.welcomescreen.setDefaultBackgroundAndBorder
import software.aws.toolkits.jetbrains.services.caws.CawsEndpoints
import software.aws.toolkits.jetbrains.services.caws.CawsProject
import software.aws.toolkits.jetbrains.services.caws.InactivityTimeout
import software.aws.toolkits.jetbrains.services.caws.isSubscriptionFreeTier
import software.aws.toolkits.jetbrains.services.caws.isSupportedInFreeTier
import software.aws.toolkits.jetbrains.services.caws.listAccessibleProjectsPaginator
import software.aws.toolkits.jetbrains.services.caws.loadParameterDescriptions
import software.aws.toolkits.jetbrains.ui.AsyncComboBox
import software.aws.toolkits.jetbrains.utils.ui.find
import software.aws.toolkits.jetbrains.utils.ui.selected
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.CodecatalystCreateDevEnvironmentRepoType
import software.aws.toolkits.telemetry.CodecatalystTelemetry
import java.awt.BorderLayout
import java.awt.event.ItemEvent
import javax.swing.JComponent
import javax.swing.event.DocumentEvent
import software.aws.toolkits.telemetry.Result as TelemetryResult

class CawsSettings(
    // ui initialization params
    var initialSpace: String? = null,

    // core bindings
    var project: CawsProject? = null,
    var productType: GatewayProduct? = null,
    var linkedRepoName: String? = null,
    var linkedRepoBranch: BranchSummary? = null,
    var createBranchName: String = "",
    var unlinkedRepoUrl: String = "",
    var unlinkedRepoBranch: String? = null,
    var alias: String = "",
    var cloneType: CawsWizardCloneType = CawsWizardCloneType.CAWS,
    var instanceType: InstanceType = InstanceType.DEV_STANDARD1_SMALL,
    var persistentStorage: Int? = 0,
    var inactivityTimeout: InactivityTimeout = InactivityTimeout.DEFAULT_TIMEOUT,

    // dev settings
    var useBundledToolkit: Boolean = false,
    var s3StagingBucket: String = "",
    var toolkitLocation: String = "",

    // intermediate values
    var connectionSettings: ClientConnectionSettings<*>? = null,
    var branchCloneType: BranchCloneType = BranchCloneType.EXISTING
)

fun cawsWizard(lifetime: Lifetime, settings: CawsSettings = CawsSettings()) = MultistagePanelContainer(
    listOf(
        CawsInstanceSetupPanel(lifetime)
    ),
    settings,
    object : MultistagePanelDelegate<CawsSettings> {
        override fun onMultistagePanelBack(context: CawsSettings) {
            GatewayUI.getInstance().reset()
            CodecatalystTelemetry.createDevEnvironment(project = null, userId = lazilyGetUserId(), result = TelemetryResult.Cancelled)
        }

        override fun onMultistagePanelDone(context: CawsSettings) {
            val productType = context.productType ?: throw RuntimeException("CAWS wizard finished but productType was not set")
            val connectionSettings = context.connectionSettings ?: throw RuntimeException("CAWS wizard finished but connectionSettings was not set")

            lifetime.startUnderModalProgressAsync(
                title = message("caws.creating_workspace"),
                canBeCancelled = false,
                isIndeterminate = true
            ) {
                val userId = lazilyGetUserId()
                val start = System.currentTimeMillis()
                val env = try {
                    val cawsClient = connectionSettings.awsClient<CodeCatalystClient>()
                    if (context.cloneType == CawsWizardCloneType.UNLINKED_3P) {
                        error("Not implemented")
                    }

                    if (context.branchCloneType == BranchCloneType.NEW_FROM_EXISTING) {
                        withTextAboveProgressBar(message("caws.creating_branch")) {
                            cawsClient.createSourceRepositoryBranch {
                                val project = context.project ?: throw RuntimeException("project was null")
                                val commitId = context.linkedRepoBranch?.headCommitId ?: throw RuntimeException("source commit id was not defined")
                                it.spaceName(project.space)
                                it.projectName(project.project)
                                it.sourceRepositoryName(context.linkedRepoName)
                                it.name(context.createBranchName)
                                it.headCommitId(commitId)
                            }
                        }
                    }

                    IdeBackendActions.createWorkspace(cawsClient, context).also {
                        val repoType = when (context.cloneType) {
                            CawsWizardCloneType.CAWS -> CodecatalystCreateDevEnvironmentRepoType.Linked
                            CawsWizardCloneType.UNLINKED_3P -> CodecatalystCreateDevEnvironmentRepoType.Unlinked
                            CawsWizardCloneType.NONE -> CodecatalystCreateDevEnvironmentRepoType.None
                        }
                        CodecatalystTelemetry.devEnvironmentWorkflowStatistic(
                            project = null,
                            userId = userId,
                            result = TelemetryResult.Succeeded,
                            duration = (System.currentTimeMillis() - start).toDouble(),
                            codecatalystDevEnvironmentWorkflowStep = "createDevEnvironment"
                        )
                        CodecatalystTelemetry.createDevEnvironment(
                            project = null,
                            userId = userId,
                            codecatalystCreateDevEnvironmentRepoType = repoType,
                            result = TelemetryResult.Succeeded
                        )
                    }
                } catch (e: Exception) {
                    val message = message("caws.workspace.creation.failed")
                    getLogger<CawsInstanceSetupPanel>().error(e) { message }
                    withUiContext {
                        Messages.showErrorDialog(e.message ?: message("general.unknown_error"), message)
                    }
                    CodecatalystTelemetry.devEnvironmentWorkflowStatistic(
                        project = null,
                        userId = userId,
                        result = TelemetryResult.Failed,
                        duration = (System.currentTimeMillis() - start).toDouble(),
                        codecatalystDevEnvironmentWorkflowStep = "createDevEnvironment"
                    )
                    CodecatalystTelemetry.createDevEnvironment(project = null, userId = userId, result = TelemetryResult.Failed)
                    return@startUnderModalProgressAsync
                }

                val parameters = mapOf(
                    CawsConnectionParameters.CAWS_SPACE to env.identifier.project.space,
                    CawsConnectionParameters.CAWS_PROJECT to env.identifier.project.project,
                    CawsConnectionParameters.CAWS_ENV_ID to env.identifier.id,
                    CawsConnectionParameters.DEV_SETTING_USE_BUNDLED_TOOLKIT to context.useBundledToolkit.toString(),
                    CawsConnectionParameters.DEV_SETTING_S3_STAGING to context.s3StagingBucket,
                    CawsConnectionParameters.DEV_SETTING_TOOLKIT_PATH to context.toolkitLocation,
                ) + buildMap {
                    when (context.cloneType) {
                        CawsWizardCloneType.CAWS -> {
                            val repoName = context.linkedRepoName ?: throw RuntimeException("CAWS wizard finished but linkedRepoName was not set")
                            put(CawsConnectionParameters.CAWS_GIT_REPO_NAME, repoName)
                        }

                        CawsWizardCloneType.UNLINKED_3P -> {
                            val branch = context.unlinkedRepoBranch ?: throw RuntimeException("CAWS wizard finished but unlinkedRepoBranch was not set")
                            put(CawsConnectionParameters.CAWS_UNLINKED_GIT_REPO_URL, context.unlinkedRepoUrl)
                            put(CawsConnectionParameters.CAWS_UNLINKED_GIT_REPO_BRANCH, branch)
                        }

                        CawsWizardCloneType.NONE -> {}
                    }
                }

                withUiContext {
                    GatewayUI.getInstance().connect(parameters)
                }
            }
        }
    }
)

class CawsInstanceSetupPanel(private val lifetime: Lifetime) : MultistagePanel<CawsSettings> {
    private lateinit var panel: EnvironmentDetailsPanel

    override fun getComponent(context: CawsSettings): JComponent {
        panel = EnvironmentDetailsPanel(context, lifetime)
        return panel.getComponent()
    }

    override fun init(context: CawsSettings, canGoBackAndForthConsumer: (Boolean, Boolean) -> Unit) {
    }

    override fun onEnter(context: CawsSettings, isForward: Boolean) {}

    override suspend fun onGoingToLeave(context: CawsSettings, isForward: Boolean): Boolean {
        if (isForward) {
            return panel.runValidation()
        }

        return true
    }

    override fun onLeave(context: CawsSettings, isForward: Boolean) {}

    override fun shouldSkip(context: CawsSettings, isForward: Boolean) = false

    override fun forwardButtonText(): String = message("caws.create_workspace")
}

class EnvironmentDetailsPanel(private val context: CawsSettings, lifetime: Lifetime) : CawsLoadingPanel(lifetime) {
    private val disposable = lifetime.createNestedDisposable()
    private val environmentParameters = loadParameterDescriptions().environmentParameters
    private lateinit var createPanel: DialogPanel

    override val title = context.project?.let { message("caws.workspace.details.project_specific_title", it.project) }
        ?: message("caws.workspace.details.title")

    override fun getContent(connectionSettings: ClientConnectionSettings<*>): JComponent {
        context.connectionSettings = connectionSettings
        val client = AwsClientManager.getInstance().getClient<CodeCatalystClient>(connectionSettings)
        val spaces = context.initialSpace?.let { listOf(it) }
            ?: context.project?.space?.let { listOf(it) }
            ?: tryOrNull { getSpaces(client) }
        return if (spaces.isNullOrEmpty()) {
            InfoPanel()
                .addLine(message("caws.workspace.details.introduction_message"))
                .addAction(message("general.get_started")) {
                    BrowserLauncher.instance.browse(CawsEndpoints.ConsoleFactory.baseUrl())
                }
                .addAction(message("general.refresh")) { lifetime.launchOnUi { startLoading() } }
        } else panel {
            row(message("caws.workspace.ide_label")) {
                ideVersionComboBox(disposable, context::productType)
            }

            panel {
                val existingProject = context.project
                val existingRepo = context.linkedRepoName
                if (context.cloneType != CawsWizardCloneType.NONE) {
                    row {
                        topGap(TopGap.MEDIUM)
                        label(message("caws.workspace.clone.info"))
                    }
                }

                val projectCombo = AsyncComboBox<CawsProject> { label, value, _ ->
                    value ?: return@AsyncComboBox
                    label.text = "${value.project} (${value.space})"
                }
                Disposer.register(disposable, projectCombo)

                if (existingProject == null) {
                    row(message("caws.project")) {
                        cell(projectCombo)
                            .bindItem(context::project.toMutableProperty())
                            .errorOnApply(message("caws.workspace.details.project_validation")) { it.selectedItem == null }
                            .columns(COLUMNS_MEDIUM)
                    }
                }

                if (context.cloneType != CawsWizardCloneType.NONE) {
                    if (context.cloneType == CawsWizardCloneType.CAWS) {
                        // TODO: might want to show linked repos as disabled to reduce confusion
                        val linkedRepoCombo = AsyncComboBox<SourceRepository> { label, value, _ -> label.text = value?.name }
                        val linkedBranchCombo = AsyncComboBox<BranchSummary> { label, value, _ -> label.text = value?.name }
                        Disposer.register(disposable, linkedRepoCombo)
                        Disposer.register(disposable, linkedBranchCombo)

                        if (existingRepo.isNullOrEmpty()) {
                            row(message("caws.repository")) {
                                cell(linkedRepoCombo)
                                    .bind(
                                        { it.selected()?.name },
                                        { i, v -> i.selectedItem = i.model.find { it.name == v } },
                                        context::linkedRepoName.toMutableProperty()
                                    )
                                    .errorOnApply(message("caws.workspace.details.repository_validation")) { it.selectedItem == null }
                                    .columns(COLUMNS_MEDIUM)
                                projectCombo.addActionListener {
                                    linkedRepoCombo.proposeModelUpdate { model ->
                                        projectCombo.selected()?.let { project ->
                                            val repositories = getRepoNames(project, client)
                                            repositories.forEach { model.addElement(it) }
                                        }
                                    }
                                }
                            }
                        } else {
                            linkedBranchCombo.proposeModelUpdate { model ->
                                val project = existingProject ?: throw RuntimeException("existingProject was null after null check")
                                getBranchNames(project, existingRepo, client).forEach { model.addElement(it) }
                            }
                        }

                        row {
                            label(message("caws.workspace.details.branch_title"))
                                .comment(message("caws.workspace.details.create_branch_comment"))
                        }

                        lateinit var newBranch: Row
                        buttonsGroup {
                            row {
                                radioButton(message("caws.workspace.details.branch_new"), BranchCloneType.NEW_FROM_EXISTING).applyToComponent {
                                    isSelected = context.branchCloneType == BranchCloneType.NEW_FROM_EXISTING
                                }.bindSelected(
                                    { context.branchCloneType == BranchCloneType.NEW_FROM_EXISTING },
                                    { if (it) context.branchCloneType = BranchCloneType.NEW_FROM_EXISTING }
                                ).actionListener { event, component ->
                                    newBranch.visibleIf(component.selected)
                                }

                                radioButton(message("caws.workspace.details.branch_existing"), BranchCloneType.EXISTING).applyToComponent {
                                    isSelected = context.branchCloneType == BranchCloneType.EXISTING
                                }.bindSelected(
                                    { context.branchCloneType == BranchCloneType.EXISTING },
                                    { if (it) context.branchCloneType = BranchCloneType.EXISTING }
                                )
                            }
                        }.bind({ context.branchCloneType }, { context.branchCloneType = it })

                        newBranch = row(message("caws.workspace.details.branch_new")) {
                            textField().bindText(context::createBranchName)
                                .errorOnApply(message("caws.workspace.details.branch_new_validation")) {
                                    it.isVisible && it.text.isNullOrBlank()
                                }
                        }.apply {
                            visible(context.branchCloneType == BranchCloneType.NEW_FROM_EXISTING)
                        }

                        row(message("caws.workspace.details.branch_existing")) {
                            cell(linkedBranchCombo)
                                .bindItem(context::linkedRepoBranch.toMutableProperty())
                                .errorOnApply(message("caws.workspace.details.branch_validation")) { it.selectedItem == null }
                                .columns(COLUMNS_MEDIUM)

                            linkedRepoCombo.addActionListener {
                                linkedBranchCombo.proposeModelUpdate { model ->
                                    projectCombo.selected()?.let { project ->
                                        linkedRepoCombo.selected()?.let { repo ->
                                            val branches = getBranchNames(project, repo.name, client)
                                            branches.forEach { model.addElement(it) }
                                        }
                                    }
                                }
                            }
                        }.contextHelp(message("caws.one.branch.per.dev.env.comment"))
                    }

                    if (context.cloneType == CawsWizardCloneType.UNLINKED_3P) {
                        val unlinkedBranchCombo = AsyncComboBox<String> { label, value, _ -> label.text = value }
                        Disposer.register(disposable, unlinkedBranchCombo)

                        lateinit var repoUrlField: JBTextField
                        lateinit var projectField: JBTextField
                        row(message("caws.workspace.details.unlinked_repo_url")) {
                            textField()
                                .bindText(context::unlinkedRepoUrl)
                                .columns(COLUMNS_MEDIUM)
                                .comment(message("caws.workspace.clone.ssh_agent"), maxLineLength = -1)
                                .applyToComponent {
                                    setEmptyState(message("general.optional"))
                                    document.addDocumentListener(object : DocumentAdapter() {
                                        override fun textChanged(e: DocumentEvent) {
                                            val text = text
                                            projectField.text = tryOrNull { extractRepoName(normalizeRepoUrl(text)) }
                                            projectField.isEnabled = text.isBlank()
                                            if (text.isBlank()) {
                                                unlinkedBranchCombo.proposeModelUpdate { }
                                                return
                                            }

                                            unlinkedBranchCombo.proposeModelUpdate { model ->
                                                val elements = GitWrappers.getRemotes(text)?.map { it.ref }
                                                elements ?: run {
                                                    return@proposeModelUpdate
                                                }

                                                withUiContext {
                                                    elements.forEach { element -> model.addElement(element) }
                                                    model.selectedItem = elements.first()
                                                }
                                            }
                                        }
                                    })

                                    repoUrlField = this
                                }
                        }

                        row(message("caws.workspace.details.branch_title")) {
                            cell(unlinkedBranchCombo)
                                .bindItem(context::unlinkedRepoBranch.toMutableProperty())
                                .errorOnApply(message("caws.workspace.details.branch_validation")) {
                                    !repoUrlField.text.isEmpty() && it.selectedItem == null
                                }
                                .columns(COLUMNS_MEDIUM)
                        }

                        row(message("caws.workspace.details.project.title")) {
                            textField()
                                .columns(COLUMNS_MEDIUM)
                                .comment(message("caws.workspace.details.project.comment"))
                                .errorOnApply(message("caws.workspace.details.project.required")) { it.text.nullize(true) == null }
                                .applyToComponent {
                                    projectField = this
                                }
                        }
                    }
                }

                // need here to force comboboxes to load
                if (context.project == null) {
                    getProjects(client, spaces).forEach { projectCombo.addItem(it) }
                } else {
                    projectCombo.addItem(context.project)
                }

                val propertyGraph = PropertyGraph()
                val projectProperty = propertyGraph.property(projectCombo.selected())
                projectCombo.addItemListener {
                    if (it.stateChange == ItemEvent.SELECTED) {
                        projectProperty.set(it.item as CawsProject?)
                    }
                }

                row(message("caws.workspace.details.alias.label")) {
                    topGap(TopGap.MEDIUM)
                    // TODO: would be nice to have mutable combobox with existing projects
                    textField()
                        .bindText(context::alias)
                        .columns(COLUMNS_MEDIUM)
                        .applyToComponent {
                            setEmptyState(message("general.optional"))
                        }
                }.contextHelp(message("caws.alias.instruction.text"))

                row {
                    placeholder()
                }.bottomGap(BottomGap.MEDIUM)

                group(message("caws.workspace.settings"), indent = false) {
                    row {
                        val wrapper = Wrapper().apply { isOpaque = false }
                        val loadingPanel = JBLoadingPanel(BorderLayout(), disposable).apply {
                            add(wrapper, BorderLayout.CENTER)
                        }
                        val content = { space: String? ->
                            envConfigPanel(space?.let { isSubscriptionFreeTier(existingProject, client, it) } ?: false)
                        }

                        wrapper.setContent(content(projectProperty.get()?.space))

                        val getDialogPanel = { wrapper.targetComponent as DialogPanel }
                        cell(loadingPanel)
                            .onApply { getDialogPanel().apply() }
                            .onReset { getDialogPanel().reset() }
                            .onIsModified { getDialogPanel().isModified() }

                        projectProperty.afterChange {
                            lifetime.launchOnUi {
                                loadingPanel.startLoading()
                                val panel = startChildIOBackgroundAsync { content(it?.space) }.await()
                                wrapper.setContent(panel)
                                loadingPanel.stopLoading()
                            }
                        }
                    }
                }

                if (AwsToolkit.isDeveloperMode()) {
                    group(message("caws.workspace.details.developer_tool_settings")) {
                        lateinit var useBundledToolkit: Cell<JBCheckBox>
                        row {
                            useBundledToolkit = checkBox(message("caws.workspace.details.use_bundled_toolkit")).bindSelected(context::useBundledToolkit)
                        }

                        panel {
                            row(message("caws.workspace.details.backend_toolkit_location")) {
                                textFieldWithBrowseButton(
                                    message("caws.workspace.details.toolkit_location"),
                                    fileChooserDescriptor = FileChooserDescriptorFactory.createSingleFileDescriptor()
                                ).bindText(context::toolkitLocation)
                            }

                            row(message("caws.workspace.details.s3_bucket")) {
                                textField()
                                    .bindText(context::s3StagingBucket)
                                    .columns(COLUMNS_MEDIUM)
                            }
                        }.visibleIf(useBundledToolkit.selected.not())
                    }
                }
            }
        }.also {
            setDefaultBackgroundAndBorder(it)
            it.registerValidators(disposable)
            createPanel = it
        }.let {
            ScrollPaneFactory.createScrollPane(it, true)
        }
    }

    private fun getSpaces(client: CodeCatalystClient) = client.listSpacesPaginator { }
        .items()
        .map { it.name() }

    private fun getProjects(client: CodeCatalystClient, spaces: List<String>) = spaces
        .flatMap { space ->
            client.listAccessibleProjectsPaginator { it.spaceName(space) }.items()
                .map { project -> CawsProject(space, project.name()) }
        }
        .sortedByDescending { it.project }

    private fun getRepoNames(project: CawsProject, client: CodeCatalystClient) = client.listSourceRepositoriesPaginator {
        it.spaceName(project.space)
        it.projectName(project.project)
    }
        .items()
        .map { it.toSourceRepository() }
        .sortedBy { it.name }

    private fun getBranchNames(project: CawsProject, repo: String, client: CodeCatalystClient) =
        client.listSourceRepositoryBranchesPaginator {
            it.spaceName(project.space)
            it.projectName(project.project)
            it.sourceRepositoryName(repo)
        }
            .items()
            .map { summary ->
                val branchName = summary.name()

                BranchSummary(
                    if (branchName.startsWith(BRANCH_PREFIX)) {
                        branchName.substringAfter(BRANCH_PREFIX)
                    } else {
                        branchName
                    },
                    summary.headCommitId()
                )
            }
            .sortedBy { it.name }

    private fun envConfigPanel(isFreeTier: Boolean) =
        panel {
            if (isFreeTier) {
                row {
                    comment(message("caws.compute.size.in.free.tier.comment"))
                }
            }

            cawsEnvironmentSize(
                environmentParameters,
                context::instanceType,
                isFreeTier
            )

            row {
                label(message("caws.workspace.details.persistent_storage_title"))
                comboBox(
                    PersistentStorageOptions(environmentParameters.persistentStorageSize.filter { it > 0 }, isFreeTier),
                    SimpleListCellRenderer.create { label, value, _ ->
                        label.isEnabled = if (isFreeTier) { value.isSupportedInFreeTier() } else true
                        label.text = message("caws.storage.value", value)
                    }
                ).bindItem(context::persistentStorage.toMutableProperty())
            }.bottomGap(BottomGap.MEDIUM).contextHelp(message("caws.workspace.details.persistent_storage_comment"))

            row {
                cawsEnvironmentTimeout(context::inactivityTimeout)
            }.contextHelp(message("caws.workspace.details.inactivity_timeout_comment"))
        }.apply {
            recursivelySetBackground(this)
        }

    fun runValidation(): Boolean {
        try {
            if (createPanel.validateAll().isEmpty()) {
                createPanel.apply()

                return true
            }
        } catch (e: UninitializedPropertyAccessException) { // error is displayed on the panel
        }
        return false
    }

    companion object {
        const val BRANCH_PREFIX = "refs/heads/"
    }
}

enum class CawsWizardCloneType {
    CAWS,
    UNLINKED_3P,
    NONE
}

enum class BranchCloneType {
    EXISTING,
    NEW_FROM_EXISTING
}

class PersistentStorageOptions(items: List<Int>, private val subscriptionIsFreeTier: Boolean) : CollectionComboBoxModel<Int>(items) {
    override fun setSelectedItem(item: Any?) {
        if (subscriptionIsFreeTier) {
            if (item != 16) {
                super.setSelectedItem(16)
            }
        } else {
            super.setSelectedItem(item)
        }
    }
}

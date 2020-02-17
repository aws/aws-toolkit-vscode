// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.ecs.execution

import com.intellij.icons.AllIcons
import com.intellij.openapi.Disposable
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.ActionPlaces
import com.intellij.openapi.actionSystem.ActionToolbar
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.DefaultActionGroup
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.popup.JBPopupFactory
import com.intellij.ui.SimpleTextAttributes
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBLoadingPanel
import com.intellij.ui.components.JBPanelWithEmptyText
import com.intellij.ui.components.panels.Wrapper
import com.intellij.ui.tabs.JBTabsFactory
import com.intellij.ui.tabs.TabInfo
import com.intellij.util.ExceptionUtil
import com.intellij.util.IconUtil
import com.intellij.util.ui.JBUI
import com.intellij.util.ui.JBUI.CurrentTheme.Validator.errorBackgroundColor
import com.intellij.util.ui.JBUI.CurrentTheme.Validator.errorBorderColor
import software.amazon.awssdk.services.ecs.model.ContainerDefinition
import software.aws.toolkits.core.credentials.ToolkitCredentialsProvider
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.core.utils.tryOrNull
import software.aws.toolkits.jetbrains.core.AwsResourceCache
import software.aws.toolkits.jetbrains.core.credentials.CredentialManager
import software.aws.toolkits.jetbrains.core.filter
import software.aws.toolkits.jetbrains.core.region.AwsRegionProvider
import software.aws.toolkits.jetbrains.services.clouddebug.CloudDebugConstants.CLOUD_DEBUG_RESOURCE_PREFIX
import software.aws.toolkits.jetbrains.services.ecs.EcsUtils
import software.aws.toolkits.jetbrains.services.ecs.resources.EcsResources
import software.aws.toolkits.jetbrains.ui.ResourceSelector
import software.aws.toolkits.resources.message
import java.awt.BorderLayout
import java.util.concurrent.atomic.AtomicReference
import javax.swing.BorderFactory
import javax.swing.JComponent
import javax.swing.JPanel

class EcsCloudDebugSettingsEditorPanel(private val project: Project) : Disposable {
    private var selectedCluster: String? = null
    private var selectedService: String? = null

    private lateinit var panel: JPanel
    private lateinit var clusterSelector: ResourceSelector<String>
    private lateinit var serviceSelector: ResourceSelector<String>
    private lateinit var containerLoadingIndicator: JBLoadingPanel
    private lateinit var perContainerSettings: JPanel
    private lateinit var emptyStatusIndicator: JBPanelWithEmptyText
    private lateinit var containerSettingsToolbarHolder: Wrapper
    private lateinit var containerSettingsTabHolder: Wrapper
    private lateinit var errorLabel: JBLabel

    private val tabs = JBTabsFactory.createEditorTabs(project, this)
    private var tabInfoHolder = TabInfoHolder(null, null)
    private val addAction = AddContainerAction()
    private val toolbar = createToolbar()
    private var containerNames: Set<String> = emptySet()
    private val credentialManager = CredentialManager.getInstance()
    private val credentialSettings = AtomicReference<Pair<AwsRegion, ToolkitCredentialsProvider>>()

    val component: JComponent
        get() = panel

    init {
        postUIComponents()
        showMissingServiceContainerMessage()
    }

    private fun createUIComponents() {
        containerLoadingIndicator = JBLoadingPanel(BorderLayout(), project)
        containerLoadingIndicator.setLoadingText(message("cloud_debug.ecs.run_config.container.loading"))
        containerLoadingIndicator.border = JBUI.Borders.empty()

        clusterSelector = ResourceSelector.builder(project)
            .resource(EcsResources.LIST_CLUSTER_ARNS)
            .customRenderer { value, component -> component.append(EcsUtils.clusterArnToName(value)); component }
            .disableAutomaticLoading()
            .awsConnection { credentialSettings.get() ?: throw IllegalStateException("clusterSelector.reload() called before region/credentials set") }
            .build()

        clusterSelector.addActionListener { this.onClusterSelectionChange() }

        serviceSelector = ResourceSelector.builder(project).resource {
            val selectedCluster = selectedCluster
            if (selectedCluster != null) {
                EcsResources.listServiceArns(selectedCluster).filter { EcsUtils.isInstrumented(it) }
            } else {
                null
            }
        }.customRenderer { value, component -> component.append(EcsUtils.serviceArnToName(value)); component }
            .disableAutomaticLoading()
            .awsConnection { credentialSettings.get() ?: throw IllegalStateException("serviceSelector.reload() called before region/credentials set") }
            .build()

        serviceSelector.isEnabled = false
        serviceSelector.addActionListener { this.onServiceSelectionChange() }
    }

    private fun postUIComponents() {
        perContainerSettings.isVisible = false
        errorLabel.setAllowAutoWrapping(true)
        errorLabel.isVisible = false
        errorLabel.isOpaque = true
        errorLabel.background = errorBackgroundColor()
        errorLabel.border = BorderFactory.createLineBorder(errorBorderColor())

        containerSettingsToolbarHolder.setContent(toolbar.component)
        containerSettingsTabHolder.setContent(tabs.component)
    }

    private fun createToolbar(): ActionToolbar {
        val actionGroup = DefaultActionGroup(addAction)
        val toolbar = ActionManager.getInstance().createActionToolbar(ActionPlaces.UNKNOWN, actionGroup, true)
        toolbar.setReservePlaceAutoPopupIcon(false)
        toolbar.setMiniMode(true)

        val toolbarComponent = toolbar.component
        toolbarComponent.border = JBUI.Borders.empty()

        return toolbar
    }

    private fun onClusterSelectionChange() {
        if (clusterSelector.isLoading) {
            return
        }

        val newSelection = clusterSelector.selected()

        serviceSelector.isEnabled = newSelection != null

        if (selectedCluster != newSelection) {
            selectedCluster = newSelection
            serviceSelector.reload()
        }
    }

    private fun onServiceSelectionChange() {
        if (serviceSelector.isLoading) {
            return
        }

        val newSelection = serviceSelector.selected()
        if (newSelection != null && newSelection != selectedService) {
            if (serviceSelector.model.size != 0) {
                selectedService = newSelection

                val localSelectedCluster = selectedCluster
                val localSelectedService = selectedService
                if (localSelectedCluster != null && localSelectedService != null) {
                    loadContainers(localSelectedCluster, localSelectedService)
                }
            } else {
                showMissingServiceContainerMessage()
            }
        }
    }

    private fun showMissingServiceContainerMessage() {
        // No service selected, hide the per container settings
        perContainerSettings.isVisible = false
        emptyStatusIndicator.emptyText.setText(
            message("cloud_debug.ecs.run_config.container.empty_text"),
            SimpleTextAttributes.REGULAR_ATTRIBUTES
        )
    }

    private fun loadContainers(clusterArn: String, serviceArn: String) {
        startLoadingContainers()

        // If the saved tab infos were for the cluster and service, and not empty, use them, else we start from scratch
        val initialTabs = if (tabInfoHolder.clusterArn == clusterArn && tabInfoHolder.serviceArn == serviceArn && tabInfoHolder.size > 0) {
            tabInfoHolder.sortedBy { it.text }
        } else {
            tabInfoHolder.serviceArn = serviceArn
            tabInfoHolder.clusterArn = clusterArn
            tabInfoHolder.clear()

            emptyList()
        }

        val (awsRegion, credentialProvider) = credentialSettings.get()

        val resourceCache = AwsResourceCache.getInstance(project)
        resourceCache.getResource(
            EcsResources.describeService(clusterArn, serviceArn),
            awsRegion,
            credentialProvider
        ).thenCompose { service ->
            resourceCache.getResource(
                EcsResources.listContainers(service.taskDefinition()),
                awsRegion,
                credentialProvider
            )
        }.whenComplete { containers, error ->
            runInEdt(ModalityState.any()) {
                stopLoadingContainers(containers, initialTabs, error)
            }
        }
    }

    private fun startLoadingContainers() {
        emptyStatusIndicator.isVisible = false
        containerLoadingIndicator.startLoading()

        containerNames = emptySet()
        tabs.removeAllTabs()
    }

    private fun stopLoadingContainers(
        containers: List<ContainerDefinition>?,
        initialTabs: List<TabInfo>,
        error: Throwable?
    ) {
        when {
            containers != null -> {
                containerNames = containers
                    .map { it.name() }
                    // Skip showing the sidecar container
                    .filter { !it.startsWith(CLOUD_DEBUG_RESOURCE_PREFIX) }
                    .toSet()

                // If we only have one container, and there are no containers in the model, add it by default
                if (tabInfoHolder.isEmpty() && containerNames.size == 1) {
                    val tabInfo = createTabInfo(containerNames.first())
                    tabInfoHolder.add(tabInfo)
                }

                // this can be called twice with the same initial tabs sometimes (why) so make sure it is not
                // in the list of tabs already
                initialTabs.forEach {
                    if (it.text in containerNames && tabs.tabs.none { tab -> tab.text.contains(it.text) }) {
                        tabs.addTab(it)
                    }
                }

                tabInfoHolder.forEach {
                    tabs.addTab(it)
                }

                perContainerSettings.isVisible = containers.isNotEmpty()
                errorLabel.isVisible = false
            }
            error != null -> {
                val errorText = message(
                    "cloud_debug.ecs.run_config.container.loading.error",
                    ExceptionUtil.getMessage(error)
                        ?: message("cloud_debug.ecs.run_config.container.loading.error.unknown_error")
                )
                errorLabel.isVisible = true
                errorLabel.text = "<html>$errorText</html>"
            }
        }

        emptyStatusIndicator.isVisible = error == null
        containerLoadingIndicator.stopLoading()
    }

    private fun createTabInfo(containerName: String): TabInfo {
        val containerSettings = PerContainerSettings(project, this)
        return TabInfo(containerSettings.panel).apply {
            text = containerName
            `object` = containerSettings
            setTabLabelActions(DefaultActionGroup(CloseTabAction(this)), ActionPlaces.UNKNOWN)
        }
    }

    fun resetFrom(configuration: EcsCloudDebugRunConfiguration) {
        val clusterArn = configuration.clusterArn()
        val serviceArn = configuration.serviceArn()
        val containerSettings = configuration.containerOptions()
        val credentialProviderId = configuration.credentialProviderId() ?: return
        val region = AwsRegionProvider.getInstance().lookupRegionById(configuration.regionId())
        val credentialIdentifier = credentialManager.getCredentialIdentifierById(credentialProviderId) ?: return
        val credentialProvider = credentialManager.getAwsCredentialProvider(credentialIdentifier, region)

        // Set initial state before telling UI to update
        credentialSettings.set(region to credentialProvider)
        selectedCluster = clusterArn
        selectedService = serviceArn

        if (clusterArn != null && serviceArn != null) {
            tabInfoHolder.clusterArn = clusterArn
            tabInfoHolder.serviceArn = serviceArn

            tabInfoHolder.clear()
            containerSettings.forEach {
                val initialTab = createTabInfo(it.key)
                tabInfoHolder.add(initialTab)
                val perContainerSettings = initialTab.`object` as PerContainerSettings
                perContainerSettings.resetFrom(it.value)
            }

            loadContainers(clusterArn, serviceArn)
        } else {
            stopLoadingContainers(emptyList(), emptyList(), null)
        }

        clusterSelector.selectedItem = clusterArn
        serviceSelector.selectedItem = serviceArn

        clusterSelector.reload()
        serviceSelector.reload()
    }

    fun applyTo(configuration: EcsCloudDebugRunConfiguration) {
        val (region, credentialsProvider) = credentialSettings.get() ?: return
        configuration.regionId(region.id)
        configuration.credentialProviderId(credentialsProvider.id)
        configuration.clusterArn(selectedCluster)
        configuration.serviceArn(selectedService)

        configuration.containerOptions(
            tabInfoHolder.map {
                val containerOptions = ContainerOptions()
                (it.`object` as PerContainerSettings).applyTo(containerOptions)

                it.text to containerOptions
            }.toMap()
        )
    }

    override fun dispose() {}

    private inner class TabInfoHolder(var clusterArn: String?, var serviceArn: String?) :
        MutableSet<TabInfo> by mutableSetOf()

    private inner class AddContainerAction : DumbAwareAction(
        message("cloud_debug.ecs.run_config.container.add"),
        null,
        IconUtil.getAddIcon()
    ) {
        override fun actionPerformed(e: AnActionEvent) {
            val containerCandidates = containerNames
                .minus(tabInfoHolder.map { it.text })
                .sorted()

            val addActions = containerCandidates.map {
                object : AnAction(it) {
                    override fun actionPerformed(e: AnActionEvent) {
                        val newTab = createTabInfo(it)
                        tabInfoHolder.add(newTab)
                        tabs.addTab(newTab)
                    }
                }
            }

            JBPopupFactory.getInstance()
                .createActionGroupPopup(
                    message("cloud_debug.ecs.run_config.container.select_container"),
                    DefaultActionGroup(addActions),
                    e.dataContext,
                    null,
                    false
                )
                .showUnderneathOf(e.inputEvent.component)
        }

        override fun displayTextInToolbar(): Boolean = true

        override fun update(e: AnActionEvent) {
            e.presentation.isEnabled = containerNames.size != tabs.tabCount
        }
    }

    inner class CloseTabAction(private val tabInfo: TabInfo) : AnAction(AllIcons.Actions.Close) {
        override fun actionPerformed(e: AnActionEvent) {
            tabs.removeTab(tabInfo)
            tabInfoHolder.remove(tabInfo)
        }

        override fun update(e: AnActionEvent) {
            e.presentation.icon = AllIcons.Actions.Close
            e.presentation.hoveredIcon = AllIcons.Actions.CloseHovered
        }
    }

    internal fun awsConnectionUpdated(region: AwsRegion?, credentialProviderId: String?) {
        region ?: return
        credentialProviderId ?: return

        val credentialIdentifier = credentialManager.getCredentialIdentifierById(credentialProviderId) ?: return
        val credentialProvider = tryOrNull { credentialManager.getAwsCredentialProvider(credentialIdentifier, region) } ?: return

        val oldSettings = credentialSettings.getAndUpdate { region to credentialProvider }
        if (oldSettings?.first == region && oldSettings.second == credentialProvider) return

        // Clear out settings on region change
        containerNames = emptySet()
        tabs.removeAllTabs()
        tabInfoHolder.clusterArn = null
        tabInfoHolder.serviceArn = null

        clusterSelector.reload()
    }
}

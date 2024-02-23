// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.gettingstarted

import com.intellij.openapi.observable.properties.PropertyGraph
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.openapi.ui.ValidationInfo
import com.intellij.ui.components.BrowserLink
import com.intellij.ui.components.JBTabbedPane
import com.intellij.util.ui.JBUI
import com.intellij.util.ui.components.BorderLayoutPanel
import org.jetbrains.annotations.VisibleForTesting
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.jetbrains.core.credentials.loginSso
import software.aws.toolkits.jetbrains.core.credentials.sono.IDENTITY_CENTER_ROLE_ACCESS_SCOPE
import software.aws.toolkits.jetbrains.core.credentials.sono.SONO_REGION
import software.aws.toolkits.jetbrains.core.credentials.sono.SONO_URL
import software.aws.toolkits.jetbrains.core.gettingstarted.SetupAuthenticationNotice.NoticeType
import software.aws.toolkits.jetbrains.core.region.AwsRegionProvider
import software.aws.toolkits.jetbrains.utils.ui.editorNotificationCompoundBorder
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.CredentialSourceId
import java.awt.BorderLayout
import javax.swing.Action
import javax.swing.BorderFactory
import javax.swing.JComponent
import javax.swing.JLabel

data class GatewaySetupAuthenticationDialogState(
    var idcTabState: IdentityCenterTabState = IdentityCenterTabState(),
    val builderIdTabState: BuilderIdTabState = BuilderIdTabState,
) {
    private val graph = PropertyGraph()
    val selectedTab = graph.property(GatewaySetupAuthenticationTabs.IDENTITY_CENTER)
    data class IdentityCenterTabState(
        var startUrl: String = "",
        var region: AwsRegion = AwsRegionProvider.getInstance().defaultRegion(),
        var rolePopupState: IdcRolePopupState = IdcRolePopupState()
    )

    // has no state yet
    object BuilderIdTabState
}

enum class GatewaySetupAuthenticationTabs {
    IDENTITY_CENTER,
    BUILDER_ID
}

class GatewaySetupAuthenticationDialog(
    private val project: Project?,
    private val scopes: List<String> = emptyList(),
    private val state: GatewaySetupAuthenticationDialogState = GatewaySetupAuthenticationDialogState(),
    private val tabSettings: Map<GatewaySetupAuthenticationTabs, AuthenticationTabSettings> = emptyMap(),
    private val promptForIdcPermissionSet: Boolean = false
) : DialogWrapper(project), AuthenticationDialog {
    private val rootTabPane = JBTabbedPane()
    private val idcTab = IdcTabPanelBuilder(state.idcTabState::startUrl, state.idcTabState::region).build()
    private val builderIdTab = BuilderIdTabPanelBuilder().build()
    private val wrappers = GatewaySetupAuthenticationTabs.values().associateWith { BorderLayoutPanel() }
    override var attempts = 0
        private set
    override var authType = CredentialSourceId.IamIdentityCenter
        private set

    init {
        title = message("gettingstarted.setup.title")
        init()

        // actions don't exist until after init
        okAction.putValue(Action.NAME, message("gettingstarted.setup.connect"))
    }

    // called as part of init()
    override fun createCenterPanel(): JComponent {
        wrappers[GatewaySetupAuthenticationTabs.IDENTITY_CENTER]?.addToCenter(idcTab)
        wrappers[GatewaySetupAuthenticationTabs.BUILDER_ID]?.addToCenter(builderIdTab)

        idcTab.registerValidators(myDisposable) { validations ->
            if (selectedTab() == GatewaySetupAuthenticationTabs.IDENTITY_CENTER) {
                setOKActionEnabled(validations.values.all { it.okEnabled })
            }
        }

        builderIdTab.registerValidators(myDisposable) { validations ->
            if (selectedTab() == GatewaySetupAuthenticationTabs.BUILDER_ID) {
                setOKActionEnabled(validations.values.all { it.okEnabled })
            }
        }

        tabSettings.forEach { (tab, settings) ->
            val notice = settings.notice

            wrappers[tab]?.addToTop(
                BorderLayoutPanel().apply {
                    add(JLabel(notice.message + "\u00a0"), BorderLayout.CENTER)
                    add(BrowserLink(message("gettingstarted.setup.learnmore"), notice.learnMore), BorderLayout.EAST)

                    background = when (notice.type) {
                        NoticeType.WARNING -> JBUI.CurrentTheme.NotificationWarning.backgroundColor()
                        NoticeType.ERROR -> JBUI.CurrentTheme.NotificationError.backgroundColor()
                    }

                    val borderColor = when (notice.type) {
                        NoticeType.WARNING -> JBUI.CurrentTheme.NotificationWarning.borderColor()
                        NoticeType.ERROR -> JBUI.CurrentTheme.NotificationError.borderColor()
                    }

                    border = editorNotificationCompoundBorder(BorderFactory.createMatteBorder(0, 0, 1, 0, borderColor))
                }
            )
        }

        rootTabPane.add(message("gettingstarted.setup.tabs.idc"), wrappers[GatewaySetupAuthenticationTabs.IDENTITY_CENTER])
        rootTabPane.add(message("gettingstarted.setup.tabs.builderid"), wrappers[GatewaySetupAuthenticationTabs.BUILDER_ID])

        rootTabPane.selectedComponent = wrappers[state.selectedTab.get()]

        rootTabPane.addChangeListener {
            val selectedTab = selectedTab()

            state.selectedTab.set(selectedTab)
            okAction.isEnabled = tabSettings[selectedTab]?.disabled?.not() ?: true
        }

        return rootTabPane
    }

    override fun applyFields() {
        when (selectedTab()) {
            GatewaySetupAuthenticationTabs.IDENTITY_CENTER -> {
                idcTab.apply()
            }

            GatewaySetupAuthenticationTabs.BUILDER_ID -> {
                builderIdTab.apply()
            }
        }
    }

    override fun doValidateAll(): List<ValidationInfo> =
        when (selectedTab()) {
            GatewaySetupAuthenticationTabs.IDENTITY_CENTER -> {
                idcTab.validateAll()
            }

            GatewaySetupAuthenticationTabs.BUILDER_ID -> {
                emptyList()
            }
        }

    @VisibleForTesting
    public override fun doOKAction() {
        if (!okAction.isEnabled) {
            return
        }

        applyFields()
        val scopes = if (promptForIdcPermissionSet) {
            (scopes + IDENTITY_CENTER_ROLE_ACCESS_SCOPE).toSet().toList()
        } else {
            scopes
        }

        when (selectedTab()) {
            GatewaySetupAuthenticationTabs.IDENTITY_CENTER -> {
                authType = CredentialSourceId.IamIdentityCenter
                val startUrl = state.idcTabState.startUrl
                val region = state.idcTabState.region
                loginSso(project, startUrl, region.id, scopes)
            }

            GatewaySetupAuthenticationTabs.BUILDER_ID -> {
                authType = CredentialSourceId.AwsId
                loginSso(project, SONO_URL, SONO_REGION, scopes)
            }
        }

        close(OK_EXIT_CODE)
    }

    private fun selectedTab() = wrappers.entries.firstOrNull { (_, wrapper) -> wrapper == rootTabPane.selectedComponent }?.key
        ?: error("Could not determine selected tab")
}

// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.gettingstarted

import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.DataContext
import com.intellij.openapi.actionSystem.PlatformDataKeys
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.observable.properties.PropertyGraph
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.openapi.ui.ValidationInfo
import com.intellij.openapi.util.Disposer
import com.intellij.ui.ExperimentalUI
import com.intellij.ui.SimpleListCellRenderer
import com.intellij.ui.components.BrowserLink
import com.intellij.ui.components.JBTabbedPane
import com.intellij.ui.dsl.builder.AlignX
import com.intellij.ui.dsl.builder.bindItem
import com.intellij.ui.dsl.builder.bindText
import com.intellij.ui.dsl.builder.panel
import com.intellij.ui.dsl.builder.toNullableProperty
import com.intellij.util.ui.JBInsets
import com.intellij.util.ui.JBUI
import com.intellij.util.ui.components.BorderLayoutPanel
import org.jetbrains.annotations.VisibleForTesting
import software.amazon.awssdk.auth.credentials.AnonymousCredentialsProvider
import software.amazon.awssdk.auth.token.credentials.SdkTokenProvider
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.sso.SsoClient
import software.amazon.awssdk.services.sso.model.RoleInfo
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.jetbrains.ToolkitPlaces
import software.aws.toolkits.jetbrains.core.AwsClientManager
import software.aws.toolkits.jetbrains.core.credentials.AwsBearerTokenConnection
import software.aws.toolkits.jetbrains.core.credentials.BearerSsoConnection
import software.aws.toolkits.jetbrains.core.credentials.SsoSessionConfigurationManager
import software.aws.toolkits.jetbrains.core.credentials.loginSso
import software.aws.toolkits.jetbrains.core.credentials.sono.CODEWHISPERER_SCOPES
import software.aws.toolkits.jetbrains.core.credentials.sono.IDENTITY_CENTER_ROLE_ACCESS_SCOPE
import software.aws.toolkits.jetbrains.core.credentials.sono.SONO_REGION
import software.aws.toolkits.jetbrains.core.credentials.sono.SONO_URL
import software.aws.toolkits.jetbrains.core.credentials.sono.isSono
import software.aws.toolkits.jetbrains.core.region.AwsRegionProvider
import software.aws.toolkits.jetbrains.ui.AsyncComboBox
import software.aws.toolkits.jetbrains.utils.ui.selected
import software.aws.toolkits.resources.message
import java.awt.BorderLayout
import javax.swing.Action
import javax.swing.BorderFactory
import javax.swing.JComponent
import javax.swing.JLabel

data class SetupAuthenticationDialogState(
    var idcTabState: IdentityCenterTabState = IdentityCenterTabState(),
    val builderIdTabState: BuilderIdTabState = BuilderIdTabState,
    var iamTabState: IamLongLivedCredentialsState = IamLongLivedCredentialsState(),
) {
    private val graph = PropertyGraph()
    val selectedTab = graph.property(SetupAuthenticationTabs.IDENTITY_CENTER)
    data class IdentityCenterTabState(
        var profileName: String = "",
        var startUrl: String = "",
        var region: AwsRegion = AwsRegionProvider.getInstance().defaultRegion(),
        var rolePopupState: IdcRolePopupState = IdcRolePopupState()
    )

    // has no state yet
    object BuilderIdTabState

    data class IamLongLivedCredentialsState(
        // should be blank if default profile exists
        var profileName: String = "default",
        var accessKey: String = "",
        var secretKey: String = "",
    )
}

enum class SetupAuthenticationTabs {
    IDENTITY_CENTER,
    BUILDER_ID,
    IAM_LONG_LIVED
}

data class AuthenticationTabSettings(
    val disabled: Boolean = false,
    val notice: SetupAuthenticationNotice
)

data class SetupAuthenticationNotice(
    val type: NoticeType,
    val message: String,
    val learnMore: String
) {
    enum class NoticeType {
        WARNING,
        ERROR
    }
}

class SetupAuthenticationDialog(
    private val project: Project,
    private val scopes: List<String> = emptyList(),
    private val state: SetupAuthenticationDialogState = SetupAuthenticationDialogState(),
    private val tabSettings: Map<SetupAuthenticationTabs, AuthenticationTabSettings> = emptyMap(),
    private val promptForIdcPermissionSet: Boolean = false,
) : DialogWrapper(project) {
    private val rootTabPane = JBTabbedPane()
    private val idcTab = idcTab()
    private val builderIdTab = builderIdTab()
    private val iamTab = iamTab()
    private val wrappers = SetupAuthenticationTabs.values().associateWith { BorderLayoutPanel() }

    init {
        title = message("gettingstarted.setup.title")
        init()

        // actions don't exist until after init
        okAction.putValue(Action.NAME, message("gettingstarted.setup.connect"))
    }

    // called as part of init()
    override fun createCenterPanel(): JComponent {
        wrappers[SetupAuthenticationTabs.IDENTITY_CENTER]?.addToCenter(idcTab)
        wrappers[SetupAuthenticationTabs.BUILDER_ID]?.addToCenter(builderIdTab)
        wrappers[SetupAuthenticationTabs.IAM_LONG_LIVED]?.addToCenter(iamTab)

        idcTab.registerValidators(myDisposable) { validations ->
            if (selectedTab() == SetupAuthenticationTabs.IDENTITY_CENTER) {
                setOKActionEnabled(validations.values.all { it.okEnabled })
            }
        }

        builderIdTab.registerValidators(myDisposable) { validations ->
            if (selectedTab() == SetupAuthenticationTabs.BUILDER_ID) {
                setOKActionEnabled(validations.values.all { it.okEnabled })
            }
        }

        iamTab.registerValidators(myDisposable) { validations ->
            if (selectedTab() == SetupAuthenticationTabs.IAM_LONG_LIVED) {
                setOKActionEnabled(validations.values.all { it.okEnabled })
            }
        }

        tabSettings.forEach { tab, settings ->
            val notice = settings.notice

            wrappers[tab]?.addToTop(
                BorderLayoutPanel().apply {
                    add(JLabel(notice.message + "\u00a0"), BorderLayout.CENTER)
                    add(BrowserLink(message("gettingstarted.setup.learnmore"), notice.learnMore), BorderLayout.EAST)

                    background = when (notice.type) {
                        SetupAuthenticationNotice.NoticeType.WARNING -> JBUI.CurrentTheme.NotificationWarning.backgroundColor()
                        SetupAuthenticationNotice.NoticeType.ERROR -> JBUI.CurrentTheme.NotificationError.backgroundColor()
                    }

                    val defaultInsets = if (ExperimentalUI.isNewUI()) JBInsets.create(9, 16) else JBInsets.create(5, 10)
                    val borderColor = when (notice.type) {
                        SetupAuthenticationNotice.NoticeType.WARNING -> JBUI.CurrentTheme.NotificationWarning.borderColor()
                        SetupAuthenticationNotice.NoticeType.ERROR -> JBUI.CurrentTheme.NotificationError.borderColor()
                    }

                    border = BorderFactory.createCompoundBorder(
                        // outside border
                        BorderFactory.createMatteBorder(0, 0, 1, 0, borderColor),
                        // inside border
                        // helper util not available in JBUI until 232
                        // https://github.com/JetBrains/intellij-community/blob/222/platform/platform-api/src/com/intellij/ui/EditorNotificationPanel.java#L135-L136
                        JBUI.Borders.empty(
                            JBUI.insets("Editor.Notification.borderInsets", defaultInsets)
                        )
                    )
                }
            )
        }

        rootTabPane.add(message("gettingstarted.setup.tabs.idc"), wrappers[SetupAuthenticationTabs.IDENTITY_CENTER])
        rootTabPane.add(message("gettingstarted.setup.tabs.builderid"), wrappers[SetupAuthenticationTabs.BUILDER_ID])
        rootTabPane.add(message("gettingstarted.setup.tabs.iam"), wrappers[SetupAuthenticationTabs.IAM_LONG_LIVED])

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
            SetupAuthenticationTabs.IDENTITY_CENTER -> {
                idcTab.apply()
            }

            SetupAuthenticationTabs.IAM_LONG_LIVED -> {
                iamTab.apply()
            }

            SetupAuthenticationTabs.BUILDER_ID -> {
                builderIdTab.apply()
            }
        }
    }

    override fun doValidateAll(): List<ValidationInfo> =
        when (selectedTab()) {
            SetupAuthenticationTabs.IDENTITY_CENTER -> {
                idcTab.validateAll()
            }

            SetupAuthenticationTabs.IAM_LONG_LIVED -> {
                iamTab.validateAll()
            }

            SetupAuthenticationTabs.BUILDER_ID -> {
                emptyList()
            }
        }

    @VisibleForTesting
    public override fun doOKAction() {
        if (!okAction.isEnabled) {
            return
        }

        applyFields()
        val scopesList = if (promptForIdcPermissionSet) {
            (scopes + IDENTITY_CENTER_ROLE_ACCESS_SCOPE).toSet().toList()
        } else {
            scopes
        }
        when (selectedTab()) {
            SetupAuthenticationTabs.IDENTITY_CENTER -> {
                val tokenProvider = loginSso(project, state.idcTabState.startUrl, state.idcTabState.region.id, scopes)

                if (!promptForIdcPermissionSet) {
                    return
                }

                val rolePopup = IdcRolePopup(project, state.idcTabState.region.id, tokenProvider, state.idcTabState.rolePopupState)

                // not using showAndGet() because it throws in test mode
                rolePopup.show()
                if (!rolePopup.isOK) {
                    // don't close window if role is needed but was not confirmed
                    return
                }
            }

            SetupAuthenticationTabs.BUILDER_ID -> {
                loginSso(project, SONO_URL, SONO_REGION, scopes)
            }

            SetupAuthenticationTabs.IAM_LONG_LIVED -> {
            }
        }

        SsoSessionConfigurationManager().updateSsoSessionProfileToConfigFile(
            state.idcTabState.profileName,
            state.idcTabState.region.id,
            state.idcTabState.startUrl,
            scopesList,
            state.idcTabState.rolePopupState.roleInfo?.accountId().orEmpty(),
            state.idcTabState.rolePopupState.roleInfo?.roleName().orEmpty()
        )

        close(OK_EXIT_CODE)
    }

    private fun selectedTab() = wrappers.entries.firstOrNull { (_, wrapper) -> wrapper == rootTabPane.selectedComponent }?.key
        ?: error("Could not determine selected tab")

    private fun idcTab() = panel {
        row(message("gettingstarted.setup.iam.profile")) {
            textField()
                .comment(message("gettingstarted.setup.idc.profile.comment"))
                .errorOnApply(message("gettingstarted.setup.error.not_empty")) { it.text.isBlank() }
                .bindText(state.idcTabState::profileName)
        }

        row(message("gettingstarted.setup.idc.startUrl")) {
            textField()
                .comment(message("gettingstarted.setup.idc.startUrl.comment"))
                .align(AlignX.FILL)
                .errorOnApply(message("gettingstarted.setup.error.not_empty")) { it.text.isBlank() }
                .bindText(state.idcTabState::startUrl)
        }

        row(message("gettingstarted.setup.idc.region")) {
            comboBox(
                AwsRegionProvider.getInstance().allRegionsForService("sso").values,
                SimpleListCellRenderer.create("null") { it.displayName }
            ).bindItem(state.idcTabState::region.toNullableProperty())
                .errorOnApply(message("gettingstarted.setup.error.not_selected")) { it.selected() == null }
        }
    }

    private fun builderIdTab() = panel {
        row {
            text(message("gettingstarted.setup.builderid.notice"))
        }

        indent {
            message("gettingstarted.setup.builderid.bullets").split("\n").forEach {
                row {
                    text("<icon src='AllIcons.General.InspectionsOK'/>&nbsp;$it")
                }
            }
        }
    }

    private fun iamTab() = panel {
        row {
            text(message("gettingstarted.setup.iam.notice")) { hyperlinkEvent ->
                val actionEvent = AnActionEvent.createFromInputEvent(
                    hyperlinkEvent.inputEvent,
                    ToolkitPlaces.ADD_CONNECTION_DIALOG,
                    null,
                    DataContext { if (PlatformDataKeys.PROJECT.`is`(it)) project else null }
                )
                ActionManager.getInstance().getAction("aws.settings.upsertCredentials").actionPerformed(actionEvent)
            }
        }

        row(message("gettingstarted.setup.iam.profile")) {
            textField()
                .comment(message("gettingstarted.setup.iam.profile.comment"))
                .errorOnApply(message("gettingstarted.setup.error.not_empty")) { it.text.isBlank() }
                .bindText(state.iamTabState::profileName)
        }

        row(message("gettingstarted.setup.iam.access_key")) {
            textField()
                .errorOnApply(message("gettingstarted.setup.error.not_empty")) { it.text.isBlank() }
                .bindText(state.iamTabState::accessKey)
        }

        row(message("gettingstarted.setup.iam.secret_key")) {
            textField()
                .errorOnApply(message("gettingstarted.setup.error.not_empty")) { it.text.isBlank() }
                .bindText(state.iamTabState::secretKey)
        }
    }
}

data class IdcRolePopupState(
    var roleInfo: RoleInfo? = null
)

class IdcRolePopup(
    project: Project,
    private val region: String,
    private val tokenProvider: SdkTokenProvider,
    val state: IdcRolePopupState
) : DialogWrapper(project) {
    init {
        title = message("gettingstarted.setup.idc.role.title")
        init()
    }

    override fun createCenterPanel() = panel {
        row {
            label(message("gettingstarted.setup.idc.roleLabel"))
        }

        row {
            val combo = AsyncComboBox<RoleInfo> { label, value, _ ->
                value ?: return@AsyncComboBox
                label.text = "${value.roleName()} (${value.accountId()})"
            }

            Disposer.register(myDisposable, combo)
            combo.proposeModelUpdate { model ->
                val token = tokenProvider.resolveToken().token()
                val client = AwsClientManager.getInstance().createUnmanagedClient<SsoClient>(
                    AnonymousCredentialsProvider.create(),
                    Region.of(region)
                )

                client.listAccounts { it.accessToken(token) }
                    .accountList()
                    .flatMap { account ->
                        client.listAccountRoles {
                            it.accessToken(token)
                            it.accountId(account.accountId())
                        }.roleList()
                    }.forEach {
                        model.addElement(it)
                    }
            }

            cell(combo)
                .align(AlignX.FILL)
                .errorOnApply(message("gettingstarted.setup.error.not_selected")) { it.selected() == null }
                .bindItem(state::roleInfo.toNullableProperty())
        }
    }
}

fun rolePopupFromConnection(project: Project, connection: AwsBearerTokenConnection) {
    runInEdt {
        if (connection.isSono()) {
            requestCredentialsForExplorer(project)
        } else {
            val tokenProvider = if (connection is BearerSsoConnection && !connection.scopes.contains(IDENTITY_CENTER_ROLE_ACCESS_SCOPE)) {
                loginSso(project, connection.startUrl, connection.region, connection.scopes + IDENTITY_CENTER_ROLE_ACCESS_SCOPE)
            } else {
                connection.getConnectionSettings().tokenProvider
            }

            IdcRolePopup(project, connection.region, tokenProvider, state = IdcRolePopupState(null))
                .show()
        }
    }
}

fun requestCredentialsForCodeWhisperer(project: Project, popupBuilderIdTab: Boolean = true) =
    SetupAuthenticationDialog(
        project,
        state = SetupAuthenticationDialogState().also {
            if (popupBuilderIdTab) {
                it.selectedTab.set(SetupAuthenticationTabs.BUILDER_ID)
            }
        },
        tabSettings = mapOf(
            SetupAuthenticationTabs.IDENTITY_CENTER to AuthenticationTabSettings(
                disabled = false,
                notice = SetupAuthenticationNotice(
                    SetupAuthenticationNotice.NoticeType.WARNING,
                    message("gettingstarted.setup.codewhisperer.use_builder_id"),
                    "https://docs.aws.amazon.com/codewhisperer/latest/userguide/codewhisperer-auth.html"
                )
            ),
            SetupAuthenticationTabs.BUILDER_ID to AuthenticationTabSettings(
                disabled = false,
                notice = SetupAuthenticationNotice(
                    SetupAuthenticationNotice.NoticeType.WARNING,
                    message("gettingstarted.setup.codewhisperer.use_identity_center"),
                    "https://docs.aws.amazon.com/codewhisperer/latest/userguide/codewhisperer-auth.html"
                )
            ),
            SetupAuthenticationTabs.IAM_LONG_LIVED to AuthenticationTabSettings(
                disabled = true,
                notice = SetupAuthenticationNotice(
                    SetupAuthenticationNotice.NoticeType.ERROR,
                    message("gettingstarted.setup.codewhisperer.no_iam"),
                    "https://docs.aws.amazon.com/codewhisperer/latest/userguide/codewhisperer-auth.html"
                )
            )
        ),
        scopes = CODEWHISPERER_SCOPES,
        promptForIdcPermissionSet = false
    ).showAndGet()

fun requestCredentialsForExplorer(project: Project) =
    SetupAuthenticationDialog(
        project,
        tabSettings = mapOf(
            SetupAuthenticationTabs.BUILDER_ID to AuthenticationTabSettings(
                disabled = true,
                notice = SetupAuthenticationNotice(
                    SetupAuthenticationNotice.NoticeType.ERROR,
                    message("gettingstarted.setup.explorer.no_builder_id"),
                    "https://docs.aws.amazon.com/signin/latest/userguide/differences-aws_builder_id.html"
                )
            )
        ),
        promptForIdcPermissionSet = true
    ).show()

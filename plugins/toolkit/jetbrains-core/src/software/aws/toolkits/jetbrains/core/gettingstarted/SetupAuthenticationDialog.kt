// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.gettingstarted

import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.DataContext
import com.intellij.openapi.actionSystem.PlatformDataKeys
import com.intellij.openapi.observable.properties.PropertyGraph
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.openapi.ui.Messages
import com.intellij.openapi.ui.ValidationInfo
import com.intellij.ui.SimpleListCellRenderer
import com.intellij.ui.components.BrowserLink
import com.intellij.ui.components.JBTabbedPane
import com.intellij.ui.dsl.builder.AlignX
import com.intellij.ui.dsl.builder.bindItem
import com.intellij.ui.dsl.builder.bindText
import com.intellij.ui.dsl.builder.panel
import com.intellij.ui.dsl.builder.toMutableProperty
import com.intellij.ui.dsl.builder.toNullableProperty
import com.intellij.util.ui.JBUI
import com.intellij.util.ui.components.BorderLayoutPanel
import org.jetbrains.annotations.VisibleForTesting
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider
import software.amazon.awssdk.profiles.Profile
import software.amazon.awssdk.profiles.internal.ProfileFileReader
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.sts.StsClient
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.core.utils.error
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.tryOrNull
import software.aws.toolkits.jetbrains.ToolkitPlaces
import software.aws.toolkits.jetbrains.core.AwsClientManager
import software.aws.toolkits.jetbrains.core.credentials.ConfigFilesFacade
import software.aws.toolkits.jetbrains.core.credentials.DefaultConfigFilesFacade
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnectionManager
import software.aws.toolkits.jetbrains.core.credentials.UserConfigSsoSessionProfile
import software.aws.toolkits.jetbrains.core.credentials.loginSso
import software.aws.toolkits.jetbrains.core.credentials.sono.IDENTITY_CENTER_ROLE_ACCESS_SCOPE
import software.aws.toolkits.jetbrains.core.credentials.sono.Q_SCOPES_UNAVAILABLE_BUILDER_ID
import software.aws.toolkits.jetbrains.core.credentials.sono.SONO_REGION
import software.aws.toolkits.jetbrains.core.credentials.sono.SONO_URL
import software.aws.toolkits.jetbrains.core.gettingstarted.editor.getSourceOfEntry
import software.aws.toolkits.jetbrains.core.region.AwsRegionProvider
import software.aws.toolkits.jetbrains.utils.runUnderProgressIfNeeded
import software.aws.toolkits.jetbrains.utils.ui.editorNotificationCompoundBorder
import software.aws.toolkits.jetbrains.utils.ui.selected
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.AuthTelemetry
import software.aws.toolkits.telemetry.CredentialSourceId
import software.aws.toolkits.telemetry.FeatureId
import software.aws.toolkits.telemetry.Result
import java.awt.BorderLayout
import java.util.Locale
import java.util.Optional
import javax.swing.Action
import javax.swing.BorderFactory
import javax.swing.JComponent
import javax.swing.JLabel
import kotlin.reflect.KMutableProperty0

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

enum class SourceOfEntry {
    RESOURCE_EXPLORER,
    CODECATALYST,
    CODEWHISPERER,
    EXPLORER,
    FIRST_STARTUP,
    Q,
    AMAZONQ_CHAT_PANEL,
    UNKNOWN;
    override fun toString(): String {
        val value = this.name.lowercase()
        // If the string in lowercase contains an _ eg RESOURCE_EXPLORER, this function returns camelCase of the string i.e resourceExplorer
        return if (value.contains("_")) {
            // convert to camelCase
            (
                value.substringBefore("_") +
                    value.substringAfter("_").replaceFirstChar {
                        if (it.isLowerCase()) it.titlecase(Locale.getDefault()) else it.toString()
                    }
                )
        } else {
            value
        }
    }
}

interface AuthenticationDialog {
    val attempts: Int
    val authType: CredentialSourceId
}

class SetupAuthenticationDialog(
    private val project: Project?,
    private val scopes: List<String> = emptyList(),
    private val state: SetupAuthenticationDialogState = SetupAuthenticationDialogState(),
    private val tabSettings: Map<SetupAuthenticationTabs, AuthenticationTabSettings> = emptyMap(),
    private val promptForIdcPermissionSet: Boolean = false,
    private val configFilesFacade: ConfigFilesFacade = DefaultConfigFilesFacade(),
    private val sourceOfEntry: SourceOfEntry,
    private val featureId: FeatureId,
    private val isFirstInstance: Boolean = false,
    private val connectionInitiatedFromExplorer: Boolean = false,
    private val connectionInitiatedFromQChatPanel: Boolean = false
) : DialogWrapper(project), AuthenticationDialog {
    private val rootTabPane = JBTabbedPane()
    private val idcTab = IdcTabPanelBuilder(
        startUrl = state.idcTabState::startUrl,
        region = state.idcTabState::region,
        profileName = Optional.of(state.idcTabState::profileName)
    ).build()
    private val builderIdTab = BuilderIdTabPanelBuilder().build()
    private val iamTab = iamTab()
    private val wrappers = SetupAuthenticationTabs.values().associateWith { BorderLayoutPanel() }
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

                    val borderColor = when (notice.type) {
                        SetupAuthenticationNotice.NoticeType.WARNING -> JBUI.CurrentTheme.NotificationWarning.borderColor()
                        SetupAuthenticationNotice.NoticeType.ERROR -> JBUI.CurrentTheme.NotificationError.borderColor()
                    }

                    border = editorNotificationCompoundBorder(BorderFactory.createMatteBorder(0, 0, 1, 0, borderColor))
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
        val scopes = if (promptForIdcPermissionSet) {
            (scopes + IDENTITY_CENTER_ROLE_ACCESS_SCOPE).toSet().toList()
        } else {
            scopes
        }

        when (selectedTab()) {
            SetupAuthenticationTabs.IDENTITY_CENTER -> {
                authType = CredentialSourceId.IamIdentityCenter
                val profileName = state.idcTabState.profileName
                // we have this check here so we blow up early if user has an invalid config file
                try {
                    configFilesFacade.readSsoSessions()
                } catch (e: Exception) {
                    handleConfigFacadeError(e)
                    return
                }

                val profile = UserConfigSsoSessionProfile(
                    configSessionName = profileName,
                    ssoRegion = state.idcTabState.region.id,
                    startUrl = state.idcTabState.startUrl,
                    scopes = scopes
                )

                val connection = authAndUpdateConfig(project, profile, configFilesFacade, {}) {
                    Messages.showErrorDialog(project, it, title)
                    AuthTelemetry.addConnection(
                        project,
                        source = getSourceOfEntry(sourceOfEntry, isFirstInstance, connectionInitiatedFromExplorer, connectionInitiatedFromQChatPanel),
                        featureId = featureId,
                        credentialSourceId = CredentialSourceId.IamIdentityCenter,
                        isAggregated = false,
                        attempts = ++attempts,
                        result = Result.Failed,
                        reason = "ConnectionUnsuccessful"
                    )
                } ?: return

                if (!promptForIdcPermissionSet) {
                    ToolkitConnectionManager.getInstance(project).switchConnection(connection)
                    close(OK_EXIT_CODE)
                    return
                }

                val tokenProvider = connection.getConnectionSettings().tokenProvider

                if (project == null) error("Not allowed")

                val rolePopup = IdcRolePopup(
                    project,
                    state.idcTabState.region.id,
                    profileName,
                    tokenProvider,
                    state.idcTabState.rolePopupState,
                    configFilesFacade = configFilesFacade
                )

                if (!rolePopup.showAndGet()) {
                    // don't close window if role is needed but was not confirmed
                    return
                }
            }

            SetupAuthenticationTabs.BUILDER_ID -> {
                authType = CredentialSourceId.AwsId
                val newScopes = if (featureId == FeatureId.Q || featureId == FeatureId.Codewhisperer) scopes - Q_SCOPES_UNAVAILABLE_BUILDER_ID else scopes
                loginSso(project, SONO_URL, SONO_REGION, newScopes)
            }

            SetupAuthenticationTabs.IAM_LONG_LIVED -> {
                authType = CredentialSourceId.SharedCredentials
                val profileName = state.iamTabState.profileName
                val existingProfiles = try {
                    configFilesFacade.readAllProfiles()
                } catch (e: Exception) {
                    handleConfigFacadeError(e)
                    return
                }

                if (existingProfiles.containsKey(profileName)) {
                    Messages.showErrorDialog(project, message("gettingstarted.setup.iam.profile.exists", profileName), title)
                    AuthTelemetry.addConnection(
                        project,
                        source = getSourceOfEntry(sourceOfEntry, isFirstInstance, connectionInitiatedFromExplorer),
                        featureId = featureId,
                        credentialSourceId = CredentialSourceId.SharedCredentials,
                        isAggregated = false,
                        attempts = ++attempts,
                        result = Result.Failed,
                        reason = "DuplicateProfileName"
                    )
                    return
                }

                val callerIdentity = tryOrNull {
                    runUnderProgressIfNeeded(project, message("settings.states.validating.short"), cancelable = true) {
                        AwsClientManager.getInstance().createUnmanagedClient<StsClient>(
                            StaticCredentialsProvider.create(AwsBasicCredentials.create(state.iamTabState.accessKey, state.iamTabState.secretKey)),
                            Region.AWS_GLOBAL
                        ).use { client ->
                            client.getCallerIdentity()
                        }
                    }
                }

                if (callerIdentity == null) {
                    Messages.showErrorDialog(project, message("gettingstarted.setup.iam.profile.invalid_credentials"), title)
                    AuthTelemetry.addConnection(
                        project,
                        source = getSourceOfEntry(sourceOfEntry, isFirstInstance, connectionInitiatedFromExplorer),
                        featureId = featureId,
                        credentialSourceId = CredentialSourceId.SharedCredentials,
                        isAggregated = false,
                        attempts = ++attempts,
                        result = Result.Failed,
                        reason = "InvalidCredentials"
                    )
                    return
                }

                val profile = Profile.builder()
                    .name(profileName)
                    .properties(
                        mapOf(
                            "aws_access_key_id" to state.iamTabState.accessKey,
                            "aws_secret_access_key" to state.iamTabState.secretKey
                        )
                    )
                    .build()

                configFilesFacade.appendProfileToCredentials(profile)
            }
        }

        close(OK_EXIT_CODE)
    }

    private fun selectedTab() = wrappers.entries.firstOrNull { (_, wrapper) -> wrapper == rootTabPane.selectedComponent }?.key
        ?: error("Could not determine selected tab")

    // https://docs.aws.amazon.com/STS/latest/APIReference/API_Credentials.html
    private val accessKeyRegex = "\\w{16,128}".toRegex()

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
                .errorOnApply(message("gettingstarted.setup.iam.access_key.invalid")) { !accessKeyRegex.matches(it.text) }
                .bindText(state.iamTabState::accessKey)
        }

        row(message("gettingstarted.setup.iam.secret_key")) {
            passwordField()
                .errorOnApply(message("gettingstarted.setup.error.not_empty")) { it.password.isEmpty() }
                .bindText(state.iamTabState::secretKey)
        }
    }

    private fun handleConfigFacadeError(e: Exception) {
        // we'll consider nested exceptions and exception loops to be out of scope
        val (errorTemplate, errorType) = if (e.stackTrace.any { it.className == ProfileFileReader::class.java.canonicalName }) {
            "gettingstarted.auth.config.issue" to "ConfigParseError"
        } else {
            "codewhisperer.credential.login.exception.general" to e::class.java.name
        }

        AuthTelemetry.addConnection(
            project,
            source = getSourceOfEntry(sourceOfEntry, isFirstInstance, connectionInitiatedFromExplorer, connectionInitiatedFromQChatPanel),
            featureId = featureId,
            credentialSourceId = CredentialSourceId.IamIdentityCenter,
            isAggregated = false,
            attempts = ++attempts,
            result = Result.Failed,
            reason = errorType
        )

        val error = message(errorTemplate, e.localizedMessage ?: e::class.java.name)
        LOG.error(e) { error }
        Messages.showErrorDialog(project, error, title)
    }

    companion object {
        private val LOG = getLogger<SetupAuthenticationDialog>()
    }
}

class BuilderIdTabPanelBuilder {
    fun build() = panel {
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
}
class IdcTabPanelBuilder(
    private val startUrl: KMutableProperty0<String>,
    private val region: KMutableProperty0<AwsRegion>,
    private var profileName: Optional<KMutableProperty0<String>> = Optional.empty()
) {
    fun build() = panel {
        profileName.ifPresent {
            row(message("gettingstarted.setup.iam.profile")) {
                textField()
                    .comment(message("gettingstarted.setup.idc.profile.comment"))
                    .errorOnApply(message("gettingstarted.setup.error.not_empty")) { it.text.isBlank() }
                    .bindText(profileName.get())
            }
        }

        row(message("gettingstarted.setup.idc.startUrl")) {
            textField()
                .comment(message("gettingstarted.setup.idc.startUrl.comment"))
                .align(AlignX.FILL)
                .errorOnApply(message("gettingstarted.setup.error.not_empty")) { it.text.isBlank() }
                .errorOnApply(message("gettingstarted.setup.idc.no_builder_id")) { it.text == SONO_URL }
                .bind({ it.text.trim() }, { t, v -> t.text = v.trim() }, startUrl.toMutableProperty())
        }

        row(message("gettingstarted.setup.idc.region")) {
            comboBox(
                AwsRegionProvider.getInstance().allRegionsForService("sso").values,
                SimpleListCellRenderer.create("null") { it.displayName }
            ).bindItem(region.toNullableProperty())
                .errorOnApply(message("gettingstarted.setup.error.not_selected")) { it.selected() == null }
        }
    }
}

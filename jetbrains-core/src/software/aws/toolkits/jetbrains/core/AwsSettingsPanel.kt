package software.aws.toolkits.jetbrains.core

import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.popup.JBPopupFactory
import com.intellij.openapi.ui.popup.ListPopup
import com.intellij.openapi.ui.popup.ListPopupStep
import com.intellij.openapi.ui.popup.ListSeparator
import com.intellij.openapi.ui.popup.MnemonicNavigationFilter
import com.intellij.openapi.ui.popup.PopupStep
import com.intellij.openapi.ui.popup.PopupStep.FINAL_CHOICE
import com.intellij.openapi.ui.popup.SpeedSearchFilter
import com.intellij.openapi.wm.StatusBar
import com.intellij.openapi.wm.StatusBarWidget
import com.intellij.util.Consumer
import software.aws.toolkits.core.credentials.CredentialProviderNotFound
import software.aws.toolkits.core.credentials.ToolkitCredentialsProvider
import software.aws.toolkits.jetbrains.core.credentials.ProjectAccountSettingsManager
import software.aws.toolkits.jetbrains.core.credentials.ProjectAccountSettingsManager.AccountSettingsChangedNotifier
import software.aws.toolkits.jetbrains.core.region.AwsRegion
import software.aws.toolkits.jetbrains.core.region.AwsRegionProvider
import java.awt.event.MouseEvent
import javax.swing.Icon

class AwsSettingsPanel(private val project: Project) : StatusBarWidget, StatusBarWidget.MultipleTextValuesPresentation,
    AccountSettingsChangedNotifier {
    private val accountSettingsManager = ProjectAccountSettingsManager.getInstance(project)
    private lateinit var statusBar: StatusBar

    @Suppress("FunctionName")
    override fun ID(): String = "AwsSettingsPanel"

    override fun getTooltipText(): String? = null

    override fun getSelectedValue(): String {
        val credProviderName = try {
            accountSettingsManager.activeCredentialProvider.displayName
        } catch (_: CredentialProviderNotFound) {
            // TODO: Need to better handle the case where they have no valid profile selected
            "No credentials selected"
        }
        return "AWS: $credProviderName@${accountSettingsManager.activeRegion.name}"
    }

    @Suppress("OverridingDeprecatedMember") // No choice, part of interface contract with no default
    override fun getMaxValue(): String {
        TODO("not implemented")
    }

    override fun getPopupStep(): ListPopup? = JBPopupFactory.getInstance().createListPopup(AwsSettingSelection(project))

    override fun getClickConsumer(): Consumer<MouseEvent>? = null

    override fun getPresentation(type: StatusBarWidget.PlatformType) = this

    override fun install(statusBar: StatusBar) {
        this.statusBar = statusBar
        project.messageBus.connect().subscribe(ProjectAccountSettingsManager.ACCOUNT_SETTINGS_CHANGED, this)
        updateWidget()
    }

    override fun activeRegionChanged(value: AwsRegion) {
        updateWidget()
    }

    override fun activeCredentialsChanged(credentialsProvider: ToolkitCredentialsProvider) {
        updateWidget()
    }

    private fun updateWidget() {
        statusBar.updateWidget(ID())
    }

    override fun dispose() {
        statusBar.removeWidget(ID())
    }
}

class AwsSettingSelection(private val project: Project) : AwsListPopupStep<Any>() {
    private val accountSettingsManager = ProjectAccountSettingsManager.getInstance(project)
    private val regions = AwsRegionProvider.getInstance().regions.values.toMutableList()
    private val credentialProfileSubMenu = "Credential Profile"

    override fun getValues() = regions + credentialProfileSubMenu

    override fun onChosen(selectedValue: Any?, finalChoice: Boolean): PopupStep<*>? = when (selectedValue) {
        is AwsRegion -> {
            accountSettingsManager.activeRegion = selectedValue
            FINAL_CHOICE
        }
        credentialProfileSubMenu -> AwsCredentialSelection(project)
        else -> FINAL_CHOICE
    }

    override fun getTitle() = "AWS Account Settings"

    override fun getTextFor(value: Any?) = when (value) {
        is AwsRegion -> value.name
        else -> value.toString()
    }

    override fun getIconFor(aValue: Any?) = when (aValue) {
        is AwsRegion -> aValue.icon
        else -> null
    }

    override fun hasSubstep(selectedValue: Any?) = selectedValue == credentialProfileSubMenu

    override fun getSeparatorAbove(value: Any?) = when (value) {
        regions.first() -> ListSeparator("Region")
        credentialProfileSubMenu -> ListSeparator("Other Settings")
        else -> null
    }
}

class AwsCredentialSelection(project: Project) : AwsListPopupStep<ToolkitCredentialsProvider>() {
    private val accountSettingsManager = ProjectAccountSettingsManager.getInstance(project)

    override fun onChosen(selectedValue: ToolkitCredentialsProvider, finalChoice: Boolean): PopupStep<*>? {
        accountSettingsManager.activeCredentialProvider = selectedValue
        return FINAL_CHOICE
    }

    override fun getTitle(): String? = null

    override fun getTextFor(value: ToolkitCredentialsProvider) = value.displayName

    override fun getValues() = accountSettingsManager.credentialProviders()
}

abstract class AwsListPopupStep<T> : ListPopupStep<T> {
    override fun isSelectable(value: T?) = true

    override fun getDefaultOptionIndex() = 0

    override fun getSeparatorAbove(value: T?): ListSeparator? = null

    override fun isAutoSelectionEnabled(): Boolean = false

    override fun getFinalRunnable(): Runnable? = null

    override fun canceled() {}

    override fun getMnemonicNavigationFilter(): MnemonicNavigationFilter<T>? = null

    override fun getSpeedSearchFilter(): SpeedSearchFilter<T>? = null

    override fun hasSubstep(selectedValue: T?): Boolean = false

    override fun isMnemonicsNavigationEnabled(): Boolean = false

    override fun isSpeedSearchEnabled(): Boolean = false

    override fun getIconFor(aValue: T?): Icon? = null
}
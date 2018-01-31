package software.aws.toolkits.jetbrains.ui.widgets

import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.popup.*
import com.intellij.openapi.ui.popup.PopupStep.FINAL_CHOICE
import com.intellij.openapi.wm.StatusBar
import com.intellij.openapi.wm.StatusBarWidget
import com.intellij.util.Consumer
import software.aws.toolkits.jetbrains.core.AwsSettingsProvider
import software.aws.toolkits.jetbrains.core.SettingsChangedListener
import software.aws.toolkits.jetbrains.core.region.AwsRegion
import software.aws.toolkits.jetbrains.core.region.AwsRegionProvider
import software.aws.toolkits.jetbrains.credentials.AwsCredentialsProfileProvider
import software.aws.toolkits.jetbrains.credentials.CredentialProfile
import java.awt.event.MouseEvent
import javax.swing.Icon

class AwsSettingsPanel(private val project: Project) : StatusBarWidget, StatusBarWidget.MultipleTextValuesPresentation, SettingsChangedListener {

    private val settings = AwsSettingsProvider.getInstance(project).addListener(this)
    private var statusBar: StatusBar? = null

    @Suppress("FunctionName")
    override fun ID(): String = "AwsSettingsPanel"

    override fun getTooltipText(): String? = null

    //TODO: Need to better handle the case where they have no default profile
    override fun getSelectedValue(): String? = "AWS:${settings.currentProfile?.name ?: "default"}/${settings.currentRegion.name}"

    @Suppress("OverridingDeprecatedMember") // No choice, part of interface contract with no default
    override fun getMaxValue(): String {
        TODO("not implemented")
    }

    override fun getPopupStep(): ListPopup? = JBPopupFactory.getInstance().createListPopup(AwsSettingSelection(project))

    override fun getClickConsumer(): Consumer<MouseEvent>? = null

    override fun getPresentation(type: StatusBarWidget.PlatformType) = this

    override fun install(statusBar: StatusBar) {
        this.statusBar = statusBar
        updateWidget()
    }

    override fun regionChanged() {
        updateWidget()
    }

    override fun profileChanged() {
        updateWidget()
    }

    private fun updateWidget() {
        statusBar?.updateWidget(ID())
    }

    override fun dispose() {
        statusBar = null
    }
}

class AwsSettingSelection(private val project: Project) : AwsListPopupStep<Any>() {
    private val regions = AwsRegionProvider.getInstance(project).regions.values.toMutableList()
    private val settings = AwsSettingsProvider.getInstance(project)
    private val credentialProfileSubMenu = "Credential Profile"

    override fun getValues() = regions + credentialProfileSubMenu

    override fun onChosen(selectedValue: Any?, finalChoice: Boolean): PopupStep<*>? = when (selectedValue) {
        is AwsRegion -> {
            settings.currentRegion = selectedValue
            FINAL_CHOICE
        }
        credentialProfileSubMenu -> AwsCredentialSelection(project)
        else -> FINAL_CHOICE
    }

    override fun getTitle() = "AWS Settings"

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

class AwsCredentialSelection(project: Project) : AwsListPopupStep<CredentialProfile>() {

    private val profiles = AwsCredentialsProfileProvider.getInstance(project).getProfiles().toMutableList()
    private val settings = AwsSettingsProvider.getInstance(project)

    override fun onChosen(selectedValue: CredentialProfile?, finalChoice: Boolean): PopupStep<*>? {
        settings.currentProfile = selectedValue
        return FINAL_CHOICE
    }

    override fun getTitle(): String? = null

    override fun getTextFor(value: CredentialProfile?) = value?.name ?: ""

    override fun getValues() = profiles
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
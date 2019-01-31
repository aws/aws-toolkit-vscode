// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.ui.wizard

import com.intellij.ide.util.projectWizard.AbstractNewProjectStep
import com.intellij.openapi.projectRoots.Sdk
import com.intellij.openapi.ui.ValidationInfo
import com.intellij.util.PlatformUtils
import javax.swing.JComponent
import javax.swing.JPanel

interface SdkSelectionPanel {
    val sdkSelectionPanel: JComponent

    fun registerListeners()

    fun transformUI(panel: SamInitSelectionPanel)

    fun ensureSdk()

    fun validateAll(): List<ValidationInfo>?
}

abstract class SdkSelectionPanelBase(val callback: AbstractNewProjectStep.AbstractCallback<SamNewProjectSettings>, val generator: SamProjectGenerator) : SdkSelectionPanel {
    override fun registerListeners() {}

    override fun transformUI(panel: SamInitSelectionPanel) {
        // common transforms go here
    }

    open fun getSdk(): Sdk? = null

    override fun ensureSdk() {}

    override fun validateAll(): List<ValidationInfo>? = null
}

class NoOpSdkSelectionPanel(callback: AbstractNewProjectStep.AbstractCallback<SamNewProjectSettings>, generator: SamProjectGenerator) : SdkSelectionPanelBase(callback, generator) {
    override val sdkSelectionPanel: JComponent
        get() = JPanel()

    override fun registerListeners() {}

    override fun transformUI(panel: SamInitSelectionPanel) {}

    override fun validateAll(): List<ValidationInfo>? = null
}

class SdkSelectionPanelImpl(private val callback: AbstractNewProjectStep.AbstractCallback<SamNewProjectSettings>, val generator: SamProjectGenerator) : SdkSelectionPanel {
    private val delegate: SdkSelectionPanelBase by lazy {
        when {
            PlatformUtils.isIntelliJ() -> {
                IntelliJSdkSelectionPanel(callback, generator)
            }
            PlatformUtils.isPyCharm() -> {
                PyCharmSdkSelectionPanel(callback, generator)
            }
            else -> { NoOpSdkSelectionPanel(callback, generator) }
        }
    }

    override val sdkSelectionPanel: JComponent
        get() = delegate.sdkSelectionPanel

    override fun transformUI(panel: SamInitSelectionPanel) = delegate.transformUI(panel)

    override fun ensureSdk() {
        val sdk = delegate.getSdk()
        generator.settings.sdk = sdk
    }

    override fun validateAll() = delegate.validateAll()

    override fun registerListeners() = delegate.registerListeners()
}
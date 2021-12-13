// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.uitests.fixtures

import com.intellij.remoterobot.RemoteRobot
import com.intellij.remoterobot.data.RemoteComponent
import com.intellij.remoterobot.fixtures.FixtureName
import com.intellij.remoterobot.fixtures.JLabelFixture
import com.intellij.remoterobot.search.locators.byXpath
import com.intellij.remoterobot.stepsProcessing.step
import java.time.Duration

fun RemoteRobot.preferencesDialog(
    timeout: Duration = Duration.ofSeconds(20),
    function: PreferencesDialog.() -> Unit
) {
    step("Search for preferences dialog") {
        val dialog = find<PreferencesDialog>(DialogFixture.byTitleContains(preferencesTitle()), timeout)

        dialog.apply(function)

        if (dialog.isShowing) {
            dialog.close()
        }
    }
}

@FixtureName("Preferences")
open class PreferencesDialog(
    remoteRobot: RemoteRobot,
    remoteComponent: RemoteComponent
) : DialogFixture(remoteRobot, remoteComponent) {
    fun search(query: String) = step("Search $query") {
        textField(byXpath("//div[@class='SettingsSearch']//div[@class='TextFieldWithProcessing']")).text = query
    }

    fun selectPreferencePage(vararg crumbs: String) {
        val preferencesTree = find<JTreeFixture>(byXpath("//div[@class='MyTree']"))

        preferencesTree.expand(*crumbs)
        preferencesTree.clickPath(*crumbs)
    }

    override fun pressOk() {
        super.pressOk()

        assertValidSettings()
    }

    fun assertValidSettings() {
        val invalidSettingsLabel = jLabels(JLabelFixture.byContainsText("Cannot Save Settings"))
        if (invalidSettingsLabel.isNotEmpty()) {
            throw IllegalStateException("Could not save settings: ${invalidSettingsLabel.first().value}")
        }
    }
}

fun RemoteRobot.preferencesTitle() = if (this.isMac()) "Preferences" else "Settings"

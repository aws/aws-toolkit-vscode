// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.uitests.fixtures

import com.intellij.remoterobot.RemoteRobot
import com.intellij.remoterobot.data.RemoteComponent
import com.intellij.remoterobot.fixtures.CommonContainerFixture
import com.intellij.remoterobot.fixtures.ComponentFixture
import com.intellij.remoterobot.fixtures.DefaultXpath
import com.intellij.remoterobot.fixtures.FixtureName
import com.intellij.remoterobot.search.locators.byXpath
import java.nio.file.Path

fun RemoteRobot.welcomeFrame(function: WelcomeFrame.() -> Unit) {
    find(WelcomeFrame::class.java).apply(function)
}

@FixtureName("Welcome Frame")
@DefaultXpath("type", "//div[@class='FlatWelcomeFrame' and @visible='true']")
class WelcomeFrame(remoteRobot: RemoteRobot, remoteComponent: RemoteComponent) : CommonContainerFixture(remoteRobot, remoteComponent) {
    fun openNewProjectWizard() {
        actionLink("Create New Project").click()
    }

    fun openPreferences() {
        actionLink("Configure").click()

        find(ComponentFixture::class.java, byXpath("//div[@class='MyList']"))
            .findText(remoteRobot.preferencesTitle())
            .click()
    }

    fun openFolder(path: Path) {
        try {
            // 2020.1
            actionLink("Open or Import").click()
        } catch (e: Exception) {
            // 2019.3
            actionLink("Open").click()
        }
        fillFileExplorer(path)
    }
}

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
import com.intellij.remoterobot.stepsProcessing.log
import com.intellij.remoterobot.stepsProcessing.step
import java.nio.file.Path
import java.time.Duration

fun RemoteRobot.welcomeFrame(function: WelcomeFrame.() -> Unit) {
    // give it a longer time to find the welcome frame, sometimes takes > 2 seconds
    find(WelcomeFrame::class.java, Duration.ofSeconds(10)).apply(function)
}

@FixtureName("Welcome Frame")
@DefaultXpath("type", "//div[@class='FlatWelcomeFrame' and @visible='true']")
class WelcomeFrame(remoteRobot: RemoteRobot, remoteComponent: RemoteComponent) : CommonContainerFixture(remoteRobot, remoteComponent) {
    fun openNewProjectWizard() {
        selectTab("Projects")
        // This can match two things: If no previous projects, its a SVG icon, else a jbutton
        findAll<ComponentFixture>(byXpath("//div[contains(@accessiblename, 'New Project') and (@class='MainButton' or @class='JButton')]")).first().click()
    }

    fun openPreferences() = step("Opening preferences dialog") {
        selectTab("Customize")
        findAndClick("//div[@accessiblename='All settings…']")

        log.info("Successfully opened the preferences dialog")
    }

    fun selectTab(tabName: String) {
        find<JTreeFixture>(JTreeFixture.byType()).clickRowWithText(tabName, fullMatch = false)
    }

    fun openFolder(path: Path) {
        selectTab("Projects")
        findAll<ComponentFixture>(byXpath("//div[contains(@accessiblename, 'Open') and (@class='MainButton' or @class='JButton')]")).first().click()
        fileBrowser("Open") {
            selectFile(path)
        }
    }
}

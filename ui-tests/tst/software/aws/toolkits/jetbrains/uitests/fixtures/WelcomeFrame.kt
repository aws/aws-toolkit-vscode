// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.uitests.fixtures

import com.intellij.remoterobot.RemoteRobot
import com.intellij.remoterobot.data.RemoteComponent
import com.intellij.remoterobot.fixtures.ActionLinkFixture
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
        // TODO: Remove FIX_WHEN_MIN_IS_203
        if (remoteRobot.ideMajorVersion() <= 202) {
            actionLink(ActionLinkFixture.byTextContains("New Project")).click()
        } else {
            selectTab("Projects")
            // This can match two things: If no previous projects, its a SVG icon, else a jbutton
            findAll<ComponentFixture>(byXpath("//div[contains(@accessiblename, 'New Project') and (@class='MainButton 'or @class='JButton')]")).first().click()
        }
    }

    fun openPreferences() = step("Opening preferences dialog") {
        // TODO: Remove FIX_WHEN_MIN_IS_203
        if (remoteRobot.ideMajorVersion() <= 202) {
            actionLink("Configure").click()

            // MyList finds both the list of actions and the most recently used file list, so get all candidates
            val found = findAll(ComponentFixture::class.java, byXpath("//div[@class='MyList']"))
                .any {
                    try {
                        it.findText(remoteRobot.preferencesTitle()).click()
                        true
                    } catch (e: NoSuchElementException) {
                        false
                    }
                }

            if (!found) {
                throw IllegalStateException("Unable to find ${remoteRobot.preferencesTitle()} in the configure menu")
            }
        } else {
            selectTab("Customize")
            findAndClick("//div[@accessiblename='All settings…']")
        }

        log.info("Successfully opened the preferences dialog")
    }

    fun selectTab(tabName: String) {
        // TODO: Remove FIX_WHEN_MIN_IS_203
        if (remoteRobot.ideMajorVersion() <= 202) return
        jList(byXpath("//div[@accessiblename='Welcome screen categories']")).selectItem(tabName)
    }

    fun openFolder(path: Path) {
        // TODO: Remove FIX_WHEN_MIN_IS_203
        if (remoteRobot.ideMajorVersion() <= 202) {
            actionLink(ActionLinkFixture.byTextContains("Open")).click()
        } else {
            selectTab("Projects")
            findAll<ComponentFixture>(byXpath("//div[contains(@accessiblename, 'Open') and (@class='MainButton 'or @class='JButton')]")).first().click()
        }
        fileBrowser("Open") {
            selectFile(path)
        }
    }
}

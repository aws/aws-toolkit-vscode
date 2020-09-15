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
        actionLink(ActionLinkFixture.byTextContains("New Project")).click()
    }

    fun openPreferences() = step("Opening preferences dialog") {
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
        log.info("Successfully opened the preferences dialog")
    }

    fun openFolder(path: Path) {
        actionLink(ActionLinkFixture.byTextContains("Open")).click()
        fileBrowser("Open") {
            selectFile(path)
        }
    }
}

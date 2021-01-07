// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.uitests.fixtures

import com.intellij.remoterobot.RemoteRobot
import com.intellij.remoterobot.data.RemoteComponent
import com.intellij.remoterobot.fixtures.FixtureName
import com.intellij.remoterobot.search.locators.byXpath
import com.intellij.remoterobot.stepsProcessing.step
import com.intellij.remoterobot.utils.keyboard
import java.awt.event.KeyEvent
import java.time.Duration

fun IdeaFrame.projectStructureDialog(
    timeout: Duration = Duration.ofSeconds(20),
    function: ProjectStructureDialog.() -> Unit
) {
    step("Project Structure dialog") {
        if (remoteRobot.isMac()) {
            keyboard { hotKey(KeyEvent.VK_META, KeyEvent.VK_SEMICOLON) }
        } else {
            keyboard { hotKey(KeyEvent.VK_CONTROL, KeyEvent.VK_ALT, KeyEvent.VK_SHIFT, KeyEvent.VK_S) }
        }

        val dialog = find<ProjectStructureDialog>(byXpath("//div[@accessiblename='Project Structure']"), timeout)

        dialog.apply(function)

        if (dialog.isShowing) {
            dialog.close()
        }
    }
}

@FixtureName("ProjectStructure")
open class ProjectStructureDialog(
    remoteRobot: RemoteRobot,
    remoteComponent: RemoteComponent
) : DialogFixture(remoteRobot, remoteComponent)

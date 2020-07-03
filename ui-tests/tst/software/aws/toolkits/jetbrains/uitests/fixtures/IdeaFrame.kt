// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.uitests.fixtures

import com.intellij.remoterobot.RemoteRobot
import com.intellij.remoterobot.data.RemoteComponent
import com.intellij.remoterobot.fixtures.CommonContainerFixture
import com.intellij.remoterobot.fixtures.ComponentFixture
import com.intellij.remoterobot.fixtures.ContainerFixture
import com.intellij.remoterobot.fixtures.DefaultXpath
import com.intellij.remoterobot.fixtures.FixtureName
import com.intellij.remoterobot.search.locators.byXpath
import com.intellij.remoterobot.stepsProcessing.step
import com.intellij.remoterobot.utils.keyboard
import com.intellij.remoterobot.utils.waitFor
import java.awt.event.KeyEvent
import java.time.Duration

fun RemoteRobot.idea(function: IdeaFrame.() -> Unit) {
    find<IdeaFrame>().apply(function)
}

@FixtureName("Idea frame")
@DefaultXpath("IdeFrameImpl type", "//div[@class='IdeFrameImpl']")
class IdeaFrame(remoteRobot: RemoteRobot, remoteComponent: RemoteComponent) : CommonContainerFixture(remoteRobot, remoteComponent) {
    val projectViewTree
        get() = find<ContainerFixture>(byXpath("ProjectViewTree", "//div[@class='ProjectViewTree']"))

    val projectName
        get() = step("Get project name") { return@step callJs<String>("component.getProject().getName()") }

    fun dumbAware(timeout: Duration = Duration.ofMinutes(5), function: () -> Unit) {
        step("Wait for smart mode") {
            waitFor(duration = timeout, interval = Duration.ofSeconds(5)) {
                runCatching { isDumbMode().not() }.getOrDefault(false)
            }
            function()
            step("..wait for smart mode again") {
                waitFor(duration = timeout, interval = Duration.ofSeconds(5)) {
                    isDumbMode().not()
                }
            }
        }
    }

    fun waitForBackgroundTasks(timeout: Duration = Duration.ofMinutes(5)) {
        step("Wait for background tasks to finish") {
            waitFor(duration = timeout, interval = Duration.ofSeconds(5)) {
                findAll<ComponentFixture>(byXpath("//div[@myname='Background process']")).isEmpty()
            }
        }
    }

    private fun isDumbMode(): Boolean = callJs("com.intellij.openapi. project.DumbService.isDumb(component.project);", true)

    fun openProjectStructure() = step("Open Project Structure dialog") {
        if (remoteRobot.isMac()) {
            keyboard { this.hotKey(KeyEvent.VK_META, KeyEvent.VK_SEMICOLON) }
        } else {
            keyboard { this.hotKey(KeyEvent.VK_SHIFT, KeyEvent.VK_SHIFT, KeyEvent.VK_ALT, KeyEvent.VK_S) }
        }
        find(ComponentFixture::class.java, byXpath("//div[@accessiblename='Project Structure']")).click()
    }
}

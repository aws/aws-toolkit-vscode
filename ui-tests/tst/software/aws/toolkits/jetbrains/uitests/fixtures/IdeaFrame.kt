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
import com.intellij.remoterobot.stepsProcessing.step
import com.intellij.remoterobot.utils.waitFor
import java.time.Duration

fun RemoteRobot.idea(function: IdeaFrame.() -> Unit) {
    val frame = find<IdeaFrame>(timeout = Duration.ofSeconds(10))
    // FIX_WHEN_MIN_IS_203 remove this and set the system property "ide.show.tips.on.startup.default.value"
    frame.apply { dumbAware { tryCloseTips() } }
    frame.apply(function)
}

@FixtureName("Idea frame")
@DefaultXpath("IdeFrameImpl type", "//div[@class='IdeFrameImpl']")
class IdeaFrame(remoteRobot: RemoteRobot, remoteComponent: RemoteComponent) : CommonContainerFixture(remoteRobot, remoteComponent) {
    init {
        waitForProjectToBeAssigned()
    }

    private fun waitForProjectToBeAssigned() {
        waitFor(duration = Duration.ofSeconds(30)) {
            callJs(
                """
                var frameHelper = com.intellij.openapi.wm.impl.ProjectFrameHelper.getFrameHelper(component);
                frameHelper.project != null
                """.trimIndent(),
                runInEdt = true
            )
        }
    }

    fun dumbAware(timeout: Duration = Duration.ofMinutes(5), function: () -> Unit) {
        step("Wait for smart mode") {
            waitFor(duration = timeout, interval = Duration.ofSeconds(5)) {
                isDumbMode().not()
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
                // TODO FIX_WHEN_MIN_IS_202 remove the background process one
                findAll<ComponentFixture>(byXpath("//div[@myname='Background process']")).isEmpty() &&
                    // search for the progress bar
                    findAll<ComponentFixture>(byXpath("//div[@class='JProgressBar']")).isEmpty()
            }
        }
    }

    private fun isDumbMode(): Boolean = callJs(
        """
            var frameHelper = com.intellij.openapi.wm.impl.ProjectFrameHelper.getFrameHelper(component);
            com.intellij.openapi.project.DumbService.isDumb(frameHelper.project);
        """.trimIndent(),
        runInEdt = true
    )

    // Tips sometimes open when running, close it if it opens
    fun tryCloseTips() {
        step("Close Tip of the Day if it appears") {
            try {
                find<DialogFixture>(DialogFixture.byTitleContains("Tip")).close()
            } catch (e: Exception) {
            }
        }
    }

    fun findToast(timeout: Duration = Duration.ofSeconds(5)): ComponentFixture = find(byXpath("//div[@class='StatusPanel']"), timeout)
    fun findToastText(timeout: Duration = Duration.ofSeconds(5)): List<String> = findToast(timeout).findAllText().map { it.text }
}

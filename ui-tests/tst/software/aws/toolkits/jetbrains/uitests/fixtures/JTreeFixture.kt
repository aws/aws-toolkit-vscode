// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.uitests.fixtures

import com.intellij.remoterobot.RemoteRobot
import com.intellij.remoterobot.data.RemoteComponent
import com.intellij.remoterobot.fixtures.ComponentFixture
import com.intellij.remoterobot.stepsProcessing.step
import com.intellij.remoterobot.utils.waitFor
import org.assertj.swing.timing.Pause
import java.time.Duration

class JTreeFixture(
    remoteRobot: RemoteRobot,
    remoteComponent: RemoteComponent
) : ComponentFixture(remoteRobot, remoteComponent) {
    var separator: String = "/"

    fun hasPath(vararg paths: String) = try {
        runJsPathMethod("node", *paths)
        true
    } catch (e: Exception) {
        false
    }

    fun clickPath(vararg paths: String) = runJsPathMethod("clickPath", *paths)
    fun expandPath(vararg paths: String) = runJsPathMethod("expandPath", *paths)
    fun rightClickPath(vararg paths: String) = runJsPathMethod("rightClickPath", *paths)
    fun doubleClickPath(vararg paths: String) = runJsPathMethod("doubleClickPath", *paths)

    fun requireSelection(vararg paths: String) {
        val path = paths.joinToString(separator)
        step("requireSelection $path") {
            runJs(
                """
                const jTreeFixture = JTreeFixture(robot, component);
                jTreeFixture.replaceSeparator('$separator')
                // Have to disambiguate int[] vs string[]
                jTreeFixture['requireSelection(java.lang.String[])'](['$path']) 
                """.trimIndent()
            )
        }
    }

    private fun runJsPathMethod(name: String, vararg paths: String) {
        val path = paths.joinToString(separator)
        step("$name $path") {
            runJs(
                """
                const jTreeFixture = JTreeFixture(robot, component);
                jTreeFixture.replaceSeparator('$separator')
                jTreeFixture.$name('$path') 
                """.trimIndent()
            )
        }
    }
}

fun JTreeFixture.waitUntilLoaded() {
    step("waiting for loading text to go away...") {
        Pause.pause(100)
        waitFor(duration = Duration.ofMinutes(1)) {
            // Do not use hasText(String) https://github.com/JetBrains/intellij-ui-test-robot/issues/10
            !hasText { txt -> txt.text == "loading..." }
        }
        Pause.pause(100)
    }
}

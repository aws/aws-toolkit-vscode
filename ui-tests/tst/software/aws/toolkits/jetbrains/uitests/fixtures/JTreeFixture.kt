// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.uitests.fixtures

import com.intellij.remoterobot.RemoteRobot
import com.intellij.remoterobot.data.RemoteComponent
import com.intellij.remoterobot.fixtures.ComponentFixture
import com.intellij.remoterobot.stepsProcessing.step

class JTreeFixture(
    remoteRobot: RemoteRobot,
    remoteComponent: RemoteComponent
) : ComponentFixture(remoteRobot, remoteComponent) {
    var separator: String = "/"

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

    fun clickRow(row: Int) = runJsRowMethod("clickRow", row)
    fun expandRow(row: Int) = runJsRowMethod("expandRow", row)

    private fun runJsPathMethod(name: String, vararg paths: String) {
        val path = paths.joinToString("/")
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

    private fun runJsRowMethod(name: String, row: Int) {
        step("$name $row") {
            runJs(
                """
                const jTreeFixture = JTreeFixture(robot, component);
                jTreeFixture.replaceSeparator('$separator')
                jTreeFixture.$name($row) 
                """.trimIndent()
            )
        }
    }
}

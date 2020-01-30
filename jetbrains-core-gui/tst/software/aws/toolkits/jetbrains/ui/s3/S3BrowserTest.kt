// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.ui.s3

import com.intellij.openapi.application.ApplicationInfo
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.testGuiFramework.driver.ExtendedJTreePathFinder
import com.intellij.testGuiFramework.fixtures.IdeFrameFixture
import com.intellij.testGuiFramework.fixtures.TreeTableFixture
import com.intellij.testGuiFramework.impl.GuiTestUtilKt
import com.intellij.testGuiFramework.impl.button
import com.intellij.testGuiFramework.impl.findComponentWithTimeout
import com.intellij.testGuiFramework.impl.jTree
import com.intellij.testGuiFramework.impl.textfield
import com.intellij.testGuiFramework.impl.waitAMoment
import com.intellij.testGuiFramework.util.Predicate
import com.intellij.testGuiFramework.util.step
import com.intellij.ui.treeStructure.treetable.TreeTable
import org.fest.swing.core.MouseButton
import org.fest.swing.driver.ComponentPreconditions
import org.fest.swing.driver.JTreeLocation
import org.junit.After
import org.junit.Test
import software.aws.toolkits.jetbrains.EmptyProjectTestCase
import software.aws.toolkits.jetbrains.fixtures.clickMenuItem
import software.aws.toolkits.jetbrains.fixtures.configureConnection
import java.awt.Dimension
import java.awt.Point
import java.awt.Rectangle
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.UUID
import kotlin.test.assertNotNull
import kotlin.test.assertNull

class S3BrowserTest : EmptyProjectTestCase() {

    private val profile = "Profile:default"
    private val date = LocalDate.now().format(DateTimeFormatter.BASIC_ISO_DATE)
    private val bucket = "uitest-$date-${UUID.randomUUID()}"

    @Test
    fun s3MainFunctionality() {
        // TODO fix tests on 2019.3
        val info = ApplicationInfo.getInstance()
        if (info.majorVersion != "2019" || info.minorVersionMainPart != "2") {
            return
        }

        ideFrame {
            waitForBackgroundTasksToFinish()

            configureConnection(profile, "Oregon (us-west-2)")

            toolwindow("aws.explorer") {
                activate()
                step("Create bucket named $bucket") {
                    jTree(S3_NAME).path(S3_NAME).rightClickPath()
                    clickMenuItem { it.text.startsWith(CREATE_BUCKET) }
                    dialog(CREATE_BUCKET) {
                        textfield(null).setText(bucket)
                        button(CREATE_BUTTON).click()
                    }
                    waitAMoment()
                }

                step("Open editor for bucket $bucket") {
                    with(jTree(S3_NAME).expandPath(S3_NAME)) {
                        path(S3_NAME, bucket).doubleClickPath()
                        waitAMoment()
                    }
                }
            }

            treeTable {
                step("Upload object to top-level") {
                    rightClick()
                    clickMenuItem { it.text.contains(UPLOAD_ACTION) }
                    fileChooserDialog {
                        setPath(testDataPath.resolve("testFiles").resolve(JSON_FILE).toString())
                        clickOk()
                    }

                    waitAMoment()

                    assertNotNull(findPath(JSON_FILE))
                }

                step("Create folder") {
                    rightClick()
                    clickMenuItem { it.text.contains(NEW_FOLDER_ACTION) }
                    dialog(NEW_FOLDER_ACTION) {
                        textfield(null).setText(FOLDER)
                        button(OK_BUTTON).clickWhenEnabled()
                    }

                    waitAMoment()

                    assertNotNull(findPath(FOLDER))
                }

                step("Upload object to folder") {
                    rightClick(0, FOLDER)
                    clickMenuItem { it.text.contains(UPLOAD_ACTION) }
                    fileChooserDialog {
                        setPath(testDataPath.resolve("testFiles").resolve(JSON_FILE).toString())
                        clickOk()
                    }

                    waitAMoment()

                    doubleClick(0, FOLDER)

                    assertNotNull(findPath(FOLDER, JSON_FILE))
                }

                step("Rename a file") {
                    rightClick(0, FOLDER, JSON_FILE)
                    clickMenuItem { it.text.contains(RENAME_ACTION) }

                    dialog(RENAME_ACTION) {
                        textfield(null).setText(NEW_JSON_FILE_NAME)
                        button(OK_BUTTON).clickWhenEnabled()
                    }

                    waitAMoment()

                    assertNotNull(findPath(FOLDER, NEW_JSON_FILE_NAME))
                }

                step("Delete a file") {
                    rightClick(0, FOLDER, NEW_JSON_FILE_NAME)
                    clickMenuItem { it.text.contains(DELETE_ACTION) }

                    findMessageDialog(DELETE_ACTION).click(DELETE_PREFIX)

                    waitAMoment()

                    assertNull(findPath(FOLDER, NEW_JSON_FILE_NAME))
                }

                step("Open known file-types") {
                    doubleClick(0, JSON_FILE)

                    waitAMoment()

                    assertNotNull(FileEditorManager.getInstance(project).allEditors.mapNotNull { it.file }.find {
                        it.name.contains(JSON_FILE) && it.fileType::class.simpleName?.contains("JsonFileType") == true
                    })
                }
            }
        }
    }

    @After
    fun cleanUp() {
        // TODO fix tests on 2019.3
        val info = ApplicationInfo.getInstance()
        if (info.majorVersion != "2019" || info.minorVersionMainPart != "2") {
            return
        }
        step("Delete bucket named $bucket") {
            ideFrame {
                toolwindow("aws.explorer") {
                    with(jTree(S3_NAME).expandPath(S3_NAME)) {
                        path(S3_NAME, bucket).rightClickPath()
                    }

                    clickMenuItem { it.text.contains(DELETE_PREFIX) }
                    dialog(DELETE_PREFIX, predicate = Predicate.startWith) {
                        textfield(null).setText(bucket)
                        button(OK_BUTTON).clickWhenEnabled()
                    }

                    waitAMoment()
                }
            }
        }
    }

    private fun TreeTableFixture.findPath(vararg paths: String) = try {
        ExtendedJTreePathFinder(target().tree).findMatchingPath(paths.toList())
    } catch (_: Exception) {
        null
    }

    private fun IdeFrameFixture.treeTable(block: TreeTableFixture.() -> Unit) {
        block(TreeTableFixture(robot(), findComponentWithTimeout(this.target(), TreeTable::class.java)))
    }

    /** Copied from [com.intellij.testGuiFramework.fixtures.TreeTableFixture] and added support for right-click / double-click **/
    private fun TreeTableFixture.rightClick(column: Int, vararg pathStrings: String) {

        step("right-click at column #$column with path ${pathStrings.joinToString(prefix = "[", postfix = "]")}") {
            val clickPoint = findPointForPath(column, pathStrings)

            robot().click(target(), clickPoint, MouseButton.RIGHT_BUTTON, 1)
        }
    }

    private fun TreeTableFixture.doubleClick(column: Int, vararg pathStrings: String) {

        step("double-click at column #$column with path ${pathStrings.joinToString(prefix = "[", postfix = "]")}") {
            val clickPoint = findPointForPath(column, pathStrings)

            robot().click(target(), clickPoint, MouseButton.LEFT_BUTTON, 2)
        }
    }

    private fun TreeTableFixture.findPointForPath(column: Int, pathStrings: Array<out String>): Point {
        ComponentPreconditions.checkEnabledAndShowing(target())

        val tree = target().tree
        val path = ExtendedJTreePathFinder(tree).findMatchingPath(pathStrings.toList())

        val clickPoint = GuiTestUtilKt.computeOnEdt {
            var x = target().location.x + (0 until column).sumBy { target().columnModel.getColumn(it).width }
            x += target().columnModel.getColumn(column).width / 3
            val y = JTreeLocation().pathBoundsAndCoordinates(tree, path).second.y
            Point(x, y)
        }!!

        val visibleHeight = target().visibleRect.height

        target().scrollRectToVisible(Rectangle(Point(0, clickPoint.y + visibleHeight / 2), Dimension(0, 0)))
        return clickPoint
    }

    companion object {
        const val FOLDER = "some-folder"
        const val JSON_FILE = "hello.json"
        const val CREATE_BUCKET = "Create S3 Bucket"
        const val CREATE_BUTTON = "Create"
        const val S3_NAME = "S3"
        const val UPLOAD_ACTION = "Upload..."
        const val NEW_FOLDER_ACTION = "New folder..."
        const val OK_BUTTON = "OK"
        const val DELETE_PREFIX = "Delete"
        const val RENAME_ACTION = "Rename..."
        const val DELETE_ACTION = "$DELETE_PREFIX..."
        const val NEW_JSON_FILE_NAME = "new-name.json"
    }
}

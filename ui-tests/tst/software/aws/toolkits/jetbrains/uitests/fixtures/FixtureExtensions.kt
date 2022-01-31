// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.uitests.fixtures

import com.intellij.remoterobot.fixtures.CommonContainerFixture
import com.intellij.remoterobot.fixtures.ComponentFixture
import com.intellij.remoterobot.fixtures.ContainerFixture
import com.intellij.remoterobot.fixtures.JTextAreaFixture
import com.intellij.remoterobot.fixtures.JTextFieldFixture
import com.intellij.remoterobot.search.locators.byXpath
import com.intellij.remoterobot.stepsProcessing.step
import com.intellij.remoterobot.utils.keyboard
import org.intellij.lang.annotations.Language
import java.time.Duration

fun ContainerFixture.pressOk() = findAndClick("//div[@text='OK']")
fun ContainerFixture.pressDelete() = findAndClick("//div[@text='Delete']")
fun ContainerFixture.pressCancel() = findAndClick("//div[@text='Cancel']")

fun ContainerFixture.findAndClick(@Language("XPath") xPath: String) = findByXpath(xPath).click()
fun ContainerFixture.findByXpath(xPath: String) = find<ComponentFixture>(byXpath(xPath), Duration.ofSeconds(5))

fun ContainerFixture.fillSingleTextField(text: String) = step("Fill single text field with $text") {
    find<JTextFieldFixture>(byXpath("//div[@class='JTextField']"), Duration.ofSeconds(5)).setTextWithoutFocus(text)
}

// swing robot appears to have issues acquiring focus on MATE desktop with some dialog windows
// org.assertj.swing.exception.ActionFailedException: Focus change to javax.swing.JTextField[name=null, text='', enabled=true, visible=true, showing=true] failed focus owner: Null Component (js#8)
fun JTextFieldFixture.setTextWithoutFocus(text: String) = apply {
    runJs("component.setText('$text')")
}

fun ContainerFixture.fillSearchTextField(text: String) = step("Fill search text field with $text") {
    val field = find<ComponentFixture>(byXpath("//div[@class='SearchTextField']"), Duration.ofSeconds(5))
    field.runJs(
        """
            component.getTextEditor().setText('$text');
            component.getTextEditor().postActionEvent();
        """.trimIndent(),
        runInEdt = true
    )
}

fun ContainerFixture.clearSearchTextField() = step("Clear search text field") {
    val field = find<ComponentFixture>(byXpath("//div[@class='SearchTextField']"), Duration.ofSeconds(5))
    field.runJs(
        """
            component.getTextEditor().getClientProperty('JTextField.Search.CancelAction').actionPerformed(null)
        """.trimIndent(),
        runInEdt = true
    )
}

fun ContainerFixture.fillDeletionAndConfirm() = step("Fill in delete me and delete") {
    find<JTextFieldFixture>(byXpath("//div[@accessiblename='Delete confirmation box']"), Duration.ofSeconds(5)).setTextWithoutFocus("delete me")
    pressOk()
}

// There is no function to write text to this directly :(
fun ContainerFixture.fillSingleJBTextArea(text: String) = step("Fill single JBTextArea with $text") {
    find<JTextAreaFixture>(byXpath("//div[@class='JBTextArea']")).click()
    keyboard { this.enterText(text) }
}

fun ContainerFixture.fillAllJBTextFields(text: String) = step("Fill all visible text fields with $text") {
    findAll(JTextFieldFixture::class.java, byXpath("//div[@class='JBTextField']")).forEach { it.text = text }
}

fun ContainerFixture.pressCreate() = step("Press the \"Create\" button") {
    find<ComponentFixture>(byXpath("//div[@text='Create']")).click()
}

fun ContainerFixture.pressSave() = step("""Press the "Save" button""") {
    find<ComponentFixture>(byXpath("//div[@text='Save']")).click()
}

fun ContainerFixture.pressYes() = step("""Press the visible "yes" button""") {
    findAndClick("//div[@class='JButton' and @text='Yes']")
}

/*
 * Find an action button by button text instead of by xPath
 */
fun CommonContainerFixture.actionButton(buttonText: String) = actionButton(byXpath("//div[@accessiblename='$buttonText' and @class='ActionButton']"))

// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.upload

import assertk.Assert
import assertk.assert
import assertk.assertions.contains
import assertk.assertions.isNotNull
import assertk.assertions.isNull
import com.intellij.openapi.ui.ValidationInfo
import com.intellij.testFramework.EdtRule
import com.intellij.testFramework.ProjectRule
import com.intellij.testFramework.RuleChain
import com.intellij.testFramework.RunsInEdt
import com.intellij.testFramework.runInEdtAndGet
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.lambda.model.Runtime
import javax.swing.DefaultComboBoxModel

@RunsInEdt
class UploadToLambdaValidatorTest {
    private val projectRule = ProjectRule()

    @Rule
    @JvmField
    val ruleChain = RuleChain(projectRule, EdtRule())

    private val sut = UploadToLambdaValidator()
    private val view = runInEdtAndGet {
        CreateLambdaPanel(projectRule.project)
    }

    @Test
    fun validFunctionReturnsNull() {
        assert(sut.doValidate(view)).isNull()
    }

    @Test
    fun nameMustBeSpecified() {
        view.name.text = ""
        assert(sut.doValidate(view)).containsMessage("Function Name must be specified")
    }

    @Test
    fun validFunctionNameLength() {
        view.name.text = "aStringThatIsGreaterThanSixtyFourCharactersInLengthAndIsThereforeInvalid"
        assert(sut.doValidate(view)).containsMessage("must not exceed 64 characters")
    }

    @Test
    fun validFunctionCanOnlyContainAlphanumerics() {
        view.name.text = "a string"
        assert(sut.doValidate(view)).containsMessage("alphanumerics")
    }

    @Test
    fun handlerCannotBeBlank() {
        view.handler.text = ""
        assert(sut.doValidate(view)).containsMessage("Handler must be specified")
    }

    @Test
    fun runtimeMustBeSelected() {
        view.runtime.selectedItem = null
        assert(sut.doValidate(view)).containsMessage("Runtime must be specified")
    }

    @Test
    fun sourceBucketMustBeSelected() {
        view.sourceBucket.selectedItem = null
        assert(sut.doValidate(view)).containsMessage("Bucket must be specified")
    }

    @Test
    fun iamRoleMustBeSelected() {
        view.iamRole.selectedItem = null
        assert(sut.doValidate(view)).containsMessage("IAM role must be specified")
    }

    @Test
    fun timeoutMustBeSpecified() {
        view.timeout.text = ""
        assert(sut.doValidate(view)).containsMessage("Timeout must be between")
    }

    @Test
    fun timeoutMustBeNumeric() {
        view.timeout.text = "foo"
        assert(sut.doValidate(view)).containsMessage("Timeout must be between")
    }

    @Test
    fun timeoutMustBeWithinLowerBound() {
        view.timeout.text = "0"
        assert(sut.doValidate(view)).containsMessage("Timeout must be between")
    }

    @Test
    fun timeoutMustBeWithinUpperBound() {
        view.timeout.text = "301"
        assert(sut.doValidate(view)).containsMessage("Timeout must be between")
    }

    @Before
    @Suppress("UNCHECKED_CAST")
    fun wireMocksTogetherWithValidOptions() {
        view.name.text = "name"
        view.description.text = "description"
        view.handler.text = "handler"
        val role = IamRole("", "")
        view.iamRole.model = DefaultComboBoxModel(arrayOf(role))
        view.iamRole.selectedItem = role
        view.runtime.model = DefaultComboBoxModel(Runtime.knownValues().toTypedArray())
        view.runtime.selectedItem = Runtime.JAVA8
        val bucket = "sourceBucket"
        view.sourceBucket.model = DefaultComboBoxModel(arrayOf(bucket))
        view.sourceBucket.selectedItem = bucket
        view.timeout.text = "30"
    }

    private fun Assert<ValidationInfo?>.containsMessage(expectedMessage: String) {
        assert(this.actual).isNotNull { assert(it.actual.message).contains(expectedMessage) }
    }
}
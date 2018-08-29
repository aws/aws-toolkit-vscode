// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.upload

import assertk.Assert
import assertk.assert
import assertk.assertions.contains
import assertk.assertions.isNotNull
import assertk.assertions.isNull
import com.intellij.openapi.ui.ValidationInfo
import org.junit.Before
import org.junit.Test
import software.amazon.awssdk.services.lambda.model.Runtime
import javax.swing.DefaultComboBoxModel

class UploadToLambdaValidatorTest {
    private val sut = UploadToLambdaValidator()
    private val view = CreateLambdaPanel()

    @Test
    fun validFunctionReturnsNull() {
        assert(sut.doValidate(view)).isNull()
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
    }

    private fun Assert<ValidationInfo?>.containsMessage(expectedMessage: String) {
        assert(this.actual).isNotNull { assert(it.actual.message).contains(expectedMessage) }
    }
}